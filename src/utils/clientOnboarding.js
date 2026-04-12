export const ONBOARDING_SECTION_ORDER = [
  'business_details',
  'project_goals',
  'pages_needed',
  'final_review',
]

export function normalizeClientEmail(email = '') {
  return String(email || '').trim().toLowerCase()
}

export function buildClientOnboardingKey(email = '') {
  return `client_onboarding:${normalizeClientEmail(email)}`
}

export function buildClientOnboardingSectionKey(email = '', sectionKey = '') {
  return `client_onboarding_section:${normalizeClientEmail(email)}:${String(sectionKey || '').trim()}`
}

export function getOnboardingSectionLabel(sectionKey = '') {
  switch (sectionKey) {
    case 'business_details':
      return 'Business Details'
    case 'project_goals':
      return 'Project Goals'
    case 'pages_needed':
      return 'Pages Needed'
    case 'final_review':
      return 'Final Review'
    default:
      return 'Section'
  }
}

export function parsePortalSetting(row) {
  return row?.value?.value ?? row?.value ?? {}
}

export function getOnboardingStatusTone(status = '') {
  if (status === 'submitted') return 'green'
  if (status === 'in_progress') return 'amber'
  return 'grey'
}

export function getOnboardingStatusLabel(status = '') {
  if (status === 'submitted') return 'Submitted'
  if (status === 'in_progress') return 'In progress'
  return 'Not started'
}

export function normalizeOnboardingSummary(raw = {}, client = {}) {
  const progress = raw?.progress || {}
  return {
    client_email: normalizeClientEmail(raw?.client_email || client?.email),
    client_account_id: String(raw?.client_account_id || client?.id || '').trim(),
    status: String(raw?.status || 'not_started').trim(),
    progress: {
      total: Number(progress.total || ONBOARDING_SECTION_ORDER.length) || ONBOARDING_SECTION_ORDER.length,
      completeCount: Number(progress.completeCount || 0) || 0,
      percent: Number(progress.percent || 0) || 0,
    },
    sections: raw?.sections && typeof raw.sections === 'object' ? raw.sections : {},
    started_at: String(raw?.started_at || '').trim(),
    submitted_at: String(raw?.submitted_at || '').trim(),
    approved_at: String(raw?.approved_at || '').trim(),
    approved_by: String(raw?.approved_by || '').trim(),
    updated_at: String(raw?.updated_at || '').trim(),
    updated_by: String(raw?.updated_by || '').trim(),
    source: String(raw?.source || 'client_portal').trim(),
  }
}

export function normalizeOnboardingSection(sectionKey = '', raw = {}) {
  return {
    section_key: sectionKey,
    status: String(raw?.status || 'not_started').trim(),
    data: raw?.data && typeof raw.data === 'object' ? raw.data : {},
    updated_at: String(raw?.updated_at || '').trim(),
    updated_by: String(raw?.updated_by || '').trim(),
    source: String(raw?.source || 'client_portal').trim(),
  }
}

export function getOrderedOnboardingSections(sectionMap = {}) {
  return ONBOARDING_SECTION_ORDER.map((sectionKey) => ({
    key: sectionKey,
    label: getOnboardingSectionLabel(sectionKey),
    ...(sectionMap[sectionKey] || normalizeOnboardingSection(sectionKey)),
  }))
}
