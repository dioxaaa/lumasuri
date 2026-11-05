import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './core/config.js';
import { createEngine } from './core/pipeline.js';
import { openStore, runWatch } from './store.js';
import { badgeSvg } from './badge.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const store = openStore(path.resolve(root, config.dbPath));
const engine = createEngine({ ledger: store.ledger });
const app = express();
app.use(express.json({ limit: '1mb' }));

const examplesDir = path.join(root, 'examples');
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => res.status(500).json({ error: err.message }));

app.get('/api/health', wrap(async (_req, res) => {
  const bifrost = await fetch(`${config.bifrostUrl}/health`).then((r) => r.ok).catch(() => false);
  res.json({ ok: true, bifrost, tavily: config.tavilyKey ? 'api-key' : 'keyless', extractModel: config.extractModel, verdictModel: config.verdictModel, fallbacks: config.fallbacks, ledger: store.ledger.count() });
}));

app.get('/api/examples', (_req, res) => {
  const answers = fs.readdirSync(path.join(examplesDir, 'answers')).filter((f) => f.endsWith('.md')).map((f) => ({ id: f, text: fs.readFileSync(path.join(examplesDir, 'answers', f), 'utf8') }));
  const repos = fs.readdirSync(path.join(examplesDir, 'repos'));
  res.json({ answers, repos });
});

app.post('/api/check', wrap(async (req, res) => {
  const { text, simulateOutage, watch } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
  const report = store.saveReport(await engine.checkAnswer(text, { simulateOutage }));
  if (watch) store.watchReport(report);
  res.json(report);
}));

app.post('/api/scan', wrap(async (req, res) => {
  const { repo, simulateOutage, watch } = req.body || {};
  const dir = path.join(examplesDir, 'repos', path.basename(String(repo || '')));
  if (!repo || !fs.existsSync(dir)) return res.status(400).json({ error: 'unknown example repo' });
  const report = store.saveReport(await engine.scanRepo(dir, { simulateOutage, title: repo }));
  report.input = `examples/repos/${repo}`;
  if (watch) store.watchReport(report);
  res.json(store.saveReport(report));
}));

app.get('/api/reports', (_req, res) => res.json(store.listReports()));
app.get('/api/reports/:id', (req, res) => {
  const r = store.getReport(req.params.id);
  return r ? res.json(r) : res.status(404).json({ error: 'not found' });
});
app.post('/api/reports/:id/watch', (req, res) => {
  const r = store.getReport(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json({ added: store.watchReport(r) });
});
app.get('/badge/:id.svg', (req, res) => {
  const r = store.getReport(req.params.id);
  res.type('image/svg+xml').send(badgeSvg(r?.summary?.score ?? null));
});

app.get('/api/watch', (_req, res) => res.json(store.listWatch()));
app.post('/api/watch/:id/expire', (req, res) => {
  store.expireWatch(req.params.id);
  res.json({ ok: true });
});
app.delete('/api/watch/:id', (req, res) => {
  store.removeWatch(req.params.id);
  res.json({ ok: true });
});
app.post('/api/watch/run', wrap(async (req, res) => {
  res.json(await runWatch(store, engine, { ids: req.body?.ids, simulateOutage: req.body?.simulateOutage }));
}));

// Guard proxy: an OpenAI-compatible endpoint that answers through Bifrost, then attaches a LumaSuri freshness report.
app.post('/v1/chat/completions', wrap(async (req, res) => {
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
