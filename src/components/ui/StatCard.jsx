import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

/**
 * Compact metric tile: icon, label, value, optional hint and link.
 * Extracted from Dashboard.jsx (Phase 3) — used for Tasks/Alerts/Clients-style
 * top-row stats. Reuse this instead of building a page-local stat tile;
 * 8 pages had their own copy of this before the Phase 3 pass.
 */
export default function StatCard({ icon: Icon, label, value, accent = 'var(--accent)', link, loading, hint }) {
  const nav = useNavigate()
  return (
    <div
      onClick={() => link && nav(link)}
      className="ui-stat-card"
      style={{ cursor: link ? 'pointer' : 'default' }}
    >
      <div className="ui-stat-card-top">
        <div className="ui-stat-card-icon" style={{ background: `${accent}18` }}>
          <Icon size={18} color={accent} />
        </div>
        {link ? <ArrowRight size={14} className="ui-stat-card-arrow" /> : null}
      </div>
      <div className="ui-stat-card-mid">
        <div className="stat-lbl" style={{ marginTop: 0, marginBottom: 8 }}>{label}</div>
        {loading ? (
          <div className="skeleton" style={{ height: 36, width: 72, borderRadius: 4 }} />
        ) : (
          <div className="stat-val">{value}</div>
        )}
      </div>
      {hint ? <div className="ui-stat-card-hint">{hint}</div> : null}
    </div>
  )
}
