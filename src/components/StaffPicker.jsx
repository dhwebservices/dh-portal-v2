import { useState, useEffect, useRef } from 'react'
import { supabase } from '../utils/supabase'

/**
 * StaffPicker - searchable dropdown that selects from hr_profiles
 * Props:
 *   value      - current selected email
 *   onChange   - callback({ email, name })
 *   placeholder
 *   label
 */
export function StaffPicker({ value, onChange, placeholder = 'Select staff member...', label }) {
  const [staff, setStaff]     = useState([])
  const [query, setQuery]     = useState('')
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef()
  const selectedPerson = staff.find(s => s.email === value)

  useEffect(() => {
    setLoading(true)
    supabase.from('hr_profiles').select('user_email,full_name,role').order('full_name',{ascending:true})
      .then(({ data }) => {
        // Deduplicate by normalised email (lowercase), keep first occurrence
        // Filter out system/service accounts that aren't real staff
        const SYSTEM = ['hr@','clients@','log@','legal@','noreply@','admin@','test@','outreachlog@']
        const seen = new Set()
        const deduped = (data||[])
          .filter(s => {
            const em = (s.user_email||'').toLowerCase()
            // Skip system accounts
            if (SYSTEM.some(sys => em.startsWith(sys))) return false
            // Skip if we've already got this person (case-insensitive)
            if (seen.has(em)) return false
            seen.add(em)
            return true
          })
          .map(s => ({
            email: s.user_email?.toLowerCase(),
            name: s.full_name || s.user_email,
            role: s.role || '',
          }))
        setStaff(deduped)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = staff.filter(s =>
    !query || s.name?.toLowerCase().includes(query.toLowerCase()) || s.email?.toLowerCase().includes(query.toLowerCase())
  )

  const select = (person) => {
    onChange(person)
    setQuery('')
    setOpen(false)
  }

  const clear = () => { onChange({ email: '', name: '' }); setQuery('') }

  return (
    <div ref={ref} style={{ position:'relative' }}>
      {label && <label className="lbl">{label}</label>}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 13px', background:'var(--bg2)', border:`1px solid ${open ? 'var(--accent)' : 'var(--border2)'}`, borderRadius:7, cursor:'pointer', boxShadow: open ? '0 0 0 3px var(--accent-soft)' : 'none', transition:'all 0.2s' }}
      >
        {selectedPerson ? (
          <>
            <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:600, color:'var(--accent)', flexShrink:0 }}>
              {selectedPerson.name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, color:'var(--text)', fontWeight:500 }}>{selectedPerson.name}</div>
              {selectedPerson.role && <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{selectedPerson.role}</div>}
            </div>
            <button onClick={e => { e.stopPropagation(); clear() }} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:16, lineHeight:1, padding:2 }}>×</button>
          </>
        ) : (
          <span style={{ fontSize:14, color:'var(--faint)', flex:1 }}>{loading ? 'Loading staff...' : placeholder}</span>
        )}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </div>

      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:500, overflow:'hidden' }}>
          <div style={{ padding:8, borderBottom:'1px solid var(--border)' }}>
            <input
              autoFocus
              className="inp"
              style={{ padding:'7px 12px', fontSize:13 }}
              placeholder="Search by name or email..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div style={{ maxHeight:220, overflowY:'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding:'16px 14px', fontSize:13, color:'var(--faint)', textAlign:'center' }}>
                {loading ? 'Loading...' : 'No staff found'}
              </div>
            ) : filtered.map(s => (
              <button key={s.email} onClick={() => select(s)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', border:'none', background: s.email === value ? 'var(--accent-soft)' : 'transparent', cursor:'pointer', textAlign:'left', transition:'background 0.1s' }}
                onMouseOver={e => { if (s.email !== value) e.currentTarget.style.background='var(--bg2)' }}
                onMouseOut={e => { if (s.email !== value) e.currentTarget.style.background='transparent' }}
              >
                <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'var(--accent)', flexShrink:0 }}>
                  {s.name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{s.name}</div>
                  <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.email}</div>
                </div>
                {s.email === value && <span style={{ color:'var(--accent)', fontSize:14 }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
