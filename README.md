# TeamYou — v1

A user chats with an AI **Coach**. Each turn, the Coach returns a conversational
reply plus structured data. The app merges that structured data into a **Spec**
and updates a **Guide** panel. The conversation becomes a reviewable spec:
**Brief → Workflow → Rules → Review**.

> Thesis: structure and enforcement ("spine and teeth"). The chat is the input
> stream, not the product. The spec is the product.

## What's built (v1 scope)

1. One modal, **Work** tab. User message → `/api/coach` → real Coach reply in chat.
   The Coach enforces the Brief → Workflow → Rules → Review progression.
2. **Guide panel** (right) that updates as the conversation captures intent —
   active step + what's been filled in.
3. Conversation **becomes a spec** — a Summary + Key Decisions view rendered from
   merged spec state.

Out of scope (types may exist, nothing renders): Today dashboard, streaks,
activity-feed UI, process-map rendering, Review submissions/findings, Artifacts,
multiple Projects, workflow branches, team features, notifications, analytics.

## Stack

- React + TypeScript + Vite.
- One serverless function at `api/coach.ts` holds the Anthropic API key and
  proxies the call (model: `claude-sonnet-5`). In dev, a small Vite middleware
  (`vite.config.ts`) mounts the same handler at `POST /api/coach`, so
  `npm run dev` proves the full round-trip in one process. In production the
  file in `api/` deploys as a serverless function (e.g. Vercel).

## Getting started

```bash
npm install
cp .env.example .env      # add your ANTHROPIC_API_KEY
npm run dev               # http://localhost:5173
```

## The three rules that make the contract safe

- **Rule 1** — `activeStep` lives at the top level of `CoachTurnResponse` only.
  The Guide panel reads the step from there (`src/components/GuidePanel.tsx`).
- **Rule 2** — The client is the ID authority. The Coach proposes items with no
  `id`; `src/merge.ts` assigns stable IDs on merge and resolves
  `linkedAcceptanceCriterionRef` → the real criterion `id`.
- **Rule 3** — Explicit merge semantics (`src/merge.ts`): scalars overwrite,
  arrays append, `activityEvents` append.

`src/merge.ts` and the `CoachTurnResponse` type in `src/types.ts` are the two
most safety-critical spots. They have unit tests:

```bash
npm test
```

If the Coach's output doesn't parse as valid JSON, the server fails **loudly**
(HTTP 502 with the raw output), and the chat surfaces it — so prompt failures
are visible early.

## Layout

```
api/
  coach.ts        # serverless handler + runCoach() core
  coachPrompt.ts  # Coach system prompt (two-phase posture + JSON discipline)
src/
  types.ts        # data model + CoachTurnResponse contract
  merge.ts        # Rule 3 merge + Rule 2 id assignment  (+ merge.test.ts)
  coachClient.ts  # POST /api/coach
  App.tsx         # orchestration: turn → merge → render
  components/     # Modal, ChatPanel, GuidePanel, SpecView
```
