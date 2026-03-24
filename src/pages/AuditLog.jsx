import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '../utils/supabase'

export default function AuditLog() {
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    supabase.from('audit_log').select('*').order('created_at', { ascending:false }).limit(200).then(({ data }) => {
      setLogs(data || [])
      setLoading(false)
    })
  }, [])

  const filtered = logs.filter(l => {
    const q = search.toLowerCase()
    return !q || l.user_name?.toLowerCase().includes(q) || l.action?.toLowerCase().includes(q) || l.target?.toLowerCase().includes(q)
  })

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Audit Log</h1><p className="page-sub">{logs.length} entries</p></div>
      </div>
      <div className="search-wrap" style={{ maxWidth:400, marginBottom:20 }}>
        <Search size={13} className="search-icon"/>
        <input className="inp" style={{ paddingLeft:34 }} placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
          <table className="tbl">
            <thead><tr><th>User</th><th>Action</th><th>Target</th><th>Date</th></tr></thead>
            <tbody>
              {filtered.map((l,i) => (
                <tr key={l.id||i}>
                  <td className="t-main">{l.user_name||l.user_email}</td>
                  <td><span className="badge badge-grey">{l.action?.replace(/_/g,' ')}</span></td>
                  <td>{l.target}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(l.created_at).toLocaleString('en-GB')}</td>
                </tr>
              ))}
              {filtered.length===0 && <tr><td colSpan={4} style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>No entries</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
