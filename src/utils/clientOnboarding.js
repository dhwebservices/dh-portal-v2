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

export function extractClientOnboardingEmailFromKey(key = '') {
  const prefix = 'client_onboarding:'
  return String(key || '').startsWith(prefix)
    ? normalizeClientEmail(String(key).slice(prefix.length))
    : ''
}

export function extractClientOnboardingEmailFromSectionKey(key = '') {
  const prefix = 'client_onboarding_section:'
  if (!String(key || '').startsWith(prefix)) return ''
  const remainder = String(key).slice(prefix.length)
  return normalizeClientEmail(remainder.split(':')[0] || '')
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

function rankOnboardingStatus(status = '') {
  if (status === 'submitted') return 3
  if (status === 'in_progress') return 2
  if (status === 'not_started') return 1
  return 0
}

function getOnboardingFreshness(raw = {}) {
  const timestamp = raw?.approved_at || raw?.submitted_at || raw?.updated_at || raw?.started_at || ''
  const value = Date.parse(timestamp)
  return Number.isFinite(value) ? value : 0
}

function buildEmptySectionMap() {
  return Object.fromEntries(
    ONBOARDING_SECTION_ORDER.map((sectionKey) => [sectionKey, normalizeOnboardingSection(sectionKey)])
  )
}

function selectBestSummaryRow(rows = []) {
  return [...rows].sort((a, b) => {
    const parsedA = parsePortalSetting(a)
    const parsedB = parsePortalSetting(b)
    const statusDelta = rankOnboardingStatus(parsedB?.status) - rankOnboardingStatus(parsedA?.status)
    if (statusDelta) return statusDelta
    return getOnboardingFreshness(parsedB) - getOnboardingFreshness(parsedA)
  })[0] || null
}

export async function resolveClientOnboardingState(supabase, clientRecord = {}) {
  const clientEmail = normalizeClientEmail(clientRecord?.email)
  const clientName = String(clientRecord?.name || '').trim().toLowerCase()
  const candidateEmails = new Set([clientEmail].filter(Boolean))
  let linkedAccountId = ''

  if (clientEmail) {
    const { data: accountRows } = await supabase
      .from('client_accounts')
      .select('id,email,name')
      .ilike('email', clientEmail)
      .limit(1)

    const linkedAccount = accountRows?.[0] || null
    if (linkedAccount?.email) candidateEmails.add(normalizeClientEmail(linkedAccount.email))
    if (linkedAccount?.id) linkedAccountId = String(linkedAccount.id)
  }

  if (!linkedAccountId && clientName) {
    const { data: accountRows } = await supabase
      .from('client_accounts')
      .select('id,email,name')
      .ilike('name', clientRecord.name)
      .limit(5)

    const linkedAccount = (accountRows || []).find((row) => String(row?.name || '').trim().toLowerCase() === clientName) || null
    if (linkedAccount?.email) candidateEmails.add(normalizeClientEmail(linkedAccount.email))
    if (linkedAccount?.id) linkedAccountId = String(linkedAccount.id)
  }

  const candidateSummaryRows = []
  for (const email of candidateEmails) {
    const summaryKey = buildClientOnboardingKey(email)
    const { data } = await supabase.from('portal_settings').select('key,value').eq('key', summaryKey).maybeSingle()
    if (data?.key) candidateSummaryRows.push(data)
  }

  let summaryRow = selectBestSummaryRow(candidateSummaryRows)

  if (!summaryRow) {
    const { data: allSummaryRows } = await supabase
      .from('portal_settings')
      .select('key,value')
      .like('key', 'client_onboarding:%')

    const matchedRows = (allSummaryRows || []).filter((row) => {
      const parsed = parsePortalSetting(row)
      const rowEmail = normalizeClientEmail(parsed?.client_email || extractClientOnboardingEmailFromKey(row?.key))
      const rowAccountId = String(parsed?.client_account_id || '').trim()
      return candidateEmails.has(rowEmail) || (linkedAccountId && rowAccountId === linkedAccountId)
    })

    summaryRow = selectBestSummaryRow(matchedRows)
  }

  if (!summaryRow && clientName) {
    const { data: businessRows } = await supabase
      .from('portal_settings')
      .select('key,value')
      .like('key', 'client_onboarding_section:%:business_details')

    const matchedBusinessRow = (businessRows || []).find((row) => {
      const parsed = parsePortalSetting(row)
      const businessName = String(parsed?.data?.business_name || '').trim().toLowerCase()
      const primaryContact = String(parsed?.data?.primary_contact || '').trim().toLowerCase()
      return businessName === clientName || primaryContact === clientName
    })

    if (matchedBusinessRow?.key) {
      const fallbackEmail = extractClientOnboardingEmailFromSectionKey(matchedBusinessRow.key)
      if (fallbackEmail) {
        const { data } = await supabase
          .from('portal_settings')
          .select('key,value')
          .eq('key', buildClientOnboardingKey(fallbackEmail))
          .maybeSingle()
        if (data?.key) summaryRow = data
      }
    }
  }

  if (!summaryRow) {
    return {
      summary: null,
      sections: buildEmptySectionMap(),
      resolvedEmail: clientEmail,
      summaryKey: buildClientOnboardingKey(clientEmail),
      linkedAccountId,
    }
  }

  const parsedSummary = parsePortalSetting(summaryRow)
  const resolvedEmail = normalizeClientEmail(parsedSummary?.client_email || extractClientOnboardingEmailFromKey(summaryRow.key) || clientEmail)
  const sectionPrefix = buildClientOnboardingSectionKey(resolvedEmail, '')
  const { data: sectionRows } = await supabase
    .from('portal_settings')
    .select('key,value')
    .like('key', `${sectionPrefix}%`)

  const sections = Object.fromEntries(
    ONBOARDING_SECTION_ORDER.map((sectionKey) => {
      const row = (sectionRows || []).find((item) => item.key === buildClientOnboardingSectionKey(resolvedEmail, sectionKey))
      return [sectionKey, normalizeOnboardingSection(sectionKey, parsePortalSetting(row))]
    })
  )

  return {
    summary: normalizeOnboardingSummary(parsedSummary, {
      ...clientRecord,
      email: resolvedEmail || clientRecord?.email,
      id: linkedAccountId || clientRecord?.id,
    }),
    sections,
    resolvedEmail,
    summaryKey: summaryRow.key || buildClientOnboardingKey(resolvedEmail),
    linkedAccountId,
  }
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
