import { useState, useEffect, useMemo } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useMsal } from '@azure/msal-react'
import { supabase } from '../utils/supabase'
import { usePortalTheme } from '../hooks/usePortalTheme'
import {
  Home,
  LayoutDashboard,
  Users,
  Globe2,
  PhoneCall,
  MessageSquare,
  CheckSquare,
  CalendarDays,
  UserPlus,
  Wallet,
  FileCheck,
  Clock,
  Wrench,
  BarChart2,
  Megaphone,
  Mail,
  ClipboardList,
  Settings,
  Tag,
  FileText,
  Share2,
  SendHorizonal,
  LogOut,
  Sun,
  Moon,
  Sparkles,
  BriefcaseBusiness,
  ShieldCheck,
  Layers3,
  ArrowRight,
} from 'lucide-react'

const SECTIONS = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    eyebrow: 'Workspace',
    title: 'Control centre',
    blurb: 'A calmer starting point with priorities, queues, and shortcuts.',
    fallback: '/dashboard',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Overview', key: 'dashboard', accent: 'var(--gold)' },
      { to: '/my-tasks', icon: CheckSquare, label: 'My Tasks', key: 'mytasks', accent: 'var(--amber)' },
      { to: '/schedule', icon: CalendarDays, label: 'Schedule', key: 'schedule', accent: 'var(--blue)' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    icon: Users,
    eyebrow: 'People Ops',
    title: 'Staff and HR',
    blurb: 'Profiles, onboarding, leave, time, payroll, and day-to-day coordination.',
    fallback: '/hr/profiles',
    items: [
      { to: '/hr/profiles', icon: Users, label: 'Profiles', key: 'hr_profiles', accent: 'var(--gold)' },
      { to: '/hr/onboarding', icon: UserPlus, label: 'Onboarding', key: 'hr_onboarding', accent: 'var(--green)' },
      { to: '/hr/leave', icon: CalendarDays, label: 'Leave', key: 'hr_leave', accent: 'var(--amber)' },
      { to: '/hr/timesheet', icon: Clock, label: 'Timesheets', key: 'hr_timesheet', accent: 'var(--blue)' },
      { to: '/hr/payslips', icon: Wallet, label: 'Payslips', key: 'hr_payslips', accent: 'var(--purple)' },
      { to: '/hr/policies', icon: FileCheck, label: 'Policies', key: 'hr_policies', accent: 'var(--sub)' },
    ],
  },
  {
    id: 'clients',
    label: 'Clients',
    icon: BriefcaseBusiness,
    eyebrow: 'Commercial',
    title: 'Client pipeline',
    blurb: 'Outreach, onboarding, support, proposals, and service delivery.',
    fallback: '/clients',
    items: [
      { to: '/clients', icon: Users, label: 'Accounts', key: 'clients', accent: 'var(--gold)' },
      { to: '/outreach', icon: PhoneCall, label: 'Outreach', key: 'outreach', accent: 'var(--green)' },
      { to: '/support', icon: MessageSquare, label: 'Support', key: 'support', accent: 'var(--red)' },
      { to: '/proposals', icon: FileText, label: 'Proposals', key: 'proposals', accent: 'var(--blue)' },
      { to: '/domains', icon: Globe2, label: 'Domains', key: 'domains', accent: 'var(--amber)' },
      { to: '/competitor', icon: Tag, label: 'Competitors', key: 'competitor', accent: 'var(--purple)' },
      { to: '/social', icon: Share2, label: 'Social', key: 'social', accent: 'var(--sub)' },
      { to: '/send-email', icon: SendHorizonal, label: 'Email', key: 'sendemail', accent: 'var(--sub)' },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    icon: Layers3,
    eyebrow: 'Publishing',
    title: 'Sites and messaging',
    blurb: 'Website editing, banners, templates, and client-facing content.',
    fallback: '/website-cms',
    items: [
      { to: '/website-cms', icon: Globe2, label: 'Website Editor', key: 'admin', accent: 'var(--gold)' },
      { to: '/banners', icon: Megaphone, label: 'Banners', key: 'banners', accent: 'var(--amber)' },
      { to: '/email-templates', icon: Mail, label: 'Templates', key: 'emailtemplates', accent: 'var(--blue)' },
      { to: '/client-mgmt', icon: Globe2, label: 'Client Portal', key: 'clientmgmt', accent: 'var(--sub)' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: ShieldCheck,
    eyebrow: 'Platform',
    title: 'Control and governance',
    blurb: 'Permissions, reports, maintenance, logging, and configuration.',
    fallback: '/admin',
    items: [
      { to: '/admin', icon: ShieldCheck, label: 'Permissions', key: 'admin', accent: 'var(--gold)' },
      { to: '/staff-accounts', icon: Users, label: 'Staff Accounts', key: 'admin', accent: 'var(--green)' },
      { to: '/reports', icon: BarChart2, label: 'Reports', key: 'reports', accent: 'var(--blue)' },
      { to: '/audit', icon: ClipboardList, label: 'Audit Log', key: 'audit', accent: 'var(--amber)' },
      { to: '/maintenance', icon: Wrench, label: 'Maintenance', key: 'maintenance', accent: 'var(--red)' },
      { to: '/settings', icon: Settings, label: 'Settings', key: 'settings', accent: 'var(--sub)' },
    ],
  },
]

export default function Sidebar() {
  const { user } = useAuth()
  const { instance } = useMsal()
  const navigate = useNavigate()
  const location = useLocation()
  const { dark, toggle } = usePortalTheme()
  const [allowedKeys, setAllowedKeys] = useState(new Set())
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
      const allKeys = new Set(SECTIONS.flatMap(section => section.items.map(item => item.key)))
      if (user.roles?.includes('Administrator')) {
        setAllowedKeys(allKeys)
        return
      }

      const { data } = await supabase.from('user_permissions').select('user_email,permissions,onboarding')
      const row = (data || []).find(r => r.user_email?.toLowerCase() === user.email?.toLowerCase())
      if (row?.onboarding) {
        setAllowedKeys(new Set())
        return
      }

      const perms = row?.permissions
      if (perms && Object.keys(perms).length) {
        setAllowedKeys(new Set(Object.entries(perms).filter(([, value]) => value).map(([key]) => key)))
      } else {
        setAllowedKeys(allKeys)
      }
    }

    load()
    supabase.from('support_tickets').select('id', { count: 'exact' }).eq('status', 'open').then(({ count }) => setTickets(count || 0))
  }, [user])

  const visibleSections = useMemo(() => {
    return SECTIONS
      .map(section => ({
        ...section,
        items: section.items.filter(item => allowedKeys.has(item.key)),
      }))
      .filter(section => section.items.length > 0)
  }, [allowedKeys])

  const currentSection = useMemo(() => {
    return visibleSections.find(section =>
      section.items.some(item => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))
    ) || visibleSections[0]
  }, [location.pathname, visibleSections])

  const nav = (
    <div
      style={{
        width: 'var(--sidebar-w)',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 200,
        background: 'linear-gradient(180deg, var(--bg2) 0%, var(--bg) 100%)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transform: mobile ? (mobileOpen ? 'translateX(0)' : 'translateX(-100%)') : 'translateX(0)',
        transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      <div style={{ padding: '18px 18px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <img src="/dh-logo.png" alt="DH" style={{ height: 24, filter: dark ? 'brightness(0) invert(1) opacity(0.85)' : 'none', transition: 'filter 0.3s' }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)', marginTop: 8 }}>Staff Portal</div>
        </div>
        <button
          onClick={() => navigate('/')}
          title="Portal Home"
          style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--sub)', transition: 'all 0.15s' }}
          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)' }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--sub)' }}
        >
          <Sparkles size={13} />
        </button>
      </div>

      <div style={{ padding: '14px 12px 0', display: 'flex', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {visibleSections.map(section => {
          const Icon = section.icon
          const isActive = currentSection?.id === section.id
          return (
            <button
              key={section.id}
              onClick={() => navigate(section.fallback)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: 'calc(50% - 4px)',
                padding: '10px 12px',
                borderRadius: 12,
                border: `1px solid ${isActive ? 'var(--gold-border)' : 'var(--border)'}`,
                background: isActive ? 'var(--card)' : 'transparent',
                color: isActive ? 'var(--text)' : 'var(--sub)',
                boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.18s',
              }}
            >
              <Icon size={14} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{section.label}</span>
            </button>
          )
        })}
      </div>

      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(180deg, rgba(184,150,12,0.05) 0%, rgba(184,150,12,0) 100%)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10 }}>
          {currentSection?.eyebrow || 'Workspace'}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, lineHeight: 0.95, letterSpacing: '-0.03em', marginBottom: 8 }}>
          {currentSection?.title || 'Portal'}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.6 }}>
          {currentSection?.blurb || 'Your current tools and navigation live here.'}
        </p>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', scrollbarWidth: 'none' }}>
        <style>{`nav::-webkit-scrollbar{display:none}`}</style>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10, padding: '0 6px' }}>
          Current tools
        </div>
        {(currentSection?.items || []).map(({ to, icon: Icon, label, accent }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 12,
              marginBottom: 6,
              fontSize: 13,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? 'var(--text)' : 'var(--sub)',
              background: isActive ? 'var(--card)' : 'transparent',
              border: `1px solid ${isActive ? 'var(--border)' : 'transparent'}`,
              boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.12s',
              textDecoration: 'none',
            })}
            onMouseOver={e => {
              if (!e.currentTarget.classList.contains('active')) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.4)'
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.color = 'var(--text)'
              }
            }}
            onMouseOut={e => {
              if (!e.currentTarget.classList.contains('active')) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
                e.currentTarget.style.color = 'var(--sub)'
              }
            }}
          >
            <div style={{ width: 30, height: 30, borderRadius: 10, background: `${accent}18`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={14} strokeWidth={1.9} />
            </div>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            {to === '/support' && tickets > 0 && <span style={{ background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 700, minWidth: 16, height: 16, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{tickets}</span>}
          </NavLink>
        ))}

        <div style={{ marginTop: 20, padding: '14px 14px 12px', borderRadius: 16, background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10 }}>Quick jump</div>
          {[
            { label: 'Portal Home', to: '/' },
            { label: 'My Profile', to: '/my-profile' },
            { label: 'Settings', to: '/settings' },
          ].map(link => (
            <button
              key={link.to}
              onClick={() => navigate(link.to)}
              style={{ width: '100%', padding: '8px 0', background: 'none', border: 'none', color: 'var(--sub)', fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <span>{link.label}</span>
              <ArrowRight size={12} />
            </button>
          ))}
        </div>
      </nav>

      <div style={{ padding: 12, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          onClick={toggle}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--sub)', fontSize: 12, marginBottom: 8, transition: 'all 0.15s' }}
          onMouseOver={e => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sub)' }}
        >
          {dark ? <Sun size={12} /> : <Moon size={12} />}
          <span>{dark ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--gold)', flexShrink: 0 }}>
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--faint)', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
          </div>
          <button
            onClick={() => instance.logoutRedirect()}
            title="Sign out"
            style={{ background: 'transparent', border: 'none', color: 'var(--faint)', padding: 4, borderRadius: 4, display: 'flex', cursor: 'pointer', transition: 'color 0.15s' }}
            onMouseOver={e => { e.currentTarget.style.color = 'var(--red)' }}
            onMouseOut={e => { e.currentTarget.style.color = 'var(--faint)' }}
          >
            <LogOut size={12} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {nav}
      {mobile && (
        <button onClick={() => setMobileOpen(o => !o)} style={{ position: 'fixed', top: 14, left: 14, zIndex: 300, width: 38, height: 38, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', display: 'flex', flexDirection: 'column', gap: 5, padding: 8, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
          {[0, 1, 2].map(i => <span key={i} style={{ display: 'block', width: 16, height: 1.5, background: 'var(--text)', borderRadius: 2, transition: 'all 0.25s', transform: mobileOpen ? (i === 0 ? 'rotate(45deg) translate(4px,4px)' : i === 2 ? 'rotate(-45deg) translate(4px,-4px)' : 'none') : 'none', opacity: mobileOpen && i === 1 ? 0 : 1 }} />)}
        </button>
      )}
      {mobile && mobileOpen && <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }} />}
    </>
  )
}
