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
