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

function PortalLayout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-area">
        <Header />
        <main className="main-content">
          <Routes>
            <Route path="/dashboard"       element={<OnboardingWall><Dashboard /></OnboardingWall>} />
            <Route path="/my-profile"      element={<MyProfile />} />
            <Route path="/search"          element={<Search />} />
            <Route path="/outreach"        element={<Outreach />} />
            <Route path="/clients"         element={<Clients />} />
            <Route path="/clients/:id"     element={<ClientProfile />} />
            <Route path="/client-mgmt"     element={<ClientMgmt />} />
            <Route path="/support"         element={<Support />} />
            <Route path="/tasks"           element={<Tasks />} />
            <Route path="/my-tasks"        element={<MyTasks />} />
            <Route path="/schedule"        element={<Schedule />} />
            <Route path="/reports"         element={<Reports />} />
            <Route path="/org-chart"       element={<OrgChart />} />
            <Route path="/my-staff"        element={<MyStaff />} />
            <Route path="/my-staff/:email" element={<StaffProfile />} />
            <Route path="/proposals"       element={<Proposals />} />
            <Route path="/send-email"      element={<SendEmail />} />
            <Route path="/email-templates" element={<EmailTemplates />} />
            <Route path="/banners"         element={<Banners />} />
            <Route path="/domains"         element={<Domains />} />
            <Route path="/competitor"      element={<Competitor />} />
            <Route path="/maintenance"     element={<Maintenance />} />
            <Route path="/hr/leave"        element={<HRLeave />} />
            <Route path="/hr/timesheets"   element={<HRTimesheets />} />
            <Route path="/hr/payslips"     element={<HRPayslips />} />
            <Route path="/hr/policies"     element={<HRPolicies />} />
            <Route path="/hr/onboarding"   element={<HROnboarding />} />
            <Route path="/appointments"      element={<Appointments />} />
            <Route path="/mailing-list"      element={<MailingList />} />
            <Route path="/audit"           element={<AuditLog />} />
            <Route path="/settings"        element={<Settings />} />
            <Route path="/notifications"   element={<Notifications />} />
            <Route path="*"               element={<OnboardingWall><Dashboard /></OnboardingWall>} />
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
        <Route path="/web-manager/*" element={<WebManager />} />
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
