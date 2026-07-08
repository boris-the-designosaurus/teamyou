import { describe, it, expect } from "vitest";
import { extractBalancedObject, parseCoachTurn } from "./coach";

const validTurn = {
  reply: "ok",
  activeStep: "brief",
  specUpdates: {},
  guidePanel: { title: "Brief", summary: "s" },
  activityEvents: [],
};

describe("extractBalancedObject", () => {
  it("returns null when there is no object", () => {
    expect(extractBalancedObject("Quick answer: yes, that's possible.")).toBeNull();
  });

  it("extracts a clean object", () => {
    expect(extractBalancedObject('{"a":1}')).toBe('{"a":1}');
  });

  it("pulls the object out of surrounding prose", () => {
    const s = 'Sure! Here you go:\n{"reply":"hi","n":2}\nHope that helps.';
    expect(extractBalancedObject(s)).toBe('{"reply":"hi","n":2}');
  });

  it("respects braces inside string literals", () => {
    const s = '{"reply":"use { and } carefully","ok":true}';
    expect(extractBalancedObject(s)).toBe(s);
  });

  it("respects escaped quotes inside strings", () => {
    const s = '{"reply":"she said \\"hi\\" }","ok":true}';
    expect(extractBalancedObject(s)).toBe(s);
  });
});

describe("parseCoachTurn", () => {
  it("parses a clean JSON turn", () => {
    const r = parseCoachTurn(JSON.stringify(validTurn));
    expect(r.ok).toBe(true);
  });

  it("strips markdown fences", () => {
    const r = parseCoachTurn("```json\n" + JSON.stringify(validTurn) + "\n```");
    expect(r.ok).toBe(true);
  });

  it("recovers JSON wrapped in prose (tolerant extraction)", () => {
    const r = parseCoachTurn("Here's the turn:\n" + JSON.stringify(validTurn));
    expect(r.ok).toBe(true);
  });

  it("fails loudly on prose-only output (the meta-question failure mode)", () => {
    const r = parseCoachTurn("Quick answer: yes, branding is possible later.");
    expect(r.ok).toBe(false);
  });

  it("rejects an object missing a required top-level key", () => {
    const { reply: _reply, ...missing } = validTurn;
    const r = parseCoachTurn(JSON.stringify(missing));
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid activeStep", () => {
    const r = parseCoachTurn(JSON.stringify({ ...validTurn, activeStep: "nope" }));
    expect(r.ok).toBe(false);
  });
});
