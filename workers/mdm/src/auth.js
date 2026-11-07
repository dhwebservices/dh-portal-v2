/**
 * Who is calling the admin API.
 *
 * verifyEntraToken is a copy of the staff portal's functions/api/_portalAuth.js
 * (keep them in step). Unlike the portal, admin rights here do NOT come from
 * Supabase: they come from the MDM_ADMINS list on this Worker. Device control
 * then can't be granted by anyone holding the portal's database key.
 */

const JWKS_TTL_MS = 60 * 60 * 1000 // keys rotate rarely; an hour is plenty
const CLOCK_SKEW_S = 120

let jwksCache = { keys: null, fetchedAt: 0, tenant: null }

function b64urlToBytes(value) {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function decodeSegment(segment) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(segment)))
}

async function getSigningKeys(tenantId) {
  const fresh = jwksCache.keys
    && jwksCache.tenant === tenantId
    && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS
  if (fresh) return jwksCache.keys

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
  if (!response.ok) throw new Error(`Could not fetch signing keys (${response.status}).`)
  const payload = await response.json()
  jwksCache = { keys: payload.keys || [], fetchedAt: Date.now(), tenant: tenantId }
  return jwksCache.keys
}

/**
 * Verify a Microsoft-issued JWT. Returns its claims, or throws.
 */
export async function verifyEntraToken(token, env) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) throw new Error('Malformed token.')

  const [headerB64, payloadB64, signatureB64] = parts
  const header = decodeSegment(headerB64)
  const claims = decodeSegment(payloadB64)

  const tenantId = env.MICROSOFT_TENANT_ID
  const clientId = env.MICROSOFT_CLIENT_ID
  if (!tenantId || !clientId) throw new Error('Microsoft auth is not configured.')

  // Signature first - never trust unverified claims.
  const keys = await getSigningKeys(tenantId)
  const jwk = keys.find((key) => key.kid === header.kid)
  if (!jwk) throw new Error('Token was signed with an unknown key.')

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    b64urlToBytes(signatureB64),
    signed,
  )
  if (!valid) throw new Error('Token signature is not valid.')

  const now = Math.floor(Date.now() / 1000)
  if (claims.exp && now > claims.exp + CLOCK_SKEW_S) throw new Error('Token has expired.')
  if (claims.nbf && now < claims.nbf - CLOCK_SKEW_S) throw new Error('Token is not valid yet.')

  const allowedIssuers = [
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
    `https://sts.windows.net/${tenantId}/`,
  ]
  if (!allowedIssuers.includes(claims.iss)) throw new Error('Token came from an unexpected issuer.')

  // ID tokens carry the client id as aud; access tokens for our own API use the
  // api://<clientId> form.
  const audiences = [clientId, `api://${clientId}`]
  if (!audiences.includes(claims.aud)) throw new Error('Token was issued for a different application.')

  const email = String(claims.preferred_username || claims.email || claims.upn || '')
    .toLowerCase()
    .trim()
  if (!email) throw new Error('Token does not identify a user.')

  return { email, name: claims.name || email, claims }
}

export const adminList = (env) => String(env.MDM_ADMINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

/** Any signed-in member of staff. Throws with .status 401 otherwise. */
export async function requireStaff(request, env) {
  const header = request.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) { const e = new Error('Sign-in required.'); e.status = 401; throw e }
  try {
    const user = await verifyEntraToken(token, env)
    return { ...user, isAdmin: adminList(env).includes(user.email) }
  } catch (cause) {
    const e = new Error(cause.message || 'Sign-in could not be verified.'); e.status = 401; throw e
  }
}

/** A signed-in member of staff on the MDM_ADMINS list. */
export async function requireAdmin(request, env) {
  const user = await requireStaff(request, env)
  if (!user.isAdmin) { const e = new Error('Device management is only open to DH\'s device admin.'); e.status = 403; throw e }
  return user
}
