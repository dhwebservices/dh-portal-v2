import { supabase } from './supabase'

// Page key to route mapping
export const PAGE_ROUTES = {
  dashboard:    '/dashboard',
  outreach:     '/outreach',
  clients:      '/clients',
  clientmgmt:   '/client-mgmt',
  support:      '/support',
  staff:        '/staff',
  reports:      '/reports',
  banners:      '/banners',
  audit:        '/audit',
  admin:        '/admin',
  settings:     '/settings',
}

// Default permissions by Azure role
export const ROLE_DEFAULTS = {
  Administrator: { dashboard: true, outreach: true, clients: true, clientmgmt: true, support: true, staff: true, reports: true, banners: true, audit: true, admin: true, settings: true },
  Staff:         { dashboard: true, outreach: true, clients: true, clientmgmt: true, support: true, staff: false, reports: false, banners: false, audit: false, admin: false, settings: false },
  ReadOnly:      { dashboard: true, outreach: true, clients: true, clientmgmt: false, support: false, staff: false, reports: false, banners: false, audit: false, admin: false, settings: false },
}

let cachedPerms = null
let cacheEmail  = null

export async function getUserPermissions(userEmail, userRoles) {
  // Admins always have full access
  if (userRoles?.includes('Administrator')) return ROLE_DEFAULTS.Administrator

  // Cache per session
  if (cachedPerms && cacheEmail === userEmail) return cachedPerms

  try {
    const { data } = await supabase
      .from('user_permissions')
      .select('permissions')
      .eq('user_email', userEmail)
      .single()

    if (data?.permissions) {
      cachedPerms = data.permissions
      cacheEmail  = userEmail
      return data.permissions
    }
  } catch {}

  // Fall back to role defaults
  const defaultRole = userRoles?.includes('Staff') ? 'Staff' : 'ReadOnly'
  return ROLE_DEFAULTS[defaultRole]
}

export function clearPermissionsCache() {
  cachedPerms = null
  cacheEmail  = null
}
