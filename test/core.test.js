import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshnessScore, bestBefore, statusOf, recency } from '../src/core/score.js';
import { quoteIsGrounded } from '../src/core/verify.js';
import { candidateLines, parseClaimList } from '../src/core/extract.js';
import { parseJson } from '../src/core/llm.js';
import { cadenceDays } from '../src/core/registry.js';
import { packageJsonClaims, commentsOnly, createEngine } from '../src/core/pipeline.js';
import { openStore, runWatch } from '../src/store.js';

const DAY = 86400000;

test('freshness: contradicted claims score low, supported official recent claims score high', () => {
  const now = Date.now();
  const fresh = freshnessScore({ verdict: 'supported', category: 'version', evidence: [{ official: true, published: new Date(now - DAY).toISOString() }], now });
  const stale = freshnessScore({ verdict: 'contradicted', category: 'version', evidence: [{ official: true, published: new Date(now - DAY).toISOString() }], now });
  assert.ok(fresh.score >= 90, `fresh ${fresh.score}`);
  assert.ok(stale.score <= 5, `stale ${stale.score}`);
  assert.equal(statusOf(fresh.score), 'fresh');
  assert.equal(statusOf(stale.score), 'stale');
});

test('recency halves every half-life', () => {
  const now = Date.now();
  assert.equal(recency(new Date(now - 30 * DAY).toISOString(), 30, now).toFixed(2), '0.50');
  assert.equal(recency(null, 30, now), 0.5);
});

test('best-before uses the shorter of category half-life and release cadence', () => {
  const t = Date.UTC(2026, 10, 1);
  assert.equal(bestBefore({ verdict: 'supported', category: 'policy', checkedAt: t }).days, 365);
  const fast = bestBefore({ verdict: 'supported', category: 'version', cadenceDays: 14, checkedAt: t });
  assert.equal(fast.days, 14);
  assert.match(fast.basis, /every 14d/);
  assert.equal(bestBefore({ verdict: 'contradicted', category: 'version', checkedAt: t }).days, 0);
  assert.equal(bestBefore({ verdict: 'unclear', category: 'api', checkedAt: t }).days, 30);
});

test('evidence lock rejects quotes that are not in the source', () => {
  const src = 'Node.js 24 is the Active LTS release. Node.js 22 is in maintenance.';
  assert.ok(quoteIsGrounded('Node.js 24 is the Active LTS release.', src));
  assert.ok(!quoteIsGrounded('Node.js 18 is the current LTS release and recommended.', src));
  assert.ok(!quoteIsGrounded('', src));
});

test('candidate filter keeps time-sensitive lines and drops timeless ones', () => {
  const lines = candidateLines('The sky is blue and lovely.\nThe latest version of React is 18.\nGPT-4 costs $30 per 1M tokens.');
  assert.deepEqual(lines.map((l) => l.line), [2, 3]);
});

test('parseJson tolerates fences and chatter', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('Sure! {"a":2} hope that helps'), { a: 2 });
});

test('cadence is the median gap between releases', () => {
  assert.equal(cadenceDays(['2026-01-01', '2026-01-11', '2026-01-21', '2026-02-20']), 10);
});

test('package.json pins become zero-token version claims', () => {
  const claims = packageJsonClaims(JSON.stringify({ engines: { node: '>=18' }, dependencies: { react: '^18.2.0', local: 'file:../x' } }, null, 2), 'package.json');
  assert.equal(claims.length, 2);
  assert.equal(claims[0].text, 'Node.js 18 is the current LTS');
  assert.equal(claims[1].package, 'react');
  assert.ok(claims[1].line > 0);
});

test('commentsOnly keeps comment text only', () => {
  assert.equal(commentsOnly('const a = 1; // React 18 is latest\nfoo();').split('\n')[0], 'React 18 is latest');
});

function fakeEngine(ledger, { verdict = 'contradicted' } = {}) {
  const calls = { chat: 0, search: 0 };
  const chat = async ({ step, usage }) => {
    calls.chat += 1;
    usage.llmCalls += 1;
    const content = step === 'extract'
      ? JSON.stringify({ claims: [{ line: 1, text: 'Acme SDK 2 is the latest version', category: 'api', subject: 'Acme', value: '2' }] })
      : JSON.stringify({ verdict, source: 1, quote: 'Acme SDK 3 is now the latest version.', current_value: 'Acme SDK 3', corrected_claim: 'Acme SDK 3 is the latest version', reason: 'v3 shipped' });
    return { content, json: () => JSON.parse(content), meta: { step } };
  };
  const search = async (_c, { usage }) => {
    calls.search += 1;
    usage.tavilySearches += 1;
    return [{ url: 'https://docs.acme.dev/changelog', title: 'Changelog', content: 'Acme SDK 3 is now the latest version. Upgrade today.', published: new Date().toISOString(), official: true }];
  };
  return { engine: createEngine({ chat, search, registry: { check: async () => null }, ledger }), calls };
}

test('pipeline: extract -> Tavily -> evidence-locked verdict -> fix diff, then ledger reuse', async () => {
  const store = openStore(':memory:');
  const { engine, calls } = fakeEngine(store.ledger);
  const r1 = await engine.checkAnswer('Acme SDK 2 is the latest version');
  assert.equal(r1.claims[0].status, 'stale');
  assert.equal(r1.claims[0].fix.after, 'Acme SDK 3 is the latest version');
  assert.equal(r1.claims[0].evidence[0].quote, 'Acme SDK 3 is now the latest version.');
  assert.equal(calls.search, 1);
  // Contradicted claims expire immediately, so they are re-verified, never served stale from the ledger.
  await engine.checkAnswer('Acme SDK 2 is the latest version');
  assert.equal(calls.search, 2);
});

test('supported claims are reused from the ledger until their best-before date', async () => {
  const store = openStore(':memory:');
  const { engine, calls } = fakeEngine(store.ledger, { verdict: 'supported' });
  await engine.checkAnswer('Acme SDK 2 is the latest version');
  const r2 = await engine.checkAnswer('Acme SDK 2 is the latest version');
  assert.equal(calls.search, 1);
  assert.equal(r2.claims[0].reused, true);
  assert.equal(r2.usage.ledgerHits, 1);
});

test('watch re-checks expired claims and records history', async () => {
  const store = openStore(':memory:');
  const { engine } = fakeEngine(store.ledger, { verdict: 'supported' });
  const report = store.saveReport(await engine.checkAnswer('Acme SDK 2 is the latest version'));
  assert.equal(store.watchReport(report), 1);
  const [w] = store.listWatch();
  assert.equal(w.due, false);
  store.expireWatch(w.id);
  const { engine: later } = fakeEngine(store.ledger, { verdict: 'contradicted' });
  const out = await runWatch(store, later);
  assert.equal(out.checked, 1);
  assert.equal(out.changes[0].changed, true);
  assert.equal(out.changes[0].after.verdict, 'contradicted');
  assert.equal(store.listWatch()[0].history.length, 2);
});

test('parseClaimList salvages claims from malformed model JSON', () => {
  const broken = '[\n {"claims":[{"line":1,"text":"Node.js 18 is LTS","category":"version"}},\n {"claims":[{"line":2,"text":"React 18 is latest","category":"version"}}\n]';
  assert.deepEqual(parseClaimList(broken).map((c) => c.line), [1, 2]);
  assert.equal(parseClaimList('{"claims":[{"line":3,"text":"Python 3.8 is newest"}]}')[0].line, 3);
});

test('parseClaimList reads fields from badly broken objects', () => {
  const awful = '[{ "claim": "line:3, text": "Google\'s chatbot is called Bard.", "category": "model", "subject": "Google", "value": "" }]';
  const [c] = parseClaimList(awful);
  assert.equal(c.text, "Google's chatbot is called Bard.");
  assert.equal(c.line, 3);
  assert.equal(c.category, 'model');
});
