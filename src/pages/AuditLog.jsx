import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { fetchAuditLogs } from '../utils/auditApi'

function formatPresenceAge(value) {
  if (!value) return 'Unknown'
  const diffMs = Date.now() - new Date(value).getTime()
  const diffMins = Math.max(0, Math.round(diffMs / 60000))
  if (diffMins <= 1) return 'Seen just now'
  return `Seen ${diffMins} mins ago`
}

export default function AuditLog() {
  const [logs, setLogs]       = useState([])
  const [activeUsers, setActiveUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    async function load() {
      const activeCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const [{ data: logRows }, { data: activeRows }] = await Promise.all([
        fetchAuditLogs({ select: '*', limit: 200 }),
        supabase.from('hr_profiles').select('user_email,full_name,role,department,last_seen').gte('last_seen', activeCutoff).order('last_seen', { ascending:false }).limit(24),
      ])
      setLogs(logRows || [])
      setActiveUsers(activeRows || [])
      setLoading(false)
    }

    load()
    const interval = setInterval(load, 60 * 1000)
    return () => clearInterval(interval)
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

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:20 }}>
        <div className="stat-card">
          <div className="stat-val">{activeUsers.length}</div>
          <div className="stat-lbl">Active now</div>
        </div>
        <div className="card card-pad" style={{ minHeight:120 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)', marginBottom:10 }}>Live staff</div>
          {activeUsers.length ? (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {activeUsers.slice(0, 8).map((person) => (
                <span key={person.user_email} className="badge badge-green" title={person.user_email}>
                  {person.full_name || person.user_email}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize:13, color:'var(--sub)' }}>No staff seen in the last 5 minutes.</div>
          )}
        </div>
      </div>

      {activeUsers.length ? (
        <div className="card" style={{ overflow:'hidden', marginBottom:20 }}>
          <table className="tbl">
            <thead><tr><th>Staff</th><th>Role</th><th>Department</th><th>Status</th></tr></thead>
            <tbody>
              {activeUsers.map((person) => (
                <tr key={person.user_email}>
                  <td className="t-main">{person.full_name || person.user_email}</td>
                  <td>{person.role || 'Staff'}</td>
                  <td>{person.department || '—'}</td>
                  <td><span className="badge badge-green">{formatPresenceAge(person.last_seen)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

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
