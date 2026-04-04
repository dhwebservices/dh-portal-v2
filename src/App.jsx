import { lazy, Suspense } from 'react'
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react'
import { PublicClientApplication } from '@azure/msal-browser'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { msalConfig } from './authConfig'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import { getLifecycleLabel, TERMINATED_STATES } from './utils/staffLifecycle'

function lazyRetry(importer, key) {
  return lazy(async () => {
    const retryKey = `portal-lazy-retry:${key}`
    try {
      const module = await importer()
      window.sessionStorage.removeItem(retryKey)
      return module
    } catch (error) {
      const hasRetried = window.sessionStorage.getItem(retryKey) === '1'
      if (!hasRetried) {
        window.sessionStorage.setItem(retryKey, '1')
        window.location.reload()
        return new Promise(() => {})
      }
      throw error
    }
  })
}

const LoginPage = lazyRetry(() => import('./pages/LoginPage'), 'login')
const HomeScreen = lazyRetry(() => import('./pages/HomeScreen'), 'home')
const WebManager = lazyRetry(() => import('./pages/WebManager'), 'web-manager')
const Dashboard = lazyRetry(() => import('./pages/Dashboard'), 'dashboard')
const Outreach = lazyRetry(() => import('./pages/Outreach'), 'outreach')
const Clients = lazyRetry(() => import('./pages/Clients'), 'clients')
const ClientMgmt = lazyRetry(() => import('./pages/ClientMgmt'), 'client-mgmt')
const Support = lazyRetry(() => import('./pages/Support'), 'support')
const KnowledgeBase = lazyRetry(() => import('./pages/KnowledgeBase'), 'knowledge-base')
const Tasks = lazyRetry(() => import('./pages/Tasks'), 'tasks')
const MyTasks = lazyRetry(() => import('./pages/MyTasks'), 'my-tasks')
const MyProfile = lazyRetry(() => import('./pages/MyProfile'), 'my-profile')
const ClientProfile = lazyRetry(() => import('./pages/ClientProfile'), 'client-profile')
const MyStaff = lazyRetry(() => import('./pages/MyStaff'), 'my-staff')
const StaffProfile = lazyRetry(() => import('./pages/StaffProfile'), 'staff-profile')
const Search = lazyRetry(() => import('./pages/Search'), 'search')
const MyDepartment = lazyRetry(() => import('./pages/MyDepartment'), 'my-department')
const MyTeam = lazyRetry(() => import('./pages/MyTeam'), 'my-team')
const Schedule = lazyRetry(() => import('./pages/Schedule'), 'schedule')
const Reports = lazyRetry(() => import('./pages/Reports'), 'reports')
const ManagerBoard = lazyRetry(() => import('./pages/ManagerBoard'), 'manager-board')
const Departments = lazyRetry(() => import('./pages/Departments'), 'departments')
const ContractQueue = lazyRetry(() => import('./pages/ContractQueue'), 'contract-queue')
const ContractTemplates = lazyRetry(() => import('./pages/ContractTemplates'), 'contract-templates')
const OrgChart = lazyRetry(() => import('./pages/OrgChart'), 'org-chart')
const AdminSafeguards = lazyRetry(() => import('./pages/AdminSafeguards'), 'admin-safeguards')
const Proposals = lazyRetry(() => import('./pages/Proposals'), 'proposals')
const SendEmail = lazyRetry(() => import('./pages/SendEmail'), 'send-email')
const EmailTemplates = lazyRetry(() => import('./pages/EmailTemplates'), 'email-templates')
const Banners = lazyRetry(() => import('./pages/Banners'), 'banners')
const Domains = lazyRetry(() => import('./pages/Domains'), 'domains')
const Competitor = lazyRetry(() => import('./pages/Competitor'), 'competitor')
const Maintenance = lazyRetry(() => import('./pages/Maintenance'), 'maintenance')
const HRLeave = lazyRetry(() => import('./pages/hr/HRLeave'), 'hr-leave')
const HRTimesheets = lazyRetry(() => import('./pages/hr/HRTimesheets'), 'hr-timesheets')
const HRPayslips = lazyRetry(() => import('./pages/hr/HRPayslips'), 'hr-payslips')
const HRPolicies = lazyRetry(() => import('./pages/hr/HRPolicies'), 'hr-policies')
const HRDocuments = lazyRetry(() => import('./pages/hr/HRDocuments'), 'hr-documents')
const HRComplianceRules = lazyRetry(() => import('./pages/hr/HRComplianceRules'), 'hr-compliance-rules')
const HRTrainingCatalogue = lazyRetry(() => import('./pages/hr/HRTrainingCatalogue'), 'hr-training-catalogue')
const HROnboarding = lazyRetry(() => import('./pages/hr/HROnboarding'), 'hr-onboarding')
const Appointments = lazyRetry(() => import('./pages/Appointments'), 'appointments')
const MailingList = lazyRetry(() => import('./pages/MailingList'), 'mailing-list')
const AuditLog = lazyRetry(() => import('./pages/AuditLog'), 'audit-log')
const Settings = lazyRetry(() => import('./pages/Settings'), 'settings')
const Notifications = lazyRetry(() => import('./pages/Notifications'), 'notifications')

const msal = new PublicClientApplication(msalConfig)

function RouteLoader() {
  return (
    <div className="spin-wrap" style={{ minHeight: '40vh' }}>
      <div className="spin" />
    </div>
  )
}

function MaintenanceLock() {
  const { maintenance } = useAuth()
  return (
    <div className="fade-in" style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', background:'var(--bg2)' }}>
      <div className="card card-pad" style={{ maxWidth:640, width:'100%', textAlign:'center', border:'2px solid var(--amber)' }}>
        <div style={{ fontSize:44, marginBottom:12 }}>🛠</div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:30, fontWeight:400, color:'var(--text)', marginBottom:10 }}>
          Portal Under Maintenance
        </div>
        <div style={{ fontSize:14, color:'var(--sub)', lineHeight:1.7, marginBottom:14 }}>
          {maintenance?.message || 'The staff portal is currently undergoing maintenance. Please come back later.'}
        </div>
        {maintenance?.eta ? (
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:999, background:'var(--amber-bg)', color:'var(--amber)', fontSize:12, fontWeight:600, marginBottom:14 }}>
            Expected back: {maintenance.eta}
          </div>
        ) : null}
        <div style={{ fontSize:12, color:'var(--faint)' }}>
          Admin users can still access the portal during maintenance.
        </div>
      </div>
    </div>
  )
}

function LifecycleLock() {
  const { lifecycle } = useAuth()
  return (
    <div className="fade-in" style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', background:'var(--bg2)' }}>
      <div className="card card-pad" style={{ maxWidth:640, width:'100%', textAlign:'center', border:'2px solid var(--red)' }}>
        <div style={{ fontSize:44, marginBottom:12 }}>🔒</div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:30, fontWeight:400, color:'var(--text)', marginBottom:10 }}>
          Access Unavailable
        </div>
        <div style={{ fontSize:14, color:'var(--sub)', lineHeight:1.7, marginBottom:14 }}>
          This staff account is currently marked as <strong>{getLifecycleLabel(lifecycle?.state)}</strong>. If you think this is incorrect, please contact DH Website Services directly.
        </div>
      </div>
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

function MaintenanceWall({ children }) {
  const { maintenance, isAdmin, lifecycle, loading } = useAuth()
  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (TERMINATED_STATES.has(lifecycle?.state)) return <LifecycleLock />
  if (maintenance?.enabled && !isAdmin) return <MaintenanceLock />
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

function WebManagerGate({ children }) {
  const { can, loading, isOnboarding, isAdmin } = useAuth()

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (isOnboarding) return <HROnboarding />
  if (isAdmin || can('website_editor') || can('clientmgmt')) return children

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
              <Route path="/my-department"   element={<PermissionGate permKey="my_department"><MyDepartment /></PermissionGate>} />
              <Route path="/my-team"         element={<PermissionGate permKey="my_team"><MyTeam /></PermissionGate>} />
              <Route path="/outreach"        element={<PermissionGate permKey="outreach"><Outreach /></PermissionGate>} />
              <Route path="/clients"         element={<PermissionGate permKey="clients"><Clients /></PermissionGate>} />
              <Route path="/clients/:id"     element={<PermissionGate permKey="clients"><ClientProfile /></PermissionGate>} />
              <Route path="/client-mgmt"     element={<PermissionGate permKey="clientmgmt"><ClientMgmt /></PermissionGate>} />
              <Route path="/support"         element={<PermissionGate permKey="support"><Support /></PermissionGate>} />
              <Route path="/knowledge-base"  element={<PermissionGate permKey="support"><KnowledgeBase /></PermissionGate>} />
              <Route path="/tasks"           element={<PermissionGate permKey="tasks"><Tasks /></PermissionGate>} />
              <Route path="/my-tasks"        element={<PermissionGate permKey="mytasks"><MyTasks /></PermissionGate>} />
              <Route path="/schedule"        element={<PermissionGate permKey="schedule"><Schedule /></PermissionGate>} />
              <Route path="/reports"         element={<PermissionGate permKey="reports"><Reports /></PermissionGate>} />
              <Route path="/manager-board"   element={<PermissionGate permKey="manager_board"><ManagerBoard /></PermissionGate>} />
              <Route path="/departments"     element={<PermissionGate permKey="departments"><Departments /></PermissionGate>} />
              <Route path="/contract-queue"  element={<PermissionGate permKey="contract_queue"><ContractQueue /></PermissionGate>} />
              <Route path="/contract-templates" element={<PermissionGate permKey="contract_templates"><ContractTemplates /></PermissionGate>} />
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
              <Route path="/hr/compliance-rules" element={<PermissionGate permKey="hr_documents"><HRComplianceRules /></PermissionGate>} />
              <Route path="/hr/training-catalogue" element={<PermissionGate permKey="hr_documents"><HRTrainingCatalogue /></PermissionGate>} />
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

function LandingResolver() {
  const { preferences, loading, isOnboarding } = useAuth()

  if (loading) return <RouteLoader />
  if (isOnboarding) return <HROnboarding />

  const routeMap = {
    dashboard: '/dashboard',
    mytasks: '/my-tasks',
    notifications: '/notifications',
    my_department: '/my-department',
    schedule: '/schedule',
    appointments: '/appointments',
    clients: '/clients',
  }

  return <Navigate to={routeMap[preferences?.defaultLanding] || '/dashboard'} replace />
}

function AuthenticatedApp() {
  return (
    <AuthProvider>
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/"              element={<MaintenanceWall><LandingResolver /></MaintenanceWall>} />
          <Route path="/home"          element={<MaintenanceWall><OnboardingWall><HomeScreen /></OnboardingWall></MaintenanceWall>} />
          <Route path="/web-manager/*" element={<MaintenanceWall><WebManagerGate><WebManager /></WebManagerGate></MaintenanceWall>} />
          <Route path="/*"             element={<MaintenanceWall><OnboardingWall><PortalLayout /></OnboardingWall></MaintenanceWall>} />
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
