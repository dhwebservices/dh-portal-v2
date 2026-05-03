import { supabase } from './supabase'
import { buildLifecycleStateMap, isSystemStaffEmail, normalizeStaffEmail } from './staffDirectory'
import { TERMINATED_STATES } from './staffLifecycle'

function isActiveLifecycleState(state = '') {
  const safe = String(state || '').trim().toLowerCase()
  if (!safe) return true
  if (TERMINATED_STATES.has(safe)) return false
  if (safe === 'invited' || safe === 'onboarding') return false
  return true
}

export async function loadActivePortalStaffAudience() {
  const [{ data: profiles }, { data: permissionRows }, { data: lifecycleRows }] = await Promise.all([
    supabase.from('hr_profiles').select('user_email,full_name,role').order('full_name'),
    supabase.from('user_permissions').select('user_email,onboarding'),
    supabase.from('portal_settings').select('key,value').like('key', 'staff_lifecycle:%'),
  ])

  const lifecycleStateMap = buildLifecycleStateMap(lifecycleRows || [])
  const permissionMap = new Map(
    (permissionRows || [])
      .filter((row) => normalizeStaffEmail(row.user_email))
      .map((row) => [normalizeStaffEmail(row.user_email), row])
  )
  const seen = new Set()

  return (profiles || [])
    .map((row) => {
      const email = normalizeStaffEmail(row.user_email)
      return {
        email,
        name: row.full_name || row.user_email || 'there',
        role: row.role || '',
        permissions: permissionMap.get(email) || null,
        lifecycleState: lifecycleStateMap[email] || '',
      }
    })
    .filter((row) => row.email)
    .filter((row) => !isSystemStaffEmail(row.email))
    .filter((row) => !!row.permissions)
    .filter((row) => row.permissions?.onboarding !== true)
    .filter((row) => isActiveLifecycleState(row.lifecycleState))
    .filter((row) => {
      if (seen.has(row.email)) return false
      seen.add(row.email)
      return true
    })
}
