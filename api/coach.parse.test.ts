import { describe, it, expect } from "vitest";
import {
  escapeControlCharsInStrings,
  extractBalancedObject,
  parseCoachTurn,
  shouldEnablePatternWebSearch,
} from "./coach";

const validTurn = {
  reply: "ok",
  activeStep: "understand_request",
  specUpdates: {},
  guidePanel: { title: "Understand the request", summary: "s" },
  activityEvents: [],
};

describe("pattern web search routing", () => {
  it("is limited to criteria and pattern exploration steps", () => {
    expect(shouldEnablePatternWebSearch("set_criteria", "true")).toBe(true);
    expect(shouldEnablePatternWebSearch("find_patterns", "true")).toBe(true);
    expect(shouldEnablePatternWebSearch("review_shortlist", "true")).toBe(true);
    expect(shouldEnablePatternWebSearch("assess_evidence", "true")).toBe(false);
  });

  it("can be disabled explicitly", () => {
    expect(shouldEnablePatternWebSearch("find_patterns", "false")).toBe(false);
  });
});

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

  it("rejects an object missing 'reply' (a hard-required field)", () => {
    const { reply: _reply, ...missing } = validTurn;
    const r = parseCoachTurn(JSON.stringify(missing));
    expect(r.ok).toBe(false);
  });

  it("defaults a missing guidePanel instead of failing the turn", () => {
    const { guidePanel: _g, ...missing } = validTurn;
    const r = parseCoachTurn(JSON.stringify(missing));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.guidePanel).toBeTypeOf("object");
      expect(r.value.guidePanel.title).toBe("Understand the request"); // from activeStep
      expect(r.value.reply).toBe("ok"); // substance preserved
    }
  });

  it("defaults missing specUpdates, activityEvents, and quickReplies containers", () => {
    const { specUpdates: _s, activityEvents: _a, ...missing } = validTurn;
    const r = parseCoachTurn(JSON.stringify(missing));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.specUpdates).toEqual({});
      expect(r.value.activityEvents).toEqual([]);
      expect(r.value.quickReplies).toEqual([]);
    }
  });

  it("moves a misplaced top-level evidence brief into specUpdates", () => {
    const evidenceBrief = {
      title: "Portfolio performance snapshot",
      summary: "Traffic exists, but no on-site funnel is tracked.",
      strength: "moderate",
    };
    const r = parseCoachTurn(
      JSON.stringify({
        ...validTurn,
        evidenceBrief,
      }),
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.specUpdates.evidenceBrief).toEqual(evidenceBrief);
      expect((r.value as unknown as Record<string, unknown>).evidenceBrief).toBeUndefined();
    }
  });

  it("preserves a recommendation that exactly matches a quick reply", () => {
    const r = parseCoachTurn(
      JSON.stringify({
        ...validTurn,
        quickReplies: ["Positioning statement clarity", "Project teaser strength"],
        recommendedQuickReply: "Positioning statement clarity",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.recommendedQuickReply).toBe("Positioning statement clarity");
    }
  });

  it("drops a recommendation that is not one of the quick replies", () => {
    const r = parseCoachTurn(
      JSON.stringify({
        ...validTurn,
        quickReplies: ["Positioning statement clarity", "Project teaser strength"],
        recommendedQuickReply: "Contract availability visibility",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.recommendedQuickReply).toBeUndefined();
    }
  });

  it("rejects an invalid activeStep", () => {
    const r = parseCoachTurn(JSON.stringify({ ...validTurn, activeStep: "nope" }));
    expect(r.ok).toBe(false);
  });

  it("accepts and preserves stepGate/responseMode when present", () => {
    const withGate = {
      ...validTurn,
      responseMode: "concise",
      stepGate: { linkedDecision: "root cause", blocking: false, disposition: "risk" },
    };
    const r = parseCoachTurn(JSON.stringify(withGate));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.responseMode).toBe("concise");
      expect(r.value.stepGate?.disposition).toBe("risk");
    }
  });

  it("preserves an explicit flow revision for policy validation", () => {
    const r = parseCoachTurn(
      JSON.stringify({
        ...validTurn,
        activeStep: "review_shortlist",
        guidePanel: { title: "Review and shortlist" },
        flowRevision: {
          reopenedStep: "find_patterns",
          reason: "The user chose to broaden the reference set.",
          preservesExistingWork: true,
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.flowRevision?.reopenedStep).toBe("find_patterns");
      expect(r.value.flowRevision?.preservesExistingWork).toBe(true);
    }
  });

  it("still parses a turn missing stepGate/responseMode (backward compatibility with older turns)", () => {
    const r = parseCoachTurn(JSON.stringify(validTurn));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.stepGate).toBeUndefined();
      expect(r.value.responseMode).toBeUndefined();
    }
  });

  it("recovers a raw newline inside a string value (bad control character)", () => {
    // What the model actually emitted: a LITERAL newline inside "reply".
    const bad =
      '{"reply":"line one\nline two","activeStep":"understand_request","specUpdates":{},"guidePanel":{"title":"Understand the request"},"activityEvents":[]}';
    const r = parseCoachTurn(bad);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.reply).toBe("line one\nline two");
  });

  it("recovers raw control chars in a prose-wrapped object", () => {
    const bad =
      'Here you go:\n{"reply":"a\tb\nc","activeStep":"understand_request","specUpdates":{},"guidePanel":{"title":"Understand the request"},"activityEvents":[]}';
    const r = parseCoachTurn(bad);
    expect(r.ok).toBe(true);
  });
});

describe("escapeControlCharsInStrings", () => {
  it("escapes control chars only inside string literals", () => {
    const input = '{\n  "a": "x\ny"\n}';
    const out = escapeControlCharsInStrings(input);
    // The newline inside "x\ny" becomes \n; the structural newlines stay raw.
    expect(out).toBe('{\n  "a": "x\\ny"\n}');
    expect(JSON.parse(out)).toEqual({ a: "x\ny" });
  });

  it("leaves already-escaped sequences and quotes intact", () => {
    const input = '{"a":"she said \\"hi\\"\tok"}';
    const out = escapeControlCharsInStrings(input);
    expect(JSON.parse(out)).toEqual({ a: 'she said "hi"\tok' });
  });
});
