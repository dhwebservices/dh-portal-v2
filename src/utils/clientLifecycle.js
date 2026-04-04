export const CLIENT_LIFECYCLE_STAGES = [
  ['lead', 'Lead'],
  ['proposal', 'Proposal'],
  ['won', 'Won'],
  ['onboarding', 'Onboarding'],
  ['active', 'Active'],
  ['payment_risk', 'Payment risk'],
  ['support_risk', 'Support risk'],
  ['at_risk', 'At risk'],
]

export function buildClientLifecycleKey(id = '') {
  return `client_lifecycle:${String(id || '').trim()}`
}

export function createClientLifecycle(record = {}) {
  return {
    client_id: String(record.client_id || '').trim(),
    stage: CLIENT_LIFECYCLE_STAGES.some(([key]) => key === record.stage) ? record.stage : 'active',
    health: String(record.health || 'stable').trim(),
    summary: String(record.summary || '').trim(),
    risk_flags: Array.isArray(record.risk_flags) ? record.risk_flags.map((item) => String(item || '').trim()).filter(Boolean) : [],
    updated_at: String(record.updated_at || new Date().toISOString()),
    updated_by: String(record.updated_by || '').trim(),
  }
}

export function deriveClientLifecycleSignals({ client = {}, outreachRows = [], invoices = [], tickets = [], payments = [] } = {}) {
  const clientEmail = String(client.email || '').toLowerCase()
  const matchingOutreach = outreachRows.filter((row) => String(row.email || '').toLowerCase() === clientEmail)
  const latestOutreach = matchingOutreach[0] || null
  const openTickets = tickets.filter((ticket) => String(ticket.status || '').toLowerCase() === 'open')
  const unpaidInvoices = invoices.filter((invoice) => String(invoice.status || '').toLowerCase() !== 'paid')
  const overdueInvoices = unpaidInvoices.filter((invoice) => invoice.due_date && new Date(invoice.due_date).getTime() < Date.now())
  const recentPayments = payments.filter((payment) => ['paid_out', 'confirmed', 'paid'].includes(String(payment.status || '').toLowerCase()))

  let stage = 'active'
  if (String(client.status || '').toLowerCase() === 'pending') stage = 'onboarding'
  if (overdueInvoices.length) stage = 'payment_risk'
  else if (openTickets.length >= 2) stage = 'support_risk'
  else if (openTickets.length || unpaidInvoices.length) stage = 'at_risk'

  if (latestOutreach?.status === 'converted') stage = 'won'
  else if (latestOutreach?.status === 'interested' || latestOutreach?.status === 'follow_up') stage = 'proposal'

  const riskFlags = []
  if (overdueInvoices.length) riskFlags.push('Overdue invoices')
  if (openTickets.length) riskFlags.push(`${openTickets.length} open support ticket${openTickets.length === 1 ? '' : 's'}`)
  if (!recentPayments.length && unpaidInvoices.length) riskFlags.push('No recent paid invoice recorded')

  const health = overdueInvoices.length || openTickets.length >= 2 ? 'high_risk' : openTickets.length || unpaidInvoices.length ? 'watch' : 'stable'

  return {
    stage,
    health,
    risk_flags: riskFlags,
    summary: riskFlags.length ? riskFlags.join(' · ') : 'Account looks steady right now.',
  }
}
