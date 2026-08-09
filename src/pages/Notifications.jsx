import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, CircleAlert, Clock3, Filter, Info, CheckCircle2, TriangleAlert } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import SystemBannerCard from '../components/SystemBannerCard'
import { Button, StatusBadge } from '../components/ds'

const TONE_TO_VARIANT = { green: 'active', amber: 'warning', red: 'error', blue: 'info', grey: 'info' }
const DS_CARD = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)' }

const FILTERS = [
  ['all', 'All'],
  ['unread', 'Unread'],
  ['urgent', 'Urgent'],
  ['tasks', 'Tasks'],
  ['hr', 'HR'],
  ['clients', 'Clients'],
  ['payments', 'Payments'],
]

const TYPE_META = {
  info: { icon: Info, tone: 'blue', label: 'Info' },
  success: { icon: CheckCircle2, tone: 'green', label: 'Success' },
  warning: { icon: TriangleAlert, tone: 'amber', label: 'Warning' },
  urgent: { icon: CircleAlert, tone: 'red', label: 'Urgent' },
}

function inferCategory(notification) {
  const haystack = `${notification.title || ''} ${notification.message || ''} ${notification.link || ''}`.toLowerCase()
  if (haystack.includes('/tasks') || haystack.includes('task')) return 'tasks'
  if (haystack.includes('/hr/') || haystack.includes('leave') || haystack.includes('onboarding') || haystack.includes('schedule')) return 'hr'
  if (haystack.includes('client') || haystack.includes('support') || haystack.includes('outreach') || haystack.includes('proposal')) return 'clients'
  if (haystack.includes('payment') || haystack.includes('invoice') || haystack.includes('gocardless')) return 'payments'
  return 'general'
}

function formatWhen(dateString) {
  const date = new Date(dateString)
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function NotificationRow({ notification, onOpen, onRead }) {
  const meta = TYPE_META[notification.type] || TYPE_META.info
  const Icon = meta.icon
  const category = inferCategory(notification)

  return (
    <div
      className={`notification-row${notification.read ? '' : ' notification-row-unread'}`}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: `var(--${meta.tone}-bg)`,
          color: `var(--${meta.tone})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{notification.title || 'Notification'}</div>
          <StatusBadge variant={TONE_TO_VARIANT[meta.tone] || 'info'}>{meta.label}</StatusBadge>
          <StatusBadge variant="info">{category}</StatusBadge>
          {!notification.read ? <StatusBadge variant="info">Unread</StatusBadge> : null}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.65, marginBottom: 8 }}>{notification.message}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            <Clock3 size={12} />
            {formatWhen(notification.created_at)}
          </span>
          {notification.link ? (
            <Button variant="ghost" style={{ height: 28, fontSize: 12, padding: '0 8px' }} onClick={onOpen}>
              Open item
            </Button>
          ) : null}
          {!notification.read ? (
            <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px' }} onClick={onRead}>
              Mark read
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function Notifications() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [pinnedAlerts, setPinnedAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const load = async () => {
    if (!user?.email) return
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .ilike('user_email', user.email)
      .order('read', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(100)
    const { data: bannerData } = await supabase
      .from('banners')
      .select('*')
      .eq('active', true)
      .eq('target', 'staff')
    setNotifications(data || [])
    setPinnedAlerts((bannerData || []).filter((banner) => {
      if (banner.ends_at && new Date(banner.ends_at) <= new Date()) return false
      if (banner.target_email && banner.target_email.toLowerCase() !== user.email.toLowerCase()) return false
      const targetPage = String(banner.target_page || 'all').toLowerCase()
      return targetPage === 'all' || targetPage === 'notifications'
    }))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [user?.email])

  const filtered = useMemo(() => {
    return notifications.filter((notification) => {
      const category = inferCategory(notification)
      if (filter === 'all') return true
      if (filter === 'unread') return !notification.read
      if (filter === 'urgent') return notification.type === 'urgent'
      return category === filter
    })
  }, [filter, notifications])

  const unreadCount = notifications.filter((notification) => !notification.read).length
  const urgentCount = notifications.filter((notification) => notification.type === 'urgent' && !notification.read).length

  const markRead = async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications((current) => current.map((notification) => (
      notification.id === id ? { ...notification, read: true } : notification
    )))
  }

  const markAllRead = async () => {
    if (!user?.email || unreadCount === 0) return
    await supabase.from('notifications').update({ read: true }).ilike('user_email', user.email).eq('read', false)
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })))
  }

  const openNotification = async (notification) => {
    if (!notification.read) {
      await markRead(notification.id)
    }
    if (notification.link) {
      navigate(notification.link)
    }
  }

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Notifications</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>A full inbox for alerts, approvals, and internal updates.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={load}>
            <Filter size={14} /> Refresh
          </Button>
          <Button variant="primary" onClick={markAllRead} disabled={!unreadCount}>
            <CheckCheck size={14} /> Mark all read
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { icon: Bell, value: notifications.length, label: 'Total notifications', hint: 'All portal alerts, approvals, and updates in the inbox.' },
          { icon: Info, value: unreadCount, label: 'Unread', hint: 'Items that still need to be opened or acknowledged.' },
          { icon: CircleAlert, value: urgentCount, label: 'Urgent unread', hint: 'High-priority alerts that should be reviewed first.' },
        ].map((tile) => {
          const TileIcon = tile.icon
          return (
            <div key={tile.label} style={{ ...DS_CARD, padding: 20 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--color-gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <TileIcon size={18} color="var(--color-text-tertiary)" />
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--color-text-primary)' }}>{tile.value}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{tile.label}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>{tile.hint}</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTERS.map(([key, label]) => (
          <Button key={key} variant={filter === key ? 'primary' : 'secondary'} style={{ height: 30, fontSize: 12, padding: '0 10px' }} onClick={() => setFilter(key)}>
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="spin-wrap"><div className="spin" /></div>
      ) : filtered.length || pinnedAlerts.length ? (
        <div className="stack-list">
          {pinnedAlerts.length ? (
            <div style={{ ...DS_CARD, padding: 20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:12 }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Pinned alerts</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>Pinned staff notices stay visible here until the banner expires or is disabled.</div>
                </div>
                <StatusBadge variant="info">{pinnedAlerts.length} active</StatusBadge>
              </div>
              <div style={{ display:'grid', gap:10 }}>
                {pinnedAlerts.map((banner) => (
                  <SystemBannerCard
                    key={banner.id}
                    title={banner.title || 'Pinned alert'}
                    tone={banner.type === 'urgent' ? 'urgent' : banner.type === 'warning' ? 'warning' : banner.type === 'success' ? 'success' : 'info'}
                    subtitle={banner.message}
                    meta={[
                      'pinned',
                      banner.ends_at ? `expires ${formatWhen(banner.ends_at)}` : 'no expiry',
                      banner.target_page ? String(banner.target_page).toLowerCase() : 'all pages',
                    ]}
                    compact
                  />
                ))}
              </div>
            </div>
          ) : null}
          {filtered.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              onRead={() => markRead(notification.id)}
              onOpen={() => openNotification(notification)}
            />
          ))}
        </div>
      ) : (
        <div style={{ ...DS_CARD, textAlign: 'center', padding: '42px 20px' }}>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 8 }}>No notifications in this view</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Try switching the filter or wait for the next portal event.</div>
        </div>
      )}
    </div>
  )
}
