import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useMsal } from '@azure/msal-react'
import { supabase } from '../utils/supabase'
import { usePortalTheme } from '../hooks/usePortalTheme'
import { Home, LayoutDashboard, Users, Globe2, PhoneCall, MessageSquare, CheckSquare, CalendarDays, UserPlus, Wallet, FileCheck, Clock, Wrench, BarChart2, Megaphone, Mail, ClipboardList, Shield, Settings, Tag, FileText, Share2, SendHorizonal, LogOut, ChevronDown, Sun, Moon } from 'lucide-react'

const GROUPS = [
  { label: null, items: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', key: 'dashboard' },
  ]},
  { label: 'Business', items: [
    { to: '/outreach',     icon: PhoneCall,     label: 'Clients Contacted',  key: 'outreach'      },
    { to: '/clients',      icon: Users,         label: 'Onboarded Clients',  key: 'clients'       },
    { to: '/client-mgmt',  icon: Globe2,        label: 'Client Portal',      key: 'clientmgmt'    },
    { to: '/support',      icon: MessageSquare, label: 'Support',            key: 'support'       },
    { to: '/competitor',   icon: Tag,           label: 'Competitor Lookup',  key: 'competitor'    },
    { to: '/domains',      icon: Globe2,        label: 'Domain Checker',     key: 'domains'       },
    { to: '/proposals',    icon: FileText,      label: 'Proposal Builder',   key: 'proposals'     },
    { to: '/social',       icon: Share2,        label: 'Social Media',       key: 'social'        },
    { to: '/send-email',   icon: SendHorizonal, label: 'Send Email',         key: 'sendemail'     },
  ]},
  { label: 'Tasks', items: [
    { to: '/tasks',    icon: CheckSquare,  label: 'Manage Tasks', key: 'tasks'    },
    { to: '/my-tasks', icon: CheckSquare,  label: 'My Tasks',     key: 'mytasks'  },
    { to: '/schedule', icon: CalendarDays, label: 'Schedule',     key: 'schedule' },
  ]},
  { label: 'HR', items: [
    { to: '/hr/onboarding', icon: UserPlus,    label: 'Onboarding', key: 'hr_onboarding' },
    { to: '/hr/leave',      icon: CalendarDays,label: 'Leave',      key: 'hr_leave'      },
    { to: '/hr/payslips',   icon: Wallet,      label: 'Payslips',   key: 'hr_payslips'   },
    { to: '/hr/policies',   icon: FileCheck,   label: 'Policies',   key: 'hr_policies'   },
    { to: '/hr/timesheet',  icon: Clock,       label: 'Timesheet',  key: 'hr_timesheet'  },
  ]},
  { label: 'Admin', items: [
    { to: '/website-cms',    icon: Globe2,        label: 'Website Editor',  key: 'admin'          },
    { to: '/staff-accounts', icon: Users,         label: 'Staff Accounts',  key: 'admin'          },
    { to: '/reports',        icon: BarChart2,     label: 'Reports',         key: 'reports'        },
    { to: '/banners',        icon: Megaphone,     label: 'Banners',         key: 'banners'        },
    { to: '/email-templates',icon: Mail,          label: 'Email Templates', key: 'emailtemplates' },
    { to: '/audit',          icon: ClipboardList, label: 'Audit Log',       key: 'audit'          },
    { to: '/maintenance',    icon: Wrench,        label: 'Maintenance',     key: 'maintenance'    },
    { to: '/settings',       icon: Settings,      label: 'Settings',        key: 'settings'       },
  ]},
]

const ALL = GROUPS.flatMap(g => g.items)

function Group({ label, children, open, onToggle }) {
  if (!label) return <div style={{ marginBottom: 4 }}>{children}</div>
  return (
    <div style={{ marginBottom: 2 }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px 3px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)' }}>
        {label}
        <ChevronDown size={10} style={{ transition: 'transform 0.2s', transform: open ? 'rotate(0)' : 'rotate(-90deg)', color: 'var(--faint)' }} />
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

export default function Sidebar() {
  const { user } = useAuth()
  const { instance } = useMsal()
  const navigate = useNavigate()
  const location = useLocation()
  const { dark, toggle } = usePortalTheme()
  const [allowed, setAllowed] = useState(ALL)
  const [openGroups, setOpenGroups] = useState({ Business: true, Tasks: true, HR: true, Admin: true })
  const [tickets, setTickets] = useState(0)
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  useEffect(() => setMobileOpen(false), [location])

  useEffect(() => {
    if (!user?.email) return
    const load = async () => {
      const isAdmin = user.roles?.includes('Administrator')
      if (isAdmin) { setAllowed(ALL); return }
      const { data } = await supabase.from('user_permissions').select('user_email,permissions,onboarding')
      const row = (data||[]).find(r => r.user_email?.toLowerCase() === user.email?.toLowerCase())
      if (row?.onboarding) { setAllowed([]); return }
      const p = row?.permissions
      setAllowed(p && Object.keys(p).length ? ALL.filter(n => p[n.key]) : ALL)
    }
    load()
    supabase.from('support_tickets').select('id', { count: 'exact' }).eq('status','open').then(({ count }) => setTickets(count||0))
  }, [user])

  const toggleGroup = (label) => setOpenGroups(p => ({ ...p, [label]: !p[label] }))

  const nav = (
    <div style={{ width: 'var(--sidebar-w)', height: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 200, background: 'var(--bg2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', transform: mobile ? (mobileOpen ? 'translateX(0)' : 'translateX(-100%)') : 'translateX(0)', transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1)' }}>
      {/* Logo row */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <img src="/dh-logo.png" alt="DH" style={{ height: 22, filter: dark ? 'brightness(0) invert(1) opacity(0.85)' : 'none', transition: 'filter 0.3s' }} />
        <button onClick={() => navigate('/')} title="Home" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--faint)', transition: 'all 0.15s' }}
          onMouseOver={e => { e.currentTarget.style.borderColor='var(--gold)'; e.currentTarget.style.color='var(--gold)' }}
          onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--faint)' }}
        ><Home size={11} /></button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px', scrollbarWidth: 'none' }}>
        <style>{`nav::-webkit-scrollbar{display:none}`}</style>
        {GROUPS.map(g => {
          const items = g.items.filter(item => allowed.some(a => a.key === item.key && a.to === item.to))
          if (!items.length) return null
          return (
            <Group key={g.label||'top'} label={g.label} open={g.label ? openGroups[g.label] : true} onToggle={() => g.label && toggleGroup(g.label)}>
              {items.map(({ to, icon: Icon, label, key }) => (
                <NavLink key={to} to={to} style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', borderRadius: 6, marginBottom: 1,
                  fontSize: 13, fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--text)' : 'var(--sub)',
                  background: isActive ? 'var(--card)' : 'transparent',
                  borderLeft: `2px solid ${isActive ? 'var(--gold)' : 'transparent'}`,
                  transition: 'all 0.12s', textDecoration: 'none',
                })}
                  onMouseOver={e => { if (!e.currentTarget.classList.contains('active')) { e.currentTarget.style.background='var(--bg3)'; e.currentTarget.style.color='var(--text)' }}}
                  onMouseOut={e => { if (!e.currentTarget.classList.contains('active')) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--sub)' }}}
                >
                  <Icon size={13} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  {to === '/support' && tickets > 0 && <span style={{ background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 700, minWidth: 15, height: 15, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{tickets}</span>}
                </NavLink>
              ))}
            </Group>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: 10, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={toggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--sub)', fontSize: 12, marginBottom: 4, transition: 'all 0.15s' }}
          onMouseOver={e => { e.currentTarget.style.background='var(--bg3)'; e.currentTarget.style.color='var(--text)' }}
          onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--sub)' }}
        >
          {dark ? <Sun size={12} /> : <Moon size={12} />}
          <span>{dark ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--gold)', flexShrink: 0 }}>{user?.name?.[0]?.toUpperCase()||'U'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--faint)', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
          </div>
          <button onClick={() => instance.logoutRedirect()} title="Sign out" style={{ background: 'transparent', border: 'none', color: 'var(--faint)', padding: 4, borderRadius: 4, display: 'flex', cursor: 'pointer', transition: 'color 0.15s' }}
            onMouseOver={e => e.currentTarget.style.color='var(--red)'}
            onMouseOut={e => e.currentTarget.style.color='var(--faint)'}
          ><LogOut size={12} /></button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {nav}
      {mobile && (
        <button onClick={() => setMobileOpen(o => !o)} style={{ position: 'fixed', top: 14, left: 14, zIndex: 300, width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', display: 'flex', flexDirection: 'column', gap: 5, padding: 8, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          {[0,1,2].map(i => <span key={i} style={{ display: 'block', width: 16, height: 1.5, background: 'var(--text)', borderRadius: 2, transition: 'all 0.25s', transform: mobileOpen?(i===0?'rotate(45deg) translate(4px,4px)':i===2?'rotate(-45deg) translate(4px,-4px)':'none'):'none', opacity: mobileOpen&&i===1?0:1 }} />)}
        </button>
      )}
      {mobile && mobileOpen && <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }} />}
    </>
  )
}
