import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarRange, CheckSquare, Clock3, Download, HeadphonesIcon, ShieldCheck, UserCheck, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../utils/supabase'

const ACTION_COLORS = {
  outreach_added: 'var(--accent)',
  outreach_updated: 'var(--amber)',
  outreach_deleted: 'var(--red)',
  client_added: 'var(--green)',
  client_updated: 'var(--amber)',
  client_deleted: 'var(--red)',
  task_created: 'var(--accent)',
  task_updated: 'var(--amber)',
  support_reply: 'var(--green)',
  user_login: 'var(--sub)',
}

const LOG_PAGE_SIZE = 50
const ACTION_TYPES = ['all', 'outreach', 'client', 'task', 'support', 'staff', 'leave', 'login']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function getWeekStart(d = new Date()) {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
  dt.setDate(diff)
  dt.setHours(0, 0, 0, 0)
  return dt.toISOString().split('T')[0]
}

function getTodayName() {
  return DAYS[new Date().getDay()]
}

function scheduleHours(entry) {
  if (!entry?.start || !entry?.end) return 0
  const [sh, sm] = entry.start.split(':').map(Number)
  const [eh, em] = entry.end.split(':').map(Number)
  return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60)
}

function formatMoney(value) {
  return `£${Number(value || 0).toLocaleString()}`
}

function formatAction(action) {
  return action?.replace(/_/g, ' ') || '—'
}

function timeAgo(dt) {
  if (!dt) return 'Never'
  const diff = Date.now() - new Date(dt)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(dt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function toCsv(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape = (value) => {
    const stringValue = value == null ? '' : String(value)
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`
    }
    return stringValue
  }
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n')
}

function downloadCsv(filename, rows) {
  const csv = toCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function ReportStatCard({ icon: Icon, label, value, hint, accent }) {
  return (
    <div className="stat-card" style={{ minHeight: 150, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `${accent}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={accent} />
      </div>
      <div>
        <div className="stat-val">{value}</div>
        <div className="stat-lbl">{label}</div>
        {hint ? <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 6, lineHeight: 1.5 }}>{hint}</div> : null}
      </div>
    </div>
  )
}

function ReportPanel({ title, subtitle, action, children }) {
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

function EmptyState({ text }) {
  return <div style={{ padding: '28px 18px', color: 'var(--faint)', fontSize: 13, textAlign: 'center' }}>{text}</div>
}

export default function Reports() {
  const [tab, setTab] = useState('overview')
  const [period, setPeriod] = useState('30')
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState({
    stats: {},
    revenue: [],
    scheduleHours: [],
    pressureItems: [],
    summaryRows: [],
  })
  const [people, setPeople] = useState([])
  const [peopleLoading, setPeopleLoading] = useState(false)
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logSearch, setLogSearch] = useState('')
  const [logFilter, setLogFilter] = useState('all')
  const [logPage, setLogPage] = useState(0)

  useEffect(() => {
    loadOverview()
  }, [period])

  useEffect(() => {
    if (tab === 'people') loadPeople()
  }, [tab])

  useEffect(() => {
    if (tab === 'audit') loadLogs()
  }, [tab, logSearch, logFilter, logPage])

  async function loadOverview() {
    setLoading(true)
    const since = new Date(Date.now() - Number(period) * 86400000).toISOString()
    const todayIso = new Date().toISOString().split('T')[0]
    const twoWeeksOut = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
    const todayName = getTodayName()
    const weekStart = getWeekStart()

    const results = await Promise.allSettled([
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('tasks').select('*').neq('status', 'done').order('due_date', { ascending: true }).limit(8),
      supabase.from('hr_leave').select('id,user_name,start_date,end_date,status').eq('status', 'pending').order('created_at', { ascending: false }).limit(8),
      supabase.from('onboarding_submissions').select('user_email,user_name,status,submitted_at').eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(8),
      supabase.from('appointments').select('id,client_name,staff_name,date,start_time,status').gte('date', todayIso).lte('date', twoWeeksOut).neq('status', 'cancelled').order('date', { ascending: true }).limit(8),
      supabase.from('commissions').select('commission_amount,date,status').gte('date', since).order('date', { ascending: true }),
      supabase.from('schedules').select('user_email,user_name,week_data,submitted').eq('week_start', weekStart).eq('submitted', true),
      supabase.from('outreach').select('*', { count: 'exact', head: true }),
    ])

    const get = (index, key, fallback) => (results[index].status === 'fulfilled' ? results[index].value[key] ?? fallback : fallback)
    const clients = get(0, 'count', 0)
    const tickets = get(1, 'count', 0)
    const openTasks = get(2, 'data', [])
    const pendingLeave = get(3, 'data', [])
    const pendingOnboarding = get(4, 'data', [])
    const appointments = get(5, 'data', [])
    const commissions = get(6, 'data', [])
    const schedules = get(7, 'data', [])
    const outreachCount = get(8, 'count', 0)

    const revenue = commissions.reduce((acc, item) => {
      const month = item.date?.slice(0, 7) || 'Unknown'
      const existing = acc.find((entry) => entry.month === month)
      if (existing) existing.amount += Number(item.commission_amount || 0)
      else acc.push({ month, amount: Number(item.commission_amount || 0) })
      return acc
    }, [])

    const scheduleHoursByStaff = schedules
      .map((row) => {
        const todayEntry = row.week_data?.[todayName] || {}
        const allHours = Object.values(row.week_data || {}).reduce((sum, entry) => sum + scheduleHours(entry), 0)
        return {
          name: row.user_name || row.user_email,
          todayHours: Number(scheduleHours(todayEntry).toFixed(1)),
          weekHours: Number(allHours.toFixed(1)),
        }
      })
      .filter((row) => row.weekHours > 0)
      .sort((a, b) => b.weekHours - a.weekHours)
      .slice(0, 6)

    const pressureItems = [
      ...openTasks.slice(0, 3).map((task) => ({
        id: `task-${task.id}`,
        label: task.title,
        meta: `${task.priority || 'normal'} priority${task.due_date ? ` · due ${task.due_date}` : ''}`,
        tone: task.priority === 'high' ? 'red' : task.priority === 'medium' ? 'amber' : 'blue',
      })),
      ...pendingLeave.slice(0, 2).map((leave) => ({
        id: `leave-${leave.id}`,
        label: `${leave.user_name} leave request`,
        meta: `${leave.start_date} to ${leave.end_date}`,
        tone: 'amber',
      })),
      ...pendingOnboarding.slice(0, 2).map((submission) => ({
        id: `onboarding-${submission.user_email}`,
        label: `${submission.user_name || submission.user_email} onboarding`,
        meta: submission.submitted_at ? `submitted ${new Date(submission.submitted_at).toLocaleDateString('en-GB')}` : 'awaiting review',
        tone: 'blue',
      })),
    ].slice(0, 6)

    const totalRevenue = commissions.reduce((sum, item) => sum + Number(item.commission_amount || 0), 0)
    const completedRevenue = commissions.filter((item) => item.status === 'paid').reduce((sum, item) => sum + Number(item.commission_amount || 0), 0)

    setOverview({
      stats: {
        clients,
        tickets,
        openTasks: openTasks.length,
        pendingLeave: pendingLeave.length,
        pendingOnboarding: pendingOnboarding.length,
        appointments: appointments.length,
        outreachCount,
        totalRevenue,
        completedRevenue,
      },
      revenue,
      scheduleHours: scheduleHoursByStaff,
      pressureItems,
      summaryRows: [
        ['Revenue tracked', formatMoney(totalRevenue)],
        ['Paid commissions', formatMoney(completedRevenue)],
        ['Upcoming calls', appointments.length],
        ['Submitted schedules', schedules.length],
        ['Pending onboarding', pendingOnboarding.length],
        ['Open support tickets', tickets],
      ],
    })
    setLoading(false)
  }

  async function loadPeople() {
    setPeopleLoading(true)
    try {
      const weekStart = getWeekStart()
      const [{ data: profiles }, { data: logs }, { data: schedules }, { data: onboarding }] = await Promise.all([
        supabase.from('hr_profiles').select('user_email,full_name,role,department,manager_name,last_seen').not('user_email', 'is', null),
        supabase.from('audit_log').select('user_email,created_at').eq('action', 'user_login').order('created_at', { ascending: false }),
        supabase.from('schedules').select('user_email,user_name,week_data').eq('week_start', weekStart).eq('submitted', true),
        supabase.from('onboarding_submissions').select('user_email,status').order('submitted_at', { ascending: false }),
      ])

      const loginMap = {}
      ;(logs || []).forEach((log) => {
        const key = (log.user_email || '').toLowerCase()
        if (!loginMap[key]) loginMap[key] = { actions: 0, lastLogin: null }
        loginMap[key].actions += 1
        if (!loginMap[key].lastLogin || log.created_at > loginMap[key].lastLogin) {
          loginMap[key].lastLogin = log.created_at
        }
      })

      const scheduleMap = {}
      ;(schedules || []).forEach((row) => {
        const key = (row.user_email || '').toLowerCase()
        scheduleMap[key] = Object.values(row.week_data || {}).reduce((sum, entry) => sum + scheduleHours(entry), 0)
      })

      const onboardingMap = {}
      ;(onboarding || []).forEach((row) => {
        const key = (row.user_email || '').toLowerCase()
        if (!onboardingMap[key]) onboardingMap[key] = row.status
      })

      const merged = (profiles || []).map((profile) => {
        const key = (profile.user_email || '').toLowerCase()
        const log = loginMap[key] || { actions: 0, lastLogin: null }
        const weekHours = scheduleMap[key] || 0
        const onboardingStatus = onboardingMap[key]
        return {
          email: profile.user_email,
          name: profile.full_name || profile.user_email,
          role: profile.role || 'Staff',
          department: profile.department || '—',
          manager: profile.manager_name || '—',
          lastSeen: profile.last_seen || log.lastLogin,
          actions: log.actions,
          weekHours: Number(weekHours.toFixed(1)),
          status: onboardingStatus === 'submitted' ? 'Onboarding' : (profile.last_seen || log.lastLogin ? 'Active' : 'Quiet'),
        }
      })

      setPeople(merged.sort((a, b) => (b.weekHours - a.weekHours) || ((b.lastSeen || '').localeCompare(a.lastSeen || ''))))
    } catch (err) {
      console.error('People reports load failed:', err)
      setPeople([])
    } finally {
      setPeopleLoading(false)
    }
  }

  async function loadLogs() {
    setLogsLoading(true)
    let query = supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE - 1)

    if (logSearch) {
      query = query.or(`user_name.ilike.%${logSearch}%,action.ilike.%${logSearch}%,target.ilike.%${logSearch}%`)
    }
    if (logFilter !== 'all') {
      query = query.ilike('action', `%${logFilter}%`)
    }

    const { data } = await query
    setLogs(data || [])
    setLogsLoading(false)
  }

  const peopleExportRows = useMemo(() => people.map((person) => ({
    name: person.name,
    email: person.email,
    role: person.role,
    department: person.department,
    manager: person.manager,
    status: person.status,
    week_hours: person.weekHours,
    last_seen: person.lastSeen ? new Date(person.lastSeen).toISOString() : '',
    actions: person.actions,
  })), [people])

  return (
    <div className="fade-in">
      <div className="page-hd" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">Live operations, people activity, and audit visibility in one place.</p>
        </div>
      </div>

      <div className="tabs">
        {[
          ['overview', 'Overview'],
          ['people', 'People'],
          ['audit', 'Audit Log'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`tab${tab === key ? ' on' : ''}`}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              ['7', '7 days'],
              ['30', '30 days'],
              ['90', '90 days'],
            ].map(([value, label]) => (
              <button key={value} onClick={() => setPeriod(value)} className={`pill${period === value ? ' on' : ''}`}>{label}</button>
            ))}
          </div>

          {loading ? (
            <div className="spin-wrap"><div className="spin" /></div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
                <ReportStatCard icon={Users} label="Active clients" value={overview.stats.clients || 0} hint="Current onboarded client accounts" accent="var(--green)" />
                <ReportStatCard icon={HeadphonesIcon} label="Open tickets" value={overview.stats.tickets || 0} hint="Support items needing a response" accent="var(--amber)" />
                <ReportStatCard icon={CheckSquare} label="Open tasks" value={overview.stats.openTasks || 0} hint="Tasks still active across the portal" accent="var(--accent)" />
                <ReportStatCard icon={Clock3} label="Pending onboarding" value={overview.stats.pendingOnboarding || 0} hint="Starters waiting for review" accent="var(--blue)" />
                <ReportStatCard icon={CalendarRange} label="Pending leave" value={overview.stats.pendingLeave || 0} hint="Requests waiting for approval" accent="var(--amber)" />
                <ReportStatCard icon={UserCheck} label="Upcoming calls" value={overview.stats.appointments || 0} hint="Calls scheduled in the next 14 days" accent="var(--accent)" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(300px,0.95fr)', gap: 18 }}>
                <ReportPanel
                  title="Revenue tracked"
                  subtitle={`Commission revenue recorded over the last ${period} days.`}
                  action={overview.revenue.length ? <button className="btn btn-outline btn-sm" onClick={() => downloadCsv(`dh-revenue-${period}d.csv`, overview.revenue)}><Download size={14} /> Export</button> : null}
                >
                  {overview.revenue.length ? (
                    <div style={{ padding: '18px 18px 8px' }}>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={overview.revenue}>
                          <CartesianGrid stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} />
                          <YAxis tick={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} tickFormatter={(value) => `£${value}`} />
                          <Tooltip formatter={(value) => formatMoney(value)} labelStyle={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
                          <Bar dataKey="amount" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState text="No commission revenue has been recorded for this period." />
                  )}
                </ReportPanel>

                <ReportPanel title="Operations snapshot" subtitle="The quickest health check for this reporting period.">
                  <div style={{ display: 'grid', gap: 10, padding: 18 }}>
                    {overview.summaryRows.map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg2)' }}>
                        <span style={{ fontSize: 13, color: 'var(--sub)' }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </ReportPanel>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(300px,0.95fr)', gap: 18 }}>
                <ReportPanel
                  title="Scheduled hours"
                  subtitle="Submitted rota hours for this week, ranked by staff member."
                  action={overview.scheduleHours.length ? <button className="btn btn-outline btn-sm" onClick={() => downloadCsv('dh-scheduled-hours.csv', overview.scheduleHours)}><Download size={14} /> Export</button> : null}
                >
                  {overview.scheduleHours.length ? (
                    <div style={{ padding: '18px 18px 8px' }}>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={overview.scheduleHours} layout="vertical" margin={{ left: 24 }}>
                          <CartesianGrid stroke="var(--border)" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} />
                          <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(value) => `${value}h`} />
                          <Bar dataKey="weekHours" fill="var(--green)" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState text="No submitted schedules were found for this week." />
                  )}
                </ReportPanel>

                <ReportPanel title="Pressure points" subtitle="The items most likely to create admin drag next.">
                  {overview.pressureItems.length ? (
                    <div>
                      {overview.pressureItems.map((item, index) => (
                        <div key={item.id} style={{ padding: '14px 18px', borderBottom: index === overview.pressureItems.length - 1 ? 'none' : '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{item.label}</div>
                            <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.5 }}>{item.meta}</div>
                          </div>
                          <span className={`badge badge-${item.tone}`}>{item.tone}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState text="Nothing urgent is standing out in the current reporting window." />
                  )}
                </ReportPanel>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'people' && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.6 }}>
              A live people view combining HR profiles, portal activity, and this week’s submitted rota hours.
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => downloadCsv('dh-people-report.csv', peopleExportRows)} disabled={!people.length}>
              <Download size={14} /> Export
            </button>
          </div>

          <ReportPanel title="People reporting" subtitle="Use this to spot quiet accounts, missing activity, or mismatched rota patterns.">
            {peopleLoading ? (
              <div className="spin-wrap"><div className="spin" /></div>
            ) : people.length ? (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Staff member</th>
                      <th>Role</th>
                      <th>Manager</th>
                      <th>Scheduled hours</th>
                      <th>Last active</th>
                      <th>Actions</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((person) => (
                      <tr key={person.email}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>
                              {(person.name || person.email).split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase()}
                            </span>
                            <div>
                              <div className="t-main">{person.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{person.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>{person.role}</td>
                        <td>{person.manager}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{person.weekHours}h</td>
                        <td>
                          <div style={{ fontSize: 13 }}>{timeAgo(person.lastSeen)}</div>
                          <div style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{person.lastSeen ? new Date(person.lastSeen).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{person.actions || 0}</td>
                        <td><span className={`badge badge-${person.status === 'Onboarding' ? 'amber' : person.status === 'Active' ? 'green' : 'blue'}`}>{person.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState text="No people activity data is available yet." />
            )}
          </ReportPanel>
        </div>
      )}

      {tab === 'audit' && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <input className="inp" style={{ paddingLeft: 36 }} placeholder="Search by user, action, or target..." value={logSearch} onChange={(e) => { setLogSearch(e.target.value); setLogPage(0) }} />
              <BarChart3 size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)', pointerEvents: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ACTION_TYPES.map((type) => (
                <button key={type} onClick={() => { setLogFilter(type); setLogPage(0) }} className={`pill${logFilter === type ? ' on' : ''}`}>{type}</button>
              ))}
            </div>
          </div>

          <ReportPanel title="Audit log" subtitle="A searchable trail of system activity, staff actions, and operational changes.">
            {logsLoading ? (
              <div className="spin-wrap"><div className="spin" /></div>
            ) : logs.length ? (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)', whiteSpace: 'nowrap' }}>
                          {new Date(log.created_at).toLocaleDateString('en-GB')} {new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: 'var(--accent)' }}>
                              {(log.user_name || log.user_email || '?').split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase()}
                            </span>
                            <span style={{ fontSize: 13 }}>{log.user_name || log.user_email}</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: ACTION_COLORS[log.action] || 'var(--sub)', background: ACTION_COLORS[log.action] ? `${ACTION_COLORS[log.action]}18` : 'var(--bg2)', padding: '2px 7px', borderRadius: 4 }}>
                            {formatAction(log.action)}
                          </span>
                        </td>
                        <td style={{ fontSize: 13 }}>{log.target || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>
                          {log.details && Object.keys(log.details).length ? JSON.stringify(log.details).slice(0, 90) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState text="No audit entries match the current filters." />
            )}
          </ReportPanel>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setLogPage((page) => Math.max(0, page - 1))} disabled={logPage === 0}>← Prev</button>
            <span style={{ fontSize: 12, color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>Page {logPage + 1}</span>
            <button className="btn btn-outline btn-sm" onClick={() => setLogPage((page) => page + 1)} disabled={logs.length < LOG_PAGE_SIZE}>Next →</button>
          </div>
        </div>
      )}
    </div>
  )
}
