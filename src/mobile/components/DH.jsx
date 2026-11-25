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

export function DHStyles() {
  return (
    <style>{`
      .dh-page { padding: 8px 20px 28px; display: flex; flex-direction: column; gap: 16px; }
      .dh-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 4px; }
      .dh-h1 { margin: 0; font-family: Archivo, system-ui, sans-serif; font-weight: 800; font-size: 30px; letter-spacing: -0.02em; color: var(--mobile-text); }
      .dh-section { display: flex; flex-direction: column; gap: 8px; }
      .dh-sec { margin: 0; font-size: 12.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--mobile-text-secondary); }
      .dh-card { background: var(--mobile-card); border-radius: 20px; overflow: hidden; }
      .dh-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 16px; min-height: 56px; border: 0; border-bottom: 1px solid var(--mobile-border); background: transparent; color: var(--mobile-text); font: inherit; text-align: left; }
      .dh-row:last-child { border-bottom: 0; }
      button.dh-row:active { background: var(--mobile-accent-soft); }
      .dh-g { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .dh-t { font-size: 15px; font-weight: 600; }
      .dh-sub { font-size: 12.5px; color: var(--mobile-text-secondary); }
      .dh-ic { width: 34px; height: 34px; flex: none; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--mobile-accent-soft); color: var(--mobile-accent); }
      .dh-ic.muted { background: var(--mobile-bg); color: var(--mobile-text-secondary); }
      .dh-av { width: 40px; height: 40px; flex: none; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-family: Archivo, system-ui, sans-serif; font-weight: 700; font-size: 14px; background: var(--mobile-accent-soft); color: var(--mobile-accent); }
      .dh-chev { color: var(--mobile-text-secondary); display: flex; }
      .dh-chip { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; white-space: nowrap; background: var(--mobile-bg); color: var(--mobile-text-secondary); }
      .dh-chip.green { background: rgba(30,123,58,.12); color: #1E7B3A; }
      .dh-chip.amber { background: rgba(154,91,0,.12); color: #8A4A00; }
      .dh-chip.blue { background: var(--mobile-accent-soft); color: var(--mobile-accent); }
      .dh-chip.red { background: rgba(180,35,24,.1); color: #B42318; }
      .mobile-app.dark .dh-chip.green { color: #6FD08F; }
      .mobile-app.dark .dh-chip.amber { color: #F2B66B; }
      .mobile-app.dark .dh-chip.red { color: #F28B82; }
      .dh-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .dh-tile { background: var(--mobile-card); border: 0; border-radius: 20px; padding: 16px; display: flex; flex-direction: column; gap: 6px; text-align: left; font: inherit; color: var(--mobile-text); }
      .dh-num { font-family: Archivo, system-ui, sans-serif; font-weight: 800; font-size: 28px; }
      .dh-hero { background: var(--mobile-accent); color: #fff; border-radius: 24px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
      .dh-hero .dh-sec { color: rgba(255,255,255,.8); }
      .dh-hero-title { font-family: Archivo, system-ui, sans-serif; font-weight: 800; font-size: 26px; letter-spacing: -0.02em; margin: 0; }
      .dh-hero-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; background: rgba(255,255,255,.14); border: 0; border-radius: 14px; padding: 12px 14px; color: #fff; font: inherit; text-align: left; }
      .dh-hero-item small { display: block; font-size: 12px; color: rgba(255,255,255,.85); margin-top: 2px; }
      .dh-btn { height: 48px; border: 0; border-radius: 14px; background: var(--mobile-accent); color: #fff; font: inherit; font-size: 15px; font-weight: 600; width: 100%; }
      .dh-btn.outline { background: var(--mobile-card); color: var(--mobile-text); border: 1px solid var(--mobile-border); }
      .dh-note { font-size: 12.5px; color: var(--mobile-text-secondary); margin: 0; }
    `}</style>
  )
}
