/**
 * Verifies that a request genuinely came from a signed-in portal user.
 *
 * The other functions in here gate on the Origin header alone, which a
 * `curl -H "Origin: https://staff.dhwebsiteservices.co.uk"` defeats in one
 * line. That is tolerable for logging endpoints; it is not tolerable for
 * anything that can rewrite the public website, so this validates the caller's
 * Microsoft Entra token properly:
 *
 *   - RS256 signature checked against the tenant's published JWKS
 *   - issuer must be our tenant, audience must be our app registration
 *   - expiry and not-before honoured, with a little clock skew
 *
 * Then the caller's email is checked against user_permissions for the
 * permission the route requires.
 */

const JWKS_TTL_MS = 60 * 60 * 1000 // keys rotate rarely; an hour is plenty
const CLOCK_SKEW_S = 120

// Kept in step with DIRECTOR_EMAILS in src/utils/staffLifecycle.js.
const OWNER_EMAILS = new Set(['david@dhwebsiteservices.co.uk'])

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

/**
 * Verify the caller and confirm they hold `permissionKey`.
 * Directors (is_admin) bypass the per-key check, matching the portal's own rule.
 */
export async function requirePortalUser(request, env, permissionKey) {
  const header = request.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    const error = new Error('Sign-in required.')
    error.status = 401
    throw error
  }

  let user
  try {
    user = await verifyEntraToken(token, env)
  } catch (cause) {
    const error = new Error(cause.message || 'Sign-in could not be verified.')
    error.status = 401
    throw error
  }

  if (!permissionKey) return user

  const auth = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  }

  // Mirrors AuthContext: owner, or permissions.admin, or a director role scope.
  // There is no is_admin column - admin is derived, so it has to be derived the
  // same way here or the two will disagree.
  const [permsRows, orgRows] = await Promise.all([
    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_permissions`
        + `?user_email=eq.${encodeURIComponent(user.email)}&select=permissions&limit=1`,
      { headers: auth },
    ).then((r) => r.json()).catch(() => []),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/portal_settings`
        + `?key=eq.${encodeURIComponent(`staff_org:${user.email}`)}&select=value&limit=1`,
      { headers: auth },
    ).then((r) => r.json()).catch(() => []),
  ])

  const permissions = (Array.isArray(permsRows) ? permsRows[0]?.permissions : null) || {}
  const orgValue = (Array.isArray(orgRows) ? orgRows[0]?.value : null) || {}
  const roleScope = orgValue?.value?.role_scope || orgValue?.role_scope || ''

  const isAdmin = OWNER_EMAILS.has(user.email)
    || permissions.admin === true
    || roleScope === 'director'

  if (!isAdmin && permissions[permissionKey] !== true) {
    const error = new Error(`You do not have the "${permissionKey}" permission.`)
    error.status = 403
    throw error
  }

  return { ...user, isAdmin }
}
