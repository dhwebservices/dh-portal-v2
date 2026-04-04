export const SUPPORT_WORKFLOW_OPTIONS = [
  ['new', 'New'],
  ['triage', 'Triage'],
  ['in_progress', 'In progress'],
  ['awaiting_client', 'Awaiting client'],
  ['resolved', 'Resolved'],
]

export const SUPPORT_PRIORITY_OPTIONS = [
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
  ['urgent', 'Urgent'],
]

const SLA_HOURS = {
  low: 48,
  medium: 24,
  high: 8,
  urgent: 4,
}

export function buildSupportTicketMetaKey(id = '') {
  return `support_ticket_meta:${String(id || '').trim()}`
}

export function createSupportTicketMeta(ticket = {}) {
  const priority = String(ticket.priority || '').trim().toLowerCase() || 'medium'
  const workflowStatus = ticket.status === 'resolved' ? 'resolved' : 'new'
  return {
    workflow_status: workflowStatus,
    priority,
    assignee_email: '',
    assignee_name: '',
    due_at: ticket.status === 'resolved' ? '' : buildSupportDueAt(ticket.created_at, priority),
    internal_notes: [],
    last_updated_at: '',
  }
}

export function normalizeSupportTicketMeta(raw = {}, ticket = {}) {
  const base = createSupportTicketMeta(ticket)
  const workflowStatus = SUPPORT_WORKFLOW_OPTIONS.some(([key]) => key === raw?.workflow_status)
    ? raw.workflow_status
    : base.workflow_status
  const priority = SUPPORT_PRIORITY_OPTIONS.some(([key]) => key === raw?.priority)
    ? raw.priority
    : base.priority

  return {
    workflow_status: workflowStatus,
    priority,
    assignee_email: String(raw?.assignee_email || '').trim().toLowerCase(),
    assignee_name: String(raw?.assignee_name || '').trim(),
    due_at: String(raw?.due_at || base.due_at || '').trim(),
    internal_notes: Array.isArray(raw?.internal_notes)
      ? raw.internal_notes
        .map((note) => ({
          id: String(note?.id || '').trim(),
          body: String(note?.body || '').trim(),
          author_name: String(note?.author_name || '').trim(),
          author_email: String(note?.author_email || '').trim().toLowerCase(),
          created_at: String(note?.created_at || '').trim(),
        }))
        .filter((note) => note.body)
      : [],
    last_updated_at: String(raw?.last_updated_at || '').trim(),
  }
}

export function mergeSupportTicket(ticket = {}, rawMeta = {}) {
  const meta = normalizeSupportTicketMeta(rawMeta, ticket)
  const workflowStatus = ticket.status === 'resolved' ? 'resolved' : meta.workflow_status
  const dueAt = workflowStatus === 'resolved'
    ? ''
    : meta.due_at || buildSupportDueAt(ticket.created_at, meta.priority)

  return {
    ...ticket,
    workflow_status: workflowStatus,
    priority: meta.priority || String(ticket.priority || '').trim().toLowerCase() || 'medium',
    assignee_email: meta.assignee_email,
    assignee_name: meta.assignee_name,
    due_at: dueAt,
    internal_notes: meta.internal_notes,
    last_updated_at: meta.last_updated_at,
  }
}

export function buildSupportDueAt(createdAt, priority = 'medium') {
  const baseTime = createdAt ? new Date(createdAt).getTime() : Date.now()
  const hours = SLA_HOURS[priority] || SLA_HOURS.medium
  return new Date(baseTime + hours * 60 * 60 * 1000).toISOString()
}

export function getSupportBaseStatus(workflowStatus = 'new') {
  return workflowStatus === 'resolved' ? 'resolved' : 'open'
}

export function getSupportWorkflowTone(status = '') {
  if (status === 'resolved') return 'green'
  if (status === 'awaiting_client') return 'blue'
  if (status === 'in_progress') return 'amber'
  if (status === 'triage') return 'grey'
  return 'red'
}

export function getSupportPriorityTone(priority = '') {
  if (priority === 'urgent') return 'red'
  if (priority === 'high') return 'amber'
  if (priority === 'medium') return 'blue'
  return 'grey'
}

export function getSupportSlaState(ticket = {}) {
  if (!ticket?.due_at || ticket?.workflow_status === 'resolved') return 'ok'
  const remainingMs = new Date(ticket.due_at).getTime() - Date.now()
  if (remainingMs <= 0) return 'breached'
  if (remainingMs <= 2 * 60 * 60 * 1000) return 'at_risk'
  return 'ok'
}

export function formatSupportDuration(dateString = '') {
  if (!dateString) return 'No SLA'
  const diff = new Date(dateString).getTime() - Date.now()
  const abs = Math.abs(diff)
  const hours = Math.round(abs / (60 * 60 * 1000))
  if (hours < 24) return `${diff >= 0 ? '' : '-'}${hours}h`
  const days = Math.round(hours / 24)
  return `${diff >= 0 ? '' : '-'}${days}d`
}
