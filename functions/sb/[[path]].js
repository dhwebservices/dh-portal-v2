/**
 * The portal's only way into the database.
 *
 * The browser and the phone app used to talk to Supabase directly with the
 * public anon key, which meant every table had to be open to anyone holding
 * that key - and the key ships inside every page we serve. Now they talk to
 * this route instead:
 *
 *   1. The caller must send a Microsoft Entra ID token from our tenant
 *      (verified properly: signature, issuer, audience, expiry).
 *   2. We forward the request to Supabase with the server-side key.
 *
 * So the anon key no longer opens anything private, and the tables can be
 * locked down. Only the REST and storage APIs are reachable through here.
 * Public storage files are redirected so <img src> keeps working without a
 * token.
 */
import { verifyEntraToken } from '../api/_portalAuth.js'

const ALLOWED_ORIGINS = new Set([
  'https://staff.dhwebsiteservices.co.uk',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  'http://localhost:5173',
])

const PASS_HEADERS = [
  'accept', 'accept-profile', 'content-profile', 'content-type', 'prefer', 'range',
  'range-unit', 'x-client-info', 'x-upsert', 'cache-control', 'if-none-match',
]

function corsHeaders(request) {
  const origin = request.headers.get('origin') || ''
  const allowed = ALLOWED_ORIGINS.has(origin) || /^https:\/\/[a-z0-9-]+\.dh-portal-v2\.pages\.dev$/.test(origin)
  if (!allowed) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': ['authorization', 'apikey', ...PASS_HEADERS].join(', '),
    'Access-Control-Expose-Headers': 'content-range, content-location, content-type, etag, preference-applied',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

function deny(request, status, message) {
  return new Response(JSON.stringify({ message, code: status === 401 ? 'PGRST301' : 'DH403' }), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  })
}

export async function onRequest(context) {
  const { request, env, params } = context
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })

  const parts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean)
  const path = parts.map(encodeURIComponent).join('/')
  const url = new URL(request.url)

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return deny(request, 500, 'Database is not configured.')

  // Public bucket files: no token needed, send the browser straight to Supabase.
  if (/^storage\/v1\/object\/public\//.test(path) && (request.method === 'GET' || request.method === 'HEAD')) {
    return Response.redirect(`${env.SUPABASE_URL}/${path}${url.search}`, 302)
  }

  if (!/^(rest\/v1|storage\/v1)(\/|$)/.test(path)) return deny(request, 404, 'Not found.')

  const auth = request.headers.get('authorization') || ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) return deny(request, 401, 'Sign-in required.')
  try {
    await verifyEntraToken(token, env)
  } catch (error) {
    return deny(request, 401, error.message || 'Sign-in could not be verified.')
  }

  const headers = new Headers()
  for (const name of PASS_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('apikey', env.SUPABASE_SERVICE_ROLE_KEY)
  headers.set('Authorization', `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`)

  const hasBody = !['GET', 'HEAD'].includes(request.method)
  const upstream = await fetch(`${env.SUPABASE_URL}/${path}${url.search}`, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
  })

  const out = new Headers(upstream.headers)
  for (const [k, v] of Object.entries(corsHeaders(request))) out.set(k, v)
  out.set('Cache-Control', 'no-store')
  return new Response(upstream.body, { status: upstream.status, headers: out })
}
