import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Message } from "../types";
import { ChatPanel } from "./ChatPanel";

describe("ChatPanel quick-reply recommendation", () => {
  it("labels only the grounded recommended option", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const message: Message = {
      id: "coach-1",
      role: "coach",
      content: "I recommend positioning statement clarity. Does that hierarchy feel right?",
      quickReplies: [
        "Positioning statement clarity",
        "Contract availability visibility",
        "Project teaser strength",
      ],
      recommendedQuickReply: "Positioning statement clarity",
      createdAt: "2026-08-23T12:00:00.000Z",
    };

    const html = renderToStaticMarkup(
      <ChatPanel
        messages={[message]}
        loading={false}
        error={null}
        onSend={vi.fn()}
      />,
    );

    expect(html).toContain("Positioning statement clarity, recommended");
    expect(html.match(/>Recommended</g)).toHaveLength(1);
    expect(html).not.toContain("Project teaser strength, recommended");
    expect(html).toContain(
      'placeholder="Choose an option above, or type your own response…"',
    );
    consoleError.mockRestore();
  });

  it("renders the full evidence brief in the coach turn where it was created", () => {
    const message: Message = {
      id: "coach-evidence",
      role: "coach",
      content: "**The evidence establishes underperformance.** What makes this urgent now?",
      evidenceBrief: {
        title: "Portfolio performance snapshot",
        source: "portfolio-analytics.xlsx",
        summary: "Traffic exists, but hiring response is weak.",
        stats: [
          { label: "Active users", value: "226" },
          { label: "Applications", value: "40–50" },
          { label: "Screener interviews", value: "1" },
        ],
        strength: "moderate",
      },
      evidenceSnapshot: [
        {
          id: "evidence-1",
          kind: "fact",
          text: "One screener interview from 40–50 applications.",
          step: "assess_evidence",
        },
      ],
      evidenceOpenItems: ["Urgency and timeline"],
      createdAt: "2026-08-24T12:00:00.000Z",
    };

    const html = renderToStaticMarkup(
      <ChatPanel messages={[message]} loading={false} error={null} onSend={vi.fn()} />,
    );

    expect(html).toContain("Portfolio performance snapshot");
    expect(html).toContain("Source: portfolio-analytics.xlsx");
    expect(html).toContain("One screener interview from 40–50 applications.");
    expect(html).toContain("Urgency and timeline");
    expect(html).toContain("Evidence strength:");
  });

  it("renders short bullets and strategic bolding without flattening the layout", () => {
    const message: Message = {
      id: "coach-1",
      role: "coach",
      content:
        "**The frame is ready.**\n\nA successful direction should:\n- Clarify the offer\n- Show credible proof\n- Make contact easy",
      createdAt: "2026-08-23T12:00:00.000Z",
    };

    const html = renderToStaticMarkup(
      <ChatPanel messages={[message]} loading={false} error={null} onSend={vi.fn()} />,
    );

    expect(html).toContain("<strong>The frame is ready.</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li><span>Clarify the offer</span></li>");
    expect(html).not.toContain("- Clarify the offer");
    expect(html).toContain('placeholder="Describe it, or paste a screenshot…"');
  });
});
