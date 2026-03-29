import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useIsAuthenticated, useMsal } from '@azure/msal-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Sidebar       from './components/Sidebar'
import Header        from './components/Header'
import LoginPage     from './pages/LoginPage'
import HomeScreen    from './pages/HomeScreen'
import Dashboard     from './pages/Dashboard'
import Outreach      from './pages/Outreach'
import Clients       from './pages/Clients'
import ClientMgmt    from './pages/ClientMgmt'
import ClientProfile from './pages/ClientProfile'
import Support       from './pages/Support'
import Staff         from './pages/Staff'
import MyStaff       from './pages/MyStaff'
import Admin         from './pages/Admin'
import Settings      from './pages/Settings'
import Reports       from './pages/Reports'
import AuditLog      from './pages/AuditLog'
import Banners       from './pages/Banners'
import EmailTemplates from './pages/EmailTemplates'
import Competitor    from './pages/Competitor'
import Domains       from './pages/Domains'
import Proposals     from './pages/Proposals'
import SendEmail     from './pages/SendEmail'
import Maintenance   from './pages/Maintenance'
import Tasks         from './pages/Tasks'
import MyTasks       from './pages/MyTasks'
import Schedule      from './pages/Schedule'
import Search        from './pages/Search'
import WebManager    from './pages/WebManager'
import SiteEditor    from './pages/SiteEditor'
import MyProfile     from './pages/MyProfile'
import StaffProfile  from './pages/StaffProfile'
import Appointments  from './pages/Appointments'
import MailingList   from './pages/MailingList'
import HROnboarding  from './pages/hr/HROnboarding'
import HRLeave       from './pages/hr/HRLeave'
import HRPayslips    from './pages/hr/HRPayslips'
import HRProfiles    from './pages/hr/HRProfiles'
import HRPolicies    from './pages/hr/HRPolicies'
import HRTimesheets  from './pages/hr/HRTimesheets'
import './styles/global.css'

function ProtectedLayout() {
  const { user, can, isAdmin, isOnboarding, loading } = useAuth()
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const isHome = location.pathname === '/'

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0D0A', flexDirection: 'column', gap: '12px' }}>
      <div style={{ width: 40, height: 40, background: '#C9A84C', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '16px', color: '#1A1612' }}>DH</div>
      <div style={{ fontSize: '13px', color: '#9A8E7E' }}>Checking access…</div>
    </div>
  )

  if (isOnboarding) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0D0A', padding: '20px' }}>
      <div style={{ background: '#1F1B16', border: '1px solid #2E2820', borderRadius: '16px', padding: '48px', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '22px', marginBottom: '8px', color: '#F0F4FF' }}>Onboarding Submitted!</h2>
        <p style={{ color: '#94A9C9', fontSize: '14px', lineHeight: 1.7 }}>Your form has been sent for review. You will get an email once approved.</p>
      </div>
    </div>
  )

  return (
    <div className="portal-wrap">
      {!isHome && <Sidebar />}
      <div className="portal-body" style={{ marginLeft: isHome || isMobile ? 0 : '56px' }}>
        {!isHome && <Header />}
        <main className="portal-main" style={{ padding: isHome ? 0 : undefined }}>
          <Routes>
            <Route path="/"                  element={<HomeScreen />} />
            <Route path="/dashboard"         element={<Dashboard />} />
            <Route path="/my-profile"        element={<MyProfile />} />
            <Route path="/search"            element={<Search />} />
            <Route path="/outreach"          element={<Outreach />} />
            <Route path="/clients"           element={<Clients />} />
            <Route path="/clients/:id"       element={<ClientProfile />} />
            <Route path="/client-mgmt"       element={<ClientMgmt />} />
            <Route path="/support"           element={<Support />} />
            <Route path="/staff"             element={<Staff />} />
            <Route path="/my-staff"          element={<MyStaff />} />
            <Route path="/staff/:email"      element={<StaffProfile />} />
            <Route path="/competitor"        element={<Competitor />} />
            <Route path="/domains"           element={<Domains />} />
            <Route path="/proposals"         element={<Proposals />} />
            <Route path="/send-email"        element={<SendEmail />} />
            <Route path="/email-templates"   element={<EmailTemplates />} />
            <Route path="/appointments"      element={<Appointments />} />
            <Route path="/mailing-list"      element={<MailingList />} />
            <Route path="/tasks"             element={<Tasks />} />
            <Route path="/my-tasks"          element={<MyTasks />} />
            <Route path="/schedule"          element={<Schedule />} />
            <Route path="/web-manager"       element={<WebManager />} />
            <Route path="/site-editor"       element={<SiteEditor />} />
            <Route path="/reports"           element={<Reports />} />
            <Route path="/audit"             element={<AuditLog />} />
            <Route path="/admin"             element={<Admin />} />
            <Route path="/banners"           element={<Banners />} />
            <Route path="/maintenance"       element={<Maintenance />} />
            <Route path="/settings"          element={<Settings />} />
            <Route path="/hr/profiles"       element={<HRProfiles />} />
            <Route path="/hr/timesheets"     element={<HRTimesheets />} />
            <Route path="/hr/leave"          element={<HRLeave />} />
            <Route path="/hr/payslips"       element={<HRPayslips />} />
            <Route path="/hr/policies"       element={<HRPolicies />} />
            <Route path="/hr/onboarding"     element={<HROnboarding />} />
            <Route path="*"                  element={<Navigate to="/dashboard" replace />} />
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

  if (!isAuthenticated) return <LoginPage />
  return <Routes><Route path="/*" element={<ProtectedLayout />} /></Routes>
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
