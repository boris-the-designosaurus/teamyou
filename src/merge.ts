// ─────────────────────────────────────────────────────────────────────────
// Rule 3 — Explicit merge semantics. The two most safety-critical places in
// the app are this file and the CoachTurnResponse type. Get them right before
// rendering anything.
//
//   • Scalars overwrite. brief.problem, brief.goal, workflow.summary, etc. —
//     the new value replaces the old if present, is left untouched if absent.
//   • Arrays append. decisions, openQuestions, acceptanceCriteria, todos,
//     workflow.steps — new items are appended with client-assigned IDs. They do
//     NOT replace the existing array.
//   • Updates to existing array items are out of scope for v1's happy path.
//   • activityEvents always append.
//
// Rule 2 — The client is the ID authority, not the model. Proposed* items carry
// no id; we assign a stable one here. For linkedAcceptanceCriterionRef, the
// Coach references a criterion loosely (by text or 1-based order within the same
// turn); we resolve it to the real id during merge.
// ─────────────────────────────────────────────────────────────────────────

import type {
  ActivityEvent,
  ProposedActivityEvent,
  Spec,
  SpecUpdates,
} from "./types";

export type MakeId = () => string;

export const defaultMakeId: MakeId = () => crypto.randomUUID();

/**
 * Merge a CoachTurnResponse's specUpdates into the current Spec, returning a
 * new Spec (pure — does not mutate the input). `makeId` assigns stable client
 * IDs to newly appended array items.
 */
export function mergeSpec(
  spec: Spec,
  updates: SpecUpdates,
  makeId: MakeId = defaultMakeId,
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
    completeness: spec.completeness,
  };

  // ── Brief: scalars overwrite (only when present) ──
  if (updates.brief) {
    for (const key of ["problem", "goal", "context", "risk"] as const) {
      if (updates.brief[key] !== undefined) next.brief[key] = updates.brief[key];
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

  // ── Todos: append, resolving linkedAcceptanceCriterionRef → real id ──
  if (updates.todos) {
    for (const t of updates.todos) {
      next.rules.todos.push({
        id: makeId(),
        title: t.title,
        description: t.description,
        status: t.status,
        linkedAcceptanceCriterionId: resolveCriterionRef(
          t.linkedAcceptanceCriterionRef,
          criteriaAddedThisTurn,
        ),
      });
    }
  }

  // ── Review: scalars overwrite (type exists; not built in v1) ──
  if (updates.review) {
    if (updates.review.summary !== undefined) {
      next.review.summary = updates.review.summary;
    }
    if (updates.review.status !== undefined) {
      next.review.status = updates.review.status;
    }
  }

  // ── Decisions: append ──
  if (updates.decisions) {
    for (const d of updates.decisions) {
      next.decisions.push({
        id: makeId(),
        text: d.text,
        step: d.step,
        source: d.source,
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

  next.completeness = computeCompleteness(next);
  return next;
}

/**
 * Resolve a loose criterion reference (text or 1-based order) against the
 * criteria added in the same turn. Returns undefined if unresolvable.
 */
function resolveCriterionRef(
  ref: string | undefined,
  criteriaThisTurn: { id: string; text: string }[],
): string | undefined {
  if (!ref) return undefined;

  // Exact text match first.
  const byText = criteriaThisTurn.find((c) => c.text === ref);
  if (byText) return byText.id;

  // Fall back to 1-based order (e.g. "1", "2").
  const order = Number.parseInt(ref, 10);
  if (Number.isInteger(order) && order >= 1 && order <= criteriaThisTurn.length) {
    return criteriaThisTurn[order - 1].id;
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
    label: e.label,
    description: e.description,
    createdAt: now,
  }));
}

/**
 * A lightweight 0..1 completeness signal for the Guide panel. Not part of the
 * contract; derived from what's been captured so far.
 */
export function computeCompleteness(spec: Spec): number {
  const checks: boolean[] = [
    !!spec.brief.problem,
    !!spec.brief.goal,
    !!spec.brief.context,
    !!spec.brief.risk,
    spec.workflow.steps.length > 0,
    spec.rules.acceptanceCriteria.length > 0,
    spec.rules.todos.length > 0,
    spec.decisions.length > 0,
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100) / 100;
}
