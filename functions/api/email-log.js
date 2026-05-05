const DEFAULT_ALLOWED_ORIGINS = [
  'https://staff.dhwebsiteservices.co.uk',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

const MAX_LIMIT = 500
const DEFAULT_SELECT = 'id,sent_at,sent_by,sent_by_email,sent_to,subject,body,from_address,template_used'

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
  return Math.max(1, Math.min(max, parsed))
}

function normalizeSelect(value) {
  const candidate = String(value || '').trim()
  if (!candidate) return DEFAULT_SELECT
  if (!/^[a-z_,*]+$/i.test(candidate)) {
    throw new Error('Invalid select clause.')
  }
  return candidate
}

async function supabaseFetch(env, path) {
  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Supabase request failed (${response.status}): ${errorText}`)
  }

  return response.json().catch(() => [])
}

export async function onRequestGet(context) {
  if (!isAllowedOrigin(context.request, context.env)) {
    return json({ error: 'Origin is not allowed.' }, 403)
  }

  if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ logs: [], configured: false, error: 'Email log is not configured.' })
  }

  try {
    const url = new URL(context.request.url)
    const select = normalizeSelect(url.searchParams.get('select'))
    const limit = normalizeInteger(url.searchParams.get('limit'), 200)

    const params = new URLSearchParams({
      select,
      order: 'sent_at.desc',
      limit: String(limit),
    })

    const rows = await supabaseFetch(context.env, `/rest/v1/email_log?${params.toString()}`)
    return json({ logs: Array.isArray(rows) ? rows : [] })
  } catch (error) {
    console.warn('Email log fetch failed:', error)
    return json({ logs: [], configured: false, error: error?.message || 'email_log_fetch_failed' })
  }
}
