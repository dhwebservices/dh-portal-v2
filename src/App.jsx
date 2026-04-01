import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react'
import { PublicClientApplication } from '@azure/msal-browser'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { msalConfig } from './authConfig'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import LoginPage    from './pages/LoginPage'
import HomeScreen   from './pages/HomeScreen'
import WebManager   from './pages/WebManager'
import Dashboard      from './pages/Dashboard'
import Outreach       from './pages/Outreach'
import Clients        from './pages/Clients'
import ClientMgmt     from './pages/ClientMgmt'
import Support        from './pages/Support'
import Tasks          from './pages/Tasks'
import MyTasks        from './pages/MyTasks'
import MyProfile      from './pages/MyProfile'
import ClientProfile  from './pages/ClientProfile'
import MyStaff        from './pages/MyStaff'
import StaffProfile   from './pages/StaffProfile'
import Search         from './pages/Search'
import Schedule       from './pages/Schedule'
import Reports        from './pages/Reports'
import OrgChart       from './pages/OrgChart'
import Proposals      from './pages/Proposals'
import SendEmail      from './pages/SendEmail'
import EmailTemplates from './pages/EmailTemplates'
import Banners        from './pages/Banners'
import Domains        from './pages/Domains'
import Competitor     from './pages/Competitor'
import Maintenance    from './pages/Maintenance'
import HRLeave        from './pages/hr/HRLeave'
import HRTimesheets   from './pages/hr/HRTimesheets'
import HRPayslips     from './pages/hr/HRPayslips'
import HRPolicies     from './pages/hr/HRPolicies'
import HROnboarding   from './pages/hr/HROnboarding'
import Appointments   from './pages/Appointments'
import MailingList    from './pages/MailingList'
import AuditLog       from './pages/AuditLog'
import Settings       from './pages/Settings'
import Notifications  from './pages/Notifications'

const msal = new PublicClientApplication(msalConfig)

// Wraps any page — if user is in onboarding mode, show only the onboarding form
function OnboardingWall({ children }) {
  const { isOnboarding, loading } = useAuth()
  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (isOnboarding) return <HROnboarding />
  return children
}

function PermissionGate({ permKey, children, allowDuringOnboarding = false }) {
  const { can, loading, isOnboarding } = useAuth()

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (isOnboarding && !allowDuringOnboarding) return <HROnboarding />
  if (!permKey || can(permKey)) return children

  return (
    <div className="fade-in">
      <div className="card card-pad" style={{ maxWidth: 560 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize: 24, fontWeight: 400, marginBottom: 8, color: 'var(--text)' }}>
          Access disabled
        </div>
        <div style={{ fontSize: 14, color: 'var(--sub)', lineHeight: 1.6 }}>
          This page is disabled for this staff profile. Re-enable it from the permissions tab in My Staff if access is needed.
        </div>
      </div>
    </div>
  )
}

function PortalLayout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-area">
        <Header />
        <main className="main-content">
          <Routes>
            <Route path="/dashboard"       element={<PermissionGate permKey="dashboard"><Dashboard /></PermissionGate>} />
            <Route path="/my-profile"      element={<PermissionGate permKey="my_profile"><MyProfile /></PermissionGate>} />
            <Route path="/search"          element={<PermissionGate permKey="search"><Search /></PermissionGate>} />
            <Route path="/outreach"        element={<PermissionGate permKey="outreach"><Outreach /></PermissionGate>} />
            <Route path="/clients"         element={<PermissionGate permKey="clients"><Clients /></PermissionGate>} />
            <Route path="/clients/:id"     element={<PermissionGate permKey="clients"><ClientProfile /></PermissionGate>} />
            <Route path="/client-mgmt"     element={<PermissionGate permKey="clientmgmt"><ClientMgmt /></PermissionGate>} />
            <Route path="/support"         element={<PermissionGate permKey="support"><Support /></PermissionGate>} />
            <Route path="/tasks"           element={<PermissionGate permKey="tasks"><Tasks /></PermissionGate>} />
            <Route path="/my-tasks"        element={<PermissionGate permKey="mytasks"><MyTasks /></PermissionGate>} />
            <Route path="/schedule"        element={<PermissionGate permKey="schedule"><Schedule /></PermissionGate>} />
            <Route path="/reports"         element={<PermissionGate permKey="reports"><Reports /></PermissionGate>} />
            <Route path="/org-chart"       element={<PermissionGate permKey="org_chart"><OrgChart /></PermissionGate>} />
            <Route path="/my-staff"        element={<PermissionGate permKey="staff"><MyStaff /></PermissionGate>} />
            <Route path="/my-staff/:email" element={<PermissionGate permKey="staff"><StaffProfile /></PermissionGate>} />
            <Route path="/proposals"       element={<PermissionGate permKey="proposals"><Proposals /></PermissionGate>} />
            <Route path="/send-email"      element={<PermissionGate permKey="sendemail"><SendEmail /></PermissionGate>} />
            <Route path="/email-templates" element={<PermissionGate permKey="emailtemplates"><EmailTemplates /></PermissionGate>} />
            <Route path="/banners"         element={<PermissionGate permKey="banners"><Banners /></PermissionGate>} />
            <Route path="/domains"         element={<PermissionGate permKey="domains"><Domains /></PermissionGate>} />
            <Route path="/competitor"      element={<PermissionGate permKey="competitor"><Competitor /></PermissionGate>} />
            <Route path="/maintenance"     element={<PermissionGate permKey="maintenance"><Maintenance /></PermissionGate>} />
            <Route path="/hr/leave"        element={<PermissionGate permKey="hr_leave"><HRLeave /></PermissionGate>} />
            <Route path="/hr/timesheets"   element={<PermissionGate permKey="hr_timesheet"><HRTimesheets /></PermissionGate>} />
            <Route path="/hr/payslips"     element={<PermissionGate permKey="hr_payslips"><HRPayslips /></PermissionGate>} />
            <Route path="/hr/policies"     element={<PermissionGate permKey="hr_policies"><HRPolicies /></PermissionGate>} />
            <Route path="/hr/onboarding"   element={<PermissionGate permKey="hr_onboarding" allowDuringOnboarding><HROnboarding /></PermissionGate>} />
            <Route path="/appointments"    element={<PermissionGate permKey="appointments"><Appointments /></PermissionGate>} />
            <Route path="/mailing-list"    element={<PermissionGate permKey="mailinglist"><MailingList /></PermissionGate>} />
            <Route path="/audit"           element={<PermissionGate permKey="audit"><AuditLog /></PermissionGate>} />
            <Route path="/settings"        element={<PermissionGate permKey="settings"><Settings /></PermissionGate>} />
            <Route path="/notifications"   element={<PermissionGate permKey="notifications"><Notifications /></PermissionGate>} />
            <Route path="*"               element={<PermissionGate permKey="dashboard"><Dashboard /></PermissionGate>} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function AuthenticatedApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/"              element={<HomeScreen />} />
        <Route path="/web-manager/*" element={<PermissionGate permKey="website_editor"><WebManager /></PermissionGate>} />
        <Route path="/*"             element={<PortalLayout />} />
      </Routes>
    </AuthProvider>
  )
}

export default function App() {
  return (
    <MsalProvider instance={msal}>
      <BrowserRouter>
        <AuthenticatedTemplate><AuthenticatedApp /></AuthenticatedTemplate>
        <UnauthenticatedTemplate>
          <Routes><Route path="*" element={<LoginPage />} /></Routes>
        </UnauthenticatedTemplate>
      </BrowserRouter>
    </MsalProvider>
  )
}
