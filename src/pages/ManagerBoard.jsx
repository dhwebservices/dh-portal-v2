import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock3, ShieldCheck, UserCheck, Users } from 'lucide-react'
import { supabase } from '../utils/supabase'

const OUTREACH_META_PREFIX = '[dh-outreach-meta]'

function normalizeOutreachStatus(value = '') {
  const safe = String(value || '').toLowerCase().replace(/\s+/g, '_')
  return ['new', 'contacted', 'interested', 'not_interested', 'follow_up', 'converted'].includes(safe) ? safe : 'new'
}

function parseOutreachNotes(raw = '') {
  const text = String(raw || '')
  if (!text.startsWith(OUTREACH_META_PREFIX)) {
    return { follow_up_date: '', assigned_to_email: '', assigned_to_name: '' }
  }
  const newlineIndex = text.indexOf('\n')
  const metaLine = newlineIndex >= 0 ? text.slice(OUTREACH_META_PREFIX.length, newlineIndex).trim() : text.slice(OUTREACH_META_PREFIX.length).trim()
  try {
    const parsed = JSON.parse(metaLine || '{}')
    return {
      follow_up_date: parsed.follow_up_date || '',
      assigned_to_email: parsed.assigned_to_email || '',
      assigned_to_name: parsed.assigned_to_name || '',
    }
  } catch {
    return { follow_up_date: '', assigned_to_email: '', assigned_to_name: '' }
  }
}

function needsOutreachFollowUp(row) {
  return ['contacted', 'interested', 'follow_up'].includes(normalizeOutreachStatus(row.status))
}

function isOutreachOverdue(row) {
  if (!needsOutreachFollowUp(row)) return false
  if (row.follow_up_date) {
    return new Date(`${row.follow_up_date}T23:59:59`).getTime() < Date.now()
  }
  const touchedAt = row.updated_at || row.created_at
  if (!touchedAt) return false
  const age = Math.floor((Date.now() - new Date(touchedAt).getTime()) / 86400000)
  return normalizeOutreachStatus(row.status) === 'interested' ? age >= 2 : age >= 3
}

function formatDayLabel(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function ManagerStat({ icon: Icon, label, value, hint, accent }) {
  return (
    <div className="stat-card" style={{ minHeight: 144 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <Icon size={18} color={accent} />
      </div>
      <div className="stat-val">{value}</div>
      <div className="stat-lbl">{label}</div>
      <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 6, lineHeight: 1.5 }}>{hint}</div>
    </div>
  )
}

function Panel({ title, subtitle, action, children }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)' }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 5, lineHeight: 1.5 }}>{subtitle}</div> : null}
        </div>
        {action || null}
      </div>
      {children}
    </div>
  )
}

function QueueRow({ title, meta, status, tone, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '12px 18px',
        border: 'none',
        borderBottom: '1px solid var(--border)',
        background: 'transparent',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 14,
        cursor: 'pointer',
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.5 }}>{meta}</div>
      </div>
      <span className={`badge badge-${tone || 'grey'}`} style={{ alignSelf: 'center' }}>{status}</span>
    </button>
  )
}

function EmptyState({ text }) {
  return <div style={{ padding: '28px 18px', color: 'var(--faint)', fontSize: 13, textAlign: 'center' }}>{text}</div>
}

export default function ManagerBoard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState({
    stats: {
      overdueOutreach: 0,
      agingLeave: 0,
      staleOnboarding: 0,
      expiringDocs: 0,
    },
    teamLoad: [],
    actionQueue: [],
  })

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: outreach }, { data: leave }, { data: onboarding }] = await Promise.all([
        supabase.from('outreach').select('id,business_name,contact_name,email,status,notes,created_at,updated_at').order('updated_at', { ascending: false }).limit(120),
        supabase.from('hr_leave').select('id,user_name,start_date,end_date,status,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(40),
        supabase.from('onboarding_submissions').select('user_email,user_name,status,submitted_at,created_at,rtw_expiry').eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(40),
      ])

      const normalizedOutreach = (outreach || [])
        .map((row) => {
          const meta = parseOutreachNotes(row.notes)
          return {
            ...row,
            follow_up_date: meta.follow_up_date,
            assigned_to_email: meta.assigned_to_email,
            assigned_to_name: meta.assigned_to_name,
            overdue: isOutreachOverdue({ ...row, follow_up_date: meta.follow_up_date }),
          }
        })
        .filter((row) => needsOutreachFollowUp(row))

      const outreachByOwner = normalizedOutreach.reduce((acc, row) => {
        const owner = row.assigned_to_name || row.assigned_to_email || 'Unassigned'
        if (!acc[owner]) {
          acc[owner] = { owner, total: 0, overdue: 0, dueSoon: 0 }
        }
        acc[owner].total += 1
        if (row.overdue) acc[owner].overdue += 1
        else if (row.follow_up_date) acc[owner].dueSoon += 1
        return acc
      }, {})

      const agingLeave = (leave || [])
        .map((row) => ({
          ...row,
          ageDays: row.created_at ? Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86400000) : 0,
        }))
        .filter((row) => row.ageDays >= 2)

      const staleOnboarding = (onboarding || [])
        .map((row) => ({
          ...row,
          ageDays: row.submitted_at ? Math.floor((Date.now() - new Date(row.submitted_at).getTime()) / 86400000) : 0,
        }))
        .filter((row) => row.ageDays >= 2)

      const expiringDocs = (onboarding || [])
        .map((row) => {
          if (!row.rtw_expiry) return null
          const daysLeft = Math.ceil((new Date(row.rtw_expiry).getTime() - Date.now()) / 86400000)
          return { ...row, daysLeft }
        })
        .filter((row) => row && row.daysLeft >= 0 && row.daysLeft <= 30)

      const actionQueue = [
        ...normalizedOutreach.filter((row) => row.overdue).slice(0, 4).map((row) => ({
          id: `outreach-${row.id}`,
          title: row.business_name || row.contact_name || 'Untitled lead',
          meta: `${row.assigned_to_name || 'Unassigned'} · ${row.email || 'No email'}${row.follow_up_date ? ` · follow up ${formatDayLabel(row.follow_up_date)}` : ''}`,
          status: 'outreach overdue',
          tone: 'red',
          route: '/outreach?filter=follow_up_queue',
        })),
        ...agingLeave.slice(0, 2).map((row) => ({
          id: `leave-${row.id}`,
          title: `${row.user_name} leave approval`,
          meta: `${row.start_date} to ${row.end_date} · waiting ${row.ageDays} day${row.ageDays === 1 ? '' : 's'}`,
          status: 'leave pending',
          tone: 'amber',
          route: '/hr/leave',
        })),
        ...staleOnboarding.slice(0, 2).map((row) => ({
          id: `onboarding-${row.user_email}`,
          title: row.user_name || row.user_email,
          meta: `Submitted ${row.ageDays} day${row.ageDays === 1 ? '' : 's'} ago`,
          status: 'review overdue',
          tone: 'blue',
          route: '/hr/onboarding',
        })),
        ...expiringDocs.slice(0, 2).map((row) => ({
          id: `rtw-${row.user_email}`,
          title: row.user_name || row.user_email,
          meta: `Right-to-work expires in ${row.daysLeft} day${row.daysLeft === 1 ? '' : 's'}`,
          status: 'document risk',
          tone: 'red',
          route: '/hr/documents',
        })),
      ]

      setState({
        stats: {
          overdueOutreach: normalizedOutreach.filter((row) => row.overdue).length,
          agingLeave: agingLeave.length,
          staleOnboarding: staleOnboarding.length,
          expiringDocs: expiringDocs.length,
        },
        teamLoad: Object.values(outreachByOwner)
          .sort((a, b) => (b.overdue - a.overdue) || (b.total - a.total))
          .slice(0, 8),
        actionQueue,
      })
      setLoading(false)
    }

    load()
  }, [])

  return (
    <div className="fade-in">
      <div className="page-hd" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="page-title">Manager Board</h1>
          <p className="page-sub">A live control centre for overdue work, approvals, onboarding pressure, and team load.</p>
        </div>
      </div>

      {loading ? (
        <div className="spin-wrap"><div className="spin" /></div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
            <ManagerStat icon={Clock3} label="Overdue outreach" value={state.stats.overdueOutreach} hint="Leads that need chasing now" accent="var(--red)" />
            <ManagerStat icon={ShieldCheck} label="Aging leave approvals" value={state.stats.agingLeave} hint="Requests pending for 2+ days" accent="var(--amber)" />
            <ManagerStat icon={UserCheck} label="Stale onboarding" value={state.stats.staleOnboarding} hint="Submissions waiting 2+ days" accent="var(--blue)" />
            <ManagerStat icon={Users} label="Expiring RTW docs" value={state.stats.expiringDocs} hint="Right-to-work expiring in 30 days" accent="var(--green)" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(300px,0.9fr)', gap: 18 }}>
            <Panel title="Action-needed queue" subtitle="The most urgent manager actions across outreach and HR.">
              {state.actionQueue.length ? (
                state.actionQueue.map((item) => (
                  <QueueRow
                    key={item.id}
                    title={item.title}
                    meta={item.meta}
                    status={item.status}
                    tone={item.tone}
                    onClick={() => navigate(item.route)}
                  />
                ))
              ) : <EmptyState text="No urgent manager actions are showing right now." />}
            </Panel>

            <Panel title="Team outreach load" subtitle="Who currently owns the heaviest follow-up pressure.">
              {state.teamLoad.length ? (
                <div style={{ display: 'grid', gap: 10, padding: 18 }}>
                  {state.teamLoad.map((row) => (
                    <div key={row.owner} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{row.owner}</div>
                        <span className={`badge badge-${row.overdue > 0 ? 'red' : row.dueSoon > 0 ? 'amber' : 'blue'}`}>
                          {row.overdue > 0 ? `${row.overdue} overdue` : `${row.total} active`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--sub)' }}>
                        <span>{row.total} follow-ups</span>
                        <span>·</span>
                        <span>{row.dueSoon} due soon</span>
                        <span>·</span>
                        <span>{row.overdue} overdue</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState text="No outreach ownership load is available yet." />}
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}
