import { config } from './config.js';

const OFFICIAL = {
  openai: ['platform.openai.com', 'openai.com', 'help.openai.com'],
  anthropic: ['docs.anthropic.com', 'anthropic.com', 'docs.claude.com'],
  claude: ['docs.anthropic.com', 'anthropic.com', 'docs.claude.com'],
  gemini: ['ai.google.dev', 'cloud.google.com', 'blog.google'],
  google: ['ai.google.dev', 'cloud.google.com', 'blog.google', 'developers.google.com'],
  node: ['nodejs.org'],
  python: ['python.org', 'docs.python.org'],
  react: ['react.dev'],
  next: ['nextjs.org'],
  vite: ['vite.dev', 'vitejs.dev'],
  github: ['docs.github.com', 'github.blog'],
  stripe: ['stripe.com', 'docs.stripe.com'],
  aws: ['aws.amazon.com', 'docs.aws.amazon.com'],
  vercel: ['vercel.com'],
  tavily: ['docs.tavily.com', 'tavily.com'],
  bifrost: ['docs.getbifrost.ai', 'getmaxim.ai'],
};

export function officialDomains(claim) {
  const hay = `${claim.subject} ${claim.text}`.toLowerCase();
  return [...new Set(Object.entries(OFFICIAL).filter(([k]) => hay.includes(k)).flatMap(([, v]) => v))];
}

export function isOfficial(url, claim) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (/\.gov(\.[a-z]{2})?$|\.gob\.|\.edu$/.test(host)) return true;
    return officialDomains(claim).some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export function buildQuery(claim) {
  const year = new Date().getUTCFullYear();
  const topic = claim.subject ? `${claim.subject} ` : '';
  const angle = ['api', 'model'].includes(claim.category) ? ' deprecated or replaced? current recommended' : ' current as of';
  return `${topic}${claim.text} (${angle.trim()} ${year})`.slice(0, 380);
}

export function createTavily({ fetchImpl = fetch, apiKey = config.tavilyKey } = {}) {
  async function post(body) {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    else headers['X-Tavily-Access-Mode'] = 'keyless';
    const res = await fetchImpl('https://api.tavily.com/search', { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Tavily ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  return async function search(claim, { usage } = {}) {
    const domains = officialDomains(claim);
    const base = { query: buildQuery(claim), search_depth: 'advanced', chunks_per_source: 3, max_results: 5, topic: 'general' };
    let data = await post(domains.length ? { ...base, include_domains: domains } : base);
    if (usage) usage.tavilySearches += 1;
    if (domains.length && !(data.results || []).length) {
      data = await post(base);
      if (usage) usage.tavilySearches += 1;
    }
    return (data.results || []).filter((r) => /^https?:\/\//i.test(r.url || '')).map((r) => ({
      url: r.url,
      title: r.title,
      content: (r.content || '').slice(0, 1400),
      published: r.published_date || null,
      score: r.score,
      official: isOfficial(r.url, claim),
    }));
  };
}
