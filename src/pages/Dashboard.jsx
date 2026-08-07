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
      <div style={{ maxWidth: '1200px' }}>
        {/* Greeting - exactly like RotaCloud */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 600, color: '#171717', marginBottom: '8px' }}>
            Hi, <span style={{ color: '#0066CC' }}>{firstName.toLowerCase()}</span>
          </h1>
          <p style={{ fontSize: '16px', color: '#525252', fontWeight: 400 }}>
            Welcome to your new Dashboard!
          </p>
        </div>

        {/* Stats sections - RotaCloud style */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px', marginBottom: '32px' }}>
          {/* Tasks Section */}
          <div style={{
            background: '#F9FAFB',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            padding: '24px'
          }}>
            <div style={{ 
              fontSize: '16px', 
              fontWeight: 600, 
              color: '#171717',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>→</span> Tasks
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div 
                onClick={() => navigate('/my-tasks')}
                style={{
                  background: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#0066CC'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E5E7EB'}
              >
                <div style={{ fontSize: '48px', fontWeight: 700, color: '#171717', lineHeight: 1, marginBottom: '8px' }}>
                  {stats.tasks}
                </div>
                <div style={{ fontSize: '13px', color: '#737373' }}>
                  Open
                </div>
              </div>
              <div style={{
                background: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '6px',
                padding: '20px'
              }}>
                <div style={{ fontSize: '48px', fontWeight: 700, color: '#171717', lineHeight: 1, marginBottom: '8px' }}>
                  0
                </div>
                <div style={{ fontSize: '13px', color: '#737373' }}>
                  Overdue
                </div>
              </div>
            </div>
          </div>

          {/* Clients Section */}
          <div style={{
            background: '#F9FAFB',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            padding: '24px'
          }}>
            <div style={{ 
              fontSize: '16px', 
              fontWeight: 600, 
              color: '#171717',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>→</span> Clients
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div
                onClick={() => navigate('/clients')}
                style={{
                  background: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#0066CC'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E5E7EB'}
              >
                <div style={{ fontSize: '48px', fontWeight: 700, color: '#171717', lineHeight: 1, marginBottom: '8px' }}>
                  {stats.clients}
                </div>
                <div style={{ fontSize: '13px', color: '#737373' }}>
                  Active
                </div>
              </div>
              <div
                onClick={() => navigate('/support')}
                style={{
                  background: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#0066CC'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E5E7EB'}
              >
                <div style={{ fontSize: '48px', fontWeight: 700, color: '#171717', lineHeight: 1, marginBottom: '8px' }}>
                  {stats.tickets}
                </div>
                <div style={{ fontSize: '13px', color: '#737373' }}>
                  Support tickets
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick links section */}
        <div style={{
          background: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          padding: '24px'
        }}>
          <div style={{ 
            fontSize: '16px', 
            fontWeight: 600, 
            color: '#171717',
            marginBottom: '16px'
          }}>
            Quick actions
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {[
              { label: 'View all tasks', path: '/my-tasks' },
              { label: 'View all clients', path: '/clients' },
              { label: 'View support tickets', path: '/support' },
              { label: 'People directory', path: '/people' }
            ].map(action => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                style={{
                  background: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#171717',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#0066CC'
                  e.currentTarget.style.background = '#F0F9FF'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#E5E7EB'
                  e.currentTarget.style.background = 'white'
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
