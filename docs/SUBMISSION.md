# HackCulture submission: LumaSuri

**Project name:** LumaSuri
**Participant:** Diosa Ella Oliver ([@dioxaaa](https://github.com/dioxaaa)), individual participant (solo)
**Tagline:** Best-before dates for AI-written claims.
**Primary theme:** Problem Statement 06: Build a Stale-Answer Detector for AI Applications (Tavily + Bifrost)
**Repository:** https://github.com/dioxaaa/lumasuri
**Pitch deck:** `docs/deck/LumaSuri-pitch.pdf` (also `.pptx`)
**Demo video:** `docs/video/LumaSuri-demo.mp4`

## Short description

LumaSuri finds the time-sensitive claims in AI answers and whole repositories (READMEs, docs, code comments, package.json pins). It verifies each claim against live sources using Tavily and Bifrost. Each claim gets three things:
- a freshness score backed by a quoted source sentence
- a best-before date based on how fast that kind of fact changes and on the source's real release cadence
- a one-line fix diff when the claim is out of date

LumaSuri Watch re-checks saved claims when they expire and shows what changed.

## Why LumaSuri

AI assistants answer with facts frozen at training time — versions, prices, model names, APIs, leadership. Those answers get pasted into READMEs, tutorials, code comments and production bots, and nobody checks them again. "Use Node 18 LTS" was correct advice that now yields outdated, broken setups. Dependencies have Dependabot and Renovate; facts in text have nothing.

LumaSuri treats correctness the way food packaging treats freshness: not binary, but decaying. Every claim gets a best-before date, verified only against quotes that actually appear in live sources, dated by how fast that kind of fact changes, and re-checked on schedule. And it stays cheap: version claims are settled by registries at zero tokens, so model spend only goes where it's needed.

## Who it's for

- **Developers and teams shipping AI features.** Anyone whose product answers with an LLM — chatbots, copilots, RAG assistants — has answers that quietly go stale. The guard proxy (`/v1/chat/completions`) drops into an existing OpenAI-style integration and attaches a freshness report to every reply.
- **Docs and repo maintainers.** READMEs, code comments and package.json pins copied from AI answers rot silently. `lumasuri scan` plus the `--fail-under` CI check catches them like a Dependabot for facts.
- **Everyday AI users and learners.** People who paste a ChatGPT/Gemini answer into a tutorial or starter project and hit broken installs because "current LTS" moved on.
- **Teams where wrong answers cost money.** Support, pricing and policy bots that must not repeat last year's numbers; Watch re-checks the saved claims on schedule.

## How Tavily is used

- Advanced search, limited to the vendor's official domains (`include_domains`), with an open-web fallback.
- `chunks_per_source` gives the judge model clean evidence it can quote.
- Publish dates feed the recency part of the freshness score.

## How Bifrost is used

- All LLM calls go through Bifrost.
- Separate models are routed for claim extraction and for the verdict.
- Every request carries a fallback chain. A live "simulate provider outage" toggle shows the failover.
- Exact-match cache on Redis.
- Virtual key with a daily budget and a token rate limit.
- The UI reports per-call routing, cache and fallback metadata.

## What's novel

- Best-before dates calculated from real release cadence.
- Longitudinal re-checking (Watch) that shows what changed since the last check.
- Evidence lock: a verdict is rejected if its quote isn't really in the source.
- Zero-token registry path (npm, PyPI, nodejs.org, endoflife.date).
- Cross-repo claim ledger.

## Results

- 87.5% accuracy on 16 labeled claims, using a local 3B model.
- 10 of the 16 claims settled with zero LLM tokens.
- 7 stale claims and 7 fixes found in the demo repo, using 3 LLM calls.

## AI tools used

Devin (Cognition) assisted with code, docs and pitch materials. The runtime uses Qwen 2.5 via Ollama, routed through Bifrost.
