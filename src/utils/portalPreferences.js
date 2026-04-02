export const DASHBOARD_SECTIONS = [
  ['stats', 'Overview stats'],
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
  themeMode: 'light',
  accentScheme: 'blue',
  dashboardDensity: 'comfortable',
  dashboardHeader: 'full',
  showSystemBanners: true,
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

export function buildPreferenceSettingKey(email = '') {
  return `user_pref:${String(email || '').toLowerCase().trim()}`
}

export function sanitizePortalPreferences(raw = {}) {
  const themeMode = raw?.themeMode === 'dark' ? 'dark' : 'light'
  const accentScheme = ACCENT_SCHEMES[raw?.accentScheme] ? raw.accentScheme : DEFAULT_PORTAL_PREFERENCES.accentScheme
  const dashboardDensity = DASHBOARD_DENSITY_OPTIONS.some(([key]) => key === raw?.dashboardDensity)
    ? raw.dashboardDensity
    : DEFAULT_PORTAL_PREFERENCES.dashboardDensity
  const dashboardHeader = DASHBOARD_HEADER_OPTIONS.some(([key]) => key === raw?.dashboardHeader)
    ? raw.dashboardHeader
    : DEFAULT_PORTAL_PREFERENCES.dashboardHeader
  const showSystemBanners = raw?.showSystemBanners !== false
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
    themeMode,
    accentScheme,
    dashboardDensity,
    dashboardHeader,
    showSystemBanners,
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

export function applyPortalAppearance(preferences = DEFAULT_PORTAL_PREFERENCES) {
  if (typeof document === 'undefined') return
  const safe = sanitizePortalPreferences(preferences)
  const scheme = ACCENT_SCHEMES[safe.accentScheme] || ACCENT_SCHEMES.blue
  const { r, g, b } = hexToRgb(scheme.accent)
  const root = document.documentElement
  const isDark = safe.themeMode === 'dark'

  root.setAttribute('data-theme', safe.themeMode)
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
