const DEFAULT_ALLOWED_ORIGINS = [
  'https://staff.dhwebsiteservices.co.uk',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

const MAX_SOURCE_ID_LENGTH = 120
const MAX_JOB_TYPE_LENGTH = 80
const MAX_SOURCE_TABLE_LENGTH = 80
const MAX_PAYLOAD_BYTES = 24 * 1024

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

function normalizeText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const encoded = JSON.stringify(value)
  if (encoded.length > MAX_PAYLOAD_BYTES) {
    throw new Error('Payload exceeds maximum size.')
  }
  return value
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

export async function onRequestPost(context) {
  if (!isAllowedOrigin(context.request, context.env)) {
    return json({ error: 'Origin is not allowed.' }, 403)
  }

  if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Calendar sync queue is not configured.' }, 500)
  }

  let payload
  try {
    payload = await context.request.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  const staffEmail = normalizeText(payload?.staffEmail, 160).toLowerCase()
  const jobType = normalizeText(payload?.jobType, MAX_JOB_TYPE_LENGTH)
  const sourceTable = normalizeText(payload?.sourceTable, MAX_SOURCE_TABLE_LENGTH)
  const sourceId = normalizeText(payload?.sourceId, MAX_SOURCE_ID_LENGTH)
  const direction = normalizeText(payload?.direction || 'portal_to_microsoft', 40) || 'portal_to_microsoft'

  if (!staffEmail || !jobType || !sourceTable || !sourceId) {
    return json({ queued: false, reason: 'missing_fields' }, 400)
  }

  let normalizedPayload
  try {
    normalizedPayload = normalizePayload(payload?.payload)
  } catch (error) {
    return json({ queued: false, reason: error?.message || 'invalid_payload' }, 400)
  }

  const now = new Date().toISOString()
  const query = new URLSearchParams({
    select: 'id,status',
    staff_email: `eq.${staffEmail}`,
    job_type: `eq.${jobType}`,
    source_table: `eq.${sourceTable}`,
    source_id: `eq.${sourceId}`,
    status: 'eq.pending',
    order: 'created_at.desc',
    limit: '1',
  })

  try {
    const existingRows = await supabaseFetch(context.env, `/rest/v1/microsoft_calendar_sync_jobs?${query.toString()}`)
    const existing = Array.isArray(existingRows) ? existingRows[0] : null

    if (existing?.id) {
      await supabaseFetch(context.env, `/rest/v1/microsoft_calendar_sync_jobs?id=eq.${encodeURIComponent(existing.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          payload: normalizedPayload,
          direction,
          available_at: now,
          updated_at: now,
          last_error: null,
        }),
      })

      return json({ queued: true, updated: true, id: existing.id })
    }

    const createdRows = await supabaseFetch(context.env, '/rest/v1/microsoft_calendar_sync_jobs?select=id', {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify([{
        staff_email: staffEmail,
        job_type: jobType,
        source_table: sourceTable,
        source_id: sourceId,
        payload: normalizedPayload,
        direction,
        status: 'pending',
        attempts: 0,
        available_at: now,
        created_at: now,
        updated_at: now,
      }]),
    })

    const created = Array.isArray(createdRows) ? createdRows[0] : createdRows
    return json({ queued: true, created: true, id: created?.id || null })
  } catch (error) {
    console.warn('Microsoft calendar sync enqueue failed:', error)
    return json({ queued: false, error: error?.message || 'queue_failed' }, 500)
  }
}
