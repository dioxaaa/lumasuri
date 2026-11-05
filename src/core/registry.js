// Deterministic, zero-token checks against package registries and release feeds.

function majorOf(v) {
  const m = String(v || '').match(/(\d+)(?:\.(\d+))?/);
  return m ? Number(m[1]) : null;
}

function cadenceDays(dates) {
  const sorted = dates.map((d) => new Date(d).getTime()).filter(Number.isFinite).sort((a, b) => b - a).slice(0, 12);
  if (sorted.length < 3) return null;
  const gaps = sorted.slice(0, -1).map((t, i) => (t - sorted[i + 1]) / 86400000).sort((a, b) => a - b);
  return Math.max(1, Math.round(gaps[Math.floor(gaps.length / 2)]));
}

export function createRegistry({ fetchImpl = fetch } = {}) {
  const memo = new Map();
  const getJson = async (url) => {
    if (!memo.has(url)) {
      memo.set(url, fetchImpl(url, { headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    }
    return memo.get(url);
  };

  async function npm(name) {
    const url = `https://registry.npmjs.org/${encodeURIComponent(name).replace('%40', '@')}`;
    const d = await getJson(url);
    if (!d?.['dist-tags']?.latest) return null;
    const latest = d['dist-tags'].latest;
    const times = Object.entries(d.time || {}).filter(([k]) => !['created', 'modified'].includes(k) && !k.includes('-'));
    return { latest, published: d.time?.[latest], cadence: cadenceDays(times.map(([, t]) => t)), url: `https://www.npmjs.com/package/${name}` };
  }

  async function pypi(name) {
    const d = await getJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
    if (!d?.info?.version) return null;
    const latest = d.info.version;
    const dates = Object.values(d.releases || {}).map((files) => files?.[0]?.upload_time_iso_8601).filter(Boolean);
    return { latest, published: d.releases?.[latest]?.[0]?.upload_time_iso_8601, cadence: cadenceDays(dates), url: `https://pypi.org/project/${name}/` };
  }

  async function nodeLts() {
    const d = await getJson('https://nodejs.org/dist/index.json');
    if (!Array.isArray(d)) return null;
    const lts = d.find((r) => r.lts);
    const lines = [...new Map(d.filter((r) => r.lts).map((r) => [majorOf(r.version), r])).values()];
    return {
      latest: lts.version,
      major: majorOf(lts.version),
      codename: lts.lts,
      published: lts.date,
      cadence: cadenceDays(lines.slice(0, 8).map((r) => r.date)) || 365,
      url: 'https://nodejs.org/en/about/previous-releases',
    };
  }

  // endoflife.date tracks release cycles for hundreds of products (python, nodejs, react, django, ...).
  async function eol(subject) {
    const slug = String(subject || '').toLowerCase().replace(/\.js$/, 'js').replace(/[^a-z0-9-]/g, '');
    if (!slug) return null;
    const d = await getJson(`https://endoflife.date/api/${slug}.json`);
    if (!Array.isArray(d) || !d.length) return null;
    const newest = d[0];
    return {
      cycle: String(newest.cycle),
      latest: newest.latest || newest.cycle,
      published: newest.releaseDate || newest.latestReleaseDate,
      cadence: cadenceDays(d.slice(0, 8).map((c) => c.releaseDate)),
      url: `https://endoflife.date/${slug}`,
    };
  }

  async function check(claim) {
    const text = `${claim.text} ${claim.subject}`;
    if (/\bnode(\.js)?\b/i.test(text) && /\bLTS\b/i.test(text)) {
      const info = await nodeLts();
      const asserted = majorOf(claim.value) ?? majorOf(claim.text);
      if (!info || asserted == null) return null;
      const ok = asserted === info.major;
      return {
        verdict: ok ? 'supported' : 'contradicted',
        method: 'registry',
        currentValue: `Node.js ${info.major} (${info.codename})`,
        correctedClaim: ok ? null : claim.text.replace(new RegExp(`\\b${asserted}\\b`), String(info.major)),
        reason: `nodejs.org release index: newest LTS line is v${info.major} "${info.codename}" (${info.latest}, released ${info.published}).`,
        evidence: [{ url: info.url, title: 'Node.js release index (nodejs.org/dist/index.json)', quote: `${info.latest} lts: ${info.codename} date: ${info.published}`, published: info.published, official: true }],
        cadenceDays: info.cadence,
        replacement: ok ? null : { from: String(asserted), to: String(info.major) },
      };
    }
    if (claim.category === 'version' && claim.subject && claim.value && /\b(latest|newest|current|most recent)\b/i.test(claim.text)) {
      const info = await eol(claim.subject);
      if (info) {
        const parse = (v) => String(v).split('.').map(Number);
        const [a1, a2 = 0] = parse(claim.value);
        const [b1, b2 = 0] = parse(info.cycle);
        const ok = a1 > b1 || (a1 === b1 && a2 >= b2);
        return {
          verdict: ok ? 'supported' : 'contradicted',
          method: 'registry',
          currentValue: `${claim.subject} ${info.cycle} (latest release ${info.latest})`,
          correctedClaim: ok ? null : claim.text.replace(claim.value, info.cycle),
          reason: `endoflife.date release index: newest ${claim.subject} cycle is ${info.cycle}, released ${info.published}; claim says ${claim.value}.`,
          evidence: [{ url: info.url, title: `${claim.subject} release cycles (endoflife.date)`, quote: `cycle ${info.cycle}, latest ${info.latest}, released ${info.published}`, published: info.published, official: true }],
          cadenceDays: info.cadence,
          replacement: ok ? null : { from: claim.value, to: info.cycle },
        };
      }
    }
    const eco = claim.ecosystem || (/\bpip\b|PyPI|python/i.test(text) ? 'pypi' : claim.package ? 'npm' : '');
    const pkg = claim.package || (claim.ecosystem && /^[@\w./-]+$/.test(claim.subject) ? claim.subject.toLowerCase() : '');
    if (!pkg || !eco || !(claim.category === 'version' || (claim.category === 'api' && /\b(v\d+|version)\b/i.test(claim.text)))) return null;
    claim = { ...claim, package: pkg };
    const info = eco === 'pypi' ? await pypi(claim.package) : await npm(claim.package);
    const asserted = majorOf(claim.value);
    if (!info || asserted == null) return null;
    const latestMajor = majorOf(info.latest);
    const ok = asserted >= latestMajor;
    const to = /\./.test(claim.value) ? info.latest : String(latestMajor);
    return {
      verdict: ok ? 'supported' : 'contradicted',
      method: 'registry',
      currentValue: `${claim.package}@${info.latest}`,
      correctedClaim: ok ? null : claim.text.replace(claim.value, to),
      replacement: ok ? null : { from: claim.value, to },
      reason: `${eco} registry: latest ${claim.package} is ${info.latest} (published ${String(info.published || '').slice(0, 10)}); claim says ${claim.value}.`,
      evidence: [{ url: info.url, title: `${claim.package} on ${eco}`, quote: `latest: ${info.latest}`, published: info.published, official: true }],
      cadenceDays: info.cadence,
    };
  }

  return { check, npm, pypi, nodeLts, eol };
}

export { majorOf, cadenceDays };
