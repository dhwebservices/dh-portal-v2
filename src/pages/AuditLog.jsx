import { useState, useEffect } from 'react'
import { Shield, RefreshCw, Users } from 'lucide-react'

import { supabase } from '../utils/supabase'

const actionColors = {
  client_added:     'var(--gold)',
  client_onboarded: 'var(--green)',
  commission_paid:  'var(--amber)',
  outreach_added:   'var(--blue)',
  user_updated:     'var(--sub)',
  support_reply:    'var(--green)',
  invoice_added:    'var(--amber)',
  status_updated:   'var(--gold)',
}

const actionIcons = {
  client_added:     '👤',
  client_onboarded: '🎉',
  commission_paid:  '💰',
  outreach_added:   '📞',
  user_updated:     '⚙️',
  support_reply:    '💬',
  invoice_added:    '📄',
  status_updated:   '🔄',
}

export default function AuditLog() {
  const [logs, setLogs]         = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('audit')
  const [filter, setFilter]     = useState('all')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: l }, { data: s }] = await Promise.all([
      supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('active_sessions').select('*').order('last_seen', { ascending: false }),
    ])
    setLogs(l || [])
    setSessions(s || [])
    setLoading(false)
  }

  const uniqueUsers = [...new Set(logs.map(l => l.user_email))]
  const filtered = filter === 'all' ? logs : logs.filter(l => l.user_email === filter)

  const formatTime = (ts) => {
    const d = new Date(ts)
    const now = new Date()
    const diff = Math.floor((now - d) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const isOnline = (ts) => {
    const diff = (new Date() - new Date(ts)) / 1000
    return diff < 300 // online if seen in last 5 mins
  }

  return (
    <div className="fade-in">
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px', width: 'fit-content' }}>
        {[
          { key: 'audit',    label: `Audit Log (${logs.length})` },
          { key: 'sessions', label: `Active Sessions (${sessions.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 18px', borderRadius: '7px', border: 'none',
            background: tab === t.key ? 'var(--bg2)' : 'transparent',
            color: tab === t.key ? 'var(--text)' : 'var(--sub)',
            fontSize: '13px', fontWeight: tab === t.key ? 600 : 400,
            cursor: 'pointer', transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'audit' && (
        <>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="inp" value={filter} onChange={e => setFilter(e.target.value)} style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '8px 14px', color: 'var(--text)', fontSize: '13px',
            }}>
              <option value="all">All Users</option>
              {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <button onClick={fetchAll} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 14px', color: 'var(--sub)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={13} /> Refresh
            </button>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: '12px', color: 'var(--sub)' }}>Showing last 200 actions</div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--sub)' }}>Loading audit log…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '60px 40px', textAlign: 'center' }}>
                <Shield size={32} color="var(--faint)" style={{ margin: '0 auto 14px', display: 'block' }} />
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>No activity logged yet</div>
                <p style={{ fontSize: '13px', color: 'var(--sub)' }}>Actions taken in the portal will appear here automatically.</p>
              </div>
            ) : (
              filtered.map((log, i) => (
                <div key={log.id} style={{
                  display: 'flex', gap: '14px', padding: '13px 18px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: '34px', height: '34px', borderRadius: '6px', flexShrink: 0,
                    background: `${actionColors[log.action] || 'var(--sub)'}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px',
                  }}>{actionIcons[log.action] || '📋'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 500, marginBottom: '2px' }}>
                      <strong>{log.user_name || log.user_email}</strong>
                      {' — '}{log.action?.replace(/_/g, ' ')}
                      {log.entity && <span style={{ color: 'var(--sub)' }}> · {log.entity}</span>}
                    </div>
                    {log.details && (
                      <div style={{ fontSize: '12px', color: 'var(--sub)' }}>
                        {typeof log.details === 'object' ? Object.entries(log.details).map(([k,v]) => `${k}: ${v}`).join(' · ') : log.details}
                      </div>
                    )}
                    <div style={{ fontSize: '11.5px', color: 'var(--faint)', marginTop: '3px' }}>{log.user_email} · {formatTime(log.created_at)}</div>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--faint)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {tab === 'sessions' && (
        <div className="card" style={{ padding: 0 }}>
          {sessions.length === 0 ? (
            <div style={{ padding: '60px 40px', textAlign: 'center' }}>
              <Users size={32} color="var(--faint)" style={{ margin: '0 auto 14px', display: 'block' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>No active sessions</div>
              <p style={{ fontSize: '13px', color: 'var(--sub)' }}>Sessions are registered when staff log into the portal.</p>
            </div>
          ) : (
            sessions.map((s, i) => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px',
                borderBottom: i < sessions.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                    {s.user_name?.charAt(0) || '?'}
                  </div>
                  <div style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 10, height: 10, borderRadius: '50%',
                    background: isOnline(s.last_seen) ? 'var(--green)' : 'var(--faint)',
                    border: '2px solid var(--card)',
                  }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{s.user_name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--sub)' }}>{s.user_email}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: isOnline(s.last_seen) ? 'var(--green)' : 'var(--sub)' }}>
                    {isOnline(s.last_seen) ? 'Online' : 'Away'}
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--faint)' }}>Last seen {formatTime(s.last_seen)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--faint)' }}>Logged in {formatTime(s.logged_in_at)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  </div>
  )
}
