// ─────────────────────────────────────────────────────────────────────────
// TeamYou v1 — Data model (trimmed to v1) + Coach response contract.
// This file is the single source of truth for shape. Do not widen beyond the
// build spec. The `review` section and workflow `branches` exist as types so we
// don't reshape later, but are NOT built in v1.
// ─────────────────────────────────────────────────────────────────────────

export type SpecStep = "brief" | "workflow" | "rules" | "review";

export type WorkItemType =
  | "feature_spec"
  | "agent_spec"
  | "case_study"
  | "presentation";

export type WorkItemStatus =
  | "drafting"
  | "ready_for_review"
  | "in_review"
  | "revising"
  | "complete";

// One spine. Surface language adapts by WorkItem.type — do NOT create
// separate models for agent vs UX specs.
export type WorkItem = {
  id: string;
  title: string;
  type: WorkItemType;
  status: WorkItemStatus;
  currentStep: SpecStep;
  messages: Message[];
  spec: Spec;
  activity: ActivityEvent[];
  createdAt: string;
  updatedAt: string;
};

export type ImageAttachment = {
  id: string;
  // Full data URL for rendering in the browser (e.g. "data:image/png;base64,...").
  dataUrl: string;
  mediaType: string; // "image/png" | "image/jpeg" | "image/gif" | "image/webp"
  name?: string;
};

export type Message = {
  id: string;
  role: "user" | "coach" | "system";
  content: string;
  attachments?: ImageAttachment[]; // screenshots the user posted (vision input)
  createdAt: string;
};

export type Decision = {
  id: string; // client-assigned on merge (Rule 2)
  text: string;
  step: SpecStep;
  source: "user" | "coach";
};

export type OpenQuestion = {
  id: string; // client-assigned
  text: string;
  step: SpecStep;
  status: "open" | "answered";
};

export type AcceptanceCriterion = {
  id: string; // client-assigned
  text: string;
  status: "draft" | "locked" | "met" | "failed";
};

export type Todo = {
  id: string; // client-assigned
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  linkedAcceptanceCriterionId?: string;
};

export type WorkflowStep = {
  id: string; // client-assigned
  title: string;
  description?: string;
  order: number;
};

export type Spec = {
  brief: {
    problem?: string;
    goal?: string;
    context?: string;
    risk?: string;
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
    // exists as a type; NOT built in v1
    summary?: string;
    status?: "not_ready" | "ready" | "in_review" | "needs_revision" | "passed";
  };
  decisions: Decision[];
  openQuestions: OpenQuestion[];
  completeness?: number;
};

export type ActivityEventType =
  | "brief_updated"
  | "workflow_updated"
  | "decision_captured"
  | "open_question_added"
  | "acceptance_criterion_added"
  | "todo_created"
  | "rules_updated"
  | "step_changed";

export type ActivityEvent = {
  id: string; // client-assigned
  type: ActivityEventType;
  label: string;
  description?: string;
  createdAt: string;
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
  summary: string;
  nextPrompt?: string;
  progressLabel?: string;
};

// Items the Coach proposes carry NO id (client assigns on merge, Rule 2).
export type ProposedDecision = {
  text: string;
  step: SpecStep;
  source: "user" | "coach";
};
export type ProposedOpenQuestion = {
  text: string;
  step: SpecStep;
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

export type SpecUpdates = {
  brief?: { problem?: string; goal?: string; context?: string; risk?: string };
  workflow?: { summary?: string; steps?: ProposedWorkflowStep[] };
  rules?: { summary?: string };
  review?: { summary?: string; status?: Spec["review"]["status"] };
  decisions?: ProposedDecision[];
  openQuestions?: ProposedOpenQuestion[];
  acceptanceCriteria?: ProposedCriterion[];
  todos?: ProposedTodo[];
};

export type ProposedActivityEvent = {
  type: ActivityEventType;
  label: string;
  description?: string;
};

export type CoachTurnResponse = {
  reply: string; // shown in chat
  activeStep: SpecStep; // single source of truth for step
  specUpdates: SpecUpdates; // merged into spec state (Rule 3)
  guidePanel: GuidePanel; // presentational hints for the panel
  activityEvents: ProposedActivityEvent[];
};

export const SPEC_STEPS: SpecStep[] = ["brief", "workflow", "rules", "review"];

export function emptySpec(): Spec {
  return {
    brief: {},
    workflow: { steps: [] },
    rules: { acceptanceCriteria: [], todos: [] },
    review: {},
    decisions: [],
    openQuestions: [],
    completeness: 0,
  };
}
