import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react'
import { PublicClientApplication } from '@azure/msal-browser'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { msalConfig } from './authConfig'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import InitialLoader from './components/InitialLoader'
import { getLifecycleLabel, TERMINATED_STATES } from './utils/staffLifecycle'
import { logSecurityEvent } from './utils/audit'

const PORTAL_BUILD_VERSION = typeof __PORTAL_BUILD_VERSION__ !== 'undefined' ? __PORTAL_BUILD_VERSION__ : 'dev'

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
const ClientPipeline = lazyRetry(() => import('./pages/ClientPipeline'), 'client-pipeline')
const WorkflowAutomation = lazyRetry(() => import('./pages/WorkflowAutomation'), 'workflow-automation')
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
const SmsCentre = lazyRetry(() => import('./pages/SmsCentre'), 'sms-centre')
const EmailTemplates = lazyRetry(() => import('./pages/EmailTemplates'), 'email-templates')
const Banners = lazyRetry(() => import('./pages/Banners'), 'banners')
const Domains = lazyRetry(() => import('./pages/Domains'), 'domains')
const Competitor = lazyRetry(() => import('./pages/Competitor'), 'competitor')
const Maintenance = lazyRetry(() => import('./pages/Maintenance'), 'maintenance')
const HRLeave = lazyRetry(() => import('./pages/hr/HRLeave'), 'hr-leave')
const HRTimesheets = lazyRetry(() => import('./pages/hr/HRTimesheets'), 'hr-timesheets')
const HRPayslips = lazyRetry(() => import('./pages/hr/HRPayslips'), 'hr-payslips')
const HRProfiles = lazyRetry(() => import('./pages/hr/HRProfiles'), 'hr-profiles')
const HRPolicies = lazyRetry(() => import('./pages/hr/HRPolicies'), 'hr-policies')
const HRDocuments = lazyRetry(() => import('./pages/hr/HRDocuments'), 'hr-documents')
const HRComplianceRules = lazyRetry(() => import('./pages/hr/HRComplianceRules'), 'hr-compliance-rules')
const HRTrainingCatalogue = lazyRetry(() => import('./pages/hr/HRTrainingCatalogue'), 'hr-training-catalogue')
const HROnboarding = lazyRetry(() => import('./pages/hr/HROnboarding'), 'hr-onboarding')
const RecruitingDashboard = lazyRetry(() => import('./pages/RecruitingDashboard'), 'recruiting-dashboard')
const RecruitingJobs = lazyRetry(() => import('./pages/RecruitingJobs'), 'recruiting-jobs')
const RecruitingJobEditor = lazyRetry(() => import('./pages/RecruitingJobEditor'), 'recruiting-job-editor')
const RecruitingApplications = lazyRetry(() => import('./pages/RecruitingApplications'), 'recruiting-applications')
const RecruitingApplicationProfile = lazyRetry(() => import('./pages/RecruitingApplicationProfile'), 'recruiting-application-profile')
const RecruitingBoard = lazyRetry(() => import('./pages/RecruitingBoard'), 'recruiting-board')
const RecruitingSettings = lazyRetry(() => import('./pages/RecruitingSettings'), 'recruiting-settings')
const Appointments = lazyRetry(() => import('./pages/Appointments'), 'appointments')
const PDFWorkspace = lazyRetry(() => import('./pages/PDFWorkspace'), 'pdf-workspace')
const PublicBookingPage = lazyRetry(() => import('./pages/PublicBookingPage'), 'public-booking')
const MailingList = lazyRetry(() => import('./pages/MailingList'), 'mailing-list')
const AuditLog = lazyRetry(() => import('./pages/AuditLog'), 'audit-log')
const Settings = lazyRetry(() => import('./pages/Settings'), 'settings')
const Notifications = lazyRetry(() => import('./pages/Notifications'), 'notifications')
const ShopOrders = lazyRetry(() => import('./pages/shop/ShopOrders'), 'shop-orders')
const ShopProducts = lazyRetry(() => import('./pages/shop/ShopProducts'), 'shop-products')
const ShopCustomers = lazyRetry(() => import('./pages/shop/ShopCustomers'), 'shop-customers')

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

function AccountSuspendedLock() {
  const { accountSecurity } = useAuth()
  return (
    <div className="fade-in" style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', background:'var(--bg2)' }}>
      <div className="card card-pad" style={{ maxWidth:640, width:'100%', textAlign:'center', border:'2px solid var(--red)' }}>
        <div style={{ fontSize:44, marginBottom:12 }}>⛔</div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:30, fontWeight:400, color:'var(--text)', marginBottom:10 }}>
          Portal Access Suspended
        </div>
        <div style={{ fontSize:14, color:'var(--sub)', lineHeight:1.7, marginBottom:14 }}>
          This account has been suspended from the staff portal. Contact DH Website Services if you believe this is incorrect.
        </div>
        {accountSecurity?.lock_reason ? (
          <div style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)', fontSize:13, color:'var(--text)', lineHeight:1.6 }}>
            {accountSecurity.lock_reason}
          </div>
        ) : null}
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
  const { maintenance, isAdmin, lifecycle, portalAccessLocked, loading } = useAuth()
  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (portalAccessLocked) return <AccountSuspendedLock />
  if (TERMINATED_STATES.has(lifecycle?.state)) return <LifecycleLock />
  if (maintenance?.enabled && !isAdmin) return <MaintenanceLock />
  return children
}

function RouteAccessRedirect() {
  const { workspaceHome, isOnboarding } = useAuth()
  if (isOnboarding) return <HROnboarding />
  const target = workspaceHome || '/dashboard'
  return <Navigate to={target} replace />
}

function PermissionGate({ permKey, children, allowDuringOnboarding = false }) {
  const { can, loading, isOnboarding, user } = useAuth()
  const location = useLocation()
  const loggedDeniedRef = useRef('')
  const allowed = !permKey || can(permKey)

  useEffect(() => {
    if (loading || allowed) {
      loggedDeniedRef.current = ''
      return
    }
    const deniedKey = `${user?.email || 'unknown'}:${permKey || 'unknown'}:${location.pathname}`
    if (loggedDeniedRef.current === deniedKey) return
    loggedDeniedRef.current = deniedKey
    logSecurityEvent({
      userEmail: user?.email || '',
      userName: user?.name || user?.email || '',
      action: 'route_access_denied',
      target: 'route_guard',
      targetId: location.pathname,
      scope: 'authorization',
      outcome: 'denied',
      riskLevel: 'medium',
      details: {
        permission_key: permKey || '',
        path: location.pathname,
        reason: 'missing_permission',
      },
    }).catch(() => {})
  }, [allowed, loading, location.pathname, permKey, user?.email, user?.name])

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (isOnboarding && !allowDuringOnboarding) return <HROnboarding />
  if (allowed) return children
  return <RouteAccessRedirect />
}

function WebManagerGate({ children }) {
  const { can, loading, isOnboarding, isAdmin, user } = useAuth()
  const location = useLocation()
  const loggedDeniedRef = useRef('')
  const allowed = isAdmin || can('website_editor') || can('clientmgmt')

  useEffect(() => {
    if (loading || allowed) {
      loggedDeniedRef.current = ''
      return
    }
    const deniedKey = `${user?.email || 'unknown'}:web-manager:${location.pathname}`
    if (loggedDeniedRef.current === deniedKey) return
    loggedDeniedRef.current = deniedKey
    logSecurityEvent({
      userEmail: user?.email || '',
      userName: user?.name || user?.email || '',
      action: 'route_access_denied',
      target: 'route_guard',
      targetId: location.pathname,
      scope: 'authorization',
      outcome: 'denied',
      riskLevel: 'medium',
      details: {
        permission_key: 'website_editor|clientmgmt|admin',
        path: location.pathname,
        reason: 'missing_web_manager_access',
      },
    }).catch(() => {})
  }, [allowed, loading, location.pathname, user?.email, user?.name])

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (isOnboarding) return <HROnboarding />
  if (allowed) return children
  return <RouteAccessRedirect />
}

function DesktopCursor() {
  const [enabled, setEnabled] = useState(false)
  const cursorRef = useRef(null)
  const frameRef = useRef(0)
  const pointerRef = useRef({ x: 0, y: 0 })
  const activatedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined

    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1025px)')
    const updateEnabled = () => {
      setEnabled(mediaQuery.matches)
      if (!mediaQuery.matches) {
        document.documentElement.classList.remove('custom-cursor-active')
        activatedRef.current = false
      }
      if (!mediaQuery.matches && cursorRef.current) {
        cursorRef.current.style.opacity = '0'
      }
    }

    updateEnabled()
    mediaQuery.addEventListener?.('change', updateEnabled)
    mediaQuery.addListener?.(updateEnabled)

    return () => {
      mediaQuery.removeEventListener?.('change', updateEnabled)
      mediaQuery.removeListener?.(updateEnabled)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return undefined

    const activateCursor = () => {
      if (!activatedRef.current) {
        activatedRef.current = true
        document.documentElement.classList.add('custom-cursor-active')
      }
    }

    const renderCursor = () => {
      frameRef.current = 0
      if (!cursorRef.current) return
      cursorRef.current.style.transform = `translate3d(${pointerRef.current.x}px, ${pointerRef.current.y}px, 0)`
    }

    const handlePointerMove = (event) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
      activateCursor()
      if (cursorRef.current) {
        cursorRef.current.style.opacity = '1'
      }
      if (!frameRef.current) {
        frameRef.current = window.requestAnimationFrame(renderCursor)
      }
    }

    const handleLeave = () => {
      if (cursorRef.current) {
        cursorRef.current.style.opacity = '0'
      }
    }

    const handlePointerEnter = (event) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
      activateCursor()
      if (cursorRef.current) {
        cursorRef.current.style.opacity = '1'
        cursorRef.current.style.transform = `translate3d(${pointerRef.current.x}px, ${pointerRef.current.y}px, 0)`
      }
    }

    const handleWindowBlur = () => {
      if (cursorRef.current) {
        cursorRef.current.style.opacity = '0'
      }
      document.documentElement.classList.remove('custom-cursor-active')
      activatedRef.current = false
    }

    document.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.addEventListener('pointerover', handlePointerEnter, { passive: true })
    window.addEventListener('mouseleave', handleLeave)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = 0
      }
      document.documentElement.classList.remove('custom-cursor-active')
      activatedRef.current = false
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerover', handlePointerEnter)
      window.removeEventListener('mouseleave', handleLeave)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <div
      ref={cursorRef}
      className="desktop-cursor"
      style={{
        opacity: 0,
      }}
      aria-hidden="true"
    >
      <img src="/dh-logo-icon.png" alt="" />
    </div>
  )
}

function AmbientBackground() {
  return (
    <div className="portal-ambient" aria-hidden="true">
      <div className="portal-ambient-grid" />
      <div className="portal-ambient-trails">
        <span className="portal-ambient-trail trail-1" />
        <span className="portal-ambient-trail trail-2" />
        <span className="portal-ambient-trail trail-3" />
        <span className="portal-ambient-trail trail-4" />
        <span className="portal-ambient-trail trail-5" />
        <span className="portal-ambient-trail trail-6" />
        <span className="portal-ambient-trail trail-7" />
        <span className="portal-ambient-trail trail-8" />
      </div>
      <div className="portal-ambient-orb-field">
        <div className="portal-ambient-orb portal-ambient-orb-a" />
        <div className="portal-ambient-orb portal-ambient-orb-b" />
        <div className="portal-ambient-orb portal-ambient-orb-c" />
      </div>
    </div>
  )
}

function PortalUpdateWatcher() {
  const { user } = useAuth()
  const [release, setRelease] = useState(null)
  const [updating, setUpdating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [currentAsset, setCurrentAsset] = useState('')

  useEffect(() => {
    if (!user?.email) return undefined

    let disposed = false
    const dismissed = new Set()

    const checkVersion = async () => {
      try {
        const response = await fetch(`/version.json?ts=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        })
        if (!response.ok) return
        const payload = await response.json()
        const latestVersion = String(payload?.version || '').trim()
        if (!latestVersion || latestVersion === PORTAL_BUILD_VERSION) return
        const dismissKey = `portal-update-dismissed:${user.email}:${latestVersion}`
        if (dismissed.has(dismissKey) || window.sessionStorage.getItem(dismissKey) === '1') return
        const manifestResponse = await fetch(`/update-manifest.json?ts=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        })
        const manifest = manifestResponse.ok ? await manifestResponse.json().catch(() => null) : null
        if (!disposed) {
          setRelease({
            version: latestVersion,
            builtAt: payload?.built_at || '',
            assets: Array.isArray(manifest?.assets) ? manifest.assets : [],
          })
        }
      } catch (_) {
        // ignore transient version polling failures
      }
    }

    checkVersion()
    const interval = window.setInterval(checkVersion, 60 * 1000)
    return () => {
      disposed = true
      window.clearInterval(interval)
    }
  }, [user?.email])

  useEffect(() => {
    if (!updating) return undefined
    let cancelled = false

    const preloadAssets = async () => {
      try {
        const assets = Array.isArray(release?.assets) ? release.assets : []
        const totalKnownBytes = assets.reduce((sum, asset) => sum + (Number(asset.size) || 0), 0)
        let downloadedBytes = 0

        setProgress(2)
        setProgressMessage('Preparing update package')
        setCurrentAsset('')

        for (let index = 0; index < assets.length; index += 1) {
          if (cancelled) return
          const asset = assets[index]
          const assetUrl = `${asset.file}${asset.file.includes('?') ? '&' : '?'}v=${encodeURIComponent(release?.version || '')}`
          setProgressMessage(`Downloading ${index + 1} of ${assets.length}`)
          setCurrentAsset(asset.file)

          const response = await fetch(assetUrl, {
            cache: 'reload',
            credentials: 'same-origin',
          })
          if (!response.ok) {
            throw new Error(`Asset download failed for ${asset.file}`)
          }

          const contentLength = Number(response.headers.get('content-length') || asset.size || 0)
          if (!response.body || typeof response.body.getReader !== 'function') {
            await response.arrayBuffer()
            downloadedBytes += contentLength
          } else {
            const reader = response.body.getReader()
            let localBytes = 0
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              const chunkBytes = value?.byteLength || 0
              localBytes += chunkBytes
              const aggregate = downloadedBytes + localBytes
              if (totalKnownBytes > 0) {
                setProgress(Math.max(4, Math.min(92, Math.round((aggregate / totalKnownBytes) * 100))))
              } else {
                setProgress(Math.max(4, Math.min(92, Math.round(((index + 0.5) / Math.max(assets.length, 1)) * 100))))
              }
            }
            downloadedBytes += localBytes || contentLength
          }

          if (totalKnownBytes > 0) {
            setProgress(Math.max(4, Math.min(92, Math.round((downloadedBytes / totalKnownBytes) * 100))))
          } else {
            setProgress(Math.max(4, Math.min(92, Math.round(((index + 1) / Math.max(assets.length, 1)) * 100))))
          }
        }

        if (cancelled) return
        setProgressMessage('Installing update')
        setCurrentAsset('Refreshing the portal shell')
        setProgress(97)
        await new Promise((resolve) => window.setTimeout(resolve, 450))
        setProgress(100)
        window.location.reload()
      } catch (error) {
        console.warn('Portal update preload failed:', error)
        setProgressMessage('Could not pre-download all files. Reloading now.')
        setCurrentAsset('')
        setProgress(100)
        window.setTimeout(() => {
          window.location.reload()
        }, 500)
      }
    }

    preloadAssets()
    return () => {
      cancelled = true
    }
  }, [release, updating])

  if (!release) return null

  const dismissUpdate = () => {
    const dismissKey = `portal-update-dismissed:${user?.email}:${release.version}`
    window.sessionStorage.setItem(dismissKey, '1')
    setRelease(null)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(6,12,24,0.18)', backdropFilter:'blur(8px)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px' }}>
      <div className="card card-pad" style={{ maxWidth:520, width:'100%', border:'1px solid var(--accent-border)', boxShadow:'0 32px 90px rgba(22,34,61,0.14)' }}>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--faint)', marginBottom:8 }}>Portal update</div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:30, lineHeight:1.05, color:'var(--text)', marginBottom:10 }}>
          New portal update available
        </div>
        <div style={{ fontSize:14, color:'var(--sub)', lineHeight:1.7, marginBottom:16 }}>
          A newer version of the staff portal has been deployed. Update now to load the latest features and fixes.
        </div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
          <span className="badge badge-blue">{release.version}</span>
          {release.builtAt ? <span className="badge badge-grey">{new Date(release.builtAt).toLocaleString('en-GB')}</span> : null}
        </div>
        {updating ? (
          <div style={{ marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{progressMessage || 'Downloading update'}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--accent)' }}>{progress}%</div>
            </div>
            <div style={{ height:10, borderRadius:999, background:'var(--bg2)', overflow:'hidden', border:'1px solid var(--border)' }}>
              <div style={{ height:'100%', width:`${progress}%`, background:'linear-gradient(90deg, var(--accent), #7ab7ff)', transition:'width 120ms linear' }} />
            </div>
            {currentAsset ? (
              <div style={{ fontSize:12, color:'var(--sub)', marginTop:8, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {currentAsset}
              </div>
            ) : null}
          </div>
        ) : null}
        <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
          {!updating ? <button className="btn btn-secondary" onClick={dismissUpdate}>Later</button> : null}
          <button className="btn btn-primary" onClick={() => setUpdating(true)} disabled={updating}>
            {updating ? 'Applying update...' : 'Update now'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PortalLayout() {
  return (
    <div className="app-layout">
      <DesktopCursor />
      <Sidebar />
      <div className="main-area">
        <AmbientBackground />
        <Header />
        <PortalUpdateWatcher />
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
              <Route path="/client-pipeline" element={<PermissionGate permKey="clients"><ClientPipeline /></PermissionGate>} />
              <Route path="/workflow-automation" element={<PermissionGate permKey="reports"><WorkflowAutomation /></PermissionGate>} />
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
              <Route path="/sms-centre"      element={<PermissionGate permKey="sms_manager"><SmsCentre /></PermissionGate>} />
              <Route path="/email-templates" element={<PermissionGate permKey="emailtemplates"><EmailTemplates /></PermissionGate>} />
              <Route path="/banners"         element={<PermissionGate permKey="banners"><Banners /></PermissionGate>} />
              <Route path="/domains"         element={<PermissionGate permKey="domains"><Domains /></PermissionGate>} />
              <Route path="/competitor"      element={<PermissionGate permKey="competitor"><Competitor /></PermissionGate>} />
              <Route path="/maintenance"     element={<PermissionGate permKey="maintenance"><Maintenance /></PermissionGate>} />
              <Route path="/hr/leave"        element={<PermissionGate permKey="hr_leave"><HRLeave /></PermissionGate>} />
              <Route path="/hr/timesheets"   element={<PermissionGate permKey="hr_timesheet"><HRTimesheets /></PermissionGate>} />
              <Route path="/hr/payslips"     element={<PermissionGate permKey="hr_payslips"><HRPayslips /></PermissionGate>} />
              <Route path="/hr/profiles"     element={<PermissionGate permKey="hr_profiles"><HRProfiles /></PermissionGate>} />
              <Route path="/hr/policies"     element={<PermissionGate permKey="hr_policies"><HRPolicies /></PermissionGate>} />
              <Route path="/hr/documents"    element={<PermissionGate permKey="hr_documents"><HRDocuments /></PermissionGate>} />
              <Route path="/hr/compliance-rules" element={<PermissionGate permKey="hr_documents"><HRComplianceRules /></PermissionGate>} />
              <Route path="/hr/training-catalogue" element={<PermissionGate permKey="hr_documents"><HRTrainingCatalogue /></PermissionGate>} />
              <Route path="/hr/onboarding"   element={<PermissionGate permKey="hr_onboarding" allowDuringOnboarding><HROnboarding /></PermissionGate>} />
              <Route path="/recruiting"     element={<PermissionGate permKey="recruiting_jobs"><RecruitingJobs /></PermissionGate>} />
              <Route path="/recruiting/jobs" element={<PermissionGate permKey="recruiting_jobs"><RecruitingJobs /></PermissionGate>} />
              <Route path="/recruiting/jobs/:id" element={<PermissionGate permKey="recruiting_jobs"><RecruitingJobEditor /></PermissionGate>} />
              <Route path="/recruiting/applications" element={<PermissionGate permKey="recruiting_applications"><RecruitingApplications /></PermissionGate>} />
              <Route path="/recruiting/applications/:id" element={<PermissionGate permKey="recruiting_applications"><RecruitingApplicationProfile /></PermissionGate>} />
              <Route path="/recruiting/board" element={<PermissionGate permKey="recruiting_board"><RecruitingBoard /></PermissionGate>} />
              <Route path="/recruiting/settings" element={<PermissionGate permKey="recruiting_settings"><RecruitingSettings /></PermissionGate>} />
              <Route path="/appointments"    element={<PermissionGate permKey="appointments"><Appointments /></PermissionGate>} />
              <Route path="/pdf-workspace"   element={<PermissionGate permKey="pdf_workspace"><PDFWorkspace /></PermissionGate>} />
              <Route path="/mailing-list"    element={<PermissionGate permKey="mailinglist"><MailingList /></PermissionGate>} />
              <Route path="/audit"           element={<PermissionGate permKey="audit"><AuditLog /></PermissionGate>} />
              <Route path="/settings"        element={<PermissionGate permKey="settings"><Settings /></PermissionGate>} />
              <Route path="/notifications"   element={<PermissionGate permKey="notifications"><Notifications /></PermissionGate>} />
              <Route path="/shop/orders"     element={<PermissionGate permKey="shop_orders_view"><ShopOrders /></PermissionGate>} />
              <Route path="/shop/customers"  element={<PermissionGate permKey="shop_customers_view"><ShopCustomers /></PermissionGate>} />
              <Route path="/shop/products"   element={<PermissionGate permKey="shop_products_view"><ShopProducts /></PermissionGate>} />
              <Route path="*"               element={<PermissionGate permKey="dashboard"><Dashboard /></PermissionGate>} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}

function LandingResolver() {
  const { loading, isOnboarding, workspaceHome } = useAuth()

  if (loading) return <RouteLoader />
  if (isOnboarding) return <HROnboarding />
  return <Navigate to={workspaceHome || '/dashboard'} replace />
}

function AuthenticatedApp() {
  return (
    <AuthProvider>
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/book/:slug"     element={<PublicBookingPage />} />
          <Route path="/"              element={<MaintenanceWall><LandingResolver /></MaintenanceWall>} />
          <Route path="/workspace"     element={<MaintenanceWall><LandingResolver /></MaintenanceWall>} />
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
        <InitialLoader />
        <AuthenticatedTemplate><AuthenticatedApp /></AuthenticatedTemplate>
        <UnauthenticatedTemplate>
          <Suspense fallback={<RouteLoader />}>
            <Routes>
              <Route path="/book/:slug" element={<PublicBookingPage />} />
              <Route path="*" element={<LoginPage />} />
            </Routes>
          </Suspense>
        </UnauthenticatedTemplate>
      </BrowserRouter>
    </MsalProvider>
  )
}
