import { describe, expect, it } from "vitest";
import type { Message } from "./types";
import { appendCoachTurnMessages, requestsPatternCardRedisplay } from "./messageOrder";

const message = (id: string, role: Message["role"], content: string): Message => ({
  id,
  role,
  content,
  createdAt: "2026-08-23T00:00:00.000Z",
});

describe("appendCoachTurnMessages", () => {
  it("places a new-step marker before the Coach reply that begins the step", () => {
    const existing = [message("user", "user", "The homepage hides my offer.")];
    const marker = message("marker", "system", "Identify users and context started");
    const coach = message("coach", "coach", "Who is the primary visitor?");

    const result = appendCoachTurnMessages(existing, coach, marker);

    expect(result.map((item) => item.id)).toEqual(["user", "marker", "coach"]);
  });

  it("appends only the Coach reply when the step does not change", () => {
    const existing = [message("user", "user", "A founder is the primary visitor.")];
    const coach = message("coach", "coach", "At what moment do they arrive?");

    const result = appendCoachTurnMessages(existing, coach, null);

    expect(result.map((item) => item.id)).toEqual(["user", "coach"]);
  });
});

describe("requestsPatternCardRedisplay", () => {
  it.each([
    "display the patterns again",
    "Can you show the pattern cards?",
    "bring back the thumbnails",
    "where are the patterns?",
  ])("recognizes an explicit card redisplay request: %s", (text) => {
    expect(requestsPatternCardRedisplay(text)).toBe(true);
  });

  it("does not treat ordinary pattern discussion as a UI command", () => {
    expect(requestsPatternCardRedisplay("Which pattern is strongest?")).toBe(false);
  });
});
