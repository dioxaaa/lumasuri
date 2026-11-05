const SYSTEM = `You are a strict fact-freshness judge. Decide if a claim is STILL TRUE today, using ONLY the numbered evidence.
- "supported": evidence shows the claim is still current.
- "contradicted": evidence shows something newer or different replaced it (newer version, changed price, renamed/deprecated API, new office holder).
- "unclear": evidence does not settle it.
You MUST copy one exact sentence from the evidence as "quote" (verbatim, no paraphrase).
Return ONLY JSON: {"verdict":"supported|contradicted|unclear","source":<evidence number>,"quote":"...","current_value":"<what is true now, short>","corrected_claim":"<the claim rewritten to be current, or empty if supported>","reason":"<one sentence>"}`;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9.$%]+/g, ' ').trim();

// Evidence lock: the quote must actually appear in the cited evidence.
export function quoteIsGrounded(quote, content) {
  const q = norm(quote);
  const c = norm(content);
  if (q.length < 12) return false;
  if (c.includes(q)) return true;
  const words = q.split(' ');
  if (words.length < 4) return false;
  const cw = new Set(c.split(' '));
  const hit = words.filter((w) => cw.has(w)).length / words.length;
  return hit >= 0.85;
}

export async function judgeClaim(claim, evidence, { chat, usage, simulateOutage, cacheKey }) {
  if (!evidence.length) {
    return { verdict: 'unclear', method: 'llm', reason: 'No live sources found.', evidence: [], grounded: false };
  }
  const today = new Date().toISOString().slice(0, 10);
  const ev = evidence
    .map((e, i) => `[${i + 1}] ${e.title} (${e.url})${e.published ? ` published ${e.published}` : ''}\n${e.content}`)
    .join('\n\n');
  const res = await chat({
    step: 'verdict',
    usage,
    simulateOutage,
    cacheKey,
    maxTokens: 400,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Today is ${today}.\nClaim: "${claim.text}"\nSubject: ${claim.subject || 'n/a'}\n\nEvidence:\n${ev}` },
    ],
  });
  let out;
  try {
    out = res.json();
  } catch {
    return { verdict: 'unclear', method: 'llm', reason: 'Judge returned unreadable output.', evidence: evidence.slice(0, 2), grounded: false, judgedBy: res.meta };
  }
  const verdict = ['supported', 'contradicted', 'unclear'].includes(out.verdict) ? out.verdict : 'unclear';
  const idx = Math.min(Math.max(Number(out.source) || 1, 1), evidence.length) - 1;
  let src = evidence[idx];
  let grounded = quoteIsGrounded(out.quote, src.content);
  if (!grounded) {
    const other = evidence.findIndex((e) => quoteIsGrounded(out.quote, e.content));
    if (other >= 0) {
      src = evidence[other];
      grounded = true;
    }
  }
  const finalVerdict = grounded ? verdict : 'unclear';
  return {
    verdict: finalVerdict,
    method: 'llm',
    currentValue: out.current_value || null,
    correctedClaim: finalVerdict === 'contradicted' && out.corrected_claim ? out.corrected_claim : null,
    reason: grounded ? out.reason : `Judge said "${verdict}" but its quote was not found in the evidence, so LumaSuri refuses to trust it.`,
    grounded,
    evidence: [{ url: src.url, title: src.title, quote: grounded ? out.quote : null, published: src.published, official: src.official }, ...evidence.filter((e) => e !== src).slice(0, 2).map((e) => ({ url: e.url, title: e.title, published: e.published, official: e.official }))],
    judgedBy: res.meta,
  };
}
