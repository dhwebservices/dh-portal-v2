import { mergeAccountSecurityRecord } from './accountSecurity'
import { normalizeLifecycleState, TERMINATED_STATES } from './staffLifecycle'

export function buildTemporaryPermissionKey(email = '') {
  return `temporary_permissions:${String(email || '').toLowerCase().trim()}`
}

export function createDefaultTemporaryPermissionRecord() {
  return {
    enabled: false,
    preset: '',
    permissions: {},
    reason: '',
    starts_at: '',
    expires_at: '',
    issued_by_email: '',
    issued_by_name: '',
    issued_at: '',
  }
}

export function mergeTemporaryPermissionRecord(record = {}) {
  const base = createDefaultTemporaryPermissionRecord()
  if (!record || typeof record !== 'object' || Array.isArray(record)) return base
  return {
    ...base,
    ...record,
    enabled: record.enabled === true,
    preset: String(record.preset || '').trim(),
    permissions: record.permissions && typeof record.permissions === 'object' && !Array.isArray(record.permissions)
      ? { ...record.permissions }
      : {},
    reason: String(record.reason || '').trim(),
    starts_at: String(record.starts_at || '').trim(),
    expires_at: String(record.expires_at || '').trim(),
    issued_by_email: String(record.issued_by_email || '').toLowerCase().trim(),
    issued_by_name: String(record.issued_by_name || '').trim(),
    issued_at: String(record.issued_at || '').trim(),
  }
}

function toTimestamp(value = '') {
  const ms = new Date(String(value || '').trim()).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function isTemporaryPermissionActive(record = {}, at = Date.now()) {
  const merged = mergeTemporaryPermissionRecord(record)
  if (!merged.enabled) return false
  const nowMs = typeof at === 'number' ? at : Date.now()
  const startsAt = toTimestamp(merged.starts_at)
  const expiresAt = toTimestamp(merged.expires_at)
  if (startsAt && nowMs < startsAt) return false
  if (expiresAt && nowMs >= expiresAt) return false
  return Object.keys(merged.permissions || {}).length > 0
}

export function applyTemporaryPermissions(basePermissions = {}, record = {}, at = Date.now()) {
  if (!isTemporaryPermissionActive(record, at)) return { ...basePermissions }
  const merged = mergeTemporaryPermissionRecord(record)
  return { ...basePermissions, ...merged.permissions }
}

export function buildLifecycleAccessPolicyKey(email = '') {
  return `lifecycle_access_policy:${String(email || '').toLowerCase().trim()}`
}

export function createDefaultLifecycleAccessPolicy() {
  return {
    enforce_onboarding_mode: true,
    suspend_when_paused: true,
    suspend_when_restricted: false,
    suspend_when_terminated: true,
    remove_bookable_when_inactive: true,
  }
}

export function mergeLifecycleAccessPolicy(record = {}) {
  const base = createDefaultLifecycleAccessPolicy()
  if (!record || typeof record !== 'object' || Array.isArray(record)) return base
  return {
    ...base,
    ...record,
    enforce_onboarding_mode: record.enforce_onboarding_mode !== false,
    suspend_when_paused: record.suspend_when_paused !== false,
    suspend_when_restricted: record.suspend_when_restricted === true,
    suspend_when_terminated: record.suspend_when_terminated !== false,
    remove_bookable_when_inactive: record.remove_bookable_when_inactive !== false,
  }
}

export function shouldLifecycleLockPortal(lifecycleRecord = {}, policyRecord = {}) {
  const state = normalizeLifecycleState(lifecycleRecord?.state || '')
  const policy = mergeLifecycleAccessPolicy(policyRecord)
  if (policy.suspend_when_terminated && TERMINATED_STATES.has(state)) return true
  if (policy.suspend_when_paused && state === 'paused') return true
  if (policy.suspend_when_restricted && state === 'restricted') return true
  return false
}

export function getLifecycleLockReason(lifecycleRecord = {}) {
  const state = normalizeLifecycleState(lifecycleRecord?.state || '')
  if (TERMINATED_STATES.has(state)) return `Portal access is automatically suspended while lifecycle is ${state.replace(/_/g, ' ')}.`
  if (state === 'paused') return 'Portal access is automatically suspended while this staff record is paused.'
  if (state === 'restricted') return 'Portal access is automatically suspended while this staff record is restricted.'
  return ''
}

export function applyLifecycleAccessPolicy(accountSecurity = {}, lifecycleRecord = {}, policyRecord = {}) {
  const mergedSecurity = mergeAccountSecurityRecord(accountSecurity)
  if (!shouldLifecycleLockPortal(lifecycleRecord, policyRecord)) return mergedSecurity
  return mergeAccountSecurityRecord({
    ...mergedSecurity,
    portal_access_locked: true,
    lock_reason: mergedSecurity.lock_reason || getLifecycleLockReason(lifecycleRecord),
  })
}
