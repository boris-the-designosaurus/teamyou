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
  it("allows short bullets and strategic bolding without turning chat into a report", () => {
    const prompt = promptAt("define_problem");
    expect(prompt).toContain(
      "A short 2-4 item bullet list is allowed only when it materially improves the scanability",
    );
    expect(prompt).toContain(
      "You may wrap ONE short clause per message in \\*\\*double asterisks\\*\\*",
    );
  });

  it("recommends one bounded choice only when the locked frame supports it", () => {
    const prompt = promptAt("set_criteria");
    expect(prompt).toContain("set `recommendedQuickReply` to that option's EXACT button label");
    expect(prompt).toContain(
      "Omit `recommendedQuickReply` when evidence is insufficient, the options are equally defensible, or the decision is purely personal preference",
    );
    expect(prompt).toContain('"recommendedQuickReply": "Positioning statement clarity"');
    expect(prompt).toContain("the user still confirms or overrides it");
  });

  it("treats an explicit user override as a traceable revision, not a veto point", () => {
    const prompt = promptAt("choose_direction");
    expect(prompt).toContain("locked does NOT mean irreversible");
    expect(prompt).toContain("A recommendation is advice, not a veto");
    expect(prompt).toContain('"flowRevision": { "reopenedStep": "find_patterns"');
    expect(prompt).toContain("existing Joey Shiner directions preserved");
    expect(prompt).toContain("Never ask them to justify the same choice again");
    expect(prompt).toContain("Action before clarification");
    expect(prompt).toContain("You're right — I was too narrow");
    expect(prompt).toContain("Never mention how many times they asked");
    expect(prompt).toContain(
      "a request to SEE a few reversible alternatives is not scope expansion",
    );
  });

  it("treats pattern exploration as a flexible multi-select workspace", () => {
    const prompt = promptAt("find_patterns");
    expect(prompt).toContain("Pattern exploration is a workspace, not a single-answer gate");
    expect(prompt).toContain("proactively add 3-5 structurally distinct");
    expect(prompt).toContain("Recommend the strongest pattern with ONE grounded reason");
    expect(prompt).toContain(
      "Select one or more patterns to generate wireframes, combine useful ingredients, request more, or add your own example in chat.",
    );
    expect(prompt).toContain('"ingredients": ["Direct offer", "Availability", "Builder positioning"]');
    expect(prompt).toContain("Pattern cards replace quick replies for this choice");
  });

  it("keeps evidence questions out of Understand the request", () => {
    const prompt = promptAt("understand_request");
    expect(prompt).toContain(
      "Do not ask for analytics, evidence, target users, workflow timing, root cause, scope, success measures, or proposed page messaging here.",
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

  it("asks for target work before portfolio messaging on an ambiguous request", () => {
    const prompt = promptAt("understand_request");
    expect(prompt).toContain(
      "For an opportunity-seeking portfolio, the first missing context is the specific kind of work the site must help win.",
    );
    expect(prompt).toContain(
      'User: "My portfolio isn\'t generating freelance or contract work, and I want to improve it."',
    );
    expect(prompt).toContain(
      '"reply": "You don\'t need a polished offer yet. Which is closest to the work you want more of?"',
    );
    expect(prompt).toContain('"need": "Target work"');
    expect(prompt).toContain(
      '"quickReplies": ["Ongoing design support", "Feature/workflow projects", "Not sure yet"]',
    );
    expect(prompt).toContain(
      "Do not set `recommendedQuickReply` here: the spec has no basis for favoring an engagement shape.",
    );
    expect(prompt).toContain(
      "Do NOT ask what the portfolio should communicate, what its key message should be, or what it should lead with on this turn.",
    );
  });

  it("keeps the active Guide title aligned when evidence advances to root cause", () => {
    const prompt = promptAt("assess_evidence");
    expect(prompt).toContain('"title": "Find the adoption barrier/root cause"');
    expect(prompt).toContain('"need": "Homepage first impression"');
  });
});
