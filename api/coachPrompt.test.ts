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
  it("requires retrieved public references for pattern thumbnails", () => {
    const prompt = promptAt("find_patterns");
    expect(prompt).toContain("USE IT before creating the shortlist");
    expect(prompt).toContain("return that exact page as \`sourceUrl\`");
    expect(prompt).toContain("The client creates a page thumbnail from \`sourceUrl\`");
    expect(prompt).toContain('"sourceTitle"?');
  });

  it("requires screenshot-aware judgment without treating references as proof", () => {
    const prompt = buildSystemPrompt({
      workItemType: "design_project",
      workMode: "design_exploration",
      activeStep: "define_problem",
      specSnapshot: {},
      latestAttachments: [
        { id: "current", name: "current-portfolio.png" },
        { id: "reference", name: "joey-shiner.png" },
      ],
    });

    expect(prompt).toContain("The latest user turn includes 2 screenshots");
    expect(prompt).toContain("ground one concise observation");
    expect(prompt).toContain(
      "either in the reply or in the structured evidence/evidenceBrief",
    );
    expect(prompt).toContain("do not repeat its stats in prose merely to prove inspection");
    expect(prompt).toContain(
      "distinguish current-state evidence from inspiration/reference",
    );
    expect(prompt).toContain("A reference can suggest a direction, but it cannot prove");
    expect(prompt).toContain("Screenshots remain chat context by default");
  });

  it("allows short bullets and requires strategic emphasis without turning chat into a report", () => {
    const prompt = promptAt("define_problem");
    expect(prompt).toContain(
      "A short 2-4 item bullet list is allowed only when it materially improves the scanability",
    );
    expect(prompt).toContain(
      "Use exactly ONE short \\*\\*double-asterisk\\*\\* span whenever a normal reply contains a judgment, recommendation, step transition, or proposed frame",
    );
  });

  it("ties a transition turn's gate to the new-step question", () => {
    const prompt = promptAt("assess_evidence");
    expect(prompt).toContain(
      "stepGate must describe that new question as blocking with disposition \"ask\"",
    );
    expect(prompt).toContain(
      "do not leave it describing the completed prior-step decision as \"proceed\"",
    );
  });

  it("requires every framing turn to give the user a prompt to continue", () => {
    const prompt = promptAt("define_problem");
    expect(prompt).toContain(
      "Never end a framing turn with only an acknowledgment, summary, or \"there's enough to proceed\"",
    );
    expect(prompt).toContain(
      "the Coach must provide the prompt that lets the user continue",
    );
  });

  it("does not re-ask target priority when primary and secondary work are explicit", () => {
    const prompt = promptAt("understand_request");
    expect(prompt).toContain(
      "full-time first and freelance second",
    );
    expect(prompt).toContain(
      "capture that priority and do not ask them to choose it again",
    );
  });

  it("requires shorthand barrier answers to be saved before a portfolio jump", () => {
    const prompt = promptAt("define_problem");
    expect(prompt).toContain(
      "synthesize those words into one concise \`brief.problem\` before advancing",
    );
    expect(prompt).toContain(
      "Hiring managers cannot quickly understand the design thinking behind the work or connect it to clear outcomes",
    );
    expect(prompt).toContain(
      "never advance past Define the problem while omitting \`brief.problem\`",
    );
  });

  it("keeps user, moment, and task as sequential captures", () => {
    const prompt = promptAt("identify_users");
    expect(prompt).toContain(
      "When user and moment are both unknown, ask for them together in one natural free-text question",
    );
    expect(prompt).toContain(
      "For workflow/product problems, task is what the user is doing and may require a separate question",
    );
    expect(prompt).toContain(
      "For portfolios and other decision surfaces, task is what the visitor is trying to judge or decide",
    );
    expect(prompt).toContain(
      "advance instead of asking the designer to choose among overlapping evaluation dimensions",
    );
    expect(prompt).toContain(
      "not mutually exclusive alternatives",
    );
    expect(prompt).toContain("Keep `quickReplies` empty throughout this step");
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
    expect(prompt).toContain(
      "returning `specUpdates: {}` while announcing patterns is invalid",
    );
    expect(prompt).toContain(
      "may use a fourth short sentence only for the selection instruction",
    );
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

  it("requires a project-appropriate report as soon as quantitative evidence is supplied", () => {
    const prompt = promptAt("assess_evidence");
    expect(prompt).toContain(
      "MUST produce a project-appropriate `evidenceBrief` as soon as the user supplies real numbers/data",
    );
    expect(prompt).toContain("even when another question (such as urgency) keeps the step active");
    expect(prompt).toContain("the report never substitutes for the durable evidence record");
    expect(prompt).toContain("do not repeat its source, stats, or summary in prose");
    expect(prompt).toContain('"title": "Portfolio performance snapshot"');
    expect(prompt).toContain('"strength": "moderate"');
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
