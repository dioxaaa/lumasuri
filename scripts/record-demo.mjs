// Records a ~60s demo of the LumaSuri web UI with stubbed API responses.
// Run: node scripts/record-demo.mjs   (requires `npx playwright install chromium`)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.DEMO_URL || 'http://localhost:5173';
const now = Date.now();
const d = (days) => new Date(now + days * 86400000).toISOString();

const ANSWER = `For a new project, use Node.js 18, which is the current LTS release.
The latest major version of React is React 18.
Python 3.8 is the newest Python release.
Use OpenAI's text-davinci-003 model for completions.
JavaScript was created by Brendan Eich at Netscape.`;

const claims = [
  {
    status: 'stale', score: 1, category: 'version', method: 'registry', reused: false, line: 1,
    text: 'Use Node.js 18, which is the current LTS release.',
    currentValue: 'Node.js 26 (Lithium) is the current LTS',
    reason: 'nodejs.org lists Node 26 as the active LTS; Node 18 reached end of life.',
    evidence: [{ quote: 'Node.js 26.x “Lithium” — Long Term Support', url: 'https://nodejs.org/en/about/previous-releases', title: 'Node.js release index', official: true, published: '2026-10-20' }],
    fix: { before: 'use Node.js 18, which is the current LTS release', after: 'use Node.js 26, which is the current LTS release' },
    bestBefore: { date: d(120), basis: 'LTS releases move yearly' },
    scoreParts: { support: 0, recency: 3, authority: 30 },
  },
  {
    status: 'stale', score: 9, category: 'version', method: 'registry', reused: false, line: 2,
    text: 'The latest major version of React is React 18.',
    currentValue: 'React 19 (latest release 19.3.1)',
    reason: 'endoflife.date tracks React 19 as the current major line.',
    evidence: [{ quote: 'React 19 — latest release 19.3.1', url: 'https://endoflife.date/react', title: 'endoflife.date/react', official: false, published: '2026-10-02' }],
    fix: { before: 'React is React 18', after: 'React is React 19' },
    bestBefore: { date: d(90), basis: 'Major releases land roughly yearly' },
    scoreParts: { support: 0, recency: 20, authority: 25 },
  },
  {
    status: 'stale', score: 3, category: 'version', method: 'registry', reused: false, line: 3,
    text: 'Python 3.8 is the newest Python release.',
    currentValue: 'Python 3.15 (latest release 3.15.2)',
    reason: 'Python 3.8 is end of life; 3.15 is the newest stable line.',
    evidence: [{ quote: 'Python 3.15.2 is the latest release', url: 'https://endoflife.date/python', title: 'endoflife.date/python', official: false, published: '2026-10-09' }],
    fix: { before: 'Python 3.8', after: 'Python 3.15' },
    bestBefore: { date: d(150), basis: 'Yearly CPython releases' },
    scoreParts: { support: 0, recency: 8, authority: 28 },
  },
  {
    status: 'stale', score: 2, category: 'model', method: 'search', reused: false, line: 4,
    text: "Use OpenAI's text-davinci-003 model for completions.",
    currentValue: 'text-davinci-003 is deprecated — current models are the GPT-5 family',
    reason: 'OpenAI deprecated the text-davinci completion models; chat models replaced them.',
    evidence: [{ quote: 'The text-davinci-003 model is deprecated and will be shut off', url: 'https://platform.openai.com/docs/deprecations', title: 'OpenAI deprecations', official: true, published: '2024-01-04' }],
    fix: { before: "OpenAI's text-davinci-003 model", after: "OpenAI's gpt-5-mini model" },
    bestBefore: { date: d(60), basis: 'Model catalog changes fast' },
    scoreParts: { support: 0, recency: 5, authority: 30 },
  },
  {
    status: 'fresh', score: 79, category: 'stable', method: 'search', reused: false, line: 5,
    text: 'JavaScript was created by Brendan Eich at Netscape.',
    currentValue: 'Still true, quoted from the source',
    reason: 'Historical fact; multiple sources agree and it does not change over time.',
    evidence: [{ quote: 'Brendan Eich created JavaScript in 1995 while at Netscape', url: 'https://en.wikipedia.org/wiki/JavaScript', title: 'JavaScript — Wikipedia', official: false, published: '2026-09-30' }],
    fix: null,
    bestBefore: { date: d(180), basis: 'Stable facts get a long best-before' },
    scoreParts: { support: 45, recency: 14, authority: 20 },
  },
];

const report = {
  id: 'r1', kind: 'answer', input: ANSWER, title: 'Dev stack answer',
  createdAt: new Date(now - 7200000).toISOString(),
  summary: { score: 19, fresh: 1, aging: 0, stale: 4, nextBestBefore: d(60) },
  claims,
  usage: {
    llmCalls: 6, totalTokens: 18432, maxTokens: 60000, cacheHits: 1, fallbacks: [],
    tavilySearches: 4, registryChecks: 3, ledgerHits: 1,
    models: { 'ollama/qwen2.5:3b': 6 }, budgetStopped: false,
  },
};

const oldWatch = [
  {
    id: 'w1', reportTitle: 'Dev stack answer', verdict: 'contradicted', score: 14, due: true,
    bestBefore: new Date(now - 86400000).toISOString(),
    claim: { text: 'Use Node.js 18, which is the current LTS release.' },
    history: [{ at: new Date(now - 86400000).toISOString(), verdict: 'supported', score: 72 }],
  },
  {
    id: 'w2', reportTitle: 'AI models answer', verdict: 'supported', score: 81, due: false,
    bestBefore: d(45),
    claim: { text: 'JavaScript was created by Brendan Eich at Netscape.' },
    history: [{ at: new Date(now - 172800000).toISOString(), verdict: 'supported', score: 80 }],
  },
];

const savedWatch = [
  ...oldWatch,
  ...claims.map((c, i) => ({
    id: `rw${i}`, reportTitle: 'Dev stack answer',
    verdict: c.status === 'fresh' ? 'supported' : 'contradicted', score: c.score, due: false,
    bestBefore: c.bestBefore.date, claim: { text: c.text },
    history: [{ at: new Date(now - 60000).toISOString(), verdict: c.status === 'fresh' ? 'supported' : 'contradicted', score: c.score }],
  })),
];

const json = (route, body, delay = 250) =>
  new Promise((resolve) => setTimeout(() => resolve(route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(body),
  })), delay));

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    recordVideo: { dir: 'frames-tmp/video', size: { width: 1600, height: 900 } },
  });

  // Fake cursor: Playwright's screencast renders no OS cursor, so we draw one
  // that follows real mouse events with the retro theme.
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = `#__cur{position:fixed;z-index:99999;width:16px;height:16px;border-radius:50%;background:#453f31;border:2.5px solid #fffdf6;box-shadow:0 1px 5px rgba(69,63,49,.5);pointer-events:none;left:-40px;top:-40px;transform:translate(-50%,-50%);transition:width .12s,height .12s}#__cur.down{width:11px;height:11px}`;
      document.head.appendChild(s);
      const c = document.createElement('div');
      c.id = '__cur';
      document.body.appendChild(c);
      document.addEventListener('mousemove', (e) => { c.style.left = `${e.clientX}px`; c.style.top = `${e.clientY}px`; });
      document.addEventListener('mousedown', () => c.classList.add('down'));
      document.addEventListener('mouseup', () => c.classList.remove('down'));
    });
  });

  const page = await context.newPage();

  await page.route('**/api/health', (r) => json(r, { ok: true, bifrost: true, tavily: 'api-key', extractModel: 'ollama/qwen2.5:3b', verdictModel: 'ollama/qwen2.5:3b', fallbacks: ['ollama/qwen2.5:1.5b'], ledger: 12 }));
  await page.route('**/api/examples', (r) => json(r, {
    answers: [
      { id: '01-dev-stack.md', text: ANSWER },
      { id: '02-ai-models.md', text: 'The best OpenAI model is text-davinci-003.\nUse gpt-3.5-turbo for the cheapest chat completions.\nClaude 3 Opus is Anthropic’s largest model.' },
    ],
    repos: ['examples/demo-repo'],
  }));
  await page.route('**/api/check', (r) => json(r, report, 5200));
  await page.route('**/api/reports', (r) => r.request().method() === 'GET'
    ? json(r, [{ id: 'r1', title: 'Dev stack answer', kind: 'answer', claimCount: 5, createdAt: report.createdAt, summary: { score: 19 } }])
    : r.continue());
  let saved = false;
  await page.route('**/api/reports/r1/watch', (r) => { saved = true; return json(r, { added: 5 }, 700); });
  await page.route('**/api/reports/r1', (r) => json(r, report));
  await page.route('**/api/watch/run', (r) => json(r, {
    changes: [{
      id: 'w1', changed: true, text: 'Use Node.js 18, which is the current LTS release.',
      before: { verdict: 'supported', score: 72, at: new Date(now - 86400000).toISOString() },
      after: { verdict: 'contradicted', score: 14, at: new Date(now).toISOString(), currentValue: 'Node.js 26 (Lithium) is the current LTS', bestBefore: { date: d(120) } },
    }],
  }, 2600));
  await page.route('**/api/watch', (r) => json(r, saved ? savedWatch : oldWatch));
  await page.route('**/badge/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="20"><rect width="150" height="20" rx="6" fill="#2f6b6e"/><text x="75" y="14" text-anchor="middle" font-size="11" fill="#fffdf6" font-family="sans-serif">lumasuri · 19/100</text></svg>` }));
  await page.route('**/media/**', (r) => r.fulfill({ status: 204, body: '' }));
  await page.route('**/media/video/poster.jpg', (r) => r.fulfill({ status: 200, contentType: 'image/jpeg', body: readFileSync('docs/video/poster.jpg') }));

  const wait = (ms) => page.waitForTimeout(ms);
  const smoothTo = (sel) => page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), sel);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(7500); // hero + animated demo frame + mascot sticker

  await smoothTo('how'); await wait(4800);
  await smoothTo('demo'); await wait(2800);
  await smoothTo('try'); await wait(2000);

  // Pick the sample chip, then run the check.
  await page.getByRole('button', { name: 'Dev stack answer' }).click();
  await wait(1000);
  await page.getByRole('button', { name: 'Check an answer' }).last().click();
  await wait(5000); // progress stages tick while stub "thinks"

  // Report: linger on summary, then drift through the claim cards.
  await wait(3200);
  for (let i = 0; i < 18; i++) {
    await page.mouse.wheel(0, 190);
    await wait(430);
  }
  await wait(1200);
  await page.getByRole('button', { name: 'Save to Watch' }).click();
  await wait(1900); // toast

  // Watch tab: expired claim re-check shows what changed.
  await page.getByRole('tab', { name: /Watch/ }).click();
  await wait(2200);
  await page.getByRole('button', { name: /Re-check/ }).click();
  await wait(6500); // stub delay + changes panel

  // History tab, then back to the top to close the loop.
  await page.getByRole('tab', { name: 'History' }).click();
  await wait(2800);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await wait(3800);

  await context.close();
  const path = await page.video().path();
  console.log('VIDEO:', path);
  await browser.close();
};

run().catch((e) => { console.error(e); process.exit(1); });
