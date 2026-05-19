export const STAFF_PRESENCE_OPTIONS = [
  { key: 'online', label: 'Online', tone: 'green' },
  { key: 'away', label: 'Away', tone: 'amber' },
  { key: 'busy', label: 'Busy', tone: 'red' },
  { key: 'on_call', label: 'On call', tone: 'blue' },
  { key: 'offline', label: 'Offline', tone: 'grey' },
]

export function buildStaffPresenceKey(email = '') {
  return `staff_presence:${String(email || '').trim().toLowerCase()}`
}

export function createDefaultStaffPresenceRecord(overrides = {}) {
  return {
    user_email: '',
    user_name: '',
    status: 'online',
    note: '',
    last_seen: '',
    updated_at: '',
    ...overrides,
  }
}

export function mergeStaffPresenceRecord(raw = {}, overrides = {}) {
  const base = createDefaultStaffPresenceRecord()
  const next = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return createDefaultStaffPresenceRecord({
    ...base,
    ...next,
    ...overrides,
    user_email: String(overrides.user_email || next.user_email || '').trim().toLowerCase(),
    user_name: String(overrides.user_name || next.user_name || '').trim(),
    status: String(overrides.status || next.status || base.status).trim().toLowerCase() || 'online',
    note: String(overrides.note || next.note || '').trim(),
    last_seen: String(overrides.last_seen || next.last_seen || '').trim(),
    updated_at: String(overrides.updated_at || next.updated_at || '').trim(),
  })
}

export function getPresenceMeta(status = 'online') {
  return STAFF_PRESENCE_OPTIONS.find((option) => option.key === status) || STAFF_PRESENCE_OPTIONS[0]
}
