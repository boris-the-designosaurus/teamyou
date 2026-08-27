import { FLOW_STEP_LABEL, type Message, type WorkItem } from "./types";
import { setMilestoneArtifactStatus } from "./merge";

/** Approving a reviewed design is a product transition, not a model decision.
 * Persist the baseline and enter specification before asking the Coach for the
 * first missing build detail. */
export function approveDesignForBuild(
  workItem: WorkItem,
  artifactId: string,
  createdAt: string,
  markerId: string,
): WorkItem {
  const artifact = workItem.spec.milestoneArtifacts.find((item) => item.id === artifactId);
  if (!artifact || artifact.kind === "wireframe") return workItem;

  const marker: Message = {
    id: markerId,
    role: "system",
    content: `${FLOW_STEP_LABEL.prepare_handoff} started`,
    createdAt,
  };
  return {
    ...workItem,
    currentStep: "prepare_handoff",
    spec: setMilestoneArtifactStatus(workItem.spec, artifactId, "approved_for_build"),
    messages:
      workItem.currentStep === "prepare_handoff"
        ? workItem.messages
        : [...workItem.messages, marker],
    updatedAt: createdAt,
  };
}

export function buildApprovalCoachPrompt(title: string): string {
  return `Approved design for build: ${title}. Begin the Complete the specification step now. Preserve this approved design as the build baseline and ask only for the first genuinely missing implementation detail.`;
}
