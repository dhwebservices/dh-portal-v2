const DEFAULT_ALLOWED_ORIGINS = [
  'https://staff.dhwebsiteservices.co.uk',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

const DEFAULT_EMAIL_WORKER_URL = 'https://dh-email-worker.aged-silence-66a7.workers.dev'
const OUTREACH_NOTES_META_PREFIX = '[dh-outreach-meta]'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function getAllowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS)
}

function resolveRequestOrigin(request) {
  const origin = request.headers.get('origin')
  if (origin) return origin
  const referer = request.headers.get('referer')
  if (!referer) return ''
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

function isAllowedOrigin(request, env) {
  const origin = resolveRequestOrigin(request)
  if (!origin) return false
  return getAllowedOrigins(env).has(origin)
}

function normalizeEmail(value = '') {
  return String(value || '').toLowerCase().trim()
}

function buildOutreachAutoLogNotes({
  creatorEmail = '',
  creatorName = '',
  creatorDepartment = '',
  plainNotes = '',
} = {}) {
  const safeCreatorEmail = normalizeEmail(creatorEmail)
  const safeCreatorName = String(creatorName || '').trim()
  const safePlainNotes = String(plainNotes || '').trim()
  const meta = {
    outcome: 'none',
    follow_up_date: '',
    history: [{
      action: 'created',
      value: 'Lead auto-logged from email',
      actor: safeCreatorName || safeCreatorEmail || 'System',
      at: new Date().toISOString(),
    }],
    assigned_to_email: safeCreatorEmail,
    assigned_to_name: safeCreatorName,
    creator_email: safeCreatorEmail,
    creator_department: String(creatorDepartment || '').trim(),
    reminder_notice_key: '',
  }
  const metaBlock = `${OUTREACH_NOTES_META_PREFIX} ${JSON.stringify(meta)}`
  return safePlainNotes ? `${metaBlock}\n${safePlainNotes}` : metaBlock
}

function normalizeEmailPayload(type, data = {}) {
  if (type !== 'send_email') {
    return { type, data, originalType: type }
  }

  return {
    type: 'custom_email',
    originalType: type,
    data: {
      to: data.to || data.to_email,
      from_email: data.from_email,
      subject: data.subject,
      html: data.html || (data.text ? data.text.replace(/\n/g, '<br/>') : ''),
      text: data.text || '',
      reply_to: data.reply_to || data.from_email || undefined,
      to_name: data.to_name,
      from_name: data.from_name,
    },
  }
}

async function supabaseFetch(env, path, options = {}) {
  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Supabase request failed (${response.status}): ${errorText}`)
  }

  if (response.status === 204) return null
  return response.json().catch(() => null)
}

async function logEmailIfRequested(env, originalData = {}, normalizedPayload = {}) {
  if (!originalData?.log_email) return false

  const toValue = originalData.to || originalData.to_email || normalizedPayload?.data?.to || normalizedPayload?.data?.to_email || ''
  const sentTo = Array.isArray(toValue)
    ? toValue.map((value) => String(value || '').trim()).filter(Boolean)
    : String(toValue || '').trim()
      ? [String(toValue || '').trim()]
      : []

  if (!sentTo.length) return false

  const row = {
    sent_by: String(originalData.sent_by || '').trim() || null,
    sent_by_email: normalizeEmail(originalData.sent_by_email || ''),
    sent_to: sentTo,
    subject: String(originalData.subject || normalizedPayload?.data?.subject || '').trim() || null,
    body: String(originalData.log_body || originalData.text || '').trim() || null,
    from_address: String(originalData.log_from_address || originalData.from_email || normalizedPayload?.data?.from_email || '').trim() || null,
    template_used: originalData.template_id || null,
    sent_at: new Date().toISOString(),
  }

  await supabaseFetch(env, '/rest/v1/email_log', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([row]),
  })

  return true
}

async function autoLogOutreachIfNeeded(env, normalizedPayload = {}, originalData = {}) {
  if (normalizedPayload?.type !== 'outreach_contact') return false
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false

  const targetEmail = normalizeEmail(normalizedPayload?.data?.to_email || normalizedPayload?.data?.to || '')
  if (!targetEmail) return false

  const sourceEmail = normalizeEmail(normalizedPayload?.data?.sent_by_email || normalizedPayload?.data?.reply_to || originalData?.sent_by_email || '')
  const sourceName = String(normalizedPayload?.data?.sent_by || normalizedPayload?.data?.from_name || originalData?.sent_by || '').trim()

  await supabaseFetch(env, '/rest/v1/outreach', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{
      business_name: normalizedPayload?.data?.business_name || targetEmail,
      contact_name: normalizedPayload?.data?.contact_name || '',
      email: targetEmail,
      website: normalizedPayload?.data?.website || '',
      status: 'contacted',
      notes: buildOutreachAutoLogNotes({
        creatorEmail: sourceEmail,
        creatorName: sourceName,
        creatorDepartment: normalizedPayload?.data?.creator_department || '',
        plainNotes: `Auto-logged from email sent on ${new Date().toLocaleDateString('en-GB')}`,
      }),
      added_by: sourceName || sourceEmail || 'System',
      created_at: new Date().toISOString(),
    }]),
  })

  return true
}

export async function onRequestPost(context) {
  if (!isAllowedOrigin(context.request, context.env)) {
    return json({ error: 'Origin is not allowed.' }, 403)
  }

  let payload
  try {
    payload = await context.request.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  const type = String(payload?.type || '').trim()
  const data = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : {}
  if (!type) {
    return json({ error: 'Missing email type.' }, 400)
  }

  const normalizedPayload = normalizeEmailPayload(type, data)
  const workerUrl = String(context.env.EMAIL_WORKER_URL || DEFAULT_EMAIL_WORKER_URL).trim()
  if (!workerUrl) {
    return json({ error: 'Email worker is not configured.' }, 500)
  }

  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizedPayload),
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok || result?.error) {
      throw new Error(result?.error || 'Worker request failed')
    }

    let emailLogged = false
    let outreachLogged = false

    if (context.env.SUPABASE_URL && context.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        emailLogged = await logEmailIfRequested(context.env, data, normalizedPayload)
      } catch (error) {
        console.warn('Email log write failed:', error)
      }

      try {
        outreachLogged = await autoLogOutreachIfNeeded(context.env, normalizedPayload, data)
      } catch (error) {
        console.warn('Outreach auto-log failed:', error)
      }
    }

    return json({ ok: true, result, emailLogged, outreachLogged, status: response.status })
  } catch (error) {
    console.warn('Email send failed:', error)
    return json({ ok: false, error: error?.message || 'email_send_failed' }, 502)
  }
}
