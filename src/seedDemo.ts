// Demo seed data for TeamYou v2 — the "Increase AI agent upgrades" reference
// narrative, carried all the way from Frame the problem through a Verified
// build, so a fresh install shows the complete product loop working end to
// end rather than a mid-flow snapshot.
import {
  emptySpec,
  type ActivityEvent,
  type ActivitySpecRef,
  type FlowStep,
  type Message,
  type Spec,
  type WorkItem,
} from "./types";
import type { StoredDoc } from "./store";

const WORKING_BUILD_ARTIFACT_ID = "art-3";

// A small inline mockup so the Review workspace's pixel-anchored comments
// (click the image to drop a pin) have something real to demonstrate against
// — no external asset pipeline needed.
const TRUST_FIRST_THUMBNAIL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
  <rect width="400" height="260" fill="#F5F4F2"/>
  <rect x="40" y="24" width="320" height="212" rx="14" fill="#FFFFFF" stroke="#E5E1DB"/>
  <text x="200" y="58" text-anchor="middle" font-family="Arial" font-size="15" font-weight="700" fill="#171412">Let your agent finish this import</text>
  <rect x="64" y="80" width="272" height="28" rx="8" fill="#F7F6F4"/>
  <circle cx="80" cy="94" r="4" fill="#1570EF"/>
  <text x="94" y="98" font-family="Arial" font-size="11" fill="#57534E">Review 10 proposed tags first</text>
  <rect x="64" y="116" width="272" height="28" rx="8" fill="#F7F6F4"/>
  <circle cx="80" cy="130" r="4" fill="#1570EF"/>
  <text x="94" y="134" font-family="Arial" font-size="11" fill="#57534E">You stay in control</text>
  <rect x="64" y="152" width="272" height="28" rx="8" fill="#F7F6F4"/>
  <circle cx="80" cy="166" r="4" fill="#1570EF"/>
  <text x="94" y="170" font-family="Arial" font-size="11" fill="#57534E">Nothing changes until you approve</text>
  <rect x="64" y="196" width="140" height="28" rx="14" fill="#171412"/>
  <text x="134" y="214" text-anchor="middle" font-family="Arial" font-size="11" font-weight="600" fill="#FFFFFF">Start 14-day trial</text>
  <rect x="212" y="196" width="124" height="28" rx="14" fill="#FFFFFF" stroke="#D7D3CD"/>
  <text x="274" y="214" text-anchor="middle" font-family="Arial" font-size="11" fill="#57534E">Maybe later</text>
</svg>`);

const AGENT_UPGRADES_SPEC: Spec = {
  brief: {
    goal: "Increase upgrades to the AI agent.",
    productContext: "The agent can automate repetitive manual tasks.",
    user: "Sales reps",
    moment: "Immediately after importing a new lead list",
    task: "Tagging and cleanup",
    rootCause: "Reps need visibility and control over routing decisions before handing tagging to the agent.",
    problem:
      "Sales reps need the efficiency of automated tagging without losing visibility and control over routing decisions.",
    scopeIncluded: "Post-import modal that introduces agent-assisted tagging with review and approval.",
    scopeExcluded: "Changes to the broader tagging workflow or other agent tasks.",
    keyDecisions: [
      "Reps don't need to do every tag themselves — they need visibility and control over the routing decision.",
      "Scope limited to the post-import modal for this iteration.",
      "Post-approval shows an applied/success state inside the modal before closing — not an instant toast-and-dismiss.",
    ],
    openItems: [],
  },
  workflow: { steps: [] },
  rules: {
    acceptanceCriteria: [
      { id: "ac-1", text: "Rep can review the first 10 proposed tags before anything is applied.", status: "met" },
      { id: "ac-2", text: "Rep can approve or edit each proposed tag.", status: "met" },
      { id: "ac-3", text: "Nothing is applied until the rep explicitly approves the batch.", status: "met" },
    ],
    todos: [],
  },
  review: {},
  decisions: [
    {
      id: "dec-1",
      text: "Root cause is visibility/control, not accuracy distrust.",
      rationale: "Reps prefer manual tagging because doing it themselves helps them understand lead routing — that points to control, not a trust gap in the agent's accuracy.",
      step: "find_root_cause",
      source: "coach",
      createdAt: "2026-07-06T09:13:00.000Z",
      status: "active",
    },
    {
      id: "dec-2",
      text: "Scope limited to tagging only for this iteration.",
      rationale: "Root cause evidence only supports tagging; broader capabilities aren't yet justified.",
      step: "set_scope",
      source: "coach",
      createdAt: "2026-07-06T11:40:00.000Z",
      status: "active",
    },
    {
      id: "dec-3",
      text: "After approval, the modal shows an applied/success state before closing (not an instant toast-and-dismiss).",
      rationale: "Gives the rep a clear confirmation moment inside the flow they just controlled — consistent with the trust/control frame, not just a background action.",
      step: "prepare_handoff",
      source: "coach",
      createdAt: "2026-07-11T09:30:00.000Z",
      status: "active",
    },
  ],
  openQuestions: [],
  evidence: [
    { id: "ev-1", kind: "fact", text: "32.4K imports/month", step: "assess_evidence" },
    { id: "ev-2", kind: "fact", text: "92% manually tagged", step: "assess_evidence" },
    { id: "ev-3", kind: "fact", text: "13% try the agent", step: "assess_evidence" },
    { id: "ev-4", kind: "fact", text: "6.3% upgrade", step: "assess_evidence" },
    { id: "ev-5", kind: "assumption", text: "Reps are open to automation if it's valuable and easy.", step: "assess_evidence" },
    { id: "ev-6", kind: "risk", text: "Users may fall further behind as the AI experience becomes more capable and complex.", step: "assess_evidence" },
  ],
  outcome: {
    userOutcome: "Reps trust the agent enough to hand off tagging while retaining control.",
    businessOutcome: "More reps try the agent and ultimately upgrade.",
  },
  evidenceBrief: {
    title: "Opportunity brief",
    source: "lead_import_adoption.xlsx",
    summary: "Sales reps frequently tag imported leads manually but very few try or upgrade to the AI agent.",
    stats: [
      { label: "Monthly lead imports", value: "32.4k" },
      { label: "Manual tagging rate", value: "92%" },
      { label: "Agent try rate", value: "13%" },
      { label: "Upgrade rate", value: "6.3%" },
    ],
    funnel: [
      { label: "Import", value: 32400 },
      { label: "Manual tagging", value: 29800 },
      { label: "Agent shown", value: 18200 },
      { label: "Tried", value: 4200 },
      { label: "Upgraded", value: 2000 },
    ],
    strength: "moderate",
  },
  milestoneArtifacts: [
    {
      id: "art-1",
      kind: "pattern_shortlist",
      title: "Contextual offer",
      status: "selected",
      supportingLine: "Introduces the agent exactly when manual tagging begins and supports a low-commitment first try.",
      createdAt: "2026-07-07T10:00:00.000Z",
      step: "find_patterns",
    },
    {
      id: "art-2",
      kind: "hifi_design",
      title: "Trust-first",
      status: "approved_for_build",
      supportingLine: "Keeps control and review most prominent — best addresses the trust barrier.",
      thumbnailUrl: TRUST_FIRST_THUMBNAIL,
      createdAt: "2026-07-08T09:00:00.000Z",
      step: "refine_treatments",
    },
    {
      id: WORKING_BUILD_ARTIFACT_ID,
      kind: "working_build",
      title: "Trust-first tagging modal — build handoff",
      status: "verified",
      supportingLine: "7/7 reviews passed, 3/3 requirements verified, 0 critical issues.",
      createdAt: "2026-07-11T14:00:00.000Z",
      step: "build_in_tool",
    },
  ],
  buildHandoffs: [
    {
      id: "handoff-1",
      title: "Trust-first tagging modal — build handoff",
      status: "sent",
      designThumbnailUrl: TRUST_FIRST_THUMBNAIL,
      instructions: [
        {
          id: "instr-1",
          label: "Trigger",
          text: "Modal opens automatically immediately after a successful lead import that contains at least one lead.",
          rationale: "Empty-state confirmed not applicable — zero-lead imports cannot reach this modal.",
        },
        {
          id: "instr-2",
          label: "Content",
          text: "Show the first 10 proposed tags only, each with an approve and edit control.",
          rationale: "Acceptance criteria: rep can review the first 10 proposed tags before anything is applied.",
        },
        {
          id: "instr-3",
          label: "Apply behavior",
          text: "No tags are written/applied until the rep explicitly approves the batch.",
          rationale: "Acceptance criteria: nothing is applied until approval.",
        },
        {
          id: "instr-4",
          label: "Scope",
          text: "Surface tagging actions only — no follow-up writing, lead scoring, or other agent capabilities anywhere in this modal.",
          rationale: "Locked exclusion: changes to broader workflow or other agent tasks are out of scope for this iteration.",
        },
        {
          id: "instr-5",
          label: "Post-approval state",
          text: "After approval, show an applied/success state inside the modal, then close — not an instant toast-and-dismiss.",
          rationale: "Decision: confirmation moment reinforces rep control and visibility.",
        },
      ],
      unresolvedDecisionCount: 0,
      createdAt: "2026-07-11T09:35:00.000Z",
    },
  ],
  workingBuild: {
    buildUrl: "https://eventmate-preview.example.com/imports",
    status: "ready",
    reviewsStarted: 7,
    reviewsPassed: 7,
    totalReviewCategories: 7,
  },
  reviewFindings: [
    {
      id: "find-1",
      artifactId: WORKING_BUILD_ARTIFACT_ID,
      category: "problem_alignment",
      severity: "minor",
      finding: "Build surfaces review/approve controls prominently, consistent with the locked root cause of visibility and control.",
      evidence: "dec-1: root cause is visibility/control, not accuracy distrust.",
      impact: "None — aligned, noted for the record.",
      expectedCorrection: "No correction needed.",
      relatedCriterion: "dec-1",
      status: "accepted_limitation",
    },
    {
      id: "find-2",
      artifactId: WORKING_BUILD_ARTIFACT_ID,
      category: "acceptance_criteria",
      severity: "minor",
      finding: "First-10 preview and approve/edit controls confirmed working against the live build.",
      evidence: "ac-1, ac-2: rep can review and edit the first 10 proposed tags.",
      impact: "None — criteria satisfied.",
      expectedCorrection: "No correction needed.",
      relatedCriterion: "ac-1",
      status: "resolved",
    },
  ],
  commentThreads: [
    {
      id: "thread-1",
      artifactId: "art-2",
      anchor: null,
      status: "resolved",
      createdAt: "2026-07-08T10:00:00.000Z",
      messages: [
        {
          id: "thread-1-msg-1",
          role: "user",
          text: "Does this treatment handle the empty-state case?",
          createdAt: "2026-07-08T10:00:00.000Z",
        },
        {
          id: "thread-1-msg-2",
          role: "coach",
          text: "No empty-state has been defined for Trust-first yet. Confirmed not applicable — the modal only ever opens after a successful import with at least one lead, so a zero-lead import can't reach it.",
          createdAt: "2026-07-08T10:01:00.000Z",
        },
      ],
    },
    {
      id: "thread-2",
      artifactId: "art-2",
      anchor: { xPct: 33.5, yPct: 80.5 },
      status: "open",
      createdAt: "2026-07-08T11:00:00.000Z",
      messages: [
        {
          id: "thread-2-msg-1",
          role: "user",
          text: "Should this button say \"Start 14-day trial\" or just \"Try it\"? Want to keep the commitment low.",
          createdAt: "2026-07-08T11:00:00.000Z",
        },
      ],
    },
  ],
  verification: {
    buildId: WORKING_BUILD_ARTIFACT_ID,
    reviewsPassed: 7,
    reviewsTotal: 7,
    requirementsVerified: 3,
    requirementsTotal: 3,
    criticalIssues: 0,
    findings: [],
    status: "verified",
  },
  completeness: 1,
};

// Bump when the seed content changes so stores re-seed.
export const SEED_VERSION = 11;
export const SEED_DOC_IDS = ["spec-ai-agent-upgrades", "spec-new-request"];
// Retired earlier seed docs — removed on migration.
export const LEGACY_SEED_IDS = [
  "demo-calendar-seed",
  "spec-invoicing-agent",
  "spec-case-study-end-pill",
  "spec-review-feedback-loop",
];

const PROJECT = { id: "project-teamyou", name: "TeamYou", type: "AI product spec-tracking app" };

const SPEC_AGENT_UPGRADES: ActivitySpecRef = {
  id: "spec-ai-agent-upgrades",
  name: "Increase AI agent upgrades",
  type: "feature spec",
};

const TARGET = { kind: "spec" as const, id: "spec-ai-agent-upgrades", label: "Increase AI agent upgrades" };

export const SEED_ACTIVITY: ActivityEvent[] = [
  {
    id: "evt-1",
    type: "brief_updated",
    importance: "normal",
    label: "Captured goal & product context",
    createdAt: "2026-07-06T09:12:00.000Z",
    project: PROJECT,
    spec: SPEC_AGENT_UPGRADES,
    target: TARGET,
  },
  {
    id: "evt-2",
    type: "decision_captured",
    importance: "significant",
    label: "Root cause is visibility/control, not accuracy distrust",
    createdAt: "2026-07-06T09:13:00.000Z",
    project: PROJECT,
    spec: SPEC_AGENT_UPGRADES,
    target: TARGET,
  },
  {
    id: "evt-3",
    type: "evidence_captured",
    importance: "normal",
    label: "Captured import/tagging/upgrade funnel evidence",
    createdAt: "2026-07-06T09:20:00.000Z",
    project: PROJECT,
    spec: SPEC_AGENT_UPGRADES,
    target: TARGET,
  },
  {
    id: "evt-4",
    type: "step_changed",
    importance: "milestone",
    label: "Frame the problem complete",
    createdAt: "2026-07-06T11:45:00.000Z",
    project: PROJECT,
    spec: SPEC_AGENT_UPGRADES,
    target: TARGET,
  },
  {
    id: "evt-5",
    type: "milestone_captured",
    importance: "milestone",
    label: "Selected pattern: Contextual offer",
    createdAt: "2026-07-07T10:00:00.000Z",
    project: PROJECT,
    spec: SPEC_AGENT_UPGRADES,
    target: TARGET,
  },
  {
    id: "evt-6",
    type: "milestone_captured",
    importance: "milestone",
    label: "Treatment approved for build: Trust-first",
    createdAt: "2026-07-08T09:00:00.000Z",
    project: PROJECT,
    spec: SPEC_AGENT_UPGRADES,
    target: TARGET,
  },
  {
    id: "evt-7",
    type: "handoff_ready",
    importance: "milestone",
    label: "Build handoff ready — Trust-first tagging modal",
    createdAt: "2026-07-11T09:35:00.000Z",
    project: PROJECT,
    spec: SPEC_AGENT_UPGRADES,
    target: TARGET,
  },
  {
    id: "evt-8",
    type: "build_linked",
    importance: "normal",
    label: "Working build URL attached",
    createdAt: "2026-07-11T13:00:00.000Z",
    project: PROJECT,
    spec: SPEC_AGENT_UPGRADES,
    target: TARGET,
  },
  {
    id: "evt-9",
    type: "review_run",
    importance: "significant",
    label: "Working build review: 7/7 categories passed",
    createdAt: "2026-07-11T13:20:00.000Z",
    project: PROJECT,
    spec: SPEC_AGENT_UPGRADES,
    target: TARGET,
  },
  {
    id: "evt-10",
    type: "verification_completed",
    importance: "milestone",
    label: "Build verified — 3/3 requirements, 0 critical issues",
    createdAt: "2026-07-11T14:10:00.000Z",
    project: PROJECT,
    spec: SPEC_AGENT_UPGRADES,
    target: TARGET,
  },
];

const AGENT_UPGRADES_MESSAGES: Message[] = [
  {
    id: "msg-1",
    role: "system",
    content: "Problem framing started",
    createdAt: "2026-07-06T09:10:00.000Z",
  },
  {
    id: "msg-2",
    role: "user",
    content: "We need more users upgrading to our AI agent.",
    createdAt: "2026-07-06T09:11:00.000Z",
  },
  {
    id: "msg-3",
    role: "coach",
    content: "Got it — I've captured the goal.\n\nWhat does the AI agent help users accomplish?",
    createdAt: "2026-07-06T09:12:00.000Z",
  },
  {
    id: "msg-4",
    role: "user",
    content: "It can automate repetitive manual tasks.",
    createdAt: "2026-07-06T09:12:30.000Z",
  },
  {
    id: "msg-5",
    role: "coach",
    content:
      "We now understand both the business goal and the agent's core capability.\n\nWhich users are completing these repetitive tasks, and when do they encounter them?",
    createdAt: "2026-07-06T09:13:00.000Z",
  },
  {
    id: "msg-6",
    role: "system",
    content: "Design the solution started",
    createdAt: "2026-07-08T09:00:00.000Z",
  },
  {
    id: "msg-7",
    role: "user",
    content: "Trust-first passed review and is approved. Let's move to build.",
    createdAt: "2026-07-11T09:20:00.000Z",
  },
  {
    id: "msg-8",
    role: "coach",
    content:
      "**Decision locked** — the modal shows an applied/success state before closing, rather than an instant toast-and-dismiss.\n\nWith that resolved, no unresolved implementation decisions remain. I'm drafting the build handoff now with the first instructions.",
    createdAt: "2026-07-11T09:30:00.000Z",
  },
  {
    id: "msg-9",
    role: "system",
    content: "Prepare the build handoff started",
    createdAt: "2026-07-11T09:31:00.000Z",
  },
  {
    id: "msg-10",
    role: "user",
    content: "Sent it to Claude to build.",
    createdAt: "2026-07-11T09:36:00.000Z",
  },
  {
    id: "msg-11",
    role: "coach",
    content:
      "Sent — status updated to reflect the handoff went out.\n\nNext step is reviewing the working build once it comes back: I'll check it against the locked acceptance criteria, the scope exclusion, and the post-approval success state decision.",
    createdAt: "2026-07-11T09:36:30.000Z",
  },
  {
    id: "msg-12",
    role: "system",
    content: "Build in your tool started",
    createdAt: "2026-07-11T09:37:00.000Z",
  },
  {
    id: "msg-13",
    role: "user",
    content: "The working build passed all 7 review categories. Let's move to verification.",
    createdAt: "2026-07-11T14:05:00.000Z",
  },
  {
    id: "msg-14",
    role: "coach",
    content:
      "That confirms the decision and closes out the last unreviewed finding — the build matches what was locked, not just what was intended.\n\n**Requirements verified: 3/3. No blockers remain.** This is ready for you to mark the build Verified whenever you're satisfied — that's your call to make, not mine.",
    createdAt: "2026-07-11T14:10:00.000Z",
  },
];

type SpecMeta = {
  ref: ActivitySpecRef;
  step: FlowStep;
  type: WorkItem["type"];
  status: WorkItem["status"];
  spec: Spec;
  messages: Message[];
  title?: string;
};

const SPEC_META: Record<string, SpecMeta> = {
  "spec-ai-agent-upgrades": {
    ref: SPEC_AGENT_UPGRADES,
    step: "verify_build",
    type: "feature_spec",
    status: "complete",
    spec: AGENT_UPGRADES_SPEC,
    messages: AGENT_UPGRADES_MESSAGES,
    title: "Increase AI agent upgrades",
  },
  "spec-new-request": {
    ref: { id: "spec-new-request", name: "New request", type: "feature spec" },
    step: "understand_request",
    type: "feature_spec",
    status: "drafting",
    spec: emptySpec(),
    messages: [],
  },
};

// Group the flat activity feed into one saved doc per spec.
export function buildSeedDocs(): StoredDoc[] {
  return SEED_DOC_IDS.map((specId) => {
    const meta = SPEC_META[specId];
    const activity = SEED_ACTIVITY.filter((e) => e.spec?.id === specId).sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : 1,
    );
    const first = activity[0]?.createdAt ?? "2026-07-06T09:00:00.000Z";
    const last = activity[activity.length - 1]?.createdAt ?? first;
    const item: WorkItem = {
      id: specId,
      title: meta.title ?? meta.ref.name,
      type: meta.type,
      workMode: "fast_spec",
      status: meta.status,
      currentStep: meta.step,
      messages: meta.messages,
      spec: meta.spec,
      activity,
      createdAt: first,
      updatedAt: last,
    };
    return { item, guide: null };
  });
}
