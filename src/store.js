import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

export function openStore(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, kind TEXT, title TEXT, created_at TEXT, json TEXT);
    CREATE TABLE IF NOT EXISTS ledger (hash TEXT PRIMARY KEY, best_before TEXT, json TEXT);
    CREATE TABLE IF NOT EXISTS watch (
      id TEXT PRIMARY KEY, report_id TEXT, hash TEXT, claim_json TEXT, best_before TEXT,
      verdict TEXT, score INTEGER, checked_at TEXT, history_json TEXT DEFAULT '[]', UNIQUE(report_id, hash, claim_json)
    );
  `);
  for (const t of ['reports', 'watch']) {
    if (!db.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === 'workspace')) db.exec(`ALTER TABLE ${t} ADD COLUMN workspace TEXT DEFAULT 'public'`);
  }
  const id = () => crypto.randomBytes(5).toString('hex');

  const ledger = {
    get(hash) {
      const row = db.prepare('SELECT json FROM ledger WHERE hash = ?').get(hash);
      return row ? JSON.parse(row.json) : null;
    },
    put(hash, claim) {
      db.prepare('INSERT OR REPLACE INTO ledger (hash, best_before, json) VALUES (?, ?, ?)').run(hash, claim.bestBefore.date, JSON.stringify(claim));
    },
    count() {
      return db.prepare('SELECT COUNT(*) n FROM ledger').get().n;
    },
  };

  function saveReport(report, ws = 'public') {
    const rid = report.id || id();
    const full = { ...report, id: rid };
    db.prepare('INSERT OR REPLACE INTO reports (id, kind, title, created_at, json, workspace) VALUES (?, ?, ?, ?, ?, ?)').run(rid, report.kind, report.title, report.createdAt, JSON.stringify(full), ws);
    return full;
  }

  const getReport = (rid) => {
    const row = db.prepare('SELECT json FROM reports WHERE id = ?').get(rid);
    return row ? JSON.parse(row.json) : null;
  };

  const listReports = (ws = 'public') =>
    db.prepare('SELECT json FROM reports WHERE workspace = ? ORDER BY created_at DESC LIMIT 50').all(ws).map((r) => {
      const { claims, input, ...rest } = JSON.parse(r.json);
      return { ...rest, claimCount: claims.length };
    });

  function watchReport(report, ws = 'public') {
    const ins = db.prepare(`INSERT OR IGNORE INTO watch (id, report_id, hash, claim_json, best_before, verdict, score, checked_at, history_json, workspace)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    let added = 0;
    for (const c of report.claims) {
      const claim = { text: c.text, category: c.category, subject: c.subject, value: c.value, package: c.package, ecosystem: c.ecosystem, file: c.file, line: c.line, sourceLine: c.sourceLine };
      const hist = JSON.stringify([{ at: c.checkedAt, verdict: c.verdict, score: c.score, currentValue: c.currentValue || null }]);
      added += ins.run(id(), report.id, c.hash, JSON.stringify(claim), c.bestBefore.date, c.verdict, c.score, c.checkedAt, hist, ws).changes;
    }
    return added;
  }

  function listWatch(ws = 'public') {
    return db.prepare('SELECT w.*, r.title FROM watch w LEFT JOIN reports r ON r.id = w.report_id WHERE w.workspace = ? ORDER BY best_before ASC').all(ws).map((w) => ({
      id: w.id,
      reportId: w.report_id,
      reportTitle: w.title,
      claim: JSON.parse(w.claim_json),
      bestBefore: w.best_before,
      verdict: w.verdict,
      score: w.score,
      checkedAt: w.checked_at,
      history: JSON.parse(w.history_json),
      due: new Date(w.best_before).getTime() <= Date.now(),
    }));
  }

  function updateWatch(wid, verified) {
    const row = db.prepare('SELECT history_json FROM watch WHERE id = ?').get(wid);
    const history = [...JSON.parse(row.history_json), { at: verified.checkedAt, verdict: verified.verdict, score: verified.score, currentValue: verified.currentValue || null }];
    db.prepare('UPDATE watch SET best_before = ?, verdict = ?, score = ?, checked_at = ?, history_json = ? WHERE id = ?').run(verified.bestBefore.date, verified.verdict, verified.score, verified.checkedAt, JSON.stringify(history), wid);
  }

  const expireWatch = (wid) => db.prepare("UPDATE watch SET best_before = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), wid);
  const removeWatch = (wid) => db.prepare('DELETE FROM watch WHERE id = ?').run(wid);

  return { db, ledger, saveReport, getReport, listReports, watchReport, listWatch, updateWatch, expireWatch, removeWatch };
}

// Re-verify every due watch item and return what changed since its last check.
export async function runWatch(store, engine, { ids, simulateOutage, workspace } = {}) {
  const items = store.listWatch(workspace).filter((w) => (ids ? ids.includes(w.id) : w.due));
  if (!items.length) return { checked: 0, changes: [], usage: null };
  const { claims, usage } = await engine.verifyClaims(items.map((w) => w.claim), { simulateOutage });
  const changes = items.map((w, i) => {
    const now = claims[i];
    store.updateWatch(w.id, now);
    return {
      id: w.id,
      text: w.claim.text,
      before: { verdict: w.verdict, score: w.score, at: w.checkedAt },
      after: { verdict: now.verdict, score: now.score, at: now.checkedAt, currentValue: now.currentValue, bestBefore: now.bestBefore },
      changed: w.verdict !== now.verdict,
      fix: now.fix,
      reason: now.reason,
    };
  });
  return { checked: items.length, changes, usage };
}
