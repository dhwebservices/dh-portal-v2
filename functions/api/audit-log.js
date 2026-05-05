const DEFAULT_ALLOWED_ORIGINS = [
  'https://staff.dhwebsiteservices.co.uk',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

const MAX_LIMIT = 500
const DEFAULT_SELECT = 'id,user_email,user_name,action,target,target_id,details,created_at'

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

function normalizeInteger(value, fallback, max = MAX_LIMIT) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(max, parsed))
}

function normalizeSelect(value) {
  const candidate = String(value || '').trim()
  if (!candidate) return DEFAULT_SELECT
  if (!/^[a-z_,*]+$/i.test(candidate)) {
    throw new Error('Invalid select clause.')
  }
  return candidate
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

export async function onRequestGet(context) {
  if (!isAllowedOrigin(context.request, context.env)) {
    return json({ error: 'Origin is not allowed.' }, 403)
  }

  if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Audit log is not configured.' }, 500)
  }

  try {
    const url = new URL(context.request.url)
    const select = normalizeSelect(url.searchParams.get('select'))
    const limit = normalizeInteger(url.searchParams.get('limit'), 50)
    const offset = normalizeInteger(url.searchParams.get('offset'), 0, 5000)
    const action = String(url.searchParams.get('action') || '').trim()
    const actionLike = String(url.searchParams.get('action_like') || '').trim()
    const search = String(url.searchParams.get('search') || '').trim()

    const params = new URLSearchParams({
      select,
      order: 'created_at.desc',
      limit: String(limit),
      offset: String(offset),
    })

    if (action) params.set('action', `eq.${action}`)
    if (actionLike) params.set('action', `ilike.%${actionLike}%`)
    if (search) params.set('or', `user_name.ilike.%${search}%,action.ilike.%${search}%,target.ilike.%${search}%`)

    const rows = await supabaseFetch(context.env, `/rest/v1/audit_log?${params.toString()}`)
    return json({ logs: Array.isArray(rows) ? rows : [] })
  } catch (error) {
    console.warn('Audit log fetch failed:', error)
    return json({ error: error?.message || 'audit_log_fetch_failed' }, 500)
  }
}

export async function onRequestPost(context) {
  if (!isAllowedOrigin(context.request, context.env)) {
    return json({ error: 'Origin is not allowed.' }, 403)
  }

  if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Audit log is not configured.' }, 500)
  }

  let payload
  try {
    payload = await context.request.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  const row = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null
  if (!row) {
    return json({ error: 'Invalid audit payload.' }, 400)
  }

  try {
    await supabaseFetch(context.env, '/rest/v1/audit_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([row]),
    })
    return json({ ok: true })
  } catch (error) {
    console.warn('Audit log write failed:', error)
    return json({ error: error?.message || 'audit_log_write_failed' }, 500)
  }
}

export async function onRequestDelete(context) {
  if (!isAllowedOrigin(context.request, context.env)) {
    return json({ error: 'Origin is not allowed.' }, 403)
  }

  if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Audit log is not configured.' }, 500)
  }

  const url = new URL(context.request.url)
  const before = String(url.searchParams.get('before') || '').trim()
  if (!before) {
    return json({ error: 'Missing before cutoff.' }, 400)
  }

  try {
    await supabaseFetch(context.env, `/rest/v1/audit_log?created_at=lt.${encodeURIComponent(before)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })
    return json({ ok: true })
  } catch (error) {
    console.warn('Audit log delete failed:', error)
    return json({ error: error?.message || 'audit_log_delete_failed' }, 500)
  }
}
