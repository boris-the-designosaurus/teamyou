import type { MilestoneArtifact, Spec, VerificationResult } from "../types";
import { REVIEW_CATEGORIES, REVIEW_CATEGORY_LABEL } from "../types";
import { countPassedCategories, reviewCategoryState } from "../merge";

const STATUS_LABEL: Record<VerificationResult["status"], string> = {
  not_reviewed: "Not reviewed",
  in_progress: "In progress",
  verified: "Verified",
  blocked: "Blocked",
};

/**
 * "Final review" — CURRENT_UPDATE_SPEC.md §5. Shows the compact stat summary
 * (never every finding — link out to Review Checks for that) plus short
 * outcome bullets for categories that passed. "Mark verified" is a
 * deliberate user action, refused while a blocker is open (§J), and it
 * captures the final thumbnail/status onto the working_build artifact
 * (ArtifactStatus "verified") rather than a separate record.
 */
export function VerificationCard(props: {
  spec: Spec;
  buildArtifact: MilestoneArtifact;
  onMarkVerified: () => void;
  onOpenReview: (artifactId: string) => void;
}) {
  const { spec, buildArtifact } = props;
  const v = spec.verification;
  const findings = spec.reviewFindings.filter((f) => f.artifactId === buildArtifact.id);
  const hasRun = findings.length > 0;

  const status = v?.status ?? (hasRun ? "in_progress" : "not_reviewed");
  const reviewsPassed = v?.reviewsPassed ?? countPassedCategories(findings, REVIEW_CATEGORIES);
  const reviewsTotal = v?.reviewsTotal ?? REVIEW_CATEGORIES.length;
  const requirementsTotal = v?.requirementsTotal ?? spec.rules.acceptanceCriteria.length;
  const requirementsVerified =
    v?.requirementsVerified ?? spec.rules.acceptanceCriteria.filter((c) => c.status === "met").length;
  const criticalIssues =
    v?.criticalIssues ?? findings.filter((f) => f.status === "open" && f.severity === "blocker").length;

  const passedCategories = REVIEW_CATEGORIES.filter(
    (cat) => hasRun && reviewCategoryState(findings, cat) === "passed",
  );

  return (
    <div className={`verification-card status-${status}`}>
      <div className="verification-head">
        <span className="verification-title">Final review</span>
        <span className="tag milestone-status-tag">{STATUS_LABEL[status]}</span>
      </div>

      <div className="verification-stats">
        <div className="verification-stat">
          <span className="verification-stat-value">
            {reviewsPassed}/{reviewsTotal}
          </span>
          <span className="verification-stat-label">Reviews complete</span>
        </div>
        <div className="verification-stat">
          <span className="verification-stat-value">
            {requirementsVerified}/{requirementsTotal}
          </span>
          <span className="verification-stat-label">Requirements verified</span>
        </div>
        <div className="verification-stat">
          <span className="verification-stat-value">{hasRun ? criticalIssues : "–"}</span>
          <span className="verification-stat-label">Critical issues</span>
        </div>
      </div>

      {passedCategories.length > 0 && (
        <ul className="verification-outcome">
          {passedCategories.map((cat) => (
            <li key={cat}>{REVIEW_CATEGORY_LABEL[cat]} confirmed.</li>
          ))}
          {criticalIssues === 0 && hasRun && <li>No critical blockers remain.</li>}
        </ul>
      )}

      <div className="verification-actions">
        <button type="button" onClick={() => props.onOpenReview(buildArtifact.id)}>
          Open review
        </button>
        <button type="button" disabled title="No linked Claude session yet">
          Open in Claude
        </button>
        <button
          type="button"
          className="verification-verify-btn"
          onClick={props.onMarkVerified}
          disabled={!hasRun || criticalIssues > 0 || status === "verified"}
          title={
            criticalIssues > 0
              ? "Resolve the open blocker(s) before marking verified"
              : !hasRun
                ? "Run a review first"
                : undefined
          }
        >
          {status === "verified" ? "Verified" : "Mark verified"}
        </button>
      </div>
    </div>
  );
}
