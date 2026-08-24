import { useState } from "react";
import type { Attachment, Spec, Todo, WorkItemType } from "../types";
import {
  attachmentsForSection,
  resolvePinnedAttachment,
  type ResolveTarget,
} from "../attachments";
import { ChevronDownIcon } from "../icons";

const RULES_LABEL: Record<WorkItemType, string> = {
  feature_spec: "Rules",
  agent_spec: "Agent rules",
  design_project: "Requirements",
  case_study: "Rules",
  presentation: "Rules",
};

const STRUCTURE_LABEL: Record<WorkItemType, string> = {
  feature_spec: "Workflow",
  agent_spec: "Agent process",
  design_project: "Design direction",
  case_study: "Structure",
  presentation: "Structure",
};

const REVIEW_STATUS_LABEL: Record<string, string> = {
  not_ready: "Not ready",
  ready: "Ready for review",
  in_review: "In review",
  needs_revision: "Needs revision",
  passed: "Passed",
};

/**
 * The Spec tab document — the conversation rendered as a reviewable spec.
 * Attachments appear as evidence grouped under the section (or todo) they
 * support, so each part of the work answers "what evidence backs this?".
 */
export function SpecDoc(props: {
  spec: Spec;
  type: WorkItemType;
  onPinTodoAttachment?: (todoId: string, attachmentId: string) => void;
  onFocusTarget?: (target: ResolveTarget) => void;
}) {
  const { spec, type } = props;
  const { brief, workflow, rules, decisions, review } = spec;

  const summaryParas = [
    brief.problem,
    brief.goal,
    brief.context,
    brief.designDirection,
    brief.finalCopy,
    brief.risk,
  ].filter((x): x is string => !!x);

  // Spec-scoped rules evidence only — todo evidence renders under each todo.
  const rulesSectionEvidence = (spec.attachments ?? []).filter(
    (a) => a.section === "specify_build" && (a.scope ?? "spec") === "spec",
  );
  const reviewEvidence = attachmentsForSection(spec, "specify_build");
  const workflowEvidence = attachmentsForSection(spec, "explore");
  const briefEvidence = attachmentsForSection(spec, "frame");

  // High-signal spec artifact (pinned or milestone) — surfaced at the top.
  const highlight = resolvePinnedAttachment(spec, { kind: "spec" });
  const showHighlight = highlight && (highlight.isPinned || highlight.isMilestone);
  // A general rollup artifact to anchor the todos when a todo has no own shot.
  const todosRollup = resolvePinnedAttachment(spec, { kind: "all_todos" });

  const hasAnything =
    summaryParas.length > 0 ||
    decisions.length > 0 ||
    rules.acceptanceCriteria.length > 0 ||
    rules.todos.length > 0 ||
    workflow.steps.length > 0;

  return (
    <div className="spec-doc">
      {!hasAnything && (
        <div className="spec-card">
          <p className="spec-empty">
            Nothing captured yet. Head to the Work tab and describe what you're
            building — the spec fills in here as you talk.
          </p>
        </div>
      )}

      {showHighlight && (
        <div className="spec-milestone-row">
          <span className="spec-milestone-dot" aria-hidden />
          <span className="spec-milestone-label">Latest milestone</span>
          <span className="spec-milestone-title">{highlight!.label}</span>
          <span className="spec-milestone-time">
            {shortWhen(highlight!.createdAt)}
          </span>
          <a
            className="spec-milestone-link"
            href={highlight!.url}
            target="_blank"
            rel="noreferrer"
          >
            View artifact
          </a>
        </div>
      )}

      {/* Summary — Brief evidence */}
      {(summaryParas.length > 0 || workflow.summary || briefEvidence.length > 0) && (
        <Card title="Summary">
          {summaryParas.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {workflow.summary && <p>{workflow.summary}</p>}
          <SectionEvidence items={briefEvidence} />
        </Card>
      )}

      {/* Key decisions */}
      {decisions.length > 0 && (
        <Card title="Key decisions">
          <ul>
            {decisions.map((d) => (
              <li key={d.id}>{d.text}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Rules — section evidence + per-todo evidence */}
      {(rules.summary ||
        rules.acceptanceCriteria.length > 0 ||
        rules.todos.length > 0 ||
        rulesSectionEvidence.length > 0) && (
        <Card title={RULES_LABEL[type]}>
          {rules.summary && <p>{rules.summary}</p>}
          {rules.acceptanceCriteria.length > 0 && (
            <ul>
              {rules.acceptanceCriteria.map((c) => (
                <li key={c.id}>
                  {c.text}
                  {c.status === "locked" && <span className="tag">locked</span>}
                </li>
              ))}
            </ul>
          )}
          <SectionEvidence items={rulesSectionEvidence} />

          {rules.todos.length > 0 && (
            <>
              <button
                type="button"
                className="mini-head mini-head-btn"
                onClick={() => props.onFocusTarget?.({ kind: "all_todos" })}
                title="Focus all todos"
              >
                Todos
              </button>
              {todosRollup && todosRollup.scope === "all_todos" && (
                <SectionEvidence items={[todosRollup]} />
              )}
              <ul className="todo-list">
                {rules.todos.map((t) => (
                  <TodoRow
                    key={t.id}
                    todo={t}
                    spec={spec}
                    onPin={
                      props.onPinTodoAttachment
                        ? (attId) => props.onPinTodoAttachment!(t.id, attId)
                        : undefined
                    }
                    onFocus={props.onFocusTarget}
                  />
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {/* Review */}
      {(review.summary || review.status || reviewEvidence.length > 0) && (
        <Card title="Review">
          {review.status && (
            <p>
              <span className="tag">
                {REVIEW_STATUS_LABEL[review.status] ?? review.status}
              </span>
            </p>
          )}
          {review.summary && <p>{review.summary}</p>}
          <SectionEvidence items={reviewEvidence} />
        </Card>
      )}

      {/* Structure / workflow */}
      {(workflow.steps.length > 0 || workflowEvidence.length > 0) && (
        <Card title={STRUCTURE_LABEL[type]}>
          <ul>
            {[...workflow.steps]
              .sort((a, b) => a.order - b.order)
              .map((s) => (
                <li key={s.id}>
                  <strong>{s.title}</strong>
                  {s.description && <> — {s.description}</>}
                </li>
              ))}
          </ul>
          <SectionEvidence items={workflowEvidence} />
        </Card>
      )}
    </div>
  );
}

/**
 * A todo row: compact by default (status · title · evidence chips), expands
 * inline to show the full attachment set with a larger primary preview and
 * pin/unpin controls. Expansion is supporting evidence — not a gallery.
 */
function TodoRow(props: {
  todo: Todo;
  spec: Spec;
  onPin?: (attachmentId: string) => void;
  onFocus?: (target: ResolveTarget) => void;
}) {
  const { todo, spec, onPin, onFocus } = props;
  const [open, setOpen] = useState(false);

  // Expanding a todo makes it the active work context (drives the Guide's
  // current artifact); collapsing returns focus to the spec. Keep the focus
  // side-effect out of the setState updater (StrictMode double-invokes those).
  const toggle = () => {
    const next = !open;
    setOpen(next);
    onFocus?.(next ? { kind: "todo", id: todo.id } : { kind: "spec" });
  };
  const atts = todo.attachments ?? [];
  // Primary = manually pinned, else resolver-selected (most recent, then fallback).
  const primary = resolvePinnedAttachment(spec, { kind: "todo", id: todo.id });
  const primaryOnTodo = !!primary && atts.some((a) => a.id === primary.id);
  const others = primaryOnTodo
    ? atts.filter((a) => a.id !== primary!.id)
    : atts;

  return (
    <li className={`todo-row${open ? " open" : ""}`}>
      <button
        type="button"
        className="todo-row-head"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="tag">{todo.status}</span>
        <span className="todo-title">{todo.title}</span>
        {atts.length > 0 && <span className="todo-evi-count">{atts.length}</span>}
        <ChevronDownIcon className="todo-chevron" aria-hidden />
      </button>

      {!open && atts.length > 0 && <SectionEvidence items={atts} />}

      {open && (
        <div className="todo-expanded">
          {todo.description && <p className="todo-desc">{todo.description}</p>}
          {atts.length === 0 ? (
            <p className="todo-noevi">No evidence attached to this todo yet.</p>
          ) : (
            <>
              {primaryOnTodo && (
                <div className="todo-primary">
                  <a
                    className="evidence-feature"
                    href={primary!.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img src={primary!.url} alt={primary!.label} loading="lazy" />
                  </a>
                  <div className="todo-att-meta">
                    <span className="evidence-name">{primary!.label}</span>
                    {primary!.isPinned && (
                      <span className="evidence-flag">Pinned</span>
                    )}
                    <span className="todo-att-time">
                      {shortWhen(primary!.createdAt)}
                    </span>
                    {onPin && (
                      <button
                        type="button"
                        className="pin-btn"
                        onClick={() => onPin(primary!.id)}
                      >
                        {primary!.isPinned ? "Unpin" : "Pin"}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {others.length > 0 && (
                <div className="todo-others">
                  {others.map((a) => (
                    <div key={a.id} className="todo-other">
                      <a
                        className="evidence-card"
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        title={a.label}
                      >
                        <img src={a.url} alt="" loading="lazy" />
                        <span>{a.label}</span>
                      </a>
                      {onPin && (
                        <button
                          type="button"
                          className="pin-btn small"
                          onClick={() => onPin(a.id)}
                        >
                          Pin
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * In the Spec body, evidence is always compact thumbnail chips — no large
 * previews interrupting the read. Pinned/milestone chips get a subtle accent;
 * the full-size preview lives in the Screens panel or an expanded detail view.
 */
function SectionEvidence({ items }: { items: Attachment[] }) {
  if (!items.length) return null;
  return (
    <div className="evidence">
      {items.map((a) => (
        <a
          key={a.id}
          className={`evidence-card${a.isPinned || a.isMilestone ? " accent" : ""}`}
          href={a.url}
          target="_blank"
          rel="noreferrer"
          title={a.label}
        >
          <img src={a.url} alt="" loading="lazy" />
          <span>{a.label}</span>
          {a.isPinned && <span className="evidence-pin" aria-hidden />}
        </a>
      ))}
    </div>
  );
}

/** Compact relative timestamp for the milestone row. */
function shortWhen(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="spec-card">
      <button className="edit-pencil" type="button" title="Edit — coming soon" disabled>
        ✎
      </button>
      <h3>{props.title}</h3>
      {props.children}
    </div>
  );
}
