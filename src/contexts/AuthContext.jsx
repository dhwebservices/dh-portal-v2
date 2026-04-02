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

const Ctx = createContext(null)
const ACTIVE_HEARTBEAT_MS = 60 * 1000

const OWNER_EMAILS = new Set([
  'david@dhwebsiteservices.co.uk',
])

const BASE_PERMISSIONS = {
  dashboard: true,
  notifications: true,
  my_profile: true,
  search: true,
}

function sanitizePermissions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...BASE_PERMISSIONS }
  }

  return { ...BASE_PERMISSIONS, ...raw }
}

export function AuthProvider({ children }) {
  const { accounts } = useMsal()
  const account = accounts[0]
  const normalizedEmail = account?.username?.toLowerCase?.() || null
  const [perms, setPerms]           = useState(null)
  const [isAdmin, setIsAdmin]       = useState(false)
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [maintenance, setMaintenance] = useState({ enabled: false, message: '', eta: '' })
  const [preferences, setPreferences] = useState(() => mergePortalPreferences(DEFAULT_PORTAL_PREFERENCES, readStoredPortalPreferences()))
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
        .from('portal_settings')
        .select('value')
        .eq('key', 'portal_maintenance')
        .maybeSingle(),
      supabase
        .from('portal_settings')
        .select('value')
        .eq('key', buildPreferenceSettingKey(normalizedEmail))
        .maybeSingle(),
    ])
      .then(([permissionsResult, maintenanceResult, preferenceResult]) => {
        clearTimeout(timeout)
        const { data, error } = permissionsResult
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

        if (!error && data) {
          const safePerms = sanitizePermissions(data.permissions)
          setPerms(isOwner ? null : safePerms)
          setIsAdmin(isOwner || data.permissions?.admin === true)
          setIsOnboarding(data.onboarding === true)
        } else {
          setPerms(isOwner ? null : { ...BASE_PERMISSIONS })
          setIsAdmin(isOwner)
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

  const user = account ? {
    email:    normalizedEmail,
    name:     account.name || normalizedEmail,
    initials: (account.name || normalizedEmail).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
  } : null

  const can = (key) => {
    if (isAdmin) return true
    if (perms === null) return false
    if (typeof perms !== 'object') return false
    if (perms[key] === true) return true
    if (perms[key] === false) return false
    return false
  }

  const updatePreferences = async (patch, options = {}) => {
    const targetEmail = String(options.email || normalizedEmail || '').toLowerCase().trim()
    const nextPreferences = mergePortalPreferences(preferences, patch)
    setPreferences(nextPreferences)
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
    <Ctx.Provider value={{ user, perms, can, isAdmin, isOnboarding, maintenance, preferences, updatePreferences, loading }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
