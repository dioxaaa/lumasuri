#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { config } from '../src/core/config.js';
import { createEngine } from '../src/core/pipeline.js';
import { openStore, runWatch } from '../src/store.js';

const C = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m' };
const color = { fresh: C.green, aging: C.yellow, stale: C.red };

function print(report) {
  console.log(`\n${C.bold}LumaSuri report: ${report.title}${C.reset}  score ${report.summary.score}/100  ` +
    `${C.green}${report.summary.fresh} fresh${C.reset}  ${C.yellow}${report.summary.aging} aging${C.reset}  ${C.red}${report.summary.stale} stale${C.reset}\n`);
  for (const c of report.claims) {
    const where = c.file ? `${c.file}:${c.line ?? '?'} ` : '';
    console.log(`${color[c.status]}● ${c.status.toUpperCase().padEnd(5)} ${String(c.score).padStart(3)}${C.reset} ${where}${c.text}`);
    console.log(`  ${C.dim}${c.verdict} via ${c.method}${c.reused ? ' (ledger reuse)' : ''} · best before ${c.bestBefore.date.slice(0, 10)} (${c.bestBefore.basis})${C.reset}`);
    if (c.reason) console.log(`  ${C.dim}${c.reason}${C.reset}`);
    if (c.evidence?.[0]) console.log(`  ${C.dim}source: ${c.evidence[0].url}${C.reset}`);
    if (c.fix) console.log(`  ${C.red}- ${c.fix.before}${C.reset}\n  ${C.green}+ ${c.fix.after}${C.reset}`);
  }
  const u = report.usage;
  console.log(`\n${C.dim}Bifrost: ${u.llmCalls} LLM calls, ${u.totalTokens} tokens, ${u.cacheHits} cache hits, ${u.fallbacks.length} fallbacks · ` +
    `Tavily: ${u.tavilySearches} searches · registry checks (0 tokens): ${u.registryChecks} · ledger reuse: ${u.ledgerHits || 0}${C.reset}`);
}

const program = new Command().name('lumasuri').description('Find stale claims in AI answers and repos, and give each a best-before date.');
const store = () => openStore(path.resolve(config.dbPath));

function common(cmd) {
  return cmd.option('--json', 'print the JSON report').option('--outage', 'simulate a primary-provider outage (Bifrost fallback)').option('--watch', 'add claims to LumaSuri Watch').option('--fail-under <score>', 'exit 1 if the score is below this (for CI)');
}

async function done(report, opts, s) {
  const saved = s.saveReport(report);
  if (opts.watch) s.watchReport(saved);
  if (opts.json) console.log(JSON.stringify(saved, null, 2));
  else print(saved);
  if (opts.failUnder && saved.summary.score < Number(opts.failUnder)) process.exit(1);
}

common(program.command('check [file]').description('check an AI answer from a file or stdin')).action(async (file, opts) => {
  const text = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8');
  const s = store();
  await done(await createEngine({ ledger: s.ledger }).checkAnswer(text, { simulateOutage: opts.outage, title: file ? path.basename(file) : undefined }), opts, s);
});

common(program.command('scan [dir]').description('scan a repository (docs, comments, package.json)')).action(async (dir = '.', opts) => {
  const s = store();
  await done(await createEngine({ ledger: s.ledger }).scanRepo(dir, { simulateOutage: opts.outage }), opts, s);
});

program.command('watch').description('re-check watched claims whose best-before date has passed').option('--all', 're-check everything').action(async (opts) => {
  const s = store();
  const ids = opts.all ? s.listWatch().map((w) => w.id) : undefined;
  const out = await runWatch(s, createEngine({ ledger: s.ledger }), { ids });
  if (!out.checked) return console.log('Nothing is past its best-before date.');
  for (const ch of out.changes) {
    const mark = ch.changed ? `${C.yellow}CHANGED${C.reset}` : `${C.dim}same${C.reset}`;
    console.log(`${mark} ${ch.text}\n  ${ch.before.verdict} (${ch.before.score}) -> ${ch.after.verdict} (${ch.after.score})  next check ${ch.after.bestBefore.date.slice(0, 10)}`);
  }
});

program.parseAsync().catch((err) => {
  console.error(err.message);
  process.exit(2);
});
