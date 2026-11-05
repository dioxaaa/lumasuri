import { CATEGORIES } from './categories.js';

const DAY = 86400000;
const SUPPORT = { supported: 1, unclear: 0.5, contradicted: 0 };

export function recency(published, halfLife, now = Date.now()) {
  const t = published ? new Date(published).getTime() : NaN;
  if (!Number.isFinite(t)) return 0.5;
  const age = Math.max(0, (now - t) / DAY);
  return Math.pow(0.5, age / Math.max(halfLife, 1));
}

export function authority(evidence) {
  if (!evidence?.length) return 0;
  return evidence[0].official ? 1 : evidence.some((e) => e.official) ? 0.75 : 0.45;
}

// Freshness = how confident we are that the claim is still current (0-100).
export function freshnessScore({ verdict, evidence, category, now = Date.now() }) {
  const halfLife = CATEGORIES[category]?.halfLife ?? 365;
  const S = SUPPORT[verdict] ?? 0.5;
  const R = recency(evidence?.[0]?.published, halfLife, now);
  const A = authority(evidence);
  const Q = 0.6 * R + 0.4 * A;
  let score;
  if (S === 1) score = 0.6 + 0.4 * Q;
  else if (S === 0.5) score = 0.3 + 0.2 * Q;
  else score = 0.15 * (1 - Q);
  return { score: Math.round(score * 100), parts: { support: S, recency: +R.toFixed(2), authority: A } };
}

export function statusOf(score) {
  return score >= 70 ? 'fresh' : score >= 40 ? 'aging' : 'stale';
}

// Best-before: when this claim should be re-verified.
export function bestBefore({ verdict, category, cadenceDays, checkedAt = Date.now() }) {
  const halfLife = CATEGORIES[category]?.halfLife ?? 365;
  if (verdict === 'contradicted') {
    return { date: new Date(checkedAt).toISOString(), days: 0, basis: 'Already out of date' };
  }
  let days = halfLife;
  let basis = `${CATEGORIES[category]?.label || 'Claim'} half-life (${halfLife}d)`;
  if (cadenceDays && cadenceDays < days) {
    days = cadenceDays;
    basis = `Source releases about every ${cadenceDays}d`;
  }
  if (verdict === 'unclear') {
    days = Math.max(1, Math.round(days / 3));
    basis += ', shortened because evidence was unclear';
  }
  days = Math.min(Math.max(days, 1), 730);
  return { date: new Date(checkedAt + days * DAY).toISOString(), days, basis };
}
