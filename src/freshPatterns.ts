import type { WorkItem } from "./types";

const FRESH_PATTERN_REQUEST =
  /\b(?:generate|find|search|retrieve|replace|regenerate|refresh)\b[\s\S]{0,40}\b(?:fresh|new|different|more)?\s*(?:patterns?|pattern cards?|shortlist|examples?)\b/i;

export function requestsFreshPatternSearch(text: string): boolean {
  return FRESH_PATTERN_REQUEST.test(text.trim());
}

/** Remove the saved shortlist before asking the Coach for a genuinely new set. */
export function resetForFreshPatternSearch(item: WorkItem): WorkItem {
  const patternIds = new Set(
    item.spec.milestoneArtifacts
      .filter((artifact) => artifact.kind === "pattern_shortlist")
      .map((artifact) => artifact.id),
  );
  if (patternIds.size === 0) return { ...item, currentStep: "find_patterns" };

  return {
    ...item,
    currentStep: "find_patterns",
    spec: {
      ...item.spec,
      milestoneArtifacts: item.spec.milestoneArtifacts.filter(
        (artifact) => artifact.kind !== "pattern_shortlist",
      ),
    },
    messages: item.messages.map((message) => {
      if (!message.milestoneArtifactIds) return message;
      const remaining = message.milestoneArtifactIds.filter((id) => !patternIds.has(id));
      return {
        ...message,
        milestoneArtifactIds: remaining.length > 0 ? remaining : undefined,
      };
    }),
  };
}
