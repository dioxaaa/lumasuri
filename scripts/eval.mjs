// Runs LumaSuri on labeled claims and prints accuracy (stale vs current detection).
import fs from 'node:fs';
import { createEngine } from '../src/core/pipeline.js';

const claims = JSON.parse(fs.readFileSync(new URL('../examples/eval/claims.json', import.meta.url)));
const engine = createEngine();
const { claims: out, usage } = await engine.verifyClaims(claims.map(({ expected, ...c }) => ({ ...c, sourceLine: c.text })));
let correct = 0;
let abstained = 0;
const rows = out.map((r, i) => {
  const predicted = r.verdict === 'contradicted' ? 'stale' : r.verdict === 'supported' ? 'current' : 'unclear';
  if (predicted === 'unclear') abstained += 1;
  if (predicted === claims[i].expected) correct += 1;
  return { claim: claims[i].text, expected: claims[i].expected, predicted, method: r.method, score: r.score };
});
console.table(rows);
const answered = claims.length - abstained;
const summary = {
  total: claims.length,
  accuracy: +(correct / claims.length).toFixed(3),
  precisionWhenAnswered: answered ? +(correct / answered).toFixed(3) : null,
  abstained,
  registryResolved: rows.filter((r) => r.method === 'registry').length,
  tokens: usage.totalTokens,
  llmCalls: usage.llmCalls,
  tavilySearches: usage.tavilySearches,
};
console.log(summary);
fs.mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../docs/eval-results.json', import.meta.url), JSON.stringify({ ranAt: new Date().toISOString(), summary, rows }, null, 2));
