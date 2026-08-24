import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptySpec } from "../types";
import { GuideRail } from "./GuidePanel";

describe("Guide evidence capture", () => {
  it("keeps a compact evidence report in the completed step and renders its details", () => {
    const spec = emptySpec();
    spec.evidence.push({
      id: "evidence-1",
      kind: "fact",
      text: "226 users and one screener interview from 40–50 applications.",
      step: "assess_evidence",
    });
    spec.evidenceBrief = {
      title: "Portfolio performance snapshot",
      source: "GA4 screenshot and application outcomes",
      summary:
        "Traffic exists, but hiring response is weak and on-site conversion tracking is missing.",
      stats: [
        { label: "Users", value: "226" },
        { label: "Applications", value: "40–50" },
        { label: "Screener interviews", value: "1" },
      ],
      strength: "moderate",
    };

    const html = renderToStaticMarkup(
      <GuideRail
        activeStep="find_root_cause"
        hints={{
          title: "Find the adoption barrier/root cause",
          need: "Homepage first impression",
        }}
        spec={spec}
      />,
    );

    expect(html).toContain("Open evidence report: Portfolio performance snapshot");
    expect(html).toContain("Portfolio performance snapshot preview");
    expect(html).toContain("226");
    expect(html).toContain("40–50");
  });
});
