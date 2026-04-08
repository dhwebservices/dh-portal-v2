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

export const REQUISITION_STATUSES = [
  ['draft', 'Draft'],
  ['pending_approval', 'Pending approval'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
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

export function getRequisitionStatusLabel(status = '') {
  return REQUISITION_STATUSES.find(([key]) => key === status)?.[1] || 'Unknown'
}

export function getRequisitionStatusTone(status = '') {
  if (status === 'approved') return 'green'
  if (status === 'pending_approval') return 'amber'
  if (status === 'rejected') return 'red'
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
  const headcountRequested = Number(row.headcount_requested || 1)
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
    hiring_manager_name: row.hiring_manager_name || '',
    hiring_manager_email: row.hiring_manager_email || '',
    requisition_status: row.requisition_status || 'draft',
    headcount_requested: Number.isFinite(headcountRequested) && headcountRequested > 0 ? headcountRequested : 1,
    vacancy_reason: row.vacancy_reason || '',
    requisition_priority: row.requisition_priority || 'standard',
    planned_start_date: row.planned_start_date || '',
    budget_owner: row.budget_owner || '',
    approval_notes: row.approval_notes || '',
    requested_by_email: row.requested_by_email || '',
    requested_by_name: row.requested_by_name || '',
    requested_at: row.requested_at || null,
    decision_by_email: row.decision_by_email || '',
    decision_by_name: row.decision_by_name || '',
    decision_at: row.decision_at || null,
    decision_notes: row.decision_notes || '',
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
    candidate_user_id: row.candidate_user_id || '',
    portal_status: row.portal_status || 'unclaimed',
    portal_last_viewed_at: row.portal_last_viewed_at || null,
    portal_invited_at: row.portal_invited_at || null,
    portal_invited_by_email: row.portal_invited_by_email || '',
    candidate_profile_snapshot: row.candidate_profile_snapshot && typeof row.candidate_profile_snapshot === 'object' && !Array.isArray(row.candidate_profile_snapshot)
      ? row.candidate_profile_snapshot
      : {},
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

export function normalizeInterviewSlot(row = {}) {
  return {
    id: row.id || '',
    application_id: row.application_id || '',
    hiring_manager_email: row.hiring_manager_email || '',
    hiring_manager_name: row.hiring_manager_name || '',
    start_at: row.start_at || '',
    end_at: row.end_at || '',
    timezone: row.timezone || 'Europe/London',
    interview_mode: row.interview_mode || 'video',
    location: row.location || '',
    notes: row.notes || '',
    status: row.status || 'open',
    created_by_email: row.created_by_email || '',
    created_by_name: row.created_by_name || '',
    booked_by_user_id: row.booked_by_user_id || '',
    booked_at: row.booked_at || null,
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
  }
}

function buildApplicationProfileSettingKey(applicationId = '') {
  return `recruiting:application_profile:${applicationId}`
}

function buildJobProfileSettingKey(jobId = '') {
  return `recruiting:job_profile:${jobId}`
}

function hasHiringAccess(permissions = {}) {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return false
  return HIRING_PERMISSION_KEYS.some((key) => permissions[key] === true)
}

export function normalizeApplicationProfileMeta(raw = {}) {
  const overallRating = Number(raw.overall_rating || 0)
  const scorecardRatingsRaw = raw.scorecard_ratings && typeof raw.scorecard_ratings === 'object' && !Array.isArray(raw.scorecard_ratings)
    ? raw.scorecard_ratings
    : {}
  const scorecardRatings = Object.fromEntries(
    Object.entries(scorecardRatingsRaw).map(([key, value]) => {
      const numeric = Number(value || 0)
      return [key, Number.isFinite(numeric) ? Math.max(0, Math.min(5, numeric)) : 0]
    })
  )
  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.map((item) => String(item || '').trim()).filter(Boolean))]
    : []

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
    overall_rating: Number.isFinite(overallRating) ? Math.max(0, Math.min(5, overallRating)) : 0,
    scorecard_ratings: scorecardRatings,
    strengths: String(raw.strengths || '').trim(),
    risks: String(raw.risks || '').trim(),
    recommendation: String(raw.recommendation || '').trim(),
    tags,
  }
}

function mergeApplicationProfileMeta(application, meta = {}) {
  return normalizeApplication({
    ...application,
    ...normalizeApplicationProfileMeta(meta),
  })
}

function normalizeJobProfileMeta(raw = {}) {
  return {
    hiring_manager_name: String(raw.hiring_manager_name || '').trim(),
    hiring_manager_email: String(raw.hiring_manager_email || '').trim().toLowerCase(),
  }
}

function mergeJobProfileMeta(job, meta = {}) {
  return normalizeJobPost({
    ...job,
    ...normalizeJobProfileMeta(meta),
  })
}

function createPortalInviteToken() {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(value = '') {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function listJobProfileMetaMap(jobIds = []) {
  if (!jobIds.length) return {}

  const { data, error } = await supabase
    .from('portal_settings')
    .select('key,value')
    .like('key', 'recruiting:job_profile:%')

  if (error) throw error

  const idSet = new Set(jobIds)
  return (data || []).reduce((acc, row) => {
    const key = String(row.key || '')
    const jobId = key.split(':').pop()
    if (!idSet.has(jobId)) return acc
    acc[jobId] = normalizeJobProfileMeta(row.value?.value ?? row.value ?? {})
    return acc
  }, {})
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
  const requestedCount = Number(job.headcount_requested || 1)
  return {
    slug: slugifyJobTitle(job.slug || job.title),
    title: String(job.title || '').trim(),
    department: String(job.department || '').trim(),
    hiring_manager_name: String(job.hiring_manager_name || '').trim(),
    hiring_manager_email: String(job.hiring_manager_email || '').trim().toLowerCase(),
    requisition_status: job.requisition_status || (status === 'published' ? 'approved' : 'draft'),
    headcount_requested: Number.isFinite(requestedCount) && requestedCount > 0 ? requestedCount : 1,
    vacancy_reason: String(job.vacancy_reason || '').trim(),
    requisition_priority: String(job.requisition_priority || 'standard').trim(),
    planned_start_date: job.planned_start_date || null,
    budget_owner: String(job.budget_owner || '').trim(),
    approval_notes: String(job.approval_notes || '').trim(),
    requested_by_email: String(job.requested_by_email || '').trim().toLowerCase(),
    requested_by_name: String(job.requested_by_name || '').trim(),
    requested_at: job.requested_at || null,
    decision_by_email: String(job.decision_by_email || '').trim().toLowerCase(),
    decision_by_name: String(job.decision_by_name || '').trim(),
    decision_at: job.decision_at || null,
    decision_notes: String(job.decision_notes || '').trim(),
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

export function buildRequisitionPatch(nextStatus = '', actor = {}, notes = '') {
  const now = new Date().toISOString()
  return {
    requisition_status: nextStatus || 'draft',
    requested_by_email: nextStatus === 'pending_approval' ? String(actor.email || '').trim().toLowerCase() : undefined,
    requested_by_name: nextStatus === 'pending_approval' ? String(actor.name || actor.email || '').trim() : undefined,
    requested_at: nextStatus === 'pending_approval' ? now : undefined,
    decision_by_email: ['approved', 'rejected'].includes(nextStatus) ? String(actor.email || '').trim().toLowerCase() : null,
    decision_by_name: ['approved', 'rejected'].includes(nextStatus) ? String(actor.name || actor.email || '').trim() : null,
    decision_at: ['approved', 'rejected'].includes(nextStatus) ? now : null,
    decision_notes: ['approved', 'rejected'].includes(nextStatus) ? String(notes || '').trim() : '',
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
  const jobs = (data || []).map(normalizeJobPost)
  const metaMap = await listJobProfileMetaMap(jobs.map((job) => job.id))
  return jobs.map((job) => mergeJobProfileMeta(job, metaMap[job.id]))
}

export async function getJobPost(id) {
  const { data, error } = await supabase.from('job_posts').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  const job = normalizeJobPost(data)
  const metaMap = await listJobProfileMetaMap([id])
  return mergeJobProfileMeta(job, metaMap[id])
}

export async function saveJobPost(job = {}, actor = '') {
  const payload = buildJobPostPayload(job, actor)
  const query = supabase.from('job_posts')
  const result = job?.id
    ? await query.update(payload).eq('id', job.id).select().maybeSingle()
    : await query.insert([{ ...payload, created_by: actor, created_at: new Date().toISOString() }]).select().maybeSingle()
  if (result.error) throw result.error
  const savedJob = normalizeJobPost(result.data || {})
  const { error: metaError } = await supabase
    .from('portal_settings')
    .upsert({
      key: buildJobProfileSettingKey(savedJob.id),
      value: {
        value: normalizeJobProfileMeta({
          hiring_manager_name: job.hiring_manager_name,
          hiring_manager_email: job.hiring_manager_email,
        }),
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
  if (metaError) throw metaError
  return getJobPost(savedJob.id) || savedJob
}

export async function deleteJobPost(id) {
  const { data: applications, error: applicationError } = await supabase
    .from('job_applications')
    .select('id')
    .eq('job_post_id', id)

  if (applicationError) throw applicationError

  const applicationIds = (applications || []).map((application) => application.id).filter(Boolean)

  if (applicationIds.length) {
    const applicationProfileKeys = applicationIds.map((applicationId) => buildApplicationProfileSettingKey(applicationId))
    const cleanupResults = await Promise.all([
      supabase.from('job_application_status_history').delete().in('application_id', applicationIds),
      supabase.from('job_application_notes').delete().in('application_id', applicationIds),
      supabase.from('candidate_interview_slots').delete().in('application_id', applicationIds),
      supabase.from('candidate_invites').delete().in('application_id', applicationIds),
      supabase.from('portal_settings').delete().in('key', applicationProfileKeys),
      supabase.from('job_applications').delete().in('id', applicationIds),
    ])
    const cleanupError = cleanupResults.find((result) => result.error)?.error
    if (cleanupError) throw cleanupError
  }

  const [profileDelete, jobDelete] = await Promise.all([
    supabase.from('portal_settings').delete().eq('key', buildJobProfileSettingKey(id)),
    supabase.from('job_posts').delete().eq('id', id),
  ])

  if (profileDelete.error) throw profileDelete.error
  if (jobDelete.error) throw jobDelete.error
}

async function listJobsByIds(jobIds = []) {
  const uniqueIds = [...new Set(jobIds.filter(Boolean))]
  if (!uniqueIds.length) return {}
  const { data, error } = await supabase
    .from('job_posts')
    .select('*')
    .in('id', uniqueIds)
  if (error) throw error
  const jobs = (data || []).map(normalizeJobPost)
  const metaMap = await listJobProfileMetaMap(jobs.map((job) => job.id))
  return jobs.reduce((acc, job) => {
    acc[job.id] = mergeJobProfileMeta(job, metaMap[job.id])
    return acc
  }, {})
}

export async function listApplications() {
  const { data, error } = await supabase
    .from('job_applications')
    .select('*')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  const jobMap = await listJobsByIds((data || []).map((application) => application.job_post_id))
  const applications = (data || []).map((row) => normalizeApplication({
    ...row,
    job_posts: row.job_post_id ? jobMap[row.job_post_id] || null : null,
  }))
  const metaMap = await listApplicationProfileMetaMap(applications.map((application) => application.id))
  return applications.map((application) => mergeApplicationProfileMeta(application, metaMap[application.id]))
}

export async function getApplication(id) {
  const { data, error } = await supabase
    .from('job_applications')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const jobMap = await listJobsByIds([data.job_post_id])
  const application = normalizeApplication({
    ...data,
    job_posts: data.job_post_id ? jobMap[data.job_post_id] || null : null,
  })
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
  const { reason, ...extraPatch } = extra
  const cleanPatch = Object.fromEntries(Object.entries({
    ...patch,
    ...extraPatch,
  }).filter(([, value]) => value !== undefined))

  const [{ data, error }, historyResult] = await Promise.all([
    supabase
      .from('job_applications')
      .update(cleanPatch)
      .eq('id', application.id)
      .select('*')
      .maybeSingle(),
    supabase
      .from('job_application_status_history')
      .insert([{
        application_id: application.id,
        from_status: application.status || 'new',
        to_status: nextStatus,
        changed_by_email: actor.email || '',
        changed_by_name: actor.name || actor.email || '',
        reason: reason || '',
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

export async function listInterviewSlots(applicationId) {
  const { data, error } = await supabase
    .from('candidate_interview_slots')
    .select('*')
    .eq('application_id', applicationId)
    .order('start_at', { ascending: true })
  if (error) throw error
  return (data || []).map(normalizeInterviewSlot)
}

export async function replaceInterviewSlots(applicationId, slots = [], actor = {}) {
  const { error: deleteError } = await supabase
    .from('candidate_interview_slots')
    .delete()
    .eq('application_id', applicationId)
    .in('status', ['open', 'closed'])

  if (deleteError) throw deleteError

  if (!slots.length) return []

  const payload = slots.map((slot) => ({
    application_id: applicationId,
    hiring_manager_email: String(slot.hiring_manager_email || '').trim().toLowerCase(),
    hiring_manager_name: String(slot.hiring_manager_name || '').trim(),
    start_at: slot.start_at,
    end_at: slot.end_at,
    timezone: slot.timezone || 'Europe/London',
    interview_mode: slot.interview_mode || 'video',
    location: String(slot.location || '').trim(),
    notes: String(slot.notes || '').trim(),
    status: slot.status || 'open',
    created_by_email: actor.email || '',
    created_by_name: actor.name || actor.email || '',
    updated_at: new Date().toISOString(),
  }))

  const { data, error } = await supabase
    .from('candidate_interview_slots')
    .insert(payload)
    .select('*')

  if (error) throw error
  return (data || []).map(normalizeInterviewSlot)
}

export async function createCandidatePortalInvite(application, actor = {}, options = {}) {
  if (!application?.id || !application?.email) {
    throw new Error('Application email is required before sending a portal invite.')
  }

  const rawToken = createPortalInviteToken()
  const tokenHash = await sha256Hex(rawToken)
  const expiresAt = new Date(Date.now() + (Number(options.expiresInHours || 168) * 60 * 60 * 1000)).toISOString()

  const { error } = await supabase
    .from('candidate_invites')
    .insert({
      email: String(application.email).trim().toLowerCase(),
      application_id: application.id,
      token_hash: tokenHash,
      invited_by_email: actor?.email || '',
      expires_at: expiresAt,
      sent_at: new Date().toISOString(),
    })

  if (error) throw error

  const { error: applicationError } = await supabase
    .from('job_applications')
    .update({
      portal_status: application.candidate_user_id ? 'active' : 'invited',
      portal_invited_at: new Date().toISOString(),
      portal_invited_by_email: actor?.email || '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', application.id)

  if (applicationError) throw applicationError

  return {
    token: rawToken,
    inviteUrl: `https://careers.dhwebsiteservices.co.uk/invite/${rawToken}`,
    expiresAt,
  }
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
