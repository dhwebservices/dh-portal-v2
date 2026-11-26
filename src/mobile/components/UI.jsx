/**
 * Screen-level building blocks for the November 2026 design boards
 * (claude.ai/artifact/8eexhGJxpAh4aH5RUm1DGB). Every screen below the tab
 * roots is a Screen: a compact header with a back chevron and a centred
 * title, then a column of cards. Styles live in ../dh-ui.css so they load
 * once; colours come from the --mobile-* tokens, so dark mode follows.
 *
 * Section, Row, Chip and Tile live in ./DH.jsx and pair with these.
 */
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import Icon from './Icon'

const tap = (fn) => (...args) => {
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
  return fn?.(...args)
}

export function Screen({ title, onBack, action, children, flush }) {
  return (
    <div className="dh-scr">
      <div className="dh-hd">
        {onBack ? (
          <button type="button" className="dh-back" onClick={tap(onBack)} aria-label="Back">
            <Icon name="chevronLeft" size={24} />
          </button>
        ) : <span className="dh-hd-pad" />}
        <h1 className="dh-ttl">{title}</h1>
        {action ? <span className="dh-hd-act">{action}</span> : <span className="dh-hd-pad" />}
      </div>
      <div className={`dh-body${flush ? ' flush' : ''}`}>{children}</div>
    </div>
  )
}

/** The small text button that sits in a Screen header's right slot. */
export function HeaderButton({ children, onPress, disabled, label }) {
  return (
    <button type="button" className="dh-hd-btn" onClick={tap(onPress)} disabled={disabled} aria-label={label}>
      {children}
    </button>
  )
}

export function Card({ pad, children, className = '', tone, onPress, ...rest }) {
  const cls = ['dh-card', pad && 'dh-pad', tone && `tone-${tone}`, onPress && 'press', className].filter(Boolean).join(' ')
  if (onPress) return <button type="button" className={cls} onClick={tap(onPress)} {...rest}>{children}</button>
  return <div className={cls} {...rest}>{children}</div>
}

/** Section label: small caps above a card. Optional action on the right. */
export function Sec({ children, action, onAction }) {
  return (
    <div className="dh-sec-row">
      <p className="dh-sec">{children}</p>
      {action && <button type="button" className="dh-sec-act" onClick={tap(onAction)}>{action}</button>}
    </div>
  )
}

/** A label/value row inside a card. */
export function KV({ k, v, sub }) {
  return (
    <div className="dh-row dh-kv">
      <span className="dh-g">
        <span className="dh-kv-k">{k}</span>
        {sub && <span className="dh-sub">{sub}</span>}
      </span>
      <span className="dh-kv-v">{v ?? '—'}</span>
    </div>
  )
}

/** A labelled form field inside a card. Children are the input. */
export function Field({ label, htmlFor, hint, children }) {
  return (
    <div className="dh-fld">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && <span className="dh-sub">{hint}</span>}
    </div>
  )
}

export function Toggle({ on, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      aria-label={label}
      disabled={disabled}
      className={`dh-tog${on ? '' : ' off'}`}
      onClick={tap(() => onChange?.(!on))}
    />
  )
}

/** A row with a title, optional sub line and a switch. */
export function ToggleRow({ title, sub, on, onChange, disabled, icon }) {
  return (
    <div className="dh-row">
      {icon && <span className="dh-ic"><Icon name={icon} size={18} /></span>}
      <span className="dh-g">
        <span className="dh-t">{title}</span>
        {sub && <span className="dh-sub">{sub}</span>}
      </span>
      <Toggle on={on} onChange={onChange} disabled={disabled} label={typeof title === 'string' ? title : undefined} />
    </div>
  )
}

/** Segmented control. options: [{ value, label }] */
export function Seg({ options, value, onChange }) {
  return (
    <div className="dh-seg" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(o => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} onClick={tap(() => onChange(o.value))}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Pills({ children }) {
  return <div className="dh-pills">{children}</div>
}

export function Pill({ on, onPress, disabled, children, tone }) {
  return (
    <button type="button" className={`dh-pill${on ? ' on' : ''}${tone ? ` ${tone}` : ''}`} onClick={tap(onPress)} disabled={disabled}>
      {children}
    </button>
  )
}

/** variant: primary (default) | outline | danger | ghost; small for 40px */
export function Btn({ variant = 'primary', small, children, onPress, disabled, type = 'button', className = '', ...rest }) {
  return (
    <button
      type={type}
      className={`dh-btn2 ${variant}${small ? ' small' : ''} ${className}`}
      onClick={onPress ? tap(onPress) : undefined}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Btns({ children }) {
  return <div className="dh-btns">{children}</div>
}

/** Blue (or dark) summary block at the top of a screen. */
export function Hero({ dark, children, className = '' }) {
  return <div className={`dh-hero2${dark ? ' dk' : ''} ${className}`}>{children}</div>
}

/** A line of text between cards. tone: error | ok | warn */
export function Note({ tone, children }) {
  if (!children) return null
  return <p className={`dh-note2${tone ? ` ${tone}` : ''}`}>{children}</p>
}

export function Empty({ icon = 'info', title, sub, children }) {
  return (
    <div className="dh-card dh-empty">
      <span className="dh-ic muted"><Icon name={icon} size={20} /></span>
      <span className="dh-t">{title}</span>
      {sub && <span className="dh-sub">{sub}</span>}
      {children}
    </div>
  )
}

/** Bottom sheet for confirmations and small forms. */
export function Sheet({ title, sub, onClose, children }) {
  return (
    <div className="dh-sheet-bg" onClick={onClose}>
      <div className="dh-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <span className="dh-sheet-grab" />
        {title && <h2 className="dh-h2">{title}</h2>}
        {sub && <span className="dh-sub" style={{ fontSize: 14 }}>{sub}</span>}
        {children}
      </div>
    </div>
  )
}

export function Loading({ children = 'Loading…' }) {
  return <p className="dh-note2">{children}</p>
}
