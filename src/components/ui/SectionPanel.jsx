import { ArrowRight } from 'lucide-react'

/**
 * Bordered panel with a small-caps kicker title and an optional trailing
 * action link. This is the "Director Actions" / "Portal Live" style
 * container from the Dashboard. Renamed from the page-local `Panel` —
 * kept generic since every page needs this, not just Dashboard.
 */
export default function SectionPanel({ title, actionLabel, onAction, children, tone }) {
  return (
    <div className="ui-section-panel" style={tone ? { borderColor: tone } : undefined}>
      <div className="ui-section-panel-header">
        <div className="section-kicker">{title}</div>
        {actionLabel ? (
          <button className="btn btn-ghost btn-sm" onClick={onAction}>
            {actionLabel}
            <ArrowRight size={12} />
          </button>
        ) : null}
      </div>
      {children}
    </div>
  )
}
