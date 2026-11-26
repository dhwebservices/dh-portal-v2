/**
 * Building blocks for the November 2026 redesign (Home, Apps, Leads, Clients,
 * More). Small on purpose: a list row, a section label, a status chip, a stat
 * tile, and the page header. Colours come from the --mobile-* tokens set in
 * MobileApp.jsx so light and dark both work.
 */
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import Icon from './Icon'

const tap = async (fn) => {
  if (!fn) return
  try { await Haptics.impact({ style: ImpactStyle.Light }) } catch { /* web */ }
  fn()
}

export function PageTitle({ title, action }) {
  return (
    <div className="dh-top">
      <h1 className="dh-h1">{title}</h1>
      {action}
    </div>
  )
}

export function Section({ label, children }) {
  return (
    <section className="dh-section">
      {label && <p className="dh-sec">{label}</p>}
      <div className="dh-card">{children}</div>
    </section>
  )
}

export function Row({ icon, avatar, title, sub, right, onPress, tone }) {
  const Tag = onPress ? 'button' : 'div'
  return (
    <Tag className="dh-row" onClick={onPress ? () => tap(onPress) : undefined} type={onPress ? 'button' : undefined}>
      {avatar && <span className="dh-av" style={avatar.color ? { background: avatar.color, color: '#fff' } : undefined}>{avatar.text}</span>}
      {icon && <span className={`dh-ic ${tone === 'muted' ? 'muted' : ''}`}><Icon name={icon} size={18} /></span>}
      <span className="dh-g">
        <span className="dh-t">{title}</span>
        {sub && <span className="dh-sub">{sub}</span>}
      </span>
      {right}
      {onPress && !right && <span className="dh-chev"><Icon name="chevron-right" size={18} /></span>}
    </Tag>
  )
}

export function Chip({ children, tone = 'neutral' }) {
  return <span className={`dh-chip ${tone}`}>{children}</span>
}

export function Tile({ label, value, sub, onPress }) {
  const Tag = onPress ? 'button' : 'div'
  return (
    <Tag className="dh-tile" onClick={onPress ? () => tap(onPress) : undefined} type={onPress ? 'button' : undefined}>
      <span className="dh-sub">{label}</span>
      <span className="dh-num">{value}</span>
      {sub && <span className="dh-sub">{sub}</span>}
    </Tag>
  )
}

/**
 * A 7-day bar chart, sized for a card. Values are drawn as they are: an empty
 * day is an empty slot, and the axis starts at zero.
 */
export function MiniBars({ title, days, valueKey = 'value', total, note }) {
  const max = Math.max(1, ...days.map(d => d[valueKey] || 0))
  const label = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' })
  return (
    <div className="dh-chart">
      <div className="dh-chart-head">
        <span className="dh-t">{title}</span>
        {total !== undefined && <span className="dh-chart-total">{total}</span>}
      </div>
      <div className="dh-bars" role="img" aria-label={`${title}: ${days.map(d => `${d.date} ${d[valueKey] || 0}`).join(', ')}`}>
        {days.map((d, i) => (
          <div key={d.date} className="dh-bar-col">
            <span className="dh-bar-n">{d[valueKey] || ''}</span>
            <span className={`dh-bar ${i === days.length - 1 ? 'today' : ''}`} style={{ height: `${Math.max(2, ((d[valueKey] || 0) / max) * 64)}px` }} />
            <span className="dh-bar-d">{label(d.date)}</span>
          </div>
        ))}
      </div>
      {note && <p className="dh-note">{note}</p>}
    </div>
  )
}

/**
 * The DH styles now load once from ../dh-ui.css (imported by MobileApp).
 * Kept as a no-op so screens that still render <DHStyles /> keep working.
 */
export function DHStyles() {
  return null
}
