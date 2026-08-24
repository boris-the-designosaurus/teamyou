import type { MilestoneArtifact } from "../types";
import { CheckmarkIcon } from "../icons";

const CHOSEN_STATUSES = new Set(["selected", "ready_for_review", "approved_for_build"]);

/**
 * The pattern/wireframe/treatment "Choose" grid shown inline in chat during
 * Explore directions and Design the solution — a genuine shortlist the user
 * picks from (not the old one-option-at-a-time micro-decision pattern).
 * Pattern shortlists are multi-select; every other kind is exclusive — see
 * chooseMilestoneArtifact in merge.ts.
 */
export function DirectionCards(props: {
  artifacts: MilestoneArtifact[];
  onChoose: (artifactId: string) => void;
  onContinue?: (selected: MilestoneArtifact[]) => void;
}) {
  const { artifacts, onChoose, onContinue } = props;
  if (!artifacts.length) return null;

  const isShortlist = artifacts[0].kind === "pattern_shortlist";
  const chosen = artifacts.filter((a) => CHOSEN_STATUSES.has(a.status));

  return (
    <div className="direction-cards-wrap">
      <div className="direction-cards">
        {artifacts.map((a) => {
          const isChosen = CHOSEN_STATUSES.has(a.status);
          return (
            <div key={a.id} className={`direction-card${isChosen ? " chosen" : ""}`}>
              <div className="direction-card-thumb">
                {a.thumbnailUrl ? (
                  <img src={a.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                  <div className="direction-card-thumb-placeholder" aria-hidden />
                )}
              </div>
              <div className="direction-card-body">
                <div className="direction-card-title-row">
                  <span className="direction-card-title">{a.title}</span>
                  <button
                    type="button"
                    className={`direction-card-choose${isChosen ? " chosen" : ""}`}
                    onClick={() => onChoose(a.id)}
                    title={isChosen ? "Chosen — click to unselect" : "Choose"}
                    aria-pressed={isChosen}
                  >
                    <CheckmarkIcon />
                    {isChosen ? "Chosen" : "Choose"}
                  </button>
                </div>
                {a.supportingLine && <p className="direction-card-sub">{a.supportingLine}</p>}
              </div>
            </div>
          );
        })}
      </div>
      {isShortlist && onContinue && (
        <div className="direction-cards-actionbar">
          <span className="direction-cards-count">{chosen.length} selected</span>
          <button
            type="button"
            className="direction-cards-continue"
            disabled={chosen.length === 0}
            onClick={() => onContinue(chosen)}
          >
            Generate wireframes
          </button>
        </div>
      )}
    </div>
  );
}
