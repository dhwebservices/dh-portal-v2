// Compatibility shim — legacy components mapped to new CSS classes

export function Card({ children, style, className, ...props }) {
  return <div className={`card ${className||''}`} style={{ padding:'20px 24px', ...style }} {...props}>{children}</div>
}

export function Badge({ children, variant, style, ...props }) {
  const map = { active:'green', inactive:'red', pending:'amber', published:'gold', draft:'grey' }
  const cls = map[variant] || variant || 'grey'
  return <span className={`badge badge-${cls}`} style={style} {...props}>{children}</span>
}

export function Btn({ children, icon: Icon, variant, onClick, disabled, style, ...props }) {
  const cls = variant==='ghost' ? 'btn-ghost' : variant==='outline' ? 'btn-outline' : variant==='danger' ? 'btn-danger' : 'btn-primary'
  return (
    <button className={`btn ${cls}`} onClick={onClick} disabled={disabled} style={style} {...props}>
      {Icon && <Icon size={13} />}
      {children}
    </button>
  )
}

export function Input({ label, value, onChange, type='text', placeholder, style, ...props }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {label && <label className="inp-label">{label}</label>}
      <input className="inp" type={type} value={value} onChange={onChange} placeholder={placeholder} style={style} {...props} />
  )
}

export function Modal({ open, onClose, title, children, width='520px' }) {
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
  )
}

export function Table({ headers, rows, loading, empty='No records' }) {
  if (loading) return <div className="spin-center"><div className="spin"/></div>
  if (!rows?.length) return <div className="empty"><p>{empty}</p></div>
  return (
    <table className="tbl">
      <thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows}</tbody>
    </table>
  )
}
