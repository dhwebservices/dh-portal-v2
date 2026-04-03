export const DIRECTOR_EMAILS = new Set([
  'david@dhwebsiteservices.co.uk',
])

export const LIFECYCLE_STATES = [
  ['invited', 'Invited'],
  ['onboarding', 'Onboarding'],
  ['active', 'Active'],
  ['probation', 'Probation'],
  ['restricted', 'Restricted'],
  ['paused', 'Paused'],
  ['termination_requested', 'Termination Requested'],
  ['termination_approved', 'Termination Approved'],
  ['terminated', 'Terminated'],
  ['left', 'Left Company'],
  ['archived', 'Archived'],
]

export const TERMINATED_STATES = new Set([
  'termination_approved',
  'terminated',
  'left',
  'archived',
])

export function buildLifecycleSettingKey(email = '') {
  return `staff_lifecycle:${String(email || '').toLowerCase().trim()}`
}

export function normalizeLifecycleState(value = '') {
  const safe = String(value || '').toLowerCase().replace(/\s+/g, '_')
  return LIFECYCLE_STATES.some(([key]) => key === safe) ? safe : 'active'
}

export function getLifecycleLabel(value = '') {
  return LIFECYCLE_STATES.find(([key]) => key === normalizeLifecycleState(value))?.[1] || 'Active'
}

export function createDefaultLifecycleRecord({ onboarding = false, startDate = '', contractType = '' } = {}) {
  return {
    state: onboarding ? 'onboarding' : 'active',
    probation_end_date: '',
    notes: '',
    contract_type: contractType || '',
    termination: {
      status: 'none',
      requested_by_email: '',
      requested_by_name: '',
      requested_at: '',
      effective_date: '',
      reason: '',
      notes: '',
      immediate_access_removal: false,
      approved_by_email: '',
      approved_by_name: '',
      approved_at: '',
      rejected_at: '',
      rejected_by_email: '',
      rejected_by_name: '',
      rejection_reason: '',
    },
  }
}

export function mergeLifecycleRecord(raw = {}, defaults = {}) {
  const base = createDefaultLifecycleRecord(defaults)
  return {
    ...base,
    ...raw,
    state: normalizeLifecycleState(raw?.state || base.state),
    termination: {
      ...base.termination,
      ...(raw?.termination || {}),
    },
  }
}

export function getLifecycleMeta(record = {}, { onboarding = false, startDate = '', contractType = '' } = {}) {
  const merged = mergeLifecycleRecord(record, { onboarding, startDate, contractType })
  const state = merged.state

  if (state === 'onboarding') {
    return { label: 'Onboarding', tone: 'amber', note: 'Portal access is still being set up.' }
  }
  if (state === 'probation') {
    return {
      label: 'Probation',
      tone: 'blue',
      note: merged.probation_end_date
        ? `Probation due to end ${new Date(merged.probation_end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : 'Employee is currently in probation.',
    }
  }
  if (state === 'restricted') {
    return { label: 'Restricted', tone: 'amber', note: 'Access should remain limited while this status is active.' }
  }
  if (state === 'paused') {
    return { label: 'Paused', tone: 'grey', note: 'Employee access is paused temporarily.' }
  }
  if (state === 'termination_requested') {
    return { label: 'Termination Requested', tone: 'red', note: 'Awaiting director review and approval.' }
  }
  if (state === 'termination_approved' || state === 'terminated' || state === 'left' || state === 'archived') {
    return { label: getLifecycleLabel(state), tone: 'red', note: 'Access should be revoked and offboarding completed.' }
  }
  if (startDate) {
    return {
      label: 'Active',
      tone: 'green',
      note: `${contractType || 'Staff member'} · started ${new Date(startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    }
  }
  return { label: 'Active', tone: 'green', note: contractType || 'Staff member is active in the portal.' }
}
