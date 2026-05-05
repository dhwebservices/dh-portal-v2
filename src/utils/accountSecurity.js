export function buildAccountSecurityKey(email = '') {
  return `account_security:${String(email || '').toLowerCase().trim()}`
}

export function createDefaultAccountSecurityRecord() {
  return {
    portal_access_locked: false,
    lock_reason: '',
    lock_updated_at: '',
    lock_updated_by_email: '',
    lock_updated_by_name: '',
    required_session_after: '',
    session_revoked_at: '',
    session_revoked_by_email: '',
    session_revoked_by_name: '',
  }
}

export function mergeAccountSecurityRecord(record = {}) {
  const base = createDefaultAccountSecurityRecord()
  if (!record || typeof record !== 'object' || Array.isArray(record)) return base
  return {
    ...base,
    ...record,
    portal_access_locked: record.portal_access_locked === true,
    lock_reason: String(record.lock_reason || '').trim(),
    lock_updated_at: String(record.lock_updated_at || '').trim(),
    lock_updated_by_email: String(record.lock_updated_by_email || '').toLowerCase().trim(),
    lock_updated_by_name: String(record.lock_updated_by_name || '').trim(),
    required_session_after: String(record.required_session_after || '').trim(),
    session_revoked_at: String(record.session_revoked_at || '').trim(),
    session_revoked_by_email: String(record.session_revoked_by_email || '').toLowerCase().trim(),
    session_revoked_by_name: String(record.session_revoked_by_name || '').trim(),
  }
}

export function buildAccountLockRecord(current = {}, {
  locked = false,
  reason = '',
  actorEmail = '',
  actorName = '',
} = {}) {
  const merged = mergeAccountSecurityRecord(current)
  return mergeAccountSecurityRecord({
    ...merged,
    portal_access_locked: locked,
    lock_reason: locked ? String(reason || '').trim() : '',
    lock_updated_at: new Date().toISOString(),
    lock_updated_by_email: String(actorEmail || '').toLowerCase().trim(),
    lock_updated_by_name: String(actorName || '').trim(),
  })
}

export function buildSessionRevokeRecord(current = {}, {
  actorEmail = '',
  actorName = '',
  at = new Date().toISOString(),
} = {}) {
  const merged = mergeAccountSecurityRecord(current)
  return mergeAccountSecurityRecord({
    ...merged,
    required_session_after: at,
    session_revoked_at: at,
    session_revoked_by_email: String(actorEmail || '').toLowerCase().trim(),
    session_revoked_by_name: String(actorName || '').trim(),
  })
}

export function getSessionStorageKey(email = '') {
  return `portal_session_started_at:${String(email || '').toLowerCase().trim()}`
}

export function readSessionStartedAt(email = '') {
  if (typeof window === 'undefined') return ''
  return String(window.sessionStorage.getItem(getSessionStorageKey(email)) || '').trim()
}

export function touchSessionStartedAt(email = '', fallback = '') {
  if (typeof window === 'undefined') return fallback || ''
  const key = getSessionStorageKey(email)
  const existing = String(window.sessionStorage.getItem(key) || '').trim()
  if (existing) return existing
  const next = fallback || new Date().toISOString()
  window.sessionStorage.setItem(key, next)
  return next
}

export function clearSessionStartedAt(email = '') {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(getSessionStorageKey(email))
}

export function shouldForceSessionReauth(sessionStartedAt = '', securityRecord = {}) {
  const sessionStart = String(sessionStartedAt || '').trim()
  const requiredAfter = String(securityRecord?.required_session_after || '').trim()
  if (!sessionStart || !requiredAfter) return false
  const sessionMs = new Date(sessionStart).getTime()
  const requiredMs = new Date(requiredAfter).getTime()
  if (!Number.isFinite(sessionMs) || !Number.isFinite(requiredMs)) return false
  return sessionMs < requiredMs
}
