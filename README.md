# TeamYou

TeamYou is an AI coaching and decision-record workspace for product and design work. The Coach keeps the conversation moving one decision at a time, while the Guide preserves the detailed facts, assumptions, risks, decisions, unresolved needs, artifacts, and rationale.

> Core principle: **The chat decides; the Guide remembers.**

## Product flow

The Guide follows four stages:

1. **Frame the problem**
   - Understand the request
   - Define the problem
   - Identify users and context
   - Assess evidence and urgency
   - Find the adoption barrier/root cause
   - Set the scope
   - Define the outcome
2. **Explore directions**
3. **Design the solution**
4. **Specify and build**

Normal coaching turns are intentionally concise. The Coach asks at most one decision-critical question, records non-blocking unknowns in the Guide, and advances when the current step has enough information. The Guide shows compact `Need` labels instead of duplicating conversational prompts.

## Current capabilities

- Multiple locally saved specs with automatic project-type and work-mode detection
- Persistent facts, assumptions, evidence, risks, decisions, open questions, todos, and rationale
- Pattern, wireframe, high-fidelity, build-handoff, working-build, and verified-result milestones
- Screenshot attachments linked to specs or todos
- Review workspace with checks, comments, threads, and artifact status
- Build handoff and verification states
- Deterministic coach-policy checks for step order, conversational drift, question limits, and response length
- Today dashboard and activity history

Saved specs use browser `localStorage`, so they survive refreshes on the same localhost origin. Image-heavy projects can exceed the browser storage limit; durable server-side storage is not implemented yet.

## Stack

- React + TypeScript + Vite
- Vitest
- Anthropic SDK through `api/coach.ts`
- Vercel-compatible serverless API handler

## Run locally

```bash
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env
npm run dev
```

Vite normally starts at [http://localhost:5173](http://localhost:5173). Use a fixed alternate port when needed:

```bash
npm run dev -- --port 5174 --strictPort
```

The API key is read server-side and is not bundled into the browser. `COACH_MODEL` can optionally override the default model. During pattern discovery, the Coach uses Anthropic web search to retrieve public visual references; TeamYou then captures those source pages through its same-origin `/api/pattern-thumbnail` endpoint so cards receive real screenshots without exposing a screenshot-service URL to the browser. Set `PATTERN_WEB_SEARCH=false` to disable reference retrieval.

## Verify

```bash
npm test
npm run build
```

## Important source files

```text
api/coach.ts              Coach request handling and policy retries
api/coachPrompt.ts        Canonical coaching instructions
api/replyStyle.ts         Concision and question-count checks
api/turnPolicy.ts         Step and Guide/coach ownership checks
src/types.ts              Flow, spec, artifact, and response contracts
src/merge.ts              Deterministic spec merge behavior
src/messageOrder.ts       Step-marker and coach-message ordering
src/store.ts              Local saved-spec persistence and migration
src/App.tsx               Application orchestration
src/components/           Chat, Guide, review, handoff, and dashboard UI
```

`DESIGN.md` documents the product method and visual design system. Design tokens live in `tokens/design-tokens.json` and `src/tokens.css`.
