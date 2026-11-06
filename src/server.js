import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { config } from './core/config.js';
import { createEngine } from './core/pipeline.js';
import { openStore, runWatch } from './store.js';
import { badgeSvg } from './badge.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const store = openStore(path.resolve(root, config.dbPath));
const engine = createEngine({ ledger: store.ledger });
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Baseline headers for every response; the CSP mainly guards the built SPA.
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  next();
});

// Cheap per-IP sliding window so the spend-incurring endpoints can't be hammered.
// (Keyed on req.ip; set app.set('trust proxy', ...) if you deploy behind a reverse proxy.)
const buckets = new Map();
const rateLimit = ({ windowMs, max }) => (req, res, next) => {
  const now = Date.now();
  const key = `${req.ip}:${req.path}`;
  let b = buckets.get(key);
  if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
  if (++b.count > max) {
    res.set('Retry-After', String(Math.ceil((b.reset - now) / 1000)));
    return res.status(429).json({ error: 'Too many requests, try again soon.' });
  }
  next();
};
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k); }, 60_000).unref();
const spendLimit = rateLimit({ windowMs: 5 * 60_000, max: 20 });
const guardLimit = rateLimit({ windowMs: 60_000, max: 30 });

const examplesDir = path.join(root, 'examples');
// Optional, password-free workspace name sent by the browser; everyone without one shares "public".
const wsOf = (req) => String(req.get('x-lumasuri-workspace') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || 'public';
app.use('/media', express.static(path.join(root, 'docs')));
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  const msg = String(err.message || 'Internal error');
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(msg)) {
    return res.status(503).json({ error: `LumaSuri can't reach its AI gateway (Bifrost). Start it with \`docker compose up -d\`, then try again.` });
  }
  res.status(500).json({ error: msg.slice(0, 300) });
});
const invalid = (res, err) => res.status(400).json({ error: err.issues?.[0]?.message || 'invalid request' });

const checkSchema = z.object({ text: z.string().trim().min(1).max(40_000), simulateOutage: z.boolean().optional(), watch: z.boolean().optional() });
const scanSchema = z.object({ repo: z.string().min(1).max(150), simulateOutage: z.boolean().optional(), watch: z.boolean().optional() });
const watchRunSchema = z.object({ ids: z.array(z.string().max(30)).max(200).optional(), simulateOutage: z.boolean().optional() });

app.get('/api/health', wrap(async (_req, res) => {
  const bifrost = await fetch(`${config.bifrostUrl}/health`).then((r) => r.ok).catch(() => false);
  res.json({ ok: true, bifrost, tavily: config.tavilyKey ? 'api-key' : 'keyless', extractModel: config.extractModel, verdictModel: config.verdictModel, fallbacks: config.fallbacks, ledger: store.ledger.count() });
}));

app.get('/api/examples', (_req, res) => {
  const answers = fs.readdirSync(path.join(examplesDir, 'answers')).filter((f) => f.endsWith('.md')).map((f) => ({ id: f, text: fs.readFileSync(path.join(examplesDir, 'answers', f), 'utf8') }));
  const repos = fs.readdirSync(path.join(examplesDir, 'repos'));
  res.json({ answers, repos });
});

app.post('/api/check', spendLimit, wrap(async (req, res) => {
  const parsed = checkSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const { text, simulateOutage, watch } = parsed.data;
  const report = store.saveReport(await engine.checkAnswer(text, { simulateOutage }), wsOf(req));
  if (watch) store.watchReport(report, wsOf(req));
  res.json(report);
}));

app.post('/api/scan', spendLimit, wrap(async (req, res) => {
  const parsed = scanSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const { repo, simulateOutage, watch } = parsed.data;
  const reposRoot = path.resolve(examplesDir, 'repos');
  const dir = path.resolve(reposRoot, path.basename(repo));
  if (!dir.startsWith(reposRoot + path.sep) || !fs.existsSync(dir)) return res.status(400).json({ error: 'unknown example repo' });
  const report = store.saveReport(await engine.scanRepo(dir, { simulateOutage, title: repo }), wsOf(req));
  report.input = `examples/repos/${repo}`;
  if (watch) store.watchReport(report, wsOf(req));
  res.json(store.saveReport(report, wsOf(req)));
}));

app.get('/api/reports', (req, res) => res.json(store.listReports(wsOf(req))));
app.get('/api/reports/:id', (req, res) => {
  const r = store.getReport(req.params.id, wsOf(req));
  return r ? res.json(r) : res.status(404).json({ error: 'not found' });
});
app.post('/api/reports/:id/watch', (req, res) => {
  const r = store.getReport(req.params.id, wsOf(req));
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json({ added: store.watchReport(r, wsOf(req)) });
});
app.get('/badge/:id.svg', (req, res) => {
  const r = store.getReport(req.params.id);
  res.type('image/svg+xml').send(badgeSvg(r?.summary?.score ?? null));
});

app.get('/api/watch', (req, res) => res.json(store.listWatch(wsOf(req))));
app.post('/api/watch/:id/expire', (req, res) => {
  const r = store.expireWatch(req.params.id, wsOf(req));
  res.status(r.changes ? 200 : 404).json({ ok: Boolean(r.changes) });
});
app.delete('/api/watch/:id', (req, res) => {
  const r = store.removeWatch(req.params.id, wsOf(req));
  res.status(r.changes ? 200 : 404).json({ ok: Boolean(r.changes) });
});
app.post('/api/watch/run', spendLimit, wrap(async (req, res) => {
  const parsed = watchRunSchema.safeParse(req.body || {});
  if (!parsed.success) return invalid(res, parsed.error);
  res.json(await runWatch(store, engine, { ids: parsed.data.ids, simulateOutage: parsed.data.simulateOutage, workspace: wsOf(req) }));
}));

// Guard proxy: an OpenAI-compatible endpoint that answers through Bifrost, then attaches a LumaSuri freshness report.
app.post('/v1/chat/completions', guardLimit, wrap(async (req, res) => {
  const upstream = await fetch(`${config.bifrostUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bf-vk': config.bifrostVirtualKey },
    body: JSON.stringify({ ...req.body, stream: false, fallbacks: req.body.fallbacks || config.fallbacks }),
  });
  const body = await upstream.json();
  const answer = body.choices?.[0]?.message?.content;
  if (upstream.ok && answer) {
    const report = store.saveReport(await engine.checkAnswer(answer, { title: 'Guarded answer' }));
    body.lumasuri = { reportId: report.id, score: report.summary.score, stale: report.claims.filter((c) => c.status === 'stale').map((c) => ({ text: c.text, currentValue: c.currentValue, fix: c.fix?.after })) };
  }
  res.status(upstream.status).json(body);
}));

const dist = path.join(root, 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|badge|v1).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

setInterval(() => {
  if (store.listWatch().some((w) => w.due && process.env.LUMASURI_AUTO_WATCH === '1')) runWatch(store, engine).catch(() => {});
}, 60_000).unref();

app.listen(config.port, () => console.log(`LumaSuri API on http://localhost:${config.port}`));
