import { supabase } from './supabase'

const HIRING_PERMISSION_KEYS = [
  'recruiting_dashboard',
  'recruiting_jobs',
  'recruiting_applications',
  'recruiting_board',
  'recruiting_settings',
]

export const RECRUITING_STATUSES = [
  ['new', 'New'],
  ['reviewing', 'Reviewing'],
  ['shortlisted', 'Shortlisted'],
  ['interview', 'Interview'],
  ['offered', 'Offered'],
  ['hired', 'Hired'],
  ['rejected', 'Rejected'],
  ['withdrawn', 'Withdrawn'],
]

export function getRecruitingStatusLabel(status = '') {
  return RECRUITING_STATUSES.find(([key]) => key === status)?.[1] || 'Unknown'
}

export function getRecruitingStatusTone(status = '') {
  if (status === 'hired') return 'green'
  if (status === 'offered' || status === 'interview') return 'blue'
  if (status === 'shortlisted' || status === 'reviewing') return 'amber'
  if (status === 'rejected' || status === 'withdrawn') return 'red'
  return 'grey'
}

export function slugifyJobTitle(value = '') {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function buildApplicationRef() {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '')
  const random = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `DH-${stamp}-${random}`
}

export function normalizeRecruitingQuestion(raw = {}, index = 0) {
  const label = String(raw?.label || raw?.question || '').trim()
  return {
    id: String(raw?.id || `q_${index + 1}`),
    label,
    type: ['textarea', 'select', 'text'].includes(raw?.type) ? raw.type : 'textarea',
    required: raw?.required !== false,
    help: String(raw?.help || '').trim(),
    options: Array.isArray(raw?.options)
      ? raw.options.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  }
}

export function normalizeJobPost(row = {}) {
  return {
    id: row.id || '',
    slug: row.slug || '',
    title: row.title || '',
    department: row.department || '',
    location_type: row.location_type || 'remote',
    location_text: row.location_text || '',
    employment_type: row.employment_type || 'full_time',
    compensation_model: row.compensation_model || 'commission_only',
    salary_text: row.salary_text || '',
    commission_only: row.commission_only === true,
    summary: row.summary || '',
    description: row.description || '',
    responsibilities: row.responsibilities || '',
    requirements: row.requirements || '',
    benefits: row.benefits || '',
    screening_questions: Array.isArray(row.screening_questions)
      ? row.screening_questions.map(normalizeRecruitingQuestion).filter((item) => item.label)
      : [],
    status: row.status || 'draft',
    published_at: row.published_at || null,
    closing_at: row.closing_at || null,
    created_by: row.created_by || '',
    updated_by: row.updated_by || '',
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
  }
}

export function normalizeApplication(row = {}) {
  return {
    id: row.id || '',
    job_post_id: row.job_post_id || '',
    application_ref: row.application_ref || '',
    status: row.status || 'new',
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    full_name: row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    email: row.email || '',
    phone: row.phone || '',
    location: row.location || '',
    linkedin_url: row.linkedin_url || '',
    portfolio_url: row.portfolio_url || '',
    cv_file_url: row.cv_file_url || '',
    cv_file_path: row.cv_file_path || '',
    cover_note: row.cover_note || '',
    experience_summary: row.experience_summary || '',
    current_job_title: row.current_job_title || '',
    years_experience: row.years_experience || '',
    screening_answers: row.screening_answers && typeof row.screening_answers === 'object' ? row.screening_answers : {},
    commission_acknowledged: row.commission_acknowledged === true,
    privacy_acknowledged: row.privacy_acknowledged === true,
    source: row.source || 'website',
    internal_notes: row.internal_notes || '',
    shortlisted_at: row.shortlisted_at || null,
    rejected_at: row.rejected_at || null,
    hired_at: row.hired_at || null,
    submitted_at: row.submitted_at || row.created_at || null,
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
    assigned_recruiter_email: row.assigned_recruiter_email || '',
    assigned_recruiter_name: row.assigned_recruiter_name || '',
    interview_at: row.interview_at || null,
    interview_mode: row.interview_mode || '',
    interview_location: row.interview_location || '',
    interview_notes: row.interview_notes || '',
    interview_contact_email: row.interview_contact_email || '',
    interview_contact_name: row.interview_contact_name || '',
    interview_last_emailed_at: row.interview_last_emailed_at || null,
    job_posts: row.job_posts ? normalizeJobPost(row.job_posts) : null,
  }
}

function buildApplicationProfileSettingKey(applicationId = '') {
  return `recruiting:application_profile:${applicationId}`
}

function hasHiringAccess(permissions = {}) {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return false
  return HIRING_PERMISSION_KEYS.some((key) => permissions[key] === true)
}

export function normalizeApplicationProfileMeta(raw = {}) {
  return {
    assigned_recruiter_email: String(raw.assigned_recruiter_email || '').trim().toLowerCase(),
    assigned_recruiter_name: String(raw.assigned_recruiter_name || '').trim(),
    interview_at: raw.interview_at || null,
    interview_mode: String(raw.interview_mode || '').trim(),
    interview_location: String(raw.interview_location || '').trim(),
    interview_notes: String(raw.interview_notes || '').trim(),
    interview_contact_email: String(raw.interview_contact_email || '').trim().toLowerCase(),
    interview_contact_name: String(raw.interview_contact_name || '').trim(),
    interview_last_emailed_at: raw.interview_last_emailed_at || null,
  }
}

function mergeApplicationProfileMeta(application, meta = {}) {
  return normalizeApplication({
    ...application,
    ...normalizeApplicationProfileMeta(meta),
  })
}

async function listApplicationProfileMetaMap(applicationIds = []) {
  if (!applicationIds.length) return {}

  const { data, error } = await supabase
    .from('portal_settings')
    .select('key,value')
    .like('key', 'recruiting:application_profile:%')

  if (error) throw error

  const idSet = new Set(applicationIds)
  return (data || []).reduce((acc, row) => {
    const key = String(row.key || '')
    const applicationId = key.split(':').pop()
    if (!idSet.has(applicationId)) return acc
    acc[applicationId] = normalizeApplicationProfileMeta(row.value?.value ?? row.value ?? {})
    return acc
  }, {})
}

export function buildJobPostPayload(job = {}, actor = '') {
  const now = new Date().toISOString()
  const status = job.status || 'draft'
  return {
    slug: slugifyJobTitle(job.slug || job.title),
    title: String(job.title || '').trim(),
    department: String(job.department || '').trim(),
    location_type: job.location_type || 'remote',
    location_text: String(job.location_text || '').trim(),
    employment_type: job.employment_type || 'full_time',
    compensation_model: job.compensation_model || 'commission_only',
    salary_text: String(job.salary_text || '').trim(),
    commission_only: job.commission_only === true,
    summary: String(job.summary || '').trim(),
    description: String(job.description || '').trim(),
    responsibilities: String(job.responsibilities || '').trim(),
    requirements: String(job.requirements || '').trim(),
    benefits: String(job.benefits || '').trim(),
    screening_questions: Array.isArray(job.screening_questions)
      ? job.screening_questions.map(normalizeRecruitingQuestion).filter((item) => item.label)
      : [],
    status,
    published_at: status === 'published' ? (job.published_at || now) : null,
    closing_at: job.closing_at || null,
    updated_by: actor,
    updated_at: now,
  }
}

export function buildApplicationStatusPatch(status = '') {
  const now = new Date().toISOString()
  return {
    status,
    shortlisted_at: status === 'shortlisted' ? now : undefined,
    rejected_at: status === 'rejected' ? now : undefined,
    hired_at: status === 'hired' ? now : undefined,
    updated_at: now,
  }
}

export async function listJobPosts() {
  const { data, error } = await supabase.from('job_posts').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return (data || []).map(normalizeJobPost)
}

export async function getJobPost(id) {
  const { data, error } = await supabase.from('job_posts').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? normalizeJobPost(data) : null
}

export async function saveJobPost(job = {}, actor = '') {
  const payload = buildJobPostPayload(job, actor)
  const query = supabase.from('job_posts')
  const result = job?.id
    ? await query.update(payload).eq('id', job.id).select().maybeSingle()
    : await query.insert([{ ...payload, created_by: actor, created_at: new Date().toISOString() }]).select().maybeSingle()
  if (result.error) throw result.error
  return normalizeJobPost(result.data || {})
}

export async function deleteJobPost(id) {
  const { error } = await supabase.from('job_posts').delete().eq('id', id)
  if (error) throw error
}

export async function listApplications() {
  const { data, error } = await supabase
    .from('job_applications')
    .select('*, job_posts(*)')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  const applications = (data || []).map(normalizeApplication)
  const metaMap = await listApplicationProfileMetaMap(applications.map((application) => application.id))
  return applications.map((application) => mergeApplicationProfileMeta(application, metaMap[application.id]))
}

export async function getApplication(id) {
  const { data, error } = await supabase
    .from('job_applications')
    .select('*, job_posts(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const application = normalizeApplication(data)
  const metaMap = await listApplicationProfileMetaMap([id])
  return mergeApplicationProfileMeta(application, metaMap[id])
}

export async function listApplicationHistory(applicationId) {
  const { data, error } = await supabase
    .from('job_application_status_history')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function listApplicationNotes(applicationId) {
  const { data, error } = await supabase
    .from('job_application_notes')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addApplicationNote(applicationId, note, actor = {}) {
  const { data, error } = await supabase
    .from('job_application_notes')
    .insert([{
      application_id: applicationId,
      note: String(note || '').trim(),
      created_by_email: actor.email || '',
      created_by_name: actor.name || actor.email || '',
      created_at: new Date().toISOString(),
    }])
    .select()
    .maybeSingle()
  if (error) throw error
  return data
}

export async function updateApplicationStatus(application, nextStatus, actor = {}, extra = {}) {
  const patch = buildApplicationStatusPatch(nextStatus)
  const cleanPatch = Object.fromEntries(Object.entries({
    ...patch,
    ...extra,
  }).filter(([, value]) => value !== undefined))

  const [{ data, error }, historyResult] = await Promise.all([
    supabase
      .from('job_applications')
      .update(cleanPatch)
      .eq('id', application.id)
      .select('*, job_posts(*)')
      .maybeSingle(),
    supabase
      .from('job_application_status_history')
      .insert([{
        application_id: application.id,
        from_status: application.status || 'new',
        to_status: nextStatus,
        changed_by_email: actor.email || '',
        changed_by_name: actor.name || actor.email || '',
        reason: extra.reason || '',
        email_sent: false,
        created_at: new Date().toISOString(),
      }]),
  ])

  if (error) throw error
  if (historyResult.error) throw historyResult.error
  return await getApplication(application.id) || normalizeApplication(data || {})
}

export async function saveApplicationProfileMeta(applicationId, patch = {}) {
  const key = buildApplicationProfileSettingKey(applicationId)
  const { data: existing, error: existingError } = await supabase
    .from('portal_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  if (existingError) throw existingError

  const current = normalizeApplicationProfileMeta(existing?.value?.value ?? existing?.value ?? {})
  const nextValue = normalizeApplicationProfileMeta({ ...current, ...patch })
  const { error } = await supabase
    .from('portal_settings')
    .upsert({
      key,
      value: { value: nextValue },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })

  if (error) throw error
  return nextValue
}

export async function listHiringUsers() {
  const [{ data: permissionRows, error: permissionError }, { data: profileRows, error: profileError }] = await Promise.all([
    supabase.from('user_permissions').select('user_email,permissions'),
    supabase.from('hr_profiles').select('user_email,full_name'),
  ])

  if (permissionError) throw permissionError
  if (profileError) throw profileError

  const nameByEmail = new Map((profileRows || []).map((row) => [
    String(row.user_email || '').trim().toLowerCase(),
    row.full_name || '',
  ]))

  return (permissionRows || [])
    .filter((row) => hasHiringAccess(row.permissions))
    .map((row) => {
      const email = String(row.user_email || '').trim().toLowerCase()
      return {
        email,
        name: nameByEmail.get(email) || email,
      }
    })
    .filter((row) => row.email)
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

export async function upsertRecruitingSetting(key, value) {
  const { error } = await supabase
    .from('portal_settings')
    .upsert({
      key: `recruiting:${key}`,
      value: { value },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
  if (error) throw error
}

export async function getRecruitingSetting(key, fallback = null) {
  const { data, error } = await supabase
    .from('portal_settings')
    .select('value')
    .eq('key', `recruiting:${key}`)
    .maybeSingle()
  if (error) throw error
  return data?.value?.value ?? data?.value ?? fallback
}
