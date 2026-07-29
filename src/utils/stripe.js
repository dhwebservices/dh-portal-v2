const WORKER = '/api/stripe'

async function call(type, data) {
  const res = await fetch(WORKER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, data }),
  })
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error || 'Stripe request failed')
  return json
}

export async function createPaymentLink(amount, description, customerEmail, proposalId, metadata = {}) {
  return call('create_payment_link', {
    amount,
    currency: 'gbp',
    description,
    customer_email: customerEmail,
    proposal_id: proposalId,
    metadata,
  })
}

export async function getPaymentStatus(paymentIntentId) {
  return call('get_payment_status', { payment_intent_id: paymentIntentId })
}
