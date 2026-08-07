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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px', color: '#737373' }}>
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className="ds-content" style={{ background: '#F5F5F5', minHeight: 'calc(100vh - 120px)', padding: '32px' }}>
      <div style={{ maxWidth: '1200px' }}>
        {/* Date */}
        <div style={{ fontSize: '13px', color: '#737373', marginBottom: '4px', fontWeight: 400 }}>
          {dateStr}
        </div>

        {/* Greeting - EXACT RotaCloud style */}
        <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#0F172A', margin: 0, marginBottom: '4px', lineHeight: 1.2 }}>
          Hi, <span style={{ color: '#3B82F6' }}>{firstName.toLowerCase()}</span>
        </h1>
        <p style={{ fontSize: '18px', color: '#334155', margin: 0, marginBottom: '24px', fontWeight: 400 }}>
          Welcome to your new Dashboard!
        </p>

        {/* My Work Section */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <h2 style={{ 
              fontSize: '16px', 
              fontWeight: 600, 
              color: '#0F172A',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              My work today <span style={{ fontSize: '14px' }}>→</span>
            </h2>
          </div>
          
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px'
          }}>
            {/* Tasks card */}
            <div 
              onClick={() => navigate('/my-tasks')}
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'border-color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3B82F6'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E2E8F0'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '16px' }}>📋</span>
                <div style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>Tasks</div>
              </div>
              <div style={{ fontSize: '36px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                {stats.tasks}
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                /{stats.tasks}
              </div>
            </div>

            {/* Notifications card */}
            <div 
              onClick={() => navigate('/notifications')}
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'border-color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3B82F6'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E2E8F0'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '16px' }}>🔔</span>
                <div style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>Notifications</div>
              </div>
              <div style={{ fontSize: '36px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                {stats.notifications}
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                /{stats.notifications}
              </div>
            </div>

            {/* Schedule card */}
            <div 
              onClick={() => navigate('/schedule')}
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'border-color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3B82F6'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E2E8F0'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '16px' }}>📅</span>
                <div style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>Schedule</div>
              </div>
              <div style={{ fontSize: '36px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                0
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                /0
              </div>
            </div>

            {/* Department card */}
            <div 
              onClick={() => navigate('/my-department')}
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'border-color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3B82F6'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E2E8F0'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '16px' }}>👥</span>
                <div style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>Department</div>
              </div>
              <div style={{ fontSize: '36px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                0
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                /0
              </div>
            </div>
          </div>
        </div>

        {/* Clients & Support Section */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <h2 style={{ 
              fontSize: '16px', 
              fontWeight: 600, 
              color: '#0F172A',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              Clients & support <span style={{ fontSize: '14px' }}>→</span>
            </h2>
          </div>
          
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px'
          }}>
            {/* Active clients */}
            <div 
              onClick={() => navigate('/clients')}
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'border-color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3B82F6'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E2E8F0'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '16px' }}>💼</span>
                <div style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>Active</div>
              </div>
              <div style={{ fontSize: '36px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                {stats.clients}
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                /{stats.clients}
              </div>
            </div>

            {/* Support tickets */}
            <div 
              onClick={() => navigate('/support')}
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'border-color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3B82F6'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E2E8F0'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '16px' }}>🎫</span>
                <div style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>Open tickets</div>
              </div>
              <div style={{ fontSize: '36px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                {stats.tickets}
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                /{stats.tickets}
              </div>
            </div>

            {/* Pipeline */}
            <div 
              onClick={() => navigate('/client-pipeline')}
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'border-color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3B82F6'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E2E8F0'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '16px' }}>📊</span>
                <div style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>Pipeline</div>
              </div>
              <div style={{ fontSize: '36px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                0
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                /0
              </div>
            </div>

            {/* Outreach */}
            <div 
              onClick={() => navigate('/outreach')}
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'border-color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3B82F6'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E2E8F0'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '16px' }}>📧</span>
                <div style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>Outreach</div>
              </div>
              <div style={{ fontSize: '36px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                0
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                /0
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
