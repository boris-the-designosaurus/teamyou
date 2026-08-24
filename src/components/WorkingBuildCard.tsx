import { useState } from "react";
import type { MilestoneArtifact, WorkingBuild } from "../types";

const STATUS_LABEL: Record<WorkingBuild["status"], string> = {
  not_reviewed: "Not reviewed",
  in_review: "In review",
  ready: "Ready",
  failed: "Failed",
};

/**
 * Working Build (CURRENT_UPDATE_SPEC.md §4C). Before any review runs it's
 * fine to show 0 started / 0 passed — never implied as failure. Review
 * actions reuse the Phase-4 Review workspace via the linked working_build
 * milestone artifact, so build review shares one implementation with design
 * review rather than a parallel UI.
 */
export function WorkingBuildCard(props: {
  workingBuild: WorkingBuild | undefined;
  reviewArtifact: MilestoneArtifact | undefined;
  onAttachUrl: (url: string) => void;
  onOpenReview: (artifactId: string) => void;
}) {
  const wb = props.workingBuild;
  const [editing, setEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState(wb?.buildUrl ?? "");

  if (!wb) {
    return (
      <div className="working-build-card empty">
        <p>No build URL attached yet. Send a build handoff, then paste the working preview URL here once it's ready.</p>
      </div>
    );
  }

  const showUrlInput = editing || !wb.buildUrl;

  return (
    <div className={`working-build-card status-${wb.status}`}>
      <div className="working-build-head">
        <span className="working-build-title">Working build</span>
        <span className="tag milestone-status-tag">{STATUS_LABEL[wb.status]}</span>
      </div>

      {showUrlInput ? (
        <div className="working-build-url-edit">
          <input
            placeholder="Paste the working preview URL…"
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
          />
          <button
            type="button"
            disabled={!draftUrl.trim()}
            onClick={() => {
              props.onAttachUrl(draftUrl.trim());
              setEditing(false);
            }}
          >
            {wb.buildUrl ? "Save" : "Attach URL"}
          </button>
          {wb.buildUrl && (
            <button type="button" onClick={() => { setDraftUrl(wb.buildUrl ?? ""); setEditing(false); }}>
              Cancel
            </button>
          )}
        </div>
      ) : (
        <a className="working-build-url" href={wb.buildUrl} target="_blank" rel="noreferrer">
          {wb.buildUrl}
        </a>
      )}

      <div className="working-build-stats">
        <span>
          <strong>{wb.reviewsStarted}</strong> started
        </span>
        <span>
          <strong>{wb.reviewsPassed}</strong> passed
        </span>
        {wb.totalReviewCategories !== undefined && (
          <span>
            <strong>{wb.totalReviewCategories}</strong> categories
          </span>
        )}
      </div>

      <div className="working-build-actions">
        {wb.buildUrl && !editing && (
          <button type="button" onClick={() => setEditing(true)}>
            Edit URL
          </button>
        )}
        <button type="button" disabled title="No linked Claude session yet">
          Open in Claude
        </button>
        {props.reviewArtifact && (
          <>
            <button type="button" onClick={() => props.onOpenReview(props.reviewArtifact!.id)}>
              Run review
            </button>
            <button type="button" onClick={() => props.onOpenReview(props.reviewArtifact!.id)}>
              Review stats
            </button>
          </>
        )}
      </div>
    </div>
  );
}
