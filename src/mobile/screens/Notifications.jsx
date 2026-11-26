import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import Icon from '../components/Icon'
import { Screen, Sec, Pills, Pill, Btn, Btns, Empty, Loading } from '../components/UI'

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
      case 'info': return { name: 'info', color: 'var(--mobile-accent)' }
      default: return { name: 'bell', color: 'var(--mobile-text-secondary)' }
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

  const isToday = (t) => new Date(t).toDateString() === new Date().toDateString()
  const today = filteredNotifications.filter(n => isToday(n.created_at))
  const earlier = filteredNotifications.filter(n => !isToday(n.created_at))
  const list = (items) => (
    <div className="dh-card">
      {items.map(notification => {
        const icon = getNotificationIcon(notification.type)
        return (
          <button key={notification.id} type="button" className="dh-row top" onClick={() => handleNotificationTap(notification)}>
            <span className={`dh-ic${notification.read ? ' muted' : ''}`}><Icon name={icon.name} size={18} /></span>
            <span className="dh-g">
              <span className="dh-t" style={{ fontWeight: notification.read ? 500 : 600 }}>{notification.title}</span>
              {notification.message && <span className="dh-sub">{notification.message}</span>}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <span className="dh-sub">{formatTime(notification.created_at)}</span>
              {!notification.read && <span className="nt-dot" />}
            </span>
          </button>
        )
      })}
    </div>
  )

  return (
    <Screen title="Notifications" onBack={goBack}>
      <Pills>
        <Pill on={filter === 'all'} onPress={() => setFilter('all')}>All {notifications.length}</Pill>
        <Pill on={filter === 'unread'} onPress={() => setFilter('unread')}>Unread {unreadCount}</Pill>
        <Pill on={filter === 'read'} onPress={() => setFilter('read')}>Read {notifications.length - unreadCount}</Pill>
      </Pills>

      {loading ? <Loading /> : filteredNotifications.length === 0 ? (
        <Empty icon="bell" title={filter === 'unread' ? 'No unread notifications' : filter === 'read' ? 'No read notifications' : 'No notifications'} />
      ) : (
        <>
          {today.length > 0 && <><Sec>Today</Sec>{list(today)}</>}
          {earlier.length > 0 && <><Sec>Earlier</Sec>{list(earlier)}</>}
        </>
      )}

      {notifications.length > 0 && (
        <Btns>
          {unreadCount > 0 ? <Btn variant="outline" onPress={handleMarkAllAsRead}>Mark all read</Btn> : <span />}
          <Btn variant="danger" onPress={handleClearAll}>Clear all</Btn>
        </Btns>
      )}
      <style>{`.nt-dot { width: 8px; height: 8px; border-radius: 4px; background: var(--mobile-accent); }`}</style>
    </Screen>
  )
}
