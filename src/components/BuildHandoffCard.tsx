import { useState } from "react";
import type { BuildHandoff } from "../types";
import { SendIcon, NotesPencilIcon } from "../icons";

const STATUS_LABEL: Record<BuildHandoff["status"], string> = {
  drafting: "Drafting",
  ready: "Ready",
  sent: "Sent",
};

/**
 * Build Handoff — one or more (CURRENT_UPDATE_SPEC.md §4B). A compact list;
 * "Send all" only enables once every included handoff is ready (§H).
 */
export function BuildHandoffList(props: {
  handoffs: BuildHandoff[];
  onSave: (handoffId: string, patch: Partial<BuildHandoff>) => void;
  onSend: (handoffId: string) => void;
}) {
  if (!props.handoffs.length) return null;
  const pending = props.handoffs.filter((h) => h.status !== "sent");
  const allPendingReady = pending.length > 0 && pending.every((h) => h.status === "ready");

  return (
    <div className="handoff-list">
      {props.handoffs.map((h) => (
        <BuildHandoffCard
          key={h.id}
          handoff={h}
          onSave={(patch) => props.onSave(h.id, patch)}
          onSend={() => props.onSend(h.id)}
        />
      ))}
      {props.handoffs.length > 1 && pending.length > 0 && (
        <button
          type="button"
          className="handoff-send-all"
          disabled={!allPendingReady}
          title={allPendingReady ? "Send every ready handoff" : "Every handoff must be Ready first"}
          onClick={() => pending.forEach((h) => props.onSend(h.id))}
        >
          Send all
        </button>
      )}
    </div>
  );
}

function BuildHandoffCard(props: {
  handoff: BuildHandoff;
  onSave: (patch: Partial<BuildHandoff>) => void;
  onSend: () => void;
}) {
  const { handoff } = props;
  const [expanded, setExpanded] = useState(false);
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(handoff.title);
  const [draftInstructions, setDraftInstructions] = useState(handoff.instructions);

  const shown = expanded ? handoff.instructions : handoff.instructions.slice(0, 5);
  const remaining = handoff.instructions.length - shown.length;

  function startEdit() {
    setDraftTitle(handoff.title);
    setDraftInstructions(handoff.instructions);
    setEditing(true);
  }
  function save() {
    props.onSave({ title: draftTitle, instructions: draftInstructions });
    setEditing(false);
  }

  return (
    <div className={`handoff-card status-${handoff.status}`}>
      <div className="handoff-card-head">
        {editing ? (
          <input
            className="handoff-title-input"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
          />
        ) : (
          <span className="handoff-card-title">{handoff.title}</span>
        )}
        <span className="tag milestone-status-tag">{STATUS_LABEL[handoff.status]}</span>
      </div>

      {handoff.designThumbnailUrl && (
        <div className="handoff-card-thumb">
          <img src={handoff.designThumbnailUrl} alt="" loading="lazy" />
        </div>
      )}

      {editing ? (
        <ul className="handoff-instructions editing">
          {draftInstructions.map((instr, idx) => (
            <li key={instr.id}>
              <input
                className="handoff-instr-label-input"
                value={instr.label}
                onChange={(e) =>
                  setDraftInstructions((prev) =>
                    prev.map((p, i) => (i === idx ? { ...p, label: e.target.value } : p)),
                  )
                }
              />
              <textarea
                className="handoff-instr-text-input"
                rows={2}
                value={instr.text}
                onChange={(e) =>
                  setDraftInstructions((prev) =>
                    prev.map((p, i) => (i === idx ? { ...p, text: e.target.value } : p)),
                  )
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="handoff-instructions">
          {shown.map((i) => (
            <li key={i.id}>
              <strong>{i.label}:</strong> {i.text}
              {rationaleOpen && i.rationale && (
                <span className="handoff-instr-rationale">{i.rationale}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {!editing && (
        <div className="handoff-meta-row">
          {remaining > 0 && (
            <button type="button" className="handoff-more-btn" onClick={() => setExpanded(true)}>
              {remaining} more requirement{remaining === 1 ? "" : "s"}
            </button>
          )}
          {handoff.instructions.some((i) => i.rationale) && (
            <button
              type="button"
              className="handoff-more-btn"
              onClick={() => setRationaleOpen((v) => !v)}
            >
              {rationaleOpen ? "Hide decision rationale" : "Decision rationale"}
            </button>
          )}
        </div>
      )}
      {handoff.unresolvedDecisionCount > 0 && (
        <p className="handoff-unresolved">
          {handoff.unresolvedDecisionCount} unresolved decision
          {handoff.unresolvedDecisionCount === 1 ? "" : "s"}
        </p>
      )}

      <div className="handoff-actions">
        {editing ? (
          <>
            <button type="button" className="handoff-save-btn" onClick={save}>
              Save
            </button>
            <button type="button" className="handoff-cancel-btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="handoff-open-btn"
              onClick={() => {
                setExpanded(true);
                setRationaleOpen(true);
              }}
            >
              Open
            </button>
            <button type="button" className="handoff-edit-btn" onClick={startEdit} title="Edit">
              <NotesPencilIcon />
            </button>
            <button
              type="button"
              className="handoff-send-btn"
              onClick={props.onSend}
              disabled={handoff.status !== "ready"}
              title={handoff.status === "drafting" ? "Still drafting — not ready to send" : undefined}
            >
              <SendIcon /> {handoff.status === "sent" ? "Sent" : "Send to Claude"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
