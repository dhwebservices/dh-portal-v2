export const WORKSPACE_OPTIONS = [
  ['self_service', 'Self Service'],
  ['outreach', 'Outreach Workspace'],
  ['recruitment', 'Recruitment Workspace'],
  ['hr', 'HR Workspace'],
  ['client_ops', 'Client Ops Workspace'],
  ['manager', 'Department Manager Workspace'],
  ['director', 'Director Workspace'],
  ['admin', 'Admin Workspace'],
]

const WORKSPACE_SET = new Set(WORKSPACE_OPTIONS.map(([key]) => key))
const GLOBAL_WORKSPACES = new Set(['director', 'admin'])

const WORKSPACE_SECTION_ORDER = {
  self_service: ['home', 'tasks', 'account'],
  outreach: ['business', 'tasks', 'home', 'account'],
  recruitment: ['hiring', 'tasks', 'home', 'hr', 'account'],
  hr: ['hr', 'home', 'tasks', 'hiring', 'account'],
  client_ops: ['business', 'tasks', 'home', 'account'],
  manager: ['home', 'hiring', 'hr', 'tasks', 'business', 'account'],
  director: ['home', 'business', 'tasks', 'hr', 'hiring', 'admin', 'account'],
  admin: ['admin', 'home', 'business', 'tasks', 'hr', 'hiring', 'account'],
}

const WORKSPACE_SECTION_NOTES = {
  self_service: 'Personal tools, alerts, and day-to-day self service.',
  outreach: 'Lead movement, campaigns, and follow-up work.',
  recruitment: 'Roles, applicants, and hiring flow in one place.',
  hr: 'People operations, compliance, onboarding, and contracts.',
  client_ops: 'Client delivery, support, and account operations.',
  manager: 'Department oversight, team actions, and hiring controls.',
  director: 'Cross-business visibility, escalations, and approvals.',
  admin: 'Global controls, reports, safeguards, and oversight.',
}

const SHARED_ITEM_KEYS = new Set([
  'notifications',
  'my_profile',
  'search',
  'mytasks',
  'schedule',
  'appointments',
  'hr_leave',
  'hr_payslips',
  'settings',
])

const WORKSPACE_ITEM_KEYS = {
  self_service: ['dashboard'],
  outreach: ['outreach', 'sendemail', 'emailtemplates', 'mailinglist', 'proposals', 'support', 'knowledge_base'],
  recruitment: ['recruiting_jobs', 'recruiting_applications', 'recruiting_board', 'recruiting_settings'],
  hr: ['hr_profiles', 'hr_policies', 'hr_documents', 'hr_timesheet', 'hr_onboarding', 'contract_queue', 'contract_templates', 'staff', 'org_chart'],
  client_ops: ['clients', 'clientmgmt', 'support', 'knowledge_base', 'proposals', 'website_editor', 'domains', 'competitor'],
  manager: ['my_department', 'my_team', 'staff', 'org_chart', 'contract_queue', 'recruiting_jobs', 'recruiting_applications', 'recruiting_board', 'manager_board'],
  director: ['*'],
  admin: ['*'],
}

function containsText(haystack = '', needle = '') {
  return String(haystack || '').toLowerCase().includes(String(needle || '').toLowerCase())
}

export function buildStaffWorkspaceKey(email = '') {
  return `staff_workspace:${String(email || '').toLowerCase().trim()}`
}

export function normalizeWorkspace(value = '') {
  const safe = String(value || '').toLowerCase().trim().replace(/\s+/g, '_')
  return WORKSPACE_SET.has(safe) ? safe : ''
}

export function getWorkspaceLabel(workspace = '') {
  return WORKSPACE_OPTIONS.find(([key]) => key === normalizeWorkspace(workspace))?.[1] || 'Self Service'
}

export function getWorkspaceSectionOrder(workspace = '') {
  return WORKSPACE_SECTION_ORDER[normalizeWorkspace(workspace) || 'self_service'] || WORKSPACE_SECTION_ORDER.self_service
}

export function getWorkspaceSectionNote(workspace = '') {
  return WORKSPACE_SECTION_NOTES[normalizeWorkspace(workspace) || 'self_service'] || WORKSPACE_SECTION_NOTES.self_service
}

export function inferWorkspaceFromProfile({ explicitWorkspace = '', hrProfile = {}, org = {}, perms = {}, isAdmin = false, isDirector = false, isDepartmentManager = false } = {}) {
  const normalizedExplicit = normalizeWorkspace(explicitWorkspace || hrProfile?.primary_workspace)
  if (normalizedExplicit) return normalizedExplicit
  if (isDirector || org?.role_scope === 'director') return 'director'
  if (isAdmin || perms?.admin === true) return 'admin'
  if (isDepartmentManager || org?.role_scope === 'department_manager') return 'manager'

  const roleText = [
    hrProfile?.role,
    hrProfile?.job_title,
    hrProfile?.department,
    org?.department,
  ].filter(Boolean).join(' ').toLowerCase()

  if (
    perms?.recruiting_jobs === true ||
    perms?.recruiting_applications === true ||
    perms?.recruiting_board === true ||
    containsText(roleText, 'recruit') ||
    containsText(roleText, 'talent') ||
    containsText(roleText, 'hiring')
  ) {
    return 'recruitment'
  }

  if (
    perms?.hr_profiles === true ||
    perms?.hr_documents === true ||
    perms?.hr_onboarding === true ||
    perms?.contract_queue === true ||
    containsText(roleText, 'human resources') ||
    containsText(roleText, 'hr')
  ) {
    return 'hr'
  }

  if (
    perms?.clientmgmt === true ||
    perms?.clients === true ||
    perms?.support === true ||
    perms?.website_editor === true ||
    containsText(roleText, 'client') ||
    containsText(roleText, 'business services')
  ) {
    return 'client_ops'
  }

  if (
    perms?.outreach === true ||
    perms?.sendemail === true ||
    perms?.emailtemplates === true ||
    perms?.mailinglist === true ||
    containsText(roleText, 'outreach') ||
    containsText(roleText, 'sales') ||
    containsText(roleText, 'marketing')
  ) {
    return 'outreach'
  }

  return 'self_service'
}

export function workspaceAllowsItem(workspace = '', key = '') {
  const normalizedWorkspace = normalizeWorkspace(workspace) || 'self_service'
  if (!key) return false
  if (SHARED_ITEM_KEYS.has(key)) return true
  if (GLOBAL_WORKSPACES.has(normalizedWorkspace)) return true
  const allowedKeys = WORKSPACE_ITEM_KEYS[normalizedWorkspace] || []
  return allowedKeys.includes('*') || allowedKeys.includes(key)
}

export function workspaceAllowsSection(workspace = '', items = []) {
  return (Array.isArray(items) ? items : []).some((item) => workspaceAllowsItem(workspace, item?.key))
}

export function resolveWorkspaceHomeRoute({ workspace = '', preferences = {}, can = () => false } = {}) {
  const normalizedWorkspace = normalizeWorkspace(workspace) || 'self_service'
  const defaultLandingMap = {
    dashboard: { path: '/dashboard', key: 'dashboard' },
    mytasks: { path: '/my-tasks', key: 'mytasks' },
    notifications: { path: '/notifications', key: 'notifications' },
    my_department: { path: '/my-department', key: 'my_department' },
    schedule: { path: '/schedule', key: 'schedule' },
    appointments: { path: '/appointments', key: 'appointments' },
    clients: { path: '/clients', key: 'clients' },
  }

  const preferredDefault = defaultLandingMap[preferences?.defaultLanding] || defaultLandingMap.dashboard
  const candidates = {
    self_service: [preferredDefault, defaultLandingMap.notifications, { path: '/my-profile', key: 'my_profile' }],
    outreach: [{ path: '/outreach', key: 'outreach' }, defaultLandingMap.notifications, defaultLandingMap.mytasks],
    recruitment: [{ path: '/recruiting', key: 'recruiting_jobs' }, defaultLandingMap.notifications, defaultLandingMap.mytasks],
    hr: [{ path: '/hr/profiles', key: 'hr_profiles' }, { path: '/hr/onboarding', key: 'hr_onboarding' }, { path: '/my-staff', key: 'staff' }],
    client_ops: [{ path: '/client-mgmt', key: 'clientmgmt' }, { path: '/clients', key: 'clients' }, { path: '/support', key: 'support' }],
    manager: [{ path: '/my-department', key: 'my_department' }, { path: '/recruiting', key: 'recruiting_jobs' }, { path: '/my-staff', key: 'staff' }],
    director: [{ path: '/dashboard', key: 'dashboard' }, { path: '/reports', key: 'reports' }, { path: '/departments', key: 'departments' }],
    admin: [{ path: '/reports', key: 'reports' }, { path: '/dashboard', key: 'dashboard' }, { path: '/settings', key: 'settings' }],
  }[normalizedWorkspace] || [preferredDefault]

  const firstAllowed = candidates.find((candidate) => !candidate?.key || can(candidate.key))
  return firstAllowed?.path || '/dashboard'
}
