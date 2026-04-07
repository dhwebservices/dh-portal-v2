import { createContext, useContext, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { supabase } from '../utils/supabase'
import {
  applyPortalAppearance,
  buildPreferenceSettingKey,
  DEFAULT_PORTAL_PREFERENCES,
  mergePortalPreferences,
  readStoredPortalPreferences,
} from '../utils/portalPreferences'
import {
  buildLifecycleSettingKey,
  DIRECTOR_EMAILS,
  mergeLifecycleRecord,
  TERMINATED_STATES,
} from '../utils/staffLifecycle'
import {
  buildDepartmentCatalogKey,
  buildStaffOrgKey,
  canViewStaffMember,
  getManagedDepartments,
  hydrateManagedDepartments,
  isDirectorEmail,
  mergeOrgRecord,
} from '../utils/orgStructure'

const Ctx = createContext(null)
const ACTIVE_HEARTBEAT_MS = 60 * 1000

const OWNER_EMAILS = DIRECTOR_EMAILS

const BASE_PERMISSIONS = {
  dashboard: true,
  notifications: true,
  my_profile: true,
  search: true,
  recruiting_dashboard: false,
  recruiting_jobs: false,
  recruiting_applications: false,
  recruiting_board: false,
  recruiting_settings: false,
  hr_profiles: false,
}

function sanitizePermissions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...BASE_PERMISSIONS }
  }

  return { ...BASE_PERMISSIONS, ...raw }
}

async function loadPortalIdentity(email = '', fallbackName = '') {
  const safeEmail = String(email || '').toLowerCase().trim()
  if (!safeEmail) throw new Error('No staff email supplied for preview.')

  const [
    permissionsResult,
    hrResult,
    preferenceResult,
    lifecycleResult,
    orgResult,
    departmentCatalogResult,
  ] = await Promise.all([
    supabase
      .from('user_permissions')
      .select('permissions, onboarding')
      .ilike('user_email', safeEmail)
      .maybeSingle(),
    supabase
      .from('hr_profiles')
      .select('department, manager_email, manager_name, full_name')
      .ilike('user_email', safeEmail)
      .maybeSingle(),
    supabase
      .from('portal_settings')
      .select('value')
      .eq('key', buildPreferenceSettingKey(safeEmail))
      .maybeSingle(),
    supabase
      .from('portal_settings')
      .select('value')
      .eq('key', buildLifecycleSettingKey(safeEmail))
      .maybeSingle(),
    supabase
      .from('portal_settings')
      .select('value')
      .eq('key', buildStaffOrgKey(safeEmail))
      .maybeSingle(),
    supabase
      .from('portal_settings')
      .select('value')
      .eq('key', buildDepartmentCatalogKey())
      .maybeSingle(),
  ])

  const hrProfile = hrResult?.data || {}
  const preferenceRaw = preferenceResult?.data?.value?.value ?? preferenceResult?.data?.value ?? {}
  const lifecycleRaw = lifecycleResult?.data?.value?.value ?? lifecycleResult?.data?.value ?? {}
  const orgRaw = orgResult?.data?.value?.value ?? orgResult?.data?.value ?? {}
  const departmentCatalogRaw = departmentCatalogResult?.data?.value?.value ?? departmentCatalogResult?.data?.value ?? []
  const nextOrg = hydrateManagedDepartments(mergeOrgRecord(orgRaw, {
    email: safeEmail,
    department: hrProfile?.department,
    isDirector: isDirectorEmail(safeEmail),
  }), departmentCatalogRaw, safeEmail)
  const permissionsData = permissionsResult?.data
  const safePerms = permissionsData ? sanitizePermissions(permissionsData.permissions) : { ...BASE_PERMISSIONS }

  return {
    user: {
      email: safeEmail,
      name: hrProfile?.full_name || fallbackName || safeEmail,
      initials: (hrProfile?.full_name || fallbackName || safeEmail).split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase(),
    },
    perms: OWNER_EMAILS.has(safeEmail) ? null : safePerms,
    isAdmin: OWNER_EMAILS.has(safeEmail) || permissionsData?.permissions?.admin === true || nextOrg.role_scope === 'director',
    isOnboarding: permissionsData?.onboarding === true,
    lifecycle: mergeLifecycleRecord(lifecycleRaw),
    org: {
      ...nextOrg,
      reports_to_email: nextOrg.reports_to_email || String(hrProfile?.manager_email || '').toLowerCase().trim(),
      reports_to_name: nextOrg.reports_to_name || hrProfile?.manager_name || '',
    },
    preferences: mergePortalPreferences(readStoredPortalPreferences(), preferenceRaw),
  }
}

export function AuthProvider({ children }) {
  const { accounts } = useMsal()
  const account = accounts[0]
  const normalizedEmail = account?.username?.toLowerCase?.() || null
  const [perms, setPerms]           = useState(null)
  const [isAdmin, setIsAdmin]       = useState(false)
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [maintenance, setMaintenance] = useState({ enabled: false, message: '', eta: '' })
  const [lifecycle, setLifecycle] = useState(mergeLifecycleRecord())
  const [org, setOrg] = useState(mergeOrgRecord())
  const [preferences, setPreferences] = useState(() => mergePortalPreferences(DEFAULT_PORTAL_PREFERENCES, readStoredPortalPreferences()))
  const [previewState, setPreviewState] = useState(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    if (!normalizedEmail) return

    const touchPresence = () => {
      const now = new Date().toISOString()
      supabase.from('hr_profiles').upsert({
        user_email: normalizedEmail,
        full_name: account?.name || normalizedEmail,
        last_seen: now,
        updated_at: now,
      }, { onConflict: 'user_email' }).then(() => {}).catch(() => {})
    }

    touchPresence()
    const interval = setInterval(touchPresence, ACTIVE_HEARTBEAT_MS)
    const handleFocus = () => touchPresence()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') touchPresence()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [normalizedEmail, account?.name])

  useEffect(() => {
    if (!normalizedEmail) {
      applyPortalAppearance(preferences)
      setLoading(false)
      return
    }
    const timeout = setTimeout(() => setLoading(false), 4000)
    const isOwner = OWNER_EMAILS.has(normalizedEmail)
    Promise.all([
      supabase
        .from('user_permissions')
        .select('permissions, onboarding')
        .ilike('user_email', normalizedEmail)
        .maybeSingle(),
      supabase
        .from('hr_profiles')
        .select('department, manager_email, manager_name, full_name')
        .ilike('user_email', normalizedEmail)
        .maybeSingle(),
      supabase
        .from('portal_settings')
        .select('value')
        .eq('key', 'portal_maintenance')
        .maybeSingle(),
      supabase
        .from('portal_settings')
        .select('value')
        .eq('key', buildPreferenceSettingKey(normalizedEmail))
        .maybeSingle(),
      supabase
        .from('portal_settings')
        .select('value')
        .eq('key', buildLifecycleSettingKey(normalizedEmail))
        .maybeSingle(),
      supabase
        .from('portal_settings')
        .select('value')
        .eq('key', buildStaffOrgKey(normalizedEmail))
        .maybeSingle(),
      supabase
        .from('portal_settings')
        .select('value')
        .eq('key', buildDepartmentCatalogKey())
        .maybeSingle(),
    ])
      .then(([permissionsResult, hrResult, maintenanceResult, preferenceResult, lifecycleResult, orgResult, departmentCatalogResult]) => {
        clearTimeout(timeout)
        const { data, error } = permissionsResult
        const hrProfile = hrResult?.data || {}
        if (!maintenanceResult?.error && maintenanceResult?.data) {
          const raw = maintenanceResult.data.value?.value ?? maintenanceResult.data.value ?? {}
          setMaintenance({
            enabled: raw?.enabled === true,
            message: raw?.message || '',
            eta: raw?.eta || '',
          })
        } else {
          setMaintenance({ enabled: false, message: '', eta: '' })
        }

        const preferenceRaw = preferenceResult?.data?.value?.value ?? preferenceResult?.data?.value ?? {}
        const nextPreferences = mergePortalPreferences(readStoredPortalPreferences(), preferenceRaw)
        setPreferences(nextPreferences)
        applyPortalAppearance(nextPreferences)
        const lifecycleRaw = lifecycleResult?.data?.value?.value ?? lifecycleResult?.data?.value ?? {}
        setLifecycle(mergeLifecycleRecord(lifecycleRaw))
        const orgRaw = orgResult?.data?.value?.value ?? orgResult?.data?.value ?? {}
        const departmentCatalogRaw = departmentCatalogResult?.data?.value?.value ?? departmentCatalogResult?.data?.value ?? []
        const nextOrg = hydrateManagedDepartments(mergeOrgRecord(orgRaw, {
          email: normalizedEmail,
          department: hrProfile?.department,
          isDirector: isDirectorEmail(normalizedEmail),
        }), departmentCatalogRaw, normalizedEmail)
        setOrg({
          ...nextOrg,
          reports_to_email: nextOrg.reports_to_email || String(hrProfile?.manager_email || '').toLowerCase().trim(),
          reports_to_name: nextOrg.reports_to_name || hrProfile?.manager_name || '',
        })

        if (!error && data) {
          const safePerms = sanitizePermissions(data.permissions)
          setPerms(isOwner ? null : safePerms)
          setIsAdmin(isOwner || data.permissions?.admin === true || nextOrg.role_scope === 'director')
          setIsOnboarding(data.onboarding === true)
        } else {
          setPerms(isOwner ? null : { ...BASE_PERMISSIONS })
          setIsAdmin(isOwner || nextOrg.role_scope === 'director')
          setIsOnboarding(false)
        }
        setLoading(false)
      })
      .catch(() => {
        clearTimeout(timeout)
        setPerms(isOwner ? null : { ...BASE_PERMISSIONS })
        setIsAdmin(isOwner)
        setIsOnboarding(false)
        setMaintenance({ enabled: false, message: '', eta: '' })
        setLifecycle(mergeLifecycleRecord())
        setOrg(hydrateManagedDepartments(mergeOrgRecord({}, {
          email: normalizedEmail,
          isDirector: isDirectorEmail(normalizedEmail),
        }), [], normalizedEmail))
        const nextPreferences = mergePortalPreferences(DEFAULT_PORTAL_PREFERENCES, readStoredPortalPreferences())
        setPreferences(nextPreferences)
        applyPortalAppearance(nextPreferences)
        setLoading(false)
      })

    // Log login - fire and forget, never block the app
    const now = new Date().toISOString()
    // audit_log insert - ignore errors
    supabase.from('audit_log').insert([{
      user_email: normalizedEmail,
      user_name:  account.name || normalizedEmail,
      action:     'user_login',
      entity:     'session',
      entity_id:  null,
      details:    {},
      created_at: now,
    }]).then(() => {}).catch(() => {})
    return () => clearTimeout(timeout)
  }, [normalizedEmail, account?.name])

  const realUser = account ? {
    email:    normalizedEmail,
    name:     account.name || normalizedEmail,
    initials: (account.name || normalizedEmail).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
  } : null

  const effectiveUser = previewState?.user || realUser
  const effectivePerms = previewState?.perms ?? perms
  const effectiveIsAdmin = previewState?.isAdmin ?? isAdmin
  const effectiveIsOnboarding = previewState?.isOnboarding ?? isOnboarding
  const effectiveLifecycle = previewState?.lifecycle || lifecycle
  const effectiveOrg = previewState?.org || org
  const effectivePreferences = previewState?.preferences || preferences

  const managedDepartments = getManagedDepartments(effectiveOrg)
  const isDirector = isDirectorEmail(effectiveUser?.email) || effectiveOrg?.role_scope === 'director'
  const isDepartmentManager = !isDirector && managedDepartments.length > 0

  const realManagedDepartments = getManagedDepartments(org)
  const realIsDirector = isDirectorEmail(normalizedEmail) || org?.role_scope === 'director'
  const realIsDepartmentManager = !realIsDirector && realManagedDepartments.length > 0

  const can = (key) => {
    if (TERMINATED_STATES.has(effectiveLifecycle?.state)) return false
    const isExplicitlyAllowed = effectivePerms?.[key] === true
    const isExplicitlyDenied = effectivePerms?.[key] === false

    if (key === 'departments') {
      if (!isDirector) return false
      return !isExplicitlyDenied
    }
    if (key === 'my_department') {
      if (isDirector) return !isExplicitlyDenied
      if (isDepartmentManager) return isExplicitlyAllowed
      return isExplicitlyAllowed
    }
    if (key === 'my_team') {
      if (isDirector) return !isExplicitlyDenied
      if (isDepartmentManager || org?.department) return isExplicitlyAllowed
      return isExplicitlyAllowed
    }
    if (key === 'staff' || key === 'manager_board' || key === 'contract_queue') {
      if (isDirector) return !isExplicitlyDenied
      if (isDepartmentManager) return isExplicitlyAllowed
    }
    if (key === 'recruiting_dashboard' || key === 'recruiting_jobs' || key === 'recruiting_applications' || key === 'recruiting_board') {
      if (isDirector) return !isExplicitlyDenied
      if (isDepartmentManager) return isExplicitlyAllowed
    }
    if (key === 'recruiting_settings') {
      if (isDirector) return !isExplicitlyDenied
    }
    if (effectiveIsAdmin) return true
    if (effectivePerms === null) return false
    if (typeof effectivePerms !== 'object') return false
    if (effectivePerms[key] === true) return true
    if (effectivePerms[key] === false) return false
    return false
  }

  const canViewScopedStaff = (targetProfile = {}, targetOrg = {}) => canViewStaffMember({
    viewerEmail: effectiveUser?.email,
    viewerOrg: effectiveOrg,
    targetProfile,
    targetOrg,
  })

  const canPreviewStaffMember = (targetProfile = {}, targetOrg = {}) => canViewStaffMember({
    viewerEmail: normalizedEmail,
    viewerOrg: org,
    targetProfile,
    targetOrg,
  })

  const startPreviewAs = async ({ email, name } = {}) => {
    const safeEmail = String(email || '').toLowerCase().trim()
    if (!safeEmail) throw new Error('No staff email supplied for preview.')
    if (!realIsDirector && !realIsDepartmentManager) throw new Error('Only Directors and Department Managers can use preview mode.')

    const nextPreview = await loadPortalIdentity(safeEmail, name)
    if (!realIsDirector && !canPreviewStaffMember({ user_email: safeEmail, department: nextPreview.org?.department }, nextPreview.org)) {
      throw new Error('That staff member sits outside your department scope.')
    }

    setPreviewState(nextPreview)
    applyPortalAppearance(nextPreview.preferences)
    return nextPreview
  }

  const stopPreviewAs = () => {
    setPreviewState(null)
    applyPortalAppearance(preferences)
  }

  const updatePreferences = async (patch, options = {}) => {
    const targetEmail = String(options.email || normalizedEmail || '').toLowerCase().trim()
    const basePreferences = previewState && targetEmail === previewState.user?.email ? previewState.preferences : preferences
    const nextPreferences = mergePortalPreferences(basePreferences, patch)
    if (previewState && targetEmail === previewState.user?.email) {
      setPreviewState((current) => current ? { ...current, preferences: nextPreferences } : current)
    } else {
      setPreferences(nextPreferences)
    }
    applyPortalAppearance(nextPreferences)

    if (options.persist === false || !targetEmail) return nextPreferences

    const { error } = await supabase
      .from('portal_settings')
      .upsert({
        key: buildPreferenceSettingKey(targetEmail),
        value: { value: nextPreferences },
      }, { onConflict: 'key' })

    if (error) throw error
    return nextPreferences
  }

  return (
    <Ctx.Provider value={{
      user: effectiveUser,
      realUser,
      perms: effectivePerms,
      can,
      canViewScopedStaff,
      canPreviewStaffMember,
      isAdmin: effectiveIsAdmin,
      isDirector,
      isDepartmentManager,
      managedDepartments,
      isOnboarding: effectiveIsOnboarding,
      maintenance,
      lifecycle: effectiveLifecycle,
      org: effectiveOrg,
      preferences: effectivePreferences,
      updatePreferences,
      isPreviewing: !!previewState,
      previewTarget: previewState?.user || null,
      startPreviewAs,
      stopPreviewAs,
      loading,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
