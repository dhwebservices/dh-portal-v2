export async function onRequest(context) {
  const { request, env } = context
  const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY
  const STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET

  const corsHeaders = {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, stripe-signature',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(request.url)

  if (url.pathname.endsWith('/webhook')) {
    return handleWebhook(request, env, corsHeaders)
  }

  return handleApiCall(request, env, corsHeaders)
}

async function handleApiCall(request, env, corsHeaders) {
  try {
    const { type, data } = await request.json()

    if (type === 'create_payment_link') {
      return createPaymentLink(data, env, corsHeaders)
    }

    if (type === 'get_payment_status') {
      return getPaymentStatus(data, env, corsHeaders)
    }

    return new Response(
      JSON.stringify({ error: 'Invalid request type' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function createPaymentLink(data, env, corsHeaders) {
  const { amount, currency = 'gbp', description, customer_email, proposal_id, metadata = {} } = data

  if (!env.STRIPE_SECRET_KEY) {
    return new Response(
      JSON.stringify({ error: 'Stripe API key not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const params = new URLSearchParams({
    'line_items[0][price_data][currency]': currency,
    'line_items[0][price_data][product_data][name]': description || 'Website Services',
    'line_items[0][price_data][unit_amount]': Math.round(amount * 100),
    'line_items[0][quantity]': '1',
    'after_completion[type]': 'hosted_confirmation',
    'after_completion[hosted_confirmation][custom_message]': 'Thank you! DH Website Services will be in touch shortly.',
  })

  if (proposal_id) params.append('metadata[proposal_id]', proposal_id)
  if (customer_email) params.append('metadata[customer_email]', customer_email)

  for (const [key, value] of Object.entries(metadata)) {
    params.append(`metadata[${key}]`, String(value))
  }

  const response = await fetch('https://api.stripe.com/v1/payment_links', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

  const result = await response.json()

  if (!response.ok) {
    return new Response(
      JSON.stringify({ error: result.error?.message || 'Stripe API error' }),
      { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({
      id: result.id,
      url: result.url,
      payment_intent_id: result.payment_intent
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function getPaymentStatus(data, env, corsHeaders) {
  const { payment_intent_id } = data

  if (!payment_intent_id) {
    return new Response(
      JSON.stringify({ error: 'payment_intent_id required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const response = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}`, {
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    return new Response(
      JSON.stringify({ error: result.error?.message || 'Stripe API error' }),
      { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({
      status: result.status,
      amount: result.amount,
      currency: result.currency,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleWebhook(request, env, corsHeaders) {
  try {
    const body = await request.text()
    const event = JSON.parse(body)

    await logStripeEvent(event, env)

    if (event.type === 'checkout.session.completed' ||
        event.type === 'payment_intent.succeeded') {
      await processPaymentSuccess(event, env)
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function logStripeEvent(event, env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Supabase credentials not configured')
    return
  }

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/stripe_events`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        event_id: event.id,
        event_type: event.type,
        payment_intent_id: event.data?.object?.payment_intent || event.data?.object?.id,
        amount: (event.data?.object?.amount_total || event.data?.object?.amount) / 100,
        currency: event.data?.object?.currency,
        customer_email: event.data?.object?.customer_details?.email || event.data?.object?.customer_email,
        raw_event: event,
        processed: false,
      }),
    })
  } catch (err) {
    console.error('Failed to log Stripe event:', err)
  }
}

async function processPaymentSuccess(event, env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

  const metadata = event.data?.object?.metadata || {}
  const proposalId = metadata.proposal_id
  const customerEmail = metadata.customer_email || event.data?.object?.customer_details?.email
  const paymentIntentId = event.data?.object?.payment_intent || event.data?.object?.id

  if (!proposalId) {
    console.log('No proposal_id in metadata, skipping commission creation')
    return
  }

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/proposals?id=eq.${proposalId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: paymentIntentId,
      }),
    })

    const proposalRes = await fetch(`${SUPABASE_URL}/rest/v1/proposals?id=eq.${proposalId}`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })
    const proposals = await proposalRes.json()
    const proposal = proposals[0]

    if (!proposal) {
      console.error('Proposal not found:', proposalId)
      return
    }

    const staffRes = await fetch(`${SUPABASE_URL}/rest/v1/commission_settings?staff_email=eq.${proposal.assigned_to_email}`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })
    const staffSettings = await staffRes.json()
    const commissionRate = staffSettings[0]?.commission_rate || 10

    const commissionAmount = (proposal.payment_amount * commissionRate) / 100

    await fetch(`${SUPABASE_URL}/rest/v1/commissions`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        staff_name: proposal.assigned_to_name,
        staff_email: proposal.assigned_to_email,
        client: proposal.client_business,
        client_name: proposal.client_name,
        source_type: 'stripe_payment',
        source_id: paymentIntentId,
        description: `Website proposal - ${proposal.selected_build?.name || 'Package'}`,
        sale_value: proposal.payment_amount,
        commission_rate: commissionRate,
        commission_amount: commissionAmount,
        date: new Date().toISOString().split('T')[0],
        status: 'available',
      }),
    })

    await fetch(`${SUPABASE_URL}/rest/v1/stripe_events?event_id=eq.${event.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        processed: true,
        processed_at: new Date().toISOString(),
        proposal_id: proposalId,
      }),
    })

    console.log(`✅ Processed payment for proposal ${proposalId}: £${proposal.payment_amount} → £${commissionAmount} commission`)
  } catch (err) {
    console.error('Failed to process payment success:', err)
  }
}
