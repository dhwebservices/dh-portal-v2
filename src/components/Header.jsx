import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../utils/supabase'

const TITLES = {
  '/dashboard':'Dashboard', '/my-profile':'My Profile',
  '/search':'Search',
  '/my-department':'My Department',
  '/my-team':'View My Team',
  '/outreach':'Clients Contacted', '/clients':'Onboarded Clients',
  '/client-mgmt':'Client Portal', '/support':'Support Tickets',
  '/tasks':'Manage Tasks', '/my-tasks':'My Tasks',
  '/schedule':'Schedule', '/reports':'Reports',
  '/manager-board':'Manager Board',
  '/departments':'Departments',
  '/contract-queue':'Contract Queue',
  '/contract-templates':'Contract Templates',
  '/org-chart':'Organisation Chart',
  '/my-staff':'My Staff', '/proposals':'Proposal Builder',
  '/send-email':'Send Email', '/email-templates':'Email Templates',
  '/banners':'Banners', '/domains':'Domain Checker',
  '/competitor':'Competitor Lookup', '/maintenance':'Maintenance',
  '/hr/leave':'Leave', '/hr/timesheets':'Timesheets',
  '/hr/payslips':'Payslips', '/hr/profiles':'HR Profiles',
  '/hr/policies':'Policies', '/hr/documents':'HR Documents', '/hr/onboarding':'Onboarding',
  '/audit':'Audit Log', '/settings':'Settings',
  '/notifications':'Notifications',
}

const PAGE_NOTES = {
  '/dashboard': { section: 'Home', note: 'Overview, priorities, and live portal activity' },
  '/my-profile': { section: 'Account', note: 'Personal details, preferences, and portal setup' },
  '/search': { section: 'Home', note: 'Search pages, staff, and client records' },
  '/my-department': { section: 'Home', note: 'Department operations, staffing, and requests' },
  '/my-team': { section: 'Home', note: 'Manager view of direct reports and workload' },
  '/outreach': { section: 'Business', note: 'Leads, contact activity, and conversion follow-up' },
  '/clients': { section: 'Business', note: 'Client relationships, records, and account health' },
  '/client-mgmt': { section: 'Business', note: 'Client portal, contracts, invoices, and support' },
  '/support': { section: 'Business', note: 'Support queue and client issue handling' },
  '/tasks': { section: 'Tasks', note: 'Task assignment, progress, and ownership' },
  '/my-tasks': { section: 'Tasks', note: 'Your assigned work and due items' },
  '/schedule': { section: 'Tasks', note: 'Availability, bookings, and calendar planning' },
  '/my-staff': { section: 'HR', note: 'Staff records, permissions, and lifecycle controls' },
  '/contract-queue': { section: 'HR', note: 'Issued contracts and signing progress' },
  '/contract-templates': { section: 'HR', note: 'Template library for staff contracts' },
  '/hr/profiles': { section: 'HR', note: 'Core staff records and employment details' },
  '/recruiting': { section: 'Hiring', note: 'Roles, job overviews, and candidate pipelines' },
  '/recruiting/jobs': { section: 'Hiring', note: 'Role publishing and requisition management' },
  '/recruiting/applications': { section: 'Hiring', note: 'Application inbox and candidate review' },
  '/recruiting/board': { section: 'Hiring', note: 'Pipeline movement across hiring stages' },
  '/recruiting/settings': { section: 'Hiring', note: 'Questions, stages, and recruiting defaults' },
  '/reports': { section: 'Admin', note: 'Operational reporting and portal analytics' },
  '/departments': { section: 'Admin', note: 'Organisation structure and department setup' },
  '/settings': { section: 'Account', note: 'Workspace, notifications, and personal preferences' },
  '/notifications': { section: 'Home', note: 'Unread alerts, approvals, and updates' },
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  )
}
function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8"/>
      <circle cx="12" cy="12" r="1.8"/>
      <circle cx="19" cy="12" r="1.8"/>
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3 3 10.2V21h6v-6h6v6h6V10.2L12 3Z" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  )
}

function sectionAccent(section = '') {
  const safe = String(section || '').toLowerCase()
  if (safe === 'hiring') return { bg: 'rgba(26,86,219,0.1)', color: 'var(--accent)' }
  if (safe === 'hr') return { bg: 'rgba(14,165,233,0.1)', color: 'var(--accent)' }
  if (safe === 'admin') return { bg: 'rgba(15,23,42,0.08)', color: 'var(--text)' }
  return { bg: 'rgba(26,86,219,0.08)', color: 'var(--accent)' }
}

function resolvePageMeta(pathname = '') {
  if (pathname.startsWith('/my-staff/')) {
    return { title: 'Staff Profile', section: 'HR', note: 'Employee record, lifecycle, contracts, and permissions' }
  }
  if (pathname.startsWith('/clients/')) {
    return { title: 'Client Profile', section: 'Business', note: 'Client account, billing, and delivery view' }
  }
  if (pathname.startsWith('/recruiting/jobs/')) {
    return { title: 'Recruitment', section: 'Hiring', note: 'Role overview, pipeline, and requisition details' }
  }
  if (pathname.startsWith('/recruiting/applications/')) {
    return { title: 'Applicant Profile', section: 'Hiring', note: 'Candidate review, interview scheduling, and decisions' }
  }
  return {
    title: TITLES[pathname] || 'Portal',
    section: PAGE_NOTES[pathname]?.section || 'Portal',
    note: PAGE_NOTES[pathname]?.note || 'Operational workspace',
  }
}

function NotificationDropdown({ notifs, pinnedAlerts, unread, openInbox, markAllRead, markReadAndOpen, markReadOnly }) {
  return (
    <div className="header-bell-dropdown" style={{ position:'absolute', top:'calc(100% + 8px)', right:0, zIndex:200, overflow:'hidden' }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>Notifications</div>
          <div style={{ fontSize:11, color:'var(--sub)', marginTop:3 }}>{unread ? `${unread} unread` : 'Inbox is clear'}</div>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <button onClick={openInbox} style={{ fontSize:12, color:'var(--sub)', background:'none', border:'none', cursor:'pointer' }}>Open inbox</button>
          {unread > 0 && <button onClick={markAllRead} style={{ fontSize:12, color:'var(--accent)', background:'none', border:'none', cursor:'pointer' }}>Read all</button>}
        </div>
      </div>
      <div style={{ maxHeight:320, overflowY:'auto' }}>
        {pinnedAlerts.length > 0 && (
          <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg2)' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.05em', color:'var(--faint)', marginBottom:8 }}>Pinned</div>
            <div style={{ display:'grid', gap:8 }}>
              {pinnedAlerts.map((banner) => (
                <button key={banner.id} onClick={openInbox} style={{ textAlign:'left', padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, background:'var(--card)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontSize:12.5, fontWeight:600, color:'var(--text)' }}>{banner.title || 'Pinned alert'}</span>
                    <span className={`badge badge-${banner.type === 'urgent' ? 'red' : banner.type === 'warning' ? 'amber' : banner.type === 'success' ? 'green' : 'blue'}`}>Pinned</span>
                  </div>
                  <div style={{ fontSize:11.5, color:'var(--sub)', lineHeight:1.5 }}>{banner.message}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {notifs.length === 0 ? (
          <div style={{ padding:'32px 16px', textAlign:'center', color:'var(--faint)', fontSize:13 }}>No new notifications</div>
        ) : notifs.map((n) => (
          <div key={n.id} style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'flex-start', background:'var(--accent-soft)' }}>
            <span style={{ width:8, height:8, marginTop:6, borderRadius:'50%', background: n.type === 'urgent' ? 'var(--red)' : n.type === 'warning' ? 'var(--amber)' : n.type === 'success' ? 'var(--green)' : 'var(--accent)', flexShrink:0 }} />
            <div style={{ flex:1, minWidth:0 }}>
              {n.title && <div style={{ fontSize:13, fontWeight:600, marginBottom:3, color:'var(--text)' }}>{n.title}</div>}
              <div style={{ fontSize:12, color:'var(--sub)', lineHeight:1.5 }}>{n.message}</div>
              <div style={{ fontSize:10, color:'var(--faint)', marginTop:5, fontFamily:'var(--font-mono)' }}>{new Date(n.created_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</div>
            </div>
            {n.link ? <button onClick={() => markReadAndOpen(n)} style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:11.5, flexShrink:0, lineHeight:1.2 }}>Open</button> : null}
            <button onClick={() => markReadOnly(n.id)} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:15, flexShrink:0, lineHeight:1 }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Header() {
  const { pathname } = useLocation()
  const { user, realUser, isPreviewing, previewTarget, stopPreviewAs } = useAuth()
  const navigate = useNavigate()
  const [notifs, setNotifs]       = useState([])
  const [pinnedAlerts, setPinnedAlerts] = useState([])
  const [unread, setUnread]       = useState(0)
  const [bellOpen, setBellOpen]   = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const desktopBellRef            = useRef(null)
  const mobileBellRef             = useRef(null)

  const loadUnreadNotifications = async () => {
    if (!user?.email) {
      setNotifs([])
      setUnread(0)
      return
    }

    const { data } = await supabase.from('notifications')
      .select('*')
      .ilike('user_email', user.email)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(8)

    setNotifs(data || [])
    setUnread((data || []).length)
  }

  useEffect(() => {
    if (!user?.email) return
    loadUnreadNotifications().catch(() => {})

    supabase.from('banners')
      .select('*')
      .eq('active', true)
      .eq('target', 'staff')
      .then(({ data }) => {
        const filtered = (data || []).filter((banner) => {
          if (banner.ends_at && new Date(banner.ends_at) <= new Date()) return false
          if (banner.target_email && banner.target_email.toLowerCase() !== user.email.toLowerCase()) return false
          const targetPage = String(banner.target_page || 'all').toLowerCase()
          return targetPage === 'all' || targetPage === 'notifications'
        })
        setPinnedAlerts(filtered)
      })
      .catch(() => {})
  }, [user?.email, pathname])

  // Close bell dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      const desktopInside = desktopBellRef.current?.contains(e.target)
      const mobileInside = mobileBellRef.current?.contains(e.target)
      if (!desktopInside && !mobileInside) setBellOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    setBellOpen(false)
    setMobileMenuOpen(false)
  }, [pathname])

  const openNotificationsInbox = () => {
    setBellOpen(false)
    setMobileMenuOpen(false)
    navigate('/notifications')
  }

  const markAllRead = async () => {
    const unreadIds = notifs.map((notification) => notification.id).filter(Boolean)
    if (!user?.email || unreadIds.length === 0) return

    const { error } = await supabase.from('notifications')
      .update({ read: true })
      .in('id', unreadIds)

    if (!error) {
      setNotifs([])
      setUnread(0)
      return
    }

    await loadUnreadNotifications().catch(() => {})
  }

  const markRead = async (id) => {
    if (!id) return

    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
    if (!error) {
      setNotifs(p => p.filter(n => n.id !== id))
      setUnread(p => Math.max(0, p - 1))
      return
    }

    await loadUnreadNotifications().catch(() => {})
  }

  const pageMeta = resolvePageMeta(pathname)
  const pageTitle = pageMeta.title
  const sectionTone = sectionAccent(pageMeta.section)
  const openMenuRoute = (route) => {
    setMobileMenuOpen(false)
    navigate(route)
  }
  const openNotificationItem = async (notification) => {
    await markRead(notification.id)
    setBellOpen(false)
    if (notification.link) navigate(notification.link)
  }

  return (
    <>
    <header className="main-header">
      <div className="header-shell" style={{ display:'flex', alignItems:'center', gap:18, minWidth:0, flex:1 }}>
        <div className="header-page-meta" style={{ minWidth:0, flex:1 }}>
          <div className="header-page-topline" style={{ display:'flex', alignItems:'center', gap:10, minWidth:0, flexWrap:'wrap' }}>
            <span className="header-page-section" style={{ background:sectionTone.bg, color:sectionTone.color }}>
              {pageMeta.section}
            </span>
            <span className="header-page-heading">{pageTitle}</span>
          </div>
          <div className="header-page-note">
            {pageMeta.note}
          </div>
        </div>
        <button className="header-search-launch hide-mob" onClick={() => navigate('/search')} title="Search the portal">
          <SearchIcon />
          <span>Search tasks, staff, or documents...</span>
        </button>
        {isPreviewing && previewTarget ? (
          <div className="hide-mob" style={{ display:'flex', alignItems:'center', gap:10, minWidth:0, padding:'7px 10px', borderRadius:12, background:'var(--amber-bg)', border:'1px solid rgba(183,119,13,0.22)', color:'var(--amber)' }}>
            <span style={{ fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>Previewing</span>
            <span style={{ fontSize:12.5, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:220 }}>
              {previewTarget.name || previewTarget.email}
            </span>
            <span style={{ fontSize:11, color:'var(--sub)', whiteSpace:'nowrap' }}>
              as {realUser?.name || realUser?.email}
            </span>
            <button
              onClick={() => { stopPreviewAs(); navigate('/my-staff') }}
              style={{ border:'none', background:'var(--accent)', color:'#fff', borderRadius:999, padding:'6px 10px', fontSize:11.5, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}
            >
              Exit impersonation
            </button>
          </div>
        ) : null}
      </div>

      <div className="header-actions hide-mob">
        <div ref={desktopBellRef} style={{ position:'relative' }}>
          <button className="header-icon-btn" onClick={() => setBellOpen(o => !o)} title="Notifications" style={{ width:34, height:34, borderRadius:10, border:'1px solid var(--border)', background: bellOpen ? 'var(--bg2)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--sub)', position:'relative', transition:'all 0.15s' }}
            onMouseOver={e => { e.currentTarget.style.background='var(--bg2)'; e.currentTarget.style.color='var(--text)' }}
            onMouseOut={e => { if (!bellOpen) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--sub)' } }}>
            <BellIcon/>
            {unread > 0 && (
              <span style={{ position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background:'var(--red)', border:'2px solid var(--card)' }}/>
            )}
          </button>

          {bellOpen && (
            <NotificationDropdown
              notifs={notifs}
              pinnedAlerts={pinnedAlerts}
              unread={unread}
              openInbox={openNotificationsInbox}
              markAllRead={markAllRead}
              markReadAndOpen={openNotificationItem}
              markReadOnly={markRead}
            />
          )}
        </div>

        <button className="header-avatar-btn" onClick={() => navigate('/my-profile')} title="My Profile"
          style={{ height:36, borderRadius:999, background:'var(--accent-soft)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'0 8px 0 6px', fontSize:12, fontWeight:600, color:'var(--accent)', cursor:'pointer', flexShrink:0, transition:'all 0.15s' }}
          onMouseOver={e => { e.currentTarget.style.background='var(--bg2)'; e.currentTarget.style.color='var(--text)' }}
          onMouseOut={e => { e.currentTarget.style.background='var(--accent-soft)'; e.currentTarget.style.color='var(--accent)' }}>
          <span style={{ width:24, height:24, borderRadius:'50%', background:'rgba(255,255,255,0.78)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <img src="/dh-logo-icon.png" alt="DH avatar" style={{ width:14, height:14, objectFit:'contain' }} />
          </span>
          <span style={{ maxWidth:120, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:'inherit' }}>{user?.name || 'My profile'}</span>
        </button>
      </div>

      <div className="header-actions mobile-only">
        <div ref={mobileBellRef} style={{ position:'relative' }}>
          <button className="header-icon-btn" onClick={() => setBellOpen(o => !o)} title="Notifications" style={{ width:28, height:28, borderRadius:8, border:'1px solid var(--border)', background: bellOpen ? 'var(--bg2)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--sub)', position:'relative', transition:'all 0.15s' }}>
            <BellIcon/>
            {unread > 0 && (
              <span style={{ position:'absolute', top:3, right:3, width:8, height:8, borderRadius:'50%', background:'var(--red)', border:'2px solid var(--card)' }}/>
            )}
          </button>
          {bellOpen && (
            <NotificationDropdown
              notifs={notifs}
              pinnedAlerts={pinnedAlerts}
              unread={unread}
              openInbox={openNotificationsInbox}
              markAllRead={markAllRead}
              markReadAndOpen={openNotificationItem}
              markReadOnly={markRead}
            />
          )}
        </div>

        <button
          className="header-icon-btn"
          onClick={() => setMobileMenuOpen(true)}
          title="More"
          style={{ width:28, height:28, borderRadius:8, border:'1px solid var(--border)', background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--sub)' }}
        >
          <MoreIcon />
        </button>
      </div>
    </header>

    {mobileMenuOpen ? (
      <>
        <button className="header-mobile-menu-scrim" onClick={() => setMobileMenuOpen(false)} aria-label="Close actions menu" />
        <aside className="header-mobile-menu">
          <div className="header-mobile-menu-head">
            <div>
              <div className="header-mobile-menu-kicker">Quick actions</div>
              <div className="header-mobile-menu-title">{pageTitle}</div>
            </div>
            <button className="header-mobile-menu-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close">
              ×
            </button>
          </div>

          <div className="header-mobile-menu-user">
            <div className="header-mobile-menu-avatar">
              <img src="/dh-logo-icon.png" alt="DH avatar" style={{ width:18, height:18, objectFit:'contain' }} />
            </div>
            <div style={{ minWidth:0 }}>
              <div className="header-mobile-menu-user-name">{user?.name || 'Staff user'}</div>
              <div className="header-mobile-menu-user-email">{user?.email}</div>
            </div>
          </div>

          <div className="header-mobile-menu-actions">
            <button className="header-mobile-menu-btn" onClick={() => openMenuRoute('/search')}>
              <SearchIcon />
              <span>Search portal</span>
            </button>
            <button className="header-mobile-menu-btn" onClick={() => openMenuRoute('/notifications')}>
              <BellIcon />
              <span>Open notifications</span>
            </button>
            <button className="header-mobile-menu-btn" onClick={() => openMenuRoute('/my-profile')}>
              <img src="/dh-logo-icon.png" alt="" style={{ width:15, height:15, objectFit:'contain' }} />
              <span>My profile</span>
            </button>
            <button className="header-mobile-menu-btn" onClick={() => openMenuRoute('/dashboard')}>
              <HomeIcon />
              <span>Dashboard</span>
            </button>
            <button className="header-mobile-menu-btn" onClick={() => openMenuRoute('/clients')}>
              <GridIcon />
              <span>Business</span>
            </button>
            <button className="header-mobile-menu-btn" onClick={() => openMenuRoute('/recruiting')}>
              <GridIcon />
              <span>Recruitment</span>
            </button>
          </div>

          {isPreviewing && previewTarget ? (
            <div className="header-mobile-menu-preview">
              <div className="header-mobile-menu-preview-copy">
                Previewing {previewTarget.name || previewTarget.email}
              </div>
              <button
                className="header-mobile-menu-primary"
                onClick={() => {
                  stopPreviewAs()
                  setMobileMenuOpen(false)
                  navigate('/my-staff')
                }}
              >
                Exit impersonation
              </button>
            </div>
          ) : null}
        </aside>
      </>
    ) : null}
    </>
  )
}
