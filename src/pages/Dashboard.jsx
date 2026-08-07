import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Button, StatusBadge } from '../components/ds'

export default function Dashboard() {
  const { user, workspace, workspaceLabel } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    tasks: 0,
    clients: 0,
    tickets: 0,
    notifications: 0
  })
  const [loading, setLoading] = useState(true)
  const [recentActivity, setRecentActivity] = useState([])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = user?.name?.split(' ')[0] || 'there'

  useEffect(() => {
    loadDashboardData()
  }, [user?.email])

  async function loadDashboardData() {
    if (!user?.email) return

    try {
      setLoading(true)

      // Load real data from database
      const [tasksRes, clientsRes, ticketsRes, notificationsRes] = await Promise.all([
        supabase.from('tasks').select('id').eq('assigned_to', user.email).eq('status', 'open'),
        supabase.from('clients').select('id'),
        supabase.from('support_tickets').select('id').eq('status', 'open'),
        supabase.from('notifications').select('id').eq('recipient_email', user.email).eq('read', false)
      ])

      setStats({
        tasks: tasksRes.data?.length || 0,
        clients: clientsRes.data?.length || 0,
        tickets: ticketsRes.data?.length || 0,
        notifications: notificationsRes.data?.length || 0
      })

      // Load recent activity
      const { data: activity } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      setRecentActivity(activity || [])

    } catch (error) {
      console.error('Failed to load dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="ds-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
          Loading dashboard...
        </div>
      </div>
    )
  }

  return (
    <div className="ds-content">
      {/* Greeting */}
      <div style={{ marginBottom: 'var(--space-2xl)' }}>
        <h1 style={{
          fontSize: '32px',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginBottom: '4px'
        }}>
          {greeting}, {firstName}
        </h1>
        <p style={{
          fontSize: '15px',
          color: 'var(--color-text-secondary)'
        }}>
          {workspaceLabel || 'Dashboard'} · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Quick Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-2xl)'
      }}>
        <div
          onClick={() => navigate('/my-tasks')}
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--border-radius-lg)',
            padding: 'var(--space-lg)',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-primary)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
            MY TASKS
          </div>
          <div style={{ fontSize: '32px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
            {stats.tasks}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            open tasks
          </div>
        </div>

        <div
          onClick={() => navigate('/clients')}
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--border-radius-lg)',
            padding: 'var(--space-lg)',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-primary)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
            CLIENTS
          </div>
          <div style={{ fontSize: '32px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
            {stats.clients}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            total clients
          </div>
        </div>

        <div
          onClick={() => navigate('/support')}
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--border-radius-lg)',
            padding: 'var(--space-lg)',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-primary)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
            SUPPORT
          </div>
          <div style={{ fontSize: '32px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
            {stats.tickets}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            open tickets
          </div>
        </div>

        <div
          onClick={() => navigate('/notifications')}
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--border-radius-lg)',
            padding: 'var(--space-lg)',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-primary)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
            NOTIFICATIONS
          </div>
          <div style={{ fontSize: '32px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
            {stats.notifications}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            unread
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg)',
        padding: 'var(--space-xl)',
        marginBottom: 'var(--space-xl)'
      }}>
        <h2 style={{
          fontSize: 'var(--font-size-h2)',
          fontWeight: 'var(--font-weight-semibold)',
          marginBottom: 'var(--space-lg)'
        }}>
          Quick Actions
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 'var(--space-md)'
        }}>
          <Button variant="secondary" onClick={() => navigate('/my-tasks')}>
            📋 View My Tasks
          </Button>
          <Button variant="secondary" onClick={() => navigate('/clients')}>
            👥 View Clients
          </Button>
          <Button variant="secondary" onClick={() => navigate('/support')}>
            💬 Support Tickets
          </Button>
          <Button variant="secondary" onClick={() => navigate('/schedule')}>
            📅 My Schedule
          </Button>
          <Button variant="secondary" onClick={() => navigate('/send-email')}>
            ✉️ Send Email
          </Button>
          <Button variant="secondary" onClick={() => navigate('/people')}>
            👤 People Directory
          </Button>
        </div>
      </div>

      {/* Recent Activity */}
      <div style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg)',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: 'var(--space-lg)',
          borderBottom: '1px solid var(--color-border)'
        }}>
          <h2 style={{
            fontSize: 'var(--font-size-h2)',
            fontWeight: 'var(--font-weight-semibold)'
          }}>
            Recent Activity
          </h2>
        </div>
        <div style={{ padding: 'var(--space-lg)' }}>
          {recentActivity.length === 0 ? (
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', textAlign: 'center', padding: 'var(--space-xl)' }}>
              No recent activity
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {recentActivity.slice(0, 5).map((item, index) => (
                <div
                  key={index}
                  style={{
                    padding: 'var(--space-md)',
                    background: 'var(--color-gray-50)',
                    borderRadius: 'var(--border-radius-md)',
                    border: '1px solid var(--color-border)'
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
                    {item.action || 'Activity'}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    {item.user_name || 'User'} · {new Date(item.created_at).toLocaleString('en-GB')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
