import { ArrowRight } from 'lucide-react'

/**
 * Bordered panel with a small-caps kicker title and an optional trailing
 * action link. This is the "Director Actions" / "Portal Live" style
 * container from the Dashboard. Renamed from the page-local `Panel` —
 * kept generic since every page needs this, not just Dashboard.
 *
 * Supports two action styles found across pages:
 *  - `actionLabel` + `onAction`: compact ghost-button shorthand (Dashboard)
 *  - `action`: a freeform node, for when a page needs more than a single
 *    button (ManagerBoard's queue panels)
 * `subtitle` is an optional second line under the kicker title.
 */
export default function SectionPanel({ title, subtitle, actionLabel, onAction, action, children, tone }) {
  return (
    <div className="ui-section-panel" style={tone ? { borderColor: tone } : undefined}>
      <div className="ui-section-panel-header">
        <div>
          <div className="section-kicker">{title}</div>
          {subtitle ? <div className="ui-section-panel-subtitle">{subtitle}</div> : null}
        </div>
        {action ? action : actionLabel ? (
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
