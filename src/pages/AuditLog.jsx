import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { fetchAuditLogs } from '../utils/auditApi'
import { getPresenceMeta, mergeStaffPresenceRecord } from '../utils/staffPresence'
import { FormInput, StatusBadge } from '../components/ds'

const TONE_TO_VARIANT = { green: 'active', amber: 'warning', red: 'error', blue: 'info', grey: 'neutral' }

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
      const [{ data: logRows }, { data: activeRows }, { data: presenceRows }] = await Promise.all([
        fetchAuditLogs({ select: '*', limit: 200 }),
        supabase.from('hr_profiles').select('user_email,full_name,role,department,last_seen').gte('last_seen', activeCutoff).order('last_seen', { ascending:false }).limit(24),
        supabase.from('portal_settings').select('key,value').like('key', 'staff_presence:%').limit(200),
      ])
      const presenceMap = new Map(
        (presenceRows || []).map((row) => {
          const record = mergeStaffPresenceRecord(row.value?.value ?? row.value ?? {})
          return [record.user_email, record]
        }),
      )
      setLogs(logRows || [])
      setActiveUsers((activeRows || []).map((person) => ({
        ...person,
        presence: presenceMap.get(String(person.user_email || '').toLowerCase().trim()) || null,
      })))
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

  const getPresenceLabel = (person) => {
    const meta = getPresenceMeta(person?.presence?.status || 'online')
    if (meta.key === 'online') return formatPresenceAge(person.last_seen)
    return meta.label
  }

  const getPresenceVariant = (person) => TONE_TO_VARIANT[getPresenceMeta(person?.presence?.status || 'online').tone] || 'info'

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div><h1>Audit Log</h1><p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>{logs.length} entries</p></div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:20 }}>
        <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20 }}>
          <div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{activeUsers.length}</div>
          <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Active now</div>
        </div>
        <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20, minHeight:120 }}>
          <div style={{ fontSize:11, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--color-text-tertiary)', marginBottom:10 }}>Live staff</div>
          {activeUsers.length ? (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {activeUsers.slice(0, 8).map((person) => (
                <StatusBadge key={person.user_email} variant={getPresenceVariant(person)} title={person.user_email}>
                  {person.full_name || person.user_email}
                </StatusBadge>
              ))}
            </div>
          ) : (
            <div style={{ fontSize:13, color:'var(--color-text-secondary)' }}>No staff seen in the last 5 minutes.</div>
          )}
        </div>
      </div>

      {activeUsers.length ? (
        <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', overflow:'hidden', marginBottom:20 }}>
          <table className="ds-table">
            <thead><tr><th>Staff</th><th>Role</th><th>Department</th><th>Status</th></tr></thead>
            <tbody>
              {activeUsers.map((person) => (
                <tr key={person.user_email}>
                  <td>{person.full_name || person.user_email}</td>
                  <td>{person.role || 'Staff'}</td>
                  <td>{person.department || '—'}</td>
                  <td><StatusBadge variant={getPresenceVariant(person)}>{getPresenceLabel(person)}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div style={{ position:'relative', maxWidth:400, marginBottom:20 }}>
        <Search size={13} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--color-text-tertiary)' }}/>
        <FormInput style={{ paddingLeft:34, width:'100%' }} placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
          <table className="ds-table">
            <thead><tr><th>User</th><th>Action</th><th>Target</th><th>Date</th></tr></thead>
            <tbody>
              {filtered.map((l,i) => (
                <tr key={l.id||i}>
                  <td>{l.user_name||l.user_email}</td>
                  <td><StatusBadge variant="info">{l.action?.replace(/_/g,' ')}</StatusBadge></td>
                  <td>{l.target}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(l.created_at).toLocaleString('en-GB')}</td>
                </tr>
              ))}
              {filtered.length===0 && <tr><td colSpan={4} style={{ textAlign:'center', padding:40, color:'var(--color-text-tertiary)' }}>No entries</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
