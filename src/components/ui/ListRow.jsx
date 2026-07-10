import { ArrowRight } from 'lucide-react'

/**
 * Single row inside a SectionPanel: title + meta line, with either a
 * status badge on the right (pass `status`/`tone`) or a plain forward
 * arrow (omit `status`). This replaces two near-identical components
 * that lived side by side in Dashboard.jsx (`QueueRow` and
 * `ToolShortcutRow`) — same layout, the only real difference was
 * badge-vs-arrow on the trailing edge.
 */
export default function ListRow({ title, meta, status, tone = 'grey', onClick }) {
  return (
    <button className="ui-list-row" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="ui-list-row-text">
        <div className="ui-list-row-title">{title}</div>
        {meta ? <div className="ui-list-row-meta">{meta}</div> : null}
      </div>
      {status ? (
        <span className={`badge badge-${tone}`} style={{ alignSelf: 'center', flexShrink: 0 }}>{status}</span>
      ) : (
        <ArrowRight size={13} className="ui-list-row-arrow" />
      )}
    </button>
  )
}
