import { useEffect, useRef, useState } from 'react';

const WS_KEY = 'lumasuri.workspace';
const getWorkspace = () => localStorage.getItem(WS_KEY) || '';

const api = async (url, opts = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  const ws = getWorkspace();
  if (ws) headers['x-lumasuri-workspace'] = ws;
  const res = await fetch(url, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
};

const STAGES = [
  ['Finding time-sensitive claims', 'small model via Bifrost'],
  ['Checking package registries', 'npm, PyPI, nodejs.org · 0 tokens'],
  ['Searching official sources', 'Tavily'],
  ['Judging each claim against quotes', 'judge model via Bifrost'],
  ['Scoring and dating each claim', 'freshness and best-before'],
];
const STATUS = { fresh: 'Still true', aging: 'Getting old', stale: 'Out of date' };
const CATEGORY = { version: 'Version', api: 'API / SDK', model: 'AI model', pricing: 'Pricing', company: 'Company', policy: 'Policy', stable: 'Stable fact' };
const SAMPLE_NAMES = { '01-dev-stack.md': 'Dev stack answer', '02-ai-models.md': 'AI models answer' };

const DEMO = [
  { line: 'Use Node.js 18, the current LTS release.', status: 'stale', score: 1, now: 'Node.js 26 (Lithium) is the current LTS', source: 'nodejs.org release index', how: 'Registry · 0 tokens', fix: ['Node.js 18', 'Node.js 26'], bb: 'Expired · replace now' },
  { line: 'The latest major version of React is React 18.', status: 'stale', score: 9, now: 'React 19 (latest release 19.3.1)', source: 'endoflife.date', how: 'Registry · 0 tokens', fix: ['React 18', 'React 19'], bb: 'Expired · replace now' },
  { line: 'Python 3.8 is the newest Python release.', status: 'stale', score: 3, now: 'Python 3.15 (latest release 3.15.2)', source: 'endoflife.date', how: 'Registry · 0 tokens', fix: ['Python 3.8', 'Python 3.15'], bb: 'Expired · replace now' },
  { line: 'JavaScript was created by Brendan Eich at Netscape.', status: 'fresh', score: 79, now: 'Still true, quoted from the source', source: 'wikipedia.org', how: 'Tavily + judge', fix: null, bb: 'Best before May 4, 2027' },
];

const daysUntil = (date) => Math.round((new Date(date).getTime() - Date.now()) / 86400000);
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });


function Ring({ score, size = 96 }) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? 'var(--fresh)' : score >= 40 ? 'var(--aging)' : 'var(--stale)';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring" role="img" aria-label={`Freshness ${score} of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth="7" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="7" fill="none" strokeDasharray={`${(score / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle" fontSize={size / 3.6} fontWeight="600" fill="var(--ink)">{score}</text>
    </svg>
  );
}

function HeroDemo() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return undefined;
    const t = setTimeout(() => setI((x) => (x + 1) % DEMO.length), 3400);
    return () => clearTimeout(t);
  }, [paused, i]);
  const d = DEMO[i];
  return (
    <div className="frame-wrap">
      <img className="mascot-sticker" src="/logo.png" alt="LumaSuri logo" />
      <div className="frame">
      <div className="frame-bar"><i /><i /><i /><span>lumasuri · Check an answer</span></div>
      <div className="frame-body">
        <p className="frame-label">AI answer</p>
        <ol className="demo-lines">
          {DEMO.map((x, k) => (
            <li key={k}><button className={`demo-line ${x.status} ${k === i ? 'on' : ''}`} onClick={() => setI(k)}>{x.line}</button></li>
          ))}
        </ol>
        <div className={`preview ${d.status}`} key={i}>
          <div className="row gap">
            <span className={`pill ${d.status}`}>{STATUS[d.status]}</span>
            <span className="mono">{d.score}/100</span>
            <span className="tag">{d.how}</span>
          </div>
          <p className="preview-now"><span>True now</span>{d.now}</p>
          {d.fix ? (
            <pre className="diff"><span className="del">- {d.line}</span>{'\n'}<span className="add">+ {d.line.replace(d.fix[0], d.fix[1])}</span></pre>
          ) : <p className="ok-line">No fix needed. LumaSuri will check it again on its best-before date.</p>}
          <p className="preview-meta"><span>Source: {d.source}</span><span className={d.fix ? 'stale-txt' : ''}>{d.bb}</span></p>
        </div>
      </div>
      <div className="frame-foot">
        <span className={`tick ${paused ? 'paused' : ''}`} key={`t${i}`} />
        <button className="link-btn" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>{paused ? 'Play' : 'Pause'}</button>
      </div>
      </div>
    </div>
  );
}

function Lanes() {
  return (
    <div className="lanes" aria-hidden="true">
      <div className="node">Claim</div>
      <div className="lane-set">
        {['Registry · 0 tokens', 'Tavily search', 'Bifrost judge'].map((l, k) => (
          <div className="lane" key={l}><span className="pulse" style={{ animationDelay: `${k * 0.6}s` }} /><b>{l}</b></div>
        ))}
      </div>
      <div className="node out">Verdict</div>
    </div>
  );
}

function BestBefore({ bb }) {
  const d = daysUntil(bb.date);
  return (
    <span className={`bb ${d <= 0 ? 'expired' : d < 30 ? 'soon' : ''}`} title={bb.basis}>
      {d <= 0 ? 'Expired · replace now' : `Best before ${fmtDate(bb.date)} · ${d} days`}
    </span>
  );
}

function ClaimCard({ c, i, onCopy }) {
  const ev = c.evidence?.[0];
  return (
    <article className={`claim ${c.status}`} id={`claim-${i}`}>
      <header className="row gap wrap-row">
        <span className={`pill ${c.status}`}>{STATUS[c.status]}</span>
        <span className="mono">{c.score}/100</span>
        <span className="tag">{CATEGORY[c.category] || c.category}</span>
        <span className="tag">{c.reused ? 'Saved result · 0 tokens' : c.method === 'registry' ? 'Registry · 0 tokens' : 'Tavily + judge'}</span>
        {c.file && <code className="loc">{c.file}:{c.line ?? '?'}</code>}
      </header>
      <p className="claim-text">“{c.text}”</p>
      <dl className="facts">
        {c.currentValue && <div><dt>True now</dt><dd>{c.currentValue}</dd></div>}
        <div><dt>Why</dt><dd>{c.reason}</dd></div>
      </dl>
      {ev && (
        <div className="evidence">
          {ev.quote && <blockquote>{ev.quote}</blockquote>}
          <p className="row gap wrap-row">
            <a href={ev.url} target="_blank" rel="noreferrer">{ev.title || ev.url}</a>
            {ev.official && <span className="tag ok">Official source</span>}
            {ev.published && <span className="muted small">Published {String(ev.published).slice(0, 10)}</span>}
          </p>
        </div>
      )}
      {c.fix && (
        <div className="fix">
          <pre className="diff"><span className="del">- {c.fix.before}</span>{'\n'}<span className="add">+ {c.fix.after}</span></pre>
          <button className="btn ghost small" onClick={() => onCopy(c.fix.after, 'Fix copied')}>Copy the fix</button>
        </div>
      )}
      <footer className="row between wrap-row">
        <BestBefore bb={c.bestBefore} />
        <details className="how">
          <summary>How the score works</summary>
          <p>Support {c.scoreParts.support} · Recency {c.scoreParts.recency} · Authority {c.scoreParts.authority}. {c.bestBefore.basis}.</p>
        </details>
      </footer>
    </article>
  );
}

function Usage({ u }) {
  const items = [
    ['AI calls through Bifrost', u.llmCalls],
    ['Tokens used', `${u.totalTokens.toLocaleString()} of ${u.maxTokens.toLocaleString()}`],
    ['Answered from Bifrost cache', u.cacheHits],
    ['Switched to a backup model', u.fallbacks.length],
    ['Tavily searches', u.tavilySearches],
    ['Registry checks, 0 tokens', u.registryChecks],
    ['Saved results reused, 0 tokens', u.ledgerHits || 0],
  ];
  return (
    <aside className="panel usage">
      <h3>What this check cost</h3>
      <dl>{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {Object.keys(u.models).length > 0 && <p className="row gap wrap-row">{Object.entries(u.models).map(([m, n]) => <code key={m}>{m} × {n}</code>)}</p>}
      {u.fallbacks.length > 0 && <p className="notice">The main provider failed, so Bifrost moved {u.fallbacks.length} call(s) from <code>{u.fallbacks[0].from}</code> to <code>{u.fallbacks[0].to}</code>.</p>}
      {u.budgetStopped && <p className="notice">The token budget ran out, so the rest were left unchecked instead of overspending.</p>}
    </aside>
  );
}

function Annotated({ text, claims }) {
  return (
    <div className="panel annotated">
      <h3>Your answer, marked up</h3>
      {text.split('\n').map((l, idx) => {
        if (!l.trim()) return null;
        const hit = claims.findIndex((c) => c.line === idx + 1);
        return hit >= 0
          ? <p key={idx}><a href={`#claim-${hit}`} className={`hl ${claims[hit].status}`}>{l}</a></p>
          : <p key={idx} className="muted">{l}</p>;
      })}
      <p className="legend"><span className="hl stale">Out of date</span><span className="hl aging">Getting old</span><span className="hl fresh">Still true</span> Click a line to jump to its card.</p>
    </div>
  );
}

function Report({ r, onCopy, onWatched }) {
  const [watched, setWatched] = useState(false);
  const [filter, setFilter] = useState('all');
  const s = r.summary;
  const total = r.claims.length;
  const verdict = !total ? 'No time-sensitive claims found' : s.score >= 70 ? 'Up to date' : s.score >= 40 ? 'Some claims are getting old' : 'Mostly out of date';
  const shown = r.claims.map((c, i) => [c, i]).filter(([c]) => filter === 'all' || (filter === 'stale' ? c.status !== 'fresh' : c.status === 'fresh'));
  const fixes = r.claims.filter((c) => c.fix).map((c) => c.fix.after);
  return (
    <div className="report">
      <section className="panel summary">
        <Ring score={s.score} />
        <div className="summary-text">
          <h3>{verdict}</h3>
          <p>{total ? `${s.stale} of ${total} claim${total > 1 ? 's' : ''} ${s.stale === 1 ? 'is' : 'are'} out of date${s.aging ? `, ${s.aging} getting old` : ''}.` : 'Nothing here needs a date check.'} {s.nextBestBefore && `Next check due ${fmtDate(s.nextBestBefore)}.`}</p>
          <p className="row gap wrap-row">
            <span className="pill fresh">{s.fresh} still true</span>
            <span className="pill aging">{s.aging} getting old</span>
            <span className="pill stale">{s.stale} out of date</span>
          </p>
        </div>
        <div className="summary-actions">
          <button className="btn" disabled={watched || !total} onClick={async () => { await api(`/api/reports/${r.id}/watch`, { method: 'POST' }); setWatched(true); onWatched(); onCopy(null, 'Saved to Watch'); }}>{watched ? 'Saved to Watch' : 'Save to Watch'}</button>
          {fixes.length > 0 && <button className="btn ghost" onClick={() => onCopy(fixes.join('\n'), fixes.length > 1 ? `${fixes.length} fixes copied` : 'Fix copied')}>{fixes.length > 1 ? `Copy all ${fixes.length} fixes` : 'Copy the fix'}</button>}
          <button className="link-btn" onClick={() => onCopy(`![LumaSuri freshness](${location.origin}/badge/${r.id}.svg)`, 'Badge markdown copied')}><img src={`/badge/${r.id}.svg`} alt="" /> Copy README badge</button>
        </div>
      </section>
      <div className="report-grid">
        <div className="stack">
          {r.kind === 'answer' && <Annotated text={r.input} claims={r.claims} />}
          {r.kind === 'repo' && <div className="panel"><h3>Scanned {r.files?.length} files</h3><p className="muted mono small">{r.files?.join('  ·  ')}</p></div>}
          {total > 0 && (
            <div className="seg small-seg" role="tablist" aria-label="Filter claims">
              {[['all', `All ${total}`], ['stale', 'Needs a fix'], ['fresh', 'Still true']].map(([k, l]) => (
                <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
          )}
          {shown.map(([c, i]) => <ClaimCard key={i} c={c} i={i} onCopy={onCopy} />)}
        </div>
        <Usage u={r.usage} />
      </div>
    </div>
  );
}

function Progress({ start, kind }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((Date.now() - start) / 1000), 300);
    return () => clearInterval(id);
  }, [start]);
  const active = Math.min(STAGES.length - 1, Math.floor(t / 7));
  return (
    <div className="panel progress" aria-live="polite">
      <h3>{kind === 'repo' ? 'Scanning the repo' : 'Checking your answer'} · {t.toFixed(0)}s</h3>
      <ol>
        {STAGES.map(([s, sub], i) => (
          <li key={s} className={i < active ? 'done' : i === active ? 'active' : ''}><span className="dot" /> {s} <small>{sub}</small></li>
        ))}
      </ol>
      <p className="muted small">Usually 10 to 60 seconds. The AI models run locally, so repeat checks come back faster from the cache.</p>
    </div>
  );
}

function Watch({ outage, onEmpty, onCount }) {
  const [items, setItems] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api('/api/watch').then((w) => { setItems(w); onCount(w.length); });
  useEffect(() => { load(); }, []);
  const due = items.filter((w) => w.due);
  const recheck = async () => {
    setBusy(true);
    try { setResult(await api('/api/watch/run', { method: 'POST', body: { simulateOutage: outage } })); await load(); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <div className="panel row between wrap-row">
        <div>
          <h3>Saved claims</h3>
          <p className="muted">Each claim is checked again when its best-before date passes, so you see what changed since you saved it.</p>
        </div>
        <button className="btn" disabled={busy || !due.length} onClick={recheck}>{busy ? 'Re-checking…' : due.length ? `Re-check ${due.length} expired claim${due.length > 1 ? 's' : ''}` : 'Nothing expired yet'}</button>
      </div>
      {result && (
        <div className="panel changes">
          <h3>What changed since the last check</h3>
          {result.changes.map((ch) => (
            <div key={ch.id} className="change">
              <span className={`pill ${ch.changed ? 'aging' : ''}`}>{ch.changed ? 'Changed' : 'Same as before'}</span>
              <p>{ch.text}</p>
              <p className="muted small">{ch.before.verdict} ({ch.before.score}) → <b>{ch.after.verdict} ({ch.after.score})</b>{ch.after.currentValue ? ` · now ${ch.after.currentValue}` : ''} · next check {fmtDate(ch.after.bestBefore.date)}</p>
            </div>
          ))}
        </div>
      )}
      {items.length ? (
        <ul className="panel watch-list">
          {items.map((w) => (
            <li key={w.id} className={w.due ? 'due' : ''}>
              <div>
                <p>{w.claim.text}</p>
                <p className="muted small">From “{(w.reportTitle || '').slice(0, 60)}” · {w.history.length} check{w.history.length > 1 ? 's' : ''}</p>
              </div>
              <span className={`pill ${w.verdict === 'contradicted' ? 'stale' : w.verdict === 'supported' ? 'fresh' : 'aging'}`}>{w.verdict === 'contradicted' ? 'Out of date' : w.verdict === 'supported' ? 'Still true' : 'Unclear'}</span>
              <span className={w.due ? 'stale-txt' : 'muted'}>{w.due ? 'Expired' : `${daysUntil(w.bestBefore)} days left`}</span>
              <span className="row gap">
                {!w.due && <button className="link-btn" title="Demo helper: mark this claim as expired now" onClick={async () => { await api(`/api/watch/${w.id}/expire`, { method: 'POST' }); load(); }}>Expire now</button>}
                <button className="link-btn" onClick={async () => { await api(`/api/watch/${w.id}`, { method: 'DELETE' }); load(); }}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="panel empty">
          <p>No saved claims yet. Run a check, then press <b>Save to Watch</b>.</p>
          <button className="btn ghost" onClick={onEmpty}>Check an answer</button>
        </div>
      )}
    </div>
  );
}

function History({ onOpen, onEmpty }) {
  const [list, setList] = useState(null);
  useEffect(() => { api('/api/reports').then(setList); }, []);
  if (!list) return <div className="panel muted">Loading…</div>;
  if (!list.length) return <div className="panel empty"><p>No reports yet.</p><button className="btn ghost" onClick={onEmpty}>Check an answer</button></div>;
  return (
    <ul className="panel history">
      {list.map((h) => (
        <li key={h.id}>
          <Ring score={h.summary.score} size={44} />
          <div>
            <p>{h.title}</p>
            <p className="muted small">{h.kind === 'repo' ? 'Repo scan' : 'Answer'} · {h.claimCount} claims · {new Date(h.createdAt).toLocaleString()}</p>
          </div>
          <button className="btn ghost small" onClick={() => onOpen(h)}>Open the report</button>
        </li>
      ))}
    </ul>
  );
}

function WorkspaceButton({ ws, setWs }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(ws);
  const save = (v) => {
    const clean = v.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    if (clean) localStorage.setItem(WS_KEY, clean); else localStorage.removeItem(WS_KEY);
    setWs(clean);
    setDraft(clean);
    setOpen(false);
  };
  return (
    <div className="ws">
      <button className="link-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>Workspace: <b>{ws || 'public'}</b></button>
      {open && (
        <form className="ws-pop" onSubmit={(e) => { e.preventDefault(); save(draft); }}>
          <label htmlFor="ws-name">Workspace name (optional)</label>
          <input id="ws-name" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. diosa-team" autoFocus />
          <p className="muted small">No account or password. It keeps your saved claims and history separate, and is stored only in this browser.</p>
          <div className="row gap">
            <button className="btn small" type="submit">Use this name</button>
            {ws && <button className="btn ghost small" type="button" onClick={() => save('')}>Use public</button>}
          </div>
        </form>
      )}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('check');
  const [health, setHealth] = useState(null);
  const [examples, setExamples] = useState({ answers: [], repos: [] });
  const [text, setText] = useState('');
  const [sample, setSample] = useState('');
  const [repo, setRepo] = useState('');
  const [outage, setOutage] = useState(false);
  const [busy, setBusy] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [ws, setWs] = useState(getWorkspace());
  const [watchCount, setWatchCount] = useState(0);
  const resultRef = useRef(null);

  useEffect(() => {
    api('/api/health').then(setHealth).catch(() => setHealth({ ok: false }));
    api('/api/examples').then((e) => { setExamples(e); setText(e.answers[0]?.text || ''); setSample(e.answers[0]?.id || ''); setRepo(e.repos[0] || ''); });
  }, []);
  useEffect(() => { api('/api/watch').then((w) => setWatchCount(w.length)).catch(() => {}); }, [ws]);

  const notify = (copyText, msg) => {
    if (copyText) navigator.clipboard?.writeText(copyText);
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };
  const run = async (path, body, kind) => {
    setError('');
    setReport(null);
    setBusy({ start: Date.now(), kind });
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    try {
      setReport(await api(path, { method: 'POST', body: { ...body, simulateOutage: outage } }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };
  const startCheck = () => { setTab('check'); go('try'); };
  const tabs = [['check', 'Check an answer'], ['scan', 'Scan a repo'], ['watch', `Watch${watchCount ? ` · ${watchCount}` : ''}`], ['history', 'History']];
  const showResults = tab === 'check' || tab === 'scan';

  return (
    <>
      <header className="nav">
        <div className="wrap row between">
          <a className="brand" href="#top"><img className="brand-logo" src="/logo.png" alt="LumaSuri — examines what has gone old" /></a>
          <nav className="row gap nav-links">
            <a href="#how">How it works</a>
            <a href="#demo">Demo</a>
            <a href="#try">Try it</a>
          </nav>
          <div className="row gap">
            <WorkspaceButton ws={ws} setWs={(v) => { setWs(v); setReport(null); }} />
            <button className="btn small hide-sm" onClick={startCheck}>Check an answer</button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">✦ Examines what has gone old ✦</p>
              <h1>Stale-claim checker for AI answers and code</h1>
              <p className="lead">Paste an AI answer or scan a repo. LumaSuri checks every time-sensitive claim against live sources, quotes the evidence, suggests a fix and gives each claim a best-before date.</p>
              <div className="row gap wrap-row">
                <button className="btn big" onClick={startCheck}>Check an answer</button>
                <button className="btn ghost big" onClick={() => go('demo')}>Watch the demo</button>
              </div>
              <p className="fact"><b>87.5%</b> correct on 16 labeled claims, with <b>10 of 16</b> settled at zero AI tokens.</p>
              <p className="muted small">No sign-up. Open source. Built on Tavily and Bifrost.</p>
            </div>
            <HeroDemo />
          </div>
        </section>

        <section className="section" id="how">
          <div className="wrap">
            <h2>How a check works</h2>
            <p className="lead">Three steps, no account. The cheapest check runs first, so most version claims cost nothing.</p>
            <div className="cards3">
              <article className="card">
                <span className="num">1</span>
                <h3>Paste an answer or pick a repo</h3>
                <p>Use a sample, paste text from ChatGPT or Gemini, or scan a repo's docs, comments and package.json.</p>
                <div className="mini-input"><span className="chip">Dev stack answer</span><span className="chip">AI models answer</span><div className="mini-text">For a new project, use Node.js 18…</div></div>
              </article>
              <article className="card">
                <span className="num">2</span>
                <h3>Checks each claim against live sources</h3>
                <p>Registries settle versions for free. Tavily finds official pages, and the judge must quote them.</p>
                <Lanes />
              </article>
              <article className="card">
                <span className="num">3</span>
                <h3>Copy the fix, then let Watch re-check</h3>
                <p>Every claim gets a best-before date. Saved claims are checked again when it passes.</p>
                <div className="mini-watch">
                  <div><span className="pill stale">Out of date</span> Node.js 18 is the LTS</div>
                  <div><span className="pill fresh">Still true</span> Brendan Eich created JavaScript</div>
                  <div className="muted small">Next check: May 4, 2027</div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="section dark" id="demo">
          <div className="wrap demo-grid">
            <div>
              <h2>The 1-minute demo</h2>
              <p className="lead">A quick tour of the app: a stale answer, its evidence and fixes, then Watch and History.</p>
              <ol className="demo-steps">
                <li>Pick a sample answer and press <b>Check an answer</b>.</li>
                <li>Read each card: what is true now, the quoted source and the fix.</li>
                <li>Press <b>Save to Watch</b> so the claims get checked again later.</li>
              </ol>
              <button className="btn inv" onClick={startCheck}>Check an answer</button>
            </div>
            <video className="video" controls preload="metadata" poster="/media/video/poster.jpg" src="/media/video/LumaSuri-demo.mp4" />
          </div>
        </section>

        <section className="section app" id="try">
          <div className="wrap">
            <div className="row between wrap-row app-head">
              <h2>Check an answer or a repo</h2>
              <p className="row gap status">
                <span className={`state ${health?.bifrost ? 'ok' : 'bad'}`}>Bifrost {health ? (health.bifrost ? 'online' : 'offline') : '…'}</span>
                <span className="state ok">Tavily {health?.tavily || '…'}</span>
              </p>
            </div>
            {health && !health.bifrost && <p className="notice">The AI gateway is offline. Start it with <code>docker compose up -d</code>, then reload this page.</p>}
            <div className="seg" role="tablist">
              {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
            </div>

            {tab === 'check' && (
              <div className="panel tool">
                <p className="step-label"><span className="num">1</span> Paste an AI answer, or pick a sample</p>
                <div className="row gap wrap-row">
                  {examples.answers.map((a) => (
                    <button key={a.id} className={`chip ${sample === a.id ? 'on' : ''}`} onClick={() => { setText(a.text); setSample(a.id); }}>{SAMPLE_NAMES[a.id] || a.id}</button>
                  ))}
                  <button className="link-btn" onClick={() => { setText(''); setSample(''); }}>Clear</button>
                </div>
                <textarea value={text} onChange={(e) => { setText(e.target.value); setSample(''); }} rows={6} placeholder="Paste an answer from ChatGPT, Gemini or Copilot…"
                  onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && text.trim() && !busy) run('/api/check', { text }, 'answer'); }} />
                <p className="step-label"><span className="num">2</span> Run the check</p>
                <div className="row gap wrap-row">
                  <button className="btn big" disabled={!!busy || !text.trim()} onClick={() => run('/api/check', { text }, 'answer')}>{busy ? 'Checking…' : 'Check an answer'}</button>
                  <span className="muted small">or press Ctrl + Enter</span>
                </div>
                <label className="toggle"><input type="checkbox" checked={outage} onChange={(e) => setOutage(e.target.checked)} /> Simulate a provider outage <span className="muted small">(the main model fails, so you can see Bifrost switch to a backup)</span></label>
              </div>
            )}
            {tab === 'scan' && (
              <div className="panel tool">
                <p className="step-label"><span className="num">1</span> Pick a repo</p>
                <div className="repo-picks">
                  {examples.repos.map((r) => (
                    <label key={r} className={`repo-pick ${repo === r ? 'on' : ''}`}>
                      <input type="radio" name="repo" checked={repo === r} onChange={() => setRepo(r)} />
                      <b>{r}</b><span className="muted small">README, code comments and package.json versions</span>
                    </label>
                  ))}
                </div>
                <p className="step-label"><span className="num">2</span> Run the scan</p>
                <div className="row gap wrap-row">
                  <button className="btn big" disabled={!!busy || !repo} onClick={() => run('/api/scan', { repo }, 'repo')}>{busy ? 'Scanning…' : 'Scan the repo'}</button>
                  <span className="muted small">On your own code: <code>npx lumasuri scan .</code></span>
                </div>
                <label className="toggle"><input type="checkbox" checked={outage} onChange={(e) => setOutage(e.target.checked)} /> Simulate a provider outage</label>
              </div>
            )}
            {tab === 'watch' && <Watch key={ws} outage={outage} onEmpty={() => setTab('check')} onCount={setWatchCount} />}
            {tab === 'history' && <History key={ws} onEmpty={() => setTab('check')} onOpen={async (h) => { setReport(await api(`/api/reports/${h.id}`)); setTab(h.kind === 'repo' ? 'scan' : 'check'); setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 50); }} />}

            <div ref={resultRef} className="results">
              {showResults && (busy || report || error) && <p className="step-label"><span className="num">3</span> Read the results</p>}
              {busy && showResults && <Progress start={busy.start} kind={busy.kind} />}
              {error && <p className="notice bad">{error}</p>}
              {report && showResults && <Report key={report.id} r={report} onCopy={notify} onWatched={() => setWatchCount((n) => n + report.claims.length)} />}
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap row between wrap-row">
          <span className="foot-inner"><img className="foot-logo" src="/logo.png" alt="LumaSuri — examines what has gone old" /> LumaSuri · Global AI Hackathon, Problem Statement 06 · Tavily + Bifrost</span>
          <a href="https://github.com/dioxaaa/lumasuri" target="_blank" rel="noreferrer">github.com/dioxaaa/lumasuri</a>
        </div>
      </footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
