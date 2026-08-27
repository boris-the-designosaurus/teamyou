// ─────────────────────────────────────────────────────────────────────────
// TeamYou v2 — Data model + Coach response contract.
// This file is the single source of truth for shape. Do not widen beyond the
// build spec (TEAMYOU_SOURCE_OF_TRUTH.md / COACH_BEHAVIOR_SPEC.md /
// CURRENT_UPDATE_SPEC.md). The product loop has four top-level stages —
// Frame the problem, Explore directions, Design the solution, Specify and
// build — each broken into ordered FlowSteps (see below). "Verify" is the
// last FlowStep of Specify and build, not its own top-level stage; "Record"
// isn't a step at all — the Guide (this data, rendered) IS the record.
// ─────────────────────────────────────────────────────────────────────────

export type WorkItemType =
  | "feature_spec"
  | "agent_spec"
  | "design_project"
  | "case_study"
  | "presentation";

// Work mode = the PROCESS the Coach runs (what to ask, when to push back, what
// to capture), orthogonal to the flow spine and to WorkItemType. Inferred
// from the first message; user-switchable.
export type WorkMode =
  | "fast_spec"
  | "design_exploration"
  | "workflow_mapping"
  | "agent_spec"
  | "review_critique";

export const WORK_MODES: WorkMode[] = [
  "fast_spec",
  "design_exploration",
  "workflow_mapping",
  "agent_spec",
  "review_critique",
];

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  fast_spec: "Fast Spec",
  design_exploration: "Design Exploration",
  workflow_mapping: "Workflow Mapping",
  agent_spec: "Agent Spec",
  review_critique: "Review / Critique",
};

export type WorkItemStatus =
  | "drafting"
  | "ready_for_review"
  | "in_review"
  | "revising"
  | "complete";

// ─────────────────────────────────────────────────────────────────────────
// The flow spine — two levels. LoopStage is the accordion group shown in the
// Guide rail; FlowStep is the ordered substep within it. Labels may be
// shortened for display but the reasoning/order must not be removed or
// reordered without a product-level decision (TEAMYOU_SOURCE_OF_TRUTH.md).
// ─────────────────────────────────────────────────────────────────────────

export type LoopStage = "frame" | "explore" | "design" | "specify_build";

export type FlowStep =
  // frame — the stable 7-stage framing spine
  | "understand_request"
  | "identify_users"
  | "assess_evidence"
  | "find_root_cause"
  | "define_problem"
  | "set_scope"
  | "define_outcome"
  // explore
  | "set_criteria"
  | "find_patterns"
  | "review_shortlist"
  | "choose_direction"
  // design
  | "refine_treatments"
  | "select_for_review"
  // specify_build
  | "prepare_handoff"
  | "build_in_tool"
  | "verify_build";

// Stable framing order per TEAMYOU_SOURCE_OF_TRUTH.md — do not reorder without
// a product-level decision. (An earlier build briefly followed a Figma
// screenshot's on-screen order instead; step ORDER is behavior/product logic,
// not presentation, so the source-of-truth doc governs it.)
export const FLOW_STEPS: FlowStep[] = [
  "understand_request",
  "define_problem",
  "identify_users",
  "assess_evidence",
  "find_root_cause",
  "set_scope",
  "define_outcome",
  "set_criteria",
  "find_patterns",
  "review_shortlist",
  "choose_direction",
  "refine_treatments",
  "select_for_review",
  "prepare_handoff",
  "build_in_tool",
  "verify_build",
];

export const LOOP_STAGES: LoopStage[] = ["frame", "explore", "design", "specify_build"];

export const LOOP_STAGE_OF: Record<FlowStep, LoopStage> = {
  understand_request: "frame",
  identify_users: "frame",
  assess_evidence: "frame",
  find_root_cause: "frame",
  define_problem: "frame",
  set_scope: "frame",
  define_outcome: "frame",
  set_criteria: "explore",
  find_patterns: "explore",
  review_shortlist: "explore",
  choose_direction: "explore",
  refine_treatments: "design",
  select_for_review: "design",
  prepare_handoff: "specify_build",
  build_in_tool: "specify_build",
  verify_build: "specify_build",
};

export const LOOP_STAGE_LABEL: Record<LoopStage, string> = {
  frame: "Frame the problem",
  explore: "Explore directions",
  design: "Design the solution",
  specify_build: "Specify and build",
};

export const FLOW_STEP_LABEL: Record<FlowStep, string> = {
  understand_request: "Understand the request",
  identify_users: "Identify users and context",
  assess_evidence: "Assess evidence and urgency",
  find_root_cause: "Find the adoption barrier/root cause",
  define_problem: "Define the problem",
  set_scope: "Set the scope",
  define_outcome: "Define the outcome",
  set_criteria: "Set the criteria",
  find_patterns: "Find relevant patterns",
  review_shortlist: "Review and shortlist",
  choose_direction: "Choose a direction",
  refine_treatments: "Explore and refine treatments",
  select_for_review: "Select a version for review",
  prepare_handoff: "Complete the specification",
  build_in_tool: "Build in your tool",
  verify_build: "Verify the build",
};

/** Steps belonging to a given loop stage, in order. */
export function stepsForStage(stage: LoopStage): FlowStep[] {
  return FLOW_STEPS.filter((s) => LOOP_STAGE_OF[s] === stage);
}

// ─────────────────────────────────────────────────────────────────────────

// One flow. Surface language adapts by WorkItem.type — do NOT create
// separate models for agent vs UX specs.
export type WorkItem = {
  id: string;
  title: string;
  type: WorkItemType;
  workMode: WorkMode;
  status: WorkItemStatus;
  currentStep: FlowStep;
  messages: Message[];
  spec: Spec;
  activity: ActivityEvent[];
  createdAt: string;
  updatedAt: string;
};

export type ImageAttachment = {
  id: string;
  // Full data URL for rendering/sending (image or application/pdf).
  dataUrl: string;
  // Smaller preview used only for persistence. The full-resolution dataUrl
  // remains in memory long enough for the Coach request, while this prevents
  // screenshots from exhausting localStorage and freezing project progress.
  persistedDataUrl?: string;
  persistedMediaType?: string;
  mediaType: string; // supported raster image types or "application/pdf"
  name?: string;
  bytes?: number; // approximate payload size, for logging/limits
  // The work object this screenshot was linked to when posted (chat continuity).
  linkedTo?: string;
  // False for SVG/unsupported: shows locally but is never sent to the Coach.
  sendable?: boolean;
};

export type Message = {
  id: string;
  role: "user" | "coach" | "system";
  content: string;
  attachments?: ImageAttachment[]; // screenshots or PDFs posted by the user
  // Short suggested replies the Coach offered on THIS message (rendered as
  // pill buttons under it). Cleared once the user has replied to any turn.
  quickReplies?: string[];
  // Exact label of the one quick reply the Coach recommends. Kept separate
  // from the labels so older persisted string-only quick replies still load.
  recommendedQuickReply?: string;
  // Milestone artifacts (pattern/wireframe/treatment shortlist) introduced by
  // THIS turn — rendered as a "Choose" card grid under the message.
  milestoneArtifactIds?: string[];
  // Evidence report created on THIS coach turn. Snapshotting the supporting
  // records preserves the report's historical position and meaning in chat.
  evidenceBrief?: EvidenceBrief;
  evidenceSnapshot?: Evidence[];
  evidenceOpenItems?: string[];
  createdAt: string;
};

// ─────────────────────────────────────────────────────────────────────────
// Decision & evidence model (COACH_BEHAVIOR_SPEC.md "Decision-record
// behavior"; TEAMYOU_SOURCE_OF_TRUTH.md "Decision and evidence model").
// Fact / Assumption / Interpretation / Risk are stored as distinct evidence
// kinds — never flattened into a single notes list.
// ─────────────────────────────────────────────────────────────────────────

export type EvidenceKind = "fact" | "assumption" | "interpretation" | "risk";

export type Evidence = {
  id: string; // client-assigned on merge
  kind: EvidenceKind;
  text: string;
  step: FlowStep;
  // Assumptions only: whether later evidence confirmed, disproved, or left it open.
  status?: "open" | "verified" | "disproved";
};

export type Decision = {
  id: string; // client-assigned on merge
  text: string;
  rationale?: string;
  evidenceRefs?: string[]; // ids into spec.evidence
  step: FlowStep;
  source: "user" | "coach";
  createdAt: string;
  // Set when this decision replaces an earlier one — the earlier decision's
  // status flips to "superseded" but is retained (never deleted) so its
  // history stays traceable.
  supersedes?: string;
  status: "active" | "superseded";
};

export type OpenQuestion = {
  id: string; // client-assigned
  text: string;
  step: FlowStep;
  status: "open" | "answered";
};

export type AcceptanceCriterion = {
  id: string; // client-assigned
  text: string;
  status: "draft" | "locked" | "met" | "failed";
};

// Define the outcome (TEAMYOU_SOURCE_OF_TRUTH.md §7 / CURRENT_UPDATE_SPEC.md §2).
// Completion of the design or build is never itself the success metric — a
// measurement gap is preserved explicitly rather than silently dropped.
export type Outcome = {
  userOutcome?: string;
  businessOutcome?: string;
  successMetric?: string; // credible numeric target, when available
  qualitativeCondition?: string; // fallback when a numeric target isn't available
  measurementGap?: string; // named risk when measurement itself is missing
};

// The "Opportunity brief" evidence-summary card shown inline in chat during
// Assess evidence and urgency. Known/Assumed/Still-needed bullets are derived
// from spec.evidence (kind: fact/assumption + open questions) when rendering
// — stats/funnel are the only free-form numeric content the Coach supplies.
export type EvidenceBrief = {
  title: string;
  source?: string; // e.g. an uploaded file name
  summary: string;
  stats?: { label: string; value: string }[];
  funnel?: { label: string; value: number }[];
  strength?: "weak" | "moderate" | "strong";
};

export type Todo = {
  id: string; // client-assigned
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  linkedAcceptanceCriterionId?: string;
  attachments?: Attachment[];
};

export type WorkflowStep = {
  id: string; // client-assigned
  title: string;
  description?: string;
  order: number;
};

// ─────────────────────────────────────────────────────────────────────────
// Guide milestone artifacts (CURRENT_UPDATE_SPEC.md §1 / TEAMYOU_SOURCE_OF_
// TRUTH.md "Artifact capture principles"). Capture the selected/decision-
// relevant artifact, never every generated variation.
// ─────────────────────────────────────────────────────────────────────────

export type ArtifactKind =
  | "pattern_shortlist"
  | "wireframe"
  | "hifi_design"
  | "build_handoff"
  | "working_build"
  | "verified_result";

export type ArtifactStatus =
  | "exploring"
  | "selected"
  | "ready_for_review"
  | "approved_for_build"
  | "sent_to_claude"
  | "working_build"
  | "verified";

/** Small, renderer-owned description of a generated low-fidelity direction.
 * It is intentionally structural rather than pixel-perfect: TeamYou draws the
 * comparison in chat, while high-fidelity work still belongs in the design tool. */
export type WireframeSpec = {
  surface: "page" | "modal" | "panel";
  /** Page-only composition. Omitted values remain backwards compatible and
   * are inferred from the artifact copy by the renderer. */
  layout?: "portfolio_home" | "case_study";
  eyebrow?: string;
  headline: string;
  body?: string;
  primaryAction?: string;
  secondaryAction?: string;
  blocks?: string[];
};

export type MilestoneArtifact = {
  id: string; // client-assigned
  kind: ArtifactKind;
  title: string;
  status: ArtifactStatus;
  thumbnailUrl?: string;
  sourceUrl?: string; // public reference page used for a retrieved pattern
  sourceTitle?: string;
  supportingLine?: string; // why chosen / what state it represents
  ingredients?: string[]; // short reusable pattern traits the user can combine
  wireframeSpec?: WireframeSpec;
  createdAt: string;
  step: FlowStep;
};

// ─────────────────────────────────────────────────────────────────────────
// Specify and Build: Build Handoff → Working Build → Verification.
// ─────────────────────────────────────────────────────────────────────────

export type BuildInstruction = {
  id: string; // client-assigned
  label: string; // short bold prefix, e.g. "No permission"
  text: string;
  rationale?: string; // collapsed "Decision rationale"
};

export type BuildHandoff = {
  id: string; // client-assigned
  title: string;
  status: "drafting" | "ready" | "sent";
  designThumbnailUrl?: string;
  instructions: BuildInstruction[]; // first 3-5 shown, rest collapsed
  unresolvedDecisionCount: number;
  createdAt: string;
};

export type WorkingBuild = {
  buildUrl?: string;
  status: "not_reviewed" | "in_review" | "ready" | "failed";
  reviewsStarted: number;
  reviewsPassed: number;
  totalReviewCategories?: number; // only when deterministic
};

export type ReviewCategory =
  | "problem_alignment"
  | "acceptance_criteria"
  | "design_system"
  | "interaction_states"
  | "accessibility"
  | "responsive"
  | "critical_risks";

export const REVIEW_CATEGORIES: ReviewCategory[] = [
  "problem_alignment",
  "acceptance_criteria",
  "design_system",
  "interaction_states",
  "accessibility",
  "responsive",
  "critical_risks",
];

// Rough directions are reviewed for whether the structure solves the locked
// problem. Production-readiness checks belong to the final mockup/build.
export const WIREFRAME_REVIEW_CATEGORIES: ReviewCategory[] = [
  "problem_alignment",
  "acceptance_criteria",
  "interaction_states",
  "critical_risks",
];

export const REVIEW_CATEGORY_LABEL: Record<ReviewCategory, string> = {
  problem_alignment: "Problem alignment",
  acceptance_criteria: "Acceptance criteria",
  design_system: "Design system",
  interaction_states: "Interaction & states",
  accessibility: "Accessibility",
  responsive: "Responsive",
  critical_risks: "Critical risks",
};

export type FindingSeverity = "blocker" | "important" | "minor";

// Every AI Review Check (COACH_BEHAVIOR_SPEC.md "Review-check behavior") must
// carry all five of these — a bare "improve clarity" is never valid.
export type ReviewFinding = {
  id: string; // client-assigned
  artifactId: string; // the MilestoneArtifact or WorkingBuild this targets
  category: ReviewCategory;
  severity: FindingSeverity;
  finding: string;
  evidence: string;
  impact: string;
  expectedCorrection: string;
  relatedCriterion?: string; // requirement, decision, or design-system rule
  status: "open" | "resolved" | "accepted_limitation";
};

// Artifact-anchored discussion threads ("Discussions" tab). NOT part of the
// Coach turn contract — created/replied/resolved via local pure helpers
// (mirrors attachments.ts). General non-anchored conversation stays in chat.
export type CommentMessage = {
  id: string;
  role: "user" | "coach";
  text: string;
  createdAt: string;
};

export type CommentThread = {
  id: string; // client-assigned
  artifactId: string;
  anchor: { xPct: number; yPct: number } | null; // position pinned on the artifact
  messages: CommentMessage[];
  status: "open" | "resolved";
  createdAt: string;
};

export type VerificationResult = {
  buildId: string; // WorkingBuild this result is for
  reviewsPassed: number;
  reviewsTotal: number;
  requirementsVerified: number;
  requirementsTotal: number;
  criticalIssues: number;
  findings: ReviewFinding[];
  status: "not_reviewed" | "in_progress" | "verified" | "blocked";
};

// ─────────────────────────────────────────────────────────────────────────

export type Spec = {
  brief: {
    // Understand the request
    problem?: string;
    goal?: string;
    productContext?: string;
    assumedSolution?: string;
    // Identify users and context
    user?: string;
    moment?: string;
    task?: string;
    // Find the root cause
    rootCause?: string;
    // Set the scope
    scopeIncluded?: string;
    scopeExcluded?: string;
    context?: string;
    risk?: string;
    // Design/copy framing (used by design & case-study work). designDirection =
    // the chosen approach/pattern; finalCopy = the concrete proposed content.
    designDirection?: string;
    finalCopy?: string;
    // CURATED current-state lists (overwrite each turn, never a running log):
    // keyDecisions = the standing decisions in one line each; openItems = what's
    // still needed. Full iteration history lives in spec.decisions (the log).
    keyDecisions?: string[];
    openItems?: string[];
  };
  workflow: {
    summary?: string;
    steps: WorkflowStep[];
    // branches: exist later, not in v1
  };
  rules: {
    summary?: string;
    acceptanceCriteria: AcceptanceCriterion[];
    todos: Todo[];
  };
  review: {
    summary?: string;
    status?: "not_ready" | "ready" | "in_review" | "needs_revision" | "passed";
  };
  decisions: Decision[];
  openQuestions: OpenQuestion[];
  evidence: Evidence[];
  outcome: Outcome;
  evidenceBrief?: EvidenceBrief;
  milestoneArtifacts: MilestoneArtifact[];
  buildHandoffs: BuildHandoff[];
  workingBuild?: WorkingBuild;
  reviewFindings: ReviewFinding[];
  commentThreads: CommentThread[];
  verification?: VerificationResult;
  completeness?: number;
  // Spec-scoped attachments (spec-level + all_todos rollup + section evidence).
  // Todo-specific attachments live on each Todo. See resolvePinnedAttachment.
  attachments?: Attachment[];
};

export type ActivityEventType =
  | "brief_updated"
  | "workflow_updated"
  | "decision_captured"
  | "open_question_added"
  | "acceptance_criterion_added"
  | "todo_created"
  | "rules_updated"
  | "step_changed"
  | "evidence_captured"
  | "outcome_defined"
  | "milestone_captured"
  | "review_run"
  | "handoff_ready"
  | "build_linked"
  | "verification_completed";

// Importance drives the icon COLOR (gold), not the category. Gold means "this
// counted" — a completion, quality gate, handoff, or recognition — not just
// "this happened". Only "milestone" renders gold.
export type ActivityImportance = "normal" | "significant" | "milestone";

// Optional context so activity can later be grouped/filtered by project, spec,
// or target (whole spec / a todo / the "All todos" rollup), and can carry
// artifacts on the most meaningful events.
export type ActivityProjectRef = { id: string; name: string; type: string };
export type ActivitySpecRef = { id: string; name: string; type: string };
export type ActivityTarget = {
  kind: "spec" | "todo" | "all_todos";
  id: string;
  label: string;
};
// Every attachment resolves to a meaningful work object (a spec, todo, or the
// all_todos rollup) — never a generic media bucket. `section` records which
// loop stage it supports (for grouped display); `scope` places it among the
// spec-scoped attachments; `isMilestone` bumps its spec-resolver priority.
export type AttachmentSection = LoopStage;
export type Attachment = {
  id: string;
  type: "screenshot";
  label: string;
  url: string;
  createdAt: string;
  isPinned: boolean;
  section?: AttachmentSection;
  scope?: "spec" | "all_todos";
  isMilestone?: boolean;
};
/** @deprecated use Attachment */
export type ActivityAttachment = Attachment;

export type ActivityEvent = {
  id: string; // client-assigned
  type: ActivityEventType;
  importance: ActivityImportance;
  label: string;
  description?: string;
  createdAt: string;
  project?: ActivityProjectRef;
  spec?: ActivitySpecRef;
  target?: ActivityTarget;
  attachments?: Attachment[];
};

// ─────────────────────────────────────────────────────────────────────────
// Coach response contract (the keystone). Every Coach turn returns exactly one
// CoachTurnResponse. Steps 3–5 all render from this.
// ─────────────────────────────────────────────────────────────────────────

// Presentational hints only. activeStep is NOT duplicated here — the top-level
// activeStep is the single source of truth (Rule 1). The panel reads step from
// the top-level field.
export type GuidePanel = {
  title: string;
  // Scannable, cumulative structure for the ACTIVE step's card only:
  //   captured — everything locked in for THIS step so far (restate every turn);
  //              do NOT carry a previous step's captured items here
  //   need     — what's still missing to move the step forward, as a short
  //              noun phrase ("Homepage first impression") — the Guide's
  //              compact "Need: …" label, NOT a restatement of nextPrompt
  //   nextPrompt — the single next question, in full. Product boundary: the
  //              coach's actual question lives ONLY in chat (via `reply`);
  //              the Guide never renders this as its own card — it's shown
  //              only as hover/focus tooltip context on the Need label, and
  //              clicking that label jumps to the chat message instead.
  //   priorSummary — one-line handoff from completed prior steps (e.g. the brief
  //                  in a sentence), shown at the top of the active card
  captured?: string[];
  need?: string;
  nextPrompt?: string;
  priorSummary?: string;
  // Legacy one-line summary; kept optional for back-compat / fallback.
  summary?: string;
  progressLabel?: string;
};

// Items the Coach proposes carry NO id (client assigns on merge, Rule 2).
export type ProposedDecision = {
  text: string;
  rationale?: string;
  evidenceRefs?: string[]; // may reference existing evidence ids from the spec snapshot
  step: FlowStep;
  source: "user" | "coach";
  supersedes?: string; // an existing decision id from the spec snapshot
};
export type ProposedOpenQuestion = {
  text: string;
  step: FlowStep;
  status: "open" | "answered";
};
export type ProposedCriterion = { text: string; status: "draft" | "locked" };
export type ProposedTodo = {
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  linkedAcceptanceCriterionRef?: string; // references a criterion by text/order, resolved on merge
};
export type ProposedWorkflowStep = {
  title: string;
  description?: string;
  order: number;
};
export type ProposedEvidence = {
  kind: EvidenceKind;
  text: string;
  step: FlowStep;
  status?: "open" | "verified" | "disproved";
};
// Updates an EXISTING evidence item (e.g. new information marks an assumption
// verified/disproved) — the one deliberate exception to "arrays append only."
export type EvidenceStatusUpdate = {
  id: string; // existing evidence id from the spec snapshot
  status: "open" | "verified" | "disproved";
};
export type ProposedOutcome = Partial<Outcome>; // scalar-overwrite, only provided keys change
export type ProposedMilestoneArtifact = {
  kind: ArtifactKind;
  title: string;
  status: ArtifactStatus;
  thumbnailUrl?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  supportingLine?: string;
  ingredients?: string[];
  wireframeSpec?: WireframeSpec;
  step: FlowStep;
};
export type ProposedBuildInstruction = { label: string; text: string; rationale?: string };
export type ProposedBuildHandoff = {
  title: string;
  status: "drafting" | "ready" | "sent";
  designThumbnailUrl?: string;
  instructions: ProposedBuildInstruction[];
  unresolvedDecisionCount: number;
};
export type ProposedWorkingBuild = Partial<WorkingBuild>; // scalar-overwrite
export type ProposedReviewFinding = {
  artifactId: string;
  category: ReviewCategory;
  severity: FindingSeverity;
  finding: string;
  evidence: string;
  impact: string;
  expectedCorrection: string;
  relatedCriterion?: string;
  status: "open" | "resolved" | "accepted_limitation";
};
export type ProposedVerificationResult = Partial<VerificationResult>; // scalar-overwrite
// Updates an EXISTING acceptance criterion's status (e.g. a review confirms it
// met, or a build fails it) — the same deliberate in-place-update exception as
// EvidenceStatusUpdate. Without this, "requirements verified" could never move
// off zero, since ProposedCriterion (new criteria) only ever proposes
// draft/locked.
export type AcceptanceCriterionStatusUpdate = {
  id: string; // existing acceptance criterion id from the spec snapshot
  status: "draft" | "locked" | "met" | "failed";
};

export type SpecUpdates = {
  brief?: Spec["brief"];
  workflow?: { summary?: string; steps?: ProposedWorkflowStep[] };
  rules?: { summary?: string };
  review?: { summary?: string; status?: Spec["review"]["status"] };
  decisions?: ProposedDecision[];
  openQuestions?: ProposedOpenQuestion[];
  acceptanceCriteria?: ProposedCriterion[];
  acceptanceCriteriaStatusUpdates?: AcceptanceCriterionStatusUpdate[];
  todos?: ProposedTodo[];
  evidence?: ProposedEvidence[];
  evidenceStatusUpdates?: EvidenceStatusUpdate[];
  outcome?: ProposedOutcome;
  evidenceBrief?: EvidenceBrief;
  milestoneArtifacts?: ProposedMilestoneArtifact[];
  buildHandoff?: ProposedBuildHandoff; // appends a new BuildHandoff
  workingBuild?: ProposedWorkingBuild;
  reviewFindings?: ProposedReviewFinding[];
  verification?: ProposedVerificationResult;
};

export type ProposedActivityEvent = {
  type: ActivityEventType;
  importance?: ActivityImportance; // defaults to "normal" if the Coach omits it
  label: string;
  description?: string;
};

// The decision-criticality gate, made explicit as structured data rather than
// left implicit in prose — "the chat decides; the Guide remembers." Every
// turn's implicit choice (ask vs. capture-and-move-on) is recorded here so
// it's inspectable and testable, not just a hoped-for prompt behavior.
export type StepGateDisposition = "ask" | "assumption" | "risk" | "todo" | "proceed";
export type StepGate = {
  linkedDecision: string; // the user/problem/root-cause/scope/outcome decision this evaluation is about
  blocking: boolean; // could the answer materially change that decision?
  disposition: StepGateDisposition;
};

// A deliberate, user-authorized revision may reopen an earlier flow step.
// "Locked" means traceable/current, not irreversible: existing work stays in
// the record while the affected decision and downstream steps are revisited.
export type FlowRevision = {
  reopenedStep: FlowStep; // earliest step materially affected by the change
  reason: string;
  preservesExistingWork: true;
};

export type CoachTurnResponse = {
  reply: string; // shown in chat
  activeStep: FlowStep; // single source of truth for the step
  workItemType?: WorkItemType; // Coach's detection of what's being built (auto-sets the type)
  workMode?: WorkMode; // Coach's inferred process mode (auto-sets, user can override)
  specUpdates: SpecUpdates; // merged into spec state (Rule 3)
  guidePanel: GuidePanel; // presentational hints for the panel
  activityEvents: ProposedActivityEvent[];
  // Short suggested replies (e.g. "Yes" / "No", 2-3 plausible choices) shown as
  // pill buttons under the reply. Omit when a free-text answer is expected.
  quickReplies?: string[];
  // Exact label of one quick reply when the locked frame supports a defensible
  // recommendation. Omit when evidence is insufficient or choices are equal.
  recommendedQuickReply?: string;
  // Required when an explicit user revision moves activeStep backward. The
  // server rejects unannotated regressions so ordinary turns still follow the
  // stable flow in order.
  flowRevision?: FlowRevision;
  // The gate evaluation behind this turn's question (or lack of one). Optional
  // for backward compatibility with older persisted turns, but the prompt
  // requires it on every turn going forward.
  stepGate?: StepGate;
  // "detailed" lifts the normal brevity ceiling — for generated reports,
  // briefs, critiques, handoffs, or when the user explicitly asked for depth.
  // Defaults to "concise" when omitted.
  responseMode?: "concise" | "detailed";
};

export function emptySpec(): Spec {
  return {
    brief: {},
    workflow: { steps: [] },
    rules: { acceptanceCriteria: [], todos: [] },
    review: {},
    decisions: [],
    openQuestions: [],
    evidence: [],
    outcome: {},
    milestoneArtifacts: [],
    buildHandoffs: [],
    reviewFindings: [],
    commentThreads: [],
    completeness: 0,
  };
}
