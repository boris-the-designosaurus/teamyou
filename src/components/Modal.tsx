import type { ReactNode } from "react";
import type { WorkItemType } from "../types";

const TYPE_LABELS: Record<WorkItemType, string> = {
  feature_spec: "Feature spec",
  agent_spec: "Agent spec",
  case_study: "Case study",
  presentation: "Presentation",
};

export type MainTab = "work" | "spec";

/**
 * The single v1 modal: a document-titled header, a small type selector, a close
 * (reset) button, and the Work / Spec top tabs.
 */
export function Modal(props: {
  title: string;
  mainTab: MainTab;
  onChangeTab: (tab: MainTab) => void;
  workItemType: WorkItemType;
  onChangeType: (type: WorkItemType) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const empty = props.title === "New…" || props.title.trim() === "";

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <header className="modal-header">
          <div className={`modal-title${empty ? " empty" : ""}`}>{props.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <select
              className="type-mini"
              value={props.workItemType}
              onChange={(e) => props.onChangeType(e.target.value as WorkItemType)}
              title="Spec type"
            >
              {(Object.keys(TYPE_LABELS) as WorkItemType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <button
              className="icon-btn"
              type="button"
              onClick={props.onClose}
              title="Close / start new"
            >
              ✕
            </button>
          </div>
        </header>

        <nav className="tabs">
          <button
            className={`tab${props.mainTab === "work" ? " active" : ""}`}
            type="button"
            onClick={() => props.onChangeTab("work")}
          >
            Work
          </button>
          <button
            className={`tab${props.mainTab === "spec" ? " active" : ""}`}
            type="button"
            onClick={() => props.onChangeTab("spec")}
          >
            Spec
          </button>
        </nav>

        <div className="modal-body">{props.children}</div>
      </div>
    </div>
  );
}

export { TYPE_LABELS };
