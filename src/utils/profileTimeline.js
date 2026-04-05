import { getCheckInStatusLabel, getGoalStatusLabel, getReviewTypeLabel, getTrainingCategoryLabel, getTrainingStatusLabel } from './peopleOps'

function safeDate(value = '') {
  const timestamp = new Date(value || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function formatProfileTimelineDate(value) {
  if (!value) return 'Unknown time'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function buildStaff360Timeline({
  profile = {},
  lifecycle = {},
  rtwRecord = {},
  rtwStatus = {},
  docs = [],
  contracts = [],
  reviews = [],
  checkIns = [],
  goals = [],
  trainingRecords = [],
} = {}) {
  const timeline = [
    ...(profile.start_date ? [{
      id: 'staff-start-date',
      date: `${profile.start_date}T09:00:00`,
      title: 'Employment start date',
      subtitle: `${profile.contract_type || 'Staff member'} started with ${profile.department || 'the business'}.`,
      tone: 'green',
      category: 'lifecycle',
    }] : []),
    ...(lifecycle?.state ? [{
      id: `staff-lifecycle-${lifecycle.state}`,
      date: lifecycle?.termination?.approved_at || lifecycle?.termination?.requested_at || profile.updated_at || profile.created_at || '',
      title: `Lifecycle: ${String(lifecycle.state).replaceAll('_', ' ')}`,
      subtitle: lifecycle.notes || 'Current employment status on the staff record.',
      tone: ['terminated', 'termination_requested', 'termination_approved', 'left', 'archived'].includes(String(lifecycle.state || '').toLowerCase()) ? 'red' : lifecycle.state === 'probation' ? 'blue' : 'amber',
      category: 'lifecycle',
    }] : []),
    ...reviews.map((review) => ({
      id: `review-${review.id}`,
      date: review.completed_at || review.meeting_date || review.due_date || review.updated_at || review.created_at,
      title: getReviewTypeLabel(review.review_type),
      subtitle: review.outcome
        ? `Outcome: ${review.outcome}${review.manager_notes ? ` · ${review.manager_notes}` : ''}`
        : `${review.status === 'meeting_booked' ? `Meeting ${review.meeting_date || 'scheduled'}${review.meeting_method ? ` via ${review.meeting_method}` : ''}` : review.status}`,
      tone: review.outcome === 'fail' ? 'red' : review.outcome === 'pass' ? 'green' : review.status === 'meeting_booked' ? 'blue' : 'amber',
      category: 'performance',
    })),
    ...checkIns.map((checkIn) => ({
      id: `checkin-${checkIn.id}`,
      date: checkIn.check_in_date || checkIn.updated_at || checkIn.created_at,
      title: 'Manager check-in',
      subtitle: checkIn.notes || getCheckInStatusLabel(checkIn.status),
      tone: checkIn.status === 'completed' ? 'green' : checkIn.status === 'follow_up_needed' ? 'amber' : 'blue',
      category: 'performance',
    })),
    ...goals.map((goal) => ({
      id: `goal-${goal.id}`,
      date: goal.completed_at || goal.due_date || goal.updated_at || goal.created_at,
      title: goal.title || 'Goal',
      subtitle: `${Math.round(goal.progress || 0)}% · ${getGoalStatusLabel(goal.status)}`,
      tone: goal.status === 'completed' ? 'green' : goal.status === 'at_risk' ? 'red' : 'amber',
      category: 'performance',
    })),
    ...trainingRecords.map((record) => ({
      id: `training-${record.id}`,
      date: record.completed_at || record.due_date || record.updated_at || record.created_at,
      title: record.title || 'Training',
      subtitle: `${getTrainingCategoryLabel(record.category)} · ${getTrainingStatusLabel(record.status)}${record.expires_at ? ` · expires ${record.expires_at}` : ''}`,
      tone: record.status === 'completed' ? 'green' : record.mandatory ? 'red' : 'blue',
      category: 'training',
    })),
    ...contracts.map((contract) => ({
      id: `contract-${contract.id}`,
      date: contract.completed_at || contract.sent_at || contract.updated_at || contract.created_at,
      title: contract.template_name || 'Staff contract',
      subtitle: `${String(contract.status || 'issued').replaceAll('_', ' ')}${contract.replacement_for_id ? ' · replacement issued' : ''}`,
      tone: contract.status === 'completed' ? 'green' : contract.status === 'overdue' ? 'red' : 'amber',
      category: 'contracts',
    })),
    ...docs.map((doc) => ({
      id: `doc-${doc.id}`,
      date: doc.created_at,
      title: doc.name || 'Document upload',
      subtitle: `${doc.type || 'Document'} · uploaded by ${doc.uploaded_by || 'Unknown'}`,
      tone: String(doc.type || '').toLowerCase().includes('contract') ? 'green' : 'blue',
      category: 'documents',
      action: doc.file_url,
      actionLabel: 'Open file',
    })),
    ...(rtwRecord?.documentUrl ? [{
      id: 'staff-rtw-record',
      date: profile.updated_at || profile.created_at || '',
      title: rtwRecord.rtw_override ? 'Right-to-work marked compliant' : 'Right-to-work document linked',
      subtitle: rtwRecord.expiry ? `Expiry: ${new Date(rtwRecord.expiry).toLocaleDateString('en-GB')}` : (rtwStatus?.hint || 'No expiry date recorded'),
      tone: rtwStatus?.tone || 'blue',
      category: 'documents',
      action: rtwRecord.documentUrl,
      actionLabel: 'Open RTW file',
    }] : []),
  ]

  return timeline
    .filter((item) => item.date || item.title)
    .sort((a, b) => safeDate(b.date) - safeDate(a.date))
}

export function buildStaffProfileCompleteness(profile = {}, { managerAssigned = false, hasContractDocument = false, hasAnyDocument = false, hasTraining = false } = {}) {
  const checks = [
    { key: 'full_name', label: 'Full name', complete: !!String(profile.full_name || '').trim() },
    { key: 'role', label: 'Role', complete: !!String(profile.role || '').trim() },
    { key: 'department', label: 'Department', complete: !!String(profile.department || '').trim() },
    { key: 'manager', label: 'Manager', complete: managerAssigned },
    { key: 'start_date', label: 'Start date', complete: !!String(profile.start_date || '').trim() },
    { key: 'contract_type', label: 'Contract type', complete: !!String(profile.contract_type || '').trim() },
    { key: 'phone', label: 'Phone', complete: !!String(profile.phone || '').trim() },
    { key: 'personal_email', label: 'Personal email', complete: !!String(profile.personal_email || '').trim() },
    { key: 'address', label: 'Address', complete: !!String(profile.address || '').trim() },
    { key: 'documents', label: 'Documents', complete: hasAnyDocument },
    { key: 'contract_document', label: 'Contract on file', complete: hasContractDocument },
    { key: 'training', label: 'Training record', complete: hasTraining },
  ]

  const completed = checks.filter((item) => item.complete).length
  const percent = Math.round((completed / checks.length) * 100)

  return {
    percent,
    completed,
    total: checks.length,
    missing: checks.filter((item) => !item.complete),
  }
}
