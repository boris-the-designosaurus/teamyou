import { describe, it, expect } from "vitest";
import { findLastCoachMessageId } from "./chatLocate";
import type { Message } from "./types";

function msg(over: Partial<Message>): Message {
  return { id: "m", role: "user", content: "x", createdAt: "2026-01-01T00:00:00.000Z", ...over };
}

describe("findLastCoachMessageId", () => {
  it("returns null for an empty conversation", () => {
    expect(findLastCoachMessageId([])).toBeNull();
  });

  it("returns null when no coach message exists yet", () => {
    const messages = [msg({ id: "1", role: "system" }), msg({ id: "2", role: "user" })];
    expect(findLastCoachMessageId(messages)).toBeNull();
  });

  it("returns the coach message id when it's the last message", () => {
    const messages = [msg({ id: "1", role: "user" }), msg({ id: "2", role: "coach" })];
    expect(findLastCoachMessageId(messages)).toBe("2");
  });

  it("returns the coach message even when the user has replied since (not the trailing user message)", () => {
    const messages = [
      msg({ id: "1", role: "user" }),
      msg({ id: "2", role: "coach" }),
      msg({ id: "3", role: "user" }),
    ];
    expect(findLastCoachMessageId(messages)).toBe("2");
  });

  it("returns the MOST RECENT coach message, not the first", () => {
    const messages = [
      msg({ id: "1", role: "coach" }),
      msg({ id: "2", role: "user" }),
      msg({ id: "3", role: "coach" }),
    ];
    expect(findLastCoachMessageId(messages)).toBe("3");
  });
});
