import { ArrowRight } from 'lucide-react'

/**
 * Compact clickable tile: icon, label, hint, trailing arrow. Used for
 * quick-action grids (Dashboard's "My Tasks / Notifications / Clients"
 * row). Renamed from `QuickActionCard`.
 */
export default function ActionTile({ icon: Icon, label, hint, onClick }) {
  return (
    <button onClick={onClick} className="ui-action-tile">
      <div className="ui-action-tile-icon">
        <Icon size={15} />
      </div>
      <div className="ui-action-tile-text">
        <div className="ui-action-tile-label">{label}</div>
        {hint ? <div className="ui-action-tile-hint">{hint}</div> : null}
      </div>
      <ArrowRight size={14} className="ui-action-tile-arrow" />
    </button>
  )
}
