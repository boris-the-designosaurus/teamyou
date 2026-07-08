import type { Spec, WorkItemType } from "../types";
import { TYPE_LABELS } from "./Modal";

/**
 * The Screens rail: a process map of the captured workflow. v1 renders the
 * linear ordered steps as a node flow (styled like the target design). Full
 * branching — decision diamonds, Yes/No, exception paths — needs the deferred
 * workflow.branches data model + Coach support; flagged below.
 */
export function ProcessMap(props: { spec: Spec; type: WorkItemType; title: string }) {
  const steps = [...props.spec.workflow.steps].sort((a, b) => a.order - b.order);
  const goal = props.spec.brief.goal ?? props.spec.brief.problem;

  return (
    <div>
      <div className="screens-intro">
        <span className="dl">↓</span>
        <div>
          <h4>{props.type === "agent_spec" ? "Agent process map" : "Process map"}</h4>
          <p>Shows how the work moves from start to finish, step by step.</p>
        </div>
      </div>

      <div className="map-canvas">
        <div className="map-node trigger">
          <strong>{props.title === "New…" ? TYPE_LABELS[props.type] : props.title}</strong>
          {goal && <span className="m-sub">{goal}</span>}
        </div>

        {steps.length === 0 && (
          <div className="map-note">
            No steps captured yet. Move through the <b>Structure</b> step in the
            Work tab and the flow will render here.
          </div>
        )}

        {steps.map((s) => (
          <div key={s.id} style={{ display: "contents" }}>
            <div className="map-arrow" />
            <div className="map-node">
              <span className="m-ic">{s.order}</span>
              {s.title}
            </div>
          </div>
        ))}
      </div>

      {steps.length > 0 && (
        <div className="map-note">
          Branching paths (decision points, Yes/No, exception routes) render once
          workflow branches are captured — deferred in v1.
        </div>
      )}
    </div>
  );
}
