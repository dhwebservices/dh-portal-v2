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

function StatCard({ icon: Icon, label, value, accent, link, loading, hint }) {
  const nav = useNavigate()
  return (
    <div
      onClick={() => link && nav(link)}
      className="stat-card"
      style={{ cursor: link ? 'pointer' : 'default', minHeight: 148, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Icon size={18} color={accent} />
      </div>
      {loading ? (
        <div className="skeleton" style={{ height: 36, width: 72, marginBottom: 8, borderRadius: 4 }} />
      ) : (
        <div className="stat-val">{value}</div>
      )}
      <div>
        <div className="stat-lbl">{label}</div>
        {hint ? <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 6, lineHeight: 1.5 }}>{hint}</div> : null}
      </div>
    </div>
  )
}

function Panel({ title, actionLabel, onAction, children, tone }) {
  return (
    <div className="card" style={{ overflow: 'hidden', borderColor: tone || 'var(--border)' }}>
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
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
  const [activeUsers, setActiveUsers] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [insight, setInsight] = useState('')
  const [insightLoading, setInsightLoading] = useState(false)
  const [whatsNew, setWhatsNew] = useState(null)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [showPersonalise, setShowPersonalise] = useState(false)
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

  useEffect(() => {
    setPersonalisePrefs(mergePortalPreferences(preferences))
  }, [preferences])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const activeCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()

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
          ? supabase.from('hr_leave').select('id,user_name,leave_type,start_date,end_date,status').eq('status', 'pending').order('created_at', { ascending: false }).limit(6)
          : Promise.resolve({ data: [] }),
        isAdmin
          ? supabase.from('onboarding_submissions').select('user_email,user_name,status,submitted_at').eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(6)
          : Promise.resolve({ data: [] }),
        supabase.from('appointments').select('id,client_name,staff_name,date,start_time,status').gte('date', todayIso).lte('date', sevenDaysOut).neq('status', 'cancelled').order('date', { ascending: true }).limit(8),
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

  const visibleOrderedSections = dashboardOrder.filter((key) => dashboardSections[key] !== false)
  const nonStatsSections = visibleOrderedSections.filter((key) => key !== 'stats')
  const sectionPairs = []
  for (let i = 0; i < nonStatsSections.length; i += 2) {
    sectionPairs.push(nonStatsSections.slice(i, i + 2))
  }

  const quickActionMeta = Object.fromEntries(QUICK_ACTION_OPTIONS.map(([key, label, route]) => [key, { label, route }]))

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

      <div style={{ marginBottom: dashboardDensity === 'compact' ? 20 : 28, display:'flex', justifyContent:'space-between', alignItems: dashboardHeader === 'minimal' ? 'center' : 'flex-end', gap:16, flexWrap:'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: dashboardHeader === 'minimal' ? 'clamp(24px,2.3vw,34px)' : 'clamp(26px,3vw,42px)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 }}>
            {dashboardHeader === 'minimal' ? `${firstName} dashboard` : <>{greeting}, <em style={{ color: 'var(--sub)', fontStyle: 'italic' }}>{firstName}</em></>}
          </h1>
          {dashboardHeader === 'minimal' ? (
            <p style={{ fontSize: 13, color: 'var(--sub)', marginTop: 8 }}>Live overview of your workspace, activity, and priorities.</p>
          ) : (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', marginTop: 8 }}>{dateStr}</p>
          )}
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <button className="btn btn-outline" onClick={() => setShowPersonalise(true)}>
            <SlidersHorizontal size={14} />
            Personalise dashboard
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/my-profile')}>Portal settings</button>
        </div>
      </div>

      {quickActions.length ? (
        <div className="card card-pad" style={{ marginBottom: dashboardDensity === 'compact' ? 16 : 22 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)' }}>Pinned actions</div>
              <div style={{ fontSize:13, color:'var(--sub)', marginTop:4 }}>Your most-used shortcuts, right where you need them.</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPersonalise(true)}>Edit</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
            {quickActions.map((key) => {
              const item = quickActionMeta[key]
              if (!item) return null
              return (
                <button
                  key={key}
                  className="btn btn-outline"
                  onClick={() => navigate(item.route)}
                  style={{ justifyContent:'space-between', padding:'12px 14px', borderRadius:12 }}
                >
                  <span>{item.label}</span>
                  <ArrowRight size={13} />
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {dashboardSections.stats !== false ? (
      <div className="dashboard-stat-grid" style={{ display: 'grid', gridTemplateColumns: dashboardDensity === 'compact' ? 'repeat(auto-fit,minmax(160px,1fr))' : 'repeat(auto-fit,minmax(180px,1fr))', gap: dashboardDensity === 'compact' ? 12 : 16, marginBottom: dashboardDensity === 'compact' ? 20 : 28 }}>
        <StatCard icon={PhoneCall} label="Total Outreach" value={stats.outreach} accent="var(--blue)" link="/outreach" loading={loading} hint="Lead volume across the outreach list" />
        <StatCard icon={Users} label="Active Clients" value={stats.clients} accent="var(--green)" link="/clients" loading={loading} hint="Currently onboarded and live" />
        <StatCard icon={HeadphonesIcon} label="Open Tickets" value={stats.tickets} accent="var(--red)" link="/support" loading={loading} hint="Support items still unresolved" />
        <StatCard icon={CheckSquare} label="Pending Tasks" value={stats.tasks} accent="var(--amber)" link={isAdmin ? '/tasks' : '/my-tasks'} loading={loading} hint="Tasks still needing attention" />
        <StatCard icon={TrendingUp} label="Commission Paid" value={`£${stats.revenue.toLocaleString()}`} accent="var(--accent)" loading={loading} hint="Paid commission recorded in the portal" />
        <StatCard icon={Bell} label="Unread Alerts" value={stats.unreadNotifications} accent="var(--blue)" loading={loading} hint="Unread internal notifications" />
        <StatCard icon={UserCheck} label="Active Now" value={stats.activeUsers} accent="var(--green)" link="/audit" loading={loading} hint="Staff seen in the last 5 minutes" />
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
