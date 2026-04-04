import { normalizeEmail } from './hrProfileSync'

export const REVIEW_TYPE_OPTIONS = [
  ['probation_30', '30-day probation review'],
  ['probation_60', '60-day probation review'],
  ['probation_90', '90-day probation review'],
  ['probation_end', 'Probation end review'],
  ['performance_quarterly', 'Quarterly performance review'],
  ['performance_annual', 'Annual performance review'],
]

export const REVIEW_STATUS_OPTIONS = [
  ['scheduled', 'Scheduled'],
  ['meeting_booked', 'Meeting booked'],
  ['completed', 'Completed'],
  ['concern', 'Concern'],
  ['extended', 'Extended'],
]

export const GOAL_STATUS_OPTIONS = [
  ['active', 'Active'],
  ['at_risk', 'At risk'],
  ['completed', 'Completed'],
]

export const CHECK_IN_STATUS_OPTIONS = [
  ['scheduled', 'Scheduled'],
  ['completed', 'Completed'],
  ['follow_up_needed', 'Follow-up needed'],
]

export const TRAINING_CATEGORY_OPTIONS = [
  ['induction', 'Induction'],
  ['compliance', 'Compliance'],
  ['sales', 'Sales / outreach'],
  ['operations', 'Operations'],
  ['systems', 'Systems'],
  ['certification', 'Certification'],
]

export const TRAINING_STATUS_OPTIONS = [
  ['assigned', 'Assigned'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
  ['expired', 'Expired'],
]

export function buildProbationReviewKey(id = '') {
  return `probation_review:${id}`
}

export function buildManagerCheckInKey(id = '') {
  return `manager_checkin:${id}`
}

export function buildStaffGoalKey(id = '') {
  return `staff_goal:${id}`
}

export function buildDepartmentAnnouncementKey(id = '') {
  return `department_announcement:${id}`
}

export function buildTrainingRecordKey(id = '') {
  return `training_record:${id}`
}

function fallbackId(prefix = 'record') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function buildBaseTimestamps(record = {}) {
  return {
    created_at: record.created_at || new Date().toISOString(),
    updated_at: record.updated_at || record.created_at || new Date().toISOString(),
  }
}

export function createProbationReview(record = {}) {
  return {
    id: record.id || fallbackId('review'),
    staff_email: normalizeEmail(record.staff_email || ''),
    staff_name: String(record.staff_name || '').trim(),
    department: String(record.department || '').trim(),
    manager_email: normalizeEmail(record.manager_email || ''),
    manager_name: String(record.manager_name || '').trim(),
    review_type: record.review_type || 'probation_30',
    due_date: record.due_date || '',
    meeting_date: record.meeting_date || '',
    meeting_method: String(record.meeting_method || '').trim(),
    status: record.status || 'scheduled',
    outcome: String(record.outcome || '').trim(),
    decision: String(record.decision || '').trim(),
    summary: String(record.summary || '').trim(),
    manager_notes: String(record.manager_notes || '').trim(),
    action_plan: String(record.action_plan || '').trim(),
    completed_at: record.completed_at || '',
    reminder_notice_key: String(record.reminder_notice_key || '').trim(),
    ...buildBaseTimestamps(record),
  }
}

export function createManagerCheckIn(record = {}) {
  return {
    id: record.id || fallbackId('checkin'),
    staff_email: normalizeEmail(record.staff_email || ''),
    staff_name: String(record.staff_name || '').trim(),
    department: String(record.department || '').trim(),
    manager_email: normalizeEmail(record.manager_email || ''),
    manager_name: String(record.manager_name || '').trim(),
    check_in_date: record.check_in_date || '',
    status: record.status || 'scheduled',
    notes: String(record.notes || '').trim(),
    follow_up_date: record.follow_up_date || '',
    reminder_notice_key: String(record.reminder_notice_key || '').trim(),
    completed_at: record.completed_at || '',
    ...buildBaseTimestamps(record),
  }
}

export function createStaffGoal(record = {}) {
  return {
    id: record.id || fallbackId('goal'),
    staff_email: normalizeEmail(record.staff_email || ''),
    staff_name: String(record.staff_name || '').trim(),
    department: String(record.department || '').trim(),
    manager_email: normalizeEmail(record.manager_email || ''),
    manager_name: String(record.manager_name || '').trim(),
    title: String(record.title || '').trim(),
    description: String(record.description || '').trim(),
    progress: Number.isFinite(Number(record.progress)) ? Math.max(0, Math.min(100, Number(record.progress))) : 0,
    due_date: record.due_date || '',
    status: record.status || 'active',
    reminder_notice_key: String(record.reminder_notice_key || '').trim(),
    completed_at: record.completed_at || '',
    ...buildBaseTimestamps(record),
  }
}

export function createDepartmentAnnouncement(record = {}) {
  return {
    id: record.id || fallbackId('announcement'),
    department: String(record.department || '').trim(),
    title: String(record.title || '').trim(),
    message: String(record.message || '').trim(),
    important: record.important === true,
    email_team: record.email_team === true,
    created_by_email: normalizeEmail(record.created_by_email || ''),
    created_by_name: String(record.created_by_name || '').trim(),
    expires_at: record.expires_at || '',
    ...buildBaseTimestamps(record),
  }
}

export function createTrainingRecord(record = {}) {
  return {
    id: record.id || fallbackId('training'),
    template_id: String(record.template_id || record.templateId || '').trim(),
    staff_email: normalizeEmail(record.staff_email || ''),
    staff_name: String(record.staff_name || '').trim(),
    department: String(record.department || '').trim(),
    manager_email: normalizeEmail(record.manager_email || ''),
    manager_name: String(record.manager_name || '').trim(),
    title: String(record.title || '').trim(),
    category: record.category || 'induction',
    mandatory: record.mandatory === true,
    status: record.status || 'assigned',
    due_date: record.due_date || '',
    expires_at: record.expires_at || '',
    certificate_name: String(record.certificate_name || '').trim(),
    certificate_url: String(record.certificate_url || '').trim(),
    notes: String(record.notes || '').trim(),
    completed_at: record.completed_at || '',
    reminder_notice_key: String(record.reminder_notice_key || '').trim(),
    ...buildBaseTimestamps(record),
  }
}

export function getReviewTypeLabel(value = '') {
  return REVIEW_TYPE_OPTIONS.find(([key]) => key === value)?.[1] || 'Review'
}

export function getGoalStatusLabel(value = '') {
  return GOAL_STATUS_OPTIONS.find(([key]) => key === value)?.[1] || 'Goal'
}

export function getCheckInStatusLabel(value = '') {
  return CHECK_IN_STATUS_OPTIONS.find(([key]) => key === value)?.[1] || 'Check-in'
}

export function getTrainingCategoryLabel(value = '') {
  return TRAINING_CATEGORY_OPTIONS.find(([key]) => key === value)?.[1] || 'Training'
}

export function getTrainingStatusLabel(value = '') {
  return TRAINING_STATUS_OPTIONS.find(([key]) => key === value)?.[1] || 'Training'
}

export function isDueTodayOrOverdue(value = '') {
  if (!value) return false
  const due = new Date(`${value}T23:59:59`)
  return due.getTime() <= Date.now()
}
