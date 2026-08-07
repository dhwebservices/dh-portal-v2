import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'

const iconStroke = '#1E293B'

const icons = {
  tasks: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  notifications: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  schedule: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  team: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  clients: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  tickets: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  pipeline: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  outreach: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
}

function StatTile({ icon, label, value, suffix, onClick, valueColor }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#FAFAFA',
        border: '1px solid #EEEEEE',
        borderRadius: '8px',
        padding: '20px 24px',
        cursor: 'pointer',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#FAFAFA' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        {icon}
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#1E293B' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: '52px', fontWeight: 800, color: valueColor || '#0F172A', lineHeight: 1 }}>
          {value}
        </span>
        {suffix != null && (
          <span style={{ fontSize: '16px', fontWeight: 500, color: '#94A3B8' }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function SectionPanel({ title, onTitleClick, children }) {
  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #ECECEC',
      borderRadius: '12px',
      padding: '28px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      <div
        onClick={onTitleClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '24px',
          cursor: onTitleClick ? 'pointer' : 'default',
        }}
      >
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
          {title}
        </h2>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '16px',
      }}>
        {children}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    tasksOpen: 0,
    tasksTotal: 0,
    notifications: 0,
    clientsActive: 0,
    clientsTotal: 0,
    ticketsOpen: 0,
    ticketsTotal: 0,
    pipeline: 0,
    outreach: 0,
    teamSize: 0,
    appointmentsToday: 0,
  })
  const [loading, setLoading] = useState(true)

  const firstName = user?.name?.split(' ')[0] || 'there'
  const dateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  useEffect(() => {
    loadDashboardData()
  }, [user?.email])

  async function loadDashboardData() {
    if (!user?.email) return

    try {
      setLoading(true)

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const [
        tasksOpenRes,
        tasksTotalRes,
        notificationsRes,
        clientsActiveRes,
        clientsTotalRes,
        ticketsOpenRes,
        ticketsTotalRes,
        pipelineRes,
        outreachRes,
        teamRes,
        appointmentsRes,
      ] = await Promise.all([
        supabase.from('tasks').select('id', { count: 'exact', head: true }).ilike('assigned_to_email', user.email).neq('status', 'done'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).ilike('assigned_to_email', user.email),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).ilike('user_email', user.email).eq('read', false),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('outreach_leads').select('id', { count: 'exact', head: true }),
        supabase.from('hr_profiles').select('user_email', { count: 'exact', head: true }),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).gte('start_time', todayStart.toISOString()).lte('start_time', todayEnd.toISOString()),
      ])

      setStats({
        tasksOpen: tasksOpenRes.count || 0,
        tasksTotal: tasksTotalRes.count || 0,
        notifications: notificationsRes.count || 0,
        clientsActive: clientsActiveRes.count || 0,
        clientsTotal: clientsTotalRes.count || 0,
        ticketsOpen: ticketsOpenRes.count || 0,
        ticketsTotal: ticketsTotalRes.count || 0,
        pipeline: pipelineRes.count || 0,
        outreach: outreachRes.count || 0,
        teamSize: teamRes.count || 0,
        appointmentsToday: appointmentsRes.count || 0,
      })
    } catch (error) {
      console.error('Failed to load dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px', color: '#64748B', fontSize: '15px' }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ background: '#FFFFFF', minHeight: 'calc(100vh - 56px)', margin: 'calc(var(--space-lg) * -1)', padding: '32px 40px' }}>
      {/* Greeting */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontSize: '15px', fontWeight: 400, color: '#334155', marginBottom: '6px' }}>
          {dateStr}
        </div>
        <h1 style={{ fontSize: '42px', fontWeight: 800, color: '#0F172A', margin: 0, lineHeight: 1.15 }}>
          Hi, <span style={{ color: '#2563EB' }}>{firstName.toLowerCase()}</span>
        </h1>
        <p style={{ fontSize: '20px', fontWeight: 600, color: '#1E293B', margin: '8px 0 0 0' }}>
          Welcome to your Dashboard!
        </p>
      </div>

      {/* Two panels side by side */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
        gap: '24px',
        alignItems: 'start',
      }}>
        <SectionPanel title="My work today" onTitleClick={() => navigate('/my-tasks')}>
          <StatTile
            icon={icons.tasks}
            label="Tasks"
            value={stats.tasksOpen}
            suffix={`/ ${stats.tasksTotal}`}
            onClick={() => navigate('/my-tasks')}
          />
          <StatTile
            icon={icons.notifications}
            label="Notifications"
            value={stats.notifications}
            valueColor={stats.notifications > 0 ? '#DC2626' : undefined}
            onClick={() => navigate('/notifications')}
          />
          <StatTile
            icon={icons.schedule}
            label="Appointments"
            value={stats.appointmentsToday}
            onClick={() => navigate('/schedule')}
          />
          <StatTile
            icon={icons.team}
            label="Team"
            value={stats.teamSize}
            onClick={() => navigate('/people')}
          />
        </SectionPanel>

        <SectionPanel title="Clients &amp; support" onTitleClick={() => navigate('/clients')}>
          <StatTile
            icon={icons.clients}
            label="Active clients"
            value={stats.clientsActive}
            suffix={`/ ${stats.clientsTotal}`}
            onClick={() => navigate('/clients')}
          />
          <StatTile
            icon={icons.tickets}
            label="Open tickets"
            value={stats.ticketsOpen}
            suffix={`/ ${stats.ticketsTotal}`}
            valueColor={stats.ticketsOpen > 0 ? '#DC2626' : undefined}
            onClick={() => navigate('/support')}
          />
          <StatTile
            icon={icons.pipeline}
            label="Pipeline"
            value={stats.pipeline}
            onClick={() => navigate('/client-pipeline')}
          />
          <StatTile
            icon={icons.outreach}
            label="Outreach"
            value={stats.outreach}
            onClick={() => navigate('/outreach')}
          />
        </SectionPanel>
      </div>
    </div>
  )
}
