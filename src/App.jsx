import { lazy, Suspense } from 'react'
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react'
import { PublicClientApplication } from '@azure/msal-browser'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { msalConfig } from './authConfig'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Sidebar from './components/Sidebar'
import Header from './components/Header'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const HomeScreen = lazy(() => import('./pages/HomeScreen'))
const WebManager = lazy(() => import('./pages/WebManager'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Outreach = lazy(() => import('./pages/Outreach'))
const Clients = lazy(() => import('./pages/Clients'))
const ClientMgmt = lazy(() => import('./pages/ClientMgmt'))
const Support = lazy(() => import('./pages/Support'))
const Tasks = lazy(() => import('./pages/Tasks'))
const MyTasks = lazy(() => import('./pages/MyTasks'))
const MyProfile = lazy(() => import('./pages/MyProfile'))
const ClientProfile = lazy(() => import('./pages/ClientProfile'))
const MyStaff = lazy(() => import('./pages/MyStaff'))
const StaffProfile = lazy(() => import('./pages/StaffProfile'))
const Search = lazy(() => import('./pages/Search'))
const Schedule = lazy(() => import('./pages/Schedule'))
const Reports = lazy(() => import('./pages/Reports'))
const OrgChart = lazy(() => import('./pages/OrgChart'))
const AdminSafeguards = lazy(() => import('./pages/AdminSafeguards'))
const Proposals = lazy(() => import('./pages/Proposals'))
const SendEmail = lazy(() => import('./pages/SendEmail'))
const EmailTemplates = lazy(() => import('./pages/EmailTemplates'))
const Banners = lazy(() => import('./pages/Banners'))
const Domains = lazy(() => import('./pages/Domains'))
const Competitor = lazy(() => import('./pages/Competitor'))
const Maintenance = lazy(() => import('./pages/Maintenance'))
const HRLeave = lazy(() => import('./pages/hr/HRLeave'))
const HRTimesheets = lazy(() => import('./pages/hr/HRTimesheets'))
const HRPayslips = lazy(() => import('./pages/hr/HRPayslips'))
const HRPolicies = lazy(() => import('./pages/hr/HRPolicies'))
const HRDocuments = lazy(() => import('./pages/hr/HRDocuments'))
const HROnboarding = lazy(() => import('./pages/hr/HROnboarding'))
const Appointments = lazy(() => import('./pages/Appointments'))
const MailingList = lazy(() => import('./pages/MailingList'))
const AuditLog = lazy(() => import('./pages/AuditLog'))
const Settings = lazy(() => import('./pages/Settings'))
const Notifications = lazy(() => import('./pages/Notifications'))

const msal = new PublicClientApplication(msalConfig)

function RouteLoader() {
  return (
    <div className="spin-wrap" style={{ minHeight: '40vh' }}>
      <div className="spin" />
    </div>
  )
}

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
          <Suspense fallback={<RouteLoader />}>
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
              <Route path="/admin-safeguards" element={<PermissionGate permKey="safeguards"><AdminSafeguards /></PermissionGate>} />
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
              <Route path="/hr/documents"    element={<PermissionGate permKey="hr_documents"><HRDocuments /></PermissionGate>} />
              <Route path="/hr/onboarding"   element={<PermissionGate permKey="hr_onboarding" allowDuringOnboarding><HROnboarding /></PermissionGate>} />
              <Route path="/appointments"    element={<PermissionGate permKey="appointments"><Appointments /></PermissionGate>} />
              <Route path="/mailing-list"    element={<PermissionGate permKey="mailinglist"><MailingList /></PermissionGate>} />
              <Route path="/audit"           element={<PermissionGate permKey="audit"><AuditLog /></PermissionGate>} />
              <Route path="/settings"        element={<PermissionGate permKey="settings"><Settings /></PermissionGate>} />
              <Route path="/notifications"   element={<PermissionGate permKey="notifications"><Notifications /></PermissionGate>} />
              <Route path="*"               element={<PermissionGate permKey="dashboard"><Dashboard /></PermissionGate>} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}

function AuthenticatedApp() {
  return (
    <AuthProvider>
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/"              element={<OnboardingWall><HomeScreen /></OnboardingWall>} />
          <Route path="/web-manager/*" element={<OnboardingWall><PermissionGate permKey="website_editor"><WebManager /></PermissionGate></OnboardingWall>} />
          <Route path="/*"             element={<OnboardingWall><PortalLayout /></OnboardingWall>} />
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}

export default function App() {
  return (
    <MsalProvider instance={msal}>
      <BrowserRouter>
        <AuthenticatedTemplate><AuthenticatedApp /></AuthenticatedTemplate>
        <UnauthenticatedTemplate>
          <Suspense fallback={<RouteLoader />}>
            <Routes><Route path="*" element={<LoginPage />} /></Routes>
          </Suspense>
        </UnauthenticatedTemplate>
      </BrowserRouter>
    </MsalProvider>
  )
}
