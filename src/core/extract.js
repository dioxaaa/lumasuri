import { categoryOf } from './categories.js';

const TIME_SENSITIVE = [
  /\b(latest|current(ly)?|newest|recent(ly)?|as of|now|today|this year|deprecated|no longer|still|stable|LTS|end[- ]of[- ]life|EOL|supported|default)\b/i,
  /\bv?\d+\.\d+(\.\d+)?\b/,
  /\b(19|20)\d{2}\b/,
  /[$€£₱]\s?\d|\bper (1M|million|thousand|month|year)\b|\bfree tier\b|\bpricing\b/i,
  /\b(gpt|claude|gemini|llama|mistral|qwen)[-\w.]*\b/i,
  /\b(CEO|CTO|president|founder|acquired|headquarter)/i,
  /\b(law|act|regulation|policy|deadline|mandatory|requires?)\b/i,
];

export function isTimeSensitive(line) {
  return TIME_SENSITIVE.some((re) => re.test(line));
}

export function candidateLines(text) {
  return text
    .split(/\r?\n/)
    .map((line, i) => ({ line: i + 1, text: line.trim() }))
    .filter((l) => l.text.length >= 12 && l.text.length <= 400 && isTimeSensitive(l.text));
}

const SYSTEM = `You extract time-sensitive factual claims from text written by or for AI assistants.
A time-sensitive claim is one whose truth can change over time: software versions, API/SDK usage, AI model names, prices or limits, company leadership, laws and policies.
Ignore opinions, instructions and timeless facts. Return one entry per claim: most input lines contain a claim, and one line can contain several.
Return ONLY JSON: {"claims":[{"line":<number>,"text":"<the claim, copied verbatim as a short sentence>","category":"version|api|model|pricing|company|policy","subject":"<product or entity, e.g. Node.js>","value":"<the asserted value, e.g. 18>","package":"<npm or PyPI package name if the claim is about one, else empty>","ecosystem":"npm|pypi|"}]}`;

// Small models often emit slightly broken JSON, so salvage each flat claim object individually.
export function parseClaimList(content) {
  const text = String(content || '').replace(/```(?:json)?/gi, '');
  try {
    const parsed = JSON.parse(text);
    const list = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((x) => (Array.isArray(x?.claims) ? x.claims : x?.text ? [x] : []));
    if (list.length) return list;
  } catch {
    // fall through to object salvage
  }
  const objects = (text.match(/\{[^{}]*"text"[^{}]*\}/g) || []).flatMap((chunk) => {
    try {
      return [JSON.parse(chunk)];
    } catch {
      return [];
    }
  });
  if (objects.length) return objects;
  // Last resort: read fields one by one from each "text" segment.
  const field = (seg, name) => seg.match(new RegExp(`"${name}"\\s*:\\s*"?([^",}\\n]*)`))?.[1]?.trim() || '';
  return text.split(/(?=\btext"?\s*:)/).slice(1).map((seg, i, all) => {
    const prev = i === 0 ? text.split(/\btext"?\s*:/)[0] : all[i - 1];
    return {
      text: seg.match(/^text"?\s*:\s*"([^"]+)"/)?.[1] || '',
      line: Number(prev.match(/line"?\s*:?\s*"?(\d+)[^\d]*$/)?.[1]) || null,
      category: field(seg, 'category'),
      subject: field(seg, 'subject'),
      value: field(seg, 'value'),
      package: field(seg, 'package'),
      ecosystem: field(seg, 'ecosystem'),
    };
  }).filter((c) => c.text);
}

export async function extractClaims(numberedLines, { chat, usage, simulateOutage, cacheKey }) {
  if (!numberedLines.length) return [];
  const body = numberedLines.map((l) => `${l.line}: ${l.text}`).join('\n');
  const res = await chat({
    step: 'extract',
    usage,
    simulateOutage,
    cacheKey,
    maxTokens: 900,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Text (line-numbered):\n${body}` },
    ],
  });
  const list = parseClaimList(res.content);
  const byLine = new Map(numberedLines.map((l) => [l.line, l.text]));
  return list
    .filter((c) => c && typeof c.text === 'string' && c.text.trim().length > 5)
    .map((c) => {
      let line = Number(c.line) || null;
      if (!byLine.has(line)) {
        const hit = numberedLines.find((l) => l.text.includes(c.text.slice(0, 25)));
        line = hit ? hit.line : null;
      }
      return {
        text: c.text.trim(),
        category: categoryOf(c.category),
        subject: (c.subject || '').trim(),
        value: String(c.value ?? '').trim(),
        package: (c.package || '').trim(),
        ecosystem: c.ecosystem === 'pip' ? 'pypi' : ['npm', 'pypi'].includes(c.ecosystem) ? c.ecosystem : '',
        line,
        sourceLine: line ? byLine.get(line) : c.text.trim(),
        extractedBy: res.meta,
      };
    });
}
