import { supabase } from './supabase'

export const normalizeEmail = (email = '') => email.toLowerCase().trim()

export const pickBestProfileRow = (rows = []) =>
  rows
    .slice()
    .sort((a, b) => {
      const aLower = a.user_email === normalizeEmail(a.user_email) ? 1 : 0
      const bLower = b.user_email === normalizeEmail(b.user_email) ? 1 : 0
      if (aLower !== bLower) return bLower - aLower

      const aClean = a.full_name && !a.full_name.includes('(') ? 1 : 0
      const bClean = b.full_name && !b.full_name.includes('(') ? 1 : 0
      if (aClean !== bClean) return bClean - aClean

      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
    })[0] || null

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && value.trim() === '') continue
    return value
  }
  return null
}

export function buildAddressFromOnboarding(submission = {}) {
  const parts = [
    submission.address_line1,
    submission.address_line2,
    submission.city,
    submission.postcode,
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : value))
    .filter(Boolean)

  return parts.length ? parts.join(', ') : null
}

export function buildHrProfileFromOnboarding(submission = {}) {
  return {
    user_email: normalizeEmail(submission.user_email || ''),
    full_name: firstNonEmpty(submission.full_name, submission.user_name),
    role: firstNonEmpty(submission.job_title, submission.role),
    department: firstNonEmpty(submission.department),
    contract_type: firstNonEmpty(submission.contract_type),
    start_date: firstNonEmpty(submission.start_date),
    phone: firstNonEmpty(submission.personal_phone, submission.phone),
    personal_email: firstNonEmpty(submission.personal_email),
    address: firstNonEmpty(buildAddressFromOnboarding(submission), submission.address),
    manager_name: firstNonEmpty(submission.manager_name),
    bank_name: firstNonEmpty(submission.bank_name),
    account_name: firstNonEmpty(submission.account_name),
    sort_code: firstNonEmpty(submission.sort_code),
    account_number: firstNonEmpty(submission.account_number),
  }
}

export function mergeHrProfileWithOnboarding(profile = {}, submission = null) {
  if (!submission) return profile || {}

  const onboardingProfile = buildHrProfileFromOnboarding(submission)
  const merged = { ...(profile || {}) }

  for (const [key, value] of Object.entries(onboardingProfile)) {
    if (key === 'user_email') continue
    if (!merged[key] || (typeof merged[key] === 'string' && merged[key].trim() === '')) {
      merged[key] = value
    }
  }

  if (!merged.user_email) {
    merged.user_email = onboardingProfile.user_email
  }

  return merged
}

export async function syncOnboardingSubmissionToHrProfile(submission, options = {}) {
  if (!submission?.user_email) return null

  const normalizedEmail = normalizeEmail(submission.user_email)
  const incoming = buildHrProfileFromOnboarding({ ...submission, user_email: normalizedEmail })
  const { overwrite = false } = options

  const { data: existingRows } = await supabase
    .from('hr_profiles')
    .select('*')
    .ilike('user_email', normalizedEmail)

  const existing = pickBestProfileRow(existingRows || [])

  const merged = {
    ...(existing || {}),
    user_email: normalizedEmail,
    updated_at: new Date().toISOString(),
  }

  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'user_email') continue
    if (overwrite || !merged[key] || (typeof merged[key] === 'string' && merged[key].trim() === '')) {
      merged[key] = value
    }
  }

  const payload = {
    ...merged,
    created_at: existing?.created_at || new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('hr_profiles')
    .upsert(payload, { onConflict: 'user_email' })
    .select()
    .maybeSingle()

  if (error) throw error
  return data
}
