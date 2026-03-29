import { useState, useEffect, useRef, useCallback } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useMsal } from '@azure/msal-react'
import {
  Home, Users, CheckSquare, TrendingUp, Globe, Mail,
  UserCheck, BarChart2, Shield, User, Search, LogOut,
  Sun, Moon, CalendarDays, PhoneCall, MessageSquare,
  Tag, FileText, SendHorizonal, Clock, Wrench,
  ClipboardList, Megaphone, Settings, LayoutDashboard,
  Globe2, Briefcase, Bell
} from 'lucide-react'

const SECTIONS = [
  {
    id: 'home', label: 'Home', icon: Home,
    items: [
      { to: '/',          label: 'Home Screen', icon: Home,            key: 'home' },
      { to: '/dashboard', label: 'Dashboard',   icon: LayoutDashboard, key: 'dashboard' },
    ]
  },
  {
    id: 'clients', label: 'Clients', icon: Users,
    items: [
      { to: '/clients',     label: 'Clients',          icon: Users,         key: 'clients' },
      { to: '/client-mgmt', label: 'Client Portal',    icon: Globe2,        key: 'clientmgmt' },
      { to: '/support',     label: 'Support Tickets',  icon: MessageSquare, key: 'support' },
      { to: '/appointments',label: 'Appointments',     icon: CalendarDays,  key: 'appointments' },
      { to: '/mailing-list',label: 'Mailing List',     icon: Mail,          key: 'mailinglist' },
    ]
  },
  {
    id: 'tasks', label: 'Tasks', icon: CheckSquare,
    items: [
      { to: '/tasks',    label: 'All Tasks', icon: CheckSquare,  key: 'tasks' },
      { to: '/my-tasks', label: 'My Tasks',  icon: CheckSquare,  key: 'mytasks' },
      { to: '/schedule', label: 'Schedule',  icon: CalendarDays, key: 'schedule' },
    ]
  },
  {
    id: 'outreach', label: 'Outreach', icon: TrendingUp,
    items: [
      { to: '/outreach',   label: 'Clients Contacted', icon: PhoneCall, key: 'outreach' },
      { to: '/competitor', label: 'Competitor Lookup',  icon: Tag,       key: 'competitor' },
      { to: '/proposals',  label: 'Proposals',          icon: FileText,  key: 'proposals' },
    ]
  },
  {
    id: 'web', label: 'Web', icon: Globe,
    items: [
      { to: '/web-manager', label: 'Web Manager',  icon: Globe,  key: 'webmanager' },
      { to: '/site-editor', label: 'Site Editor',  icon: Globe2, key: 'siteeditor' },
      { to: '/domains',     label: 'Domain Checker', icon: Globe, key: 'domains' },
    ]
  },
  {
    id: 'comms', label: 'Comms', icon: Mail,
    items: [
      { to: '/send-email',      label: 'Send Email',      icon: SendHorizonal, key: 'sendemail' },
      { to: '/email-templates', label: 'Email Templates', icon: Mail,          key: 'emailtemplates' },
    ]
  },
  {
    id: 'staff', label: 'Staff', icon: Briefcase,
    items: [
      { to: '/staff',    label: 'All Staff', icon: Users,    key: 'staff' },
      { to: '/my-staff', label: 'My Staff',  icon: UserCheck, key: 'mystaff' },
    ]
  },
  {
    id: 'hr', label: 'HR', icon: UserCheck,
    items: [
      { to: '/hr/profiles',   label: 'HR Profiles',   icon: Users,        key: 'hr_profiles' },
      { to: '/hr/timesheets', label: 'Timesheets',    icon: Clock,        key: 'hr_timesheet' },
      { to: '/hr/leave',      label: 'Leave',         icon: CalendarDays, key: 'hr_leave' },
      { to: '/hr/payslips',   label: 'Payslips',      icon: FileText,     key: 'hr_payslips' },
      { to: '/hr/policies',   label: 'Policies',      icon: FileText,     key: 'hr_policies' },
      { to: '/hr/onboarding', label: 'HR Onboarding', icon: Users,        key: 'hr_onboarding' },
    ]
  },
  {
    id: 'reports', label: 'Reports', icon: BarChart2,
    items: [
      { to: '/reports', label: 'Reports',   icon: BarChart2,     key: 'reports' },
      { to: '/audit',   label: 'Audit Log', icon: ClipboardList, key: 'audit' },
    ]
  },
  {
    id: 'admin', label: 'Admin', icon: Shield,
    items: [
      { to: '/admin',       label: 'Admin',       icon: Shield,    key: 'admin' },
      { to: '/banners',     label: 'Banners',     icon: Megaphone, key: 'banners' },
      { to: '/maintenance', label: 'Maintenance', icon: Wrench,    key: 'maintenance' },
      { to: '/settings',    label: 'Settings',    icon: Settings,  key: 'settings' },
    ]
  },
  {
    id: 'account', label: 'Account', icon: User,
    items: [
      { to: '/my-profile', label: 'My Profile', icon: User,     key: 'profile' },
      { to: '/settings',   label: 'Settings',   icon: Settings, key: 'settings' },
    ]
  },
]

const ALL_PAGES = SECTIONS.flatMap(s => s.items.map(i => ({ ...i, section: s.label, sectionId: s.id })))

const css = `
.dh-dock {
  width: 56px; min-width: 56px; height: 100vh;
  position: fixed; left: 0; top: 0; z-index: 300;
  background: var(--bg2);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column; align-items: center;
  padding: 10px 0; gap: 1px; overflow: hidden;
}
.dh-dock-logo {
  width: 36px; height: 36px; margin-bottom: 6px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.dh-dock-sep { width: 28px; height: 1px; background: var(--border); margin: 4px 0; flex-shrink: 0; }
.dh-dock-icon {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; position: relative;
  transition: background 0.15s, color 0.15s, transform 0.15s;
  color: var(--faint); flex-shrink: 0;
}
.dh-dock-icon:hover { background: var(--bg3); color: var(--text); transform: scale(1.06); }
.dh-dock-icon.dh-active { background: var(--gold-bg); color: var(--gold); }
.dh-dock-icon.dh-active::before {
  content: ''; position: absolute; left: -1px; top: 50%; transform: translateY(-50%);
  width: 3px; height: 18px; background: var(--gold); border-radius: 0 3px 3px 0;
}
.dh-tooltip {
  position: absolute; left: 50px; top: 50%; transform: translateY(-50%);
  background: var(--card); border: 1px solid var(--border2);
  color: var(--gold); font-family: var(--font-mono);
  font-size: 10px; padding: 4px 10px; border-radius: 6px;
  white-space: nowrap; pointer-events: none;
  opacity: 0; transition: opacity 0.12s; z-index: 400;
  letter-spacing: 0.06em; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}
.dh-dock-icon:hover .dh-tooltip { opacity: 1; }
.dh-dock-bottom { margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 6px; padding-top: 8px; }
.dh-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--gold-bg); border: 1.5px solid var(--gold-border);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display); font-size: 13px; font-weight: 600;
  color: var(--gold); cursor: pointer; transition: border-color 0.15s;
}
.dh-avatar:hover { border-color: var(--gold); }
.dh-panel {
  position: fixed; left: 56px; top: 0; height: 100vh;
  width: 240px; background: var(--bg2);
  border-right: 1px solid var(--border2);
  transform: translateX(-110%); opacity: 0;
  transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease;
  z-index: 299; display: flex; flex-direction: column;
  box-shadow: 6px 0 32px rgba(0,0,0,0.35);
}
.dh-panel.dh-open { transform: translateX(0); opacity: 1; }
.dh-panel-head { padding: 18px 16px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.dh-panel-title { font-family: var(--font-display); font-size: 17px; font-weight: 500; color: var(--gold); letter-spacing: 0.01em; }
.dh-panel-nav { flex: 1; overflow-y: auto; padding: 6px 8px; scrollbar-width: none; }
.dh-panel-nav::-webkit-scrollbar { display: none; }
.dh-panel-item {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 10px; border-radius: 7px; margin-bottom: 1px;
  cursor: pointer; color: var(--sub);
  font-size: 13px; transition: background 0.12s, color 0.12s;
  font-weight: 400; text-decoration: none;
}
.dh-panel-item:hover { background: var(--bg3); color: var(--text); }
.dh-panel-item.dh-page-active { background: var(--gold-bg); color: var(--gold); font-weight: 500; border-left: 2px solid var(--gold); padding-left: 8px; }
.dh-panel-footer { padding: 10px 8px; border-top: 1px solid var(--border); flex-shrink: 0; }
.dh-panel-footer-btn {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: 6px;
  background: transparent; border: none; cursor: pointer;
  color: var(--sub); font-size: 12px; font-family: inherit;
  transition: background 0.12s, color 0.12s; margin-bottom: 4px;
}
.dh-panel-footer-btn:hover { background: var(--bg3); color: var(--text); }
.dh-user-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: var(--bg3); border: 1px solid var(--border); }
.dh-user-init { width: 28px; height: 28px; border-radius: 50%; background: var(--gold-bg); border: 1px solid var(--gold-border); display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-size: 12px; font-weight: 600; color: var(--gold); flex-shrink: 0; }
.dh-user-name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.dh-user-email { font-family: var(--font-mono); font-size: 9px; color: var(--faint); letter-spacing: 0.04em; overflow: hidden; text-overflow: ellipsis; }
.dh-logout-btn { background: transparent; border: none; color: var(--faint); padding: 4px; border-radius: 4px; display: flex; cursor: pointer; transition: color 0.15s; flex-shrink: 0; }
.dh-logout-btn:hover { color: var(--red); }
.dh-panel-scrim { position: fixed; inset: 0; z-index: 298; background: transparent; }
.dh-search-backdrop { position: fixed; inset: 0; z-index: 500; background: rgba(15,13,10,0.75); backdrop-filter: blur(6px); display: none; align-items: flex-start; justify-content: center; padding-top: 72px; }
.dh-search-backdrop.dh-open { display: flex; animation: dhFadeIn 0.15s ease; }
@keyframes dhFadeIn { from{opacity:0} to{opacity:1} }
.dh-search-modal { width: 580px; max-width: calc(100vw - 32px); background: var(--card); border: 1px solid var(--border2); border-radius: 14px; overflow: hidden; box-shadow: 0 28px 72px rgba(0,0,0,0.6); animation: dhSlideDown 0.18s cubic-bezier(0.16,1,0.3,1); }
@keyframes dhSlideDown { from{opacity:0;transform:translateY(-14px)} to{opacity:1;transform:translateY(0)} }
.dh-search-input-row { display: flex; align-items: center; gap: 12px; padding: 15px 18px; border-bottom: 1px solid var(--border); }
.dh-search-input { flex: 1; background: none; border: none; outline: none; font-family: var(--font-body); font-size: 15px; color: var(--text); caret-color: var(--gold); }
.dh-search-input::placeholder { color: var(--faint); }
.dh-search-esc { font-family: var(--font-mono); font-size: 10px; color: var(--faint); background: var(--bg2); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; cursor: pointer; flex-shrink: 0; }
.dh-results { max-height: 400px; overflow-y: auto; padding: 6px; scrollbar-width: thin; }
.dh-results-group { font-family: var(--font-mono); font-size: 9px; color: var(--faint); letter-spacing: 0.1em; text-transform: uppercase; padding: 8px 10px 4px; }
.dh-result-item { display: flex; align-items: center; gap: 11px; padding: 9px 12px; border-radius: 8px; cursor: pointer; transition: background 0.1s; }
.dh-result-item:hover, .dh-result-item.dh-focused { background: var(--gold-bg); }
.dh-result-item.dh-focused .dh-result-label { color: var(--gold); }
.dh-result-icon { color: var(--faint); flex-shrink: 0; }
.dh-result-item.dh-focused .dh-result-icon { color: var(--gold); }
.dh-result-label { font-size: 13.5px; color: var(--text); flex: 1; }
.dh-result-badge { font-family: var(--font-mono); font-size: 9px; color: var(--faint); background: var(--bg2); border: 1px solid var(--border); border-radius: 4px; padding: 2px 7px; flex-shrink: 0; }
.dh-search-empty { padding: 32px; text-align: center; color: var(--faint); font-size: 13px; }
.dh-search-footer { display: flex; align-items: center; gap: 14px; padding: 9px 18px; border-top: 1px solid var(--border); background: var(--bg2); }
.dh-search-hint { font-family: var(--font-mono); font-size: 9px; color: var(--faint); display: flex; align-items: center; gap: 5px; }
.dh-key { background: var(--card); border: 1px solid var(--border2); border-radius: 3px; padding: 1px 5px; font-size: 9px; }
.dh-hamburger { position: fixed; top: 12px; left: 12px; z-index: 400; width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); display: flex; flex-direction: column; gap: 5px; padding: 9px 8px; align-items: center; justify-content: center; cursor: pointer; }
.dh-ham-line { display: block; width: 16px; height: 1.5px; background: var(--text); border-radius: 2px; transition: all 0.25s; }
`

export default function Sidebar() {
  const { user, can } = useAuth()
  const { instance } = useMsal()
  const navigate = useNavigate()
  const location = useLocation()
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark')
  const [activeSection, setActiveSection] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [searchResults, setSearchResults] = useState([])
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  const [mobileOpen, setMobileOpen] = useState(false)
  const searchInputRef = useRef(null)

  const isAllowed = useCallback((key) => {
    if (!can) return true
    return can(key)
  }, [can])

  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => {
    setPanelOpen(false)
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const match = SECTIONS.find(s =>
      s.items.some(i => i.to === location.pathname || (i.to !== '/' && location.pathname.startsWith(i.to)))
    )
    if (match) setActiveSection(match.id)
  }, [location.pathname])

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

  const fuzzy = (str, q) => {
    const s = str.toLowerCase(), qL = q.toLowerCase()
    let qi = 0
    for (let i = 0; i < s.length && qi < qL.length; i++) { if (s[i] === qL[qi]) qi++ }
    return qi === qL.length
  }

  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); setFocusedIdx(-1); return }
    const results = ALL_PAGES
      .filter(p => isAllowed(p.key))
      .filter(p => fuzzy(p.label, query) || fuzzy(p.section, query))
    setSearchResults(results)
    setFocusedIdx(-1)
  }, [query, isAllowed])

  const openSearch = () => {
    setSearchOpen(true); setQuery(''); setSearchResults([]); setFocusedIdx(-1)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }
  const closeSearch = () => { setSearchOpen(false); setQuery('') }
  const goToResult = (r) => { navigate(r.to); closeSearch() }

  const handleSearchKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, searchResults.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { if (focusedIdx >= 0 && searchResults[focusedIdx]) goToResult(searchResults[focusedIdx]) }
    else if (e.key === 'Escape') closeSearch()
  }

  const togglePanel = (sectionId) => {
    if (panelOpen && activeSection === sectionId) { setPanelOpen(false) }
    else { setActiveSection(sectionId); setPanelOpen(true) }
  }

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    setDark(!dark)
  }

  const visibleSections = SECTIONS.filter(s => s.items.some(i => isAllowed(i.key)))
  const activeSecData = SECTIONS.find(s => s.id === activeSection)

  const groupedResults = searchResults.reduce((acc, r) => {
    if (!acc[r.section]) acc[r.section] = []
    acc[r.section].push(r)
    return acc
  }, {})

  let resultIndex = 0
  const dockVisible = mobile ? mobileOpen : true

  return (
    <>
      <style>{css}</style>

      {mobile && (
        <button className="dh-hamburger" onClick={() => setMobileOpen(o => !o)}>
          <span className="dh-ham-line" style={{ transform: mobileOpen ? 'rotate(45deg) translate(4px,4px)' : 'none' }} />
          <span className="dh-ham-line" style={{ opacity: mobileOpen ? 0 : 1 }} />
          <span className="dh-ham-line" style={{ transform: mobileOpen ? 'rotate(-45deg) translate(4px,-4px)' : 'none' }} />
        </button>
      )}

      {dockVisible && (
        <nav className="dh-dock">
          <div className="dh-dock-logo">
            <img src="/dh-logo.png" alt="DH" style={{ height: 24, filter: dark ? 'brightness(0) invert(1) opacity(0.85)' : 'none' }} />
          </div>
          <div className="dh-dock-sep" />
          {visibleSections.map(sec => {
            const Icon = sec.icon
            const isActive = activeSection === sec.id
            return (
              <div key={sec.id} className={`dh-dock-icon${isActive ? ' dh-active' : ''}`} onClick={() => togglePanel(sec.id)}>
                <Icon size={18} strokeWidth={1.8} />
                <span className="dh-tooltip">{sec.label}</span>
              </div>
            )
          })}
          <div className="dh-dock-bottom">
            <div className="dh-dock-sep" />
            <div className="dh-dock-icon" onClick={openSearch}>
              <Search size={18} strokeWidth={1.8} />
              <span className="dh-tooltip">Search ⌘K</span>
            </div>
            <div className="dh-avatar" onClick={() => navigate('/my-profile')}>
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
          </div>
        </nav>
      )}

      {panelOpen && <div className="dh-panel-scrim" onClick={() => setPanelOpen(false)} />}

      <div className={`dh-panel${panelOpen ? ' dh-open' : ''}`}>
        <div className="dh-panel-head">
          <div className="dh-panel-title">{activeSecData?.label}</div>
        </div>
        <nav className="dh-panel-nav">
          {activeSecData?.items.filter(i => isAllowed(i.key)).map(item => {
            const Icon = item.icon
            const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))
            return (
              <NavLink key={item.to} to={item.to} className={`dh-panel-item${isActive ? ' dh-page-active' : ''}`}>
                <Icon size={14} strokeWidth={1.8} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
        <div className="dh-panel-footer">
          <button className="dh-panel-footer-btn" onClick={toggleTheme}>
            {dark ? <Sun size={13} strokeWidth={1.8} /> : <Moon size={13} strokeWidth={1.8} />}
            <span>{dark ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <div className="dh-user-row">
            <div className="dh-user-init">{user?.name?.[0]?.toUpperCase() || 'U'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="dh-user-name">{user?.name}</div>
              <div className="dh-user-email">{user?.email}</div>
            </div>
            <button className="dh-logout-btn" onClick={() => instance.logoutRedirect()} title="Sign out">
              <LogOut size={13} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </div>

      <div className={`dh-search-backdrop${searchOpen ? ' dh-open' : ''}`} onClick={closeSearch}>
        <div className="dh-search-modal" onClick={e => e.stopPropagation()}>
          <div className="dh-search-input-row">
            <Search size={17} strokeWidth={1.8} style={{ color: 'var(--gold)', flexShrink: 0 }} />
            <input ref={searchInputRef} className="dh-search-input" placeholder="Search pages and sections..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleSearchKey} autoComplete="off" />
            <span className="dh-search-esc" onClick={closeSearch}>ESC</span>
          </div>
          <div className="dh-results">
            {!query.trim() && <div className="dh-search-empty">Start typing to search pages and sections</div>}
            {query.trim() && searchResults.length === 0 && <div className="dh-search-empty">No results for &ldquo;{query}&rdquo;</div>}
            {Object.entries(groupedResults).map(([group, items]) => (
              <div key={group}>
                <div className="dh-results-group">{group}</div>
                {items.map(item => {
                  const Icon = item.icon
                  const idx = resultIndex++
                  return (
                    <div key={item.to + idx} className={`dh-result-item${focusedIdx === idx ? ' dh-focused' : ''}`} onClick={() => goToResult(item)} onMouseEnter={() => setFocusedIdx(idx)}>
                      <span className="dh-result-icon"><Icon size={15} strokeWidth={1.8} /></span>
                      <span className="dh-result-label">{item.label}</span>
                      <span className="dh-result-badge">{item.section}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="dh-search-footer">
            <span className="dh-search-hint"><span className="dh-key">↑↓</span> navigate</span>
            <span className="dh-search-hint"><span className="dh-key">↵</span> open</span>
            <span className="dh-search-hint"><span className="dh-key">ESC</span> close</span>
          </div>
        </div>
      </div>
    </>
  )
}
