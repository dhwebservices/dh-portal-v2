import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const ACTION_COLORS = {
  outreach_added:'var(--accent)', outreach_updated:'var(--amber)', outreach_deleted:'var(--red)',
  client_added:'var(--green)', client_updated:'var(--amber)', client_deleted:'var(--red)',
  task_created:'var(--accent)', task_updated:'var(--amber)',
  support_reply:'var(--green)', staff_login:'var(--sub)',
}

export default function Reports() {
  const [tab, setTab]         = useState('overview')
  const [period, setPeriod]   = useState('30')
  const [loading, setLoading] = useState(true)
  const [stats, setStats]     = useState({})
  const [revenueData, setRevData] = useState([])

  // Audit log state
  const [logs, setLogs]         = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logSearch, setLogSearch] = useState('')
  const [logFilter, setLogFilter] = useState('all')
  const [logPage, setLogPage]   = useState(0)
  const LOG_PAGE_SIZE = 50

  // Activity state
  const [activity, setActivity] = useState([])
  const [actLoading, setActLoading] = useState(false)

  useEffect(() => { loadStats() }, [period])
  useEffect(() => { if (tab === 'audit') loadLogs() }, [tab, logSearch, logFilter, logPage])
  useEffect(() => { if (tab === 'activity') loadActivity() }, [tab])

  const loadStats = async () => {
    setLoading(true)
    const since = new Date(Date.now() - Number(period) * 86400000).toISOString()
    const results = await Promise.allSettled([
      supabase.from('outreach').select('*', { count:'exact', head:true }),
      supabase.from('clients').select('*', { count:'exact', head:true }).eq('status','active'),
      supabase.from('support_tickets').select('*', { count:'exact', head:true }).eq('status','open'),
      supabase.from('tasks').select('*', { count:'exact', head:true }).neq('status','done'),
      supabase.from('commissions').select('commission_amount,date').gte('date', since).order('date'),
    ])
    const get = (i, key) => results[i].status === 'fulfilled' ? (results[i].value[key] ?? null) : null
    const totalOutreach = get(0, 'count') || 0
    const activeClients = get(1, 'count') || 0
    const openTickets   = get(2, 'count') || 0
    const totalTasks    = get(3, 'count') || 0
    const commData      = get(4, 'data') || []
    setStats({ totalOutreach, activeClients, openTickets, totalTasks })
    const revenue = (commData||[]).reduce((acc, c) => {
      const month = c.date?.substring(0,7) || 'Unknown'
      const ex = acc.find(x => x.month===month)
      if (ex) ex.amount += Number(c.commission_amount||0)
      else acc.push({ month, amount: Number(c.commission_amount||0) })
      return acc
    }, [])
    setRevData(revenue)
    setLoading(false)
  }

  const loadLogs = async () => {
    setLogsLoading(true)
    let q = supabase.from('audit_log').select('*').order('created_at', { ascending:false }).range(logPage * LOG_PAGE_SIZE, (logPage+1) * LOG_PAGE_SIZE - 1)
    if (logSearch) q = q.or(`user_name.ilike.%${logSearch}%,action.ilike.%${logSearch}%,target.ilike.%${logSearch}%`)
    if (logFilter !== 'all') q = q.ilike('action', `%${logFilter}%`)
    const { data } = await q
    setLogs(data || [])
    setLogsLoading(false)
  }

  const loadActivity = async () => {
    setActLoading(true)
    try {
      // Use hr_profiles.last_seen for reliable active user tracking
      const [{ data: profiles }, { data: logs }] = await Promise.all([
        supabase.from('hr_profiles').select('user_email,user_name,full_name,role,last_seen,updated_at').not('user_email', 'is', null).order('updated_at', { ascending:false }),
        supabase.from('audit_log').select('user_email,created_at').eq('action', 'user_login').order('created_at', { ascending:false }),
      ])
      // Count logins + get last login time per user from audit_log
      const loginMap = {}
      ;(logs || []).forEach(l => {
        const k = (l.user_email || '').toLowerCase()
        if (!loginMap[k]) loginMap[k] = { count: 0, lastLogin: null }
        loginMap[k].count++
        if (!loginMap[k].lastLogin || l.created_at > loginMap[k].lastLogin) {
          loginMap[k].lastLogin = l.created_at
        }
      })

      // Build user list from hr_profiles, falling back to audit_log for last seen
      const users = (profiles || []).map(p => {
        const key = (p.user_email || '').toLowerCase()
        const logData = loginMap[key] || { count: 0, lastLogin: null }
        return {
          email:    p.user_email,
          name:     p.full_name || p.user_name || p.user_email,
          role:     p.role || '',
          lastSeen: p.last_seen || logData.lastLogin || null,
          actions:  logData.count,
        }
      })

      // Also add users from audit_log who may not have an hr_profile yet
      const profileEmails = new Set((profiles || []).map(p => (p.user_email||'').toLowerCase()))
      Object.entries(loginMap).forEach(([email, data]) => {
        if (!profileEmails.has(email)) {
          users.push({ email, name: email, role: '', lastSeen: data.lastLogin, actions: data.count })
        }
      })

      setActivity(users.sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || '')))
    } catch {}
    setActLoading(false)
  }

  const ACTION_TYPES = ['all','outreach','client','task','support','staff','leave','login']

  const formatAction = (action) => action?.replace(/_/g,' ') || '—'
  const timeAgo = (dt) => {
    const diff = Date.now() - new Date(dt)
    const mins = Math.floor(diff/60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins/60)
    if (hrs < 24) return `${hrs}h ago`
    return new Date(dt).toLocaleDateString('en-GB', { day:'numeric', month:'short' })
  }

  return (
    <div className="fade-in">
      <div className="page-hd"><div><h1 className="page-title">Reports</h1></div></div>

      <div className="tabs">
        {[['overview','Overview'],['audit','Audit Log'],['activity','User Activity']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={'tab'+(tab===k?' on':'')}>{l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
            {[['7','7 days'],['30','30 days'],['90','90 days']].map(([v,l]) => (
              <button key={v} onClick={() => setPeriod(v)} className={'pill'+(period===v?' on':'')}>{l}</button>
            ))}
          </div>
          {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:16, marginBottom:28 }}>
                {[
                  ['Contacts', stats.totalOutreach, 'var(--accent)'],
                  ['Active Clients', stats.activeClients, 'var(--green)'],
                  ['Open Tickets', stats.openTickets, 'var(--amber)'],
                  ['Open Tasks', stats.totalTasks, 'var(--red)'],
                ].map(([label, val, color]) => (
                  <div key={label} className="stat-card">
                    <div className="stat-val" style={{ color }}>{val ?? '—'}</div>
                    <div className="stat-lbl">{label}</div>
                  </div>
                ))}
              </div>
              {revenueData.length > 0 && (
                <div className="card card-pad">
                  <div style={{ fontWeight:600, fontSize:14, marginBottom:16 }}>Commission Revenue by Month</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={revenueData}>
                      <XAxis dataKey="month" tick={{ fontSize:11, fontFamily:'var(--font-mono)' }}/>
                      <YAxis tick={{ fontSize:11, fontFamily:'var(--font-mono)' }} tickFormatter={v => '£'+v}/>
                      <Tooltip formatter={v => '£'+Number(v).toLocaleString()} labelStyle={{ fontFamily:'var(--font-mono)', fontSize:11 }}/>
                      <Bar dataKey="amount" fill="var(--accent)" radius={[4,4,0,0]} minPointSize={1}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
            <div style={{ position:'relative', flex:1, minWidth:200 }}>
              <svg style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--faint)',pointerEvents:'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="inp" style={{ paddingLeft:34 }} placeholder="Search by user, action, or target..." value={logSearch} onChange={e => { setLogSearch(e.target.value); setLogPage(0) }}/>
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {ACTION_TYPES.map(t => (
                <button key={t} onClick={() => { setLogFilter(t); setLogPage(0) }} className={'pill'+(logFilter===t?' on':'')}>{t}</button>
              ))}
            </div>
          </div>

          <div className="card" style={{ overflow:'hidden' }}>
            {logsLoading ? <div className="spin-wrap"><div className="spin"/></div> : logs.length === 0 ? (
              <div className="empty"><p>No audit entries found</p></div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)', whiteSpace:'nowrap' }}>
                        {new Date(l.created_at).toLocaleDateString('en-GB')} {new Date(l.created_at).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}
                      </td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ width:20, height:20, borderRadius:'50%', background:'var(--accent-soft)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:600, color:'var(--accent)', flexShrink:0 }}>
                            {(l.user_name||l.user_email||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                          </span>
                          <span style={{ fontSize:13 }}>{l.user_name || l.user_email}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize:12, fontFamily:'var(--font-mono)', color: ACTION_COLORS[l.action] || 'var(--sub)', background: ACTION_COLORS[l.action] ? ACTION_COLORS[l.action]+'18' : 'var(--bg2)', padding:'2px 7px', borderRadius:4 }}>
                          {formatAction(l.action)}
                        </span>
                      </td>
                      <td style={{ fontSize:13 }}>{l.target || '—'}</td>
                      <td style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>
                        {l.details && Object.keys(l.details).length > 0 ? JSON.stringify(l.details).slice(0,60) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setLogPage(p => Math.max(0,p-1))} disabled={logPage===0}>← Prev</button>
            <span style={{ fontSize:12, color:'var(--faint)', alignSelf:'center', fontFamily:'var(--font-mono)' }}>Page {logPage+1}</span>
            <button className="btn btn-outline btn-sm" onClick={() => setLogPage(p => p+1)} disabled={logs.length < LOG_PAGE_SIZE}>Next →</button>
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div>
          <div className="card" style={{ overflow:'hidden' }}>
            {actLoading ? <div className="spin-wrap"><div className="spin"/></div> : activity.length === 0 ? (
              <div className="empty"><p>No activity recorded yet.<br/>Activity is tracked as staff use the portal.</p></div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Staff Member</th><th>Email</th><th>Last Active</th><th>Total Actions</th><th>Status</th></tr></thead>
                <tbody>
                  {activity.map(u => {
                    const lastMs = Date.now() - new Date(u.lastSeen)
                    const isOnline = u.lastSeen && lastMs < 3600000
                    const isToday  = u.lastSeen && lastMs < 86400000
                    return (
                      <tr key={u.email}>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ width:28, height:28, borderRadius:'50%', background:'var(--accent-soft)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'var(--accent)' }}>
                              {(u.name||u.email).split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                            </span>
                            <span className="t-main">{u.name || u.email}</span>
                          </div>
                        </td>
                        <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{u.email}</td>
                        <td>
                          <div style={{ fontSize:13 }}>{u.lastSeen ? timeAgo(u.lastSeen) : 'Never'}</div>
                          <div style={{ fontSize:10, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{u.lastSeen ? new Date(u.lastSeen).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : ''}</div>
                        </td>
                        <td>
                          <span style={{ fontFamily:'var(--font-mono)', fontSize:13, fontWeight:600, color:'var(--accent)' }}>{u.actions || '—'}</span>
                        </td>
                        <td>
                          <span className={'badge badge-'+(isOnline?'green':isToday?'blue':'grey')}>
                            {isOnline ? 'Online' : isToday ? 'Today' : u.lastSeen ? 'Offline' : 'Never'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
