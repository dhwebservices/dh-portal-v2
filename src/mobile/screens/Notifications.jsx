import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'

export default function MobileNotifications({ goBack, user, navigate }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, unread, read

  useEffect(() => {
    loadNotifications()
  }, [user?.email])

  const loadNotifications = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_email', user.email)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setNotifications(data || [])
    } catch (error) {
      console.error('Failed to load notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkAsRead = async (notificationId) => {
    await Haptics.impact({ style: ImpactStyle.Light })

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)

      if (error) throw error

      setNotifications(notifications.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      ))
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    await Haptics.impact({ style: ImpactStyle.Medium })

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_email', user.email)
        .eq('read', false)

      if (error) throw error

      setNotifications(notifications.map(n => ({ ...n, read: true })))
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const handleClearAll = async () => {
    await Haptics.impact({ style: ImpactStyle.Medium })

    if (!confirm('Clear all notifications? This cannot be undone.')) return

    try {
      const { error} = await supabase
        .from('notifications')
        .delete()
        .eq('user_email', user.email)

      if (error) throw error

      setNotifications([])
      await Haptics.impact({ style: ImpactStyle.Heavy })
    } catch (error) {
      console.error('Failed to clear notifications:', error)
      alert('Failed to clear notifications')
    }
  }

  const handleNotificationTap = async (notification) => {
    await Haptics.impact({ style: ImpactStyle.Medium })

    // Mark as read
    if (!notification.read) {
      await handleMarkAsRead(notification.id)
    }

    // Navigate to linked screen
    if (notification.link) {
      const route = notification.link.replace('/', '')
      if (route) {
        navigate(route)
      }
    }
  }

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'success': return { name: 'check', color: '#34c759' }
      case 'warning': return { name: 'alertTriangle', color: '#ff9500' }
      case 'error': return { name: 'x', color: '#ff3b30' }
      case 'info': return { name: 'info', color: '#0066cc' }
      default: return { name: 'bell', color: '#86868b' }
    }
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.read
    if (filter === 'read') return n.read
    return true
  })

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="mobile-screen">
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          <Icon name="chevronLeft" size={24} color="#0066cc" />
        </button>
        <h1>Notifications</h1>
        <div style={{ width: 60 }} />
      </div>

      {/* Filter Chips */}
      <div style={{ padding: '16px 20px', background: '#f5f5f7', borderBottom: '1px solid #e0e0e0' }}>
        <div className="filter-chips">
          <button
            className={`filter-chip ${filter === 'all' ? 'active' : ''}`}
            onClick={async () => {
              await Haptics.impact({ style: ImpactStyle.Light })
              setFilter('all')
            }}
          >
            All ({notifications.length})
          </button>
          <button
            className={`filter-chip ${filter === 'unread' ? 'active' : ''}`}
            onClick={async () => {
              await Haptics.impact({ style: ImpactStyle.Light })
              setFilter('unread')
            }}
          >
            Unread ({unreadCount})
          </button>
          <button
            className={`filter-chip ${filter === 'read' ? 'active' : ''}`}
            onClick={async () => {
              await Haptics.impact({ style: ImpactStyle.Light })
              setFilter('read')
            }}
          >
            Read ({notifications.length - unreadCount})
          </button>
        </div>
      </div>

      {/* Actions */}
      {notifications.length > 0 && (
        <div style={{ padding: '12px 20px', background: 'white', borderBottom: '1px solid #e0e0e0' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            {unreadCount > 0 && (
              <button className="action-button" onClick={handleMarkAllAsRead}>
                <Icon name="checkCircle" size={16} color="#0066cc" />
                Mark all read
              </button>
            )}
            <button className="action-button danger" onClick={handleClearAll}>
              <Icon name="trash" size={16} color="#ff3b30" />
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* Notification List */}
      <div style={{ padding: '20px', paddingBottom: '100px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="spinner" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Icon name="bell" size={48} color="#d2d2d7" />
            <p style={{ marginTop: 16, fontSize: 15, color: '#86868b' }}>
              {filter === 'unread' ? 'No unread notifications' : filter === 'read' ? 'No read notifications' : 'No notifications'}
            </p>
          </div>
        ) : (
          <div className="notification-list">
            {filteredNotifications.map(notification => {
              const icon = getNotificationIcon(notification.type)
              return (
                <MobileCard
                  key={notification.id}
                  onPress={() => handleNotificationTap(notification)}
                  style={{ opacity: notification.read ? 0.6 : 1 }}
                >
                  <div className="notification-item">
                    <div className="notification-icon" style={{ background: `${icon.color}20` }}>
                      <Icon name={icon.name} size={20} color={icon.color} />
                    </div>
                    <div className="notification-content">
                      <div className="notification-header">
                        <div className="notification-title">{notification.title}</div>
                        {!notification.read && <div className="unread-badge" />}
                      </div>
                      <div className="notification-message">{notification.message}</div>
                      <div className="notification-time">{formatTime(notification.created_at)}</div>
                    </div>
                  </div>
                </MobileCard>
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        .filter-chips {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .filter-chip {
          padding: 8px 16px;
          background: white;
          border: 1px solid #d2d2d7;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
          color: #1a1a1a;
          white-space: nowrap;
          cursor: pointer;
        }

        .filter-chip.active {
          background: #0066cc;
          color: white;
          border-color: #0066cc;
        }

        .action-button {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px;
          background: white;
          border: 1px solid #0066cc;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #0066cc;
          cursor: pointer;
        }

        .action-button.danger {
          border-color: #ff3b30;
          color: #ff3b30;
        }

        .action-button:active {
          opacity: 0.7;
        }

        .notification-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .notification-item {
          display: flex;
          gap: 12px;
          padding: 4px;
        }

        .notification-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .notification-content {
          flex: 1;
          min-width: 0;
        }

        .notification-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .notification-title {
          font-size: 15px;
          font-weight: 600;
          color: #1a1a1a;
          flex: 1;
        }

        .unread-badge {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #0066cc;
          flex-shrink: 0;
        }

        .notification-message {
          font-size: 14px;
          color: #6b6158;
          line-height: 1.4;
          margin-bottom: 4px;
        }

        .notification-time {
          font-size: 12px;
          color: #86868b;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #d2d2d7;
          border-top-color: #0066cc;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
