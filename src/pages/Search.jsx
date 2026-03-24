import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../utils/supabase'

const SECTIONS = [
  { key:'clients',  label:'Clients',          table:'clients',   fields:['name','email','phone','plan'],           icon:'👤', route: c => '/clients' },
  { key:'outreach', label:'Clients Contacted', table:'outreach',  fields:['business_name','contact_name','email'],  icon:'📞', route: c => '/outreach' },
  { key:'tasks',    label:'Tasks',             table:'tasks',     fields:['title','description','assigned_to_name'],icon:'✓',  route: c => '/tasks' },
  { key:'support',  label:'Support Tickets',   table:'support_tickets', fields:['subject','message','client_name'],icon:'💬', route: c => '/support' },
  { key:'staff',    label:'Staff',             table:'hr_profiles',     fields:['full_name','user_email','role','department'], icon:'🧑‍💼', route: c => `/my-staff/${encodeURIComponent(c.user_email||'')}` },
  { key:'invoices', label:'Invoices',          table:'client_invoices', fields:['client_name','description','invoice_number'], icon:'🧾', route: c => '/client-mgmt' },
]

export default function Search() {
  const [params]            = useSearchParams()
  const navigate            = useNavigate()
  const [query, setQuery]   = useState(params.get('q') || '')
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState(false)
  const [total, setTotal]   = useState(0)
  const inputRef            = useRef()
  const debounce            = useRef()

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    clearTimeout(debounce.current)
    if (!query.trim() || query.length < 2) { setResults({}); setTotal(0); return }
    debounce.current = setTimeout(() => doSearch(query.trim()), 280)
  }, [query])

  const doSearch = async (q) => {
    setLoading(true)
    const out = {}
    let count = 0
    await Promise.all(SECTIONS.map(async sec => {
      try {
        // Build OR filter across fields
        const filter = sec.fields.map(f => `${f}.ilike.%${q}%`).join(',')
        const { data } = await supabase.from(sec.table).select('*').or(filter).limit(6)
        if (data?.length) {
          out[sec.key] = data
          count += data.length
        }
      } catch {}
    }))
    setResults(out)
    setTotal(count)
    setLoading(false)
  }

  const highlight = (text, q) => {
    if (!text || !q) return text || ''
    const str = String(text)
    const idx = str.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return str
    return (
      <>
        {str.slice(0, idx)}
        <mark style={{ background:'var(--accent-soft)', color:'var(--accent)', borderRadius:2, padding:'0 1px' }}>{str.slice(idx, idx+q.length)}</mark>
        {str.slice(idx + q.length)}
      </>
    )
  }

  const getTitle = (sec, item) => {
    const f = sec.fields[0]
    return item[f] || item.name || item.title || item.subject || '—'
  }
  const getSub = (sec, item) => {
    const f = sec.fields[1]
    return item[f] || item.email || item.user_email || ''
  }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Search</h1></div>
      </div>

      {/* Search input */}
      <div style={{ position:'relative', maxWidth:600, marginBottom:28 }}>
        <svg style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'var(--faint)', pointerEvents:'none' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          ref={inputRef}
          className="inp"
          style={{ paddingLeft:44, paddingRight:16, fontSize:16, borderRadius:100, height:48 }}
          placeholder="Search staff, clients, tasks, tickets..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {loading && <div style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)' }}><div className="spin" style={{ width:16, height:16 }}/></div>}
        {!loading && query && <button onClick={() => setQuery('')} style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:18, lineHeight:1 }}>×</button>}
      </div>

      {/* Results */}
      {query.length >= 2 && !loading && total === 0 && (
        <div className="empty"><p>No results for "<strong>{query}</strong>"</p></div>
      )}

      {total > 0 && (
        <div style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)', marginBottom:20 }}>
          {total} result{total !== 1 ? 's' : ''} for "{query}"
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
        {SECTIONS.map(sec => {
          const items = results[sec.key]
          if (!items?.length) return null
          return (
            <div key={sec.key}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--faint)', marginBottom:10 }}>
                {sec.label} — {items.length} result{items.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                {items.map((item, i) => (
                  <button key={i} onClick={() => navigate(sec.route(item))}
                    style={{ display:'flex', alignItems:'center', gap:14, padding:'11px 16px', borderRadius:10, border:'1px solid var(--border)', background:'var(--card)', textAlign:'left', cursor:'pointer', transition:'all 0.15s' }}
                    onMouseOver={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.background='var(--accent-soft)' }}
                    onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--card)' }}
                  >
                    <span style={{ fontSize:18, flexShrink:0 }}>{sec.icon}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:500, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {highlight(getTitle(sec, item), query)}
                      </div>
                      {getSub(sec, item) && (
                        <div style={{ fontSize:12, color:'var(--faint)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'var(--font-mono)' }}>
                          {highlight(getSub(sec, item), query)}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize:11, color:'var(--faint)', flexShrink:0 }}>{sec.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
