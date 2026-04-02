import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, CircleAlert, Clock3, Filter, Info, CheckCircle2, TriangleAlert } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import SystemBannerCard from '../components/SystemBannerCard'

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
  if (haystack.includes('payment') || haystack.includes('invoice') || haystack.includes('gocardless') || haystack.includes('/clients') || haystack.includes('/client-mgmt')) return 'payments'
  if (haystack.includes('client') || haystack.includes('support') || haystack.includes('outreach') || haystack.includes('proposal')) return 'clients'
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
      className="card"
      style={{
        padding: 16,
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        borderColor: notification.read ? 'var(--border)' : 'var(--accent-border)',
        background: notification.read ? 'var(--card)' : 'linear-gradient(180deg, var(--card), var(--accent-soft))',
      }}
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
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{notification.title || 'Notification'}</div>
          <span className={`badge badge-${meta.tone}`}>{meta.label}</span>
          <span className="badge badge-grey">{category}</span>
          {!notification.read ? <span className="badge badge-blue">Unread</span> : null}
        </div>
        <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.65, marginBottom: 8 }}>{notification.message}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>
            <Clock3 size={12} />
            {formatWhen(notification.created_at)}
          </span>
          {notification.link ? (
            <button className="btn btn-ghost btn-sm" onClick={onOpen}>
              Open item
            </button>
          ) : null}
          {!notification.read ? (
            <button className="btn btn-outline btn-sm" onClick={onRead}>
              Mark read
            </button>
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
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-sub">A full inbox for alerts, approvals, and internal updates.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={load}>
            <Filter size={14} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={markAllRead} disabled={!unreadCount}>
            <CheckCheck size={14} /> Mark all read
          </button>
        </div>
      </div>

      <div className="dashboard-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 24 }}>
        <div className="stat-card">
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Bell size={18} color="var(--blue)" />
          </div>
          <div className="stat-val">{notifications.length}</div>
          <div className="stat-lbl">Total Notifications</div>
        </div>
        <div className="stat-card">
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Info size={18} color="var(--accent)" />
          </div>
          <div className="stat-val">{unreadCount}</div>
          <div className="stat-lbl">Unread</div>
        </div>
        <div className="stat-card">
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--red-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <CircleAlert size={18} color="var(--red)" />
          </div>
          <div className="stat-val">{urgentCount}</div>
          <div className="stat-lbl">Urgent Unread</div>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 20 }}>
        {FILTERS.map(([key, label]) => (
          <button key={key} className={`tab${filter === key ? ' on' : ''}`} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="spin-wrap"><div className="spin" /></div>
      ) : filtered.length || pinnedAlerts.length ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {pinnedAlerts.length ? (
            <div className="card card-pad" style={{ borderColor:'var(--accent-border)', background:'linear-gradient(180deg, var(--card), var(--accent-soft))' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:12 }}>
                <div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Pinned alerts</div>
                  <div style={{ fontSize:14, color:'var(--sub)', marginTop:4 }}>Pinned staff notices stay visible here until the banner expires or is disabled.</div>
                </div>
                <span className="badge badge-blue">{pinnedAlerts.length} active</span>
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
        <div className="card card-pad" style={{ textAlign: 'center', padding: '42px 20px' }}>
          <div style={{ fontSize: 14, color: 'var(--sub)', marginBottom: 8 }}>No notifications in this view</div>
          <div style={{ fontSize: 12, color: 'var(--faint)' }}>Try switching the filter or wait for the next portal event.</div>
        </div>
      )}
    </div>
  )
}
