const CLICKSEND_SMS_URL = 'https://rest.clicksend.com/v3/sms/send'
const DEFAULT_PROVIDER = 'clicksend'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function normalizeSenderId(value = '') {
  const sender = String(value || '').replace(/\s+/g, '').trim()
  if (!sender) return ''
  if (!/^[A-Za-z0-9]{3,11}$/.test(sender)) {
    throw new Error('Sender ID must be 3-11 alphanumeric characters with no spaces.')
  }
  return sender
}

function normalizePhone(value = '') {
  const raw = String(value || '').trim()
  const cleaned = raw.replace(/[^\d+]/g, '')
  if (!cleaned) return ''
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`
  if (cleaned.startsWith('44')) return `+${cleaned}`
  if (cleaned.startsWith('0')) return `+44${cleaned.slice(1)}`
  return `+${cleaned}`
}

function basicAuth(username, password) {
  return `Basic ${btoa(`${username}:${password}`)}`
}

async function insertLogs(env, rows) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !rows.length) return

  await fetch(`${env.SUPABASE_URL}/rest/v1/sms_logs`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  }).catch(() => {})
}

export async function onRequestPost(context) {
  let payload

  try {
    payload = await context.request.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  const username = context.env.CLICKSEND_USERNAME
  const apiKey = context.env.CLICKSEND_API_KEY
  const senderId = normalizeSenderId(context.env.CLICKSEND_SENDER_ID || 'DHPortal')

  if (!username || !apiKey) {
    return json({ error: 'SMS provider is not configured.' }, 500)
  }

  const messages = Array.isArray(payload?.messages) ? payload.messages : []
  const prepared = messages
    .map((message) => ({
      to: normalizePhone(message?.phone),
      body: String(message?.message || '').trim(),
      name: String(message?.name || '').trim(),
      email: String(message?.email || '').toLowerCase().trim(),
      category: String(message?.category || payload?.category || 'general').trim() || 'general',
    }))
    .filter((message) => message.to && message.body)

  if (!prepared.length) {
    return json({ error: 'No valid SMS messages to send.' }, 400)
  }

  const sentByEmail = String(payload?.sentByEmail || '').toLowerCase().trim()
  const sentByName = String(payload?.sentByName || '').trim()
  const audienceType = String(payload?.audienceType || 'manual').trim()
  const metadata = payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}

  const clicksendPayload = {
    messages: prepared.map((message) => ({
      source: 'javascript',
      to: message.to,
      body: message.body,
      from: senderId,
      custom_string: message.email || message.name || message.to,
    })),
  }

  const response = await fetch(CLICKSEND_SMS_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(username, apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(clicksendPayload),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    return json({ error: data?.response_msg || data?.error || 'SMS provider request failed.' }, 502)
  }

  const providerMessages = Array.isArray(data?.data?.messages) ? data.data.messages : []
  const createdAt = new Date().toISOString()
  const logRows = prepared.map((message, index) => {
    const providerMessage = providerMessages[index] || {}
    return {
      recipient_phone: message.to,
      recipient_name: message.name || null,
      recipient_email: message.email || null,
      sender_id: senderId,
      message: message.body,
      category: message.category,
      provider: DEFAULT_PROVIDER,
      provider_message_id: providerMessage.message_id || providerMessage.messageid || null,
      status: providerMessage.status || providerMessage.message_status || 'queued',
      sent_by_email: sentByEmail || null,
      sent_by_name: sentByName || null,
      audience_type: audienceType,
      metadata: {
        ...metadata,
        provider_response: providerMessage,
      },
      created_at: createdAt,
    }
  })

  await insertLogs(context.env, logRows)

  return json({
    success: true,
    senderId,
    count: prepared.length,
    provider: DEFAULT_PROVIDER,
  })
}
