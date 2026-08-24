import { describe, expect, it } from "vitest";
import type { Message } from "./types";
import { selectQuickReply } from "./quickReplies";

describe("selectQuickReply", () => {
  it("persists the selected value on the Coach message without mutating history", () => {
    const messages: Message[] = [
      {
        id: "coach-1",
        role: "coach",
        content: "Which is closest?",
        quickReplies: ["Ongoing support", "Feature projects", "Not sure yet"],
        createdAt: "2026-08-23T12:00:00.000Z",
      },
    ];

    const next = selectQuickReply(messages, "coach-1", "Feature projects");

    expect(next[0].selectedQuickReply).toBe("Feature projects");
    expect(messages[0].selectedQuickReply).toBeUndefined();
  });

  it("ignores values that were not offered by that message", () => {
    const messages: Message[] = [
      {
        id: "coach-1",
        role: "coach",
        content: "Which is closest?",
        quickReplies: ["A", "B"],
        createdAt: "2026-08-23T12:00:00.000Z",
      },
    ];

    expect(selectQuickReply(messages, "coach-1", "C")).toEqual(messages);
  });
});
