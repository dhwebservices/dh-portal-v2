import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useIsAuthenticated, useMsal } from '@azure/msal-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Sidebar         from './components/Sidebar'
import Header          from './components/Header'
import BannerDisplay   from './components/BannerDisplay'
import { usePreferences } from './hooks/usePreferences'
import { usePortalTheme } from './hooks/usePortalTheme'
import PermissionGate  from './components/PermissionGate'
import LoginPage       from './pages/LoginPage'
import Dashboard       from './pages/Dashboard'
import Outreach        from './pages/Outreach'
import Clients         from './pages/Clients'
import ClientManagement from './pages/ClientManagement'
import Staff           from './pages/Staff'
import CMS             from './pages/CMS'
import Admin           from './pages/Admin'
import Settings        from './pages/Settings'
import Reports         from './pages/Reports'
import AuditLog        from './pages/AuditLog'
import Banners         from './pages/Banners'
import SupportTickets  from './pages/SupportTickets'
import EmailTemplates  from './pages/EmailTemplates'
import CompetitorLookup from './pages/CompetitorLookup'
import DomainChecker   from './pages/DomainChecker'
import ProposalBuilder from './pages/ProposalBuilder'
import SocialMedia     from './pages/SocialMedia'
import SendEmail      from './pages/SendEmail'
import Maintenance    from './pages/Maintenance'
import Tasks          from './pages/Tasks'
import Schedule       from './pages/Schedule'
import HROnboarding   from './pages/hr/HROnboarding'
import PortalHome     from './pages/PortalHome'
import WebManager     from './pages/WebManager'
import MyProfile      from './pages/MyProfile'
import StaffAccounts  from './pages/StaffAccounts'
import WebsiteCMS     from './pages/WebsiteCMS'
import StaffProfile   from './pages/StaffProfile'
import OnboardingForm  from './pages/OnboardingForm'
import HRLeave        from './pages/hr/HRLeave'
import HRPayslips     from './pages/hr/HRPayslips'
import HRProfiles     from './pages/hr/HRProfiles'
import HRPolicies     from './pages/hr/HRPolicies'
import HRTimesheet    from './pages/hr/HRTimesheet'
import { registerSession, updateSession, logAction } from './utils/audit'
import { supabase } from './utils/supabase'

function ProtectedLayout() {
  const { user } = useAuth()
  const userEmail2 = user?.email
  usePreferences(userEmail2)
  usePortalTheme() // init theme
  const [onboardingMode, setOnboardingMode] = useState(null)
  const [onboardingSubmitted, setOnboardingSubmitted] = useState(false)
  const [darkMode, setDarkMode] = useState(true)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  // Check onboarding FIRST before anything else renders
  useEffect(() => {
    if (!userEmail2) return
    const checkOnboarding = async () => {
      try {
        // Fetch all rows and match manually to avoid case sensitivity issues
        const { data: allPerms } = await supabase
          .from('user_permissions')
          .select('user_email, onboarding')

        const myRow = (allPerms || []).find(
          r => r.user_email?.toLowerCase() === userEmail2?.toLowerCase()
        )

        if (myRow?.onboarding === true) {
          const { data: allSubs } = await supabase
            .from('onboarding_submissions')
            .select('user_email, status')

          const mySub = (allSubs || []).find(
            s => s.user_email?.toLowerCase() === userEmail2?.toLowerCase()
          )

          if (mySub?.status === 'submitted') setOnboardingSubmitted(true)
          setOnboardingMode(true)
        } else {
          setOnboardingMode(false)
        }
      } catch {
        setOnboardingMode(false)
      }
    }
    checkOnboarding()
  }, [userEmail2])
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('dh_dark_mode')
    if (saved !== null) setDarkMode(saved === 'true')
  }, [])

  useEffect(() => {
    localStorage.setItem('dh_dark_mode', darkMode)
    // Apply light mode overrides
    if (!darkMode) {
      document.documentElement.style.setProperty('--brand-navy',   '#F0F4FF')
      document.documentElement.style.setProperty('--brand-dark',   '#FFFFFF')
      document.documentElement.style.setProperty('--brand-card',   '#FFFFFF')
      document.documentElement.style.setProperty('--brand-border', '#E2E8F4')
      document.documentElement.style.setProperty('--brand-muted',  '#F1F5FD')
      document.documentElement.style.setProperty('--brand-text',   '#0F172A')
      document.documentElement.style.setProperty('--brand-sub',    '#64748B')
      document.documentElement.style.setProperty('--brand-faint',  '#CBD5E1')
      document.documentElement.style.setProperty('--logo-filter',  'none')
    } else {
      document.documentElement.style.setProperty('--brand-navy',   '#0F1620')
      document.documentElement.style.setProperty('--brand-dark',   '#141E2E')
      document.documentElement.style.setProperty('--brand-card',   '#1A2540')
      document.documentElement.style.setProperty('--brand-border', '#2A3A55')
      document.documentElement.style.setProperty('--brand-muted',  '#1E2E45')
      document.documentElement.style.setProperty('--brand-text',   '#F0F4FF')
      document.documentElement.style.setProperty('--brand-sub',    '#94A9C9')
      document.documentElement.style.setProperty('--brand-faint',  '#4A6080')
      document.documentElement.style.setProperty('--logo-filter',  'brightness(0) invert(1) opacity(0.92)')
    }
  }, [darkMode])

  useEffect(() => {
    if (user?.email) {
      registerSession(user.email, user.name)
      // Heartbeat every 2 minutes to keep session alive
      const interval = setInterval(() => updateSession(user.email), 120000)
      return () => clearInterval(interval)
    }
  }, [user])

  // BLOCK ALL RENDERING until onboarding check is complete
  if (onboardingMode === null) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0D0A', flexDirection: 'column', gap: '12px' }}>
      <div style={{ width: 40, height: 40, background: '#C9A84C', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '16px', color: '#1A1612' }}>DH</div>
      <div style={{ fontSize: '13px', color: '#9A8E7E' }}>Checking access…</div>
    </div>
  )

  if (onboardingMode === true && !onboardingSubmitted) return (
    <OnboardingForm onComplete={() => setOnboardingSubmitted(true)} />
  )

  if (onboardingMode === true && onboardingSubmitted) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0D0A', padding: '20px' }}>
      <div style={{ background: '#1F1B16', border: '1px solid #2E2820', borderRadius: '16px', padding: '48px', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '22px', marginBottom: '8px', color: '#F0F4FF' }}>Onboarding Submitted!</h2>
        <p style={{ color: '#94A9C9', fontSize: '14px', lineHeight: 1.7, marginBottom: '8px' }}>
          Your form has been sent for review. You'll get an email once approved.
        </p>
        <p style={{ color: '#4A6080', fontSize: '13px' }}>You can safely close this window.</p>
      </div>
    </div>
  )

  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <div className="portal-wrap">
      {!isHome && <Sidebar />}
      <div className="portal-body" style={{ marginLeft: isHome || isMobile ? 0 : 'var(--sidebar-w)' }}>
        {!isHome && <Header />}
        <main className="portal-main" style={{ padding: isHome ? 0 : undefined }}>
          {!isHome && (
            <div style={{ marginBottom: '18px' }}>
              <BannerDisplay userEmail={user?.email} />
            </div>
          )}
          <Routes>
            <Route path="/" element={<PortalHome />} exact />
            <Route path="/my-profile" element={<MyProfile />} />
            <Route path="/web-manager" element={<WebManager />} />
            <Route path="/dashboard"   element={<PermissionGate pageKey="dashboard"><Dashboard /></PermissionGate>} />
            <Route path="/outreach"    element={<PermissionGate pageKey="outreach"><Outreach /></PermissionGate>} />
            <Route path="/clients"     element={<PermissionGate pageKey="clients"><Clients /></PermissionGate>} />
            <Route path="/client-mgmt" element={<PermissionGate pageKey="clientmgmt"><ClientManagement /></PermissionGate>} />
            <Route path="/support"     element={<PermissionGate pageKey="support"><SupportTickets /></PermissionGate>} />
            <Route path="/staff"       element={<PermissionGate pageKey="staff"><Staff /></PermissionGate>} />
            <Route path="/email-templates" element={<PermissionGate pageKey="emailtemplates"><EmailTemplates /></PermissionGate>} />
            <Route path="/competitor"     element={<PermissionGate pageKey="competitor"><CompetitorLookup /></PermissionGate>} />
            <Route path="/domains"         element={<PermissionGate pageKey="domains"><DomainChecker /></PermissionGate>} />
            <Route path="/proposals"       element={<PermissionGate pageKey="proposals"><ProposalBuilder /></PermissionGate>} />
            <Route path="/social"          element={<PermissionGate pageKey="social"><SocialMedia /></PermissionGate>} />
            <Route path="/send-email"       element={<PermissionGate pageKey="sendemail"><SendEmail /></PermissionGate>} />
            <Route path="/maintenance"       element={<PermissionGate pageKey="maintenance"><Maintenance /></PermissionGate>} />
            <Route path="/tasks"            element={<PermissionGate pageKey="tasks"><Tasks /></PermissionGate>} />
            <Route path="/tasks"             element={<PermissionGate pageKey="tasks"><Tasks /></PermissionGate>} />
            <Route path="/my-tasks"          element={<PermissionGate pageKey="mytasks"><Tasks /></PermissionGate>} />
            <Route path="/schedule"          element={<PermissionGate pageKey="schedule"><Schedule /></PermissionGate>} />
            <Route path="/hr/onboarding"     element={<PermissionGate pageKey="hr_onboarding"><HROnboarding /></PermissionGate>} />
            <Route path="/hr/leave"          element={<PermissionGate pageKey="hr_leave"><HRLeave /></PermissionGate>} />
            <Route path="/hr/payslips"       element={<PermissionGate pageKey="hr_payslips"><HRPayslips /></PermissionGate>} />
            <Route path="/hr/profiles"       element={<PermissionGate pageKey="hr_profiles"><HRProfiles /></PermissionGate>} />
            <Route path="/hr/policies"       element={<PermissionGate pageKey="hr_policies"><HRPolicies /></PermissionGate>} />
            <Route path="/hr/timesheet"      element={<PermissionGate pageKey="hr_timesheet"><HRTimesheet /></PermissionGate>} />
            <Route path="/cms"             element={<CMS />} />
            <Route path="/admin"       element={<PermissionGate pageKey="admin"><Admin /></PermissionGate>} />
            <Route path="/staff-accounts"          element={<PermissionGate pageKey="admin"><StaffAccounts /></PermissionGate>} />
            <Route path="/website-cms"             element={<PermissionGate pageKey="admin"><WebsiteCMS /></PermissionGate>} />
            <Route path="/staff-accounts/:email"   element={<PermissionGate pageKey="admin"><StaffProfile /></PermissionGate>} />
            <Route path="/settings"    element={<PermissionGate pageKey="settings"><Settings /></PermissionGate>} />
            <Route path="/reports"     element={<PermissionGate pageKey="reports"><Reports /></PermissionGate>} />
            <Route path="/banners"     element={<PermissionGate pageKey="banners"><Banners /></PermissionGate>} />
            <Route path="/audit"       element={<PermissionGate pageKey="audit"><AuditLog /></PermissionGate>} />
            <Route path="*"            element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function AppRoutes() {
  const isAuthenticated = useIsAuthenticated()
  const { inProgress } = useMsal()
  const { wrongRole, logout } = useAuth()

  if (inProgress !== 'none' && !isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0D0A', flexDirection: 'column', gap: '16px' }}>
        <div style={{ width: '40px', height: '40px', background: '#C9A84C', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '16px', color: '#1A1612' }}>DH</div>
        <div style={{ fontSize: '13px', color: '#9A8E7E', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em' }}>Signing you in…</div>
      </div>
    )
  }

  if (isAuthenticated && wrongRole) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0D0A', flexDirection: 'column', gap: '16px', padding: '20px' }}>
        <div style={{ background: '#1F1B16', border: '1px solid #2E2820', borderRadius: '16px', padding: '40px', maxWidth: '420px', width: '100%', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 600, fontSize: '24px', marginBottom: '12px', color: '#F5F0E8' }}>Wrong Portal</h2>
          <p style={{ color: '#9A8E7E', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>Your account is set up as a client. Please use the client portal.</p>
          <a href="https://app.dhwebsiteservices.co.uk" style={{ display: 'inline-block', padding: '12px 28px', background: '#C9A84C', borderRadius: '6px', color: '#1A1612', fontWeight: 700, fontSize: '14px', marginBottom: '14px' }}>Go to Client Portal →</a>
          <br />
          <button onClick={logout} style={{ background: 'none', border: 'none', color: '#5A5048', fontSize: '13px', marginTop: '8px', cursor: 'pointer' }}>Sign out</button>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return <LoginPage />
  return <Routes><Route path="/*" element={<ProtectedLayout />} /></Routes>
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
