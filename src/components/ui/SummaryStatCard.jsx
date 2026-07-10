/**
 * Small metric card with a label, big value, hint, and a coloured
 * indicator bar underneath (the "Executive Snapshot" tiles). Renamed
 * from `LeadershipSummaryCard` — the component has nothing leadership-
 * specific about it, and the Manager workspace already reused it under
 * a different label ("Manager snapshot"), which is exactly the sign
 * it belongs in the shared library, not the Dashboard file.
 */
export default function SummaryStatCard({ label, value, hint, tone = 'var(--accent)' }) {
  return (
    <div className="ui-summary-card">
      <div className="section-kicker">{label}</div>
      <div className="ui-summary-card-value">{value}</div>
      {hint ? <div className="ui-summary-card-hint">{hint}</div> : null}
      <div className="ui-summary-card-bar-track" style={{ background: `${tone}22` }}>
        <div className="ui-summary-card-bar-fill" style={{ background: tone }} />
      </div>
    </div>
  )
}
