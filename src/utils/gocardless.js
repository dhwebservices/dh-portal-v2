/**
 * GoCardless API — all calls go through the Cloudflare Worker
 * The API key never touches the browser
 */

const WORKER = 'https://dh-email-worker.aged-silence-66a7.workers.dev'

async function call(type, data) {
  const res = await fetch(WORKER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, data }),
  })
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error || 'Worker request failed')
  return json
}

/** Set up a Direct Debit mandate — returns { redirect_url, billing_request_id, customer_id } */
export async function setupMandate(clientEmail, clientName) {
  const [given_name, ...rest] = (clientName || '').trim().split(/\s+/)
  const family_name = rest.join(' ') || 'Client'

  const customer = await call('gc_create_customer', {
    email: clientEmail,
    given_name: given_name || 'Client',
    family_name,
  })

  const billingRequest = await call('gc_create_billing_request', {
    customer_id: customer.customers?.id || customer.id,
  })

  const billingRequestId = billingRequest.billing_requests?.id || billingRequest.id
  const flow = await call('gc_create_billing_request_flow', {
    billing_request_id: billingRequestId,
    redirect_uri: window.location.href,
  })

  return {
    redirect_url: flow.billing_request_flows?.authorisation_url || flow.authorisation_url,
    billing_request_id: billingRequestId,
    customer_id: customer.customers?.id || customer.id,
  }
}

/** Get all mandates for a GoCardless customer */
export async function getMandates(customerId) {
  return call('gc_list_mandates', { customer_id: customerId })
}

/** Create a one-off payment — amount in pounds e.g. 449 = £449 */
export async function createPayment(mandateId, amountPounds, description, reference) {
  return call('gc_create_payment', {
    mandate_id:   mandateId,
    amount_pence: Math.round(amountPounds * 100),
    description:  description || 'DH Website Services',
    reference:    reference   || 'DH-PAY',
  })
}

/** Create a recurring monthly subscription — amount in pounds */
export async function createSubscription(mandateId, amountPounds, name, dayOfMonth = 1) {
  return call('gc_create_subscription', {
    mandate_id:    mandateId,
    amount_pence:  Math.round(amountPounds * 100),
    name:          name || 'DH Website Services',
    interval_unit: 'monthly',
    day_of_month:  dayOfMonth,
  })
}

/** Cancel a subscription */
export async function cancelSubscription(subscriptionId) {
  return call('gc_cancel_subscription', { subscription_id: subscriptionId })
}

/** List all payments for a mandate */
export async function getPayments(mandateId) {
  return call('gc_list_payments', { mandate_id: mandateId })
}

/** List all subscriptions for a mandate */
export async function getSubscriptions(mandateId) {
  return call('gc_list_subscriptions', { mandate_id: mandateId })
}

/** Badge colours for payment/mandate statuses */
export function paymentStatusColor(status) {
  return {
    pending_submission: 'amber', submitted: 'amber',
    confirmed: 'blue', paid_out: 'green',
    failed: 'red', cancelled: 'grey', charged_back: 'red',
  }[status] || 'grey'
}

export function mandateStatusColor(status) {
  return {
    active: 'green', pending_submission: 'amber',
    submitted: 'amber', cancelled: 'grey',
    failed: 'red', expired: 'grey',
  }[status] || 'grey'
}
