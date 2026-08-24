import type { Evidence, EvidenceBrief } from "../types";

function EvidenceList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="evidence-report-section">
      <h4>{title}</h4>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function EvidenceBriefCard({
  brief,
  evidence = [],
  openItems = [],
}: {
  brief: EvidenceBrief;
  evidence?: Evidence[];
  openItems?: string[];
}) {
  const known = evidence.filter((item) => item.kind === "fact").map((item) => item.text);
  const assumed = evidence
    .filter((item) => item.kind === "assumption" || item.kind === "interpretation")
    .map((item) => item.text);
  const risks = evidence.filter((item) => item.kind === "risk").map((item) => item.text);
  const maxFunnel = Math.max(...(brief.funnel ?? []).map((item) => item.value), 1);

  return (
    <article className="evidence-report" aria-label={brief.title}>
      <header className="evidence-report-head">
        <div>
          <h3>{brief.title}</h3>
          <div className="evidence-report-source">
            {brief.source ? `Source: ${brief.source}` : "AI-curated evidence summary"}
            <span aria-hidden> • </span>
            Updated just now
          </div>
        </div>
      </header>

      <p className="evidence-report-summary">{brief.summary}</p>

      {brief.stats && brief.stats.length > 0 && (
        <div className="evidence-report-stats">
          {brief.stats.map((stat) => (
            <div key={`${stat.label}-${stat.value}`} className="evidence-report-stat">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>
      )}

      {brief.funnel && brief.funnel.length > 0 && (
        <div className="evidence-report-funnel" aria-label="Evidence funnel">
          {brief.funnel.map((item) => (
            <div key={item.label} className="evidence-report-funnel-step">
              <strong>{item.value.toLocaleString()}</strong>
              <span
                className="evidence-report-funnel-bar"
                style={{ height: `${Math.max(16, Math.round((item.value / maxFunnel) * 112))}px` }}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      <section className="evidence-report-section">
        <h4>What this means</h4>
        <p>{brief.summary}</p>
      </section>
      <EvidenceList title="Known" items={known} />
      <EvidenceList title="Assumed" items={assumed} />
      <EvidenceList title="Risks" items={risks} />
      <EvidenceList title="Still needed" items={openItems} />

      {brief.strength && (
        <div className="evidence-report-strength">
          Evidence strength: <strong>{brief.strength}</strong>
        </div>
      )}
    </article>
  );
}

export function EvidenceBriefGuidePreview({ brief }: { brief: EvidenceBrief }) {
  return (
    <div className="guide-evidence-preview" aria-label={`${brief.title} preview`}>
      <div className="guide-evidence-preview-page" aria-hidden>
        <div className="guide-evidence-preview-title">{brief.title}</div>
        <div className="guide-evidence-preview-lines">
          <span />
          <span />
        </div>
        <div className="guide-evidence-preview-stats">
          {(brief.stats ?? []).slice(0, 2).map((stat) => (
            <span key={`${stat.label}-${stat.value}`}>
              <b>{stat.value}</b>
              <i>{stat.label}</i>
            </span>
          ))}
        </div>
      </div>
      <div className="guide-evidence-preview-name">{brief.title}</div>
      {brief.stats && brief.stats.length > 0 && (
        <ul>
          {brief.stats.slice(0, 4).map((stat) => (
            <li key={`${stat.label}-${stat.value}`}>
              <strong>{stat.value}</strong> {stat.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
