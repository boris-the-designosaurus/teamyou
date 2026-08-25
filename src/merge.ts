// ─────────────────────────────────────────────────────────────────────────
// Rule 3 — Explicit merge semantics. The two most safety-critical places in
// the app are this file and the CoachTurnResponse type. Get them right before
// rendering anything.
//
//   • Scalars overwrite. brief.problem, brief.goal, outcome.*, evidenceBrief,
//     workingBuild, verification, workflow.summary, etc. — the new value
//     replaces the old if present, is left untouched if absent.
//   • Arrays append. decisions, openQuestions, acceptanceCriteria, todos,
//     workflow.steps, evidence, milestoneArtifacts, reviewFindings,
//     buildHandoffs — new items are appended with client-assigned IDs. They
//     do NOT replace the existing array.
//   • Two deliberate exceptions to "arrays append": evidenceStatusUpdates
//     updates an EXISTING evidence item's status in place (an assumption
//     becoming verified/disproved), and a proposed decision with `supersedes`
//     flips that existing decision's status to "superseded" in place. Both
//     are explicit, targeted updates by id — never a silent rewrite.
//   • activityEvents always append.
//
// Rule 2 — The client is the ID authority, not the model. Proposed* items carry
// no id; we assign a stable one here. For linkedAcceptanceCriterionRef, the
// Coach references a criterion loosely (by text or 1-based order within the same
// turn); we resolve it to the real id during merge. References to items that
// already exist before this turn (decisions[].supersedes, evidence[].evidenceRefs,
// reviewFindings[].artifactId, etc.) use the REAL id directly, since the Coach
// is given the current spec (with real ids already assigned) as its snapshot.
// ─────────────────────────────────────────────────────────────────────────

import type {
  ActivityEvent,
  FlowStep,
  LoopStage,
  ProposedActivityEvent,
  ReviewCategory,
  ReviewFinding,
  Spec,
  SpecUpdates,
} from "./types";
import { FLOW_STEPS, LOOP_STAGE_OF, stepsForStage } from "./types";

export type MakeId = () => string;

export const defaultMakeId: MakeId = () => crypto.randomUUID();

/** Keep model-proposed reference links safe for anchors and preview services. */
export function normalizePublicUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Merge a CoachTurnResponse's specUpdates into the current Spec, returning a
 * new Spec (pure — does not mutate the input). `makeId` assigns stable client
 * IDs to newly appended array items. `now` timestamps new decisions/handoffs.
 */
export function mergeSpec(
  spec: Spec,
  updates: SpecUpdates,
  makeId: MakeId = defaultMakeId,
  now: string = new Date().toISOString(),
): Spec {
  // Structured clone keeps this pure and avoids shared nested references.
  const next: Spec = {
    brief: { ...spec.brief },
    workflow: { summary: spec.workflow.summary, steps: [...spec.workflow.steps] },
    rules: {
      summary: spec.rules.summary,
      acceptanceCriteria: [...spec.rules.acceptanceCriteria],
      todos: [...spec.rules.todos],
    },
    review: { ...spec.review },
    decisions: [...spec.decisions],
    openQuestions: [...spec.openQuestions],
    evidence: [...spec.evidence],
    outcome: { ...spec.outcome },
    evidenceBrief: spec.evidenceBrief,
    milestoneArtifacts: [...spec.milestoneArtifacts],
    buildHandoffs: [...spec.buildHandoffs],
    workingBuild: spec.workingBuild,
    reviewFindings: [...spec.reviewFindings],
    commentThreads: spec.commentThreads,
    verification: spec.verification,
    completeness: spec.completeness,
  };

  // ── Brief: scalars overwrite (only when present) ──
  if (updates.brief) {
    const scalarKeys = [
      "problem",
      "goal",
      "productContext",
      "assumedSolution",
      "user",
      "moment",
      "task",
      "rootCause",
      "scopeIncluded",
      "scopeExcluded",
      "context",
      "risk",
      "designDirection",
      "finalCopy",
    ] as const;
    for (const key of scalarKeys) {
      if (updates.brief[key] !== undefined) next.brief[key] = updates.brief[key];
    }
    // Curated current-state lists — OVERWRITE, never append. These hold the
    // standing decisions / open items, not a running log (that's spec.decisions).
    if (updates.brief.keyDecisions !== undefined) {
      next.brief.keyDecisions = [...updates.brief.keyDecisions];
    }
    if (updates.brief.openItems !== undefined) {
      next.brief.openItems = [...updates.brief.openItems];
    }
  }

  // ── Workflow: summary overwrites; steps append ──
  if (updates.workflow) {
    if (updates.workflow.summary !== undefined) {
      next.workflow.summary = updates.workflow.summary;
    }
    if (updates.workflow.steps) {
      for (const step of updates.workflow.steps) {
        next.workflow.steps.push({
          id: makeId(),
          title: step.title,
          description: step.description,
          order: step.order,
        });
      }
    }
  }

  // ── Rules summary: scalar overwrite ──
  if (updates.rules?.summary !== undefined) {
    next.rules.summary = updates.rules.summary;
  }

  // ── Acceptance criteria: append. Track this turn's additions so todos in the
  //    same turn can resolve linkedAcceptanceCriterionRef by text or 1-based
  //    order (Rule 2). ──
  const criteriaAddedThisTurn: { id: string; text: string }[] = [];
  if (updates.acceptanceCriteria) {
    for (const c of updates.acceptanceCriteria) {
      const id = makeId();
      next.rules.acceptanceCriteria.push({
        id,
        text: c.text,
        status: c.status,
      });
      criteriaAddedThisTurn.push({ id, text: c.text });
    }
  }

  // ── Acceptance criteria status updates: the deliberate in-place update that
  //    lets a criterion move to met/failed — otherwise "requirements verified"
  //    could never move off zero. ──
  if (updates.acceptanceCriteriaStatusUpdates) {
    for (const u of updates.acceptanceCriteriaStatusUpdates) {
      const idx = next.rules.acceptanceCriteria.findIndex((c) => c.id === u.id);
      if (idx !== -1) {
        next.rules.acceptanceCriteria[idx] = { ...next.rules.acceptanceCriteria[idx], status: u.status };
      }
    }
  }

  // ── Todos: append, resolving linkedAcceptanceCriterionRef → real id ──
  if (updates.todos) {
    for (const t of updates.todos) {
      next.rules.todos.push({
        id: makeId(),
        title: t.title,
        description: t.description,
        status: t.status,
        linkedAcceptanceCriterionId: resolveRef(
          t.linkedAcceptanceCriterionRef,
          criteriaAddedThisTurn,
        ),
      });
    }
  }

  // ── Review: scalars overwrite ──
  if (updates.review) {
    if (updates.review.summary !== undefined) {
      next.review.summary = updates.review.summary;
    }
    if (updates.review.status !== undefined) {
      next.review.status = updates.review.status;
    }
  }

  // ── Decisions: append. A proposed decision with `supersedes` set flips the
  //    referenced existing decision's status in place (never deleted). ──
  if (updates.decisions) {
    for (const d of updates.decisions) {
      if (d.supersedes) {
        const idx = next.decisions.findIndex((existing) => existing.id === d.supersedes);
        if (idx !== -1) next.decisions[idx] = { ...next.decisions[idx], status: "superseded" };
      }
      next.decisions.push({
        id: makeId(),
        text: d.text,
        rationale: d.rationale,
        evidenceRefs: d.evidenceRefs,
        step: d.step,
        source: d.source,
        createdAt: now,
        supersedes: d.supersedes,
        status: "active",
      });
    }
  }

  // ── Open questions: append ──
  if (updates.openQuestions) {
    for (const q of updates.openQuestions) {
      next.openQuestions.push({
        id: makeId(),
        text: q.text,
        step: q.step,
        status: q.status,
      });
    }
  }

  // ── Evidence: append ──
  if (updates.evidence) {
    for (const e of updates.evidence) {
      next.evidence.push({
        id: makeId(),
        kind: e.kind,
        text: e.text,
        step: e.step,
        status: e.status,
      });
    }
  }

  // ── Evidence status updates: the one deliberate in-place update on an
  //    existing evidence item (e.g. an assumption becomes verified). ──
  if (updates.evidenceStatusUpdates) {
    for (const u of updates.evidenceStatusUpdates) {
      const idx = next.evidence.findIndex((e) => e.id === u.id);
      if (idx !== -1) next.evidence[idx] = { ...next.evidence[idx], status: u.status };
    }
  }

  // ── Outcome: scalar-overwrite object — only provided keys change ──
  if (updates.outcome) {
    next.outcome = { ...next.outcome, ...updates.outcome };
  }

  // ── Evidence brief: scalar overwrite (whole object, always the latest) ──
  if (updates.evidenceBrief) {
    next.evidenceBrief = updates.evidenceBrief;
  }

  // ── Milestone artifacts: append. Status transitions on an EXISTING artifact
  //    (e.g. "Choose") go through setMilestoneArtifactStatus, not specUpdates. ──
  if (updates.milestoneArtifacts) {
    for (const a of updates.milestoneArtifacts) {
      next.milestoneArtifacts.push({
        id: makeId(),
        kind: a.kind,
        title: a.title,
        status: a.status,
        thumbnailUrl: a.thumbnailUrl,
        sourceUrl: normalizePublicUrl(a.sourceUrl),
        sourceTitle: a.sourceTitle,
        supportingLine: a.supportingLine,
        ingredients: a.ingredients ? [...a.ingredients] : undefined,
        createdAt: now,
        step: a.step,
      });
    }
  }

  // ── Build handoff: a proposed handoff matching an existing one BY TITLE is
  //    treated as an update to it (e.g. the Coach flips "drafting" to "ready"
  //    once every instruction resolves) — otherwise a handoff the user can
  //    never advance past "drafting" would pile up duplicates every time the
  //    Coach re-describes it. Once that handoff is "sent" it's a terminal,
  //    user-driven record — a later turn re-describing the SAME title is
  //    treated as a no-op (not re-appended, not mutated), since sending
  //    already happened outside the turn contract (via the UI). A genuinely
  //    new title still appends as a new handoff. Direct user edits go
  //    through updateBuildHandoff, not specUpdates. ──
  if (updates.buildHandoff) {
    const h = updates.buildHandoff;
    const existingIdx = next.buildHandoffs.findIndex((existing) => existing.title === h.title);
    const existing = existingIdx !== -1 ? next.buildHandoffs[existingIdx] : undefined;
    if (existing?.status === "sent") {
      // No-op — already sent; nothing to update or duplicate.
    } else if (existingIdx !== -1) {
      next.buildHandoffs[existingIdx] = {
        ...next.buildHandoffs[existingIdx],
        status: h.status,
        designThumbnailUrl: h.designThumbnailUrl ?? next.buildHandoffs[existingIdx].designThumbnailUrl,
        instructions: h.instructions.map((i) => ({
          id: makeId(),
          label: i.label,
          text: i.text,
          rationale: i.rationale,
        })),
        unresolvedDecisionCount: h.unresolvedDecisionCount,
      };
    } else {
      next.buildHandoffs.push({
        id: makeId(),
        title: h.title,
        status: h.status,
        designThumbnailUrl: h.designThumbnailUrl,
        instructions: h.instructions.map((i) => ({
          id: makeId(),
          label: i.label,
          text: i.text,
          rationale: i.rationale,
        })),
        unresolvedDecisionCount: h.unresolvedDecisionCount,
        createdAt: now,
      });
    }
  }

  // ── Working build: scalar-overwrite object ──
  if (updates.workingBuild) {
    next.workingBuild = { ...(next.workingBuild ?? defaultWorkingBuild()), ...updates.workingBuild };
  }

  // ── Review findings: append, scoped by artifactId. A vague finding (no real
  //    supporting detail, or no cited criterion/decision/risk/rule) is NOT
  //    accepted into the record — COACH_BEHAVIOR_SPEC.md is explicit that
  //    "improve clarity" without detail doesn't count, and ACCEPTANCE_TESTS.md
  //    §G requires every finding to reference something concrete. This is
  //    enforced here, not just as prompt guidance, so it holds regardless of
  //    what the model does. ──
  if (updates.reviewFindings) {
    for (const f of updates.reviewFindings) {
      if (isVagueFinding(f)) continue;
      next.reviewFindings.push({
        id: makeId(),
        artifactId: f.artifactId,
        category: f.category,
        severity: f.severity,
        finding: f.finding,
        evidence: f.evidence,
        impact: f.impact,
        expectedCorrection: f.expectedCorrection,
        relatedCriterion: f.relatedCriterion,
        status: f.status,
      });
    }
  }

  // ── Verification result: scalar-overwrite object ──
  if (updates.verification) {
    next.verification = {
      ...(next.verification ?? defaultVerificationResult(updates.verification.buildId ?? "")),
      ...updates.verification,
    };
  }

  next.completeness = computeCompleteness(next);
  return next;
}

function defaultWorkingBuild(): NonNullable<Spec["workingBuild"]> {
  return { status: "not_reviewed", reviewsStarted: 0, reviewsPassed: 0 };
}

function defaultVerificationResult(buildId: string): NonNullable<Spec["verification"]> {
  return {
    buildId,
    reviewsPassed: 0,
    reviewsTotal: 0,
    requirementsVerified: 0,
    requirementsTotal: 0,
    criticalIssues: 0,
    findings: [],
    status: "not_reviewed",
  };
}

/**
 * Resolve a loose reference (text or 1-based order) against items added in
 * the same turn. Returns undefined if unresolvable.
 */
function resolveRef(
  ref: string | undefined,
  itemsThisTurn: { id: string; text: string }[],
): string | undefined {
  if (!ref) return undefined;

  // Exact text match first.
  const byText = itemsThisTurn.find((c) => c.text === ref);
  if (byText) return byText.id;

  // Fall back to 1-based order (e.g. "1", "2").
  const order = Number.parseInt(ref, 10);
  if (Number.isInteger(order) && order >= 1 && order <= itemsThisTurn.length) {
    return itemsThisTurn[order - 1].id;
  }

  return undefined;
}

/**
 * activityEvents always append — assign a client id + timestamp.
 */
export function toActivityEvents(
  proposed: ProposedActivityEvent[],
  now: string,
  makeId: MakeId = defaultMakeId,
): ActivityEvent[] {
  return proposed.map((e) => ({
    id: makeId(),
    type: e.type,
    importance: e.importance ?? "normal",
    label: e.label,
    description: e.description,
    createdAt: now,
  }));
}

// Whole-string matches only — a real finding legitimately using one of these
// words in a full sentence is fine; it's the bare, unsupported phrase that's
// rejected (COACH_BEHAVIOR_SPEC.md: "'improve clarity' without detail").
const GENERIC_FINDING_PHRASES = new Set([
  "improve clarity",
  "make it better",
  "needs work",
  "could be better",
  "polish this",
  "improve this",
  "clean this up",
  "n/a",
  "none",
  "tbd",
  "-",
]);
const MIN_FINDING_FIELD_LENGTH = 8;

/**
 * A finding is vague — and NOT accepted into the record — when it lacks real
 * supporting detail in any of finding/evidence/impact/expectedCorrection, has
 * no cited criterion/decision/risk/rule, or the finding text is just a bare
 * generic phrase. ACCEPTANCE_TESTS.md §G requires every finding to identify a
 * specific area, explain impact, propose a correction, and reference
 * something concrete — this is the enforced version of that rule.
 */
export function isVagueFinding(f: {
  finding: string;
  evidence: string;
  impact: string;
  expectedCorrection: string;
  relatedCriterion?: string;
}): boolean {
  const fields = [f.finding, f.evidence, f.impact, f.expectedCorrection];
  if (fields.some((v) => !v || v.trim().length < MIN_FINDING_FIELD_LENGTH)) return true;
  if (!f.relatedCriterion || f.relatedCriterion.trim().length === 0) return true;
  if (GENERIC_FINDING_PHRASES.has(f.finding.trim().toLowerCase())) return true;
  return false;
}

/**
 * Deterministic pass/fail per review category, computed client-side rather
 * than trusted from the model — a category passes when it has no OPEN
 * blocker/important finding. Used both for the Review Checks category rows
 * and to keep a WorkingBuild's reviewsStarted/reviewsPassed stats honest
 * after a review runs (never left at a stale 0/0 once findings exist).
 */
export function reviewCategoryState(
  findings: ReviewFinding[],
  category: ReviewCategory,
): "passed" | "failed" {
  const blocking = findings.some(
    (f) =>
      f.category === category &&
      f.status === "open" &&
      (f.severity === "blocker" || f.severity === "important"),
  );
  return blocking ? "failed" : "passed";
}

export function countPassedCategories(
  findings: ReviewFinding[],
  categories: ReviewCategory[],
): number {
  return categories.filter((cat) => reviewCategoryState(findings, cat) === "passed").length;
}

// ─────────────────────────────────────────────────────────────────────────
// User-driven, non-coach-turn state changes (mirrors attachments.ts). These
// are pure, immutable functions the UI calls directly — e.g. clicking
// "Choose" on a pattern card, or editing a Build Handoff's status.
// ─────────────────────────────────────────────────────────────────────────

/** Move an existing milestone artifact to a new status (e.g. "Choose"). */
export function setMilestoneArtifactStatus(
  spec: Spec,
  artifactId: string,
  status: Spec["milestoneArtifacts"][number]["status"],
): Spec {
  return {
    ...spec,
    milestoneArtifacts: spec.milestoneArtifacts.map((a) =>
      a.id === artifactId ? { ...a, status } : a,
    ),
  };
}

/**
 * "Choose" a milestone artifact from a shortlist. A pattern shortlist is
 * genuinely multi-select (toggle this one, leave the others alone) — every
 * other artifact kind is exclusive (choosing one un-selects any sibling with
 * the same step, since only one wireframe/treatment moves forward for review).
 */
export function chooseMilestoneArtifact(spec: Spec, artifactId: string): Spec {
  const target = spec.milestoneArtifacts.find((a) => a.id === artifactId);
  if (!target) return spec;

  if (target.kind === "pattern_shortlist") {
    const nextStatus = target.status === "exploring" ? "selected" : "exploring";
    return setMilestoneArtifactStatus(spec, artifactId, nextStatus);
  }

  return {
    ...spec,
    milestoneArtifacts: spec.milestoneArtifacts.map((a) => {
      if (a.id === artifactId) return { ...a, status: "selected" };
      if (a.step === target.step && a.kind === target.kind && a.status !== "exploring") {
        return { ...a, status: "exploring" };
      }
      return a;
    }),
  };
}

/** Edit an existing build handoff in place (e.g. after the pencil-edit action). */
export function updateBuildHandoff(
  spec: Spec,
  handoffId: string,
  patch: Partial<Spec["buildHandoffs"][number]>,
): Spec {
  return {
    ...spec,
    buildHandoffs: spec.buildHandoffs.map((h) =>
      h.id === handoffId ? { ...h, ...patch } : h,
    ),
  };
}

/** Attach/edit the working build URL, or update its status. */
export function updateWorkingBuild(spec: Spec, patch: Partial<NonNullable<Spec["workingBuild"]>>): Spec {
  return { ...spec, workingBuild: { ...(spec.workingBuild ?? defaultWorkingBuild()), ...patch } };
}

/**
 * A lightweight 0..1 completeness signal for the Guide panel. Not part of the
 * contract; derived from what's been captured so far.
 */
export function computeCompleteness(spec: Spec): number {
  const checks: boolean[] = [
    !!spec.brief.problem,
    !!spec.brief.goal,
    !!(spec.brief.user && spec.brief.moment),
    !!spec.brief.rootCause,
    !!spec.brief.scopeIncluded,
    !!(spec.outcome.userOutcome || spec.outcome.businessOutcome),
    spec.milestoneArtifacts.length > 0,
    spec.decisions.length > 0,
    spec.buildHandoffs.length > 0,
    spec.verification?.status === "verified",
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100) / 100;
}

/** Per-step progress mapped to that step's real captured content — a fallback
 * used when a live turn's guidePanel hints are absent (e.g. a seeded doc). */
export function stepProgress(spec: Spec, step: FlowStep): { done: number; total: number } {
  const b = spec.brief;
  switch (step) {
    case "understand_request":
      return count([!!b.goal, !!b.productContext]);
    case "identify_users":
      return count([!!b.user, !!b.moment, !!b.task]);
    case "assess_evidence":
      return count([
        spec.evidence.some((e) => e.step === step && e.kind === "fact"),
        !!spec.evidenceBrief || spec.evidence.some((e) => e.step === step && e.kind === "risk"),
      ]);
    case "find_root_cause":
      return count([
        spec.evidence.some((e) => e.step === step),
        !!b.rootCause,
      ]);
    case "define_problem":
      return count([!!b.problem]);
    case "set_scope":
      return count([!!b.scopeIncluded, !!b.scopeExcluded]);
    case "define_outcome":
      return count([
        !!(spec.outcome.userOutcome || spec.outcome.businessOutcome),
        !!(spec.outcome.successMetric || spec.outcome.qualitativeCondition),
      ]);
    case "set_criteria":
      return count([spec.decisions.some((d) => d.step === step)]);
    case "find_patterns":
      return count([spec.milestoneArtifacts.some((a) => a.kind === "pattern_shortlist")]);
    case "review_shortlist":
      return count([
        spec.milestoneArtifacts.some(
          (a) => a.kind === "pattern_shortlist" && a.status !== "exploring",
        ),
      ]);
    case "choose_direction":
      return count([
        spec.milestoneArtifacts.some(
          (a) => a.kind === "pattern_shortlist" && a.status === "selected",
        ),
      ]);
    case "refine_treatments":
      return count([
        spec.milestoneArtifacts.some((a) => a.kind === "wireframe" || a.kind === "hifi_design"),
      ]);
    case "select_for_review":
      return count([
        spec.milestoneArtifacts.some(
          (a) =>
            a.kind === "hifi_design" &&
            (a.status === "ready_for_review" || a.status === "approved_for_build"),
        ),
      ]);
    case "prepare_handoff":
      return count([spec.buildHandoffs.length > 0]);
    case "build_in_tool":
      return count([spec.buildHandoffs.some((h) => h.status === "sent") || !!spec.workingBuild]);
    case "verify_build":
      return count([spec.verification?.status === "verified"]);
  }
}

function count(checks: boolean[]): { done: number; total: number } {
  return { done: checks.filter(Boolean).length, total: checks.length };
}

/**
 * Reconstruct a step's captured items from the persistent spec (not from the
 * per-turn guidePanel). Used to render completed step cards so their content
 * stays available after the active step moves on.
 */
export function stepCapturedItems(spec: Spec, step: FlowStep): string[] {
  const items: string[] = [];
  const b = spec.brief;

  switch (step) {
    case "understand_request":
      if (b.goal) items.push(`Goal: ${b.goal}`);
      if (b.productContext) items.push(`Product context: ${b.productContext}`);
      if (b.assumedSolution) items.push(`Assumed solution: ${b.assumedSolution}`);
      break;
    case "identify_users":
      if (b.user) items.push(`User: ${b.user}`);
      if (b.moment) items.push(`Moment: ${b.moment}`);
      if (b.task) items.push(`Task: ${b.task}`);
      break;
    case "assess_evidence":
      spec.evidence
        .filter((e) => e.step === step)
        .forEach((e) => items.push(`${evidenceLabel(e.kind)}: ${e.text}`));
      break;
    case "find_root_cause":
      spec.evidence
        .filter((e) => e.step === step)
        .forEach((e) => items.push(`${evidenceLabel(e.kind)}: ${e.text}`));
      if (b.rootCause) items.push(`Root cause: ${b.rootCause}`);
      break;
    case "define_problem":
      if (b.problem) items.push(`Problem: ${b.problem}`);
      break;
    case "set_scope":
      if (b.scopeIncluded) items.push(`Scope: ${b.scopeIncluded}`);
      if (b.scopeExcluded) items.push(`Out of scope: ${b.scopeExcluded}`);
      break;
    case "define_outcome":
      if (spec.outcome.userOutcome) items.push(`User outcome: ${spec.outcome.userOutcome}`);
      if (spec.outcome.businessOutcome)
        items.push(`Business outcome: ${spec.outcome.businessOutcome}`);
      if (spec.outcome.successMetric) items.push(`Success metric: ${spec.outcome.successMetric}`);
      if (spec.outcome.qualitativeCondition)
        items.push(`Qualitative outcome: ${spec.outcome.qualitativeCondition}`);
      if (spec.outcome.measurementGap) items.push(`Measurement gap: ${spec.outcome.measurementGap}`);
      break;
    case "set_criteria":
    case "find_patterns":
    case "review_shortlist":
    case "choose_direction":
      spec.milestoneArtifacts
        .filter((a) => a.step === step)
        .forEach((a) => items.push(`${a.title} (${a.status})`));
      break;
    case "refine_treatments":
    case "select_for_review":
      spec.milestoneArtifacts
        .filter((a) => a.step === step)
        .forEach((a) => items.push(`${a.title} (${a.status})`));
      break;
    case "prepare_handoff":
      spec.buildHandoffs.forEach((h) => items.push(`${h.title} (${h.status})`));
      break;
    case "build_in_tool":
      if (spec.workingBuild?.buildUrl) items.push(`Build URL: ${spec.workingBuild.buildUrl}`);
      break;
    case "verify_build":
      if (spec.verification) {
        const v = spec.verification;
        items.push(
          `${v.reviewsPassed}/${v.reviewsTotal} reviews passed, ${v.requirementsVerified}/${v.requirementsTotal} requirements verified, ${v.criticalIssues} critical issues`,
        );
      }
      break;
  }

  spec.decisions
    .filter((d) => d.step === step && d.status === "active")
    .forEach((d) => items.push(`Decision: ${d.text}`));
  return items;
}

/** Strips a leading "Label: " prefix (e.g. "Known: ", "Root cause: ") so a
 * captured item reads as plain prose instead of a tagged record entry. */
function stripLabel(item: string): string {
  const idx = item.indexOf(": ");
  return idx === -1 ? item : item.slice(idx + 2);
}

/**
 * The Guide's tooltip summary for one step — "a five-second summary, not
 * the complete decision database." One concise line, never the tagged
 * Known/Assumed/Interpretation/Risk/Decision bullet list — that full record
 * is untouched in the spec and still reachable via stepCapturedItems()
 * behind a "View details" disclosure. Always the FULL text, never truncated
 * — a tooltip that cuts off its own content defeats the point of hovering
 * for more context; the tooltip's CSS wraps it rather than clamping it.
 * Prefers a single authoritative brief/outcome field per step; falls back to
 * the first one or two captured items (label stripped) for steps with no
 * single scalar field (e.g. assess_evidence, which aggregates multiple
 * evidence entries).
 */
export function stepSummaryLine(spec: Spec, step: FlowStep): string | null {
  const b = spec.brief;
  const direct = (() => {
    switch (step) {
      case "understand_request":
        return b.goal;
      case "define_problem":
        return b.problem;
      case "identify_users":
        return b.user && b.moment ? `${b.user} — ${b.moment}` : (b.user ?? b.moment);
      case "find_root_cause":
        return b.rootCause;
      case "set_scope":
        return b.scopeIncluded;
      case "define_outcome":
        return (
          spec.outcome.userOutcome ??
          spec.outcome.businessOutcome ??
          spec.outcome.successMetric ??
          spec.outcome.qualitativeCondition
        );
      default:
        return undefined;
    }
  })();
  if (direct && direct.trim()) return direct.trim();

  const items = stepCapturedItems(spec, step).map(stripLabel).filter(Boolean);
  if (!items.length) return null;
  return items.slice(0, 2).join("; ");
}

/**
 * The tooltip summary for a loop-stage header (e.g. "Frame the problem") —
 * an aggregate of its substeps' summaries. Only meaningful once the stage is
 * collapsed (all substeps done); returns null when nothing's captured yet.
 */
export function stageSummaryLine(spec: Spec, stage: LoopStage): string | null {
  const parts = stepsForStage(stage)
    .map((step) => stepSummaryLine(spec, step))
    .filter((s): s is string => !!s);
  if (!parts.length) return null;
  return parts.join("; ");
}

function evidenceLabel(kind: Spec["evidence"][number]["kind"]): string {
  switch (kind) {
    case "fact":
      return "Known";
    case "assumption":
      return "Assumed";
    case "interpretation":
      return "Interpretation";
    case "risk":
      return "Risk";
  }
}

// Re-export for convenience where a flat, ordered list of steps is handy.
export { FLOW_STEPS, LOOP_STAGE_OF };
