import { createClientLifecycle, deriveClientLifecycleSignals } from './clientLifecycle'
import { evaluateComplianceRulesForStaff, normalizeComplianceRule } from './complianceRules'
import { createTrainingRecord, getTrainingCategoryLabel } from './peopleOps'
import { getSupportSlaState, mergeSupportTicket, normalizeSupportTicketMeta } from './supportDesk'

export const WORKFLOW_TRIGGER_OPTIONS = [
  ['support_breached', 'Support SLA breached'],
  ['training_overdue', 'Mandatory training overdue'],
  ['compliance_gap', 'Compliance gap detected'],
  ['client_risk', 'Client risk detected'],
]

export const WORKFLOW_RECIPIENT_OPTIONS = [
  ['auto', 'Best fit automatically'],
  ['manual', 'Manual recipient'],
  ['manager', 'Staff manager'],
  ['staff', 'Affected staff member'],
  ['support_assignee', 'Support assignee'],
]

export const WORKFLOW_CATEGORY_OPTIONS = [
  ['general', 'General updates'],
  ['urgent', 'Urgent / admin'],
  ['hr', 'HR updates'],
  ['tasks', 'Tasks'],
]

export function buildWorkflowRuleKey(id = '') {
  return `workflow_rule:${String(id || '').trim()}`
}

export function buildWorkflowNoticeKey(ruleId = '', incidentId = '') {
  return `workflow_notice:${String(ruleId || '').trim()}:${String(incidentId || '').trim()}`
}

export function buildWorkflowRunKey(id = '') {
  return `workflow_run:${String(id || '').trim()}`
}

function fallbackId(prefix = 'workflow') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function createWorkflowRule(record = {}) {
  return {
    id: String(record.id || fallbackId('workflow')).trim(),
    title: String(record.title || '').trim(),
    description: String(record.description || '').trim(),
    trigger_type: WORKFLOW_TRIGGER_OPTIONS.some(([key]) => key === record.trigger_type) ? record.trigger_type : 'support_breached',
    recipient_mode: WORKFLOW_RECIPIENT_OPTIONS.some(([key]) => key === record.recipient_mode) ? record.recipient_mode : 'auto',
    recipient_email: String(record.recipient_email || '').trim().toLowerCase(),
    recipient_name: String(record.recipient_name || '').trim(),
    notification_category: WORKFLOW_CATEGORY_OPTIONS.some(([key]) => key === record.notification_category) ? record.notification_category : 'general',
    notify_by_email: record.notify_by_email !== false,
    cooldown_hours: Number.isFinite(Number(record.cooldown_hours)) ? Math.max(1, Math.min(168, Number(record.cooldown_hours))) : 24,
    min_client_health: ['watch', 'high_risk'].includes(record.min_client_health) ? record.min_client_health : 'watch',
    active: record.active !== false,
    created_at: String(record.created_at || new Date().toISOString()),
    updated_at: String(record.updated_at || new Date().toISOString()),
    created_by_email: String(record.created_by_email || '').trim().toLowerCase(),
    created_by_name: String(record.created_by_name || '').trim(),
  }
}

export function normalizeWorkflowRule(record = {}) {
  return createWorkflowRule(record)
}

function groupByEmail(rows = [], key = 'staff_email') {
  return rows.reduce((acc, row) => {
    const email = String(row?.[key] || '').toLowerCase()
    if (!email) return acc
    acc[email] = acc[email] || []
    acc[email].push(row)
    return acc
  }, {})
}

function createIncidentBase(rule = {}, incident = {}) {
  return {
    id: String(incident.id || fallbackId('incident')).trim(),
    trigger_type: rule.trigger_type,
    link: String(incident.link || '/notifications').trim(),
    title: String(incident.title || rule.title || 'Workflow alert').trim(),
    message: String(incident.message || '').trim(),
    subject: String(incident.subject || '').trim(),
    recipient_hint: String(incident.recipient_hint || '').trim(),
    metadata: incident.metadata || {},
  }
}

export function buildAutomationContext({
  supportTickets = [],
  supportMetaRows = [],
  staff = [],
  documents = [],
  trainingRows = [],
  lifecycleRows = [],
  complianceRules = [],
  clients = [],
  clientLifecycleRows = [],
  outreachRows = [],
  invoiceRows = [],
  ticketRows = [],
  paymentRows = [],
} = {}) {
  const supportMetaMap = Object.fromEntries(
    (supportMetaRows || []).map((row) => {
      const id = String(row.key || '').replace('support_ticket_meta:', '')
      const raw = row?.value?.value ?? row?.value ?? {}
      return [id, normalizeSupportTicketMeta(raw)]
    })
  )

  const mergedSupportTickets = (supportTickets || []).map((ticket) => mergeSupportTicket(ticket, supportMetaMap[String(ticket.id)] || {}))
  const staffRows = staff || []
  const staffByEmail = Object.fromEntries(
    staffRows.map((row) => [String(row.user_email || '').toLowerCase(), row])
  )
  const docsByEmail = groupByEmail(documents || [], 'staff_email')
  const trainingRecords = (trainingRows || []).map((row) => createTrainingRecord({
    id: String(row.key || '').replace('training_record:', ''),
    ...(row?.value?.value ?? row?.value ?? {}),
  }))
  const trainingByEmail = groupByEmail(trainingRecords, 'staff_email')
  const lifecycleByEmail = Object.fromEntries(
    (lifecycleRows || []).map((row) => {
      const email = String(row.key || '').replace('staff_lifecycle:', '').toLowerCase()
      const raw = row?.value?.value ?? row?.value ?? {}
      return [email, String(raw?.state || 'active').trim() || 'active']
    })
  )
  const activeComplianceRules = (complianceRules || []).map((row) => normalizeComplianceRule(row?.value?.value ?? row?.value ?? {})).filter((rule) => rule.active !== false)
  const complianceEvaluations = evaluateComplianceRulesForStaff(staffRows, activeComplianceRules, {
    docsByEmail,
    trainingByEmail,
    lifecycleByEmail,
  }).filter((row) => row.missingCount > 0)

  const storedClientLifecycle = Object.fromEntries(
    (clientLifecycleRows || []).map((row) => {
      const clientId = String(row.key || '').replace('client_lifecycle:', '')
      return [clientId, createClientLifecycle(row?.value?.value ?? row?.value ?? {})]
    })
  )
  const invoiceMap = groupByEmail(invoiceRows || [], 'client_email')
  const supportTicketMap = groupByEmail(ticketRows || [], 'client_email')
  const paymentMap = groupByEmail(paymentRows || [], 'client_email')
  const clientLifecycle = (clients || []).map((client) => {
    const email = String(client.email || '').toLowerCase()
    const derived = deriveClientLifecycleSignals({
      client,
      outreachRows: outreachRows || [],
      invoices: invoiceMap[email] || [],
      tickets: supportTicketMap[email] || [],
      payments: paymentMap[email] || [],
    })
    return {
      client,
      lifecycle: createClientLifecycle({
        client_id: client.id,
        ...derived,
        ...(storedClientLifecycle[String(client.id)] || {}),
      }),
    }
  })

  return {
    supportTickets: mergedSupportTickets,
    staff: staffRows,
    staffByEmail,
    complianceEvaluations,
    trainingRecords,
    trainingByEmail,
    lifecycleByEmail,
    clientLifecycle,
  }
}

export function evaluateWorkflowRule(rule = {}, context = {}) {
  if (rule.active === false) return []

  if (rule.trigger_type === 'support_breached') {
    return (context.supportTickets || [])
      .filter((ticket) => ticket.workflow_status !== 'resolved' && getSupportSlaState(ticket) === 'breached')
      .map((ticket) => createIncidentBase(rule, {
        id: `support:${ticket.id}`,
        link: '/support',
        title: ticket.subject || ticket.client_name || 'Support ticket',
        subject: 'Support SLA breached',
        message: `${ticket.subject || 'Support ticket'} for ${ticket.client_name || ticket.client_email || 'this client'} has breached SLA and needs attention.`,
        recipient_hint: ticket.assignee_name || ticket.assignee_email || 'Assigned handler',
        metadata: {
          ticket_id: ticket.id,
          assignee_email: String(ticket.assignee_email || '').toLowerCase(),
          assignee_name: ticket.assignee_name || '',
          client_name: ticket.client_name || '',
          client_email: ticket.client_email || '',
        },
      }))
  }

  if (rule.trigger_type === 'training_overdue') {
    return (context.trainingRecords || [])
      .filter((record) => record.mandatory === true && record.due_date && !['completed'].includes(String(record.status || '').toLowerCase()) && new Date(`${record.due_date}T23:59:59`).getTime() <= Date.now())
      .map((record) => {
        const profile = context.staffByEmail?.[String(record.staff_email || '').toLowerCase()] || {}
        return createIncidentBase(rule, {
          id: `training:${record.id}`,
          link: `/my-staff/${encodeURIComponent(String(record.staff_email || '').toLowerCase())}`,
          title: record.title || 'Mandatory training',
          subject: 'Mandatory training overdue',
          message: `${record.staff_name || profile.full_name || record.staff_email} is overdue on ${record.title || 'mandatory training'}${record.due_date ? ` (due ${new Date(record.due_date).toLocaleDateString('en-GB')})` : ''}.`,
          recipient_hint: profile.manager_name || record.manager_name || record.staff_name || record.staff_email,
          metadata: {
            training_id: record.id,
            staff_email: String(record.staff_email || '').toLowerCase(),
            staff_name: record.staff_name || profile.full_name || '',
            manager_email: String(record.manager_email || profile.manager_email || '').toLowerCase(),
            manager_name: record.manager_name || profile.manager_name || '',
            category: getTrainingCategoryLabel(record.category),
          },
        })
      })
  }

  if (rule.trigger_type === 'compliance_gap') {
    return (context.complianceEvaluations || []).map((row) => {
      const profile = row.profile || {}
      return createIncidentBase(rule, {
        id: `compliance:${String(profile.user_email || '').toLowerCase()}`,
        link: `/my-staff/${encodeURIComponent(String(profile.user_email || '').toLowerCase())}`,
        title: profile.full_name || profile.user_email || 'Staff member',
        subject: 'Compliance gap detected',
        message: `${profile.full_name || profile.user_email} has ${row.missingCount} compliance item${row.missingCount === 1 ? '' : 's'} missing across active rules.`,
        recipient_hint: profile.manager_name || profile.full_name || profile.user_email,
        metadata: {
          staff_email: String(profile.user_email || '').toLowerCase(),
          staff_name: profile.full_name || '',
          manager_email: String(profile.manager_email || '').toLowerCase(),
          manager_name: profile.manager_name || '',
          missing_count: row.missingCount,
        },
      })
    })
  }

  if (rule.trigger_type === 'client_risk') {
    const threshold = rule.min_client_health === 'high_risk' ? new Set(['high_risk']) : new Set(['watch', 'high_risk'])
    return (context.clientLifecycle || [])
      .filter((row) => threshold.has(String(row.lifecycle?.health || '').trim()))
      .map((row) => createIncidentBase(rule, {
        id: `client:${row.client?.id}`,
        link: `/clients/${row.client?.id}`,
        title: row.client?.name || 'Client account',
        subject: 'Client risk detected',
        message: `${row.client?.name || row.client?.email || 'This client'} is flagged as ${String(row.lifecycle?.health || 'watch').replace('_', ' ')}. ${row.lifecycle?.summary || ''}`.trim(),
        recipient_hint: rule.recipient_name || rule.recipient_email || 'Assigned recipient',
        metadata: {
          client_id: row.client?.id,
          client_email: String(row.client?.email || '').toLowerCase(),
          health: row.lifecycle?.health || '',
          stage: row.lifecycle?.stage || '',
        },
      }))
  }

  return []
}

export function resolveWorkflowRecipient(rule = {}, incident = {}) {
  const mode = rule.recipient_mode || 'auto'
  const manual = {
    email: String(rule.recipient_email || '').toLowerCase(),
    name: String(rule.recipient_name || '').trim(),
  }
  const metadata = incident.metadata || {}
  const derived = {
    support_assignee: {
      email: String(metadata.assignee_email || '').toLowerCase(),
      name: String(metadata.assignee_name || '').trim(),
    },
    manager: {
      email: String(metadata.manager_email || '').toLowerCase(),
      name: String(metadata.manager_name || '').trim(),
    },
    staff: {
      email: String(metadata.staff_email || '').toLowerCase(),
      name: String(metadata.staff_name || '').trim(),
    },
  }

  if (mode === 'manual') return manual
  if (mode === 'manager') return derived.manager.email ? derived.manager : manual
  if (mode === 'staff') return derived.staff.email ? derived.staff : manual
  if (mode === 'support_assignee') return derived.support_assignee.email ? derived.support_assignee : manual

  if (rule.trigger_type === 'support_breached' && derived.support_assignee.email) return derived.support_assignee
  if ((rule.trigger_type === 'training_overdue' || rule.trigger_type === 'compliance_gap') && derived.manager.email) return derived.manager
  if (rule.trigger_type === 'training_overdue' && derived.staff.email) return derived.staff
  return manual
}

export function createWorkflowRunRecord(record = {}) {
  return {
    id: String(record.id || fallbackId('workflow-run')).trim(),
    created_at: String(record.created_at || new Date().toISOString()),
    created_by_email: String(record.created_by_email || '').trim().toLowerCase(),
    created_by_name: String(record.created_by_name || '').trim(),
    preview_only: record.preview_only === true,
    totals: record.totals || { matches: 0, sent: 0, skipped: 0, failed: 0 },
    incidents: Array.isArray(record.incidents) ? record.incidents : [],
  }
}
