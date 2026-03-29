import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { usePortalTheme } from '../hooks/usePortalTheme'
import { Home, Sun, Moon, ChevronRight } from 'lucide-react'

const CRUMBS = {
  '/dashboard': ['Home', 'Overview'],
  '/web-manager': ['Home', 'Web Manager'],
  '/outreach': ['Clients', 'Outreach'],
  '/clients': ['Clients', 'Accounts'],
  '/client-mgmt': ['Content', 'Client Portal'],
  '/support': ['Clients', 'Support'],
  '/competitor': ['Clients', 'Competitor Lookup'],
  '/domains': ['Clients', 'Domain Checker'],
  '/proposals': ['Clients', 'Proposal Builder'],
  '/social': ['Clients', 'Social Media'],
  '/send-email': ['Clients', 'Send Email'],
  '/tasks': ['Home', 'Manage Tasks'],
  '/my-tasks': ['Home', 'My Tasks'],
  '/schedule': ['Home', 'Schedule'],
  '/hr/onboarding': ['People', 'Onboarding'],
  '/hr/leave': ['People', 'Leave'],
  '/hr/payslips': ['People', 'Payslips'],
  '/hr/policies': ['People', 'Policies'],
  '/hr/timesheet': ['People', 'Timesheet'],
  '/hr/profiles': ['People', 'Profiles'],
  '/website-cms': ['Content', 'Website Editor'],
  '/staff-accounts': ['Admin', 'Staff Accounts'],
  '/reports': ['Admin', 'Reports'],
  '/banners': ['Content', 'Banners'],
  '/email-templates': ['Content', 'Email Templates'],
  '/audit': ['Admin', 'Audit Log'],
  '/maintenance': ['Admin', 'Maintenance'],
  '/settings': ['Admin', 'Settings'],
  '/my-profile': ['My Profile'],
}

export default function Header() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { dark, toggle } = usePortalTheme()
  const [menuOpen, setMenuOpen] = useState(false)

  const path = location.pathname
  const crumbs = CRUMBS[path] || CRUMBS[Object.keys(CRUMBS).find(k => path.startsWith(`${k}/`)) || ''] || []
  const pageTitle = crumbs[crumbs.length - 1] || ''

  return (
    <div style={{ height: 'var(--header-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {crumbs.length > 1 && crumbs.slice(0, -1).map((crumb, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>{crumb}</span>
            <ChevronRight size={10} color="var(--faint)" />
          </span>
        ))}
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text)' }}>{pageTitle}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => navigate('/')} title="Portal Home" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--sub)', transition: 'all 0.15s' }}
          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)' }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--sub)' }}
        >
          <Home size={13} />
        </button>

        <button onClick={toggle} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--sub)', transition: 'all 0.15s' }}
          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)' }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--sub)' }}
        >
          {dark ? <Sun size={13} /> : <Moon size={13} />}
        </button>

        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(open => !open)} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--gold-border)', background: 'var(--gold-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--gold)', transition: 'all 0.15s' }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--gold)' }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--gold-border)' }}
          >
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
              <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 100, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 6, minWidth: 180, boxShadow: 'var(--shadow-md)', animation: 'fadeUp 0.2s ease both' }}>
                <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--faint)', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
                </div>
                {[['My Profile', '/my-profile'], ['Settings', '/settings']].map(([label, to]) => (
                  <button key={label} onClick={() => { navigate(to); setMenuOpen(false) }} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--sub)', fontSize: 13, cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
                    onMouseOver={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text)' }}
                    onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sub)' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
