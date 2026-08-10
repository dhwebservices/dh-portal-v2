/**
 * Shared helpers for the automated appointment call flow.
 *
 * These endpoints are called by Twilio, not by the portal, so they cannot use
 * the Entra check in _portalAuth.js - Twilio has no way to obtain a token.
 * Instead every webhook verifies Twilio's own request signature, which proves
 * the request came from someone holding the account auth token. Without that
 * check anyone who guessed an appointment id could make the portal place calls.
 */

export const CALLER_ID_FALLBACK = '+442920024218'
export const AGENT_RING_SECONDS = 20
export const CUSTOMER_RING_SECONDS = 30

export function xml(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

/** Escapes text destined for a TwiML <Say>. Client names are user input. */
export function esc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * UK numbers to E.164. Same rules the portal already uses elsewhere, so a number
 * that works for SMS also works for voice.
 */
export function normalizePhone(value = '') {
  const cleaned = String(value || '').trim().replace(/[^\d+]/g, '')
  if (!cleaned) return ''
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`
  if (cleaned.startsWith('44')) return `+${cleaned}`
  if (cleaned.startsWith('0')) return `+44${cleaned.slice(1)}`
  return `+${cleaned}`
}

/**
 * Validates X-Twilio-Signature.
 *
 * Twilio builds the signature from the full request URL with, for form posts,
 * every POST parameter appended as key immediately followed by value in
 * alphabetical key order - then HMAC-SHA1 with the auth token, base64 encoded.
 *
 * Returns the parsed form parameters on success, or null if the request is not
 * genuinely from Twilio. Callers must treat null as a hard failure.
 */
export async function verifyTwilioRequest(request, env) {
  const authToken = env.TWILIO_AUTH_TOKEN
  if (!authToken) return null

  const signature = request.headers.get('X-Twilio-Signature')
  if (!signature) return null

  // Twilio signs the URL it was configured with. Cloudflare hands us the same
  // absolute URL, but force https so a proxied http hop cannot break the match.
  const url = new URL(request.url)
  url.protocol = 'https:'

  const params = {}
  if (request.method === 'POST') {
    const form = await request.formData()
    for (const [key, value] of form.entries()) params[key] = String(value)
  }

  let payload = url.toString()
  for (const key of Object.keys(params).sort()) payload += key + params[key]

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))

  if (!timingSafeEqual(expected, signature)) return null
  return params
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function supabaseFetch(env, path, options = {}) {
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
    throw new Error(`Supabase ${response.status}: ${await response.text()}`)
  }
  if (response.status === 204) return null
  return response.json().catch(() => null)
}

export async function getAppointment(env, id) {
  const rows = await supabaseFetch(
    env,
    `/rest/v1/appointments?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] || null : null
}

export async function patchAppointment(env, id, payload) {
  return supabaseFetch(env, `/rest/v1/appointments?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
  })
}

/** Places an outbound leg through the Twilio REST API. */
export async function placeCall(env, { to, answerUrl, statusUrl, timeout }) {
  const sid = env.TWILIO_ACCOUNT_SID
  const token = env.TWILIO_AUTH_TOKEN
  const from = env.TWILIO_CALLER_ID || CALLER_ID_FALLBACK
  if (!sid || !token) throw new Error('Twilio credentials are not configured.')

  const body = new URLSearchParams({
    To: to,
    From: from,
    Url: answerUrl,
    Method: 'POST',
    StatusCallback: statusUrl,
    StatusCallbackMethod: 'POST',
    Timeout: String(timeout ?? AGENT_RING_SECONDS),
  })
  // Only these two matter for the cascade; the rest are noise.
  body.append('StatusCallbackEvent', 'completed')

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    },
  )

  const result = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Twilio ${response.status}: ${result?.message || 'call failed'}`)
  }
  return result
}

/**
 * Builds the ordered list of people to try for an appointment.
 *
 * The assigned staff member is always first. Everyone else configured as a
 * fallback follows, in order. Anyone without a usable phone number is dropped
 * here rather than at dial time, so an empty list is a clear "nobody to ring"
 * signal instead of a silent failure.
 */
export async function buildEscalationList(env, appointment) {
  const [profiles, settings] = await Promise.all([
    supabaseFetch(env, '/rest/v1/hr_profiles?select=user_email,full_name,phone'),
    supabaseFetch(
      env,
      "/rest/v1/portal_settings?select=key,value&key=eq.appointment_call_escalation&limit=1",
    ),
  ])

  const byEmail = new Map()
  for (const row of Array.isArray(profiles) ? profiles : []) {
    const email = String(row.user_email || '').toLowerCase().trim()
    if (email) byEmail.set(email, row)
  }

  const configured = parseEscalation(settings)
  const assigned = String(appointment.staff_email || '').toLowerCase().trim()

  const ordered = []
  const seen = new Set()
  for (const email of [assigned, ...configured]) {
    const key = String(email || '').toLowerCase().trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    const profile = byEmail.get(key)
    const phone = normalizePhone(profile?.phone)
    if (!phone) continue
    ordered.push({ email: key, name: profile?.full_name || key, phone })
  }
  return ordered
}

/**
 * portal_settings stores jsonb wrapped as {"value": ...}, so the payload is one
 * level deeper than it looks. Unwrap it before checking for the array, or the
 * escalation list silently comes back empty and nobody is ever rung.
 */
function parseEscalation(settings) {
  let raw = Array.isArray(settings) ? settings[0]?.value : null
  if (!raw) return []
  try {
    if (typeof raw === 'string') raw = JSON.parse(raw)
    if (raw && !Array.isArray(raw) && 'value' in raw) raw = raw.value
    if (typeof raw === 'string') raw = JSON.parse(raw)
    if (Array.isArray(raw)) return raw.filter((item) => typeof item === 'string')
    if (Array.isArray(raw?.order)) return raw.order.filter((item) => typeof item === 'string')
    return []
  } catch {
    return []
  }
}

const DEFAULT_EMAIL_WORKER_URL = 'https://dh-email-worker.aged-silence-66a7.workers.dev'

/** Same email path the booking confirmation already uses. */
export async function sendWorkerEmail(env, { to, subject, html }) {
  const workerUrl = String(env.EMAIL_WORKER_URL || DEFAULT_EMAIL_WORKER_URL).trim()
  if (!workerUrl || !to) return false
  const response = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'custom_email', data: { to, subject, html } }),
  })
  return response.ok
}

/** Absolute base URL for callbacks, derived from the incoming request. */
export function baseUrl(request) {
  const url = new URL(request.url)
  url.protocol = 'https:'
  return `${url.origin}/api/voice`
}
