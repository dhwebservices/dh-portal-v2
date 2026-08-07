import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    tasks: 0,
    clients: 0,
    tickets: 0,
    notifications: 0
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

      const [tasksRes, clientsRes, ticketsRes, notificationsRes] = await Promise.all([
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assigned_to_email', user.email).neq('status', 'done'),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_email', user.email).eq('read', false)
      ])

      setStats({
        tasks: tasksRes.count || 0,
        clients: clientsRes.count || 0,
        tickets: ticketsRes.count || 0,
        notifications: notificationsRes.count || 0
      })

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
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className="ds-content">
      {/* Simple greeting - RotaCloud style */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '13px', color: '#737373', marginBottom: '4px' }}>
          {dateStr}
        </div>
        <h1 style={{
          fontSize: '36px',
          fontWeight: 600,
          color: '#171717',
          marginBottom: '8px',
          lineHeight: 1.2
        }}>
          Hi, {firstName.toLowerCase()}
        </h1>
        <p style={{ fontSize: '15px', color: '#737373' }}>
          Welcome to your Dashboard!
        </p>
      </div>

      {/* Quick stats - RotaCloud clean cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div onClick={() => navigate('/my-tasks')} style={{
          padding: '24px',
          background: 'white',
          border: '1px solid #E5E5E5',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'border-color 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#0066CC'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E5E5E5'}
        >
          <div style={{ fontSize: '13px', color: '#737373', marginBottom: '8px' }}>
            Tasks
          </div>
          <div style={{ fontSize: '42px', fontWeight: 600, color: '#171717', lineHeight: 1 }}>
            {stats.tasks}
          </div>
          <div style={{ fontSize: '12px', color: '#A3A3A3', marginTop: '4px' }}>
            open
          </div>
        </div>

        <div onClick={() => navigate('/clients')} style={{
          padding: '24px',
          background: 'white',
          border: '1px solid #E5E5E5',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'border-color 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#0066CC'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E5E5E5'}
        >
          <div style={{ fontSize: '13px', color: '#737373', marginBottom: '8px' }}>
            Clients
          </div>
          <div style={{ fontSize: '42px', fontWeight: 600, color: '#171717', lineHeight: 1 }}>
            {stats.clients}
          </div>
          <div style={{ fontSize: '12px', color: '#A3A3A3', marginTop: '4px' }}>
            active
          </div>
        </div>

        <div onClick={() => navigate('/support')} style={{
          padding: '24px',
          background: 'white',
          border: '1px solid #E5E5E5',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'border-color 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#0066CC'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E5E5E5'}
        >
          <div style={{ fontSize: '13px', color: '#737373', marginBottom: '8px' }}>
            Support
          </div>
          <div style={{ fontSize: '42px', fontWeight: 600, color: '#171717', lineHeight: 1 }}>
            {stats.tickets}
          </div>
          <div style={{ fontSize: '12px', color: '#A3A3A3', marginTop: '4px' }}>
            open tickets
          </div>
        </div>

        <div onClick={() => navigate('/notifications')} style={{
          padding: '24px',
          background: 'white',
          border: '1px solid #E5E5E5',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'border-color 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#0066CC'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E5E5E5'}
        >
          <div style={{ fontSize: '13px', color: '#737373', marginBottom: '8px' }}>
            Notifications
          </div>
          <div style={{ fontSize: '42px', fontWeight: 600, color: '#171717', lineHeight: 1 }}>
            {stats.notifications}
          </div>
          <div style={{ fontSize: '12px', color: '#A3A3A3', marginTop: '4px' }}>
            unread
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#171717', marginBottom: '16px' }}>
          Quick actions
        </h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { label: 'View Tasks', path: '/my-tasks' },
            { label: 'View Clients', path: '/clients' },
            { label: 'Support Tickets', path: '/support' },
            { label: 'My Schedule', path: '/schedule' },
            { label: 'Send Email', path: '/send-email' },
            { label: 'People Directory', path: '/people' }
          ].map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              style={{
                padding: '10px 18px',
                background: 'white',
                border: '1px solid #E5E5E5',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#171717',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#0066CC'
                e.currentTarget.style.color = '#0066CC'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E5E5E5'
                e.currentTarget.style.color = '#171717'
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
