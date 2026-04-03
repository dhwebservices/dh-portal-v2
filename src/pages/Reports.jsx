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
const OUTREACH_META_PREFIX = '[dh-outreach-meta]'

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

function labelize(value = '') {
  return String(value || '').replace(/_/g, ' ')
}

function normalizeOutreachStatus(value = '') {
  const safe = String(value || '').toLowerCase().replace(/\s+/g, '_')
  return ['new', 'contacted', 'interested', 'not_interested', 'follow_up', 'converted'].includes(safe) ? safe : 'new'
}

function parseOutreachNotes(raw = '') {
  const text = String(raw || '')
  if (!text.startsWith(OUTREACH_META_PREFIX)) {
    return {
      outcome: 'none',
      follow_up_date: '',
      assigned_to_email: '',
      assigned_to_name: '',
      creator_email: '',
    }
  }

  const newlineIndex = text.indexOf('\n')
  const metaLine = newlineIndex >= 0 ? text.slice(OUTREACH_META_PREFIX.length, newlineIndex).trim() : text.slice(OUTREACH_META_PREFIX.length).trim()

  try {
    const parsed = JSON.parse(metaLine || '{}')
    return {
      outcome: parsed.outcome || 'none',
      follow_up_date: parsed.follow_up_date || '',
      assigned_to_email: parsed.assigned_to_email || '',
      assigned_to_name: parsed.assigned_to_name || '',
      creator_email: parsed.creator_email || '',
    }
  } catch {
    return {
      outcome: 'none',
      follow_up_date: '',
      assigned_to_email: '',
      assigned_to_name: '',
      creator_email: '',
    }
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
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(touchedAt).getTime()) / 86400000))
  const status = normalizeOutreachStatus(row.status)
  if (status === 'interested' || status === 'follow_up') return ageDays >= 2
  return ageDays >= 4
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
  const [outreach, setOutreach] = useState({
    stats: {},
    byStaff: [],
    byStatus: [],
    byOutcome: [],
    queue: [],
    exportRows: [],
  })
  const [outreachLoading, setOutreachLoading] = useState(false)
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
    if (tab === 'outreach') loadOutreach()
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

  async function loadOutreach() {
    setOutreachLoading(true)
    try {
      const [{ data: rows }, { data: appointments }, { data: clients }] = await Promise.all([
        supabase.from('outreach').select('*').order('created_at', { ascending: false }),
        supabase.from('appointments').select('id,client_email,client_business,status').neq('status', 'cancelled'),
        supabase.from('clients').select('id,email,name,status').order('created_at', { ascending: false }),
      ])

      const normalized = (rows || []).map((row) => {
        const meta = parseOutreachNotes(row.notes)
        const status = normalizeOutreachStatus(row.status)
        const assignedTo = meta.assigned_to_name || meta.assigned_to_email || ''
        const owner = assignedTo || row.added_by || meta.creator_email || 'Unassigned'
        const matchedAppointment = (appointments || []).some((entry) => {
          const leadEmail = String(row.email || '').toLowerCase()
          const apptEmail = String(entry.client_email || '').toLowerCase()
          const leadBusiness = String(row.business_name || '').toLowerCase()
          const apptBusiness = String(entry.client_business || '').toLowerCase()
          return (leadEmail && apptEmail && leadEmail === apptEmail) || (leadBusiness && apptBusiness && leadBusiness === apptBusiness)
        })
        const matchedClient = (clients || []).some((entry) => {
          const leadEmail = String(row.email || '').toLowerCase()
          const clientEmail = String(entry.email || '').toLowerCase()
          const leadBusiness = String(row.business_name || '').toLowerCase()
          const clientBusiness = String(entry.name || '').toLowerCase()
          return (leadEmail && clientEmail && leadEmail === clientEmail) || (leadBusiness && clientBusiness && leadBusiness === clientBusiness)
        })

        return {
          id: row.id,
          business_name: row.business_name || 'Unnamed lead',
          contact_name: row.contact_name || '',
          email: row.email || '',
          status,
          outcome: meta.outcome || 'none',
          follow_up_date: meta.follow_up_date || '',
          owner,
          added_by: row.added_by || '',
          created_at: row.created_at,
          updated_at: row.updated_at,
          overdue: isOutreachOverdue({ ...row, status, follow_up_date: meta.follow_up_date }),
          booked_call: matchedAppointment || meta.outcome === 'booked_call',
          proposal_requested: meta.outcome === 'proposal_requested',
          converted: status === 'converted' || matchedClient,
        }
      })

      const total = normalized.length
      const converted = normalized.filter((row) => row.converted).length
      const interested = normalized.filter((row) => row.status === 'interested').length
      const queue = normalized.filter((row) => needsOutreachFollowUp(row))
      const overdue = normalized.filter((row) => row.overdue).length
      const bookedCalls = normalized.filter((row) => row.booked_call).length
      const proposals = normalized.filter((row) => row.proposal_requested).length

      const byStaffMap = normalized.reduce((acc, row) => {
        const key = row.owner || 'Unassigned'
        if (!acc[key]) {
          acc[key] = {
            staff: key,
            leads: 0,
            followUps: 0,
            overdue: 0,
            interested: 0,
            bookedCalls: 0,
            converted: 0,
          }
        }
        acc[key].leads += 1
        if (needsOutreachFollowUp(row)) acc[key].followUps += 1
        if (row.overdue) acc[key].overdue += 1
        if (row.status === 'interested') acc[key].interested += 1
        if (row.booked_call) acc[key].bookedCalls += 1
        if (row.converted) acc[key].converted += 1
        return acc
      }, {})

      const byStatusMap = normalized.reduce((acc, row) => {
        acc[row.status] = (acc[row.status] || 0) + 1
        return acc
      }, {})

      const byOutcomeMap = normalized.reduce((acc, row) => {
        const key = row.outcome && row.outcome !== 'none' ? row.outcome : 'unset'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})

      setOutreach({
        stats: {
          total,
          converted,
          conversionRate: total ? Math.round((converted / total) * 100) : 0,
          queue: queue.length,
          overdue,
          interested,
          bookedCalls,
          proposals,
        },
        byStaff: Object.values(byStaffMap)
          .sort((a, b) => (b.converted - a.converted) || (b.bookedCalls - a.bookedCalls) || (b.leads - a.leads))
          .slice(0, 10),
        byStatus: Object.entries(byStatusMap)
          .map(([status, count]) => ({ status: labelize(status), count }))
          .sort((a, b) => b.count - a.count),
        byOutcome: Object.entries(byOutcomeMap)
          .map(([outcome, count]) => ({ outcome: labelize(outcome), count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
        queue: normalized
          .filter((row) => row.overdue || row.follow_up_date)
          .sort((a, b) => {
            if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
            return String(a.follow_up_date || '').localeCompare(String(b.follow_up_date || ''))
          })
          .slice(0, 8),
        exportRows: normalized.map((row) => ({
          business_name: row.business_name,
          contact_name: row.contact_name,
          email: row.email,
          owner: row.owner,
          added_by: row.added_by,
          status: row.status,
          outcome: row.outcome,
          follow_up_date: row.follow_up_date,
          overdue: row.overdue ? 'yes' : 'no',
          booked_call: row.booked_call ? 'yes' : 'no',
          proposal_requested: row.proposal_requested ? 'yes' : 'no',
          converted: row.converted ? 'yes' : 'no',
          created_at: row.created_at,
          updated_at: row.updated_at,
        })),
      })
    } catch (err) {
      console.error('Outreach reports load failed:', err)
      setOutreach({
        stats: {},
        byStaff: [],
        byStatus: [],
        byOutcome: [],
        queue: [],
        exportRows: [],
      })
    } finally {
      setOutreachLoading(false)
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
          ['outreach', 'Outreach'],
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

      {tab === 'outreach' && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.6 }}>
              Outreach performance across assigned leads, booked calls, overdue follow-ups, and conversion progress.
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => downloadCsv('dh-outreach-performance.csv', outreach.exportRows)} disabled={!outreach.exportRows.length}>
              <Download size={14} /> Export
            </button>
          </div>

          {outreachLoading ? (
            <div className="spin-wrap"><div className="spin" /></div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
                <ReportStatCard icon={Users} label="Leads tracked" value={outreach.stats.total || 0} hint="All outreach records currently in the portal" accent="var(--accent)" />
                <ReportStatCard icon={UserCheck} label="Booked calls" value={outreach.stats.bookedCalls || 0} hint="Leads that have turned into booked appointments" accent="var(--green)" />
                <ReportStatCard icon={Clock3} label="Follow-up queue" value={outreach.stats.queue || 0} hint="Leads still needing another touch" accent="var(--amber)" />
                <ReportStatCard icon={ShieldCheck} label="Overdue" value={outreach.stats.overdue || 0} hint="Follow-ups now late and needing attention" accent="var(--red)" />
                <ReportStatCard icon={CheckSquare} label="Interested" value={outreach.stats.interested || 0} hint="Leads showing live momentum" accent="var(--blue)" />
                <ReportStatCard icon={BarChart3} label="Conversion rate" value={`${outreach.stats.conversionRate || 0}%`} hint={`${outreach.stats.converted || 0} leads converted into clients`} accent="var(--green)" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(300px,0.85fr)', gap: 18 }}>
                <ReportPanel title="Performance by staff" subtitle="Assigned ownership, follow-up pressure, booked calls, and conversion output.">
                  {outreach.byStaff.length ? (
                    <div style={{ padding: '18px 18px 8px' }}>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={outreach.byStaff} margin={{ left: 18 }}>
                          <CartesianGrid stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="staff" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} />
                          <Tooltip />
                          <Bar dataKey="converted" fill="var(--green)" radius={[6, 6, 0, 0]} />
                          <Bar dataKey="bookedCalls" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                          <Bar dataKey="overdue" fill="var(--red)" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState text="No outreach ownership data is available yet." />
                  )}
                </ReportPanel>

                <ReportPanel title="Status mix" subtitle="Where the current outreach pool is sitting right now.">
                  {outreach.byStatus.length ? (
                    <div style={{ display: 'grid', gap: 10, padding: 18 }}>
                      {outreach.byStatus.map((row) => (
                        <div key={row.status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg2)' }}>
                          <span style={{ fontSize: 13, color: 'var(--sub)' }}>{row.status}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{row.count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState text="No outreach status data is available yet." />
                  )}
                </ReportPanel>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(300px,0.95fr)', gap: 18 }}>
                <ReportPanel title="Follow-up pressure" subtitle="Leads that should be worked next, prioritised by lateness and due date.">
                  {outreach.queue.length ? (
                    <div>
                      {outreach.queue.map((row, index) => (
                        <div key={row.id} style={{ padding: '14px 18px', borderBottom: index === outreach.queue.length - 1 ? 'none' : '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{row.business_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.5 }}>
                              {row.owner} · {row.follow_up_date ? `follow up ${row.follow_up_date}` : 'no follow-up date set'}{row.email ? ` · ${row.email}` : ''}
                            </div>
                          </div>
                          <span className={`badge badge-${row.overdue ? 'red' : 'amber'}`}>{row.overdue ? 'overdue' : 'due'}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState text="No follow-up pressure is showing right now." />
                  )}
                </ReportPanel>

                <ReportPanel title="Outcome mix" subtitle="How calls and follow-ups are being resolved across the current lead pool.">
                  {outreach.byOutcome.length ? (
                    <div style={{ display: 'grid', gap: 10, padding: 18 }}>
                      {outreach.byOutcome.map((row) => (
                        <div key={row.outcome} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg2)' }}>
                          <span style={{ fontSize: 13, color: 'var(--sub)' }}>{row.outcome}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{row.count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState text="No outreach outcome data is available yet." />
                  )}
                </ReportPanel>
              </div>
            </>
          )}
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
