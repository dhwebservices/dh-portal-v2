import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckSquare,
  CircleAlert,
  Clock3,
  HeadphonesIcon,
  PhoneCall,
  TrendingUp,
  UserCheck,
  Users,
  SlidersHorizontal,
} from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import SystemBannerCard from '../components/SystemBannerCard'
import { Modal } from '../components/Modal'
import { sendManagedNotification } from '../utils/notificationPreferences'
import { createTrainingRecord } from '../utils/peopleOps'
import { executeWorkflowRun, buildWorkflowPreviewRows, loadWorkflowAutomationData } from '../utils/workflowAutomation'
import {
  ACCENT_SCHEMES,
  CONTRAST_OPTIONS,
  DEFAULT_LANDING_OPTIONS,
  DASHBOARD_DENSITY_OPTIONS,
  DASHBOARD_HEADER_OPTIONS,
  DASHBOARD_SECTIONS,
  MOTION_OPTIONS,
  NAV_DENSITY_OPTIONS,
  QUICK_ACTION_OPTIONS,
  TEXT_SCALE_OPTIONS,
  WORKSPACE_PRESET_OPTIONS,
  applyWorkspacePreset,
  describeWorkspacePreset,
  mergePortalPreferences,
} from '../utils/portalPreferences'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const OUTREACH_META_PREFIX = '[dh-outreach-meta]'
const WORKFLOW_AUTO_RUN_KEY = 'dh-portal:workflow-auto-run-at'
const WORKFLOW_AUTO_RUN_INTERVAL_MS = 60 * 60 * 1000
const WORKFLOW_AUTO_RUN_POLL_MS = 5 * 60 * 1000
const REMOVED_DASHBOARD_SECTIONS = new Set(['today', 'appointments', 'priority', 'insight', 'activity', 'notifications', 'schedule', 'followups', 'manager_board'])

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

function formatDayLabel(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatPresenceTime(value) {
  if (!value) return 'Unknown'
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeOutreachStatus(value = '') {
  const safe = String(value || '').toLowerCase().replace(/\s+/g, '_')
  return ['new', 'contacted', 'interested', 'not_interested', 'follow_up', 'converted'].includes(safe) ? safe : 'new'
}

function parseOutreachNotes(raw = '') {
  const text = String(raw || '')
  if (!text.startsWith(OUTREACH_META_PREFIX)) {
    return { outcome: 'none', follow_up_date: '', plainNotes: text }
  }
  const newlineIndex = text.indexOf('\n')
  const metaLine = newlineIndex >= 0 ? text.slice(OUTREACH_META_PREFIX.length, newlineIndex).trim() : text.slice(OUTREACH_META_PREFIX.length).trim()
  const plainNotes = newlineIndex >= 0 ? text.slice(newlineIndex + 1).trim() : ''
  try {
    const parsed = JSON.parse(metaLine || '{}')
    return {
      outcome: parsed.outcome || 'none',
      follow_up_date: parsed.follow_up_date || '',
      assigned_to_email: parsed.assigned_to_email || '',
      assigned_to_name: parsed.assigned_to_name || '',
      plainNotes,
    }
  } catch {
    return { outcome: 'none', follow_up_date: '', assigned_to_email: '', assigned_to_name: '', plainNotes: plainNotes || text }
  }
}

function isOutreachFollowUp(row) {
  return ['contacted', 'interested', 'follow_up'].includes(normalizeOutreachStatus(row.status))
}

function isOutreachOverdue(row) {
  if (!isOutreachFollowUp(row)) return false
  if (row.follow_up_date) {
    return new Date(`${row.follow_up_date}T23:59:59`).getTime() < Date.now()
  }
  const touchedAt = row.updated_at || row.created_at
  if (!touchedAt) return false
  const age = Math.floor((Date.now() - new Date(touchedAt).getTime()) / 86400000)
  return normalizeOutreachStatus(row.status) === 'interested' ? age >= 2 : age >= 3
}

function getOutreachActionLabel(row) {
  const status = normalizeOutreachStatus(row.status)
  if (status === 'interested') return 'Book a call'
  if (status === 'follow_up') return 'Chase today'
  if (status === 'contacted') return 'Send follow-up'
  return 'First outreach'
}

function StatCard({ icon: Icon, label, value, accent, link, loading, hint }) {
  const nav = useNavigate()
  return (
    <div
      onClick={() => link && nav(link)}
      className="stat-card"
      style={{ cursor: link ? 'pointer' : 'default', minHeight: 164, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '18px 18px 16px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={accent} />
        </div>
        {link ? <ArrowRight size={14} style={{ color: 'var(--faint)', flexShrink: 0, marginTop: 2 }} /> : null}
      </div>
      <div style={{ marginBottom: 14 }}>
        <div className="stat-lbl" style={{ marginTop: 0, marginBottom: 8 }}>{label}</div>
        {loading ? (
          <div className="skeleton" style={{ height: 36, width: 72, borderRadius: 4 }} />
        ) : (
          <div className="stat-val">{value}</div>
        )}
      </div>
      <div style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {hint ? <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 6, lineHeight: 1.5 }}>{hint}</div> : null}
      </div>
    </div>
  )
}

function Panel({ title, actionLabel, onAction, children, tone }) {
  return (
    <div className="card" style={{ overflow: 'hidden', borderColor: tone || 'var(--border)', borderRadius: 18, background: 'color-mix(in srgb, var(--card) 92%, var(--page-tint) 8%)' }}>
      <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)' }}>{title}</div>
        {actionLabel ? (
          <button className="btn btn-ghost btn-sm" onClick={onAction}>
            {actionLabel} <ArrowRight size={12} />
          </button>
        ) : null}
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
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.5 }}>{meta}</div>
      </div>
      {status ? <span className={`badge badge-${tone || 'grey'}`} style={{ alignSelf: 'center' }}>{status}</span> : null}
    </button>
  )
}

function EmptyState({ text }) {
  return <div style={{ padding: '28px 18px', color: 'var(--faint)', fontSize: 13, textAlign: 'center' }}>{text}</div>
}

function ToolShortcutRow({ label, hint, onClick }) {
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
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.5 }}>{hint}</div>
      </div>
      <ArrowRight size={13} style={{ alignSelf: 'center', color: 'var(--faint)' }} />
    </button>
  )
}

function QuickActionCard({ icon: Icon, label, hint, onClick }) {
  return (
    <button
      onClick={onClick}
      className="dashboard-quick-action"
      style={{
        textAlign: 'left',
        padding: '12px 14px',
        borderRadius: 14,
        border: '1px solid var(--border)',
        background: 'transparent',
        display: 'grid',
        gridTemplateColumns: '32px minmax(0, 1fr) auto',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
        <Icon size={15} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 3, lineHeight: 1.45 }}>{hint}</div>
      </div>
      <ArrowRight size={14} style={{ color: 'var(--faint)' }} />
    </button>
  )
}

function ToolCard({ icon: Icon, label, hint, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '14px 0',
        border: '1px solid var(--border)',
        borderRadius: 14,
        background: 'transparent',
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', marginLeft: 14 }}>
        <Icon size={16} />
      </div>
      <div style={{ padding: '0 14px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.55 }}>{hint}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 14px' }}>
        <span style={{ fontSize: 11.5, color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Open <ArrowRight size={12} />
        </span>
      </div>
    </button>
  )
}

function ActiveBanners() {
  const [banners, setBanners] = useState([])
  const [dismissed, setDismissed] = useState([])
  const { user } = useAuth()

  useEffect(() => {
    supabase.from('banners').select('*').eq('active', true).eq('target', 'staff').then(({ data }) => setBanners(data || []))
  }, [])

  const visible = banners.filter((banner) => {
    if (dismissed.includes(banner.id)) return false
    if (banner.ends_at && new Date(banner.ends_at) <= new Date()) return false
    if (banner.target_email && banner.target_email.toLowerCase() !== (user?.email || '').toLowerCase()) return false
    if (banner.target_page && !['all', 'dashboard'].includes(String(banner.target_page).toLowerCase())) return false
    return true
  })
  if (!visible.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
      {visible.map((banner) => {
        const tone = banner.type === 'urgent' ? 'urgent' : banner.type === 'warning' ? 'warning' : banner.type === 'success' ? 'success' : 'info'
        return (
          <SystemBannerCard
            key={banner.id}
            title={banner.title || 'Staff announcement'}
            tone={tone}
            subtitle={banner.message}
            dismissible={banner.dismissible}
            onDismiss={() => setDismissed((prev) => [...prev, banner.id])}
            meta={banner.target_page && String(banner.target_page).toLowerCase() !== 'all' ? [String(banner.target_page).toLowerCase()] : []}
            compact
          />
        )
      })}
    </div>
  )
}

export default function Dashboard() {
  const { user, isAdmin, preferences, updatePreferences } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    outreach: 0,
    clients: 0,
    tickets: 0,
    tasks: 0,
    revenue: 0,
    activeUsers: 0,
    unreadNotifications: 0,
    todaysShifts: 0,
    todayHours: 0,
    pendingLeave: 0,
    pendingOnboarding: 0,
    upcomingAppointments: 0,
  })
  const [recentActivity, setRecentActivity] = useState([])
  const [priorityItems, setPriorityItems] = useState([])
  const [todaySchedule, setTodaySchedule] = useState([])
  const [upcomingAppointments, setUpcomingAppointments] = useState([])
  const [outreachFollowUps, setOutreachFollowUps] = useState([])
  const [managerBoard, setManagerBoard] = useState([])
  const [activeUsers, setActiveUsers] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [insight, setInsight] = useState('')
  const [insightLoading, setInsightLoading] = useState(false)
  const [whatsNew, setWhatsNew] = useState(null)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [showPersonalise, setShowPersonalise] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackForm, setFeedbackForm] = useState({ type: 'feature', title: '', message: '' })
  const [feedbackSending, setFeedbackSending] = useState(false)
  const [personalisePrefs, setPersonalisePrefs] = useState(() => mergePortalPreferences(preferences))
  const [savingPersonalise, setSavingPersonalise] = useState(false)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = user?.name?.split(' ')[0] || 'there'
  const dateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const todayName = getTodayName()
  const weekStart = getWeekStart()
  const todayIso = new Date().toISOString().split('T')[0]
  const sevenDaysOut = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  const dashboardSections = preferences?.dashboardSections || {}
  const dashboardDensity = preferences?.dashboardDensity || 'comfortable'
  const dashboardHeader = preferences?.dashboardHeader || 'full'
  const showSystemBanners = preferences?.showSystemBanners !== false
  const quickActions = preferences?.quickActions || []
  const dashboardOrder = preferences?.dashboardOrder || DASHBOARD_SECTIONS.map(([key]) => key)
  const phase9Tools = [
    { label: 'Support Desk', hint: 'Queue-driven ticket handling with SLA and ownership.', route: '/support', icon: HeadphonesIcon },
    { label: 'Knowledge Base', hint: 'Shared answers and internal playbooks for repeated issues.', route: '/knowledge-base', icon: Bell },
    { label: 'Compliance Rules', hint: 'Auto-check required docs and training by role or lifecycle.', route: '/hr/compliance-rules', icon: CircleAlert },
    { label: 'Training Catalogue', hint: 'Reusable training templates for staff assignments.', route: '/hr/training-catalogue', icon: UserCheck },
    { label: 'Client Pipeline', hint: 'Lifecycle stages and risk signals across client accounts.', route: '/client-pipeline', icon: Users },
    { label: 'Workflow Automation', hint: 'Trigger notifications and escalations from live portal signals.', route: '/workflow-automation', icon: SlidersHorizontal },
  ]
  const dashboardFocusItems = [
    {
      label: 'Today',
      value: `${stats.todaysShifts} shifts`,
      hint: `${stats.todayHours} scheduled hours across submitted timesheets`,
      tone: 'blue',
    },
    {
      label: 'Follow-up queue',
      value: outreachFollowUps.length,
      hint: outreachFollowUps.length ? `${outreachFollowUps.filter((item) => item.overdue).length} overdue outreach items` : 'Nothing waiting right now',
      tone: outreachFollowUps.some((item) => item.overdue) ? 'red' : 'amber',
    },
    {
      label: 'Notifications',
      value: stats.unreadNotifications,
      hint: stats.unreadNotifications ? 'Unread alerts are waiting in the bell inbox' : 'Inbox is currently clear',
      tone: stats.unreadNotifications ? 'blue' : 'green',
    },
  ]

  useEffect(() => {
    setPersonalisePrefs(mergePortalPreferences(preferences))
  }, [preferences])

  useEffect(() => {
    if (!isAdmin || !user?.email) return undefined

    let cancelled = false
    let running = false

    const maybeRunWorkflowAutomation = async () => {
      if (running || cancelled) return

      const lastRunAt = Number(window.localStorage.getItem(WORKFLOW_AUTO_RUN_KEY) || 0)
      if (lastRunAt && (Date.now() - lastRunAt) < WORKFLOW_AUTO_RUN_INTERVAL_MS) return

      running = true
      try {
        const data = await loadWorkflowAutomationData()
        if (cancelled) return

        const previewRows = buildWorkflowPreviewRows(data.rules, data.context, data.noticeMap)
        const readyRows = previewRows.filter((row) => row.recipient.email && !row.coolingDown)

        if (readyRows.length) {
          await executeWorkflowRun({
            previewRows,
            previewOnly: false,
            user,
            sendNotification: sendManagedNotification,
          })
        }

        window.localStorage.setItem(WORKFLOW_AUTO_RUN_KEY, String(Date.now()))
      } catch (error) {
        console.error('Workflow auto-run failed', error)
      } finally {
        running = false
      }
    }

    maybeRunWorkflowAutomation()
    const intervalId = window.setInterval(maybeRunWorkflowAutomation, WORKFLOW_AUTO_RUN_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [isAdmin, user])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const activeCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const todayStartIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

      const results = await Promise.allSettled([
        supabase.from('outreach').select('*', { count: 'exact', head: true }),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        isAdmin
          ? supabase.from('tasks').select('*').neq('status', 'done').order('due_date', { ascending: true }).limit(8)
          : supabase.from('tasks').select('*').ilike('assigned_to_email', user?.email || '').neq('status', 'done').order('due_date', { ascending: true }).limit(8),
        supabase.from('commissions').select('commission_amount,status'),
        supabase.from('audit_log').select('user_name,action,target,created_at').order('created_at', { ascending: false }).limit(8),
        supabase.from('notifications').select('*').ilike('user_email', user?.email || '').eq('read', false).order('created_at', { ascending: false }).limit(6),
        supabase.from('hr_profiles').select('user_email,full_name,role,last_seen').gte('last_seen', activeCutoff).order('last_seen', { ascending: false }).limit(8),
        supabase.from('schedules').select('user_email,user_name,week_data,submitted').eq('week_start', weekStart).eq('submitted', true),
        isAdmin
          ? supabase.from('hr_leave').select('id,user_name,leave_type,start_date,end_date,status,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(6)
          : Promise.resolve({ data: [] }),
        isAdmin
          ? supabase.from('onboarding_submissions').select('user_email,user_name,status,submitted_at,created_at,rtw_expiry').eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(6)
          : Promise.resolve({ data: [] }),
        supabase.from('appointments').select('id,client_name,staff_name,date,start_time,status').gte('date', todayIso).lte('date', sevenDaysOut).neq('status', 'cancelled').order('date', { ascending: true }).limit(8),
        supabase.from('outreach').select('id,business_name,contact_name,email,status,notes,created_at,updated_at').order('updated_at', { ascending: false }).limit(80),
        isAdmin
          ? supabase.from('notifications').select('user_email,title,link,created_at').gte('created_at', todayStartIso)
          : Promise.resolve({ data: [] }),
        isAdmin
          ? supabase.from('portal_settings').select('key,value').like('key', 'training_record:%')
          : Promise.resolve({ data: [] }),
      ])

      const get = (index, fallback) => (results[index].status === 'fulfilled' ? results[index].value : fallback)

      const outreach = get(0, { count: 0 }).count || 0
      const clients = get(1, { count: 0 }).count || 0
      const ticketCount = get(2, { count: 0 }).count || 0
      const taskRows = get(3, { data: [] }).data || []
      const commissions = get(4, { data: [] }).data || []
      const activity = get(5, { data: [] }).data || []
      const unreadRows = get(6, { data: [] }).data || []
      const activeRows = get(7, { data: [] }).data || []
      const scheduleRows = get(8, { data: [] }).data || []
      const leaveRows = get(9, { data: [] }).data || []
      const onboardingRows = get(10, { data: [] }).data || []
      const appointmentRows = get(11, { data: [] }).data || []
      const outreachRows = get(12, { data: [] }).data || []
      const todayNotifications = get(13, { data: [] }).data || []
      const trainingRows = get(14, { data: [] }).data || []

      const todaysScheduleRows = scheduleRows
        .map((row) => {
          const todayEntry = row.week_data?.[todayName]
          if (!todayEntry?.start || !todayEntry?.end) return null
          return {
            user_email: row.user_email,
            user_name: row.user_name,
            start: todayEntry.start,
            end: todayEntry.end,
            hours: scheduleHours(todayEntry),
            note: todayEntry.note || '',
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.start.localeCompare(b.start))

      const revenue = commissions
        .filter((commission) => commission.status === 'paid')
        .reduce((sum, commission) => sum + Number(commission.commission_amount || 0), 0)

      const todaysHours = todaysScheduleRows.reduce((sum, shift) => sum + shift.hours, 0)
      const tasksCount = taskRows.length

      setStats({
        outreach,
        clients,
        tickets: ticketCount,
        tasks: tasksCount,
        revenue,
        activeUsers: activeRows.length,
        unreadNotifications: unreadRows.length,
        todaysShifts: todaysScheduleRows.length,
        todayHours: Math.round(todaysHours * 10) / 10,
        pendingLeave: leaveRows.length,
        pendingOnboarding: onboardingRows.length,
        upcomingAppointments: appointmentRows.length,
      })

      const nextPriorityItems = [
        ...taskRows.slice(0, 3).map((task) => ({
          id: `task-${task.id}`,
          title: task.title,
          meta: `Task${task.due_date ? ` · due ${formatDayLabel(task.due_date)}` : ''}${task.assigned_to_name ? ` · ${task.assigned_to_name}` : ''}`,
          status: task.status || 'pending',
          tone: task.priority === 'high' ? 'red' : task.priority === 'medium' ? 'amber' : 'blue',
          route: isAdmin ? '/tasks' : '/my-tasks',
        })),
        ...leaveRows.slice(0, 2).map((request) => ({
          id: `leave-${request.id}`,
          title: `${request.user_name} · ${request.leave_type}`,
          meta: `${request.start_date} to ${request.end_date}`,
          status: 'pending',
          tone: 'amber',
          route: '/hr/leave',
        })),
        ...onboardingRows.slice(0, 2).map((submission) => ({
          id: `onboarding-${submission.user_email}`,
          title: submission.user_name || submission.user_email,
          meta: `Onboarding submitted${submission.submitted_at ? ` · ${formatDayLabel(submission.submitted_at.split('T')[0])}` : ''}`,
          status: 'review',
          tone: 'blue',
          route: '/hr/onboarding',
        })),
      ].slice(0, 6)

      setPriorityItems(nextPriorityItems)
      setRecentActivity(activity)
      setTodaySchedule(todaysScheduleRows)
      setUpcomingAppointments(appointmentRows)
      const nextFollowUps = outreachRows
        .map((row) => {
          const parsed = parseOutreachNotes(row.notes)
          return {
            ...row,
            outcome: parsed.outcome,
            follow_up_date: parsed.follow_up_date,
            assigned_to_email: parsed.assigned_to_email,
            assigned_to_name: parsed.assigned_to_name,
            plainNotes: parsed.plainNotes,
            overdue: false,
          }
        })
        .filter((row) => isOutreachFollowUp(row))
        .filter((row) => isAdmin ? true : String(row.assigned_to_email || '').toLowerCase() === String(user?.email || '').toLowerCase())
        .map((row) => ({
          ...row,
          overdue: isOutreachOverdue(row),
        }))
        .sort((a, b) => {
          if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
          if (a.follow_up_date && b.follow_up_date) return a.follow_up_date.localeCompare(b.follow_up_date)
          if (a.follow_up_date) return -1
          if (b.follow_up_date) return 1
          return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
        })
        .slice(0, 6)
      setOutreachFollowUps(nextFollowUps)

      const staleOnboarding = onboardingRows
        .map((row) => ({
          ...row,
          ageDays: row.submitted_at ? Math.floor((Date.now() - new Date(row.submitted_at).getTime()) / 86400000) : 0,
        }))
        .filter((row) => row.ageDays >= 2)

      const agingLeave = leaveRows
        .map((row) => ({
          ...row,
          ageDays: row.created_at ? Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86400000) : 0,
        }))
        .filter((row) => row.ageDays >= 2)

      const expiringDocs = onboardingRows
        .map((row) => {
          const expiry = row.rtw_expiry
          if (!expiry) return null
          const daysLeft = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000)
          return { ...row, daysLeft }
        })
        .filter((row) => row && row.daysLeft >= 0 && row.daysLeft <= 30)

      const overdueTraining = trainingRows
        .map((row) => createTrainingRecord({
          id: String(row.key || '').replace('training_record:', ''),
          ...(row.value?.value ?? row.value ?? {}),
        }))
        .filter((row) => row.mandatory && row.status !== 'completed' && row.due_date && new Date(`${row.due_date}T23:59:59`).getTime() <= Date.now())

      const managerItems = [
        ...nextFollowUps.slice(0, 3).map((lead) => ({
          id: `mgr-outreach-${lead.id}`,
          title: lead.business_name || lead.contact_name || 'Untitled lead',
          meta: `${lead.assigned_to_name || 'Unassigned'} · ${lead.follow_up_date ? `follow up ${formatDayLabel(lead.follow_up_date)}` : 'overdue lead'}${lead.email ? ` · ${lead.email}` : ''}`,
          status: lead.overdue ? 'overdue follow-up' : 'due follow-up',
          tone: lead.overdue ? 'red' : 'amber',
          route: '/outreach?filter=follow_up_queue',
        })),
        ...agingLeave.slice(0, 2).map((row) => ({
          id: `mgr-leave-${row.id}`,
          title: `${row.user_name} leave approval`,
          meta: `${row.start_date} to ${row.end_date} · waiting ${row.ageDays} day${row.ageDays === 1 ? '' : 's'}`,
          status: 'pending approval',
          tone: 'amber',
          route: '/hr/leave',
        })),
        ...staleOnboarding.slice(0, 2).map((row) => ({
          id: `mgr-onboarding-${row.user_email}`,
          title: row.user_name || row.user_email,
          meta: `Onboarding waiting ${row.ageDays} day${row.ageDays === 1 ? '' : 's'}${row.submitted_at ? ` · submitted ${formatDayLabel(row.submitted_at.split('T')[0])}` : ''}`,
          status: 'review overdue',
          tone: 'blue',
          route: '/hr/onboarding',
        })),
        ...expiringDocs.slice(0, 2).map((row) => ({
          id: `mgr-rtw-${row.user_email}`,
          title: row.user_name || row.user_email,
          meta: `Right-to-work expires in ${row.daysLeft} day${row.daysLeft === 1 ? '' : 's'}`,
          status: 'document risk',
          tone: 'red',
          route: '/hr/documents',
        })),
        ...overdueTraining.slice(0, 2).map((row) => ({
          id: `mgr-training-${row.id}`,
          title: row.staff_name || row.staff_email,
          meta: `${row.title}${row.due_date ? ` · due ${formatDayLabel(row.due_date)}` : ''}`,
          status: 'training overdue',
          tone: 'amber',
          route: `/my-staff/${encodeURIComponent(row.staff_email)}?tab=training`,
        })),
      ].slice(0, 8)
      setManagerBoard(managerItems)

      if (isAdmin) {
        const alreadySent = new Set(
          todayNotifications.map((row) => `${String(row.user_email || '').toLowerCase()}|${row.title}|${row.link || ''}`)
        )
        const adminEmail = String(user?.email || '').toLowerCase()
        const escalationJobs = []

        const queueAlert = nextFollowUps.filter((lead) => lead.overdue).slice(0, 3)
        for (const lead of queueAlert) {
          const title = 'Outreach follow-up escalation'
          const key = `${adminEmail}|${title}|/outreach?filter=follow_up_queue`
          if (!alreadySent.has(key)) {
            escalationJobs.push(sendManagedNotification({
              userEmail: adminEmail,
              userName: user?.name || adminEmail,
              category: 'urgent',
              type: 'warning',
              title,
              message: `${lead.business_name || lead.contact_name || 'A lead'} is overdue for follow-up.${lead.assigned_to_name ? ` Assigned to ${lead.assigned_to_name}.` : ''}${lead.email ? ` Contact email: ${lead.email}.` : ''}`,
              link: '/outreach?filter=follow_up_queue',
              emailSubject: `Overdue outreach follow-up — ${lead.business_name || lead.contact_name || 'Lead'}`,
              sentBy: 'DH Portal',
              fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
            }))
            alreadySent.add(key)
          }
        }

        if (agingLeave.length) {
          const title = 'Leave approvals are aging'
          const key = `${adminEmail}|${title}|/hr/leave`
          if (!alreadySent.has(key)) {
            escalationJobs.push(sendManagedNotification({
              userEmail: adminEmail,
              userName: user?.name || adminEmail,
              category: 'urgent',
              type: 'warning',
              title,
              message: `${agingLeave.length} leave request${agingLeave.length === 1 ? ' has' : 's have'} been pending for 2+ days and should be reviewed.`,
              link: '/hr/leave',
              emailSubject: 'Leave approvals need attention',
              sentBy: 'DH Portal',
              fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
            }))
            alreadySent.add(key)
          }
        }

        if (staleOnboarding.length) {
          const title = 'Onboarding reviews need attention'
          const key = `${adminEmail}|${title}|/hr/onboarding`
          if (!alreadySent.has(key)) {
            escalationJobs.push(sendManagedNotification({
              userEmail: adminEmail,
              userName: user?.name || adminEmail,
              category: 'urgent',
              type: 'info',
              title,
              message: `${staleOnboarding.length} onboarding submission${staleOnboarding.length === 1 ? ' is' : 's are'} waiting 2+ days for review.`,
              link: '/hr/onboarding',
              emailSubject: 'Onboarding reviews need attention',
              sentBy: 'DH Portal',
              fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
            }))
            alreadySent.add(key)
          }
        }

        if (expiringDocs.length) {
          const title = 'Right-to-work documents expiring soon'
          const key = `${adminEmail}|${title}|/hr/documents`
          if (!alreadySent.has(key)) {
            escalationJobs.push(sendManagedNotification({
              userEmail: adminEmail,
              userName: user?.name || adminEmail,
              category: 'urgent',
              type: 'warning',
              title,
              message: `${expiringDocs.length} staff record${expiringDocs.length === 1 ? '' : 's'} ha${expiringDocs.length === 1 ? 's' : 've'} right-to-work documents expiring in the next 30 days.`,
              link: '/hr/documents',
              emailSubject: 'Right-to-work documents expiring soon',
              sentBy: 'DH Portal',
              fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
            }))
            alreadySent.add(key)
          }
        }

        if (overdueTraining.length) {
          const title = 'Mandatory training is overdue'
          const key = `${adminEmail}|${title}|/my-staff`
          if (!alreadySent.has(key)) {
            escalationJobs.push(sendManagedNotification({
              userEmail: adminEmail,
              userName: user?.name || adminEmail,
              category: 'urgent',
              type: 'warning',
              title,
              message: `${overdueTraining.length} mandatory training item${overdueTraining.length === 1 ? ' is' : 's are'} overdue and should be reviewed.`,
              link: '/my-staff',
              emailSubject: 'Mandatory training is overdue',
              sentBy: 'DH Portal',
              fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
            }))
            alreadySent.add(key)
          }
        }

        if (escalationJobs.length) {
          Promise.allSettled(escalationJobs).catch(() => {})
        }
      }

      setNotifications(unreadRows)
      setActiveUsers(activeRows)
      setLoading(false)
    }

    if (user?.email) load()
    const interval = setInterval(() => {
      if (user?.email) load()
    }, 60 * 1000)
    return () => clearInterval(interval)
  }, [isAdmin, sevenDaysOut, todayIso, todayName, user?.email, weekStart])

  useEffect(() => {
    if (!user?.email) return
    supabase
      .from('portal_settings')
      .select('value')
      .eq('key', 'whats_new_payload')
      .maybeSingle()
      .then(({ data }) => {
        const payload = data?.value?.value ?? data?.value ?? null
        if (!payload?.active || !payload?.version) return
        const seenKey = `dh-whats-new-seen:${user.email.toLowerCase()}`
        if (localStorage.getItem(seenKey) === payload.version) return
        setWhatsNew(payload)
        setShowWhatsNew(true)
      })
      .catch(() => {})
  }, [user?.email])

  const generatedInsight = useMemo(() => {
    if (stats.pendingLeave > 0) {
      return 'There are leave requests waiting on a decision. Approving or rejecting those first will clear a people bottleneck quickly.'
    }
    if (stats.pendingOnboarding > 0) {
      return 'New starter paperwork is waiting for review. Clearing onboarding next reduces downstream HR friction.'
    }
    if (stats.tickets > 0) {
      return 'Open support tickets are still the fastest trust win. Closing those first protects client confidence.'
    }
    if (stats.tasks > 5) {
      return 'Your task queue is growing. Clearing the highest-priority tasks now will prevent the rest of the week from becoming reactive.'
    }
    if (stats.unreadNotifications > 0) {
      return 'You have unread internal notifications. Reviewing those before switching contexts will help avoid missed updates.'
    }
    return 'The portal is relatively clear right now. Use the quieter window to follow up leads, tidy handovers, or tighten this week’s schedules.'
  }, [stats.pendingLeave, stats.pendingOnboarding, stats.tasks, stats.tickets, stats.unreadNotifications])

  const getInsight = async () => {
    setInsightLoading(true)
    setInsight(generatedInsight)
    setInsightLoading(false)
  }

  const dismissWhatsNew = () => {
    if (user?.email && whatsNew?.version) {
      localStorage.setItem(`dh-whats-new-seen:${user.email.toLowerCase()}`, whatsNew.version)
    }
    setShowWhatsNew(false)
  }

  const patchPersonalise = (patch) => {
    setPersonalisePrefs((current) => mergePortalPreferences(current, { workspacePreset: 'custom', ...patch }))
  }

  const applyPreset = (presetKey) => {
    setPersonalisePrefs((current) => applyWorkspacePreset(current, presetKey))
  }

  const toggleQuickAction = (key) => {
    setPersonalisePrefs((current) => {
      const active = current.quickActions || []
      const next = active.includes(key)
        ? active.filter((item) => item !== key)
        : [...active, key].slice(0, 6)
      return mergePortalPreferences(current, { quickActions: next })
    })
  }

  const moveSection = (key, direction) => {
    setPersonalisePrefs((current) => {
      const order = [...(current.dashboardOrder || [])]
      const index = order.indexOf(key)
      if (index < 0) return current
      const nextIndex = direction === 'up' ? Math.max(0, index - 1) : Math.min(order.length - 1, index + 1)
      if (nextIndex === index) return current
      const [item] = order.splice(index, 1)
      order.splice(nextIndex, 0, item)
      return mergePortalPreferences(current, { dashboardOrder: order })
    })
  }

  const togglePersonaliseSection = (key) => {
    setPersonalisePrefs((current) => mergePortalPreferences(current, {
      dashboardSections: {
        ...current.dashboardSections,
        [key]: !current.dashboardSections?.[key],
      },
    }))
  }

  const saveDashboardPersonalise = async () => {
    setSavingPersonalise(true)
    try {
      await updatePreferences(personalisePrefs)
      setShowPersonalise(false)
    } catch (error) {
      console.error('Dashboard personalisation save failed:', error)
    } finally {
      setSavingPersonalise(false)
    }
  }

  const sendFeedback = async () => {
    if (!feedbackForm.title.trim() || !feedbackForm.message.trim()) {
      alert('Add a title and message first.')
      return
    }
    setFeedbackSending(true)
    try {
      const ownerEmails = new Set(['david@dhwebsiteservices.co.uk'])
      const [{ data: permissionsRows }, { data: profiles }] = await Promise.all([
        supabase.from('user_permissions').select('user_email,permissions'),
        supabase.from('hr_profiles').select('user_email,full_name'),
      ])
      const profileMap = new Map((profiles || []).map((row) => [String(row.user_email || '').toLowerCase(), row.full_name || row.user_email]))
      const adminRecipients = Array.from(new Set(
        (permissionsRows || [])
          .filter((row) => row?.permissions?.admin === true)
          .map((row) => String(row.user_email || '').toLowerCase().trim())
          .concat(Array.from(ownerEmails))
      )).filter(Boolean)

      await Promise.allSettled(adminRecipients.map((email) => sendManagedNotification({
        userEmail: email,
        userName: profileMap.get(email) || email,
        category: 'urgent',
        type: 'info',
        title: feedbackForm.type === 'feature' ? 'New feature request submitted' : 'New staff feedback submitted',
        message: `${feedbackForm.title}\n\n${feedbackForm.message}\n\nSubmitted by: ${user?.name || user?.email}`,
        link: '/notifications',
        emailSubject: `${feedbackForm.type === 'feature' ? 'Feature request' : 'Staff feedback'} — ${feedbackForm.title}`,
        emailHtml: `
          <p>Hi ${profileMap.get(email) || 'team'},</p>
          <p>A new ${feedbackForm.type === 'feature' ? 'feature request' : 'feedback item'} was submitted from the dashboard.</p>
          <div style="padding:14px 16px;border:1px solid #e5e5e5;border-radius:12px;background:#fafafa;">
            <div style="font-size:16px;font-weight:700;color:#1d1d1f;margin-bottom:8px;">${feedbackForm.title}</div>
            <div style="font-size:13px;line-height:1.7;color:#555;white-space:pre-wrap;">${feedbackForm.message}</div>
            <div style="font-size:12px;color:#777;margin-top:10px;">Submitted by ${user?.name || user?.email}</div>
          </div>
          <p><a href="https://staff.dhwebsiteservices.co.uk/notifications" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open DH Portal</a></p>
        `,
        sentBy: user?.name || user?.email || 'Portal user',
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
      })))

      setShowFeedback(false)
      setFeedbackForm({ type: 'feature', title: '', message: '' })
    } catch (error) {
      console.error('Feedback send failed:', error)
      alert('Could not send feedback right now.')
    } finally {
      setFeedbackSending(false)
    }
  }

  const visibleOrderedSections = dashboardOrder.filter((key) => dashboardSections[key] !== false && !REMOVED_DASHBOARD_SECTIONS.has(key))
  const nonStatsSections = visibleOrderedSections.filter((key) => key !== 'stats')
  const sectionPairs = []
  for (let i = 0; i < nonStatsSections.length; i += 2) {
    sectionPairs.push(nonStatsSections.slice(i, i + 2))
  }

  const quickActionMeta = Object.fromEntries(QUICK_ACTION_OPTIONS.map(([key, label, route]) => [key, { label, route }]))
  const quickActionIcons = {
    my_tasks: CheckSquare,
    notifications: Bell,
    clients: Users,
    support: HeadphonesIcon,
    my_department: UserCheck,
    my_profile: UserCheck,
    schedule: CalendarDays,
    search: SlidersHorizontal,
    outreach: PhoneCall,
  }

  const renderDashboardSection = (key) => {
    switch (key) {
      case 'today':
        return (
          <Panel key={key} title="Today At A Glance" actionLabel="Open Schedule" onAction={() => navigate('/schedule')}>
            <div className="dashboard-fourup" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0 }}>
              {[
                { icon: CalendarDays, label: 'Shifts today', value: stats.todaysShifts, hint: `${stats.todayHours} total hours`, color: 'var(--blue)' },
                { icon: Clock3, label: 'Upcoming calls', value: stats.upcomingAppointments, hint: 'Next 7 days', color: 'var(--accent)' },
                { icon: CircleAlert, label: 'Leave approvals', value: stats.pendingLeave, hint: 'Waiting for review', color: 'var(--amber)' },
                { icon: UserCheck, label: 'Onboarding', value: stats.pendingOnboarding, hint: 'Submitted forms', color: 'var(--green)' },
              ].map((item, index) => {
                const Icon = item.icon
                return (
                  <div key={item.label} style={{ padding: '18px', borderRight: index < 3 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: `${item.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <Icon size={16} color={item.color} />
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>{loading ? '—' : item.value}</div>
                    <div style={{ fontSize: 12, color: 'var(--sub)' }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 5 }}>{item.hint}</div>
                  </div>
                )
              })}
            </div>
          </Panel>
        )
      case 'followups':
        return (
          <Panel
            key={key}
            title={isAdmin ? 'Assigned Outreach Queue' : 'My Assigned Leads'}
            actionLabel="Open Clients Contacted"
            onAction={() => navigate(`/outreach?filter=${isAdmin ? 'follow_up_queue' : 'assigned_to_me'}`)}
          >
            {outreachFollowUps.length ? (
              outreachFollowUps.map((lead) => (
                <QueueRow
                  key={lead.id}
                  title={lead.business_name || lead.contact_name || 'Untitled lead'}
                  meta={`${lead.contact_name || 'No contact'}${lead.follow_up_date ? ` · follow up ${formatDayLabel(lead.follow_up_date)}` : ''}${lead.assigned_to_name ? ` · ${lead.assigned_to_name}` : ''}${lead.email ? ` · ${lead.email}` : ''}`}
                  status={lead.overdue ? 'overdue' : getOutreachActionLabel(lead)}
                  tone={lead.overdue ? 'red' : normalizeOutreachStatus(lead.status) === 'interested' ? 'green' : 'amber'}
                  onClick={() => navigate(`/outreach?filter=${isAdmin ? 'follow_up_queue' : 'assigned_to_me'}`)}
                />
              ))
            ) : <EmptyState text={isAdmin ? 'No assigned outreach follow-ups are due right now.' : 'No assigned leads need chasing right now.'} />}
          </Panel>
        )
      case 'manager_board':
        return isAdmin ? (
          <Panel
            key={key}
            title="Manager Operations Board"
            actionLabel="Open Reports"
            onAction={() => navigate('/reports')}
            tone="var(--accent-border)"
          >
            {managerBoard.length ? (
              managerBoard.map((item) => (
                <QueueRow
                  key={item.id}
                  title={item.title}
                  meta={item.meta}
                  status={item.status}
                  tone={item.tone}
                  onClick={() => navigate(item.route)}
                />
              ))
            ) : <EmptyState text="No urgent manager escalations are showing right now." />}
          </Panel>
        ) : null
      case 'insight':
        return (
          <div key={key} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)' }}>Operations Insight</div>
            <div style={{ flex: 1, fontSize: 14, color: 'var(--sub)', lineHeight: 1.7 }}>
              {insight || 'Generate a quick operational read based on the live queues in the portal.'}
            </div>
            <button onClick={getInsight} disabled={insightLoading} className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }}>
              {insightLoading ? <><div className="spin" style={{ width: 12, height: 12, borderWidth: 1.5 }} />Generating…</> : 'Generate insight'}
            </button>
          </div>
        )
      case 'priority':
        return (
          <Panel key={key} title="Priority Queue" actionLabel={isAdmin ? 'Open Tasks' : 'Open My Tasks'} onAction={() => navigate(isAdmin ? '/tasks' : '/my-tasks')}>
            {priorityItems.length ? (
              priorityItems.map((item, index) => (
                <QueueRow key={item.id} title={item.title} meta={item.meta} status={item.status} tone={item.tone} onClick={index >= 0 ? () => navigate(item.route) : undefined} />
              ))
            ) : <EmptyState text="Nothing urgent is stacked up right now." />}
          </Panel>
        )
      case 'notifications':
        return (
          <Panel key={key} title="Unread Notifications" actionLabel="View Header Bell" onAction={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            {notifications.length ? (
              notifications.map((notification) => (
                <QueueRow
                  key={notification.id}
                  title={notification.title || 'Notification'}
                  meta={notification.message}
                  status={notification.type || 'info'}
                  tone={notification.type === 'success' ? 'green' : notification.type === 'warning' ? 'amber' : notification.type === 'urgent' ? 'red' : 'blue'}
                  onClick={notification.link ? () => navigate(notification.link) : undefined}
                />
              ))
            ) : <EmptyState text="No unread notifications at the moment." />}
          </Panel>
        )
      case 'schedule':
        return (
          <Panel key={key} title="Today’s Team Schedule" actionLabel="Open Team View" onAction={() => navigate('/schedule')}>
            {todaySchedule.length ? (
              todaySchedule.map((shift) => (
                <QueueRow key={`${shift.user_email}-${shift.start}`} title={shift.user_name} meta={`${shift.start} to ${shift.end}${shift.note ? ` · ${shift.note}` : ''}`} status={`${shift.hours}h`} tone="blue" onClick={() => navigate('/schedule')} />
              ))
            ) : <EmptyState text="No submitted schedule hours were found for today." />}
          </Panel>
        )
      case 'appointments':
        return (
          <Panel key={key} title="Upcoming Appointments" actionLabel="Open Calendar" onAction={() => navigate('/appointments')}>
            {upcomingAppointments.length ? (
              upcomingAppointments.map((appointment) => (
                <QueueRow key={appointment.id} title={appointment.client_name || 'Booked call'} meta={`${formatDayLabel(appointment.date)} · ${appointment.start_time}${appointment.staff_name ? ` · ${appointment.staff_name}` : ''}`} status={appointment.status || 'scheduled'} tone="green" onClick={() => navigate('/appointments')} />
              ))
            ) : <EmptyState text="No upcoming appointments in the next 7 days." />}
          </Panel>
        )
      case 'activity':
        return (
          <Panel key={key} title="Recent Activity" actionLabel="Open Audit Log" onAction={() => navigate('/audit')}>
            {recentActivity.length ? (
              recentActivity.map((activity, index) => (
                <div className="dashboard-activity-row" key={`${activity.created_at}-${index}`} style={{ padding: '12px 18px', borderBottom: index < recentActivity.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{activity.user_name}</span>
                    <span style={{ fontSize: 13, color: 'var(--sub)' }}> — {activity.action?.replace(/_/g, ' ')}</span>
                    {activity.target ? <span style={{ fontSize: 12, color: 'var(--faint)' }}> ({activity.target})</span> : null}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)', flexShrink: 0 }}>
                    {new Date(activity.created_at).toLocaleDateString('en-GB')}
                  </div>
                </div>
              ))
            ) : <EmptyState text="No recent audit activity available." />}
          </Panel>
        )
      default:
        return null
    }
  }

  return (
    <div className="fade-in">
      {showPersonalise ? (
        <Modal
          title="Personalise dashboard"
          onClose={() => setShowPersonalise(false)}
          width={920}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => navigate('/my-profile')}>Open full portal settings</button>
              <button className="btn btn-outline" onClick={() => setShowPersonalise(false)}>Close</button>
              <button className="btn btn-primary" onClick={saveDashboardPersonalise} disabled={savingPersonalise}>
                {savingPersonalise ? 'Saving...' : 'Save dashboard'}
              </button>
            </>
          }
        >
          <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.1fr) minmax(260px,0.9fr)', gap:18 }} className="dashboard-personalise-grid">
            <div style={{ display:'grid', gap:16 }}>
              <div className="card card-pad">
                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginBottom:12 }}>Portal style</div>
                <div style={{ display:'grid', gap:12 }}>
                  <div>
                    <div className="lbl" style={{ marginBottom:8 }}>Workspace preset</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10 }}>
                      {WORKSPACE_PRESET_OPTIONS.map(([key, label]) => (
                        <button key={key} onClick={() => applyPreset(key)} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${personalisePrefs.workspacePreset === key ? 'var(--accent-border)' : 'var(--border)'}`, background: personalisePrefs.workspacePreset === key ? 'var(--accent-soft)' : 'var(--card)', textAlign:'left' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="lbl" style={{ marginBottom:8 }}>Theme mode</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      {[
                        ['light', 'Light'],
                        ['dark', 'Dark'],
                      ].map(([key, label]) => (
                        <button key={key} onClick={() => patchPersonalise({ themeMode: key })} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${personalisePrefs.themeMode === key ? 'var(--accent-border)' : 'var(--border)'}`, background: personalisePrefs.themeMode === key ? 'var(--accent-soft)' : 'var(--card)', textAlign:'left' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="lbl" style={{ marginBottom:8 }}>Accent scheme</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10 }}>
                      {Object.entries(ACCENT_SCHEMES).map(([key, scheme]) => (
                        <button key={key} onClick={() => patchPersonalise({ accentScheme: key })} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${personalisePrefs.accentScheme === key ? scheme.border : 'var(--border)'}`, background: personalisePrefs.accentScheme === key ? scheme.soft : 'var(--card)', textAlign:'left' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                            <span style={{ width:12, height:12, borderRadius:'50%', background:scheme.accent }} />
                            <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{scheme.label}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card card-pad">
                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginBottom:12 }}>Comfort & accessibility</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }} className="dashboard-personalise-grid">
                  <div>
                    <div className="lbl" style={{ marginBottom:8 }}>Text size</div>
                    <div style={{ display:'grid', gap:10 }}>
                      {TEXT_SCALE_OPTIONS.map(([key, label]) => (
                        <button key={key} onClick={() => patchPersonalise({ textScale: key })} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${personalisePrefs.textScale === key ? 'var(--accent-border)' : 'var(--border)'}`, background: personalisePrefs.textScale === key ? 'var(--accent-soft)' : 'var(--card)', textAlign:'left' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="lbl" style={{ marginBottom:8 }}>Motion</div>
                    <div style={{ display:'grid', gap:10 }}>
                      {MOTION_OPTIONS.map(([key, label]) => (
                        <button key={key} onClick={() => patchPersonalise({ motionMode: key })} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${personalisePrefs.motionMode === key ? 'var(--accent-border)' : 'var(--border)'}`, background: personalisePrefs.motionMode === key ? 'var(--accent-soft)' : 'var(--card)', textAlign:'left' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="lbl" style={{ marginBottom:8 }}>Navigation density</div>
                    <div style={{ display:'grid', gap:10 }}>
                      {NAV_DENSITY_OPTIONS.map(([key, label]) => (
                        <button key={key} onClick={() => patchPersonalise({ navDensity: key })} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${personalisePrefs.navDensity === key ? 'var(--accent-border)' : 'var(--border)'}`, background: personalisePrefs.navDensity === key ? 'var(--accent-soft)' : 'var(--card)', textAlign:'left' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="lbl" style={{ marginBottom:8 }}>Contrast</div>
                    <div style={{ display:'grid', gap:10 }}>
                      {CONTRAST_OPTIONS.map(([key, label]) => (
                        <button key={key} onClick={() => patchPersonalise({ contrastMode: key })} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${personalisePrefs.contrastMode === key ? 'var(--accent-border)' : 'var(--border)'}`, background: personalisePrefs.contrastMode === key ? 'var(--accent-soft)' : 'var(--card)', textAlign:'left' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card card-pad">
                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginBottom:12 }}>Dashboard layout</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
                  <div>
                    <div className="lbl" style={{ marginBottom:8 }}>Density</div>
                    <div style={{ display:'grid', gap:10 }}>
                      {DASHBOARD_DENSITY_OPTIONS.map(([key, label]) => (
                        <button key={key} onClick={() => patchPersonalise({ dashboardDensity: key })} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${personalisePrefs.dashboardDensity === key ? 'var(--accent-border)' : 'var(--border)'}`, background: personalisePrefs.dashboardDensity === key ? 'var(--accent-soft)' : 'var(--card)', textAlign:'left' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="lbl" style={{ marginBottom:8 }}>Header style</div>
                    <div style={{ display:'grid', gap:10 }}>
                      {DASHBOARD_HEADER_OPTIONS.map(([key, label]) => (
                        <button key={key} onClick={() => patchPersonalise({ dashboardHeader: key })} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${personalisePrefs.dashboardHeader === key ? 'var(--accent-border)' : 'var(--border)'}`, background: personalisePrefs.dashboardHeader === key ? 'var(--accent-soft)' : 'var(--card)', textAlign:'left' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom:16 }}>
                  <div className="lbl" style={{ marginBottom:8 }}>Default landing page</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10 }}>
                    {DEFAULT_LANDING_OPTIONS.map(([key, label]) => (
                      <button key={key} onClick={() => patchPersonalise({ defaultLanding: key })} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${personalisePrefs.defaultLanding === key ? 'var(--accent-border)' : 'var(--border)'}`, background: personalisePrefs.defaultLanding === key ? 'var(--accent-soft)' : 'var(--card)', textAlign:'left' }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="lbl" style={{ marginBottom:8 }}>Behaviour</div>
                  <button onClick={() => patchPersonalise({ showSystemBanners: !personalisePrefs.showSystemBanners })} style={{ width:'100%', padding:'13px 14px', borderRadius:12, border:`1px solid ${personalisePrefs.showSystemBanners ? 'var(--accent-border)' : 'var(--border)'}`, background: personalisePrefs.showSystemBanners ? 'var(--accent-soft)' : 'var(--card)', textAlign:'left', display:'flex', justifyContent:'space-between', gap:12 }}>
                    <span>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:4 }}>Show system banners</div>
                      <div style={{ fontSize:12, color:'var(--sub)' }}>Display maintenance and live service notices on your dashboard.</div>
                    </span>
                    <span className={`badge badge-${personalisePrefs.showSystemBanners ? 'blue' : 'grey'}`}>{personalisePrefs.showSystemBanners ? 'Visible' : 'Hidden'}</span>
                  </button>
                </div>
              </div>

              <div className="card card-pad">
                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginBottom:12 }}>Pinned quick actions</div>
                <div style={{ fontSize:12.5, color:'var(--sub)', marginBottom:14 }}>Pick up to 6 shortcuts for your dashboard.</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:18 }}>
                  {QUICK_ACTION_OPTIONS.map(([key, label]) => {
                    const enabled = personalisePrefs.quickActions?.includes(key)
                    return (
                      <button key={key} onClick={() => toggleQuickAction(key)} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${enabled ? 'var(--accent-border)' : 'var(--border)'}`, background: enabled ? 'var(--accent-soft)' : 'var(--card)', display:'flex', justifyContent:'space-between', gap:12, textAlign:'left' }}>
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</span>
                        <span className={`badge badge-${enabled ? 'blue' : 'grey'}`}>{enabled ? 'Pinned' : 'Off'}</span>
                      </button>
                    )
                  })}
                </div>

                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginBottom:12 }}>Visible sections</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10 }}>
                  {dashboardOrder.map((key) => {
                    const label = DASHBOARD_SECTIONS.find(([sectionKey]) => sectionKey === key)?.[1] || key
                    const enabled = personalisePrefs.dashboardSections?.[key] !== false
                    return (
                      <div key={key} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${enabled ? 'var(--accent-border)' : 'var(--border)'}`, background: enabled ? 'var(--accent-soft)' : 'var(--card)', display:'grid', gap:10 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                          <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</span>
                          <span className={`badge badge-${enabled ? 'blue' : 'grey'}`}>{enabled ? 'On' : 'Off'}</span>
                        </div>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => togglePersonaliseSection(key)}>{enabled ? 'Hide' : 'Show'}</button>
                          <button className="btn btn-outline btn-sm" onClick={() => moveSection(key, 'up')}>Move up</button>
                          <button className="btn btn-outline btn-sm" onClick={() => moveSection(key, 'down')}>Move down</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="card card-pad" style={{ alignSelf:'start' }}>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>Preview</div>
              <div style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginBottom:12 }}>Your dashboard style</div>
              <div style={{ display:'grid', gap:10 }}>
                <div style={{ padding:'14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ fontSize:12, color:'var(--sub)', marginBottom:6 }}>Workspace preset</div>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{describeWorkspacePreset(personalisePrefs)}</div>
                </div>
                <div style={{ padding:'14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ fontSize:12, color:'var(--sub)', marginBottom:6 }}>Theme & accent</div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{personalisePrefs.themeMode === 'dark' ? 'Dark mode' : 'Light mode'}</span>
                    <span className="badge badge-blue">{(ACCENT_SCHEMES[personalisePrefs.accentScheme] || ACCENT_SCHEMES.blue).label}</span>
                  </div>
                </div>
                <div style={{ padding:'14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ fontSize:12, color:'var(--sub)', marginBottom:6 }}>Layout</div>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>
                    {(DASHBOARD_DENSITY_OPTIONS.find(([key]) => key === personalisePrefs.dashboardDensity)?.[1]) || 'Comfortable'} · {(DASHBOARD_HEADER_OPTIONS.find(([key]) => key === personalisePrefs.dashboardHeader)?.[1]) || 'Full header'}
                  </div>
                </div>
                <div style={{ padding:'14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ fontSize:12, color:'var(--sub)', marginBottom:8 }}>Comfort</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <span className="badge badge-blue">{TEXT_SCALE_OPTIONS.find(([key]) => key === personalisePrefs.textScale)?.[1] || 'Standard'}</span>
                    <span className="badge badge-blue">{MOTION_OPTIONS.find(([key]) => key === personalisePrefs.motionMode)?.[1] || 'Standard motion'}</span>
                    <span className="badge badge-blue">{NAV_DENSITY_OPTIONS.find(([key]) => key === personalisePrefs.navDensity)?.[1] || 'Comfortable nav'}</span>
                    <span className="badge badge-blue">{CONTRAST_OPTIONS.find(([key]) => key === personalisePrefs.contrastMode)?.[1] || 'Standard contrast'}</span>
                  </div>
                </div>
                <div style={{ padding:'14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ fontSize:12, color:'var(--sub)', marginBottom:6 }}>Landing page</div>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>
                    {(DEFAULT_LANDING_OPTIONS.find(([key]) => key === personalisePrefs.defaultLanding)?.[1]) || 'Dashboard'}
                  </div>
                </div>
                <div style={{ padding:'14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ fontSize:12, color:'var(--sub)', marginBottom:8 }}>Pinned actions</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {(personalisePrefs.quickActions || []).map((key) => (
                      <span key={key} className="badge badge-blue">{quickActionMeta[key]?.label || key}</span>
                    ))}
                  </div>
                </div>
                <div style={{ padding:'14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ fontSize:12, color:'var(--sub)', marginBottom:8 }}>Visible sections</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {dashboardOrder.filter((key) => personalisePrefs.dashboardSections?.[key] !== false).map((key) => (
                      <span key={key} className="badge badge-blue">{DASHBOARD_SECTIONS.find(([sectionKey]) => sectionKey === key)?.[1] || key}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {showFeedback ? (
        <Modal
          title="Feedback & feature requests"
          onClose={() => setShowFeedback(false)}
          footer={<><button className="btn btn-outline" onClick={() => setShowFeedback(false)}>Cancel</button><button className="btn btn-primary" onClick={sendFeedback} disabled={feedbackSending}>{feedbackSending ? 'Sending...' : 'Send'}</button></>}
        >
          <div style={{ display:'grid', gap:14 }}>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {[['feature', 'Request a feature'], ['feedback', 'General feedback']].map(([key, label]) => (
                <button key={key} className={'pill' + (feedbackForm.type === key ? ' on' : '')} onClick={() => setFeedbackForm((current) => ({ ...current, type: key }))}>
                  {label}
                </button>
              ))}
            </div>
            <div>
              <label className="lbl">Title</label>
              <input className="inp" value={feedbackForm.title} onChange={(e) => setFeedbackForm((current) => ({ ...current, title: e.target.value }))} placeholder="Short summary of the request" />
            </div>
            <div>
              <label className="lbl">Details</label>
              <textarea className="inp" rows={6} value={feedbackForm.message} onChange={(e) => setFeedbackForm((current) => ({ ...current, message: e.target.value }))} style={{ resize:'vertical' }} placeholder="What would help? What feels slow, confusing, or missing?" />
            </div>
          </div>
        </Modal>
      ) : null}

      {showWhatsNew && whatsNew ? (
        <Modal
          title={whatsNew.title || 'What’s New'}
          onClose={dismissWhatsNew}
          width={860}
          footer={<><button className="btn btn-outline" onClick={dismissWhatsNew}>Close</button><button className="btn btn-primary" onClick={dismissWhatsNew}>Got it</button></>}
        >
          <div style={{ display:'grid', gap:18 }}>
            <div style={{ padding:'16px 18px', borderRadius:14, background:'var(--accent-soft)', border:'1px solid var(--accent-border)' }}>
              <div style={{ fontSize:12, color:'var(--sub)', marginBottom:6 }}>Version {whatsNew.version}</div>
              <div style={{ fontSize:14, color:'var(--text)', lineHeight:1.7 }}>
                {whatsNew.intro || 'Recent updates and improvements across the portal.'}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:14 }}>
              {(whatsNew.cards || []).map((card, index) => (
                <div key={`${card.title || 'card'}-${index}`} className="card card-pad">
                  {card.tag ? <span className="badge badge-blue" style={{ marginBottom:10 }}>{card.tag}</span> : null}
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginBottom:8 }}>{card.title || 'Update'}</div>
                  <div style={{ fontSize:13, color:'var(--sub)', lineHeight:1.65 }}>{card.body || 'No details added yet.'}</div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}

      {showSystemBanners ? <ActiveBanners /> : null}

      <div style={{ marginBottom: dashboardDensity === 'compact' ? 18 : 24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-end', flexWrap:'wrap', marginBottom:14 }}>
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)', marginBottom:8 }}>
              {dashboardHeader === 'minimal' ? 'Workspace overview' : dateStr}
            </div>
            <h1 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(30px,3.3vw,44px)', fontWeight:600, letterSpacing:'-0.04em', lineHeight:0.96, color:'var(--text)' }}>
              {dashboardHeader === 'minimal' ? `${firstName} dashboard` : `${greeting}, ${firstName}`}
            </h1>
            <p style={{ fontSize:14, color:'var(--sub)', marginTop:12, lineHeight:1.65, maxWidth:560 }}>
              A lighter overview of your workspace, priorities, and live portal activity.
            </p>
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
            <button className="btn btn-outline" onClick={() => setShowFeedback(true)}>
              <Bell size={14} />
              Feedback
            </button>
            <button className="btn btn-outline" onClick={() => setShowPersonalise(true)}>
              <SlidersHorizontal size={14} />
              Personalise
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/my-profile')}>Portal settings</button>
          </div>
        </div>

        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {dashboardFocusItems.map((item) => (
            <div key={item.label} style={{ display:'inline-flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:999, border:'1px solid var(--border)', background:'var(--card)' }}>
              <span className={`badge badge-${item.tone}`}>{item.label}</span>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{item.value}</span>
              <span style={{ fontSize:12, color:'var(--sub)' }}>{item.hint}</span>
            </div>
          ))}
        </div>
      </div>

      {quickActions.length ? (
        <div className="card card-pad" style={{ marginBottom: dashboardDensity === 'compact' ? 16 : 22, borderRadius: 18 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)' }}>Pinned actions</div>
              <div style={{ fontSize:13, color:'var(--sub)', marginTop:4 }}>Fast routes into the places you open most often.</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPersonalise(true)}>Edit</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10 }}>
            {quickActions.map((key) => {
              const item = quickActionMeta[key]
              if (!item) return null
              const Icon = quickActionIcons[key] || ArrowRight
              return (
                <QuickActionCard
                  key={key}
                  icon={Icon}
                  label={item.label}
                  hint={`Open ${item.label.toLowerCase()} quickly`}
                  onClick={() => navigate(item.route)}
                />
              )
            })}
          </div>
        </div>
      ) : null}

      {dashboardSections.stats !== false ? (
      <div className="card" style={{ overflow:'hidden', marginBottom: dashboardDensity === 'compact' ? 20 : 28, borderRadius: 18 }}>
        <div style={{ padding:'16px 18px 12px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)' }}>Snapshot</div>
            <div style={{ fontSize:13, color:'var(--sub)', marginTop:4 }}>Key operating numbers across outreach, clients, support, tasks, and alerts.</div>
          </div>
        </div>
        <div className="dashboard-stat-grid" style={{ display: 'grid', gridTemplateColumns: dashboardDensity === 'compact' ? 'repeat(auto-fit,minmax(160px,1fr))' : 'repeat(auto-fit,minmax(180px,1fr))', gap: 0 }}>
          <StatCard icon={PhoneCall} label="Total Outreach" value={stats.outreach} accent="var(--blue)" link="/outreach" loading={loading} hint="Lead volume across the outreach list" />
          <StatCard icon={Users} label="Active Clients" value={stats.clients} accent="var(--green)" link="/clients" loading={loading} hint="Currently onboarded and live" />
          <StatCard icon={HeadphonesIcon} label="Open Tickets" value={stats.tickets} accent="var(--red)" link="/support" loading={loading} hint="Support items still unresolved" />
          <StatCard icon={CheckSquare} label="Pending Tasks" value={stats.tasks} accent="var(--amber)" link={isAdmin ? '/tasks' : '/my-tasks'} loading={loading} hint="Tasks still needing attention" />
          <StatCard icon={TrendingUp} label="Commission Paid" value={`£${stats.revenue.toLocaleString()}`} accent="var(--accent)" loading={loading} hint="Paid commission recorded in the portal" />
          <StatCard icon={Bell} label="Unread Alerts" value={stats.unreadNotifications} accent="var(--blue)" loading={loading} hint="Unread internal notifications" />
          <StatCard icon={UserCheck} label="Active Now" value={stats.activeUsers} accent="var(--green)" link="/audit" loading={loading} hint="Staff seen in the last 5 minutes" />
        </div>
      </div>
      ) : null}

      {sectionPairs.map((pair, index) => (
        <div key={`section-row-${index}`} className="dashboard-panel-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: dashboardDensity === 'compact' ? 14 : 20, marginBottom: index < sectionPairs.length - 1 ? (dashboardDensity === 'compact' ? 14 : 20) : 0, marginTop: index === 0 ? 0 : 0 }}>
          {pair.map((key) => renderDashboardSection(key))}
          {pair.length === 1 ? <div /> : null}
        </div>
      ))}
    </div>
  )
}
