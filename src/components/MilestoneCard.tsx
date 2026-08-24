import type { ArtifactStatus, MilestoneArtifact } from "../types";

export const ARTIFACT_STATUS_LABEL: Record<ArtifactStatus, string> = {
  exploring: "Exploring",
  selected: "Selected",
  ready_for_review: "Ready for review",
  approved_for_build: "Approved for build",
  sent_to_claude: "Sent to Claude",
  working_build: "Working build",
  verified: "Verified",
};

/**
 * Compact Guide-rail capture of a milestone artifact — thumbnail (or a plain
 * placeholder when none exists yet), title as the caption, and a status pill.
 * One short supporting line only when it explains why/what state (CURRENT_
 * UPDATE_SPEC.md §1 "Capture rules").
 */
const REVIEWABLE_KINDS = new Set(["wireframe", "hifi_design", "working_build"]);

export function MilestoneCard({
  artifact,
  onOpenReview,
}: {
  artifact: MilestoneArtifact;
  onOpenReview?: (artifactId: string) => void;
}) {
  const reviewable = REVIEWABLE_KINDS.has(artifact.kind);
  return (
    <div className={`milestone-card status-${artifact.status}`}>
      <div className="milestone-card-thumb">
        {artifact.thumbnailUrl ? (
          <img src={artifact.thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <div className="milestone-card-thumb-placeholder" aria-hidden />
        )}
      </div>
      <div className="milestone-card-body">
        <div className="milestone-card-title-row">
          <span className="milestone-card-title">{artifact.title}</span>
          <span className="tag milestone-status-tag">{ARTIFACT_STATUS_LABEL[artifact.status]}</span>
        </div>
        {artifact.supportingLine && (
          <p className="milestone-card-sub">{artifact.supportingLine}</p>
        )}
        {reviewable && onOpenReview && (
          <button
            type="button"
            className="milestone-card-review-btn"
            onClick={() => onOpenReview(artifact.id)}
          >
            {artifact.status === "exploring" || artifact.status === "selected"
              ? "Run review"
              : "Open review"}
          </button>
        )}
      </div>
    </div>
  );
}
