import { useEffect, useMemo, useState } from 'react';

const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
};

const STAGES = ['Extracting time-sensitive claims (Bifrost · small model)', 'Free registry checks (npm · PyPI · nodejs.org)', 'Live search on official sources (Tavily)', 'Evidence-locked verdicts (Bifrost · judge model)', 'Scoring freshness and best-before dates'];
const CATEGORY = { version: 'Version', api: 'API / SDK', model: 'AI model', pricing: 'Pricing', company: 'Company', policy: 'Policy', stable: 'Stable' };

function daysUntil(date) {
  return Math.round((new Date(date).getTime() - Date.now()) / 86400000);
}

function BestBefore({ bb }) {
  const d = daysUntil(bb.date);
  const label = d <= 0 ? 'Expired' : `Best before ${new Date(bb.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return (
    <span className={`bb ${d <= 0 ? 'bb-expired' : d < 30 ? 'bb-soon' : ''}`} title={bb.basis}>
      {label} <small>· {d <= 0 ? 'replace now' : `${d}d`} · {bb.basis}</small>
    </span>
  );
}

function Ring({ score }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? 'var(--fresh)' : score >= 40 ? 'var(--aging)' : 'var(--stale)';
  return (
    <svg width="90" height="90" viewBox="0 0 90 90" className="ring">
      <circle cx="45" cy="45" r={r} stroke="var(--line)" strokeWidth="8" fill="none" />
      <circle cx="45" cy="45" r={r} stroke={color} strokeWidth="8" fill="none" strokeDasharray={`${(score / 100) * c} ${c}`} strokeLinecap="round" transform="rotate(-90 45 45)" />
      <text x="45" y="51" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--ink)">{score}</text>
    </svg>
  );
}

function ClaimCard({ c, i }) {
  const ev = c.evidence?.[0];
  return (
    <article className={`card claim ${c.status}`} id={`claim-${i}`}>
      <header>
        <span className={`pill ${c.status}`}>{c.status}</span>
        <span className="score">{c.score}</span>
        <span className="cat">{CATEGORY[c.category] || c.category}</span>
        <span className={`method m-${c.method}`}>{c.method === 'registry' ? 'registry · 0 tokens' : c.method === 'llm' ? 'Tavily + judge' : c.method}</span>
        {c.reused && <span className="method">ledger reuse · 0 tokens</span>}
        {c.file && <code className="loc">{c.file}:{c.line ?? '?'}</code>}
      </header>
      <p className="claim-text">“{c.text}”</p>
      {c.currentValue && <p className="now"><b>Now:</b> {c.currentValue}</p>}
      <p className="reason">{c.reason}</p>
      {ev && (
        <div className="evidence">
          {ev.quote && <blockquote>{ev.quote}</blockquote>}
          <a href={ev.url} target="_blank" rel="noreferrer">{ev.title || ev.url}</a>
          {ev.official && <span className="official">official source</span>}
          {ev.published && <span className="pub">published {String(ev.published).slice(0, 10)}</span>}
        </div>
      )}
      {c.fix && (
        <pre className="diff">
          <span className="del">- {c.fix.before}</span>
          {'\n'}
          <span className="add">+ {c.fix.after}</span>
        </pre>
      )}
      <footer>
        <BestBefore bb={c.bestBefore} />
        <small className="parts">S {c.scoreParts.support} · R {c.scoreParts.recency} · A {c.scoreParts.authority}</small>
      </footer>
    </article>
  );
}

function Usage({ u }) {
  const items = [
    ['LLM calls via Bifrost', u.llmCalls],
    ['Tokens spent', `${u.totalTokens.toLocaleString()} / ${u.maxTokens.toLocaleString()}`],
    ['Bifrost cache hits', u.cacheHits],
    ['Provider fallbacks', u.fallbacks.length],
    ['Tavily searches', u.tavilySearches],
    ['Registry checks (0 tokens)', u.registryChecks],
    ['Ledger reuse (0 tokens)', u.ledgerHits || 0],
  ];
  return (
    <section className="card usage">
      <h3>Cost & routing</h3>
      <dl>{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {Object.keys(u.models).length > 0 && <p className="models">{Object.entries(u.models).map(([m, n]) => <code key={m}>{m} × {n}</code>)}</p>}
      {u.fallbacks.length > 0 && <p className="fallback">Primary provider failed. Bifrost rerouted {u.fallbacks.length} call(s): <code>{u.fallbacks[0].from}</code> → <code>{u.fallbacks[0].to}</code></p>}
      {u.budgetStopped && <p className="fallback">Token budget reached. Remaining claims were left unverified instead of overspending.</p>}
    </section>
  );
}

function Highlighted({ text, claims }) {
  const lines = text.split('\n');
  return (
    <div className="card highlighted">
      <h3>Your answer, annotated</h3>
      {lines.map((l, idx) => {
        const hit = claims.findIndex((c) => c.line === idx + 1);
        if (!l.trim()) return null;
        return hit >= 0 ? (
          <p key={idx}><a href={`#claim-${hit}`} className={`hl ${claims[hit].status}`}>{l}</a></p>
        ) : (
          <p key={idx} className="plain">{l}</p>
        );
      })}
    </div>
  );
}

function Report({ r, onWatch }) {
  const [watched, setWatched] = useState(false);
  const badge = `![LumaSuri freshness](${location.origin}/badge/${r.id}.svg)`;
  return (
    <div className="report">
      <section className="card summary">
        <Ring score={r.summary.score} />
        <div>
          <h2>{r.title}</h2>
          <p className="counts">
            <span className="pill fresh">{r.summary.fresh} fresh</span>
            <span className="pill aging">{r.summary.aging} aging</span>
            <span className="pill stale">{r.summary.stale} stale</span>
            <span className="pill">{r.summary.fixes} fixes</span>
          </p>
          {r.summary.nextBestBefore && <p className="muted">Earliest best-before: {new Date(r.summary.nextBestBefore).toLocaleDateString()}</p>}
        </div>
        <div className="actions">
          <button disabled={watched} onClick={async () => { await onWatch(r.id); setWatched(true); }}>{watched ? '✓ Watching' : 'Add to Watch'}</button>
          <img src={`/badge/${r.id}.svg`} alt="freshness badge" />
          <button className="ghost" onClick={() => navigator.clipboard?.writeText(badge)}>Copy README badge</button>
        </div>
      </section>
      <div className="report-grid">
        <div>
          {r.kind === 'answer' && <Highlighted text={r.input} claims={r.claims} />}
          {r.kind === 'repo' && <div className="card"><h3>Scanned {r.files?.length} files</h3><p className="muted">{r.files?.join(' · ')}</p></div>}
          {r.claims.map((c, i) => <ClaimCard key={i} c={c} i={i} />)}
          {!r.claims.length && <p className="card muted">No time-sensitive claims found.</p>}
        </div>
        <Usage u={r.usage} />
      </div>
    </div>
  );
}

function Progress({ start }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((Date.now() - start) / 1000), 300);
    return () => clearInterval(id);
  }, [start]);
  const active = Math.min(STAGES.length - 1, Math.floor(t / 7));
  return (
    <div className="card progress">
      {STAGES.map((s, i) => <p key={s} className={i < active ? 'done' : i === active ? 'active' : ''}>{i < active ? '✓' : i === active ? '◌' : '·'} {s}</p>)}
      <small className="muted">{t.toFixed(0)}s · running on local models through Bifrost</small>
    </div>
  );
}

function Watch({ outage }) {
  const [items, setItems] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api('/api/watch').then(setItems);
  useEffect(() => { load(); }, []);
  const due = items.filter((w) => w.due);
  return (
    <div>
      <section className="card watch-head">
        <div>
          <h2>LumaSuri Watch</h2>
          <p className="muted">Every saved claim is re-verified when its best-before date passes. You see what changed since you saved it.</p>
        </div>
        <button disabled={busy || !due.length} onClick={async () => { setBusy(true); try { setResult(await api('/api/watch/run', { method: 'POST', body: { simulateOutage: outage } })); await load(); } finally { setBusy(false); } }}>
          {busy ? 'Re-checking…' : `Re-check ${due.length} expired`}
        </button>
      </section>
      {result && (
        <section className="card changes">
          <h3>What changed since the last check</h3>
          {result.changes.map((ch) => (
            <div key={ch.id} className="change">
              <span className={`pill ${ch.changed ? 'aging' : ''}`}>{ch.changed ? 'changed' : 'unchanged'}</span> {ch.text}
              <div className="muted">{ch.before.verdict} ({ch.before.score}) → <b>{ch.after.verdict} ({ch.after.score})</b>{ch.after.currentValue ? ` · now: ${ch.after.currentValue}` : ''} · next check {new Date(ch.after.bestBefore.date).toLocaleDateString()}</div>
            </div>
          ))}
        </section>
      )}
      <table className="card watch-table">
        <thead><tr><th>Claim</th><th>From</th><th>Last verdict</th><th>Best before</th><th /></tr></thead>
        <tbody>
          {items.map((w) => (
            <tr key={w.id} className={w.due ? 'due' : ''}>
              <td>{w.claim.text}{w.history.length > 1 && <small className="muted"> · {w.history.length} checks</small>}</td>
              <td className="muted">{w.reportTitle}</td>
              <td>{w.verdict} ({w.score})</td>
              <td>{w.due ? <b className="stale-txt">expired</b> : `${daysUntil(w.bestBefore)}d`}</td>
              <td><button className="ghost small" onClick={async () => { await api(`/api/watch/${w.id}/expire`, { method: 'POST' }); load(); }}>Fast-forward</button></td>
            </tr>
          ))}
          {!items.length && <tr><td colSpan="5" className="muted">Nothing watched yet. Run a check and click “Add to Watch”.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('check');
  const [health, setHealth] = useState(null);
  const [examples, setExamples] = useState({ answers: [], repos: [] });
  const [text, setText] = useState('');
  const [repo, setRepo] = useState('');
  const [outage, setOutage] = useState(false);
  const [busy, setBusy] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api('/api/health').then(setHealth).catch(() => setHealth({ ok: false }));
    api('/api/examples').then((e) => { setExamples(e); setText(e.answers[0]?.text || ''); setRepo(e.repos[0] || ''); });
  }, []);
  useEffect(() => { if (tab === 'history') api('/api/reports').then(setHistory); }, [tab]);

  const run = async (path, body) => {
    setError('');
    setReport(null);
    setBusy(Date.now());
    try {
      setReport(await api(path, { method: 'POST', body: { ...body, simulateOutage: outage } }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };
  const watch = (id) => api(`/api/reports/${id}/watch`, { method: 'POST' });
  const tabs = useMemo(() => [['check', 'Check an answer'], ['scan', 'Scan a repo'], ['watch', 'Watch'], ['history', 'History']], []);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">L</span>
          <div><h1>LumaSuri</h1><p>Best-before dates for AI-written claims</p></div>
        </div>
        <div className="health">
          <span className={`chip ${health?.bifrost ? 'ok' : 'bad'}`}>Bifrost {health?.bifrost ? 'online' : 'offline'}</span>
          <span className="chip ok">Tavily {health?.tavily || '…'}</span>
          <label className={`chip toggle ${outage ? 'bad' : ''}`}><input type="checkbox" checked={outage} onChange={(e) => setOutage(e.target.checked)} /> Simulate provider outage</label>
        </div>
      </header>
      <nav className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>

      {tab === 'check' && (
        <section className="card input">
          <div className="examples">Examples: {examples.answers.map((a) => <button key={a.id} className="ghost small" onClick={() => setText(a.text)}>{a.id.replace(/^\d+-|\.md$/g, '')}</button>)}</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Paste an answer from ChatGPT, Gemini, Copilot…" />
          <button disabled={!!busy || !text.trim()} onClick={() => run('/api/check', { text })}>{busy ? 'Checking…' : 'Check freshness'}</button>
        </section>
      )}
      {tab === 'scan' && (
        <section className="card input">
          <p className="muted">Scans README/docs, code comments and package.json pins. CLI: <code>npx lumasuri scan .</code></p>
          <select value={repo} onChange={(e) => setRepo(e.target.value)}>{examples.repos.map((r) => <option key={r}>{r}</option>)}</select>
          <button disabled={!!busy} onClick={() => run('/api/scan', { repo })}>{busy ? 'Scanning…' : 'Scan repository'}</button>
        </section>
      )}
      {tab === 'watch' && <Watch outage={outage} />}
      {tab === 'history' && (
        <section className="card">
          <h3>Past reports</h3>
          {history.map((h) => (
            <p key={h.id} className="hist"><button className="ghost small" onClick={async () => { setReport(await api(`/api/reports/${h.id}`)); setTab(h.kind === 'repo' ? 'scan' : 'check'); }}>Open</button> <b>{h.summary.score}</b> {h.title} <span className="muted">· {h.claimCount} claims · {new Date(h.createdAt).toLocaleString()}</span></p>
          ))}
        </section>
      )}

      {busy && (tab === 'check' || tab === 'scan') && <Progress start={busy} />}
      {error && <p className="card error">{error}</p>}
      {report && (tab === 'check' || tab === 'scan') && <Report r={report} onWatch={watch} />}
      <footer className="foot">Built for the Global AI Hackathon · Problem Statement 06 · Tavily + Bifrost</footer>
    </div>
  );
}
