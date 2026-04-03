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

export default function Header() {
  const { pathname } = useLocation()
  const { user, realUser, isPreviewing, previewTarget, stopPreviewAs } = useAuth()
  const navigate = useNavigate()
  const [notifs, setNotifs]       = useState([])
  const [pinnedAlerts, setPinnedAlerts] = useState([])
  const [unread, setUnread]       = useState(0)
  const [bellOpen, setBellOpen]   = useState(false)
  const bellRef                   = useRef()

  useEffect(() => {
    if (!user?.email) return
    supabase.from('notifications')
      .select('*')
      .ilike('user_email', user.email)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }) => { setNotifs(data || []); setUnread((data||[]).length) })
      .catch(() => {})

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
    const handler = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markAllRead = async () => {
    await supabase.from('notifications').update({ read: true }).ilike('user_email', user.email).eq('read', false)
    setNotifs([]); setUnread(0)
  }

  const markRead = async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifs(p => p.filter(n => n.id !== id))
    setUnread(p => Math.max(0, p - 1))
  }

  const typeIcon = { info:'ℹ️', success:'✅', warning:'⚠️', urgent:'🚨' }

  return (
    <header className="main-header">
      <div style={{ display:'flex', alignItems:'center', gap:14, minWidth:0, flex:1 }}>
        <div className="header-crumbs">
          <button className="header-crumb-home" onClick={() => navigate('/')} style={{ width:28, height:28, borderRadius:7, border:'1px solid var(--border)', background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--faint)', flexShrink:0, fontSize:14 }}>⌂</button>
          <span className="header-crumb-sep" style={{ color:'var(--border2)', fontSize:14 }}>/</span>
          <span className="header-page-title" style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--sub)', letterSpacing:'0.05em' }}>
            {TITLES[pathname] || (pathname.startsWith('/my-staff/') ? 'Staff Profile' : 'Portal')}
          </span>
        </div>
        {isPreviewing && previewTarget ? (
          <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0, padding:'6px 10px', borderRadius:999, background:'var(--amber-bg)', border:'1px solid rgba(183,119,13,0.22)', color:'var(--amber)' }}>
            <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', whiteSpace:'nowrap' }}>Impersonating</span>
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

      <div className="header-actions">
        {/* Search */}
        <button className="header-icon-btn" onClick={() => navigate('/search')} title="Search" style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border)', background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--sub)', transition:'all 0.15s' }}
          onMouseOver={e => { e.currentTarget.style.background='var(--bg2)'; e.currentTarget.style.color='var(--text)' }}
          onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--sub)' }}>
          <SearchIcon/>
        </button>

        {/* Notification bell */}
        <div ref={bellRef} style={{ position:'relative' }}>
          <button className="header-icon-btn" onClick={() => setBellOpen(o => !o)} title="Notifications" style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border)', background: bellOpen ? 'var(--bg2)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--sub)', position:'relative', transition:'all 0.15s' }}
            onMouseOver={e => { e.currentTarget.style.background='var(--bg2)'; e.currentTarget.style.color='var(--text)' }}
            onMouseOut={e => { if (!bellOpen) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--sub)' } }}>
            <BellIcon/>
            {unread > 0 && (
              <span style={{ position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background:'var(--red)', border:'2px solid var(--card)' }}/>
            )}
          </button>

          {/* Dropdown */}
          {bellOpen && (
            <div className="header-bell-dropdown" style={{ position:'absolute', top:'calc(100% + 8px)', right:0, background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.12)', zIndex:200, overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontWeight:600, fontSize:14 }}>Notifications</span>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <button onClick={() => { setBellOpen(false); navigate('/notifications') }} style={{ fontSize:12, color:'var(--sub)', background:'none', border:'none', cursor:'pointer' }}>Open inbox</button>
                  {unread > 0 && <button onClick={markAllRead} style={{ fontSize:12, color:'var(--accent)', background:'none', border:'none', cursor:'pointer' }}>Mark all read</button>}
                </div>
              </div>
              <div style={{ maxHeight:320, overflowY:'auto' }}>
                {pinnedAlerts.length > 0 && (
                  <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg2)' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:8 }}>Pinned alerts</div>
                    <div style={{ display:'grid', gap:8 }}>
                      {pinnedAlerts.map((banner) => (
                        <button key={banner.id} onClick={() => { setBellOpen(false); navigate('/notifications') }} style={{ textAlign:'left', padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, background:'var(--card)' }}>
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
                ) : notifs.map(n => (
                  <div key={n.id} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'flex-start', background:'var(--accent-soft)' }}>
                    <span style={{ fontSize:16, flexShrink:0 }}>{typeIcon[n.type] || 'ℹ️'}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      {n.title && <div style={{ fontSize:13, fontWeight:500, marginBottom:2 }}>{n.title}</div>}
                      <div style={{ fontSize:12, color:'var(--sub)', lineHeight:1.5 }}>{n.message}</div>
                      <div style={{ fontSize:10, color:'var(--faint)', marginTop:4, fontFamily:'var(--font-mono)' }}>{new Date(n.created_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</div>
                    </div>
                    {n.link ? <button onClick={async () => { await markRead(n.id); setBellOpen(false); navigate(n.link) }} style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:11, flexShrink:0, lineHeight:1.2 }}>Open</button> : null}
                    <button onClick={() => markRead(n.id)} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:16, flexShrink:0, lineHeight:1 }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Username */}
        <span className="hide-mob header-user-name" style={{ fontSize:13, color:'var(--faint)', paddingLeft:4 }}>{user?.name}</span>

        {/* Avatar */}
        <button className="header-avatar-btn" onClick={() => navigate('/my-profile')} title="My Profile"
          style={{ width:30, height:30, borderRadius:'50%', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'var(--accent)', cursor:'pointer', flexShrink:0, transition:'all 0.15s' }}
          onMouseOver={e => { e.currentTarget.style.background='var(--accent)'; e.currentTarget.style.color='#fff' }}
          onMouseOut={e => { e.currentTarget.style.background='var(--accent-soft)'; e.currentTarget.style.color='var(--accent)' }}>
          <img src="/dh-logo-icon.png" alt="DH avatar" style={{ width:18, height:18, objectFit:'contain' }} />
        </button>
      </div>
    </header>
  )
}
