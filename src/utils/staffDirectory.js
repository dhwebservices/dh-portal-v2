import { mergeLifecycleRecord, TERMINATED_STATES } from './staffLifecycle'

const SYSTEM_EMAIL_PREFIXES = ['hr@', 'clients@', 'log@', 'legal@', 'noreply@', 'admin@', 'test@', 'outreachlog@']

export function normalizeStaffEmail(email = '') {
  return String(email || '').trim().toLowerCase()
}

export function isSystemStaffEmail(email = '') {
  const normalized = normalizeStaffEmail(email)
  return SYSTEM_EMAIL_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

export function buildLifecycleStateMap(rows = []) {
  const map = {}
  for (const row of rows || []) {
    const key = normalizeStaffEmail(String(row?.key || '').replace('staff_lifecycle:', ''))
    if (!key) continue
    map[key] = mergeLifecycleRecord(row?.value?.value ?? row?.value ?? {}).state
  }
  return map
}

export function isTerminatedLifecycleState(state = '') {
  return TERMINATED_STATES.has(String(state || '').trim().toLowerCase())
}

export function isSchedulableStaffEmail(email = '', lifecycleStateMap = {}) {
  const normalized = normalizeStaffEmail(email)
  if (!normalized) return false
  if (isSystemStaffEmail(normalized)) return false
  if (isTerminatedLifecycleState(lifecycleStateMap[normalized])) return false
  return true
}
