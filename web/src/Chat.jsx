import { useEffect, useRef, useState } from 'react';

// A small on-page helper: answers questions about LumaSuri from a curated
// knowledge base, so it works instantly and even when the API is down.
const QA = [
  ['what lumasuri this app does do who', 'LumaSuri checks facts in AI answers and code for things that went stale — like saying "Node.js 18 is the LTS" when Node.js 26 is out. It verifies each fact against live sources, quotes the proof, and stamps every claim with a best-before date.'],
  ['how work check steps process run start use', 'Three easy steps: 1) paste an AI answer or pick a repo, 2) press Check — LumaSuri finds claims that can go stale and verifies them, 3) read a card per claim with what is true now, the quoted source, and a fix you can copy.'],
  ['live sources source verify true claim evidence quote', 'Each claim gets checked against real, live sources. Version questions go straight to official registries (npm, PyPI, nodejs.org, endoflife.date) for free. The rest are searched with Tavily, preferring official docs — and the judge must quote the exact sentence that proves it, or LumaSuri says unclear instead of guessing.'],
  ['fix copy correct update stale change', 'Out-of-date claims show a diff: the old line crossed out and the corrected line. Press "Copy the fix" on a card, or "Copy all fixes" in the summary to grab every correction at once.'],
  ['watch recheck re-check later expire monitor save', 'Press "Save to Watch" and each claim is checked again when its best-before date passes. Open the Watch tab, hit Re-check, and you will see what changed since it was saved — plus when the next check is due.'],
  ['best before date expiry fresh', 'Facts decay at different speeds, so every claim gets a best-before date — like a milk carton. Fast-moving facts (model versions) get short dates; stable history gets long ones.'],
  ['score freshness 100 ring verdict mean', 'The score (0–100) blends evidence support, recency, and how official the source is. 70+ still true, 40–69 getting old, below 40 out of date.'],
  ['bifrost gateway model llm ai', 'Every AI call goes through Bifrost, an LLM gateway. It picks the right model, caches repeats, enforces a token budget, and fails over to a backup if a provider dies.'],
  ['outage simulate fallback provider fail down', 'The "Simulate a provider outage" toggle breaks the main model on purpose, so you can watch Bifrost switch to a backup and the check still finish. The usage panel shows rerouted calls.'],
  ['cost token tokens free price cheap money pay', 'Mostly free! Version claims are settled by registries at zero tokens, saved results reuse the ledger for free, and a per-run budget caps AI spend. Only real searches + judging cost tokens.'],
  ['repo scan code repository comments github', 'The "Scan a repo" tab reads README, docs, code comments and package.json pins, then checks every claim the same way. On your own code: npx lumasuri scan .'],
  ['history reports past old previous', 'History keeps every report you ran, with its score ring. Click one to see the full cards again.'],
  ['workspace account login sign privacy data cookie', 'No accounts, passwords, or cookies. The optional workspace name just separates history and Watch lists in your browser. Keys stay on the server; reports live in a local database you can delete anytime.'],
  ['tavily search web', 'Tavily is the search engine LumaSuri uses to find live evidence. Queries prefer official sources, and publish dates feed the freshness score.'],
  ['who for market audience users', 'Teams shipping AI features, docs and repo maintainers, people pasting AI answers into tutorials — and anyone where a wrong answer costs money.'],
  ['demo video', 'The 1-minute demo video in the Demo section shows the whole flow: a check, its evidence and fixes, Watch, and History.'],
];

const INTRO = 'Hey there! I am the LumaSuri helper. Ask me anything — like "how does a check work?", "how do I copy a fix?" or "what is Watch?"';
const SUGGESTIONS = ['What is LumaSuri?', 'How does it check claims?', 'How do I copy a fix?', 'What does Watch re-check?', 'Is it free?'];
const FALLBACK = 'Hmm, that one is beyond me — I only know LumaSuri. Try asking about how a check works, live sources, the score, fixes, Watch, repo scans, Bifrost, or privacy.';
const GREETS = /^(hi|hii+|hello|hey|yo|sup|hola|good\s?(morning|afternoon|evening)|howdy)[!.\s]*$/i;
const THANKS = /thank|thx|ty|nice|cool|great|awesome/i;
const BYE = /^(bye|goodbye|see you|gtg|later|ciao)[!.\s]*$/i;

function answer(raw) {
  const q = raw.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (GREETS.test(q)) return 'Hello! Happy to help — ask me anything about LumaSuri, or tap a question below.';
  if (BYE.test(q)) return 'Bye for now! Holler if a claim goes stale on you.';
  if (THANKS.test(q)) return 'Anytime! Anything else you would like to know about LumaSuri?';
  if (q === 'ok' || q === 'okay' || q === 'kk' || q === 'sure') return 'Cool! Ask away whenever you are curious.';
  const STOP = new Set('what is it the a an of for and or does do can i me you my your how who when where why to in on this that'.split(' '));
  const q2 = q.replace(/re check/g, 'recheck');
  const words = new Set(q2.split(' ').filter((w) => !STOP.has(w)));
  const q3 = [...words].join(' ');
  let best = null, bestScore = 0;
  for (const [keys, a] of QA) {
    const score = keys.split(' ').filter((k) => words.has(k) || q3.includes(k)).length;
    if (score > bestScore) { best = a; bestScore = score; }
  }
  return bestScore >= 1 ? best : FALLBACK;
}

export default function Chat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ who: 'bot', text: INTRO }]);
  const [input, setInput] = useState('');
  const logRef = useRef(null);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [msgs, open]);
  const send = (q) => {
    const text = (q ?? input).trim();
    if (!text) return;
    const userMsg = { who: 'user', text };
    setMsgs((m) => [...m, userMsg]);
    setInput('');
    setTimeout(() => setMsgs((m) => [...m, { who: 'bot', text: answer(text) }]), 350);
  };
  return (
    <>
      <button className="chat-fab" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close help chat' : 'Open help chat'}>
        {open ? '×' : <img src="/mascot.png" alt="LumaSuri helper" />}
      </button>
      {open && (
        <div className="chat-box" role="dialog" aria-label="LumaSuri helper">
          <div className="chat-head">
            <img src="/mascot.png" alt="" /><b>Ask me about LumaSuri</b>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">×</button>
          </div>
          <div className="chat-log" ref={logRef}>
            {msgs.map((m, i) => <p key={i} className={`chat-msg ${m.who}`}>{m.text}</p>)}
            {(
              <div className="chat-sugs">
                {SUGGESTIONS.map((s) => <button key={s} className="chat-sug" onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
          </div>
          <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" aria-label="Ask a question" />
            <button className="btn small" type="submit">Send</button>
          </form>
        </div>
      )}
    </>
  );
}
