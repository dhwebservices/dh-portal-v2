import { FolderOpen } from 'lucide-react'

/**
 * Empty state for panels/tables with no data. Backward compatible with
 * the original Dashboard usage (`<EmptyState text="..." />`), but now
 * supports an icon, title and call-to-action so pages adopting this
 * later aren't stuck with a bare line of grey text — no illustration
 * asset exists yet (see TECH_DEBT.md), so this uses a simple icon
 * instead as an honest placeholder rather than faking an illustration.
 */
export default function EmptyState({ text, title, icon: Icon = FolderOpen, actionLabel, onAction }) {
  return (
    <div className="ui-empty-state">
      <Icon size={20} className="ui-empty-state-icon" />
      {title ? <div className="ui-empty-state-title">{title}</div> : null}
      {text ? <div className="ui-empty-state-text">{text}</div> : null}
      {actionLabel ? (
        <button className="btn btn-outline btn-sm" onClick={onAction} style={{ marginTop: 10 }}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
