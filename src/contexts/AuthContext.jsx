import { createContext, useContext, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { supabase } from '../utils/supabase'

const Ctx = createContext(null)

const PERMISSION_FALLBACKS = {
  notifications: 'dashboard',
  search: 'dashboard',
  my_profile: 'dashboard',
  org_chart: 'staff',
  safeguards: 'settings',
}

export function AuthProvider({ children }) {
  const { accounts } = useMsal()
  const account = accounts[0]
  const normalizedEmail = account?.username?.toLowerCase?.() || null
  const [perms, setPerms]           = useState(null)
  const [isAdmin, setIsAdmin]       = useState(false)
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    if (!normalizedEmail) { setLoading(false); return }
    const timeout = setTimeout(() => setLoading(false), 4000)
    supabase
      .from('user_permissions')
      .select('permissions, onboarding')
      .ilike('user_email', normalizedEmail)
      .maybeSingle()
      .then(({ data, error }) => {
        clearTimeout(timeout)
        if (!error && data) {
          const p = data.permissions
          // If permissions object has keys, use it. If empty object or null, treat as full access
          const hasKeys = p && typeof p === 'object' && Object.keys(p).length > 0
          setPerms(hasKeys ? p : null)
          // Admin if no restrictions OR if admin key is explicitly true
          setIsAdmin(!hasKeys || p?.admin === true)
          setIsOnboarding(data.onboarding === true)
        } else {
          // No row = no restrictions = full access
          setPerms(null)
          setIsAdmin(true)
        }
        setLoading(false)
      })
      .catch(() => { clearTimeout(timeout); setLoading(false) })

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
    // hr_profiles last_seen update - ignore errors (column may not exist yet)
    supabase.from('hr_profiles').upsert({
      user_email: normalizedEmail,
      full_name:  account.name || normalizedEmail,
      last_seen:  now,
      updated_at: now,
    }, { onConflict: 'user_email' }).then(() => {}).catch(() => {})
    return () => clearTimeout(timeout)
  }, [normalizedEmail, account?.name])

  const user = account ? {
    email:    normalizedEmail,
    name:     account.name || normalizedEmail,
    initials: (account.name || normalizedEmail).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
  } : null

  // null perms = full access. Non-null perms = check specific key.
  const can = (key) => {
    if (perms === null) return true          // no restrictions
    if (isAdmin) return true                 // admin bypasses all
    if (typeof perms !== 'object') return true
    if (perms[key] === true) return true
    if (perms[key] === false) return false
    const fallbackKey = PERMISSION_FALLBACKS[key]
    if (fallbackKey) return perms[fallbackKey] === true
    return false
  }

  return (
    <Ctx.Provider value={{ user, perms, can, isAdmin, isOnboarding, loading }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
