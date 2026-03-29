import React, { useState, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../utils/supabase'

const GROUPS = [
  { label: null, items: [
    { to:'/dashboard',  icon:'grid',     label:'Dashboard',   key:'dashboard' },
    { to:'/my-profile', icon:'person',   label:'My Profile',  key:'dashboard' },
    { to:'/search',     icon:'search',   label:'Search',      key:'dashboard' },
  ]},
  { label:'Business', items:[
    { to:'/outreach',        icon:'phone',   label:'Clients Contacted', key:'outreach'      },
    { to:'/clients',         icon:'people',  label:'Onboarded Clients', key:'clients'       },
    { to:'/client-mgmt',     icon:'globe',   label:'Client Portal',     key:'clientmgmt'    },
    { to:'/support',         icon:'chat',    label:'Support',           key:'support'       },
    { to:'/competitor',      icon:'search',  label:'Competitor Lookup', key:'competitor'    },
    { to:'/domains',         icon:'link',    label:'Domain Checker',    key:'domains'       },
    { to:'/proposals',       icon:'doc',     label:'Proposal Builder',  key:'proposals'     },
    { to:'/send-email',      icon:'send',    label:'Send Email',        key:'sendemail'     },
  ]},
  { label:'Tasks', items:[
    { to:'/tasks',    icon:'check',  label:'Manage Tasks', key:'tasks'    },
    { to:'/my-tasks', icon:'check',  label:'My Tasks',     key:'mytasks'  },
    { to:'/schedule',      icon:'cal',      label:'Schedule',      key:'schedule'      },
    { to:'/appointments', icon:'cal',     label:'Appointments',  key:'appointments'  },
  ]},
  { label:'HR', items:[
    { to:'/hr/onboarding', icon:'star',    label:'Onboarding',  key:'hr_onboarding' },
    { to:'/hr/leave',      icon:'cal',     label:'Leave',       key:'hr_leave'      },
    { to:'/hr/payslips',   icon:'wallet',  label:'Payslips',    key:'hr_payslips'   },
    { to:'/hr/policies',   icon:'doc',     label:'Policies',    key:'hr_policies'   },
    { to:'/hr/timesheets', icon:'clock',   label:'Timesheets',  key:'hr_timesheet'  },
  ]},
  { label:'Admin', items:[
    { to:'/my-staff',        icon:'people', label:'My Staff',         key:'staff'          },
    { to:'/reports',         icon:'chart',  label:'Reports',          key:'reports'        },
    { to:'/mailing-list',    icon:'mail',   label:'Mailing List',     key:'mailinglist'    },
    { to:'/banners',         icon:'bell',   label:'Banners',          key:'banners'        },
    { to:'/email-templates', icon:'mail',   label:'Email Templates',  key:'emailtemplates' },
    { to:'/audit',           icon:'shield', label:'Audit Log',        key:'audit'          },
    { to:'/maintenance',     icon:'wrench', label:'Maintenance',      key:'maintenance'    },
    { to:'/settings',        icon:'gear',   label:'Settings',         key:'settings'       },
  ]},
]

// SF Symbol-inspired SVG icons
const Icon = ({ name, size = 14 }) => {
  const icons = {
    grid:    <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    person:  <><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></>,
    phone:   <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5 19.79 19.79 0 012 .84h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.91 8.09a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/>,
    people:  <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>,
    globe:   <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></>,
    chat:    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>,
    search:  <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    link:    <><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></>,
    doc:     <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    send:    <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    check:   <><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></>,
    cal:     <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    star:    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,
    wallet:  <><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4z"/></>,
    clock:   <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    chart:   <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    bell:    <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>,
    mail:    <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    shield:  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
    wrench:  <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>,
    gear:    <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
    logout:  <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    sun:     <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>,
    moon:    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>,
    chevD:   <polyline points="6 9 12 15 18 9"/>,
    chevR:   <polyline points="9 18 15 12 9 6"/>,
    menu:    <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    x:       <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    home:    <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
      {icons[name] || icons.doc}
    </svg>
  )
}

export default function Sidebar() {
  const { user, can, isOnboarding } = useAuth()
  const { instance } = useMsal()
  const location = useLocation()
  const navigate = useNavigate()
  const [dark, setDark]       = useState(() => localStorage.getItem('dh-theme') === 'dark')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [tickets, setTickets] = useState(0)
  const [collapsed, setCollapsed] = useState({})
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Sync sidebar width as CSS variable so main content can respond
  React.useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', sidebarCollapsed ? '60px' : '248px')
  }, [sidebarCollapsed])

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!user?.email) return
    supabase.from('support_tickets').select('*', { count:'exact', head:true })
      .eq('status','open').then(({ count }) => setTickets(count || 0)).catch(() => {})
  }, [user?.email])

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('dh-theme', next)
    setDark(!dark)
  }

  const navBody = (
    <>
      {/* Logo */}
      <div style={{ padding:'18px 20px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={() => navigate('/')} style={{ background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left' }}>
            <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:400, letterSpacing:'-0.02em', color:'var(--text)', lineHeight:1 }}>
              {sidebarCollapsed ? 'DH' : <><span>DH</span><span style={{ color:'var(--accent)' }}> Portal</span></>}
            </div>
          </button>
          <button onClick={() => setSidebarCollapsed(s => !s)} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, cursor:'pointer', color:'var(--faint)', display:'flex', alignItems:'center', justifyContent:'center', width:24, height:24, flexShrink:0, transition:'all 0.2s' }}
            className="hide-mob">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {sidebarCollapsed
                ? <polyline points="9 18 15 12 9 6"/>
                : <polyline points="15 18 9 12 15 6"/>}
            </svg>
          </button>
        </div>
        {!sidebarCollapsed && user?.name && (
          <div style={{ marginTop:6, fontSize:12, color:'var(--faint)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'var(--font-mono)', letterSpacing:'0.02em' }}>
            {user.name}
          </div>
        )}
      </div>

      {/* Nav */}
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'8px 10px' }}>
        <style>{`.dh-nav-item svg { opacity: 0.7 } .dh-nav-item.active svg { opacity: 1 } .dh-nav-item:hover svg { opacity: 0.9 }`}</style>

        {GROUPS.map(g => {
          const items = (g.items || []).filter(item =>
            isOnboarding ? item.key === 'hr_onboarding' : can(item.key)
          )
          if (g.label && items.length === 0) return null
          const isCollapsed = g.label && collapsed[g.label]
          return (
            <div key={g.label || 'root'} style={{ marginBottom: g.label ? 6 : 2 }}>
              {g.label && !sidebarCollapsed && (
                <button onClick={() => setCollapsed(p => ({ ...p, [g.label]: !p[g.label] }))}
                  style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 10px 3px', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--faint)' }}>
                  {g.label}
                  <Icon name={isCollapsed ? 'chevR' : 'chevD'} size={9}/>
                </button>
              )}
              {g.label && sidebarCollapsed && <div style={{ height:1, background:'var(--border)', margin:'6px 8px 4px' }}/>}
              {!isCollapsed && items.map(item => {
                const isActive = location.pathname === item.to
                return (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => 'dh-nav-item' + (isActive ? ' active' : '')} title={sidebarCollapsed ? item.label : ''} style={sidebarCollapsed ? { justifyContent:'center', padding:'8px' } : {}}>
                    <Icon name={item.icon} size={14}/>
                    {!sidebarCollapsed && <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis' }}>{item.label}</span>}
                    {!sidebarCollapsed && item.to === '/support' && tickets > 0 && (
                      <span style={{ background:'var(--red)', color:'#fff', fontSize:9, fontWeight:600, minWidth:16, height:16, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px', flexShrink:0 }}>
                        {tickets}
                      </span>
                    )}
                    {sidebarCollapsed && item.to === '/support' && tickets > 0 && (
                      <span style={{ position:'absolute', top:2, right:2, background:'var(--red)', color:'#fff', fontSize:8, fontWeight:600, minWidth:14, height:14, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 2px' }}>
                        {tickets}
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ borderTop:'1px solid var(--border)', padding:'10px' }}>
        <button onClick={toggleTheme} title={dark ? 'Light mode' : 'Dark mode'} style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:7, border:'none', background:'transparent', cursor:'pointer', color:'var(--faint)', fontSize:12, marginBottom:4, justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
          <Icon name={dark ? 'sun' : 'moon'} size={13}/>
          {!sidebarCollapsed && (dark ? 'Light mode' : 'Dark mode')}
        </button>
        <div style={{ display:'flex', alignItems:'center', gap: sidebarCollapsed ? 0 : 9, padding: sidebarCollapsed ? '8px 4px' : '8px 10px', borderRadius:9, background:'var(--bg2)', border:'1px solid var(--border)', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
          <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'var(--accent)', flexShrink:0 }}>
            {user?.initials || '?'}
          </div>
          {!sidebarCollapsed && <>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--text)' }}>{user?.name || '...'}</div>
              <div style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--faint)', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.email}</div>
            </div>
            <button onClick={() => instance.logoutRedirect()} title="Sign out" style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', padding:4, display:'flex', borderRadius:5 }}>
              <Icon name="logout" size={13}/>
            </button>
          </>}
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop — always visible */}
      <div style={{ position:'fixed', top:0, left:0, bottom:0, width: sidebarCollapsed ? 60 : 248, background:'var(--bg)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', zIndex:100, overflowY:'auto', overflowX:'hidden', transition:'width 0.25s cubic-bezier(0.16,1,0.3,1)' }} className="hide-mob">
        {navBody}
      </div>

      {/* Mobile hamburger */}
      <button className="mob-btn" onClick={() => setMobileOpen(o => !o)}>
        <Icon name={mobileOpen ? 'x' : 'menu'} size={16}/>
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div onClick={() => setMobileOpen(false)} style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.4)' }}/>
          <div style={{ position:'fixed', top:0, left:0, bottom:0, width:248, background:'var(--bg)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', zIndex:201, overflowY:'auto' }}>
            {navBody}
          </div>
        </>
      )}
    </>
  )
}
