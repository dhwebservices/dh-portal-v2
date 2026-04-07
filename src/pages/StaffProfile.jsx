import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useMsal } from '@azure/msal-react'
import ProfileTimeline from '../components/ProfileTimeline'
import { mergeHrProfileWithOnboarding, normalizeEmail, pickBestProfileRow, syncOnboardingSubmissionToHrProfile } from '../utils/hrProfileSync'
import { sendManagedNotification } from '../utils/notificationPreferences'
import {
  ACCENT_SCHEMES,
  buildPreferenceSettingKey,
  CONTRAST_OPTIONS,
  DEFAULT_LANDING_OPTIONS,
  DASHBOARD_DENSITY_OPTIONS,
  DASHBOARD_HEADER_OPTIONS,
  DASHBOARD_SECTIONS,
  DEFAULT_PORTAL_PREFERENCES,
  MOTION_OPTIONS,
  NAV_DENSITY_OPTIONS,
  NOTIFICATION_CATEGORY_OPTIONS,
  NOTIFICATION_DELIVERY_OPTIONS,
  QUICK_ACTION_OPTIONS,
  TEXT_SCALE_OPTIONS,
  WORKSPACE_PRESET_OPTIONS,
  applyWorkspacePreset,
  describeWorkspacePreset,
  mergePortalPreferences,
} from '../utils/portalPreferences'
import {
  buildLifecycleSettingKey,
  DIRECTOR_EMAILS,
  getLifecycleLabel,
  getLifecycleMeta,
  LIFECYCLE_STATES,
  OFFBOARDING_ITEMS,
  mergeLifecycleRecord,
} from '../utils/staffLifecycle'
import {
  buildDepartmentCatalogKey,
  buildDepartmentRequestKey,
  buildStaffOrgKey,
  createDepartmentRequest,
  getManagedDepartments,
  getRoleScopeLabel,
  mergeDepartmentCatalog,
  mergeOrgRecord,
  ORG_ROLE_SCOPES,
} from '../utils/orgStructure'
import {
  buildComplianceSettingKey,
  mergeComplianceRecord,
  resolveRightToWorkRecord,
} from '../utils/complianceRecords'
import { createTrainingTemplate } from '../utils/trainingCatalogue'
import {
  buildManagerCheckInKey,
  buildProbationReviewKey,
  buildStaffGoalKey,
  buildTrainingRecordKey,
  CHECK_IN_STATUS_OPTIONS,
  createManagerCheckIn,
  createProbationReview,
  createStaffGoal,
  createTrainingRecord,
  getCheckInStatusLabel,
  getGoalStatusLabel,
  getReviewTypeLabel,
  getTrainingCategoryLabel,
  getTrainingStatusLabel,
  GOAL_STATUS_OPTIONS,
  REVIEW_STATUS_OPTIONS,
  REVIEW_TYPE_OPTIONS,
  TRAINING_CATEGORY_OPTIONS,
  TRAINING_STATUS_OPTIONS,
} from '../utils/peopleOps'
import {
  buildContractMergeFields,
  buildContractFileName,
  buildContractPdfBlob,
  buildContractTemplateKey,
  buildStaffContractKey,
  buildSignedContractHtml,
  CONTRACT_PLACEHOLDERS,
  createPortalSignature,
  createContractTemplate,
  createStaffContract,
  getContractStatusLabel,
  renderContractHtml,
} from '../utils/contracts'
import { sendEmail } from '../utils/email'
import { buildStaff360Timeline, buildStaffProfileCompleteness, formatProfileTimelineDate } from '../utils/profileTimeline'

function formatTimelineDate(value) {
  if (!value) return 'Unknown time'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildTerminationEmailHtml({ greeting = 'there', body = '', ctaHref = '', ctaLabel = 'Open staff portal' } = {}) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;padding:32px;color:#0f172a;line-height:1.7;">
      <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">DH Website Services</div>
      <h2 style="margin:0 0 12px;font-size:24px;">Employment update</h2>
      <p>Hi ${greeting},</p>
      <p>${body}</p>
      ${ctaHref ? `<p style="margin-top:24px;"><a href="${ctaHref}" style="display:inline-block;padding:12px 20px;background:#1A56DB;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;">${ctaLabel}</a></p>` : ''}
      <p style="margin-top:24px;">If you have any questions, please contact DH Website Services.</p>
    </div>
  `
}

const ALL_PAGES = [
  {key:'dashboard',     label:'Dashboard',          group:'Home', category:'Core', desc:'Main overview and stats'},
  {key:'notifications', label:'Notifications',      group:'Home', category:'Core', desc:'Inbox and alerts'},
  {key:'my_profile',    label:'My Profile',         group:'Home', category:'Core', desc:'Personal account page'},
  {key:'search',        label:'Search',             group:'Home', category:'Core', desc:'Portal-wide search'},
  {key:'my_team',       label:'View My Team',       group:'Home', category:'Core', desc:'Read-only team view'},
  {key:'my_department', label:'My Department',      group:'Home', category:'Core', desc:'Department workspace'},
  {key:'outreach',      label:'Clients Contacted',  group:'Business'},
  {key:'clients',       label:'Onboarded Clients',  group:'Business'},
  {key:'clientmgmt',    label:'Client Portal',      group:'Business'},
  {key:'support',       label:'Support',            group:'Business'},
  {key:'competitor',    label:'Competitor Lookup',  group:'Business'},
  {key:'domains',       label:'Domain Checker',     group:'Business'},
  {key:'proposals',     label:'Proposal Builder',   group:'Business'},
  {key:'sendemail',     label:'Send Email',         group:'Business'},
  {key:'tasks',         label:'Manage Tasks',       group:'Tasks'},
  {key:'mytasks',       label:'My Tasks',           group:'Tasks'},
  {key:'schedule',      label:'Schedule',           group:'Tasks'},
  {key:'appointments',  label:'Appointments',       group:'Tasks'},
  {key:'hr_onboarding', label:'HR Onboarding',      group:'HR'},
  {key:'hr_leave',      label:'HR Leave',           group:'HR'},
  {key:'hr_payslips',   label:'HR Payslips',        group:'HR'},
  {key:'hr_profiles',   label:'HR Profiles',        group:'HR', category:'Records', desc:'Core employee records and employment details'},
  {key:'hr_policies',   label:'HR Policies',        group:'HR'},
  {key:'hr_documents',  label:'HR Documents',       group:'HR', category:'Records', desc:'Document coverage and expiry checks'},
  {key:'hr_timesheet',  label:'HR Timesheets',      group:'HR'},
  {key:'contract_templates', label:'Contract Templates', group:'HR', category:'Records', desc:'HR contract template library'},
  {key:'contract_queue', label:'Contract Queue', group:'HR', category:'Records', desc:'Issued contracts and signing progress'},
  {key:'org_chart',     label:'Org Chart',          group:'HR', category:'Structure', desc:'Live reporting lines'},
  {key:'recruiting_dashboard', label:'Recruiting Dashboard', group:'Hiring', category:'Pipeline', desc:'Hiring overview and live applicant activity'},
  {key:'recruiting_jobs', label:'Recruiting Jobs', group:'Hiring', category:'Pipeline', desc:'Manage published roles and drafts'},
  {key:'recruiting_applications', label:'Recruiting Applications', group:'Hiring', category:'Pipeline', desc:'Full applicant inbox and review surface'},
  {key:'recruiting_board', label:'Recruiting Board', group:'Hiring', category:'Pipeline', desc:'Kanban hiring pipeline'},
  {key:'recruiting_settings', label:'Recruiting Settings', group:'Hiring', category:'Control', desc:'Question bank and default hiring copy'},
  {key:'staff',         label:'My Staff',           group:'Admin'},
  {key:'reports',       label:'Reports',            group:'Admin'},
  {key:'manager_board', label:'Manager Board',      group:'Admin', category:'Control', desc:'Department and workload queue'},
  {key:'departments',   label:'Departments',        group:'Admin', category:'Structure', desc:'Department setup and approvals'},
  {key:'safeguards',    label:'Admin Safeguards',   group:'Admin', category:'Control', desc:'Data integrity and risk checks'},
  {key:'mailinglist',   label:'Mailing List',       group:'Admin'},
  {key:'banners',       label:'Banners',            group:'Admin'},
  {key:'emailtemplates',label:'Email Templates',    group:'Admin'},
  {key:'audit',         label:'Audit Log',          group:'Admin'},
  {key:'maintenance',   label:'Maintenance',        group:'Admin'},
  {key:'settings',      label:'Settings',           group:'Admin'},
  {key:'admin',         label:'Admin',              group:'Admin'},
  {key:'website_editor',label:'Web Manager',        group:'Admin'},
]

const ROLE_DEFAULTS = {
  Director: Object.fromEntries(ALL_PAGES.map(p => [p.key, true])),
  DepartmentManager: Object.fromEntries(ALL_PAGES.filter(p => !['admin','audit','departments','banners','emailtemplates','website_editor','mailinglist','safeguards','maintenance','settings','recruiting_settings'].includes(p.key)).map(p => [p.key, true])),
  Staff:    Object.fromEntries(ALL_PAGES.filter(p => !['admin','audit','reports','manager_board','staff','departments','my_department','banners','emailtemplates','website_editor','mailinglist','safeguards','hr_documents','contract_queue','recruiting_dashboard','recruiting_jobs','recruiting_applications','recruiting_board','recruiting_settings'].includes(p.key)).map(p => [p.key, true])),
  ReadOnly: Object.fromEntries(ALL_PAGES.filter(p => ['dashboard','notifications','my_profile','search','my_team','mytasks','schedule','hr_leave','hr_payslips','hr_policies'].includes(p.key)).map(p => [p.key, true])),
}

const PERMISSION_GROUPS = ['Home', 'Business', 'Tasks', 'HR', 'Hiring', 'Admin']

function countEnabledPermissions(perms) {
  return ALL_PAGES.filter((page) => perms?.[page.key]).length
}

function detectPreset(perms) {
  return Object.entries(ROLE_DEFAULTS).find(([, preset]) =>
    ALL_PAGES.every((page) => !!perms?.[page.key] === !!preset[page.key])
  )?.[0] || 'Custom'
}

function mergeManagedDepartmentScope(orgRecord = {}, departmentCatalog = [], email = '') {
  const safeEmail = String(email || '').toLowerCase().trim()
  const managed = new Set(Array.isArray(orgRecord?.managed_departments) ? orgRecord.managed_departments : [])
  departmentCatalog.forEach((department) => {
    if (String(department?.manager_email || '').toLowerCase().trim() === safeEmail && department?.name) {
      managed.add(department.name)
    }
  })
  if (orgRecord?.role_scope === 'department_manager' && orgRecord?.department) {
    managed.add(orgRecord.department)
  }
  return [...managed].filter(Boolean)
}

export default function StaffProfile() {
  const { email: encodedEmail } = useParams()
  const location = useLocation()
  const email = decodeURIComponent(encodedEmail || '').toLowerCase().trim()
  const navigate = useNavigate()
  const { user, isDirector, isDepartmentManager, managedDepartments, canViewScopedStaff } = useAuth()
  const { instance } = useMsal()

  const [tab, setTab]             = useState('profile')
  const [profile, setProfile]     = useState({})
  const [profileId, setProfileId] = useState(null)
  const [editPerms, setEditPerms] = useState({ ...ROLE_DEFAULTS.Staff })
  const [onboarding, setOnboarding] = useState(false)
  const [bookable, setBookable]   = useState(false)
  const [commissions, setComms]   = useState([])
  const [docs, setDocs]           = useState([])
  const [uploading, setUploading] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [docUploadError, setDocUploadError] = useState('')
  const [docUploadSuccess, setDocUploadSuccess] = useState('')
  const [permId, setPermId]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [sendingNotification, setSendingNotification] = useState(false)
  const [notificationSaved, setNotificationSaved] = useState(false)
  const [notificationHistory, setNotificationHistory] = useState([])
  const [msUsers, setMsUsers]     = useState([])
  const [prevMgr, setPrevMgr]     = useState('')
  const [portalPrefs, setPortalPrefs] = useState(() => mergePortalPreferences(DEFAULT_PORTAL_PREFERENCES))
  const [portalPrefsSaving, setPortalPrefsSaving] = useState(false)
  const [portalPrefsSaved, setPortalPrefsSaved] = useState(false)
  const [lifecycleRecord, setLifecycleRecord] = useState(() => mergeLifecycleRecord())
  const [orgRecord, setOrgRecord] = useState(() => mergeOrgRecord())
  const [originalOrgRecord, setOriginalOrgRecord] = useState(() => mergeOrgRecord())
  const [departmentCatalog, setDepartmentCatalog] = useState([])
  const [departmentRequests, setDepartmentRequests] = useState([])
  const [reviews, setReviews] = useState([])
  const [checkIns, setCheckIns] = useState([])
  const [goals, setGoals] = useState([])
  const [trainingRecords, setTrainingRecords] = useState([])
  const [trainingTemplates, setTrainingTemplates] = useState([])
  const [complianceRecord, setComplianceRecord] = useState(() => mergeComplianceRecord())
  const [complianceSaving, setComplianceSaving] = useState(false)
  const [contractTemplates, setContractTemplates] = useState([])
  const [contracts, setContracts] = useState([])
  const [contractSaving, setContractSaving] = useState(false)
  const [contractError, setContractError] = useState('')
  const [contractSuccess, setContractSuccess] = useState('')
  const [contractForm, setContractForm] = useState({
    templateId: '',
    managerSignatureName: '',
    managerSignatureTitle: '',
    notes: '',
  })
  const [reviewForm, setReviewForm] = useState({
    review_type: 'probation_30',
    due_date: '',
    meeting_date: '',
    meeting_method: 'Teams call',
    status: 'scheduled',
    outcome: '',
    decision: '',
    summary: '',
    manager_notes: '',
    action_plan: '',
  })
  const [checkInForm, setCheckInForm] = useState({
    check_in_date: '',
    status: 'scheduled',
    notes: '',
    follow_up_date: '',
  })
  const [goalForm, setGoalForm] = useState({
    title: '',
    description: '',
    progress: 0,
    due_date: '',
    status: 'active',
  })
  const [trainingForm, setTrainingForm] = useState({
    templateId: '',
    title: '',
    category: 'induction',
    mandatory: true,
    status: 'assigned',
    due_date: '',
    expires_at: '',
    certificate_name: '',
    certificate_url: '',
    notes: '',
  })
  const [peopleOpsSaving, setPeopleOpsSaving] = useState(false)
  const [peopleOpsSaved, setPeopleOpsSaved] = useState(false)
  const [lifecycleSaving, setLifecycleSaving] = useState(false)
  const [lifecycleSaved, setLifecycleSaved] = useState(false)
  const [customNotification, setCustomNotification] = useState({
    title: '',
    message: '',
    type: 'info',
    category: 'general',
    link: '/notifications',
    emailSubject: '',
    important: false,
    pinAsBanner: false,
    bannerTargetPage: 'all',
    bannerExpiresAt: '',
  })
  const fileRef = useRef()

  const fileTypeLabel = (name = '') => {
    const ext = name.split('.').pop()?.toUpperCase()
    return ext ? ext : 'FILE'
  }

  const pf = (k, v) => setProfile(p => ({ ...p, [k]: v }))
  const nf = (k, v) => setCustomNotification((current) => ({ ...current, [k]: v }))
  const gp = (k, v) => setPortalPrefs((current) => mergePortalPreferences(current, { workspacePreset: 'custom', [k]: v }))
  const applyPortalPreset = (presetKey) => setPortalPrefs((current) => applyWorkspacePreset(current, presetKey))
  const setOffboardingField = (key, value) => setLifecycleRecord((current) => ({
    ...current,
    offboarding: {
      ...current.offboarding,
      [key]: value,
      updated_by_email: user?.email || current.offboarding?.updated_by_email || '',
      updated_by_name: user?.name || user?.email || current.offboarding?.updated_by_name || '',
      updated_at: new Date().toISOString(),
    },
  }))
  const toggleOffboardingItem = (key) => setLifecycleRecord((current) => {
    const enabled = !current.offboarding?.[key]
    const atKey = `${key}_at`
    const nextOffboarding = {
      ...current.offboarding,
      [key]: enabled,
      [atKey]: enabled ? new Date().toISOString() : '',
      updated_by_email: user?.email || current.offboarding?.updated_by_email || '',
      updated_by_name: user?.name || user?.email || current.offboarding?.updated_by_name || '',
      updated_at: new Date().toISOString(),
    }
    const completed = OFFBOARDING_ITEMS.every(([itemKey]) => nextOffboarding[itemKey])
    nextOffboarding.completed_at = completed ? (nextOffboarding.completed_at || new Date().toISOString()) : ''
    return {
      ...current,
      offboarding: nextOffboarding,
    }
  })
  const togglePortalSection = (key) => setPortalPrefs((current) => mergePortalPreferences(current, {
    workspacePreset: 'custom',
    dashboardSections: {
      ...current.dashboardSections,
      [key]: !current.dashboardSections?.[key],
    },
  }))
  const togglePortalQuickAction = (key) => setPortalPrefs((current) => {
    const active = current.quickActions || []
    const next = active.includes(key) ? active.filter((item) => item !== key) : [...active, key].slice(0, 6)
    return mergePortalPreferences(current, { workspacePreset: 'custom', quickActions: next })
  })
  const setPortalNotificationDelivery = (category, delivery) => setPortalPrefs((current) => mergePortalPreferences(current, {
    workspacePreset: 'custom',
    notificationPreferences: {
      ...current.notificationPreferences,
      [category]: delivery,
    },
  }))

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!email) return
    loadAll()
    loadMsUsers()
  }, [email])

  useEffect(() => {
    const requestedTab = new URLSearchParams(location.search).get('tab')
    if (requestedTab) setTab(requestedTab)
  }, [location.search])

  const SB_URL = 'https://xtunnfdwltfesscmpove.supabase.co'
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM'
  const sbHeaders = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }

  const sbGet = async (table, query) => {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}&limit=1`, { headers: { ...sbHeaders, 'Accept': 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) ? (data[0] || null) : data
  }

  const sbGetMany = async (table, query) => {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { headers: { ...sbHeaders, 'Accept': 'application/json' } })
    if (!res.ok) return []
    return await res.json()
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const enc = encodeURIComponent(email)
      const [profileRows, perm, comms, docs, onboardingSubmission] = await Promise.all([
        sbGetMany('hr_profiles', `user_email=ilike.${enc}`),
        sbGet('user_permissions', `user_email=ilike.${enc}`),
        sbGetMany('commissions', `staff_email=ilike.${enc}&order=date.desc`),
        sbGetMany('staff_documents', `staff_email=ilike.${enc}&order=created_at.desc`),
        sbGet('onboarding_submissions', `user_email=ilike.${enc}`),
      ])
      const { data: preferenceSetting } = await supabase
        .from('portal_settings')
        .select('value')
        .eq('key', buildPreferenceSettingKey(email))
        .maybeSingle()
      const { data: lifecycleSetting } = await supabase
        .from('portal_settings')
        .select('value')
        .eq('key', buildLifecycleSettingKey(email))
        .maybeSingle()
      const { data: orgSetting } = await supabase
        .from('portal_settings')
        .select('value')
        .eq('key', buildStaffOrgKey(email))
        .maybeSingle()
      const { data: complianceSetting } = await supabase
        .from('portal_settings')
        .select('value')
        .eq('key', buildComplianceSettingKey(email))
        .maybeSingle()
      const { data: departmentCatalogSetting } = await supabase
        .from('portal_settings')
        .select('value')
        .eq('key', buildDepartmentCatalogKey())
        .maybeSingle()
      const { data: requestRows } = await supabase
        .from('portal_settings')
        .select('key,value')
        .like('key', 'department_request:%')
      const { data: templateRows } = await supabase
        .from('portal_settings')
        .select('key,value')
        .like('key', 'contract_template:%')
      const { data: contractRows } = await supabase
        .from('portal_settings')
        .select('key,value')
        .like('key', 'staff_contract:%')
      const { data: reviewRows } = await supabase
        .from('portal_settings')
        .select('key,value')
        .like('key', 'probation_review:%')
      const { data: checkInRows } = await supabase
        .from('portal_settings')
        .select('key,value')
        .like('key', 'manager_checkin:%')
      const { data: goalRows } = await supabase
        .from('portal_settings')
        .select('key,value')
        .like('key', 'staff_goal:%')
      const { data: trainingRows } = await supabase
        .from('portal_settings')
        .select('key,value')
        .like('key', 'training_record:%')
      const { data: trainingTemplateRows } = await supabase
        .from('portal_settings')
        .select('key,value')
        .like('key', 'training_template:%')

      const p = pickBestProfileRow(profileRows || [])
      const mergedProfile = mergeHrProfileWithOnboarding(p || {}, onboardingSubmission)
      const preferenceRaw = preferenceSetting?.value?.value ?? preferenceSetting?.value ?? {}
      const lifecycleRaw = lifecycleSetting?.value?.value ?? lifecycleSetting?.value ?? {}
      const orgRaw = orgSetting?.value?.value ?? orgSetting?.value ?? {}
      const complianceRaw = complianceSetting?.value?.value ?? complianceSetting?.value ?? {}
      const departmentCatalogRaw = departmentCatalogSetting?.value?.value ?? departmentCatalogSetting?.value ?? []
      setPortalPrefs(mergePortalPreferences(DEFAULT_PORTAL_PREFERENCES, preferenceRaw))
      setLifecycleRecord(mergeLifecycleRecord(lifecycleRaw, {
        onboarding: !!perm?.onboarding,
        startDate: mergedProfile.start_date,
        contractType: mergedProfile.contract_type,
      }))
      const nextOrg = mergeOrgRecord(orgRaw, {
        email,
        department: mergedProfile.department,
        isDirector: DIRECTOR_EMAILS.has(email),
      })
      const nextDepartmentCatalog = mergeDepartmentCatalog(departmentCatalogRaw)
      const hydratedOrg = mergeOrgRecord({
        ...nextOrg,
        managed_departments: mergeManagedDepartmentScope(nextOrg, nextDepartmentCatalog, email),
      }, {
        email,
        department: mergedProfile.department,
        isDirector: DIRECTOR_EMAILS.has(email),
      })
      setDepartmentCatalog(nextDepartmentCatalog)
      setOrgRecord(hydratedOrg)
      setOriginalOrgRecord(hydratedOrg)
      setComplianceRecord(mergeComplianceRecord(complianceRaw))
      const nextTemplates = (templateRows || [])
        .map((row) => createContractTemplate({
          id: String(row.key || '').replace('contract_template:', ''),
          ...(row.value?.value ?? row.value ?? {}),
        }))
        .filter((item) => item.active !== false)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      setContractTemplates(nextTemplates)
      const nextContracts = (contractRows || [])
        .map((row) => createStaffContract({
          id: String(row.key || '').replace('staff_contract:', ''),
          ...(row.value?.value ?? row.value ?? {}),
        }))
        .filter((item) => item.staff_email === email)
        .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
      setContracts(nextContracts)
      const nextReviews = (reviewRows || [])
        .map((row) => createProbationReview({
          id: String(row.key || '').replace('probation_review:', ''),
          ...(row.value?.value ?? row.value ?? {}),
        }))
        .filter((item) => item.staff_email === email)
        .sort((a, b) => new Date(a.due_date || a.meeting_date || a.created_at || 0).getTime() - new Date(b.due_date || b.meeting_date || b.created_at || 0).getTime())
      const nextCheckIns = (checkInRows || [])
        .map((row) => createManagerCheckIn({
          id: String(row.key || '').replace('manager_checkin:', ''),
          ...(row.value?.value ?? row.value ?? {}),
        }))
        .filter((item) => item.staff_email === email)
        .sort((a, b) => new Date(b.check_in_date || b.created_at || 0).getTime() - new Date(a.check_in_date || a.created_at || 0).getTime())
      const nextGoals = (goalRows || [])
        .map((row) => createStaffGoal({
          id: String(row.key || '').replace('staff_goal:', ''),
          ...(row.value?.value ?? row.value ?? {}),
        }))
        .filter((item) => item.staff_email === email)
        .sort((a, b) => {
          if (a.status === 'completed' && b.status !== 'completed') return 1
          if (a.status !== 'completed' && b.status === 'completed') return -1
          return new Date(a.due_date || a.created_at || 0).getTime() - new Date(b.due_date || b.created_at || 0).getTime()
        })
      const nextTraining = (trainingRows || [])
        .map((row) => createTrainingRecord({
          id: String(row.key || '').replace('training_record:', ''),
          ...(row.value?.value ?? row.value ?? {}),
        }))
        .filter((item) => item.staff_email === email)
        .sort((a, b) => {
          if (a.status === 'completed' && b.status !== 'completed') return 1
          if (a.status !== 'completed' && b.status === 'completed') return -1
          return new Date(a.due_date || a.created_at || 0).getTime() - new Date(b.due_date || b.created_at || 0).getTime()
        })
      const nextTrainingTemplates = (trainingTemplateRows || [])
        .map((row) => createTrainingTemplate({
          id: String(row.key || '').replace('training_template:', ''),
          ...(row.value?.value ?? row.value ?? {}),
        }))
        .filter((item) => item.active !== false)
        .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
      setReviews(nextReviews)
      setCheckIns(nextCheckIns)
      setGoals(nextGoals)
      setTrainingRecords(nextTraining)
      setTrainingTemplates(nextTrainingTemplates)
      setContractForm((current) => ({
        ...current,
        templateId: current.templateId || nextTemplates[0]?.id || '',
        managerSignatureName: current.managerSignatureName || user?.name || '',
        managerSignatureTitle: current.managerSignatureTitle || getRoleScopeLabel(hydratedOrg.role_scope) || 'Department Manager',
      }))
      setReviewForm((current) => ({
        review_type: current.review_type || 'probation_30',
        due_date: current.due_date || lifecycleRaw?.probation_end_date || mergedProfile.start_date || '',
        meeting_date: current.meeting_date || '',
        meeting_method: current.meeting_method || 'Teams call',
        status: current.status || 'scheduled',
        outcome: current.outcome || '',
        decision: current.decision || '',
        summary: current.summary || '',
        manager_notes: current.manager_notes || '',
        action_plan: current.action_plan || '',
      }))
      setCheckInForm((current) => ({
        check_in_date: current.check_in_date || '',
        status: current.status || 'scheduled',
        notes: current.notes || '',
        follow_up_date: current.follow_up_date || '',
      }))
      setGoalForm((current) => ({
        title: current.title || '',
        description: current.description || '',
        progress: Number.isFinite(Number(current.progress)) ? Number(current.progress) : 0,
        due_date: current.due_date || '',
        status: current.status || 'active',
      }))
      setTrainingForm((current) => ({
        title: current.title || '',
        category: current.category || 'induction',
        mandatory: current.mandatory !== false,
        status: current.status || 'assigned',
        due_date: current.due_date || '',
        expires_at: current.expires_at || '',
        certificate_name: current.certificate_name || '',
        certificate_url: current.certificate_url || '',
        notes: current.notes || '',
      }))
      setDepartmentRequests((requestRows || [])
        .map((row) => createDepartmentRequest({
          id: String(row.key || '').replace('department_request:', ''),
          ...(row.value?.value ?? row.value ?? {}),
        }))
        .filter((request) => request.target_email === email)
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()))

      if (p || onboardingSubmission) {
        setProfile(mergedProfile)
        setProfileId(p?.id || null)
        setPrevMgr(mergedProfile.manager_email || '')
      } else {
        setProfile({})
        setProfileId(null)
        setPrevMgr('')
      }

      if (onboardingSubmission) {
        syncOnboardingSubmissionToHrProfile(onboardingSubmission).catch((err) => {
          console.error('Onboarding sync error:', err)
        })
      }

      if (perm) {
        setPermId(perm.id)
        setEditPerms(perm.permissions && Object.keys(perm.permissions).length ? perm.permissions : { ...ROLE_DEFAULTS.Staff })
        setOnboarding(!!perm.onboarding)
        setBookable(perm.bookable_staff === true)
      } else {
        setPermId(null)
      }

      setComms(comms || [])
      setDocs(docs || [])
      const { data: notificationRows } = await supabase
        .from('notifications')
        .select('*')
        .ilike('user_email', email)
        .order('created_at', { ascending: false })
        .limit(12)
      setNotificationHistory(notificationRows || [])
    } catch (err) {
      console.error('Load error:', err)
    }
    setLoading(false)
  }

  const loadMsUsers = async () => {
    try {
      const account = instance.getAllAccounts()[0]
      if (!account) return
      const token = await instance.acquireTokenSilent({
        scopes: ['https://graph.microsoft.com/User.Read.All'], account
      }).catch(() => instance.acquireTokenPopup({ scopes: ['https://graph.microsoft.com/User.Read.All'], account }))
      const res = await fetch('https://graph.microsoft.com/v1.0/users?$select=displayName,userPrincipalName&$top=50', {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      })
      const data = await res.json()
      setMsUsers((data.value || [])
        .filter(u => u.userPrincipalName?.toLowerCase() !== email)
        .map(u => ({ name: u.displayName, email: u.userPrincipalName?.toLowerCase() })))
    } catch (_) {}
  }

  // ── Save ────────────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true)
    try {
      const preparedOrgRecord = mergeOrgRecord({
        ...orgRecord,
        email,
        department: profile.department,
        reports_to_email: profile.manager_email || '',
        reports_to_name: profile.manager_name || '',
        managed_departments: orgRecord.role_scope === 'department_manager'
          ? mergeManagedDepartmentScope({
              ...orgRecord,
              department: profile.department,
              managed_departments: orgRecord.managed_departments || [],
            }, departmentCatalog, email)
          : (orgRecord.role_scope === 'director' ? [] : (orgRecord.managed_departments || [])),
      }, {
        email,
        department: profile.department,
        isDirector: DIRECTOR_EMAILS.has(email),
      })
      const orgManagedChange = (
        profile.department !== (originalOrgRecord.department || '') ||
        (profile.manager_email || '') !== (originalOrgRecord.reports_to_email || '') ||
        preparedOrgRecord.role_scope !== (originalOrgRecord.role_scope || 'staff') ||
        JSON.stringify([...(preparedOrgRecord.managed_departments || [])].sort()) !== JSON.stringify([...(originalOrgRecord.managed_departments || [])].sort())
      )
      const requiresDirectorApproval = !isDirector && isDepartmentManager && orgManagedChange
      const hrDepartment = requiresDirectorApproval ? (originalOrgRecord.department || '') : (profile.department || null)
      const hrManagerEmail = requiresDirectorApproval ? (originalOrgRecord.reports_to_email || '') : (profile.manager_email || null)
      const hrManagerName = requiresDirectorApproval ? (originalOrgRecord.reports_to_name || '') : (profile.manager_name || null)

      const hrPayload = {
        user_email:     email,
        full_name:      profile.full_name      || null,
        role:           profile.role           || null,
        department:     hrDepartment,
        contract_type:  profile.contract_type  || null,
        start_date:     profile.start_date     || null,
        phone:          profile.phone          || null,
        personal_email: profile.personal_email || null,
        address:        profile.address        || null,
        manager_name:   hrManagerName,
        manager_email:  hrManagerEmail,
        hr_notes:       profile.hr_notes       || null,
        bank_name:      profile.bank_name      || null,
        account_name:   profile.account_name   || null,
        sort_code:      profile.sort_code      || null,
        account_number: profile.account_number || null,
        updated_at:     new Date().toISOString(),
      }

      // Save hr_profiles via raw REST to avoid supabase-js columns= bug
      const existingProfile = profileId
        ? { id: profileId }
        : pickBestProfileRow(await sbGetMany('hr_profiles', `user_email=ilike.${encodeURIComponent(email)}`))

      const hrRes = await fetch(`${SB_URL}/rest/v1/hr_profiles?on_conflict=user_email`, {
        method: 'POST',
        headers: {
          ...sbHeaders,
          'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify([{
          ...(existingProfile?.created_at ? {} : { created_at: new Date().toISOString() }),
          ...hrPayload,
        }]),
      })

      if (!hrRes.ok) {
        const e = await hrRes.text()
        throw new Error('HR save failed: ' + e)
      }

      const savedProfiles = await hrRes.json().catch(() => [])
      const savedProfile = Array.isArray(savedProfiles) ? savedProfiles[0] : savedProfiles
      if (savedProfile?.id) setProfileId(savedProfile.id)
      if (!requiresDirectorApproval) setPrevMgr(profile.manager_email || '')

      // Save user_permissions via raw REST
      const permPayload = { permissions: editPerms, onboarding, bookable_staff: bookable, updated_at: new Date().toISOString() }
      if (permId) {
        const res = await fetch(`${SB_URL}/rest/v1/user_permissions?id=eq.${permId}`, {
          method: 'PATCH', headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify(permPayload)
        })
        if (!res.ok) { const e = await res.text(); throw new Error('Perms update failed: ' + e) }
      } else {
        const res = await fetch(`${SB_URL}/rest/v1/user_permissions`, {
          method: 'POST', headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ ...permPayload, user_email: email })
        })
        if (!res.ok) { const e = await res.text(); throw new Error('Perms insert failed: ' + e) }
        const newPerm = await sbGet('user_permissions', `user_email=ilike.${encodeURIComponent(email)}`)
        if (newPerm?.id) setPermId(newPerm.id)
      }

      if (requiresDirectorApproval) {
        const request = createDepartmentRequest({
          type: !originalOrgRecord.department
            ? 'assign_staff'
            : (profile.department ? 'move_staff' : 'remove_staff'),
          target_email: email,
          target_name: profile.full_name || email,
          current_department: originalOrgRecord.department || '',
          requested_department: profile.department || '',
          requested_role_scope: preparedOrgRecord.role_scope,
          requested_manager_email: profile.manager_email || '',
          requested_manager_name: profile.manager_name || '',
          requested_by_email: user?.email || '',
          requested_by_name: user?.name || '',
          notes: `Requested from staff profile by ${user?.name || user?.email || 'Department manager'}.`,
        })

        const { error: requestError } = await supabase
          .from('portal_settings')
          .upsert({
            key: buildDepartmentRequestKey(request.id),
            value: { value: request },
          }, { onConflict: 'key' })
        if (requestError) throw requestError

        const directorEmails = Array.from(DIRECTOR_EMAILS)
        await Promise.allSettled(directorEmails.map((directorEmail) => sendManagedNotification({
          userEmail: directorEmail,
          userName: directorEmail,
          category: 'urgent',
          type: 'warning',
          title: 'Department approval required',
          message: `${profile.full_name || email} has a department change request waiting for approval.`,
          link: '/departments',
          emailSubject: `Department request approval — ${profile.full_name || email}`,
          sentBy: user?.name || user?.email || 'Department manager',
          forceImportant: true,
          fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        })))

        if (user?.email) {
          await sendManagedNotification({
            userEmail: user.email,
            userName: user.name || user.email,
            category: 'general',
            type: 'info',
            title: 'Department request sent',
            message: `${profile.full_name || email} now has a department change request waiting for Director approval.`,
            link: `/my-staff/${encodeURIComponent(email)}`,
            emailSubject: `Department request sent — ${profile.full_name || email}`,
            sentBy: 'DH Portal',
            fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
          }).catch(() => {})
        }

        setDepartmentRequests((current) => [request, ...current].slice(0, 12))
      } else {
        const { error: orgError } = await supabase
          .from('portal_settings')
          .upsert({
            key: buildStaffOrgKey(email),
            value: { value: preparedOrgRecord },
          }, { onConflict: 'key' })
        if (orgError) throw orgError
        setOrgRecord(preparedOrgRecord)
        setOriginalOrgRecord(preparedOrgRecord)

        if (preparedOrgRecord.role_scope === 'department_manager' && originalOrgRecord.role_scope !== 'department_manager') {
          await sendManagedNotification({
            userEmail: email,
            userName: profile.full_name || email,
            category: 'urgent',
            type: 'success',
            title: 'Department manager assignment',
            message: `You have been assigned as Department Manager for ${preparedOrgRecord.department || 'your department'}.`,
            link: '/my-department',
            emailSubject: `Department manager assignment — ${preparedOrgRecord.department || 'DH Portal'}`,
            sentBy: user?.name || user?.email || 'Director',
            fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
            forceImportant: true,
          }).catch(() => {})
        }
      }

      // Manager change notification — fires when manager genuinely changes
      const newMgr = requiresDirectorApproval ? (originalOrgRecord.reports_to_email || '') : (profile.manager_email || '')
      if (newMgr && newMgr !== prevMgr) {
        const staffName = profile.full_name || email
        try {
          await supabase.from('notifications').insert([{
            user_email: newMgr,
            title: 'New Team Member Assigned',
            message: `${staffName} has been assigned to you as their manager.`,
            type: 'info',
            link: `/my-staff/${encodeURIComponent(email)}`,
            read: false,
            created_at: new Date().toISOString(),
          }])
        } catch (_) {}
        const WORKER = 'https://dh-email-worker.aged-silence-66a7.workers.dev'
          const mgr = profile.manager_name || newMgr
          // Email to manager — independent try/catch so staff email always fires
          try {
            await fetch(WORKER, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'manager_assigned',
                data: { to_email: newMgr, manager_name: mgr, staff_name: staffName, staff_email: email, assigned_by: user?.name || 'Admin' }
              })
            })
          } catch (_) {}
          // Email to staff member — always fires independently
          try {
            await fetch(WORKER, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'staff_manager_assigned',
                data: { to_email: email, staff_name: staffName, manager_name: mgr, manager_email: newMgr, assigned_by: user?.name || 'Admin' }
              })
            })
          } catch (_) {}
        setPrevMgr(newMgr)
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Save error:', err)
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const savePortalPrefs = async () => {
    setPortalPrefsSaving(true)
    try {
      const nextPreferences = mergePortalPreferences(DEFAULT_PORTAL_PREFERENCES, portalPrefs)
      const { error } = await supabase
        .from('portal_settings')
        .upsert({
          key: buildPreferenceSettingKey(email),
          value: { value: nextPreferences },
        }, { onConflict: 'key' })
      if (error) throw error
      setPortalPrefsSaved(true)
      setTimeout(() => setPortalPrefsSaved(false), 3000)
    } catch (error) {
      console.error('Portal preference save failed:', error)
      alert('Could not save staff portal preferences right now.')
    } finally {
      setPortalPrefsSaving(false)
    }
  }

  const saveLifecycleRecord = async (nextRecord = lifecycleRecord, { silent = false } = {}) => {
    setLifecycleSaving(true)
    try {
      const payload = mergeLifecycleRecord(nextRecord, {
        onboarding,
        startDate: profile.start_date,
        contractType: profile.contract_type,
      })
      const { error } = await supabase
        .from('portal_settings')
        .upsert({
          key: buildLifecycleSettingKey(email),
          value: { value: payload },
        }, { onConflict: 'key' })
      if (error) throw error
      setLifecycleRecord(payload)
      if (!silent) {
        setLifecycleSaved(true)
        setTimeout(() => setLifecycleSaved(false), 3000)
      }
      return payload
    } catch (error) {
      console.error('Lifecycle save failed:', error)
      alert('Could not save lifecycle details right now.')
      throw error
    } finally {
      setLifecycleSaving(false)
    }
  }

  const requestTermination = async () => {
    if (!lifecycleRecord.termination.reason?.trim() || !lifecycleRecord.termination.effective_date) {
      alert('Add a termination reason and effective date first.')
      return
    }

    const nextRecord = mergeLifecycleRecord({
      ...lifecycleRecord,
      state: 'termination_requested',
      termination: {
        ...lifecycleRecord.termination,
        status: 'requested',
        requested_by_email: user?.email || '',
        requested_by_name: user?.name || '',
        requested_at: new Date().toISOString(),
        approved_by_email: '',
        approved_by_name: '',
        approved_at: '',
        rejected_at: '',
        rejected_by_email: '',
        rejected_by_name: '',
        rejection_reason: '',
      },
    }, {
      onboarding,
      startDate: profile.start_date,
      contractType: profile.contract_type,
    })

    await saveLifecycleRecord(nextRecord, { silent: true })

    const directorEmails = Array.from(DIRECTOR_EMAILS)
    await Promise.allSettled([
      ...directorEmails.map((directorEmail) => sendManagedNotification({
        userEmail: directorEmail,
        userName: directorEmail,
        category: 'urgent',
        type: 'warning',
        title: 'Termination approval required',
        message: `${displayName} has a termination request awaiting director approval. Effective date: ${lifecycleRecord.termination.effective_date}.`,
        link: `/my-staff/${encodeURIComponent(email)}`,
        emailSubject: `Termination approval required — ${displayName}`,
        sentBy: user?.name || user?.email || 'Portal admin',
        forceImportant: true,
        forceDelivery: 'portal',
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
      })),
      ...directorEmails.map((directorEmail) => sendEmail('custom_email', {
        to: directorEmail,
        from: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        subject: `Termination approval required — ${displayName}`,
        html: buildTerminationEmailHtml({
          greeting: directorEmail.split('@')[0],
          body: `${displayName} has a termination request awaiting director approval. Effective date: ${lifecycleRecord.termination.effective_date}.`,
          ctaHref: `https://staff.dhwebsiteservices.co.uk/my-staff/${encodeURIComponent(email)}`,
          ctaLabel: 'Review termination request',
        }),
        text: `${displayName} has a termination request awaiting director approval. Effective date: ${lifecycleRecord.termination.effective_date}.\n\nOpen: https://staff.dhwebsiteservices.co.uk/my-staff/${encodeURIComponent(email)}`,
        reply_to: 'HR@dhwebsiteservices.co.uk',
      })),
      user?.email
        ? sendManagedNotification({
            userEmail: user.email,
            userName: user.name || user.email,
            category: 'urgent',
            type: 'info',
            title: 'Termination request submitted',
            message: `Your termination request for ${displayName} is now pending director approval.`,
            link: `/my-staff/${encodeURIComponent(email)}`,
            emailSubject: `Termination request pending — ${displayName}`,
            sentBy: user?.name || user?.email || 'Portal admin',
            forceImportant: true,
            forceDelivery: 'portal',
            fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
          })
        : Promise.resolve(),
      user?.email
        ? sendEmail('custom_email', {
            to: user.email,
            from: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
            subject: `Termination request pending — ${displayName}`,
            html: buildTerminationEmailHtml({
              greeting: (user?.name || user?.email || 'there').split(' ')[0],
              body: `Your termination request for ${displayName} is now pending director approval.`,
              ctaHref: `https://staff.dhwebsiteservices.co.uk/my-staff/${encodeURIComponent(email)}`,
              ctaLabel: 'Open staff profile',
            }),
            text: `Your termination request for ${displayName} is now pending director approval.\n\nOpen: https://staff.dhwebsiteservices.co.uk/my-staff/${encodeURIComponent(email)}`,
            reply_to: 'HR@dhwebsiteservices.co.uk',
          })
        : Promise.resolve(),
    ])

    setLifecycleSaved(true)
    setTimeout(() => setLifecycleSaved(false), 3000)
  }

  const decideTermination = async (decision) => {
    const isDirector = DIRECTOR_EMAILS.has(String(user?.email || '').toLowerCase())
    if (!isDirector) {
      alert('Only the director account can approve or reject terminations.')
      return
    }

    const approved = decision === 'approve'
    const nextState = approved ? 'terminated' : 'active'
    const nextRecord = mergeLifecycleRecord({
      ...lifecycleRecord,
      state: nextState,
      termination: {
        ...lifecycleRecord.termination,
        status: approved ? 'approved' : 'rejected',
        approved_by_email: approved ? (user?.email || '') : '',
        approved_by_name: approved ? (user?.name || '') : '',
        approved_at: approved ? new Date().toISOString() : '',
        rejected_by_email: approved ? '' : (user?.email || ''),
        rejected_by_name: approved ? '' : (user?.name || ''),
        rejected_at: approved ? '' : new Date().toISOString(),
      },
      offboarding: approved ? {
        ...lifecycleRecord.offboarding,
        access_revoked: lifecycleRecord.termination.immediate_access_removal ? true : lifecycleRecord.offboarding?.access_revoked,
        access_revoked_at: lifecycleRecord.termination.immediate_access_removal
          ? (lifecycleRecord.offboarding?.access_revoked_at || new Date().toISOString())
          : (lifecycleRecord.offboarding?.access_revoked_at || ''),
        updated_by_email: user?.email || lifecycleRecord.offboarding?.updated_by_email || '',
        updated_by_name: user?.name || user?.email || lifecycleRecord.offboarding?.updated_by_name || '',
        updated_at: new Date().toISOString(),
      } : lifecycleRecord.offboarding,
    }, {
      onboarding,
      startDate: profile.start_date,
      contractType: profile.contract_type,
    })

    await saveLifecycleRecord(nextRecord, { silent: true })

    if (approved) {
      await fetch(`${SB_URL}/rest/v1/user_permissions?user_email=ilike.${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          permissions: {},
          onboarding: false,
          bookable_staff: false,
          updated_at: new Date().toISOString(),
        }),
      }).catch(() => {})
    }

    await Promise.allSettled([
      sendManagedNotification({
        userEmail: email,
        userName: displayName,
        category: 'urgent',
        type: approved ? 'warning' : 'info',
        title: approved ? 'Employment termination approved' : 'Termination request update',
        message: approved
          ? `Your employment status has been updated. Effective date: ${lifecycleRecord.termination.effective_date}.`
          : `The termination request has been rejected by the director.`,
        link: '/my-profile',
        emailSubject: approved ? 'Employment termination approved' : 'Termination request update',
        sentBy: user?.name || user?.email || 'Director',
        forceImportant: true,
        forceDelivery: 'portal',
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
      }),
      sendEmail('custom_email', {
        to: email,
        from: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        subject: approved ? 'Employment termination approved — DH Website Services' : 'Termination request update — DH Website Services',
        html: buildTerminationEmailHtml({
          greeting: displayName.split(' ')[0] || 'there',
          body: approved
            ? `Your employment status has been updated. Effective date: ${lifecycleRecord.termination.effective_date}.`
            : 'The termination request affecting your employment has been rejected by the director.',
          ctaHref: 'https://staff.dhwebsiteservices.co.uk/my-profile',
          ctaLabel: 'Open my profile',
        }),
        text: approved
          ? `Your employment status has been updated. Effective date: ${lifecycleRecord.termination.effective_date}.\n\nOpen: https://staff.dhwebsiteservices.co.uk/my-profile`
          : `The termination request affecting your employment has been rejected by the director.\n\nOpen: https://staff.dhwebsiteservices.co.uk/my-profile`,
        reply_to: 'HR@dhwebsiteservices.co.uk',
      }),
      lifecycleRecord.termination.requested_by_email
        ? sendManagedNotification({
            userEmail: lifecycleRecord.termination.requested_by_email,
            userName: lifecycleRecord.termination.requested_by_name || lifecycleRecord.termination.requested_by_email,
            category: 'urgent',
            type: approved ? 'warning' : 'info',
            title: approved ? 'Termination approved' : 'Termination request rejected',
            message: approved
              ? `Your termination request for ${displayName} has been approved. Effective date: ${lifecycleRecord.termination.effective_date}.`
              : `Your termination request for ${displayName} has been rejected by the director.`,
            link: `/my-staff/${encodeURIComponent(email)}`,
            emailSubject: approved ? `Termination approved — ${displayName}` : `Termination rejected — ${displayName}`,
            sentBy: user?.name || user?.email || 'Director',
            forceImportant: true,
            forceDelivery: 'portal',
            fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
          })
        : Promise.resolve(),
      lifecycleRecord.termination.requested_by_email
        ? sendEmail('custom_email', {
            to: lifecycleRecord.termination.requested_by_email,
            from: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
            subject: approved ? `Termination approved — ${displayName}` : `Termination rejected — ${displayName}`,
            html: buildTerminationEmailHtml({
              greeting: (lifecycleRecord.termination.requested_by_name || lifecycleRecord.termination.requested_by_email || 'there').split(' ')[0],
              body: approved
                ? `Your termination request for ${displayName} has been approved. Effective date: ${lifecycleRecord.termination.effective_date}.`
                : `Your termination request for ${displayName} has been rejected by the director.`,
              ctaHref: `https://staff.dhwebsiteservices.co.uk/my-staff/${encodeURIComponent(email)}`,
              ctaLabel: 'Open staff profile',
            }),
            text: approved
              ? `Your termination request for ${displayName} has been approved. Effective date: ${lifecycleRecord.termination.effective_date}.\n\nOpen: https://staff.dhwebsiteservices.co.uk/my-staff/${encodeURIComponent(email)}`
              : `Your termination request for ${displayName} has been rejected by the director.\n\nOpen: https://staff.dhwebsiteservices.co.uk/my-staff/${encodeURIComponent(email)}`,
            reply_to: 'HR@dhwebsiteservices.co.uk',
          })
        : Promise.resolve(),
      profile.personal_email
        ? sendEmail('custom_email', {
            to: profile.personal_email,
            from: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
            subject: approved ? 'Employment termination approved — DH Website Services' : 'Termination request update — DH Website Services',
            html: buildTerminationEmailHtml({
              greeting: displayName.split(' ')[0] || 'there',
              body: approved
                ? `Your termination has been approved with an effective date of ${lifecycleRecord.termination.effective_date}.`
                : 'The termination request affecting your employment has been rejected by the director.',
            }),
            text: approved
              ? `Your termination has been approved with an effective date of ${lifecycleRecord.termination.effective_date}.`
              : 'The termination request affecting your employment has been rejected by the director.',
            reply_to: 'HR@dhwebsiteservices.co.uk',
          })
        : Promise.resolve(),
    ])

    if (approved) {
      setEditPerms({})
      setOnboarding(false)
      setBookable(false)
    }

    setLifecycleSaved(true)
    setTimeout(() => setLifecycleSaved(false), 3000)
  }

  const resetReviewForm = () => setReviewForm({
    review_type: 'probation_30',
    due_date: lifecycleRecord.probation_end_date || profile.start_date || '',
    meeting_date: '',
    meeting_method: 'Teams call',
    status: 'scheduled',
    outcome: '',
    decision: '',
    summary: '',
    manager_notes: '',
    action_plan: '',
  })

  const resetCheckInForm = () => setCheckInForm({
    check_in_date: '',
    status: 'scheduled',
    notes: '',
    follow_up_date: '',
  })

  const resetGoalForm = () => setGoalForm({
    title: '',
    description: '',
    progress: 0,
    due_date: '',
    status: 'active',
  })

  const resetTrainingForm = () => setTrainingForm({
    templateId: '',
    title: '',
    category: 'induction',
    mandatory: true,
    status: 'assigned',
    due_date: '',
    expires_at: '',
    certificate_name: '',
    certificate_url: '',
    notes: '',
  })

  const applyTrainingTemplate = (templateId) => {
    const template = trainingTemplates.find((item) => item.id === templateId)
    if (!template) {
      setTrainingForm((current) => ({ ...current, templateId: '' }))
      return
    }
    const dueDate = template.default_due_days
      ? new Date(Date.now() + Number(template.default_due_days) * 86400000).toISOString().slice(0, 10)
      : ''
    const expiryDate = template.default_expiry_days
      ? new Date(Date.now() + Number(template.default_expiry_days) * 86400000).toISOString().slice(0, 10)
      : ''
    setTrainingForm((current) => ({
      ...current,
      templateId: template.id,
      title: template.title || current.title,
      category: template.category || current.category,
      mandatory: template.mandatory === true,
      due_date: dueDate,
      expires_at: expiryDate,
      certificate_name: template.certificate_name || '',
      notes: template.notes || '',
    }))
  }

  const savePeopleOpsRecord = async ({ key, value, onSuccess }) => {
    const { error } = await supabase
      .from('portal_settings')
      .upsert({
        key,
        value: { value },
      }, { onConflict: 'key' })
    if (error) throw error
    if (onSuccess) onSuccess(value)
    setPeopleOpsSaved(true)
    setTimeout(() => setPeopleOpsSaved(false), 3000)
    return value
  }

  const scheduleReviewMeeting = async () => {
    if (!reviewForm.meeting_date || !reviewForm.meeting_method.trim()) {
      alert('Add the review meeting date and how the meeting will happen first.')
      return
    }
    setPeopleOpsSaving(true)
    try {
      const review = createProbationReview({
        ...reviewForm,
        staff_email: email,
        staff_name: displayName,
        department: profile.department || orgRecord.department || '',
        manager_email: user?.email || profile.manager_email || orgRecord.reports_to_email || '',
        manager_name: user?.name || profile.manager_name || orgRecord.reports_to_name || '',
        due_date: reviewForm.due_date || reviewForm.meeting_date,
        status: 'meeting_booked',
        updated_at: new Date().toISOString(),
      })
      await savePeopleOpsRecord({
        key: buildProbationReviewKey(review.id),
        value: review,
        onSuccess: (savedReview) => setReviews((current) => [savedReview, ...current.filter((item) => item.id !== savedReview.id)]
          .sort((a, b) => new Date(a.due_date || a.meeting_date || a.created_at || 0).getTime() - new Date(b.due_date || b.meeting_date || b.created_at || 0).getTime())),
      })
      await sendManagedNotification({
        userEmail: email,
        userName: displayName,
        category: 'hr',
        type: 'info',
        title: 'Staff review meeting booked',
        message: `Your ${getReviewTypeLabel(review.review_type).toLowerCase()} has been booked for ${review.meeting_date}${review.meeting_method ? ` via ${review.meeting_method}` : ''} with ${review.manager_name || 'your manager'}.`,
        link: '/my-profile',
        emailSubject: `Staff review booked — ${review.meeting_date}`,
        emailHtml: `
          <p>Hi ${(displayName || email).split(' ')[0] || 'there'},</p>
          <p>Your ${getReviewTypeLabel(review.review_type).toLowerCase()} has been booked.</p>
          <p><strong>Date:</strong> ${review.meeting_date}<br/><strong>Manager:</strong> ${review.manager_name || 'Your manager'}<br/><strong>Meeting method:</strong> ${review.meeting_method}</p>
          <p>Please make sure you are available and prepared for the review meeting.</p>
        `,
        sentBy: user?.name || user?.email || 'Manager',
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        forceImportant: true,
      }).catch(() => {})
      resetReviewForm()
    } catch (error) {
      console.error('Review meeting scheduling failed:', error)
      alert(error.message || 'Could not schedule the review meeting.')
    } finally {
      setPeopleOpsSaving(false)
    }
  }

  const selectReview = (review) => {
    setReviewForm({
      id: review.id,
      review_type: review.review_type || 'probation_30',
      due_date: review.due_date || '',
      meeting_date: review.meeting_date || '',
      meeting_method: review.meeting_method || 'Teams call',
      status: review.status || 'scheduled',
      outcome: review.outcome || '',
      decision: review.decision || '',
      summary: review.summary || '',
      manager_notes: review.manager_notes || '',
      action_plan: review.action_plan || '',
    })
  }

  const saveReviewNotes = async () => {
    if (!reviewForm.id) {
      alert('Select a review from the list first, or schedule a new meeting.')
      return
    }
    setPeopleOpsSaving(true)
    try {
      const existing = reviews.find((item) => item.id === reviewForm.id)
      const review = createProbationReview({
        ...existing,
        ...reviewForm,
        staff_email: email,
        staff_name: displayName,
        department: profile.department || orgRecord.department || '',
        manager_email: user?.email || existing?.manager_email || '',
        manager_name: user?.name || existing?.manager_name || '',
        updated_at: new Date().toISOString(),
      })
      await savePeopleOpsRecord({
        key: buildProbationReviewKey(review.id),
        value: review,
        onSuccess: (savedReview) => setReviews((current) => current.map((item) => item.id === savedReview.id ? savedReview : item)),
      })
    } catch (error) {
      console.error('Review notes save failed:', error)
      alert(error.message || 'Could not save the review notes.')
    } finally {
      setPeopleOpsSaving(false)
    }
  }

  const completeReview = async (outcome) => {
    if (!reviewForm.id) {
      alert('Select the review you want to complete first.')
      return
    }
    setPeopleOpsSaving(true)
    try {
      const existing = reviews.find((item) => item.id === reviewForm.id)
      const review = createProbationReview({
        ...existing,
        ...reviewForm,
        outcome,
        decision: outcome === 'pass' ? 'Passed review' : 'Failed review',
        status: 'completed',
        completed_at: new Date().toISOString(),
        staff_email: email,
        staff_name: displayName,
        department: profile.department || orgRecord.department || '',
        manager_email: user?.email || existing?.manager_email || '',
        manager_name: user?.name || existing?.manager_name || '',
        updated_at: new Date().toISOString(),
      })
      await savePeopleOpsRecord({
        key: buildProbationReviewKey(review.id),
        value: review,
        onSuccess: (savedReview) => setReviews((current) => current.map((item) => item.id === savedReview.id ? savedReview : item)),
      })
      await sendManagedNotification({
        userEmail: email,
        userName: displayName,
        category: 'hr',
        type: outcome === 'pass' ? 'success' : 'warning',
        title: `Staff review outcome: ${outcome === 'pass' ? 'passed' : 'failed'}`,
        message: `Your ${getReviewTypeLabel(review.review_type).toLowerCase()} has been completed by ${review.manager_name || 'your manager'}. Outcome: ${outcome === 'pass' ? 'pass' : 'fail'}.`,
        link: '/my-profile',
        emailSubject: `Staff review outcome — ${outcome === 'pass' ? 'passed' : 'failed'}`,
        emailHtml: `
          <p>Hi ${(displayName || email).split(' ')[0] || 'there'},</p>
          <p>Your ${getReviewTypeLabel(review.review_type).toLowerCase()} has now been completed by ${review.manager_name || 'your manager'}.</p>
          <p><strong>Outcome:</strong> ${outcome === 'pass' ? 'Pass' : 'Fail'}</p>
          ${review.summary ? `<p><strong>Summary:</strong><br/>${review.summary.replace(/\n/g, '<br/>')}</p>` : ''}
          ${review.action_plan ? `<p><strong>Next steps:</strong><br/>${review.action_plan.replace(/\n/g, '<br/>')}</p>` : ''}
        `,
        sentBy: user?.name || user?.email || 'Manager',
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        forceImportant: true,
      }).catch(() => {})
      resetReviewForm()
    } catch (error) {
      console.error('Review completion failed:', error)
      alert(error.message || 'Could not complete the review.')
    } finally {
      setPeopleOpsSaving(false)
    }
  }

  const saveManagerCheckIn = async () => {
    if (!checkInForm.check_in_date) {
      alert('Add a check-in date first.')
      return
    }
    setPeopleOpsSaving(true)
    try {
      const checkIn = createManagerCheckIn({
        ...checkInForm,
        staff_email: email,
        staff_name: displayName,
        department: profile.department || orgRecord.department || '',
        manager_email: user?.email || profile.manager_email || orgRecord.reports_to_email || '',
        manager_name: user?.name || profile.manager_name || orgRecord.reports_to_name || '',
        updated_at: new Date().toISOString(),
      })
      await savePeopleOpsRecord({
        key: buildManagerCheckInKey(checkIn.id),
        value: checkIn,
        onSuccess: (savedCheckIn) => setCheckIns((current) => [savedCheckIn, ...current.filter((item) => item.id !== savedCheckIn.id)]
          .sort((a, b) => new Date(b.check_in_date || b.created_at || 0).getTime() - new Date(a.check_in_date || a.created_at || 0).getTime())),
      })
      resetCheckInForm()
    } catch (error) {
      console.error('Check-in save failed:', error)
      alert(error.message || 'Could not save the manager check-in.')
    } finally {
      setPeopleOpsSaving(false)
    }
  }

  const saveGoal = async () => {
    if (!goalForm.title.trim()) {
      alert('Add a goal title first.')
      return
    }
    setPeopleOpsSaving(true)
    try {
      const goal = createStaffGoal({
        ...goalForm,
        staff_email: email,
        staff_name: displayName,
        department: profile.department || orgRecord.department || '',
        manager_email: user?.email || profile.manager_email || orgRecord.reports_to_email || '',
        manager_name: user?.name || profile.manager_name || orgRecord.reports_to_name || '',
        updated_at: new Date().toISOString(),
      })
      await savePeopleOpsRecord({
        key: buildStaffGoalKey(goal.id),
        value: goal,
        onSuccess: (savedGoal) => setGoals((current) => [savedGoal, ...current.filter((item) => item.id !== savedGoal.id)]
          .sort((a, b) => {
            if (a.status === 'completed' && b.status !== 'completed') return 1
            if (a.status !== 'completed' && b.status === 'completed') return -1
            return new Date(a.due_date || a.created_at || 0).getTime() - new Date(b.due_date || b.created_at || 0).getTime()
          })),
      })
      resetGoalForm()
    } catch (error) {
      console.error('Goal save failed:', error)
      alert(error.message || 'Could not save the goal.')
    } finally {
      setPeopleOpsSaving(false)
    }
  }

  const saveTrainingRecord = async () => {
    if (!trainingForm.title.trim()) {
      alert('Add a training or certification title first.')
      return
    }
    setPeopleOpsSaving(true)
    try {
      const trainingRecord = createTrainingRecord({
        ...trainingForm,
        staff_email: email,
        staff_name: displayName,
        department: profile.department || orgRecord.department || '',
        manager_email: user?.email || profile.manager_email || orgRecord.reports_to_email || '',
        manager_name: user?.name || profile.manager_name || orgRecord.reports_to_name || '',
        updated_at: new Date().toISOString(),
      })
      await savePeopleOpsRecord({
        key: buildTrainingRecordKey(trainingRecord.id),
        value: trainingRecord,
        onSuccess: (savedTraining) => setTrainingRecords((current) => [savedTraining, ...current.filter((item) => item.id !== savedTraining.id)]
          .sort((a, b) => {
            if (a.status === 'completed' && b.status !== 'completed') return 1
            if (a.status !== 'completed' && b.status === 'completed') return -1
            return new Date(a.due_date || a.created_at || 0).getTime() - new Date(b.due_date || b.created_at || 0).getTime()
          })),
      })
      await sendManagedNotification({
        userEmail: email,
        userName: displayName,
        category: 'hr',
        type: 'info',
        title: trainingRecord.mandatory ? 'Mandatory training assigned' : 'Training assigned',
        message: `${trainingRecord.title} has been assigned to you${trainingRecord.due_date ? ` with a due date of ${trainingRecord.due_date}` : ''}.`,
        link: '/my-profile',
        emailSubject: `${trainingRecord.title} — training assigned`,
        emailHtml: `
          <p>Hi ${(displayName || email).split(' ')[0] || 'there'},</p>
          <p>${trainingRecord.title} has been assigned to you in DH Portal.</p>
          <p><strong>Category:</strong> ${getTrainingCategoryLabel(trainingRecord.category)}<br/><strong>Mandatory:</strong> ${trainingRecord.mandatory ? 'Yes' : 'No'}${trainingRecord.due_date ? `<br/><strong>Due date:</strong> ${trainingRecord.due_date}` : ''}</p>
          ${trainingRecord.notes ? `<p><strong>Notes:</strong><br/>${trainingRecord.notes.replace(/\n/g, '<br/>')}</p>` : ''}
        `,
        sentBy: user?.name || user?.email || 'Manager',
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        forceDelivery: 'both',
      }).catch(() => {})
      resetTrainingForm()
    } catch (error) {
      console.error('Training save failed:', error)
      alert(error.message || 'Could not save the training record.')
    } finally {
      setPeopleOpsSaving(false)
    }
  }

  const updateTrainingStatus = async (record, nextStatus) => {
    setPeopleOpsSaving(true)
    try {
      const nextRecord = createTrainingRecord({
        ...record,
        status: nextStatus,
        completed_at: nextStatus === 'completed' ? new Date().toISOString() : '',
        updated_at: new Date().toISOString(),
      })
      await savePeopleOpsRecord({
        key: buildTrainingRecordKey(nextRecord.id),
        value: nextRecord,
        onSuccess: (savedTraining) => setTrainingRecords((current) => current
          .map((item) => item.id === savedTraining.id ? savedTraining : item)
          .sort((a, b) => {
            if (a.status === 'completed' && b.status !== 'completed') return 1
            if (a.status !== 'completed' && b.status === 'completed') return -1
            return new Date(a.due_date || a.created_at || 0).getTime() - new Date(b.due_date || b.created_at || 0).getTime()
          })),
      })
    } catch (error) {
      console.error('Training status update failed:', error)
      alert(error.message || 'Could not update the training status.')
    } finally {
      setPeopleOpsSaving(false)
    }
  }

  const sendTrainingReminder = async (record) => {
    setPeopleOpsSaving(true)
    try {
      await sendManagedNotification({
        userEmail: email,
        userName: displayName,
        category: 'hr',
        type: record.mandatory ? 'warning' : 'info',
        title: `${record.mandatory ? 'Mandatory training reminder' : 'Training reminder'}: ${record.title}`,
        message: `${record.title} is still outstanding${record.due_date ? ` and was due on ${record.due_date}` : ''}. Please complete it and update your manager once done.`,
        link: '/my-profile',
        emailSubject: `${record.title} — training reminder`,
        emailHtml: `
          <p>Hi ${(displayName || email).split(' ')[0] || 'there'},</p>
          <p>This is a reminder that <strong>${record.title}</strong> is still outstanding.</p>
          <p><strong>Category:</strong> ${getTrainingCategoryLabel(record.category)}<br/><strong>Mandatory:</strong> ${record.mandatory ? 'Yes' : 'No'}${record.due_date ? `<br/><strong>Due date:</strong> ${record.due_date}` : ''}</p>
          ${record.notes ? `<p><strong>Notes:</strong><br/>${record.notes.replace(/\n/g, '<br/>')}</p>` : ''}
        `,
        sentBy: user?.name || user?.email || 'Manager',
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        forceDelivery: 'both',
      })
      setPeopleOpsSaved(true)
      setTimeout(() => setPeopleOpsSaved(false), 3000)
    } catch (error) {
      console.error('Training reminder failed:', error)
      alert(error.message || 'Could not send the training reminder.')
    } finally {
      setPeopleOpsSaving(false)
    }
  }

  // ── Docs ────────────────────────────────────────────────────────────────
  const uploadDoc = async () => {
    if (!selectedDoc) {
      setDocUploadError('Choose a document first.')
      return
    }
    setUploading(true)
    setDocUploadError('')
    setDocUploadSuccess('')
    const path = `staff-docs/${email}/${Date.now()}-${selectedDoc.name}`
    const { error } = await supabase.storage.from('hr-documents').upload(path, selectedDoc)
    if (!error) {
      const { data: urlData } = supabase.storage.from('hr-documents').getPublicUrl(path)
      const { error: insertError } = await supabase.from('staff_documents').insert([{
        staff_email: email, staff_name: profile.full_name || email,
        name: selectedDoc.name, type: selectedDoc.name.toLowerCase().includes('contract') ? 'Contract' : 'Document',
        file_url: urlData.publicUrl, file_path: path, uploaded_by: user?.name, created_at: new Date().toISOString(),
      }])
      if (insertError) {
        setDocUploadError(insertError.message || 'Could not save the document record.')
      } else {
        const { data: docData } = await supabase.from('staff_documents').select('*').ilike('staff_email', email).order('created_at', { ascending: false })
        setDocs(docData || [])
        setDocUploadSuccess(`Uploaded ${selectedDoc.name}`)
        setSelectedDoc(null)
        if (fileRef.current) fileRef.current.value = ''
      }
    } else {
      setDocUploadError(error.message || 'Could not upload the document.')
    }
    setUploading(false)
  }

  const deleteDoc = async (doc) => {
    if (!confirm('Delete "' + doc.name + '"?')) return
    if (doc.file_path) await supabase.storage.from('hr-documents').remove([doc.file_path]).catch(() => {})
    await supabase.from('staff_documents').delete().eq('id', doc.id)
    setDocs(p => p.filter(d => d.id !== doc.id))
  }

  const saveComplianceRecord = async (nextRecord, successMessage = 'Compliance updated.') => {
    setComplianceSaving(true)
    try {
      const merged = mergeComplianceRecord(nextRecord)
      const { error } = await supabase
        .from('portal_settings')
        .upsert({
          key: buildComplianceSettingKey(email),
          value: { value: merged },
        }, { onConflict: 'key' })
      if (error) throw error
      setComplianceRecord(merged)
      setDocUploadError('')
      setDocUploadSuccess(successMessage)
    } catch (error) {
      setDocUploadError(error.message || 'Could not update compliance status.')
    } finally {
      setComplianceSaving(false)
    }
  }

  const persistContractRecord = async (nextContract) => {
    const payload = createStaffContract(nextContract)
    const { error } = await supabase
      .from('portal_settings')
      .upsert({
        key: buildStaffContractKey(payload.id),
        value: { value: payload },
      }, { onConflict: 'key' })
    if (error) throw error
    setContracts((current) => [payload, ...current.filter((item) => item.id !== payload.id)]
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()))
    return payload
  }

  const issueContractRecord = async ({ template, signerName, signerTitle, notes = '', replacedContract = null }) => {
    const mergeFields = buildContractMergeFields({
      profile,
      orgRecord,
      template,
      managerTitle: signerTitle,
      staffEmail: email,
    })
    const managerSignature = createPortalSignature({
      name: signerName,
      title: signerTitle,
      email: user?.email || '',
    })
    const now = new Date().toISOString()
    const replacementNote = replacedContract ? `Replacement for ${replacedContract.template_name || 'previous contract'} issued ${replacedContract.issued_at ? new Date(replacedContract.issued_at).toLocaleDateString('en-GB') : 'previously'}.` : ''
    const nextContract = await persistContractRecord({
      template_id: template.id,
      template_name: template.name,
      contract_type: template.contract_type,
      subject: template.subject,
      staff_email: email,
      staff_name: profile.full_name || email,
      staff_role: profile.role || '',
      staff_department: profile.department || orgRecord.department || '',
      manager_email: profile.manager_email || orgRecord.reports_to_email || normalizeEmail(user?.email || ''),
      manager_name: profile.manager_name || orgRecord.reports_to_name || signerName,
      manager_title: signerTitle,
      status: 'awaiting_staff_signature',
      notes: [notes, replacementNote].filter(Boolean).join(' '),
      merge_fields: mergeFields,
      template_html: template.content_html,
      template_reference_file_url: template.reference_file_url,
      template_reference_file_path: template.reference_file_path,
      template_reference_file_name: template.reference_file_name,
      manager_signature: managerSignature,
      manager_signed_at: managerSignature.signed_at,
      issued_at: now,
      updated_at: now,
    })

    await sendManagedNotification({
      userEmail: email,
      userName: profile.full_name || email,
      category: 'hr',
      type: 'info',
      title: replacedContract ? 'Replacement contract ready to sign' : 'Contract ready to sign',
      message: `${signerName.trim()} has issued your ${template.contract_type || 'employment contract'}. Review and sign it in onboarding to complete your HR setup.`,
      link: '/hr/onboarding',
      emailSubject: `${template.subject || template.name} — ready to sign`,
      emailHtml: `
        <p>Hi ${(profile.full_name || email).split(' ')[0] || 'there'},</p>
        <p>Your ${template.contract_type || 'employment contract'} is ready for signature in DH Portal.</p>
        ${replacedContract ? '<p>This is a replacement contract and supersedes the previous unsigned version.</p>' : ''}
        <p>Please review and sign it inside onboarding to complete your staff setup.</p>
        <p><a href="https://staff.dhwebsiteservices.co.uk/hr/onboarding" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open onboarding</a></p>
      `,
      sentBy: user?.name || user?.email || 'Department manager',
      fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
      forceImportant: true,
    })
    return nextContract
  }

  const issueContractToStaff = async () => {
    if (!contractForm.templateId) {
      setContractError('Choose a contract template first.')
      return
    }
    if (!contractForm.managerSignatureName.trim() || !contractForm.managerSignatureTitle.trim()) {
      setContractError('Add the signer name and title before issuing the contract.')
      return
    }

    const template = contractTemplates.find((item) => item.id === contractForm.templateId)
    if (!template) {
      setContractError('That contract template could not be found.')
      return
    }

    setContractSaving(true)
    setContractError('')
    setContractSuccess('')

    try {
      const nextContract = await issueContractRecord({
        template,
        signerName: contractForm.managerSignatureName,
        signerTitle: contractForm.managerSignatureTitle,
        notes: contractForm.notes,
      })
      setContractForm((current) => ({
        ...current,
        notes: '',
      }))
      setContractSuccess(`Issued ${nextContract.template_name} for staff signature.`)
    } catch (error) {
      console.error('Contract issue failed:', error)
      setContractError(error.message || 'Could not issue the contract.')
    } finally {
      setContractSaving(false)
    }
  }

  const voidContract = async (contract) => {
    if (!confirm(`Void ${contract.template_name || 'this contract'}?`)) return
    setContractSaving(true)
    setContractError('')
    setContractSuccess('')
    try {
      const nextContract = await persistContractRecord({
        ...contract,
        status: 'voided',
        voided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      await sendManagedNotification({
        userEmail: email,
        userName: profile.full_name || email,
        category: 'hr',
        type: 'warning',
        title: 'Contract update',
        message: `${nextContract.template_name || 'A contract'} has been voided and is no longer awaiting your signature.`,
        link: '/hr/onboarding',
        emailSubject: `Contract voided — ${nextContract.template_name || 'DH Portal'}`,
        sentBy: user?.name || user?.email || 'Department manager',
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
      }).catch(() => {})
      setContractSuccess(`${nextContract.template_name || 'Contract'} marked as voided.`)
    } catch (error) {
      console.error('Contract void failed:', error)
      setContractError(error.message || 'Could not void the contract.')
    } finally {
      setContractSaving(false)
    }
  }

  const resendContractReminder = async (contract) => {
    setContractSaving(true)
    setContractError('')
    setContractSuccess('')
    try {
      await sendManagedNotification({
        userEmail: email,
        userName: profile.full_name || email,
        category: 'hr',
        type: 'warning',
        title: 'Contract signature reminder',
        message: `${contract.template_name || 'Your contract'} is still waiting for your digital signature in onboarding.`,
        link: '/hr/onboarding',
        emailSubject: `${contract.subject || contract.template_name || 'DH Portal contract'} — signature reminder`,
        emailHtml: `
          <p>Hi ${(profile.full_name || email).split(' ')[0] || 'there'},</p>
          <p>This is a reminder that your ${contract.template_name || contract.contract_type || 'contract'} is still waiting for your digital signature in DH Portal.</p>
          <p><a href="https://staff.dhwebsiteservices.co.uk/hr/onboarding" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open onboarding</a></p>
        `,
        sentBy: user?.name || user?.email || 'Department manager',
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        forceImportant: true,
      })
      setContractSuccess(`Reminder sent for ${contract.template_name || 'the contract'}.`)
    } catch (error) {
      console.error('Contract reminder failed:', error)
      setContractError(error.message || 'Could not resend the contract reminder.')
    } finally {
      setContractSaving(false)
    }
  }

  const replaceContract = async (contract) => {
    const template = contractTemplates.find((item) => item.id === contract.template_id)
    if (!template) {
      setContractError('The original contract template could not be found, so this contract cannot be replaced automatically.')
      return
    }
    const confirmed = confirm(`Replace ${contract.template_name || 'this contract'} with a newly issued version? The current version will be voided and the staff member will receive a fresh signing request.`)
    if (!confirmed) return

    setContractSaving(true)
    setContractError('')
    setContractSuccess('')
    try {
      const voidedContract = await persistContractRecord({
        ...contract,
        status: 'voided',
        voided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        notes: [contract.notes, 'Replaced with a newly issued contract.'].filter(Boolean).join(' '),
      })
      const nextContract = await issueContractRecord({
        template,
        signerName: contractForm.managerSignatureName || contract.manager_signature?.name || contract.manager_name || user?.name || user?.email || '',
        signerTitle: contractForm.managerSignatureTitle || contract.manager_signature?.title || contract.manager_title || activeContractTemplate?.manager_title_default || roleScopeLabel || 'Department Manager',
        notes: contractForm.notes || contract.notes,
        replacedContract: voidedContract,
      })
      setContractForm((current) => ({
        ...current,
        templateId: template.id,
        managerSignatureName: current.managerSignatureName || contract.manager_signature?.name || contract.manager_name || '',
        managerSignatureTitle: current.managerSignatureTitle || contract.manager_signature?.title || contract.manager_title || activeContractTemplate?.manager_title_default || roleScopeLabel || 'Department Manager',
      }))
      setContractSuccess(`Replaced ${contract.template_name || 'the contract'} and issued ${nextContract.template_name} for a fresh signature.`)
    } catch (error) {
      console.error('Contract replacement failed:', error)
      setContractError(error.message || 'Could not replace the contract.')
    } finally {
      setContractSaving(false)
    }
  }

  const getInitials = n => (n || email || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const displayName = profile.full_name || email
  const activePreset = detectPreset(editPerms)
  const lifecycle = getLifecycleMeta(lifecycleRecord, { onboarding, startDate: profile.start_date, contractType: profile.contract_type })
  const offboardingCompletedCount = OFFBOARDING_ITEMS.filter(([key]) => lifecycleRecord.offboarding?.[key]).length
  const offboardingTotalCount = OFFBOARDING_ITEMS.length
  const offboardingComplete = offboardingCompletedCount === offboardingTotalCount
  const enabledPermissionCount = countEnabledPermissions(editPerms)
  const managerOption = msUsers.find((u) => u.email === (profile.manager_email || ''))
  const roleScopeLabel = getRoleScopeLabel(orgRecord.role_scope)
  const contractDoc = docs.find((doc) => String(doc.type || '').toLowerCase().includes('contract') || String(doc.name || '').toLowerCase().includes('contract'))
  const activeContractTemplate = contractTemplates.find((item) => item.id === contractForm.templateId) || contractTemplates[0] || null
  const contractPreviewFields = buildContractMergeFields({
    profile,
    orgRecord,
    template: activeContractTemplate || {},
    managerTitle: contractForm.managerSignatureTitle || activeContractTemplate?.manager_title_default || roleScopeLabel || 'Department Manager',
    staffEmail: email,
  })
  const renderedContractPreview = activeContractTemplate
    ? renderContractHtml(activeContractTemplate.content_html, contractPreviewFields)
    : ''
  const pendingSignatureContracts = contracts.filter((contract) => contract.status === 'awaiting_staff_signature')
  const completedContracts = contracts.filter((contract) => contract.status === 'completed')
  const openReviews = reviews.filter((review) => review.status !== 'completed')
  const overdueReviews = openReviews.filter((review) => review.due_date && new Date(`${review.due_date}T23:59:59`).getTime() < Date.now())
  const openGoals = goals.filter((goal) => goal.status !== 'completed')
  const dueGoals = openGoals.filter((goal) => goal.due_date && new Date(`${goal.due_date}T23:59:59`).getTime() <= Date.now())
  const openTraining = trainingRecords.filter((record) => record.status !== 'completed')
  const dueTraining = openTraining.filter((record) => record.due_date && new Date(`${record.due_date}T23:59:59`).getTime() <= Date.now())
  const rtwRecord = resolveRightToWorkRecord(profile, docs, complianceRecord)
  const rtwRemaining = rtwRecord.expiry ? Math.ceil((new Date(rtwRecord.expiry).getTime() - Date.now()) / 86400000) : null
  const rtwStatus = !rtwRecord.hasDocument && !rtwRecord.rtw_override
    ? { label: 'Missing', tone: 'red', hint: 'No right-to-work evidence linked yet.' }
    : rtwRecord.rtw_override && !rtwRecord.expiry
      ? { label: 'Compliant', tone: 'green', hint: rtwRecord.rtw_status_note || 'Manually verified by admin.' }
    : rtwRemaining !== null && rtwRemaining < 0
      ? { label: 'Expired', tone: 'red', hint: 'Document expiry date has passed.' }
      : rtwRemaining !== null && rtwRemaining <= 45
        ? { label: `${rtwRemaining}d left`, tone: 'amber', hint: 'Review before expiry.' }
        : { label: rtwRecord.rtw_override ? 'Compliant' : 'Valid', tone: 'green', hint: rtwRecord.rtw_status_note || 'Document is on file.' }
  const contractStatus = contractDoc
    ? { label: 'On file', tone: 'green', hint: contractDoc.name }
    : { label: 'Missing', tone: 'amber', hint: 'No contract document uploaded yet.' }
  const staffTimeline = buildStaff360Timeline({
    profile,
    lifecycle: lifecycleRecord,
    rtwRecord,
    rtwStatus,
    docs,
    contracts,
    reviews,
    checkIns,
    goals,
    trainingRecords,
  })
  const peopleOpsTimeline = staffTimeline.filter((item) => ['performance', 'training'].includes(item.category))
  const documentTimeline = staffTimeline.filter((item) => item.category === 'documents')
  const profileCompleteness = buildStaffProfileCompleteness(profile, {
    managerAssigned: !!String(profile.manager_email || '').trim(),
    hasContractDocument: !!contractDoc,
    hasAnyDocument: docs.length > 0,
    hasTraining: trainingRecords.length > 0,
  })
  const staff360Signals = [
    {
      label: 'Profile completeness',
      value: `${profileCompleteness.percent}%`,
      hint: `${profileCompleteness.completed}/${profileCompleteness.total} key profile checks complete`,
      tone: profileCompleteness.percent >= 85 ? 'green' : profileCompleteness.percent >= 60 ? 'amber' : 'red',
    },
    {
      label: 'Compliance status',
      value: rtwStatus.label,
      hint: rtwStatus.hint,
      tone: rtwStatus.tone,
    },
    {
      label: 'Contract coverage',
      value: contractStatus.label,
      hint: pendingSignatureContracts.length ? `${pendingSignatureContracts.length} awaiting signature` : contractStatus.hint,
      tone: pendingSignatureContracts.length ? 'amber' : contractStatus.tone,
    },
    {
      label: 'People ops pressure',
      value: `${openReviews.length + dueTraining.length + dueGoals.length}`,
      hint: `${overdueReviews.length} overdue reviews · ${dueTraining.length} training due · ${dueGoals.length} goals due`,
      tone: overdueReviews.length || dueTraining.length ? 'red' : openReviews.length || dueGoals.length ? 'amber' : 'green',
    },
  ]
  const missingProfileItems = profileCompleteness.missing.slice(0, 4)
  const staffProfileTabs = [
    ['profile','Profile'],
    ['lifecycle','Lifecycle'],
    ['performance','Performance'],
    ['training','Training'],
    ['portal','Portal'],
    ['alerts','Alerts'],
    ['hr','HR Details'],
    ['bank','Bank'],
    ['permissions','Permissions'],
    ['notify','Notify'],
    ['commissions','Commissions'],
    ['contracts','Contracts'],
    ['docs','Documents'],
  ]
  const staffProfileTabDescriptions = {
    profile: 'Employee record, snapshot, and current people ops view.',
    lifecycle: 'Employment stage, offboarding, and department structure.',
    performance: 'Reviews, goals, and manager check-ins.',
    training: 'Assigned learning, compliance, and expiries.',
    portal: 'Workspace preferences and profile-level portal setup.',
    alerts: 'Notification preferences and delivery choices.',
    hr: 'HR details, contact fields, and employment records.',
    bank: 'Payroll and bank details.',
    permissions: 'Access model and enabled portal areas.',
    notify: 'Send internal updates or manager-led alerts.',
    commissions: 'Commission records and payout context.',
    contracts: 'Templates, issued contracts, and signatures.',
    docs: 'Documents, uploads, and supporting files.',
  }
  const roleSummary = [profile.role, profile.department, roleScopeLabel].filter(Boolean)
  const managerDisplay = profile.manager_name || profile.manager_email || 'No manager assigned'
  const heroSignals = [
    { label: 'Lifecycle', value: lifecycle.label, tone: lifecycle.tone, hint: lifecycle.hint || 'Current employment stage' },
    { label: 'Profile', value: `${profileCompleteness.percent}%`, tone: staff360Signals[0]?.tone || 'blue', hint: `${profileCompleteness.completed}/${profileCompleteness.total} checks complete` },
    { label: 'Compliance', value: rtwStatus.label, tone: rtwStatus.tone, hint: rtwStatus.hint },
    { label: 'People ops', value: `${openReviews.length + dueTraining.length + dueGoals.length}`, tone: staff360Signals[3]?.tone || 'blue', hint: `${overdueReviews.length} overdue reviews · ${dueTraining.length} training due` },
    { label: 'Reporting', value: managerDisplay, tone: 'grey', hint: missingProfileItems.length ? `Missing: ${missingProfileItems.join(', ')}` : 'Core profile items are in place.' },
  ]

  const scopedAccessAllowed = isDirector || canViewScopedStaff(profile, orgRecord)

  const sendCustomNotification = async () => {
    if (!customNotification.title.trim() || !customNotification.message.trim()) {
      alert('Please add both a title and a message.')
      return
    }

    setSendingNotification(true)
    try {
      const effectiveType = customNotification.important ? 'urgent' : (customNotification.type || 'info')
      const notificationPayload = {
        title: customNotification.title.trim(),
        message: customNotification.message.trim(),
        type: effectiveType,
        category: customNotification.important ? 'urgent' : (customNotification.category || 'general'),
        link: customNotification.link?.trim() || '/notifications',
      }
      const createdAt = new Date().toISOString()

      const deliveryResult = await sendManagedNotification({
        userEmail: email,
        userName: profile.full_name || email,
        title: notificationPayload.title,
        message: notificationPayload.message,
        type: notificationPayload.type,
        category: notificationPayload.category,
        link: notificationPayload.link,
        emailSubject: `${(customNotification.emailSubject || customNotification.title).trim()} — DH Portal`,
        emailHtml: `
          <p>Hi ${(profile.full_name || email).split(' ')[0] || 'there'},</p>
          <p>${customNotification.message.trim().replace(/\n/g, '<br/>')}</p>
          <p><a href="${customNotification.link?.trim()
            ? `https://staff.dhwebsiteservices.co.uk${customNotification.link.trim().startsWith('/') ? customNotification.link.trim() : `/${customNotification.link.trim()}`}`
            : 'https://staff.dhwebsiteservices.co.uk/notifications'}" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open in DH Portal</a></p>
        `,
        sentBy: user?.name || 'Admin',
        forceImportant: customNotification.important,
      })

      if (deliveryResult.portalSent) {
        setNotificationHistory((current) => [{
          title: notificationPayload.title,
          message: notificationPayload.message,
          type: notificationPayload.type,
          link: notificationPayload.link,
          created_at: createdAt,
        }, ...current].slice(0, 12))
      }

      if (customNotification.pinAsBanner) {
        const { error: bannerError } = await supabase.from('banners').insert([{
          title: customNotification.title.trim(),
          message: customNotification.message.trim(),
          type: effectiveType,
          display_type: 'banner',
          target: 'staff',
          target_email: email,
          target_page: customNotification.bannerTargetPage || 'all',
          active: true,
          dismissible: true,
          starts_at: new Date().toISOString(),
          ends_at: customNotification.bannerExpiresAt ? new Date(customNotification.bannerExpiresAt).toISOString() : null,
          created_by: user?.name || 'Admin',
          created_at: new Date().toISOString(),
        }])
        if (bannerError) throw bannerError
      }

      setNotificationSaved(true)
      setTimeout(() => setNotificationSaved(false), 3000)
      setCustomNotification({
        title: '',
        message: '',
        type: 'info',
        category: 'general',
        link: '/notifications',
        emailSubject: '',
        important: false,
        pinAsBanner: false,
        bannerTargetPage: 'all',
        bannerExpiresAt: '',
      })
    } catch (err) {
      console.error('Custom notification failed:', err)
      alert('Notification send failed: ' + (err.message || 'Unknown error'))
    } finally {
      setSendingNotification(false)
    }
  }

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (!scopedAccessAllowed) {
    return (
      <div className="fade-in">
        <div className="card card-pad" style={{ maxWidth: 620 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:24, color:'var(--text)' }}>Department-scoped access</div>
          <div style={{ marginTop:8, color:'var(--sub)', fontSize:14, lineHeight:1.7 }}>
            This staff profile sits outside your department scope. Directors can still access all company-wide staff records.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
        <button onClick={() => navigate('/my-staff')} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'1px solid var(--border)', borderRadius:100, padding:'7px 14px', cursor:'pointer', color:'var(--sub)', fontSize:13 }}>
          ← My Staff
        </button>
      </div>

      <div className="staff-profile-hero">
        <div className="staff-profile-hero-main">
          <div className="staff-profile-avatar">
            {getInitials(displayName)}
          </div>
          <div className="staff-profile-hero-copy">
            <div className="staff-profile-kicker">Staff 360</div>
            <h1 className="staff-profile-name">{displayName}</h1>
            <div className="staff-profile-subline">
              {roleSummary.length ? roleSummary.join(' · ') : 'Employee profile'}
            </div>
            <div className="staff-profile-meta-row">
              <span className={`badge badge-${lifecycle.tone}`}>{lifecycle.label}</span>
              {onboarding ? <span className="badge badge-amber">Onboarding</span> : <span className="badge badge-green">Active</span>}
              {bookable ? <span className="badge badge-blue">Bookable</span> : null}
              <span className="badge badge-grey">{email}</span>
            </div>
          </div>
        </div>
        <div className="staff-profile-actions">
          <div className="staff-profile-action-panel">
            <div className="staff-profile-action-head">
              <div>
                <div className="staff-profile-kicker">Quick controls</div>
                <div className="staff-profile-action-title">Access and availability</div>
              </div>
              {saved ? <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved</span> : null}
            </div>
            <div className="staff-profile-toggle-card">
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{onboarding ? 'Onboarding mode' : 'Employment active'}</div>
                <div style={{ fontSize:11.5, color:'var(--faint)', marginTop:4 }}>Use onboarding mode while setup, documents, and first access are still in progress.</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginLeft:16 }}>
                <span style={{ fontSize:12, color: onboarding ? 'var(--amber)' : 'var(--green)', fontWeight:600 }}>
                  {onboarding ? 'Onboarding' : 'Active'}
                </span>
                <button onClick={() => setOnboarding(o => !o)} style={{ width:40, height:22, borderRadius:11, background: onboarding ? 'var(--amber)' : 'var(--green)', border:'none', cursor:'pointer', position:'relative', flexShrink:0 }}>
                  <div style={{ position:'absolute', top:2, left: onboarding ? 2 : 20, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
                </button>
              </div>
            </div>
            <div className="staff-profile-toggle-card">
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Bookable for calls</div>
                <div style={{ fontSize:11.5, color:'var(--faint)', marginTop:4 }}>Controls whether this person appears on the public booking calendar.</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginLeft:16 }}>
                <span style={{ fontSize:12, color: bookable ? 'var(--accent)' : 'var(--faint)', fontWeight:600 }}>{bookable ? 'Bookable' : 'Hidden'}</span>
                <button onClick={() => setBookable(b => !b)} style={{ width:40, height:22, borderRadius:11, background: bookable ? 'var(--accent)' : 'var(--bg3)', border:'none', cursor:'pointer', position:'relative', flexShrink:0 }}>
                  <div style={{ position:'absolute', top:2, left: bookable ? 20 : 2, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
                </button>
              </div>
            </div>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save staff profile'}</button>
          </div>
        </div>
      </div>

      <div className="staff-profile-summary-grid">
        {heroSignals.map((item) => (
          <div key={item.label} className="staff-profile-summary-card">
            <div className="staff-profile-summary-label">{item.label}</div>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
              <div className="staff-profile-summary-value">{item.value}</div>
              <span className={`badge badge-${item.tone}`}>{item.label === 'Reporting' ? 'manager' : item.tone}</span>
            </div>
            <div className="staff-profile-summary-hint">{item.hint}</div>
          </div>
        ))}
      </div>

      <div className="staff-profile-workspace">
        <aside className="staff-profile-nav">
          <div className="staff-profile-action-head" style={{ marginBottom: 0 }}>
            <div>
              <div className="staff-profile-kicker">Workspace</div>
              <div className="staff-profile-action-title">Profile areas</div>
            </div>
            <div className="staff-profile-tab-caption">Switch between employee details, lifecycle controls, contracts, notifications, and portal access.</div>
          </div>
          <div className="staff-profile-nav-list">
            {staffProfileTabs.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`staff-profile-nav-btn${tab === k ? ' on' : ''}`}
              >
                <span className="staff-profile-nav-label">{l}</span>
                <span className="staff-profile-nav-copy">{staffProfileTabDescriptions[k]}</span>
              </button>
            ))}
          </div>
        </aside>

        <div style={{ width:'100%' }} className="staff-profile-content">
        {tab === 'profile' && (
          <div className="staff-profile-main-grid" style={{ display:'grid', gridTemplateColumns:'minmax(0,1.55fr) minmax(320px,0.95fr)', gap:20, alignItems:'start' }}>
            <div style={{ display:'grid', gap:18 }}>
              <div className="card card-pad" style={{ background:'color-mix(in srgb, var(--card) 82%, var(--accent-soft) 18%)', border:'1px solid color-mix(in srgb, var(--border) 72%, var(--accent-border) 28%)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'flex-start', flexWrap:'wrap' }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Staff 360</div>
                    <div style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginTop:4 }}>Employee record snapshot</div>
                    <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:6, lineHeight:1.6, maxWidth:520 }}>
                      A joined-up view of profile completeness, compliance, contracts, and current people-ops pressure.
                    </div>
                  </div>
                  <span className={`badge badge-${lifecycle.tone}`}>{lifecycle.label}</span>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:10, marginTop:16 }}>
                  {staff360Signals.map((item) => (
                    <div key={item.label} style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                      <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{item.label}</div>
                      <div style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>{item.value}</div>
                      <div style={{ fontSize:12, color:'var(--sub)', marginTop:6, lineHeight:1.5 }}>{item.hint}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(240px,0.9fr)', gap:14, marginTop:16 }}>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Latest record movement</div>
                    <div style={{ display:'grid', gap:10 }}>
                      {staffTimeline.slice(0, 3).map((item) => (
                        <div key={item.id} style={{ paddingBottom:10, borderBottom:'1px solid var(--border)' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{item.title}</div>
                          <div style={{ fontSize:12, color:'var(--sub)', marginTop:4, lineHeight:1.5 }}>{item.subtitle}</div>
                          <div style={{ fontSize:11, color:'var(--faint)', marginTop:6 }}>{formatProfileTimelineDate(item.date)}</div>
                        </div>
                      ))}
                      {staffTimeline.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No staff profile timeline activity yet.</div> : null}
                    </div>
                  </div>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Missing profile items</div>
                    <div style={{ display:'grid', gap:8 }}>
                      {missingProfileItems.map((item) => (
                        <div key={item.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, fontSize:12.5 }}>
                          <span style={{ color:'var(--sub)' }}>{item.label}</span>
                          <span className="badge badge-amber">missing</span>
                        </div>
                      ))}
                      {!missingProfileItems.length ? <div style={{ fontSize:12.5, color:'var(--green)' }}>Key profile data is in good shape.</div> : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card card-pad staff-profile-form-card">
                  <div className="fg">
                    <div><label className="lbl">Full Name</label><input className="inp" value={profile.full_name || ''} onChange={e=>pf('full_name',e.target.value)}/></div>
                    <div><label className="lbl">Role / Job Title</label><input className="inp" value={profile.role || ''} onChange={e=>pf('role',e.target.value)}/></div>
                    <div>
                      <label className="lbl">Department</label>
                      <select className="inp" value={profile.department || ''} onChange={e=>pf('department',e.target.value)}>
                        <option value="">— No department assigned —</option>
                        {departmentCatalog.map((department) => (
                          <option key={department.id} value={department.name}>{department.name}</option>
                        ))}
                        {profile.department && !departmentCatalog.some((department) => department.name === profile.department) ? (
                          <option value={profile.department}>{profile.department}</option>
                        ) : null}
                      </select>
                    </div>
                    <div>
                      <label className="lbl">Access Role</label>
                      <select
                        className="inp"
                        value={orgRecord.role_scope}
                        onChange={e => setOrgRecord((current) => mergeOrgRecord({
                          ...current,
                          role_scope: e.target.value,
                          department: profile.department,
                          managed_departments: e.target.value === 'department_manager'
                            ? mergeManagedDepartmentScope({
                                ...current,
                                role_scope: 'department_manager',
                                department: profile.department,
                              }, departmentCatalog, email)
                            : [],
                        }, { email, department: profile.department }))}
                        disabled={!isDirector && isDepartmentManager}
                      >
                        {ORG_ROLE_SCOPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                      {!isDirector && isDepartmentManager ? <div style={{ fontSize:11, color:'var(--faint)', marginTop:4 }}>Department managers can request role changes, but Directors approve them.</div> : null}
                    </div>
                    {orgRecord.role_scope === 'department_manager' ? (
                      <div className="fc">
                        <label className="lbl">Managed Departments</label>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:8 }}>
                          {departmentCatalog.filter((department) => department.active !== false).map((department) => {
                            const enabled = (orgRecord.managed_departments || []).includes(department.name)
                            return (
                              <label key={department.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 12px', borderRadius:10, border:'1px solid var(--border)', background: enabled ? 'var(--accent-soft)' : 'var(--card)', cursor:'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  onChange={() => setOrgRecord((current) => {
                                    const nextManaged = new Set(current.managed_departments || [])
                                    if (nextManaged.has(department.name)) nextManaged.delete(department.name)
                                    else nextManaged.add(department.name)
                                    return mergeOrgRecord({
                                      ...current,
                                      managed_departments: [...nextManaged],
                                    }, { email, department: profile.department })
                                  })}
                                />
                                <div style={{ minWidth:0 }}>
                                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{department.name}</div>
                                  <div style={{ fontSize:11, color:'var(--sub)', marginTop:3 }}>
                                    {department.manager_email && department.manager_email !== email ? `Catalogue manager: ${department.manager_name || department.manager_email}` : 'Department manager scope'}
                                  </div>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                        <div style={{ fontSize:11, color:'var(--sub)', marginTop:6, lineHeight:1.5 }}>
                          Department Managers can manage more than one department. This list now syncs with the live department catalogue and can include multiple departments.
                        </div>
                      </div>
                    ) : null}
                    <div>
                      <label className="lbl">Manager</label>
                      <select className="inp" value={profile.manager_email || ''} onChange={e => {
                        const u = msUsers.find(u => u.email === e.target.value)
                        pf('manager_email', e.target.value)
                        pf('manager_name', u?.name || '')
                      }}>
                        <option value="">— No manager assigned —</option>
                        {msUsers.map(u => <option key={u.email} value={u.email}>{u.name}</option>)}
                      </select>
                      {profile.manager_email && <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', marginTop:4 }}>{profile.manager_email}</div>}
                    </div>
                    <div><label className="lbl">Phone</label><input className="inp" value={profile.phone || ''} onChange={e=>pf('phone',e.target.value)}/></div>
                    <div><label className="lbl">Personal Email</label><input className="inp" value={profile.personal_email || ''} onChange={e=>pf('personal_email',e.target.value)}/></div>
                    <div className="fc"><label className="lbl">Address</label><textarea className="inp" rows={2} value={profile.address || ''} onChange={e=>pf('address',e.target.value)} style={{ resize:'vertical' }}/></div>
                  </div>
              </div>

              <ProfileTimeline
                title="Staff history"
                subtitle="Cross-profile timeline"
                items={staffTimeline}
                emptyMessage="No staff record history has been captured yet."
                limit={10}
              />
            </div>

            <div className="staff-profile-admin-column" style={{ display:'grid', gap:14 }}>
              <div className="card card-pad staff-profile-admin-card">
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Admin controls</div>
                    <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginTop:4 }}>Lifecycle & access</div>
                  </div>
                  <span className={`badge badge-${lifecycle.tone}`}>{lifecycle.label}</span>
                </div>
                <div style={{ fontSize:12, color:'var(--sub)', marginTop:8, lineHeight:1.5 }}>{lifecycle.note}</div>

                <div style={{ display:'grid', gap:10, marginTop:16 }}>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Access preset</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{activePreset}</div>
                    <div style={{ fontSize:12, color:'var(--sub)', marginTop:4 }}>{enabledPermissionCount} pages enabled</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:10 }}>
                      {Object.keys(ROLE_DEFAULTS).map((role) => (
                        <button
                          key={role}
                          className={activePreset === role ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                          onClick={() => setEditPerms({ ...ROLE_DEFAULTS[role] })}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Org scope</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{roleScopeLabel}</div>
                    <div style={{ fontSize:12, color:'var(--sub)', marginTop:4 }}>
                      {orgRecord.department ? `${orgRecord.department} department` : 'Not assigned to a department yet'}
                    </div>
                    {orgRecord.role_scope === 'department_manager' ? (
                      <>
                        <div style={{ fontSize:11, color:'var(--faint)', marginTop:6 }}>
                          Manages: {(getManagedDepartments(orgRecord).filter((item) => item !== '*').join(', ')) || orgRecord.department || 'No department set'}
                        </div>
                        <div style={{ fontSize:11, color:'var(--sub)', marginTop:6, lineHeight:1.5 }}>
                          Department Managers can only view and manage the departments listed here. They do not get company-wide department access.
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Manager</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{profile.manager_name || managerOption?.name || 'Unassigned'}</div>
                    <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', marginTop:4 }}>
                      {profile.manager_email || 'No manager selected'}
                    </div>
                  </div>

                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Portal controls</div>
                    <div style={{ display:'grid', gap:8 }}>
                      <label style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>Onboarding mode</div>
                          <div style={{ fontSize:11, color:'var(--sub)' }}>Restricts the portal to onboarding-safe access</div>
                        </div>
                        <button onClick={() => setOnboarding(o => !o)} style={{ width:40, height:22, borderRadius:11, background: onboarding ? 'var(--amber)' : 'var(--green)', border:'none', position:'relative', flexShrink:0 }}>
                          <div style={{ position:'absolute', top:2, left: onboarding ? 2 : 20, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
                        </button>
                      </label>
                      <label style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>Bookable for calls</div>
                          <div style={{ fontSize:11, color:'var(--sub)' }}>Controls public appointment availability</div>
                        </div>
                        <button onClick={() => setBookable(b => !b)} style={{ width:40, height:22, borderRadius:11, background: bookable ? 'var(--accent)' : 'var(--bg3)', border:'none', position:'relative', flexShrink:0 }}>
                          <div style={{ position:'absolute', top:2, left: bookable ? 20 : 2, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
                        </button>
                      </label>
                    </div>
                  </div>

                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Quick admin jumps</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {[
                        ['Lifecycle', 'lifecycle'],
                        ['Performance', 'performance'],
                        ['Training', 'training'],
                        ['Permissions', 'permissions'],
                        ['Documents', 'docs'],
                        ['Commissions', 'commissions'],
                        ['Portal', 'portal'],
                        ['HR Details', 'hr'],
                      ].map(([label, nextTab]) => (
                        <button key={nextTab} className="btn btn-outline btn-sm" onClick={() => setTab(nextTab)}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Coverage</div>
                    <div style={{ display:'grid', gap:6 }}>
                      {PERMISSION_GROUPS.map((group) => {
                        const groupItems = ALL_PAGES.filter((page) => page.group === group)
                        const enabled = groupItems.filter((page) => editPerms[page.key]).length
                        return (
                          <div key={group} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, fontSize:12.5 }}>
                            <span style={{ color:'var(--sub)' }}>{group}</span>
                            <span style={{ fontFamily:'var(--font-mono)', color:'var(--text)' }}>{enabled}/{groupItems.length}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {departmentRequests.length > 0 && (
                    <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                      <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Department requests</div>
                      <div style={{ display:'grid', gap:8 }}>
                        {departmentRequests.slice(0, 3).map((request) => (
                          <div key={request.id} style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
                            <div>
                              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{request.requested_department || 'Unassigned'}</div>
                              <div style={{ fontSize:11, color:'var(--sub)', marginTop:3 }}>{request.status} · {new Date(request.created_at).toLocaleDateString('en-GB')}</div>
                            </div>
                            <span className={`badge badge-${request.status === 'approved' ? 'green' : request.status === 'rejected' ? 'red' : 'amber'}`}>{request.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'lifecycle' && (
          <div className="card card-pad">
            <div style={{ display:'grid', gap:20 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Employee lifecycle</div>
                  <div style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginTop:4 }}>Lifecycle and termination controls</div>
                  <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:6, lineHeight:1.6 }}>Track employment state, probation, restrictions, and controlled termination requests.</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span className={`badge badge-${lifecycle.tone}`}>{lifecycle.label}</span>
                  {lifecycleSaved ? <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved</span> : null}
                </div>
              </div>

              <div className="fg">
                <div>
                  <label className="lbl">Lifecycle State</label>
                  <select className="inp" value={lifecycleRecord.state} onChange={(e) => setLifecycleRecord((current) => mergeLifecycleRecord({ ...current, state: e.target.value }, { onboarding, startDate: profile.start_date, contractType: profile.contract_type }))}>
                    {LIFECYCLE_STATES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Probation End Date</label>
                  <input className="inp" type="date" value={lifecycleRecord.probation_end_date || ''} onChange={(e) => setLifecycleRecord((current) => ({ ...current, probation_end_date: e.target.value }))} />
                </div>
                <div className="fc">
                  <label className="lbl">Lifecycle Notes</label>
                  <textarea className="inp" rows={3} value={lifecycleRecord.notes || ''} onChange={(e) => setLifecycleRecord((current) => ({ ...current, notes: e.target.value }))} style={{ resize:'vertical' }} />
                </div>
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <button className="btn btn-primary" onClick={() => saveLifecycleRecord()} disabled={lifecycleSaving}>{lifecycleSaving ? 'Saving...' : 'Save lifecycle state'}</button>
              </div>

              <div style={{ padding:'16px 18px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14 }}>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:8 }}>Termination workflow</div>
                <div style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.6, marginBottom:16 }}>
                  Managers/admins can request termination. Only the director account can approve or reject it. On approval, the employee is notified on both work and personal email.
                </div>

                <div className="fg">
                  <div>
                    <label className="lbl">Termination status</label>
                    <div className={`badge badge-${lifecycleRecord.termination.status === 'approved' ? 'red' : lifecycleRecord.termination.status === 'requested' ? 'amber' : lifecycleRecord.termination.status === 'rejected' ? 'blue' : 'grey'}`}>
                      {getLifecycleLabel(lifecycleRecord.state)} · {lifecycleRecord.termination.status || 'none'}
                    </div>
                  </div>
                  <div>
                    <label className="lbl">Effective Date</label>
                    <input className="inp" type="date" value={lifecycleRecord.termination.effective_date || ''} onChange={(e) => setLifecycleRecord((current) => ({ ...current, termination: { ...current.termination, effective_date: e.target.value } }))} />
                  </div>
                  <div className="fc">
                    <label className="lbl">Termination Reason</label>
                    <textarea className="inp" rows={3} value={lifecycleRecord.termination.reason || ''} onChange={(e) => setLifecycleRecord((current) => ({ ...current, termination: { ...current.termination, reason: e.target.value } }))} style={{ resize:'vertical' }} placeholder="Explain the reason for termination request..." />
                  </div>
                  <div className="fc">
                    <label className="lbl">Termination Notes</label>
                    <textarea className="inp" rows={3} value={lifecycleRecord.termination.notes || ''} onChange={(e) => setLifecycleRecord((current) => ({ ...current, termination: { ...current.termination, notes: e.target.value } }))} style={{ resize:'vertical' }} placeholder="Optional admin notes, handover points, equipment recovery notes..." />
                  </div>
                </div>

                <label style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginTop:14 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>Immediate access removal recommended</div>
                    <div style={{ fontSize:11, color:'var(--sub)' }}>Use this when portal access should be revoked as soon as the director approves.</div>
                  </div>
                  <button onClick={() => setLifecycleRecord((current) => ({ ...current, termination: { ...current.termination, immediate_access_removal: !current.termination.immediate_access_removal } }))} style={{ width:40, height:22, borderRadius:11, background: lifecycleRecord.termination.immediate_access_removal ? 'var(--red)' : 'var(--bg3)', border:'none', position:'relative', flexShrink:0 }}>
                    <div style={{ position:'absolute', top:2, left: lifecycleRecord.termination.immediate_access_removal ? 20 : 2, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
                  </button>
                </label>

                <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:18 }}>
                  <button className="btn btn-outline" onClick={requestTermination} disabled={lifecycleSaving}>Request termination</button>
                  {isDirector && lifecycleRecord.termination.status === 'requested' ? (
                    <>
                      <button className="btn btn-primary" onClick={() => decideTermination('approve')} disabled={lifecycleSaving}>Director approve</button>
                      <button className="btn btn-outline" onClick={() => decideTermination('reject')} disabled={lifecycleSaving}>Reject request</button>
                    </>
                  ) : null}
                </div>

                <div style={{ marginTop:16, fontSize:12, color:'var(--faint)', lineHeight:1.7 }}>
                  Requested by: {lifecycleRecord.termination.requested_by_name || '—'}{lifecycleRecord.termination.requested_at ? ` · ${formatTimelineDate(lifecycleRecord.termination.requested_at)}` : ''}
                  <br />
                  Approved by: {lifecycleRecord.termination.approved_by_name || '—'}{lifecycleRecord.termination.approved_at ? ` · ${formatTimelineDate(lifecycleRecord.termination.approved_at)}` : ''}
                </div>
              </div>

              <div style={{ padding:'16px 18px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:8 }}>Offboarding checklist</div>
                    <div style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.6 }}>
                      Track the practical exit steps once termination is approved or when someone is leaving the business.
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                    <span className={`badge badge-${offboardingComplete ? 'green' : offboardingCompletedCount > 0 ? 'amber' : 'grey'}`}>
                      {offboardingCompletedCount}/{offboardingTotalCount} complete
                    </span>
                    {lifecycleRecord.offboarding?.completed_at ? (
                      <span style={{ fontSize:12, color:'var(--sub)' }}>
                        Completed {formatTimelineDate(lifecycleRecord.offboarding.completed_at)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div style={{ display:'grid', gap:10, marginTop:16 }}>
                  {OFFBOARDING_ITEMS.map(([key, label]) => (
                    <div key={key} style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', padding:'12px 14px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
                        <div style={{ fontSize:11, color:'var(--sub)', marginTop:4 }}>
                          {lifecycleRecord.offboarding?.[`${key}_at`]
                            ? `Completed ${formatTimelineDate(lifecycleRecord.offboarding[`${key}_at`])}`
                            : 'Not completed yet'}
                        </div>
                      </div>
                      <button onClick={() => toggleOffboardingItem(key)} style={{ width:44, height:24, borderRadius:12, background: lifecycleRecord.offboarding?.[key] ? 'var(--green)' : 'var(--bg3)', border:'none', position:'relative', flexShrink:0 }}>
                        <div style={{ position:'absolute', top:3, left: lifecycleRecord.offboarding?.[key] ? 23 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="fc" style={{ marginTop:16 }}>
                  <label className="lbl">Offboarding Notes</label>
                  <textarea
                    className="inp"
                    rows={4}
                    value={lifecycleRecord.offboarding?.notes || ''}
                    onChange={(e) => setOffboardingField('notes', e.target.value)}
                    style={{ resize:'vertical' }}
                    placeholder="Add equipment references, payroll notes, exit interview notes, or handover details..."
                  />
                </div>

                <div style={{ marginTop:14, fontSize:12, color:'var(--faint)', lineHeight:1.7 }}>
                  Last updated by: {lifecycleRecord.offboarding?.updated_by_name || '—'}
                  {lifecycleRecord.offboarding?.updated_at ? ` · ${formatTimelineDate(lifecycleRecord.offboarding.updated_at)}` : ''}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'performance' && (
          <div style={{ display:'grid', gap:18 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14 }}>
              <div className="card card-pad">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Reviews open</div>
                <div style={{ fontSize:28, fontWeight:700, color:'var(--text)', marginTop:10 }}>{openReviews.length}</div>
                <div style={{ fontSize:12, color:'var(--sub)', marginTop:6 }}>{overdueReviews.length} overdue</div>
              </div>
              <div className="card card-pad">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Goals open</div>
                <div style={{ fontSize:28, fontWeight:700, color:'var(--text)', marginTop:10 }}>{openGoals.length}</div>
                <div style={{ fontSize:12, color:'var(--sub)', marginTop:6 }}>{dueGoals.length} due now</div>
              </div>
              <div className="card card-pad">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Check-ins</div>
                <div style={{ fontSize:28, fontWeight:700, color:'var(--text)', marginTop:10 }}>{checkIns.length}</div>
                <div style={{ fontSize:12, color:'var(--sub)', marginTop:6 }}>Manager 1:1 and follow-up notes</div>
              </div>
              <div className="card card-pad">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>People ops</div>
                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginTop:10 }}>{peopleOpsSaved ? 'Saved' : 'Live'}</div>
                <div style={{ fontSize:12, color:'var(--sub)', marginTop:6 }}>
                  Schedule reviews, capture notes, and send review outcomes by email.
                </div>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.12fr) minmax(320px,0.88fr)', gap:18 }} className="staff-profile-main-grid">
              <div style={{ display:'grid', gap:18 }}>
                <div className="card card-pad">
                  <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Performance reviews</div>
                      <div style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginTop:4 }}>Review meeting and outcome</div>
                      <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:6, lineHeight:1.6, maxWidth:540 }}>
                        Book the review meeting, email the staff member with the date and meeting method, then add manager notes and mark the review as pass or fail once it is complete.
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      {peopleOpsSaved ? <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved</span> : null}
                      {reviewForm.id ? (
                        <button className="btn btn-outline btn-sm" onClick={resetReviewForm}>New review</button>
                      ) : null}
                    </div>
                  </div>

                  <div className="fg" style={{ marginTop:18 }}>
                    <div>
                      <label className="lbl">Review type</label>
                      <select className="inp" value={reviewForm.review_type} onChange={(e) => setReviewForm((current) => ({ ...current, review_type: e.target.value }))}>
                        {REVIEW_TYPE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="lbl">Review due date</label>
                      <input className="inp" type="date" value={reviewForm.due_date || ''} onChange={(e) => setReviewForm((current) => ({ ...current, due_date: e.target.value }))} />
                    </div>
                    <div>
                      <label className="lbl">Review meeting date</label>
                      <input className="inp" type="date" value={reviewForm.meeting_date || ''} onChange={(e) => setReviewForm((current) => ({ ...current, meeting_date: e.target.value }))} />
                    </div>
                    <div>
                      <label className="lbl">Meeting method</label>
                      <select className="inp" value={reviewForm.meeting_method || 'Teams call'} onChange={(e) => setReviewForm((current) => ({ ...current, meeting_method: e.target.value }))}>
                        {['Teams call', 'Phone call', 'WhatsApp call', 'WhatsApp message', 'Text message', 'In person'].map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                    <div className="fc">
                      <label className="lbl">Review summary</label>
                      <textarea className="inp" rows={3} value={reviewForm.summary || ''} onChange={(e) => setReviewForm((current) => ({ ...current, summary: e.target.value }))} style={{ resize:'vertical' }} placeholder="Headline summary of performance, concerns, or progress..." />
                    </div>
                    <div className="fc">
                      <label className="lbl">Manager notes</label>
                      <textarea className="inp" rows={4} value={reviewForm.manager_notes || ''} onChange={(e) => setReviewForm((current) => ({ ...current, manager_notes: e.target.value }))} style={{ resize:'vertical' }} placeholder="Manager notes from the review meeting..." />
                    </div>
                    <div className="fc">
                      <label className="lbl">Action plan / next steps</label>
                      <textarea className="inp" rows={3} value={reviewForm.action_plan || ''} onChange={(e) => setReviewForm((current) => ({ ...current, action_plan: e.target.value }))} style={{ resize:'vertical' }} placeholder="Follow-up actions, support, targets, or extension notes..." />
                    </div>
                  </div>

                  <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:18 }}>
                    {!reviewForm.id ? (
                      <button className="btn btn-primary" onClick={scheduleReviewMeeting} disabled={peopleOpsSaving}>
                        {peopleOpsSaving ? 'Scheduling...' : 'Schedule review meeting'}
                      </button>
                    ) : (
                      <>
                        <button className="btn btn-outline" onClick={saveReviewNotes} disabled={peopleOpsSaving}>
                          {peopleOpsSaving ? 'Saving...' : 'Save review notes'}
                        </button>
                        <button className="btn btn-primary" onClick={() => completeReview('pass')} disabled={peopleOpsSaving}>
                          Mark pass
                        </button>
                        <button className="btn btn-outline" onClick={() => completeReview('fail')} disabled={peopleOpsSaving} style={{ color:'var(--red)', borderColor:'rgba(229,77,46,0.25)' }}>
                          Mark fail
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="card" style={{ overflow:'hidden' }}>
                  <div style={{ padding:'16px 18px', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Review queue</div>
                    <div style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginTop:4 }}>Scheduled and completed reviews</div>
                  </div>
                  {reviews.length === 0 ? (
                    <div style={{ padding:'22px 18px', fontSize:13, color:'var(--faint)' }}>No performance or probation reviews have been logged for this staff member yet.</div>
                  ) : reviews.map((review) => (
                    <div key={review.id} style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
                        <div>
                          <div style={{ fontSize:13.5, fontWeight:600, color:'var(--text)' }}>{getReviewTypeLabel(review.review_type)}</div>
                          <div style={{ fontSize:12, color:'var(--sub)', marginTop:4, lineHeight:1.6 }}>
                            {review.meeting_date ? `Meeting ${review.meeting_date}` : 'No meeting date set'}
                            {review.meeting_method ? ` · ${review.meeting_method}` : ''}
                            {review.due_date ? ` · Due ${review.due_date}` : ''}
                          </div>
                          <div style={{ fontSize:12, color:'var(--faint)', marginTop:6, lineHeight:1.6 }}>
                            {review.manager_notes || review.summary || 'No notes added yet.'}
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                          <span className={`badge badge-${review.outcome === 'fail' ? 'red' : review.outcome === 'pass' ? 'green' : review.status === 'meeting_booked' ? 'blue' : review.due_date && new Date(`${review.due_date}T23:59:59`).getTime() < Date.now() ? 'amber' : 'grey'}`}>
                            {review.outcome ? review.outcome : review.status}
                          </span>
                          <button className="btn btn-outline btn-sm" onClick={() => selectReview(review)}>Open</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display:'grid', gap:18 }}>
                <div className="card card-pad">
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Manager check-ins</div>
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginTop:4 }}>1:1 notes and follow-up</div>
                  <div className="fg" style={{ marginTop:14 }}>
                    <div>
                      <label className="lbl">Check-in date</label>
                      <input className="inp" type="date" value={checkInForm.check_in_date || ''} onChange={(e) => setCheckInForm((current) => ({ ...current, check_in_date: e.target.value }))} />
                    </div>
                    <div>
                      <label className="lbl">Status</label>
                      <select className="inp" value={checkInForm.status || 'scheduled'} onChange={(e) => setCheckInForm((current) => ({ ...current, status: e.target.value }))}>
                        {CHECK_IN_STATUS_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="lbl">Follow-up date</label>
                      <input className="inp" type="date" value={checkInForm.follow_up_date || ''} onChange={(e) => setCheckInForm((current) => ({ ...current, follow_up_date: e.target.value }))} />
                    </div>
                    <div className="fc">
                      <label className="lbl">Check-in notes</label>
                      <textarea className="inp" rows={3} value={checkInForm.notes || ''} onChange={(e) => setCheckInForm((current) => ({ ...current, notes: e.target.value }))} style={{ resize:'vertical' }} placeholder="Capture 1:1 notes, support needs, and actions..." />
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:16 }}>
                    <button className="btn btn-primary" onClick={saveManagerCheckIn} disabled={peopleOpsSaving}>{peopleOpsSaving ? 'Saving...' : 'Save check-in'}</button>
                    <button className="btn btn-outline" onClick={resetCheckInForm}>Clear</button>
                  </div>
                  <div style={{ display:'grid', gap:10, marginTop:16 }}>
                    {checkIns.slice(0, 4).map((checkIn) => (
                      <div key={checkIn.id} style={{ padding:'12px 13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg2)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{checkIn.check_in_date || 'No date set'}</div>
                          <span className={`badge badge-${checkIn.status === 'completed' ? 'green' : checkIn.status === 'follow_up_needed' ? 'amber' : 'grey'}`}>{getCheckInStatusLabel(checkIn.status)}</span>
                        </div>
                        <div style={{ fontSize:12, color:'var(--sub)', marginTop:6, lineHeight:1.6 }}>{checkIn.notes || 'No notes captured yet.'}</div>
                      </div>
                    ))}
                    {checkIns.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No manager check-ins saved yet.</div> : null}
                  </div>
                </div>

                <div className="card card-pad">
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Goals and objectives</div>
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginTop:4 }}>Track expectations and progress</div>
                  <div className="fg" style={{ marginTop:14 }}>
                    <div className="fc">
                      <label className="lbl">Goal title</label>
                      <input className="inp" value={goalForm.title || ''} onChange={(e) => setGoalForm((current) => ({ ...current, title: e.target.value }))} placeholder="Example: Hit outreach target for the month" />
                    </div>
                    <div className="fc">
                      <label className="lbl">Goal description</label>
                      <textarea className="inp" rows={3} value={goalForm.description || ''} onChange={(e) => setGoalForm((current) => ({ ...current, description: e.target.value }))} style={{ resize:'vertical' }} placeholder="Describe what success looks like..." />
                    </div>
                    <div>
                      <label className="lbl">Progress %</label>
                      <input className="inp" type="number" min="0" max="100" value={goalForm.progress} onChange={(e) => setGoalForm((current) => ({ ...current, progress: Number(e.target.value || 0) }))} />
                    </div>
                    <div>
                      <label className="lbl">Due date</label>
                      <input className="inp" type="date" value={goalForm.due_date || ''} onChange={(e) => setGoalForm((current) => ({ ...current, due_date: e.target.value }))} />
                    </div>
                    <div>
                      <label className="lbl">Status</label>
                      <select className="inp" value={goalForm.status || 'active'} onChange={(e) => setGoalForm((current) => ({ ...current, status: e.target.value }))}>
                        {GOAL_STATUS_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:16 }}>
                    <button className="btn btn-primary" onClick={saveGoal} disabled={peopleOpsSaving}>{peopleOpsSaving ? 'Saving...' : 'Save goal'}</button>
                    <button className="btn btn-outline" onClick={resetGoalForm}>Clear</button>
                  </div>
                  <div style={{ display:'grid', gap:10, marginTop:16 }}>
                    {goals.slice(0, 5).map((goal) => (
                      <div key={goal.id} style={{ padding:'12px 13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg2)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{goal.title}</div>
                          <span className={`badge badge-${goal.status === 'completed' ? 'green' : goal.status === 'at_risk' ? 'red' : 'amber'}`}>{getGoalStatusLabel(goal.status)}</span>
                        </div>
                        <div style={{ fontSize:12, color:'var(--sub)', marginTop:6, lineHeight:1.6 }}>{goal.description || 'No description added.'}</div>
                        <div style={{ fontSize:11.5, color:'var(--faint)', marginTop:6 }}>{Math.round(goal.progress || 0)}% · {goal.due_date ? `Due ${goal.due_date}` : 'No due date'}</div>
                      </div>
                    ))}
                    {goals.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No goals or objectives saved yet.</div> : null}
                  </div>
                </div>

                <ProfileTimeline
                  title="Review history"
                  subtitle="Recent people ops timeline"
                  items={peopleOpsTimeline}
                  emptyMessage="No people-ops history has been recorded yet."
                  limit={8}
                />
              </div>
            </div>
          </div>
        )}

        {tab === 'training' && (
          <div style={{ display:'grid', gap:18 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14 }}>
              <div className="card card-pad">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Training open</div>
                <div style={{ fontSize:28, fontWeight:700, color:'var(--text)', marginTop:10 }}>{openTraining.length}</div>
                <div style={{ fontSize:12, color:'var(--sub)', marginTop:6 }}>{dueTraining.length} due now</div>
              </div>
              <div className="card card-pad">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Mandatory items</div>
                <div style={{ fontSize:28, fontWeight:700, color:'var(--text)', marginTop:10 }}>{trainingRecords.filter((record) => record.mandatory).length}</div>
                <div style={{ fontSize:12, color:'var(--sub)', marginTop:6 }}>Training and certifications requiring completion</div>
              </div>
              <div className="card card-pad">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Completed</div>
                <div style={{ fontSize:28, fontWeight:700, color:'var(--text)', marginTop:10 }}>{trainingRecords.filter((record) => record.status === 'completed').length}</div>
                <div style={{ fontSize:12, color:'var(--sub)', marginTop:6 }}>Logged as completed in the portal</div>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(320px,0.95fr)', gap:18 }} className="staff-profile-main-grid">
              <div className="card card-pad">
                <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Training and certifications</div>
                    <div style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginTop:4 }}>Assign training to this staff member</div>
                    <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:6, lineHeight:1.6, maxWidth:520 }}>
                      Assign induction, compliance, systems, sales, or certification items. Staff get the assignment by portal notification and email.
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => navigate('/hr/training-catalogue')}>Open training catalogue</button>
                  </div>
                </div>

                <div className="fg" style={{ marginTop:18 }}>
                  <div>
                    <label className="lbl">Template</label>
                    <select className="inp" value={trainingForm.templateId || ''} onChange={(e) => applyTrainingTemplate(e.target.value)}>
                      <option value="">Custom assignment</option>
                      {trainingTemplates.map((template) => (
                        <option key={template.id} value={template.id}>{template.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="fc">
                    <label className="lbl">Training title</label>
                    <input className="inp" value={trainingForm.title || ''} onChange={(e) => setTrainingForm((current) => ({ ...current, title: e.target.value }))} placeholder="Example: Microsoft Company Portal setup" />
                  </div>
                  <div>
                    <label className="lbl">Category</label>
                    <select className="inp" value={trainingForm.category || 'induction'} onChange={(e) => setTrainingForm((current) => ({ ...current, category: e.target.value }))}>
                      {TRAINING_CATEGORY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="lbl">Status</label>
                    <select className="inp" value={trainingForm.status || 'assigned'} onChange={(e) => setTrainingForm((current) => ({ ...current, status: e.target.value }))}>
                      {TRAINING_STATUS_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="lbl">Due date</label>
                    <input className="inp" type="date" value={trainingForm.due_date || ''} onChange={(e) => setTrainingForm((current) => ({ ...current, due_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="lbl">Expiry date</label>
                    <input className="inp" type="date" value={trainingForm.expires_at || ''} onChange={(e) => setTrainingForm((current) => ({ ...current, expires_at: e.target.value }))} />
                  </div>
                  <div>
                    <label className="lbl">Certificate name</label>
                    <input className="inp" value={trainingForm.certificate_name || ''} onChange={(e) => setTrainingForm((current) => ({ ...current, certificate_name: e.target.value }))} placeholder="Optional certificate or proof name" />
                  </div>
                  <div className="fc">
                    <label className="lbl">Certificate URL</label>
                    <input className="inp" value={trainingForm.certificate_url || ''} onChange={(e) => setTrainingForm((current) => ({ ...current, certificate_url: e.target.value }))} placeholder="Optional certificate link" />
                  </div>
                  <div className="fc">
                    <label className="lbl">Notes</label>
                    <textarea className="inp" rows={3} value={trainingForm.notes || ''} onChange={(e) => setTrainingForm((current) => ({ ...current, notes: e.target.value }))} style={{ resize:'vertical' }} placeholder="Instructions, expected completion steps, or evidence notes..." />
                  </div>
                </div>

                <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:14 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, color:'var(--sub)' }}>
                    <input type="checkbox" checked={trainingForm.mandatory} onChange={(e) => setTrainingForm((current) => ({ ...current, mandatory: e.target.checked }))} />
                    Mandatory training
                  </label>
                </div>

                <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:18 }}>
                  <button className="btn btn-primary" onClick={saveTrainingRecord} disabled={peopleOpsSaving}>{peopleOpsSaving ? 'Saving...' : 'Save training assignment'}</button>
                  <button className="btn btn-outline" onClick={resetTrainingForm}>Clear</button>
                </div>
              </div>

              <div className="card card-pad">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Training log</div>
                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginTop:4 }}>Assigned training and certifications</div>
                <div style={{ display:'grid', gap:10, marginTop:16 }}>
                  {trainingRecords.map((record) => (
                    <div key={record.id} style={{ padding:'12px 13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg2)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{record.title}</div>
                        <span className={`badge badge-${record.status === 'completed' ? 'green' : record.mandatory ? 'red' : 'blue'}`}>{getTrainingStatusLabel(record.status)}</span>
                      </div>
                      <div style={{ fontSize:12, color:'var(--sub)', marginTop:6, lineHeight:1.6 }}>
                        {getTrainingCategoryLabel(record.category)} · {record.mandatory ? 'Mandatory' : 'Optional'}
                        {record.due_date ? ` · Due ${record.due_date}` : ''}
                        {record.expires_at ? ` · Expires ${record.expires_at}` : ''}
                      </div>
                      {record.notes ? <div style={{ fontSize:12, color:'var(--sub)', marginTop:6, lineHeight:1.6 }}>{record.notes}</div> : null}
                      {record.certificate_name || record.certificate_url ? (
                        <div style={{ fontSize:11.5, color:'var(--faint)', marginTop:6 }}>
                          {record.certificate_name || 'Certificate'}
                          {record.certificate_url ? ` · ${record.certificate_url}` : ''}
                        </div>
                      ) : null}
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:10 }}>
                        {record.status !== 'in_progress' && record.status !== 'completed' ? (
                          <button className="btn btn-outline btn-sm" onClick={() => updateTrainingStatus(record, 'in_progress')} disabled={peopleOpsSaving}>Mark in progress</button>
                        ) : null}
                        {record.status !== 'completed' ? (
                          <button className="btn btn-primary btn-sm" onClick={() => updateTrainingStatus(record, 'completed')} disabled={peopleOpsSaving}>Mark completed</button>
                        ) : (
                          <button className="btn btn-outline btn-sm" onClick={() => updateTrainingStatus(record, 'assigned')} disabled={peopleOpsSaving}>Re-open</button>
                        )}
                        <button className="btn btn-outline btn-sm" onClick={() => sendTrainingReminder(record)} disabled={peopleOpsSaving}>
                          Send reminder
                        </button>
                      </div>
                    </div>
                  ))}
                  {trainingRecords.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No training or certification records saved yet.</div> : null}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'portal' && (
          <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.1fr) minmax(300px,0.9fr)', gap:18 }} className="staff-profile-main-grid">
            <div className="card card-pad staff-profile-form-card">
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:18, flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Staff experience</div>
                  <div style={{ fontSize:20, fontWeight:600, color:'var(--text)', marginTop:4 }}>Theme and dashboard layout</div>
                  <div style={{ fontSize:13, color:'var(--sub)', marginTop:6, lineHeight:1.6, maxWidth:520 }}>
                    Control this staff member’s portal colour scheme and which dashboard sections appear for them.
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  {portalPrefsSaved ? <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved</span> : null}
                  <button className="btn btn-primary" onClick={savePortalPrefs} disabled={portalPrefsSaving}>
                    {portalPrefsSaving ? 'Saving...' : 'Save portal setup'}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom:18 }}>
                <div className="lbl" style={{ marginBottom:8 }}>Workspace preset</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
                  {WORKSPACE_PRESET_OPTIONS.map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => applyPortalPreset(key)}
                      style={{
                        padding:'13px 14px',
                        borderRadius:12,
                        border:`1px solid ${portalPrefs.workspacePreset === key ? 'var(--accent-border)' : 'var(--border)'}`,
                        background: portalPrefs.workspacePreset === key ? 'var(--accent-soft)' : 'var(--card)',
                        textAlign:'left',
                      }}
                    >
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:18 }}>
                <div className="lbl" style={{ marginBottom:8 }}>Theme mode</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    ['light', 'Light', 'Bright default workspace'],
                    ['dark', 'Dark', 'Lower-glare evening mode'],
                  ].map(([key, label, desc]) => (
                    <button
                      key={key}
                      onClick={() => gp('themeMode', key)}
                      style={{
                        padding:'14px 16px',
                        borderRadius:12,
                        border:`2px solid ${portalPrefs.themeMode === key ? 'var(--accent)' : 'var(--border)'}`,
                        background: portalPrefs.themeMode === key ? 'var(--accent-soft)' : 'var(--card)',
                        textAlign:'left',
                      }}
                    >
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:4 }}>{label}</div>
                      <div style={{ fontSize:12, color:'var(--sub)' }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:18 }}>
                <div className="lbl" style={{ marginBottom:8 }}>Accent scheme</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10 }}>
                  {Object.entries(ACCENT_SCHEMES).map(([key, scheme]) => (
                    <button
                      key={key}
                      onClick={() => gp('accentScheme', key)}
                      style={{
                        padding:'14px',
                        borderRadius:12,
                        border:`2px solid ${portalPrefs.accentScheme === key ? scheme.accent : 'var(--border)'}`,
                        background: portalPrefs.accentScheme === key ? scheme.soft : 'var(--card)',
                        textAlign:'left',
                      }}
                    >
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                        <span style={{ width:12, height:12, borderRadius:'50%', background:scheme.accent, boxShadow:`0 0 10px ${scheme.accent}` }} />
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{scheme.label}</span>
                      </div>
                      <div style={{ fontSize:11, color:'var(--sub)' }}>{key}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:18 }}>
                <div className="lbl" style={{ marginBottom:8 }}>Comfort & accessibility</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }} className="dashboard-personalise-grid">
                  <div>
                    <div className="lbl" style={{ marginBottom:8 }}>Text size</div>
                    <div style={{ display:'grid', gap:10 }}>
                      {TEXT_SCALE_OPTIONS.map(([key, label]) => (
                        <button key={key} onClick={() => gp('textScale', key)} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${portalPrefs.textScale === key ? 'var(--accent-border)' : 'var(--border)'}`, background: portalPrefs.textScale === key ? 'var(--accent-soft)' : 'var(--card)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, textAlign:'left' }}>
                          <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</span>
                          <span className={`badge badge-${portalPrefs.textScale === key ? 'blue' : 'grey'}`}>{portalPrefs.textScale === key ? 'On' : 'Off'}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="lbl" style={{ marginBottom:8 }}>Motion</div>
                    <div style={{ display:'grid', gap:10 }}>
                      {MOTION_OPTIONS.map(([key, label]) => (
                        <button key={key} onClick={() => gp('motionMode', key)} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${portalPrefs.motionMode === key ? 'var(--accent-border)' : 'var(--border)'}`, background: portalPrefs.motionMode === key ? 'var(--accent-soft)' : 'var(--card)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, textAlign:'left' }}>
                          <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</span>
                          <span className={`badge badge-${portalPrefs.motionMode === key ? 'blue' : 'grey'}`}>{portalPrefs.motionMode === key ? 'On' : 'Off'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }} className="dashboard-personalise-grid">
                  <div>
                    <div className="lbl" style={{ marginBottom:8 }}>Navigation density</div>
                    <div style={{ display:'grid', gap:10 }}>
                      {NAV_DENSITY_OPTIONS.map(([key, label]) => (
                        <button key={key} onClick={() => gp('navDensity', key)} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${portalPrefs.navDensity === key ? 'var(--accent-border)' : 'var(--border)'}`, background: portalPrefs.navDensity === key ? 'var(--accent-soft)' : 'var(--card)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, textAlign:'left' }}>
                          <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</span>
                          <span className={`badge badge-${portalPrefs.navDensity === key ? 'blue' : 'grey'}`}>{portalPrefs.navDensity === key ? 'On' : 'Off'}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="lbl" style={{ marginBottom:8 }}>Contrast</div>
                    <div style={{ display:'grid', gap:10 }}>
                      {CONTRAST_OPTIONS.map(([key, label]) => (
                        <button key={key} onClick={() => gp('contrastMode', key)} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${portalPrefs.contrastMode === key ? 'var(--accent-border)' : 'var(--border)'}`, background: portalPrefs.contrastMode === key ? 'var(--accent-soft)' : 'var(--card)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, textAlign:'left' }}>
                          <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</span>
                          <span className={`badge badge-${portalPrefs.contrastMode === key ? 'blue' : 'grey'}`}>{portalPrefs.contrastMode === key ? 'On' : 'Off'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }} className="dashboard-personalise-grid">
                <div>
                  <div className="lbl" style={{ marginBottom:8 }}>Dashboard density</div>
                  <div style={{ display:'grid', gap:10 }}>
                    {DASHBOARD_DENSITY_OPTIONS.map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => gp('dashboardDensity', key)}
                        style={{
                          padding:'13px 14px',
                          borderRadius:12,
                          border:`1px solid ${portalPrefs.dashboardDensity === key ? 'var(--accent-border)' : 'var(--border)'}`,
                          background: portalPrefs.dashboardDensity === key ? 'var(--accent-soft)' : 'var(--card)',
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'space-between',
                          gap:12,
                          textAlign:'left',
                        }}
                      >
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</span>
                        <span className={`badge badge-${portalPrefs.dashboardDensity === key ? 'blue' : 'grey'}`}>{portalPrefs.dashboardDensity === key ? 'On' : 'Off'}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="lbl" style={{ marginBottom:8 }}>Header style</div>
                  <div style={{ display:'grid', gap:10 }}>
                    {DASHBOARD_HEADER_OPTIONS.map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => gp('dashboardHeader', key)}
                        style={{
                          padding:'13px 14px',
                          borderRadius:12,
                          border:`1px solid ${portalPrefs.dashboardHeader === key ? 'var(--accent-border)' : 'var(--border)'}`,
                          background: portalPrefs.dashboardHeader === key ? 'var(--accent-soft)' : 'var(--card)',
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'space-between',
                          gap:12,
                          textAlign:'left',
                        }}
                      >
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</span>
                        <span className={`badge badge-${portalPrefs.dashboardHeader === key ? 'blue' : 'grey'}`}>{portalPrefs.dashboardHeader === key ? 'On' : 'Off'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom:18 }}>
                <div className="lbl" style={{ marginBottom:8 }}>Default landing page</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10 }}>
                  {DEFAULT_LANDING_OPTIONS.map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => gp('defaultLanding', key)}
                      style={{
                        padding:'13px 14px',
                        borderRadius:12,
                        border:`1px solid ${portalPrefs.defaultLanding === key ? 'var(--accent-border)' : 'var(--border)'}`,
                        background: portalPrefs.defaultLanding === key ? 'var(--accent-soft)' : 'var(--card)',
                        textAlign:'left',
                      }}
                    >
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:18 }}>
                <div className="lbl" style={{ marginBottom:8 }}>Dashboard behaviour</div>
                <button
                  onClick={() => gp('showSystemBanners', !portalPrefs.showSystemBanners)}
                  style={{
                    width:'100%',
                    padding:'13px 14px',
                    borderRadius:12,
                    border:`1px solid ${portalPrefs.showSystemBanners ? 'var(--accent-border)' : 'var(--border)'}`,
                    background: portalPrefs.showSystemBanners ? 'var(--accent-soft)' : 'var(--card)',
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'space-between',
                    gap:12,
                    textAlign:'left',
                  }}
                >
                  <span>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:4 }}>Show system banners</div>
                    <div style={{ fontSize:12, color:'var(--sub)' }}>Show maintenance and system-status notices at the top of this staff member’s dashboard.</div>
                  </span>
                  <span className={`badge badge-${portalPrefs.showSystemBanners ? 'blue' : 'grey'}`}>{portalPrefs.showSystemBanners ? 'Visible' : 'Hidden'}</span>
                </button>
              </div>

              <div style={{ marginBottom:18 }}>
                <div className="lbl" style={{ marginBottom:8 }}>Pinned quick actions</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:10 }}>
                  {QUICK_ACTION_OPTIONS.map(([key, label]) => {
                    const enabled = portalPrefs.quickActions?.includes(key)
                    return (
                      <button
                        key={key}
                        onClick={() => togglePortalQuickAction(key)}
                        style={{
                          padding:'13px 14px',
                          borderRadius:12,
                          border:`1px solid ${enabled ? 'var(--accent-border)' : 'var(--border)'}`,
                          background: enabled ? 'var(--accent-soft)' : 'var(--card)',
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'space-between',
                          gap:12,
                          textAlign:'left',
                        }}
                      >
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</span>
                        <span className={`badge badge-${enabled ? 'blue' : 'grey'}`}>{enabled ? 'Pinned' : 'Off'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="lbl" style={{ marginBottom:8 }}>Dashboard sections</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10 }}>
                  {DASHBOARD_SECTIONS.map(([key, label]) => {
                    const enabled = portalPrefs.dashboardSections?.[key] !== false
                    return (
                      <button
                        key={key}
                        onClick={() => togglePortalSection(key)}
                        style={{
                          padding:'13px 14px',
                          borderRadius:12,
                          border:`1px solid ${enabled ? 'var(--accent-border)' : 'var(--border)'}`,
                          background: enabled ? 'var(--accent-soft)' : 'var(--card)',
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'space-between',
                          gap:12,
                          textAlign:'left',
                        }}
                      >
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</span>
                        <span className={`badge badge-${enabled ? 'blue' : 'grey'}`}>{enabled ? 'On' : 'Off'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="staff-profile-admin-column" style={{ display:'grid', gap:14 }}>
              <div className="card card-pad staff-profile-admin-card">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>Current setup</div>
                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginBottom:10 }}>Live staff view</div>
                <div style={{ display:'grid', gap:10 }}>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Workspace preset</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{describeWorkspacePreset(portalPrefs)}</div>
                  </div>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Theme</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{portalPrefs.themeMode === 'dark' ? 'Dark mode' : 'Light mode'}</div>
                  </div>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Accent</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:12, height:12, borderRadius:'50%', background:(ACCENT_SCHEMES[portalPrefs.accentScheme] || ACCENT_SCHEMES.blue).accent }} />
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{(ACCENT_SCHEMES[portalPrefs.accentScheme] || ACCENT_SCHEMES.blue).label}</div>
                    </div>
                  </div>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Landing page</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>
                      {(DEFAULT_LANDING_OPTIONS.find(([key]) => key === portalPrefs.defaultLanding)?.[1]) || 'Dashboard'}
                    </div>
                  </div>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Layout</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>
                      {(DASHBOARD_DENSITY_OPTIONS.find(([key]) => key === portalPrefs.dashboardDensity)?.[1]) || 'Comfortable'} · {(DASHBOARD_HEADER_OPTIONS.find(([key]) => key === portalPrefs.dashboardHeader)?.[1]) || 'Full header'}
                    </div>
                  </div>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Comfort</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <span className="badge badge-blue">{TEXT_SCALE_OPTIONS.find(([key]) => key === portalPrefs.textScale)?.[1] || 'Standard'}</span>
                      <span className="badge badge-blue">{MOTION_OPTIONS.find(([key]) => key === portalPrefs.motionMode)?.[1] || 'Standard motion'}</span>
                      <span className="badge badge-blue">{NAV_DENSITY_OPTIONS.find(([key]) => key === portalPrefs.navDensity)?.[1] || 'Comfortable nav'}</span>
                      <span className="badge badge-blue">{CONTRAST_OPTIONS.find(([key]) => key === portalPrefs.contrastMode)?.[1] || 'Standard contrast'}</span>
                    </div>
                  </div>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Pinned actions</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {(portalPrefs.quickActions || []).map((key) => (
                        <span key={key} className="badge badge-blue">{QUICK_ACTION_OPTIONS.find(([actionKey]) => actionKey === key)?.[1] || key}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>System banners</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{portalPrefs.showSystemBanners ? 'Shown on dashboard' : 'Hidden from dashboard'}</div>
                  </div>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Dashboard shown</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {DASHBOARD_SECTIONS.filter(([key]) => portalPrefs.dashboardSections?.[key] !== false).map(([, label]) => (
                        <span key={label} className="badge badge-blue">{label}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'hr' && (
          <div className="card card-pad">
            <div className="fg">
              <div><label className="lbl">Contract Type</label>
                <select className="inp" value={profile.contract_type || ''} onChange={e=>pf('contract_type',e.target.value)}>
                  {['','Full-time','Part-time','Contractor','Zero Hours','Apprentice'].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="lbl">Start Date</label><input className="inp" type="date" value={profile.start_date||''} onChange={e=>pf('start_date',e.target.value)}/></div>
              <div className="fc"><label className="lbl">HR Notes (admin only)</label><textarea className="inp" rows={5} value={profile.hr_notes || ''} onChange={e=>pf('hr_notes',e.target.value)} style={{ resize:'vertical' }} placeholder="Performance notes, training, anything relevant..."/></div>
            </div>
          </div>
        )}

        {tab === 'bank' && (
          <div className="card card-pad">
            <div style={{ padding:'10px 14px', background:'var(--amber-bg)', border:'1px solid var(--amber)', borderRadius:7, fontSize:13, color:'var(--amber)', marginBottom:16 }}>
              Bank details are sensitive — keep this tab secure.
            </div>
            <div className="fg">
              <div><label className="lbl">Bank Name</label><input className="inp" value={profile.bank_name || ''} onChange={e=>pf('bank_name',e.target.value)}/></div>
              <div><label className="lbl">Account Name</label><input className="inp" value={profile.account_name || ''} onChange={e=>pf('account_name',e.target.value)}/></div>
              <div><label className="lbl">Sort Code</label><input className="inp" value={profile.sort_code || ''} onChange={e=>pf('sort_code',e.target.value)} placeholder="12-34-56" style={{ fontFamily:'var(--font-mono)' }}/></div>
              <div><label className="lbl">Account Number</label><input className="inp" value={profile.account_number || ''} onChange={e=>pf('account_number',e.target.value)} placeholder="12345678" style={{ fontFamily:'var(--font-mono)' }}/></div>
            </div>
          </div>
        )}

        {tab === 'permissions' && (
          <div className="card card-pad">
            <div style={{ ...{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:16, marginBottom:18 } }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>Access controls</div>
                  <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:4, maxWidth:420 }}>
                    These switches now control both navigation visibility and actual page access. Disabled pages will show an access-disabled screen if someone tries to open them directly.
                  </div>
                  {isDirector ? (
                    <div style={{ fontSize:11.5, color:'var(--sub)', marginTop:8, maxWidth:460, lineHeight:1.55 }}>
                      Director note: your own live session keeps Director override access to company-wide controls, so what you personally can see may be broader than the saved toggles on this staff record.
                    </div>
                  ) : null}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:8, minWidth:280, flex:1, maxWidth:420 }}>
                  {Object.keys(ROLE_DEFAULTS).map(role => {
                    const enabledCount = Object.values(ROLE_DEFAULTS[role]).filter(Boolean).length
                    return (
                      <button
                        key={role}
                        onClick={() => setEditPerms({ ...ROLE_DEFAULTS[role] })}
                        className="btn btn-outline btn-sm"
                        style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2, padding:'10px 12px', height:'auto' }}
                      >
                        <span>Reset to {role}</span>
                        <span style={{ fontSize:10, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{enabledCount} pages enabled</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {PERMISSION_GROUPS.map(group => {
              const items = ALL_PAGES.filter((page) => page.group === group)
              const enabledCount = items.filter(({ key }) => editPerms[key]).length
              return (
                <div key={group} style={{ marginBottom:18, border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', background:'var(--bg)' }}>
                  <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>{group}</div>
                      <div style={{ fontSize:13, color:'var(--sub)', marginTop:3 }}>
                        {enabledCount} of {items.length} enabled
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditPerms((current) => {
                        const next = { ...current }
                        items.forEach(({ key }) => { next[key] = true })
                        return next
                      })}>Enable all</button>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditPerms((current) => {
                        const next = { ...current }
                        items.forEach(({ key }) => { next[key] = false })
                        return next
                      })}>Disable all</button>
                    </div>
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10, padding:12 }}>
                    {items.map(({ key, label, desc }) => {
                      const enabled = !!editPerms[key]
                      return (
                        <button
                          key={key}
                          onClick={() => setEditPerms((current) => ({ ...current, [key]: !current[key] }))}
                          style={{
                            display:'flex',
                            alignItems:'flex-start',
                            justifyContent:'space-between',
                            gap:12,
                            padding:'12px 14px',
                            borderRadius:10,
                            border:'1px solid',
                            borderColor: enabled ? 'var(--accent-border)' : 'var(--border)',
                            background: enabled ? 'var(--accent-soft)' : 'var(--card)',
                            cursor:'pointer',
                            transition:'all 0.15s',
                            textAlign:'left',
                          }}
                        >
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', lineHeight:1.3 }}>{label}</div>
                            <div style={{ fontSize:11, color:'var(--sub)', marginTop:4, lineHeight:1.45 }}>
                              {desc || 'Page access control'}
                            </div>
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8, flexShrink:0 }}>
                            <span
                              style={{
                                fontSize:10,
                                fontFamily:'var(--font-mono)',
                                letterSpacing:'0.06em',
                                textTransform:'uppercase',
                                color: enabled ? 'var(--accent)' : 'var(--faint)',
                              }}
                            >
                              {enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <div style={{ width:32, height:18, borderRadius:9, background: enabled ? 'var(--accent)' : 'var(--border)', position:'relative' }}>
                              <div style={{ position:'absolute', top:2, left: enabled ? 16 : 2, width:14, height:14, borderRadius:'50%', background:'#fff', transition:'left 0.18s' }} />
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'alerts' && (
          <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.05fr) minmax(280px,0.95fr)', gap:18 }} className="staff-profile-main-grid">
            <div className="card card-pad">
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:18, flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Alert defaults</div>
                  <div style={{ fontSize:20, fontWeight:600, color:'var(--text)', marginTop:4 }}>Staff notification preferences</div>
                  <div style={{ fontSize:13, color:'var(--sub)', marginTop:6, lineHeight:1.6, maxWidth:560 }}>
                    Choose how this staff member receives each type of portal update. Urgent alerts still go to both the portal and email regardless of these defaults.
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  {portalPrefsSaved ? <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved</span> : null}
                  <button className="btn btn-primary" onClick={savePortalPrefs} disabled={portalPrefsSaving}>
                    {portalPrefsSaving ? 'Saving...' : 'Save alert defaults'}
                  </button>
                </div>
              </div>

              <div style={{ display:'grid', gap:12 }}>
                {NOTIFICATION_CATEGORY_OPTIONS.map(([category, label]) => (
                  <div key={category} style={{ padding:'14px 16px', border:'1px solid var(--border)', borderRadius:14, background:'var(--card)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:10 }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{label}</div>
                        <div style={{ fontSize:12, color:'var(--sub)', marginTop:4 }}>
                          {category === 'urgent' ? 'Critical alerts always stay forced through.' : 'Set the default delivery route for this person.'}
                        </div>
                      </div>
                      <span className={`badge badge-${category === 'urgent' ? 'red' : 'blue'}`}>
                        {portalPrefs.notificationPreferences?.[category] || 'both'}
                      </span>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10 }}>
                      {NOTIFICATION_DELIVERY_OPTIONS.map(([delivery, deliveryLabel]) => {
                        const active = (portalPrefs.notificationPreferences?.[category] || 'both') === delivery
                        return (
                          <button
                            key={delivery}
                            onClick={() => setPortalNotificationDelivery(category, delivery)}
                            disabled={category === 'urgent'}
                            style={{
                              padding:'12px 13px',
                              borderRadius:12,
                              border:`1px solid ${active ? 'var(--accent-border)' : 'var(--border)'}`,
                              background: active ? 'var(--accent-soft)' : 'var(--card)',
                              textAlign:'left',
                              opacity: category === 'urgent' && !active ? 0.55 : 1,
                              cursor: category === 'urgent' ? 'default' : 'pointer',
                            }}
                          >
                            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{deliveryLabel}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="staff-profile-admin-column" style={{ display:'grid', gap:14 }}>
              <div className="card card-pad staff-profile-admin-card">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>Current routing</div>
                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginBottom:10 }}>How this person hears from the portal</div>
                <div style={{ display:'grid', gap:10 }}>
                  {NOTIFICATION_CATEGORY_OPTIONS.map(([category, label]) => (
                    <div key={category} style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', marginBottom:4 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
                        <span className={`badge badge-${category === 'urgent' ? 'red' : 'blue'}`}>{portalPrefs.notificationPreferences?.[category] || 'both'}</span>
                      </div>
                      <div style={{ fontSize:12, color:'var(--sub)', lineHeight:1.5 }}>
                        {category === 'urgent'
                          ? 'Critical alerts always send to both the portal inbox and work email.'
                          : (portalPrefs.notificationPreferences?.[category] || 'both') === 'portal'
                            ? 'Portal only'
                            : (portalPrefs.notificationPreferences?.[category] || 'both') === 'email'
                              ? 'Email only'
                              : 'Portal + email'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'notify' && (
          <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.2fr) minmax(300px,0.8fr)', gap:18 }} className="staff-profile-main-grid">
            <div className="card card-pad staff-profile-form-card">
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:18, flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Custom notification</div>
                  <div style={{ fontSize:20, fontWeight:600, color:'var(--text)', marginTop:4 }}>Send staff alert</div>
                  <div style={{ fontSize:13, color:'var(--sub)', marginTop:6, lineHeight:1.6, maxWidth:520 }}>
                    This sends through the user’s saved notification preferences. Urgent alerts still go to both the portal and work email.
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  {notificationSaved ? <span style={{ fontSize:13, color:'var(--green)' }}>✓ Sent</span> : null}
                  <button className="btn btn-primary" disabled={sendingNotification} onClick={sendCustomNotification}>
                    {sendingNotification ? 'Sending...' : 'Send notification'}
                  </button>
                </div>
              </div>

              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
                {[
                  ['Info update', { title: 'Portal update', type: 'info', link: '/notifications' }],
                  ['Action needed', { title: 'Action required', type: 'warning', link: '/notifications' }],
                  ['Schedule note', { title: 'Schedule update', type: 'success', link: '/schedule' }],
                  ['Profile review', { title: 'Profile information request', type: 'info', link: '/my-profile' }],
                ].map(([label, preset]) => (
                  <button
                    key={label}
                    className="btn btn-outline btn-sm"
                    onClick={() => setCustomNotification((current) => ({
                      ...current,
                      ...preset,
                      message: current.message || '',
                    }))}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="fg">
                <div><label className="lbl">Notification title</label><input className="inp" value={customNotification.title} onChange={(e) => nf('title', e.target.value)} placeholder="What the staff member sees in the portal" /></div>
                <div>
                  <label className="lbl">Notification type</label>
                  <select className="inp" value={customNotification.type} onChange={(e) => nf('type', e.target.value)}>
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warning">Warning</option>
                  </select>
                </div>
                <div>
                  <label className="lbl">Delivery category</label>
                  <select className="inp" value={customNotification.category} onChange={(e) => nf('category', e.target.value)}>
                    {NOTIFICATION_CATEGORY_OPTIONS.filter(([category]) => category !== 'urgent').map(([category, label]) => (
                      <option key={category} value={category}>{label}</option>
                    ))}
                  </select>
                </div>
                <div><label className="lbl">Portal link</label><input className="inp" value={customNotification.link} onChange={(e) => nf('link', e.target.value)} placeholder="/notifications" /></div>
                <div><label className="lbl">Email subject</label><input className="inp" value={customNotification.emailSubject} onChange={(e) => nf('emailSubject', e.target.value)} placeholder="Defaults to the notification title" /></div>
                <div>
                  <label className="lbl">Pinned banner page</label>
                  <select className="inp" value={customNotification.bannerTargetPage} onChange={(e) => nf('bannerTargetPage', e.target.value)} disabled={!customNotification.pinAsBanner}>
                    <option value="all">Everywhere</option>
                    <option value="dashboard">Dashboard</option>
                    <option value="notifications">Notifications</option>
                    <option value="my-profile">My Profile</option>
                  </select>
                </div>
                <div>
                  <label className="lbl">Banner expiry</label>
                  <input className="inp" type="date" value={customNotification.bannerExpiresAt} onChange={(e) => nf('bannerExpiresAt', e.target.value)} disabled={!customNotification.pinAsBanner} />
                </div>
                <div className="fc">
                  <label className="lbl">Message</label>
                  <textarea className="inp" rows={7} value={customNotification.message} onChange={(e) => nf('message', e.target.value)} style={{ resize:'vertical' }} placeholder="Write the message the staff member should receive." />
                </div>
              </div>

              <div style={{ display:'flex', gap:18, flexWrap:'wrap', marginTop:16 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                  <input type="checkbox" checked={customNotification.important} onChange={(e) => nf('important', e.target.checked)} style={{ accentColor:'var(--red)', width:16, height:16 }} />
                  Mark as important
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                  <input type="checkbox" checked={customNotification.pinAsBanner} onChange={(e) => nf('pinAsBanner', e.target.checked)} style={{ accentColor:'var(--accent)', width:16, height:16 }} />
                  Pin as banner
                </label>
              </div>
            </div>

            <div className="staff-profile-admin-column" style={{ display:'grid', gap:14 }}>
              <div className="card card-pad staff-profile-admin-card">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>Delivery summary</div>
                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginBottom:10 }}>Where this goes</div>
                <div style={{ display:'grid', gap:10 }}>
                  {[
                    ['Notification bell', 'Shown when this category includes portal delivery.'],
                    ['Notifications page', 'Stored in the inbox when portal delivery is enabled.'],
                    ['Staff email', `Sent to ${email} when this category allows email delivery.`],
                  ].map(([title, text]) => (
                    <div key={title} style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{title}</div>
                      <div style={{ fontSize:12, color:'var(--sub)', marginTop:4, lineHeight:1.5 }}>{text}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card card-pad staff-profile-admin-card">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>Preview</div>
                <div style={{ padding:'14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:8 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{customNotification.title || 'Notification title'}</div>
                    <span className={`badge badge-${customNotification.important ? 'red' : customNotification.type === 'warning' ? 'amber' : customNotification.type === 'success' ? 'green' : 'blue'}`}>
                      {customNotification.important ? 'urgent' : customNotification.type}
                    </span>
                  </div>
                  <div style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>
                    {customNotification.message || 'Your message preview will appear here.'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', marginTop:10 }}>
                    Link: {customNotification.link || '/notifications'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', marginTop:6 }}>
                    Category: {NOTIFICATION_CATEGORY_OPTIONS.find(([category]) => category === customNotification.category)?.[1] || 'General updates'}
                  </div>
                  {customNotification.pinAsBanner ? (
                    <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', marginTop:6 }}>
                      Pinned banner on: {customNotification.bannerTargetPage || 'all'}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="card card-pad staff-profile-admin-card">
                <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>History</div>
                    <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginTop:4 }}>Recent notifications</div>
                  </div>
                  <span style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{notificationHistory.length} shown</span>
                </div>
                {notificationHistory.length ? (
                  <div style={{ display:'grid', gap:10 }}>
                    {notificationHistory.map((item, index) => (
                      <div key={`${item.created_at || 'notification'}-${index}`} style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:6 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{item.title || 'Notification'}</div>
                          <span className={`badge badge-${item.type === 'warning' ? 'amber' : item.type === 'success' ? 'green' : 'blue'}`}>{item.type || 'info'}</span>
                        </div>
                        <div style={{ fontSize:12, color:'var(--sub)', lineHeight:1.55, whiteSpace:'pre-wrap' }}>{item.message || '—'}</div>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginTop:8, flexWrap:'wrap' }}>
                          <span style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>
                            {item.created_at ? new Date(item.created_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : 'Unknown time'}
                          </span>
                          <span style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>
                            {item.link || '/notifications'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding:'16px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, fontSize:12.5, color:'var(--sub)', lineHeight:1.6 }}>
                    No recent notifications have been sent to this staff member yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'contracts' && (
          <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.1fr) minmax(320px,0.9fr)', gap:18 }} className="staff-profile-main-grid">
            <div className="card card-pad">
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:18, flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Issue contract</div>
                  <div style={{ fontSize:20, fontWeight:600, color:'var(--text)', marginTop:4 }}>Manager-signed contract pack</div>
                  <div style={{ fontSize:13, color:'var(--sub)', marginTop:6, lineHeight:1.6, maxWidth:560 }}>
                    Choose a contract template, apply the staff merge fields, and sign as the issuing manager. The staff member will then sign it in onboarding and receive a final PDF copy by email.
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => navigate('/contract-templates')}>Manage templates</button>
                  <button className="btn btn-primary btn-sm" onClick={issueContractToStaff} disabled={contractSaving || !activeContractTemplate}>
                    {contractSaving ? 'Issuing...' : 'Issue contract'}
                  </button>
                </div>
              </div>

              <div className="fg" style={{ marginBottom:18 }}>
                <div>
                  <label className="lbl">Template</label>
                  <select className="inp" value={contractForm.templateId} onChange={(e) => setContractForm((current) => ({ ...current, templateId: e.target.value }))}>
                    <option value="">Choose template</option>
                    {contractTemplates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="lbl">Signer name</label>
                  <input className="inp" value={contractForm.managerSignatureName} onChange={(e) => setContractForm((current) => ({ ...current, managerSignatureName: e.target.value }))} />
                </div>
                <div>
                  <label className="lbl">Signer title</label>
                  <input className="inp" value={contractForm.managerSignatureTitle} onChange={(e) => setContractForm((current) => ({ ...current, managerSignatureTitle: e.target.value }))} />
                </div>
                <div className="fc">
                  <label className="lbl">Issue notes</label>
                  <textarea className="inp" rows={4} value={contractForm.notes} onChange={(e) => setContractForm((current) => ({ ...current, notes: e.target.value }))} style={{ resize:'vertical' }} placeholder="Optional context for the staff member or HR audit trail." />
                </div>
              </div>

              <div style={{ padding:'14px 16px', border:'1px solid var(--border)', borderRadius:14, background:'var(--bg2)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Preview</div>
                    <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginTop:4 }}>{activeContractTemplate?.name || 'Choose a template'}</div>
                  </div>
                  {activeContractTemplate?.reference_file_url ? <a className="btn btn-outline btn-sm" href={activeContractTemplate.reference_file_url} target="_blank" rel="noreferrer">Open reference file</a> : null}
                </div>
                {activeContractTemplate ? (
                  <>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
                      <span className="badge badge-blue">{activeContractTemplate.contract_type}</span>
                      {CONTRACT_PLACEHOLDERS.map(([key]) => <span key={key} className="badge badge-grey">{`{{${key}}}`}</span>)}
                    </div>
                    <div style={{ padding:'18px 20px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12 }}>
                      <div style={{ fontSize:12.5, color:'var(--sub)', marginBottom:10 }}>Live merged contract body</div>
                      <div style={{ color:'var(--text)', lineHeight:1.8, fontSize:14 }} dangerouslySetInnerHTML={{ __html: renderedContractPreview }} />
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize:13, color:'var(--sub)' }}>Choose a contract template to preview the merged document.</div>
                )}
              </div>

              {contractError ? <div style={{ marginTop:12, fontSize:13, color:'var(--red)' }}>{contractError}</div> : null}
              {contractSuccess ? <div style={{ marginTop:12, fontSize:13, color:'var(--green)' }}>{contractSuccess}</div> : null}
            </div>

            <div className="staff-profile-admin-column" style={{ display:'grid', gap:14 }}>
              <div className="card card-pad staff-profile-admin-card">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>Status</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:10 }}>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Awaiting staff</div>
                    <div style={{ fontSize:22, fontWeight:600, color:'var(--text)' }}>{pendingSignatureContracts.length}</div>
                  </div>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Completed</div>
                    <div style={{ fontSize:22, fontWeight:600, color:'var(--text)' }}>{completedContracts.length}</div>
                  </div>
                </div>
              </div>

              <div className="card card-pad staff-profile-admin-card">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>Contract history</div>
                {contracts.length ? (
                  <div style={{ display:'grid', gap:10 }}>
                    {contracts.map((contract) => {
                      const [statusLabel, statusTone] = getContractStatusLabel(contract.status)
                      return (
                        <div key={contract.id} style={{ padding:'14px 16px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
                            <div>
                              <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{contract.template_name || contract.contract_type || 'Contract'}</div>
                              <div style={{ fontSize:12, color:'var(--sub)', marginTop:4 }}>{contract.staff_name || profile.full_name || email}</div>
                            </div>
                            <span className={`badge badge-${statusTone}`}>{statusLabel}</span>
                          </div>
                          <div style={{ display:'grid', gap:6, marginTop:10, fontSize:12.5, color:'var(--sub)' }}>
                            <div>Issued {contract.issued_at ? new Date(contract.issued_at).toLocaleString('en-GB') : 'Not issued yet'}</div>
                            <div>Manager sign-off: {contract.manager_signature?.name || 'Pending'}</div>
                            <div>Staff sign-off: {contract.staff_signature?.name || 'Pending'}</div>
                          </div>
                          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:12 }}>
                            {contract.final_document_url ? <a className="btn btn-outline btn-sm" href={contract.final_document_url} target="_blank" rel="noreferrer">Open signed PDF</a> : null}
                            {contract.template_reference_file_url ? <a className="btn btn-outline btn-sm" href={contract.template_reference_file_url} target="_blank" rel="noreferrer">Open template attachment</a> : null}
                            {contract.status === 'awaiting_staff_signature' ? (
                              <button className="btn btn-outline btn-sm" onClick={() => resendContractReminder(contract)} disabled={contractSaving}>Resend reminder</button>
                            ) : null}
                            {contract.status !== 'voided' ? (
                              <button className="btn btn-outline btn-sm" onClick={() => replaceContract(contract)} disabled={contractSaving}>Replace</button>
                            ) : null}
                            {contract.status !== 'completed' && contract.status !== 'voided' ? (
                              <button className="btn btn-outline btn-sm" onClick={() => voidContract(contract)} disabled={contractSaving}>Void</button>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.6 }}>
                    No contracts have been issued for this staff member yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'docs' && (
          <div className="card" style={{ overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontWeight:500, fontSize:13 }}>{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', justifyContent:'flex-end' }}>
                <input
                  type="file"
                  ref={fileRef}
                  style={{ display:'none' }}
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={e => {
                    const file = e.target.files?.[0] || null
                    setSelectedDoc(file)
                    setDocUploadError('')
                    setDocUploadSuccess('')
                  }}
                />
                <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {selectedDoc ? 'Change File' : 'Choose File'}
                </button>
                <button className="btn btn-primary btn-sm" onClick={uploadDoc} disabled={uploading || !selectedDoc}>
                  {uploading ? 'Uploading...' : '+ Upload Document'}
                </button>
              </div>
            </div>
            <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--border)', display:'grid', gap:6 }}>
              <div style={{ fontSize:12, color:selectedDoc ? 'var(--text)' : 'var(--sub)' }}>
                {selectedDoc ? `Selected: ${selectedDoc.name}` : 'No file selected yet.'}
              </div>
              {docUploadError ? <div style={{ fontSize:12, color:'var(--red)' }}>{docUploadError}</div> : null}
              {docUploadSuccess ? <div style={{ fontSize:12, color:'var(--green)' }}>{docUploadSuccess}</div> : null}
            </div>
            <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
              <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Contract</div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span className={`badge badge-${contractStatus.tone}`}>{contractStatus.label}</span>
                  <span style={{ fontSize:12, color:'var(--sub)' }}>{contractStatus.hint}</span>
                </div>
              </div>
              <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Right to work</div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span className={`badge badge-${rtwStatus.tone}`}>{rtwStatus.label}</span>
                  <span style={{ fontSize:12, color:'var(--sub)' }}>{rtwStatus.hint}</span>
                </div>
                <div style={{ display:'grid', gap:8, marginTop:10 }}>
                  <input
                    className="inp"
                    type="date"
                    value={complianceRecord.rtw_expiry || ''}
                    onChange={(e) => setComplianceRecord((current) => ({ ...current, rtw_expiry: e.target.value }))}
                    disabled={complianceSaving}
                  />
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {rtwRecord.document ? (
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={complianceSaving}
                        onClick={() => saveComplianceRecord({
                          ...complianceRecord,
                          rtw_override: false,
                          rtw_document_url: rtwRecord.document.file_url || '',
                          rtw_verified_at: new Date().toISOString(),
                          rtw_verified_by: user?.name || user?.email || 'Admin',
                          rtw_status_note: `Using uploaded evidence: ${rtwRecord.document.name || 'Right to Work file'}`,
                        }, 'Right-to-work file linked as the active compliance record.')}
                      >
                        Use latest RTW file
                      </button>
                    ) : null}
                    <button
                      className="btn btn-outline btn-sm"
                      disabled={complianceSaving}
                      onClick={() => saveComplianceRecord({
                        ...complianceRecord,
                        rtw_override: true,
                        rtw_document_url: complianceRecord.rtw_document_url || rtwRecord.documentUrl || '',
                        rtw_verified_at: new Date().toISOString(),
                        rtw_verified_by: user?.name || user?.email || 'Admin',
                        rtw_status_note: 'Manually marked compliant by admin.',
                      }, 'Right-to-work marked compliant.')}
                    >
                      Mark compliant
                    </button>
                    {(complianceRecord.rtw_override || complianceRecord.rtw_document_url || complianceRecord.rtw_expiry) ? (
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={complianceSaving}
                        onClick={() => saveComplianceRecord({}, 'Right-to-work override cleared.')}
                      >
                        Clear override
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Document health</div>
                <div style={{ fontSize:13, color:'var(--text)', fontWeight:600 }}>{docs.length} file{docs.length === 1 ? '' : 's'} on record</div>
                <div style={{ fontSize:12, color:'var(--sub)', marginTop:4 }}>
                  {docs[0]?.created_at ? `Latest upload ${new Date(docs[0].created_at).toLocaleDateString('en-GB')}` : 'No uploaded staff files yet.'}
                </div>
              </div>
            </div>
            {docs.length === 0 ? (
              <div className="empty"><p>No documents uploaded yet.</p></div>
            ) : (
              <div style={{ display:'grid', gap:12, padding:12 }}>
                {docs.map((d) => (
                  <div key={d.id} className="card" style={{ padding:16, display:'grid', gap:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'flex-start', flexWrap:'wrap' }}>
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ fontSize:15, fontWeight:600, color:'var(--text)', marginBottom:4 }}>{d.name}</div>
                        <div style={{ fontSize:13, color:'var(--sub)' }}>
                          {d.type || 'Document'} for {profile.full_name || email}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                        <span className="badge badge-blue">{fileTypeLabel(d.name)}</span>
                        <span className="badge badge-grey">{d.type || 'Document'}</span>
                        <span className="badge badge-green">Stored</span>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
                      <div style={{ padding:'10px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                        <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Uploaded by</div>
                        <div style={{ fontSize:13, color:'var(--text)', fontWeight:600 }}>{d.uploaded_by || 'Unknown'}</div>
                      </div>
                      <div style={{ padding:'10px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                        <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Date</div>
                        <div style={{ fontSize:13, color:'var(--text)', fontWeight:600 }}>{new Date(d.created_at).toLocaleDateString('en-GB')}</div>
                      </div>
                      <div style={{ padding:'10px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                        <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>File path</div>
                        <div style={{ fontSize:11, color:'var(--sub)', fontFamily:'var(--font-mono)', overflow:'hidden', textOverflow:'ellipsis' }}>{d.file_path || 'Stored in HR documents'}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap', paddingTop:10, borderTop:'1px solid var(--border)' }}>
                      <div style={{ fontSize:12, color:'var(--sub)' }}>Open to preview or download, or remove if this file should no longer sit on the staff record.</div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        <a href={d.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Open document</a>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteDoc(d)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ borderTop:'1px solid var(--border)', padding:'14px 20px' }}>
              <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Timeline</div>
              <ProfileTimeline
                title="Timeline"
                items={documentTimeline}
                emptyMessage="No document timeline entries yet for this staff member."
                limit={10}
              />
            </div>
          </div>
        )}

        {tab === 'commissions' && (
          <div className="card" style={{ overflow:'hidden' }}>
            {commissions.length === 0 ? (
              <div className="empty"><p>No commissions recorded for this staff member</p></div>
            ) : (
              <>
                <div className="tbl-wrap hide-mob">
                  <table className="tbl">
                    <thead><tr><th>Client</th><th>Sale Value</th><th>Commission</th><th>Date</th><th>Status</th></tr></thead>
                    <tbody>
                      {commissions.map(c => (
                        <tr key={c.id}>
                          <td className="t-main">{c.client}</td>
                          <td>£{Number(c.sale_value||0).toLocaleString()}</td>
                          <td>£{Number(c.commission_amount||0).toLocaleString()}</td>
                          <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{c.date}</td>
                          <td><span className={'badge badge-'+(c.status==='paid'?'green':'amber')}>{c.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mobile-only" style={{ display:'none' }}>
                  <div style={{ display:'grid', gap:10, padding:12 }}>
                    {commissions.map((c) => (
                      <div key={c.id} className="card" style={{ padding:14, display:'grid', gap:8 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
                          <div style={{ fontSize:14, fontWeight:600 }}>{c.client}</div>
                          <span className={'badge badge-'+(c.status==='paid'?'green':'amber')}>{c.status}</span>
                        </div>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                          <span className="badge badge-grey">Sale £{Number(c.sale_value||0).toLocaleString()}</span>
                          <span className="badge badge-blue">Commission £{Number(c.commission_amount||0).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{c.date}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
