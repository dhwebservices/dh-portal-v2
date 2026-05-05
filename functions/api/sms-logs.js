const DEFAULT_ALLOWED_ORIGINS = [
  'https://staff.dhwebsiteservices.co.uk',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

const MAX_LIMIT = 50

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
    return json({ error: 'SMS logs are not configured.' }, 500)
  }

  const url = new URL(context.request.url)
  const requestedLimit = Number(url.searchParams.get('limit') || 12)
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(MAX_LIMIT, requestedLimit)) : 12

  try {
    const params = new URLSearchParams({
      select: 'recipient_name,recipient_phone,category,status,created_at,sender_id,message',
      order: 'created_at.desc',
      limit: String(limit),
    })
    const rows = await supabaseFetch(context.env, `/rest/v1/sms_logs?${params.toString()}`)
    return json({ logs: Array.isArray(rows) ? rows : [] })
  } catch (error) {
    console.warn('SMS log fetch failed:', error)
    return json({ error: error?.message || 'sms_log_fetch_failed' }, 500)
  }
}
