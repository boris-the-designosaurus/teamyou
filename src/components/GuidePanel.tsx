import {
  SPEC_STEPS,
  type GuidePanel as GuidePanelHints,
  type Spec,
  type SpecStep,
} from "../types";

// Surface labels for the guide (friendlier than the internal step keys).
const STEP_DISPLAY: Record<SpecStep, string> = {
  brief: "Brief",
  workflow: "Structure",
  rules: "Tasks",
  review: "Review",
};

/**
 * The Guide rail. Step cards read the active step from the top-level activeStep
 * (Rule 1); a hint card below reflects the per-turn presentational hints and
 * live completeness.
 */
export function GuideRail(props: {
  activeStep: SpecStep;
  hints: GuidePanelHints | null;
  spec: Spec;
}) {
  const { activeStep, hints, spec } = props;
  const pct = Math.round((spec.completeness ?? 0) * 100);
  const activeIdx = SPEC_STEPS.indexOf(activeStep);

  return (
    <div>
      <div className="step-cards">
        {SPEC_STEPS.map((step, i) => {
          const state =
            step === activeStep ? "active" : i < activeIdx ? "done" : "todo";
          return (
            <div key={step} className={`step-card ${state}`}>
              <span className="step-ic">{state === "done" ? "✓" : "→"}</span>
              <span className="step-name">{STEP_DISPLAY[step]}</span>
              {step === "review" && <span className="step-meta">v2</span>}
            </div>
          );
        })}
      </div>

      <div className="guide-hint">
        <h4>{hints?.title ?? STEP_DISPLAY[activeStep]}</h4>
        <p>{hints?.summary ?? "Start the conversation to build the spec."}</p>

        {hints?.nextPrompt && (
          <div className="next-prompt">
            <span className="lbl">Next</span>
            {hints.nextPrompt}
          </div>
        )}

        <div className="progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="progress-label">
            {hints?.progressLabel ?? `${pct}% captured`}
          </span>
        </div>
      </div>
    </div>
  );
}
