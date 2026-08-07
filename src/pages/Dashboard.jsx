import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'

const icons = {
  tasks: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  notifications: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  schedule: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  department: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  clients: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  tickets: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  pipeline: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  outreach: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
}

function StatCard({ icon, label, value, denominator, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '6px',
        padding: '16px',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3B82F6' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        {icon}
        <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748B' }}>{label}</span>
      </div>
      <div style={{ fontSize: '32px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: '13px', fontWeight: 400, color: '#94A3B8', marginTop: '2px' }}>
        {denominator}
      </div>
    </div>
  )
}

function Section({ title, onTitleClick, children }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h2
          onClick={onTitleClick}
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: '#0F172A',
            margin: 0,
            cursor: onTitleClick ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {title}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </h2>
      </div>
      <div style={{
        background: '#F9FAFB',
        border: '1px solid #E2E8F0',
        borderRadius: '8px',
        padding: '20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px',
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
    departmentSize: 0,
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
        departmentRes,
        appointmentsRes,
      ] = await Promise.all([
        supabase.from('tasks').select('id', { count: 'exact', head: true }).ilike('assigned_to_email', user.email).neq('status', 'done'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).ilike('assigned_to_email', user.email),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_email', user.email).eq('read', false),
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
        departmentSize: departmentRes.count || 0,
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px', color: '#64748B', fontSize: '14px' }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ background: '#F7F7F7', minHeight: 'calc(100vh - 105px)', margin: 'calc(var(--space-lg) * -1)', padding: '32px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Greeting */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 400, color: '#64748B', marginBottom: '4px' }}>
            {dateStr}
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 400, color: '#0F172A', margin: 0, lineHeight: 1.3 }}>
            Hi, <span style={{ fontWeight: 700, color: '#3B82F6' }}>{firstName.toLowerCase()}</span>
          </h1>
          <p style={{ fontSize: '16px', fontWeight: 400, color: '#64748B', margin: '4px 0 0 0' }}>
            Welcome to your Dashboard!
          </p>
        </div>

        {/* My work today */}
        <Section title="My work today" onTitleClick={() => navigate('/my-tasks')}>
          <StatCard
            icon={icons.tasks}
            label="Tasks"
            value={stats.tasksOpen}
            denominator={`/ ${stats.tasksTotal} total`}
            onClick={() => navigate('/my-tasks')}
          />
          <StatCard
            icon={icons.notifications}
            label="Notifications"
            value={stats.notifications}
            denominator="unread"
            onClick={() => navigate('/notifications')}
          />
          <StatCard
            icon={icons.schedule}
            label="Appointments"
            value={stats.appointmentsToday}
            denominator="today"
            onClick={() => navigate('/schedule')}
          />
          <StatCard
            icon={icons.department}
            label="Team"
            value={stats.departmentSize}
            denominator="people"
            onClick={() => navigate('/people')}
          />
        </Section>

        {/* Clients & support */}
        <Section title="Clients & support" onTitleClick={() => navigate('/clients')}>
          <StatCard
            icon={icons.clients}
            label="Active clients"
            value={stats.clientsActive}
            denominator={`/ ${stats.clientsTotal} total`}
            onClick={() => navigate('/clients')}
          />
          <StatCard
            icon={icons.tickets}
            label="Open tickets"
            value={stats.ticketsOpen}
            denominator={`/ ${stats.ticketsTotal} total`}
            onClick={() => navigate('/support')}
          />
          <StatCard
            icon={icons.pipeline}
            label="Pipeline"
            value={stats.pipeline}
            denominator="pending"
            onClick={() => navigate('/client-pipeline')}
          />
          <StatCard
            icon={icons.outreach}
            label="Outreach"
            value={stats.outreach}
            denominator="leads"
            onClick={() => navigate('/outreach')}
          />
        </Section>
      </div>
    </div>
  )
}
