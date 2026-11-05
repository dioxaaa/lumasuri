import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { createUsage, BudgetExceededError } from './usage.js';
import { createBifrostChat } from './llm.js';
import { createRegistry } from './registry.js';
import { createTavily } from './search.js';
import { candidateLines, extractClaims } from './extract.js';
import { judgeClaim } from './verify.js';
import { freshnessScore, statusOf, bestBefore } from './score.js';

export const hashClaim = (text) =>
  crypto.createHash('sha1').update(String(text).toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);

async function runPool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

export function createEngine(deps = {}) {
  const chat = deps.chat || createBifrostChat();
  const registry = deps.registry || createRegistry();
  const search = deps.search || createTavily();
  const ledger = deps.ledger || null;
  const onEvent = deps.onEvent || (() => {});

  async function verifyClaim(claim, ctx) {
    const hash = hashClaim(claim.text);
    const now = Date.now();
    if (ledger && !ctx.bypassLedger) {
      const prior = ledger.get(hash);
      if (prior && new Date(prior.bestBefore.date).getTime() > now) {
        ctx.usage.ledgerHits = (ctx.usage.ledgerHits || 0) + 1;
        return { ...prior, ...pickLocation(claim), hash, reused: true };
      }
    }
    if (claim.category === 'stable') {
      ctx.usage.skippedStable += 1;
      return null;
    }
    let result = null;
    try {
      result = await registry.check(claim);
      if (result) ctx.usage.registryChecks += 1;
    } catch {
      result = null;
    }
    if (!result) {
      try {
        const evidence = await search(claim, { usage: ctx.usage });
        result = await judgeClaim(claim, evidence, ctx);
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          result = { verdict: 'unclear', method: 'budget', reason: `Not verified: ${err.message}.`, evidence: [] };
        } else {
          result = { verdict: 'unclear', method: 'error', reason: `Not verified: ${err.message}`, evidence: [] };
        }
      }
    }
    const { score, parts } = freshnessScore({ verdict: result.verdict, evidence: result.evidence, category: claim.category, now });
    const checkedAt = new Date(now).toISOString();
    const verified = {
      hash,
      text: claim.text,
      category: claim.category,
      subject: claim.subject,
      value: claim.value,
      package: claim.package,
      ecosystem: claim.ecosystem,
      ...pickLocation(claim),
      ...result,
      score,
      scoreParts: parts,
      status: statusOf(score),
      checkedAt,
      bestBefore: bestBefore({ verdict: result.verdict, category: claim.category, cadenceDays: result.cadenceDays, checkedAt: now }),
      fix: makeFix(claim, result),
    };
    if (ledger && !['budget', 'error'].includes(result.method)) ledger.put(hash, verified);
    onEvent({ type: 'claim', claim: verified });
    return verified;
  }

  function pickLocation(c) {
    return { file: c.file || null, line: c.line || null, sourceLine: c.sourceLine || c.text };
  }

  function makeFix(claim, result) {
    if (result.verdict !== 'contradicted' || !result.correctedClaim) return null;
    const before = claim.sourceLine || claim.text;
    let after;
    if (before.includes(claim.text)) after = before.replace(claim.text, result.correctedClaim);
    else if (result.replacement && before.includes(result.replacement.from)) after = before.replace(result.replacement.from, result.replacement.to);
    else after = result.correctedClaim;
    if (after === before) return null;
    return { file: claim.file || null, line: claim.line || null, before, after };
  }

  async function finish(kind, title, input, claims, usage, extra = {}) {
    const verified = claims.filter(Boolean);
    const avg = verified.length ? Math.round(verified.reduce((s, c) => s + c.score, 0) / verified.length) : 100;
    const next = verified.map((c) => c.bestBefore.date).sort()[0] || null;
    return {
      kind,
      title,
      input,
      createdAt: new Date().toISOString(),
      claims: verified,
      summary: {
        score: avg,
        fresh: verified.filter((c) => c.status === 'fresh').length,
        aging: verified.filter((c) => c.status === 'aging').length,
        stale: verified.filter((c) => c.status === 'stale').length,
        fixes: verified.filter((c) => c.fix).length,
        nextBestBefore: next,
      },
      usage: usage.toJSON(),
      ...extra,
    };
  }

  function makeCtx(opts) {
    const usage = createUsage(opts.maxTokens || config.maxTokensPerRun);
    return { chat, usage, simulateOutage: Boolean(opts.simulateOutage), cacheKey: opts.cacheKey || 'lumasuri', bypassLedger: Boolean(opts.bypassLedger) };
  }

  async function checkAnswer(text, opts = {}) {
    const ctx = makeCtx(opts);
    onEvent({ type: 'stage', stage: 'extract' });
    const lines = text.split(/\r?\n/).map((t, i) => ({ line: i + 1, text: t.trim() })).filter((l) => l.text);
    let claims = [];
    try {
      claims = await extractClaims(lines, ctx);
    } catch (err) {
      if (!(err instanceof BudgetExceededError)) throw err;
    }
    onEvent({ type: 'stage', stage: 'verify', total: claims.length });
    const verified = await runPool(dedupe(claims), config.concurrency, (c) => verifyClaim(c, ctx));
    return finish('answer', opts.title || firstWords(text), text, verified, ctx.usage);
  }

  async function verifyClaims(claims, opts = {}) {
    const ctx = makeCtx({ ...opts, bypassLedger: true });
    const verified = await runPool(claims, config.concurrency, (c) => verifyClaim(c, ctx));
    return { claims: verified, usage: ctx.usage.toJSON() };
  }

  async function scanRepo(dir, opts = {}) {
    const ctx = makeCtx(opts);
    const root = path.resolve(dir);
    const files = walk(root).slice(0, opts.maxFiles || 60);
    onEvent({ type: 'stage', stage: 'extract', files: files.length });
    const claims = [];
    for (const file of files) {
      const rel = path.relative(root, file);
      const text = fs.readFileSync(file, 'utf8');
      if (path.basename(file) === 'package.json') {
        claims.push(...packageJsonClaims(text, rel));
        continue;
      }
      const lines = candidateLines(isCode(file) ? commentsOnly(text) : text);
      for (let i = 0; i < lines.length; i += 25) {
        try {
          const found = await extractClaims(lines.slice(i, i + 25), ctx);
          const eco = /\.py$/.test(file) ? 'pypi' : /\.(m?js|tsx?|jsx)$/.test(file) ? 'npm' : '';
          claims.push(...found.map((c) => ({ ...c, file: rel, ecosystem: c.ecosystem || eco })));
        } catch (err) {
          if (err instanceof BudgetExceededError) break;
          throw err;
        }
      }
    }
    onEvent({ type: 'stage', stage: 'verify', total: claims.length });
    const verified = await runPool(dedupe(claims, true), config.concurrency, (c) => verifyClaim(c, ctx));
    return finish('repo', opts.title || path.basename(root), root, verified, ctx.usage, { files: files.map((f) => path.relative(root, f)) });
  }

  return { checkAnswer, scanRepo, verifyClaim, verifyClaims };
}

function dedupe(claims, keepLocations = false) {
  const seen = new Set();
  return claims.filter((c) => {
    const k = keepLocations ? `${c.file}:${c.line}:${hashClaim(c.text)}` : hashClaim(c.text);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const firstWords = (t) => t.replace(/\s+/g, ' ').trim().split(' ').slice(0, 8).join(' ') + '…';
const SCAN_EXT = new Set(['.md', '.mdx', '.rst', '.txt', '.js', '.mjs', '.ts', '.tsx', '.jsx', '.py']);
const isCode = (f) => /\.(m?js|tsx?|jsx|py)$/.test(f);

export function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'build', '.venv', 'venv', '__pycache__'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === 'package.json' || (SCAN_EXT.has(path.extname(entry.name)) && fs.statSync(full).size < 200_000)) out.push(full);
  }
  return out;
}

export function commentsOnly(code) {
  return code
    .split(/\r?\n/)
    .map((l) => {
      const m = l.match(/(?:\/\/|#|\/\*+|^\s*\*)\s?(.*)$/);
      return m ? m[1] : '';
    })
    .join('\n');
}

export function packageJsonClaims(text, rel) {
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const lineOf = (needle) => lines.findIndex((l) => l.includes(needle)) + 1 || null;
  const claims = [];
  if (pkg.engines?.node) {
    const v = pkg.engines.node;
    const major = String(v).match(/\d+/)?.[0];
    if (major) {
      const line = lineOf('"node"');
      claims.push({ text: `Node.js ${major} is the current LTS`, category: 'version', subject: 'Node.js', value: major, package: '', ecosystem: '', file: rel, line, sourceLine: lines[line - 1]?.trim() });
    }
  }
  for (const [name, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).slice(0, 25)) {
    const value = String(range).replace(/^[\^~>=<\s]+/, '');
    if (!/^\d/.test(value)) continue;
    const line = lineOf(`"${name}"`);
    claims.push({ text: `${name} ${value}`, category: 'version', subject: name, value, package: name, ecosystem: 'npm', file: rel, line, sourceLine: lines[line - 1]?.trim() });
  }
  return claims;
}
