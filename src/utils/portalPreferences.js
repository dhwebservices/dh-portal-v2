export const DASHBOARD_SECTIONS = [
  ['stats', 'Overview stats'],
  ['manager_board', 'Manager operations board'],
  ['followups', 'My follow-ups today'],
  ['today', 'Today at a glance'],
  ['insight', 'Operations insight'],
  ['priority', 'Priority queue'],
  ['notifications', 'Unread notifications'],
  ['schedule', 'Today’s team schedule'],
  ['appointments', 'Upcoming appointments'],
  ['activity', 'Recent activity'],
]

export const DEFAULT_LANDING_OPTIONS = [
  ['dashboard', 'Dashboard'],
  ['mytasks', 'My Tasks'],
  ['notifications', 'Notifications'],
  ['schedule', 'Schedule'],
  ['appointments', 'Appointments'],
  ['clients', 'Clients'],
]

export const QUICK_ACTION_OPTIONS = [
  ['dashboard', 'Dashboard', '/dashboard'],
  ['mytasks', 'My Tasks', '/my-tasks'],
  ['notifications', 'Notifications', '/notifications'],
  ['schedule', 'Schedule', '/schedule'],
  ['appointments', 'Appointments', '/appointments'],
  ['clients', 'Clients', '/clients'],
  ['support', 'Support', '/support'],
  ['reports', 'Reports', '/reports'],
]

export const NOTIFICATION_CATEGORY_OPTIONS = [
  ['general', 'General updates'],
  ['urgent', 'Urgent / admin'],
  ['hr', 'HR updates'],
  ['tasks', 'Tasks'],
  ['schedule', 'Schedule'],
  ['appointments', 'Appointments'],
]

export const NOTIFICATION_DELIVERY_OPTIONS = [
  ['portal', 'Portal only'],
  ['email', 'Email only'],
  ['both', 'Portal + email'],
]

export const DASHBOARD_DENSITY_OPTIONS = [
  ['comfortable', 'Comfortable'],
  ['compact', 'Compact'],
]

export const DASHBOARD_HEADER_OPTIONS = [
  ['full', 'Full header'],
  ['minimal', 'Minimal header'],
]

export const TEXT_SCALE_OPTIONS = [
  ['standard', 'Standard'],
  ['large', 'Large text'],
]

export const MOTION_OPTIONS = [
  ['full', 'Standard motion'],
  ['reduced', 'Reduced motion'],
]

export const NAV_DENSITY_OPTIONS = [
  ['comfortable', 'Comfortable nav'],
  ['compact', 'Compact nav'],
]

export const CONTRAST_OPTIONS = [
  ['normal', 'Standard contrast'],
  ['high', 'High contrast'],
]

export const WORKSPACE_PRESET_OPTIONS = [
  ['custom', 'Custom workspace'],
  ['outreach', 'Outreach'],
  ['manager', 'Manager'],
  ['hr_admin', 'HR / Admin'],
]

export const ACCENT_SCHEMES = {
  blue: {
    label: 'DH Blue',
    accent: '#0071E3',
    hover: '#0077ED',
    soft: 'rgba(0,113,227,0.08)',
    border: 'rgba(0,113,227,0.2)',
  },
  forest: {
    label: 'Forest',
    accent: '#167C5B',
    hover: '#1B8A65',
    soft: 'rgba(22,124,91,0.10)',
    border: 'rgba(22,124,91,0.22)',
  },
  gold: {
    label: 'Gold',
    accent: '#B7770D',
    hover: '#C58618',
    soft: 'rgba(183,119,13,0.10)',
    border: 'rgba(183,119,13,0.22)',
  },
  slate: {
    label: 'Slate',
    accent: '#44576D',
    hover: '#50657D',
    soft: 'rgba(68,87,109,0.10)',
    border: 'rgba(68,87,109,0.22)',
  },
  rose: {
    label: 'Rose',
    accent: '#C0487B',
    hover: '#CB5888',
    soft: 'rgba(192,72,123,0.10)',
    border: 'rgba(192,72,123,0.22)',
  },
}

export const DEFAULT_PORTAL_PREFERENCES = {
  workspacePreset: 'custom',
  themeMode: 'light',
  accentScheme: 'blue',
  dashboardDensity: 'comfortable',
  dashboardHeader: 'full',
  showSystemBanners: true,
  textScale: 'standard',
  motionMode: 'full',
  navDensity: 'comfortable',
  contrastMode: 'normal',
  defaultLanding: 'dashboard',
  quickActions: ['mytasks', 'notifications', 'schedule', 'clients'],
  dashboardOrder: DASHBOARD_SECTIONS.map(([key]) => key),
  dashboardSections: Object.fromEntries(DASHBOARD_SECTIONS.map(([key]) => [key, true])),
  notificationPreferences: Object.fromEntries(
    NOTIFICATION_CATEGORY_OPTIONS.map(([key]) => [key, 'both'])
  ),
}

function hexToRgb(hex = '#0071E3') {
  const safe = String(hex).replace('#', '')
  const expanded = safe.length === 3
    ? safe.split('').map((part) => `${part}${part}`).join('')
    : safe
  const int = Number.parseInt(expanded, 16)
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  }
}

const PRESET_SECTION_STATE = {
  outreach: {
    stats: true,
    manager_board: false,
    followups: true,
    today: true,
    insight: true,
    priority: true,
    notifications: true,
    schedule: false,
    appointments: true,
    activity: false,
  },
  manager: {
    stats: true,
    manager_board: true,
    followups: true,
    today: true,
    insight: true,
    priority: true,
    notifications: true,
    schedule: true,
    appointments: true,
    activity: true,
  },
  hr_admin: {
    stats: true,
    manager_board: true,
    followups: false,
    today: true,
    insight: true,
    priority: true,
    notifications: true,
    schedule: true,
    appointments: false,
    activity: true,
  },
}

const PRESET_PAYLOADS = {
  outreach: {
    workspacePreset: 'outreach',
    defaultLanding: 'dashboard',
    dashboardDensity: 'compact',
    dashboardHeader: 'minimal',
    showSystemBanners: true,
    navDensity: 'compact',
    quickActions: ['mytasks', 'notifications', 'clients', 'support', 'schedule', 'appointments'],
    dashboardOrder: ['stats', 'followups', 'priority', 'notifications', 'appointments', 'today', 'insight', 'schedule', 'activity', 'manager_board'],
    dashboardSections: PRESET_SECTION_STATE.outreach,
  },
  manager: {
    workspacePreset: 'manager',
    defaultLanding: 'dashboard',
    dashboardDensity: 'comfortable',
    dashboardHeader: 'full',
    showSystemBanners: true,
    navDensity: 'comfortable',
    quickActions: ['dashboard', 'mytasks', 'notifications', 'schedule', 'appointments', 'clients'],
    dashboardOrder: ['stats', 'manager_board', 'followups', 'today', 'priority', 'schedule', 'appointments', 'notifications', 'insight', 'activity'],
    dashboardSections: PRESET_SECTION_STATE.manager,
  },
  hr_admin: {
    workspacePreset: 'hr_admin',
    defaultLanding: 'dashboard',
    dashboardDensity: 'comfortable',
    dashboardHeader: 'full',
    showSystemBanners: true,
    navDensity: 'comfortable',
    quickActions: ['dashboard', 'notifications', 'mytasks', 'schedule', 'reports', 'clients'],
    dashboardOrder: ['stats', 'manager_board', 'today', 'priority', 'activity', 'notifications', 'insight', 'schedule', 'appointments'],
    dashboardSections: PRESET_SECTION_STATE.hr_admin,
  },
}

export function buildPreferenceSettingKey(email = '') {
  return `user_pref:${String(email || '').toLowerCase().trim()}`
}

export function sanitizePortalPreferences(raw = {}) {
  const workspacePreset = WORKSPACE_PRESET_OPTIONS.some(([key]) => key === raw?.workspacePreset)
    ? raw.workspacePreset
    : DEFAULT_PORTAL_PREFERENCES.workspacePreset
  const themeMode = raw?.themeMode === 'dark' ? 'dark' : 'light'
  const accentScheme = ACCENT_SCHEMES[raw?.accentScheme] ? raw.accentScheme : DEFAULT_PORTAL_PREFERENCES.accentScheme
  const dashboardDensity = DASHBOARD_DENSITY_OPTIONS.some(([key]) => key === raw?.dashboardDensity)
    ? raw.dashboardDensity
    : DEFAULT_PORTAL_PREFERENCES.dashboardDensity
  const dashboardHeader = DASHBOARD_HEADER_OPTIONS.some(([key]) => key === raw?.dashboardHeader)
    ? raw.dashboardHeader
    : DEFAULT_PORTAL_PREFERENCES.dashboardHeader
  const showSystemBanners = raw?.showSystemBanners !== false
  const textScale = TEXT_SCALE_OPTIONS.some(([key]) => key === raw?.textScale)
    ? raw.textScale
    : DEFAULT_PORTAL_PREFERENCES.textScale
  const motionMode = MOTION_OPTIONS.some(([key]) => key === raw?.motionMode)
    ? raw.motionMode
    : DEFAULT_PORTAL_PREFERENCES.motionMode
  const navDensity = NAV_DENSITY_OPTIONS.some(([key]) => key === raw?.navDensity)
    ? raw.navDensity
    : DEFAULT_PORTAL_PREFERENCES.navDensity
  const contrastMode = CONTRAST_OPTIONS.some(([key]) => key === raw?.contrastMode)
    ? raw.contrastMode
    : DEFAULT_PORTAL_PREFERENCES.contrastMode
  const defaultLanding = DEFAULT_LANDING_OPTIONS.some(([key]) => key === raw?.defaultLanding)
    ? raw.defaultLanding
    : DEFAULT_PORTAL_PREFERENCES.defaultLanding
  const allowedActions = new Set(QUICK_ACTION_OPTIONS.map(([key]) => key))
  const quickActions = Array.isArray(raw?.quickActions)
    ? raw.quickActions.filter((key, index, arr) => allowedActions.has(key) && arr.indexOf(key) === index).slice(0, 6)
    : DEFAULT_PORTAL_PREFERENCES.quickActions
  const requestedOrder = Array.isArray(raw?.dashboardOrder) ? raw.dashboardOrder : []
  const orderSet = new Set(requestedOrder)
  const dashboardOrder = [
    ...requestedOrder.filter((key) => DASHBOARD_SECTIONS.some(([sectionKey]) => sectionKey === key)),
    ...DASHBOARD_SECTIONS.map(([key]) => key).filter((key) => !orderSet.has(key)),
  ]
  const inputSections = raw?.dashboardSections && typeof raw.dashboardSections === 'object' ? raw.dashboardSections : {}
  const dashboardSections = Object.fromEntries(
    DASHBOARD_SECTIONS.map(([key]) => [key, inputSections[key] !== false])
  )
  const notificationPreferences = Object.fromEntries(
    NOTIFICATION_CATEGORY_OPTIONS.map(([key]) => {
      const requested = raw?.notificationPreferences?.[key]
      const safe = NOTIFICATION_DELIVERY_OPTIONS.some(([delivery]) => delivery === requested) ? requested : DEFAULT_PORTAL_PREFERENCES.notificationPreferences[key]
      return [key, safe]
    })
  )

  return {
    workspacePreset,
    themeMode,
    accentScheme,
    dashboardDensity,
    dashboardHeader,
    showSystemBanners,
    textScale,
    motionMode,
    navDensity,
    contrastMode,
    defaultLanding,
    quickActions: quickActions.length ? quickActions : DEFAULT_PORTAL_PREFERENCES.quickActions,
    dashboardOrder,
    dashboardSections,
    notificationPreferences,
  }
}

export function mergePortalPreferences(base = DEFAULT_PORTAL_PREFERENCES, patch = {}) {
  return sanitizePortalPreferences({
    ...base,
    ...patch,
    dashboardSections: {
      ...(base.dashboardSections || {}),
      ...(patch.dashboardSections || {}),
    },
    notificationPreferences: {
      ...(base.notificationPreferences || {}),
      ...(patch.notificationPreferences || {}),
    },
  })
}

export function applyWorkspacePreset(current = DEFAULT_PORTAL_PREFERENCES, presetKey = 'custom') {
  if (presetKey === 'custom' || !PRESET_PAYLOADS[presetKey]) {
    return mergePortalPreferences(current, { workspacePreset: 'custom' })
  }

  return mergePortalPreferences(current, PRESET_PAYLOADS[presetKey])
}

export function describeWorkspacePreset(preferences = DEFAULT_PORTAL_PREFERENCES) {
  const safe = sanitizePortalPreferences(preferences)
  return WORKSPACE_PRESET_OPTIONS.find(([key]) => key === safe.workspacePreset)?.[1] || 'Custom workspace'
}

export function applyPortalAppearance(preferences = DEFAULT_PORTAL_PREFERENCES) {
  if (typeof document === 'undefined') return
  const safe = sanitizePortalPreferences(preferences)
  const scheme = ACCENT_SCHEMES[safe.accentScheme] || ACCENT_SCHEMES.blue
  const { r, g, b } = hexToRgb(scheme.accent)
  const root = document.documentElement
  const isDark = safe.themeMode === 'dark'

  root.setAttribute('data-theme', safe.themeMode)
  root.setAttribute('data-text-scale', safe.textScale)
  root.setAttribute('data-motion-mode', safe.motionMode)
  root.setAttribute('data-nav-density', safe.navDensity)
  root.setAttribute('data-contrast-mode', safe.contrastMode)
  root.style.setProperty('--accent', scheme.accent)
  root.style.setProperty('--accent-hover', scheme.hover)
  root.style.setProperty('--accent-soft', scheme.soft)
  root.style.setProperty('--accent-border', scheme.border)
  root.style.setProperty('--blue', scheme.accent)
  root.style.setProperty('--blue-bg', scheme.soft)
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
  root.style.setProperty('--page-tint', isDark ? `rgba(${r}, ${g}, ${b}, 0.075)` : `rgba(${r}, ${g}, ${b}, 0.04)`)
  root.style.setProperty('--page-tint-strong', isDark ? `rgba(${r}, ${g}, ${b}, 0.14)` : `rgba(${r}, ${g}, ${b}, 0.09)`)
  root.style.setProperty('--panel-tint', isDark ? `rgba(${r}, ${g}, ${b}, 0.06)` : `rgba(${r}, ${g}, ${b}, 0.045)`)
  root.style.setProperty('--accent-contrast', '#FFFFFF')
  root.style.setProperty('--font-size-base', safe.textScale === 'large' ? '15.5px' : '14px')
  root.style.setProperty('--line-height-base', safe.textScale === 'large' ? '1.6' : '1.5')
  root.style.setProperty('--sw', safe.navDensity === 'compact' ? '50px' : '56px')
  root.style.setProperty('--sidebar-panel-w', safe.navDensity === 'compact' ? '272px' : '300px')

  try {
    localStorage.setItem('dh-theme', safe.themeMode)
    localStorage.setItem('dh-accent', safe.accentScheme)
  } catch {}
}

export function readStoredPortalPreferences() {
  if (typeof window === 'undefined') return { ...DEFAULT_PORTAL_PREFERENCES }
  let themeMode = DEFAULT_PORTAL_PREFERENCES.themeMode
  let accentScheme = DEFAULT_PORTAL_PREFERENCES.accentScheme
  try {
    themeMode = localStorage.getItem('dh-theme') === 'dark' ? 'dark' : 'light'
    accentScheme = localStorage.getItem('dh-accent') || DEFAULT_PORTAL_PREFERENCES.accentScheme
  } catch {}
  return sanitizePortalPreferences({ themeMode, accentScheme })
}
