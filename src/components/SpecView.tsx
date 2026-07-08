import type { Spec, WorkItemType } from "../types";

const RULES_LABEL: Record<WorkItemType, string> = {
  feature_spec: "Rules",
  agent_spec: "Agent rules",
  case_study: "Rules",
  presentation: "Rules",
};

const STRUCTURE_LABEL: Record<WorkItemType, string> = {
  feature_spec: "Workflow",
  agent_spec: "Agent process",
  case_study: "Structure",
  presentation: "Structure",
};

/**
 * The Spec tab document — the conversation rendered as a reviewable spec:
 * Summary, Key decisions, Rules, and Structure cards, all from merged state.
 */
export function SpecDoc(props: { spec: Spec; type: WorkItemType }) {
  const { spec, type } = props;
  const { brief, workflow, rules, decisions } = spec;

  const summaryParas = [brief.problem, brief.goal, brief.context, brief.risk].filter(
    (x): x is string => !!x,
  );
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

      {/* Summary */}
      {(summaryParas.length > 0 || workflow.summary) && (
        <Card title="Summary">
          {summaryParas.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {workflow.summary && <p>{workflow.summary}</p>}
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

      {/* Rules */}
      {(rules.summary ||
        rules.acceptanceCriteria.length > 0 ||
        rules.todos.length > 0) && (
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
          {rules.todos.length > 0 && (
            <>
              <div className="mini-head">Todos</div>
              <ul>
                {rules.todos.map((t) => (
                  <li key={t.id}>
                    <span className="tag">{t.status}</span>
                    {t.title}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {/* Structure / workflow */}
      {workflow.steps.length > 0 && (
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
        </Card>
      )}
    </div>
  );
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
