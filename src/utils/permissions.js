import { supabase } from './supabase'

export async function getPermissions(email) {
  if (!email) return null
  const { data } = await supabase
    .from('user_permissions')
    .select('permissions, onboarding')
    .ilike('user_email', email)
    .maybeSingle()
  return data
}

export function can(permissions, key) {
  if (!permissions) return true // no restrictions = full access
  return permissions[key] === true
}
