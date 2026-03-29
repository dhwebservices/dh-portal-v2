import React, { useState, useEffect, useRef, useCallback } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../utils/supabase'

// ─── Section / page map ────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'home', label: 'Home',
    icon: 'grid',
    items: [
      { to: '/dashboard',  icon: 'grid',   label: 'Dashboard',  key: 'dashboard' },
      { to: '/my-profile', icon: 'person', label: 'My Profile', key: 'dashboard' },
      { to: '/search',     icon: 'search', label: 'Search',     key: 'dashboard' },
    ]
  },
  {
    id: 'clients', label: 'Clients',
    icon: 'people',
    items: [
      { to: '/clients',     icon: 'people', label: 'Onboarded Clients', key: 'clients'    },
      { to: '/client-mgmt', icon: 'globe',  label: 'Client Portal',     key: 'clientmgmt' },
      { to: '/support',     icon: 'chat',   label: 'Support',           key: 'support'    },
    ]
  },
  {
    id: 'tasks', label: 'Tasks',
    icon: 'check',
    items: [
      { to: '/tasks',       icon: 'check', label: 'Manage Tasks', key: 'tasks'        },
      { to: '/my-tasks',    icon: 'check', label: 'My Tasks',     key: 'mytasks'      },
      { to: '/schedule',    icon: 'cal',   label: 'Schedule',     key: 'schedule'     },
      { to: '/appointments',icon: 'cal',   label: 'Appointments', key: 'appointments' },
    ]
  },
  {
    id: 'outreach', label: 'Outreach',
    icon: 'phone',
    items: [
      { to: '/outreach',   icon: 'phone',  label: 'Clients Contacted', key: 'outreach'    },
      { to: '/competitor', icon: 'search', label: 'Competitor Lookup', key: 'competitor'  },
      { to: '/proposals',  icon: 'doc',    label: 'Proposal Builder',  key: 'proposals'   },
      { to: '/send-email', icon: 'send',   label: 'Send Email',        key: 'sendemail'   },
    ]
  },
  {
    id: 'web', label: 'Web',
    icon: 'globe',
    items: [
      { to: '/domains',  icon: 'link',  label: 'Domain Checker', key: 'domains'      },
    ]
  },
  {
    id: 'hr', label: 'HR',
    icon: 'star',
    items: [
      { to: '/hr/onboarding', icon: 'star',   label: 'Onboarding', key: 'hr_onboarding' },
      { to: '/hr/leave',      icon: 'cal',    label: 'Leave',      key: 'hr_leave'      },
      { to: '/hr/payslips',   icon: 'wallet', label: 'Payslips',   key: 'hr_payslips'   },
      { to: '/hr/policies',   icon: 'doc',    label: 'Policies',   key: 'hr_policies'   },
      { to: '/hr/timesheets', icon: 'clock',  label: 'Timesheets', key: 'hr_timesheet'  },
      { to: '/hr/profiles',   icon: 'people', label: 'HR Profiles',key: 'hr_profiles'   },
    ]
  },
  {
    id: 'admin', label: 'Admin',
    icon: 'shield',
    items: [
      { to: '/my-staff',        icon: 'people', label: 'My Staff',        key: 'staff'         },
      { to: '/reports',         icon: 'chart',  label: 'Reports',         key: 'reports'       },
      { to: '/mailing-list',    icon: 'mail',   label: 'Mailing List',    key: 'mailinglist'   },
      { to: '/banners',         icon: 'bell',   label: 'Banners',         key: 'banners'       },
      { to: '/email-templates', icon: 'mail',   label: 'Email Templates', key: 'emailtemplates'},
      { to: '/audit',           icon: 'shield', label: 'Audit Log',       key: 'audit'         },
      { to: '/maintenance',     icon: 'wrench', label: 'Maintenance',     key: 'maintenance'   },
      { to: '/settings',        icon: 'gear',   label: 'Settings',        key: 'settings'      },
    ]
  },
]

const ALL_PAGES = SECTIONS.flatMap(s => s.items.map(i => ({ ...i, section: s.label, sectionId: s.id })))

// ─── SVG Icons ────────────────────────────────────────────────────────────
const ICONS = {
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
  menu:    <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>,
  x:       <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
}

function Ico({ name, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {ICONS[name] || ICONS.doc}
    </svg>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────
const css = `
.dh-dock {
  width: 56px; height: 100vh; position: fixed; left: 0; top: 0; z-index: 100;
  background: var(--bg); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; align-items: center;
  padding: 12px 0; gap: 2px; overflow: hidden;
}
.dh-dock-logo {
  width: 32px; height: 32px; margin-bottom: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.dh-dock-sep { width: 24px; height: 1px; background: var(--border); margin: 4px 0; flex-shrink: 0; }
.dh-dock-icon {
  width: 38px; height: 38px; border-radius: 9px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; position: relative;
  color: var(--faint);
  transition: background 0.15s, color 0.15s;
}
.dh-dock-icon:hover { background: var(--bg2); color: var(--text); }
.dh-dock-icon.dh-active { background: var(--accent-soft); color: var(--accent); }
.dh-dock-icon.dh-active::before {
  content: ''; position: absolute; left: -1px; top: 50%; transform: translateY(-50%);
  width: 3px; height: 16px; background: var(--accent); border-radius: 0 2px 2px 0;
}
.dh-tip {
  position: absolute; left: 48px; top: 50%; transform: translateY(-50%);
  background: var(--card); border: 1px solid var(--border2);
  color: var(--text); font-family: var(--font-mono);
  font-size: 11px; padding: 4px 10px; border-radius: 7px;
  white-space: nowrap; pointer-events: none;
  opacity: 0; transition: opacity 0.1s; z-index: 400;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
.dh-dock-icon:hover .dh-tip { opacity: 1; }
.dh-dock-bottom { margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.dh-avatar {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent-soft); border: 1px solid var(--accent-border);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; color: var(--accent); cursor: pointer;
  transition: border-color 0.15s;
}
.dh-avatar:hover { border-color: var(--accent); }

/* Slide panel */
.dh-panel {
  position: fixed; left: 56px; top: 0; height: 100vh; width: 236px;
  background: var(--bg); border-right: 1px solid var(--border);
  transform: translateX(-102%);
  transition: transform 0.2s cubic-bezier(0.16,1,0.3,1);
  z-index: 99; display: flex; flex-direction: column;
  box-shadow: 4px 0 24px rgba(0,0,0,0.08);
}
.dh-panel.dh-open { transform: translateX(0); }
.dh-panel-head { padding: 16px 16px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.dh-panel-title { font-family: var(--font-display); font-size: 16px; font-weight: 400; color: var(--text); }
.dh-panel-nav { flex: 1; overflow-y: auto; padding: 6px 8px; scrollbar-width: none; }
.dh-panel-nav::-webkit-scrollbar { display: none; }
.dh-panel-item {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 10px; border-radius: 7px; margin-bottom: 1px;
  text-decoration: none; color: var(--sub); font-size: 13.5px;
  transition: background 0.1s, color 0.1s; font-weight: 400;
}
.dh-panel-item:hover { background: var(--bg2); color: var(--text); }
.dh-panel-item.dh-page-active { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
.dh-panel-footer { padding: 10px 8px; border-top: 1px solid var(--border); flex-shrink: 0; }
.dh-footer-btn {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: 7px; background: none; border: none;
  cursor: pointer; color: var(--sub); font-size: 12.5px; font-family: inherit;
  transition: background 0.1s, color 0.1s; margin-bottom: 4px;
}
.dh-footer-btn:hover { background: var(--bg2); color: var(--text); }
.dh-user-row {
  display: flex; align-items: center; gap: 9px; padding: 8px 10px;
  border-radius: 9px; background: var(--bg2); border: 1px solid var(--border);
}
.dh-user-init {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent-soft); border: 1px solid var(--accent-border);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; color: var(--accent);
}
.dh-user-name { font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; color: var(--text); }
.dh-user-email { font-family: var(--font-mono); font-size: 10px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; }
.dh-logout { background: none; border: none; color: var(--faint); padding: 4px; border-radius: 5px; display: flex; cursor: pointer; transition: color 0.15s; flex-shrink: 0; }
.dh-logout:hover { color: var(--red); }
.dh-scrim { position: fixed; inset: 0; z-index: 98; }

/* Search overlay */
.dh-search-bg {
  position: fixed; inset: 0; z-index: 500;
  background: rgba(0,0,0,0.4); backdrop-filter: blur(4px);
  display: none; align-items: flex-start; justify-content: center; padding-top: 80px;
}
.dh-search-bg.dh-open { display: flex; animation: dhFade 0.15s ease; }
@keyframes dhFade { from{opacity:0} to{opacity:1} }
.dh-search-box {
  width: 560px; max-width: calc(100vw - 32px);
  background: var(--card); border: 1px solid var(--border2);
  border-radius: 14px; overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
  animation: dhUp 0.18s cubic-bezier(0.16,1,0.3,1);
}
@keyframes dhUp { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
.dh-search-row {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-bottom: 1px solid var(--border);
}
.dh-search-inp {
  flex: 1; background: none; border: none; outline: none;
  font-family: var(--font-body); font-size: 15px; color: var(--text);
  caret-color: var(--accent);
}
.dh-search-inp::placeholder { color: var(--faint); }
.dh-search-esc {
  font-family: var(--font-mono); font-size: 10px; color: var(--faint);
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 5px; padding: 2px 7px; cursor: pointer; flex-shrink: 0;
}
.dh-results { max-height: 380px; overflow-y: auto; padding: 6px; }
.dh-grp-label { font-family: var(--font-mono); font-size: 9px; color: var(--faint); letter-spacing: 0.1em; text-transform: uppercase; padding: 8px 10px 4px; }
.dh-result {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: 8px; cursor: pointer;
  transition: background 0.1s;
}
.dh-result:hover, .dh-result.dh-focused { background: var(--accent-soft); }
.dh-result.dh-focused .dh-result-label { color: var(--accent); }
.dh-result-icon { color: var(--faint); flex-shrink: 0; }
.dh-result.dh-focused .dh-result-icon { color: var(--accent); }
.dh-result-label { font-size: 13.5px; color: var(--text); flex: 1; }
.dh-result-badge {
  font-family: var(--font-mono); font-size: 9px; color: var(--faint);
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 4px; padding: 2px 7px; flex-shrink: 0;
}
.dh-empty { padding: 32px; text-align: center; color: var(--faint); font-size: 13px; }
.dh-search-foot {
  display: flex; align-items: center; gap: 14px;
  padding: 9px 16px; border-top: 1px solid var(--border); background: var(--bg2);
}
.dh-hint { font-family: var(--font-mono); font-size: 9px; color: var(--faint); display: flex; align-items: center; gap: 5px; }
.dh-k { background: var(--card); border: 1px solid var(--border2); border-radius: 4px; padding: 1px 5px; font-size: 9px; }

/* Mobile */
.mob-btn { position: fixed; top: 12px; left: 12px; z-index: 300; width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text); }
@media (min-width: 769px) { .mob-btn { display: none !important; } }
@media (max-width: 768px) { .dh-dock { display: none !important; } .dh-panel { left: 0 !important; } }
`

export default function Sidebar() {
  const { user, can, isOnboarding } = useAuth()
  const { instance } = useMsal()
  const location = useLocation()
  const navigate = useNavigate()
  const [dark, setDark] = useState(() => localStorage.getItem('dh-theme') === 'dark')
  const [activeSection, setActiveSection] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [searchResults, setSearchResults] = useState([])
  const [tickets, setTickets] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const searchRef = useRef(null)

  // Set sidebar width CSS var
  useEffect(() => {
    document.documentElement.style.setProperty('--sw', '56px')
  }, [])

  // Fetch open tickets
  useEffect(() => {
    if (!user?.email) return
    supabase.from('support_tickets').select('*', { count: 'exact', head: true })
      .eq('status', 'open').then(({ count }) => setTickets(count || 0)).catch(() => {})
  }, [user?.email])

  // Close panel on navigate
  useEffect(() => {
    setPanelOpen(false)
    setMobileOpen(false)
  }, [location.pathname])

  // Sync active section from route
  useEffect(() => {
    const match = SECTIONS.find(s =>
      s.items.some(i => i.to === location.pathname || (i.to !== '/' && location.pathname.startsWith(i.to)))
    )
    if (match) setActiveSection(match.id)
  }, [location.pathname])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch() }
      if (e.key === 'Escape') {
        if (searchOpen) closeSearch()
        else if (panelOpen) setPanelOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchOpen, panelOpen])

  const isAllowed = useCallback((key) => {
    if (isOnboarding) return key === 'hr_onboarding'
    return can ? can(key) : true
  }, [can, isOnboarding])

  // Fuzzy search
  const fuzzy = (str, q) => {
    const s = str.toLowerCase(), qL = q.toLowerCase()
    let qi = 0
    for (let i = 0; i < s.length && qi < qL.length; i++) { if (s[i] === qL[qi]) qi++ }
    return qi === qL.length
  }

  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); setFocusedIdx(-1); return }
    setSearchResults(ALL_PAGES.filter(p => isAllowed(p.key) && (fuzzy(p.label, query) || fuzzy(p.section, query))))
    setFocusedIdx(-1)
  }, [query, isAllowed])

  const openSearch = () => {
    setSearchOpen(true); setQuery(''); setSearchResults([]); setFocusedIdx(-1)
    setTimeout(() => searchRef.current?.focus(), 50)
  }
  const closeSearch = () => { setSearchOpen(false); setQuery('') }
  const goTo = (r) => { navigate(r.to); closeSearch() }

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, searchResults.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { if (focusedIdx >= 0 && searchResults[focusedIdx]) goTo(searchResults[focusedIdx]) }
    else if (e.key === 'Escape') closeSearch()
  }

  const togglePanel = (id) => {
    if (panelOpen && activeSection === id) { setPanelOpen(false) }
    else { setActiveSection(id); setPanelOpen(true) }
  }

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('dh-theme', next)
    setDark(!dark)
  }

  const visibleSections = SECTIONS.filter(s => s.items.some(i => isAllowed(i.key)))
  const activeSec = SECTIONS.find(s => s.id === activeSection)
  const grouped = searchResults.reduce((acc, r) => { if (!acc[r.section]) acc[r.section] = []; acc[r.section].push(r); return acc }, {})
  let ri = 0

  const panelContent = (
    <>
      <div className="dh-panel-head">
        <div className="dh-panel-title">{activeSec?.label}</div>
      </div>
      <nav className="dh-panel-nav">
        {activeSec?.items.filter(i => isAllowed(i.key)).map(item => {
          const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))
          return (
            <NavLink key={item.to} to={item.to} className={`dh-panel-item${isActive ? ' dh-page-active' : ''}`}>
              <Ico name={item.icon} size={14} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.to === '/support' && tickets > 0 && (
                <span style={{ background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 600, minWidth: 16, height: 16, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{tickets}</span>
              )}
            </NavLink>
          )
        })}
      </nav>
      <div className="dh-panel-footer">
        <button className="dh-footer-btn" onClick={toggleTheme}>
          <Ico name={dark ? 'sun' : 'moon'} size={13} />
          <span>{dark ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <div className="dh-user-row">
          <div className="dh-user-init">{user?.initials || '?'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dh-user-name">{user?.name || '...'}</div>
            <div className="dh-user-email">{user?.email}</div>
          </div>
          <button className="dh-logout" onClick={() => instance.logoutRedirect()} title="Sign out">
            <Ico name="logout" size={13} />
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      <style>{css}</style>

      {/* Desktop dock */}
      <nav className="dh-dock hide-mob">
        <div className="dh-dock-logo" onClick={() => navigate('/')}>
          <img src="/dh-logo.png" alt="DH" style={{ height: 22, opacity: 0.85 }} />
        </div>
        <div className="dh-dock-sep" />
        {visibleSections.map(sec => (
          <div key={sec.id} className={`dh-dock-icon${activeSection === sec.id ? ' dh-active' : ''}`} onClick={() => togglePanel(sec.id)}>
            <Ico name={sec.icon} size={17} />
            <span className="dh-tip">{sec.label}</span>
          </div>
        ))}
        <div className="dh-dock-bottom">
          <div className="dh-dock-sep" />
          <div className="dh-dock-icon" onClick={openSearch}>
            <Ico name="search" size={17} />
            <span className="dh-tip">Search ⌘K</span>
          </div>
          <div className="dh-avatar" onClick={() => navigate('/my-profile')}>
            {user?.initials || '?'}
          </div>
        </div>
      </nav>

      {/* Scrim */}
      {panelOpen && <div className="dh-scrim" onClick={() => setPanelOpen(false)} />}

      {/* Desktop slide panel */}
      <div className={`dh-panel hide-mob${panelOpen ? ' dh-open' : ''}`}>
        {panelContent}
      </div>

      {/* Mobile hamburger */}
      <button className="mob-btn" onClick={() => setMobileOpen(o => !o)}>
        <Ico name={mobileOpen ? 'x' : 'menu'} size={16} />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)' }} />
          <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 248, background: 'var(--bg)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', zIndex: 201, overflowY: 'auto' }}>
            {/* Mobile: show all sections inline */}
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, color: 'var(--text)' }}>
                DH <span style={{ color: 'var(--accent)' }}>Portal</span>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
              {visibleSections.map(sec => (
                <div key={sec.id} style={{ marginBottom: 6 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)', padding: '6px 10px 3px' }}>{sec.label}</div>
                  {sec.items.filter(i => isAllowed(i.key)).map(item => {
                    const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))
                    return (
                      <NavLink key={item.to} to={item.to} className={`dh-panel-item${isActive ? ' dh-page-active' : ''}`}>
                        <Ico name={item.icon} size={14} />
                        <span>{item.label}</span>
                      </NavLink>
                    )
                  })}
                </div>
              ))}
            </div>
            <div style={{ padding: '10px', borderTop: '1px solid var(--border)' }}>
              <button className="dh-footer-btn" onClick={toggleTheme}>
                <Ico name={dark ? 'sun' : 'moon'} size={13} />
                <span>{dark ? 'Light mode' : 'Dark mode'}</span>
              </button>
              <div className="dh-user-row">
                <div className="dh-user-init">{user?.initials || '?'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dh-user-name">{user?.name || '...'}</div>
                  <div className="dh-user-email">{user?.email}</div>
                </div>
                <button className="dh-logout" onClick={() => instance.logoutRedirect()}>
                  <Ico name="logout" size={13} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Cmd+K search */}
      <div className={`dh-search-bg${searchOpen ? ' dh-open' : ''}`} onClick={closeSearch}>
        <div className="dh-search-box" onClick={e => e.stopPropagation()}>
          <div className="dh-search-row">
            <Ico name="search" size={16} />
            <input ref={searchRef} className="dh-search-inp" placeholder="Search pages and sections..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKey} autoComplete="off" />
            <span className="dh-search-esc" onClick={closeSearch}>ESC</span>
          </div>
          <div className="dh-results">
            {!query.trim() && <div className="dh-empty">Start typing to search</div>}
            {query.trim() && !searchResults.length && <div className="dh-empty">No results for &ldquo;{query}&rdquo;</div>}
            {Object.entries(grouped).map(([grp, items]) => (
              <div key={grp}>
                <div className="dh-grp-label">{grp}</div>
                {items.map(item => {
                  const idx = ri++
                  return (
                    <div key={item.to + idx} className={`dh-result${focusedIdx === idx ? ' dh-focused' : ''}`} onClick={() => goTo(item)} onMouseEnter={() => setFocusedIdx(idx)}>
                      <span className="dh-result-icon"><Ico name={item.icon} size={15} /></span>
                      <span className="dh-result-label">{item.label}</span>
                      <span className="dh-result-badge">{item.section}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="dh-search-foot">
            <span className="dh-hint"><span className="dh-k">↑↓</span> navigate</span>
            <span className="dh-hint"><span className="dh-k">↵</span> open</span>
            <span className="dh-hint"><span className="dh-k">ESC</span> close</span>
          </div>
        </div>
      </div>
    </>
  )
}
