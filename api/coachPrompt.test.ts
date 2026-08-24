import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./coachPrompt";

function promptAt(activeStep: Parameters<typeof buildSystemPrompt>[0]["activeStep"]) {
  return buildSystemPrompt({
    workItemType: "design_project",
    workMode: "design_exploration",
    activeStep,
    specSnapshot: {},
  });
}

describe("coach flow boundaries", () => {
  it("keeps evidence questions out of Understand the request", () => {
    const prompt = promptAt("understand_request");
    expect(prompt).toContain(
      "Do not ask for analytics, evidence, target users, workflow timing, root cause, scope, or success measures here.",
    );
    expect(prompt).toContain(
      'Never ask an evidence question while activeStep is "understand_request" or "define_problem".',
    );
  });

  it("teaches the portfolio redesign case to advance to Define the problem", () => {
    const prompt = promptAt("understand_request");
    expect(prompt).toContain('"activeStep": "define_problem"');
    expect(prompt).toContain('"need": "Visitor barrier"');
    expect(prompt).toContain('"title": "Define the problem"');
    expect(prompt).toContain('"workItemType": "design_project"');
    expect(prompt).toContain("Use `case_study` ONLY");
  });

  it("keeps the active Guide title aligned when evidence advances to root cause", () => {
    const prompt = promptAt("assess_evidence");
    expect(prompt).toContain('"title": "Find the adoption barrier/root cause"');
    expect(prompt).toContain('"need": "Homepage first impression"');
  });
});
