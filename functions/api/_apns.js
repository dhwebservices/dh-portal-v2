// Shared Apple Push Notification service (APNs) helpers for Cloudflare Pages
// Functions. Sends directly via APNs HTTP/2 + an ES256-signed JWT — this app
// has no Firebase iOS SDK, and @capacitor/push-notifications registers a raw
// APNs device token on iOS, not an FCM token, so routing through Firebase
// Cloud Messaging can never work for this app's devices.
//
// Required Cloudflare Pages environment variables:
//   APNS_KEY_ID       - Key ID of the APNs Auth Key (.p8) from Apple Developer
//   APNS_TEAM_ID      - Apple Developer Team ID
//   APNS_AUTH_KEY     - Full contents of the .p8 file (PEM, including
//                        "-----BEGIN PRIVATE KEY-----" / "-----END..." lines)
//   APNS_BUNDLE_ID    - App bundle ID, e.g. uk.co.dhwebsiteservices.staff
//   APNS_ENVIRONMENT  - "sandbox" (Xcode debug builds) or "production"
//                        (TestFlight / App Store builds). Defaults to
//                        "sandbox" - MUST be switched to "production" before/
//                        at App Store release, otherwise pushes to
//                        production-signed builds will fail.

let cachedApnsJwt = null
let cachedApnsJwtIssuedAt = 0

export async function getApnsJwt(env) {
  const { APNS_KEY_ID, APNS_TEAM_ID, APNS_AUTH_KEY } = env
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_AUTH_KEY) {
    throw new Error('APNs credentials not configured (APNS_KEY_ID / APNS_TEAM_ID / APNS_AUTH_KEY)')
  }

  const now = Math.floor(Date.now() / 1000)
  // APNs tokens are valid up to 1 hour; reuse within 50 minutes to avoid
  // re-signing on every request.
  if (cachedApnsJwt && now - cachedApnsJwtIssuedAt < 50 * 60) {
    return cachedApnsJwt
  }

  const header = { alg: 'ES256', kid: APNS_KEY_ID }
  const claims = { iss: APNS_TEAM_ID, iat: now }

  const encoder = new TextEncoder()
  const base64url = (bytes) =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const base64urlFromString = (str) => base64url(encoder.encode(str))

  const unsigned = `${base64urlFromString(JSON.stringify(header))}.${base64urlFromString(JSON.stringify(claims))}`

  const privateKey = await importApnsPrivateKey(APNS_AUTH_KEY)
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encoder.encode(unsigned)
  )

  const jwt = `${unsigned}.${base64url(new Uint8Array(signature))}`
  cachedApnsJwt = jwt
  cachedApnsJwtIssuedAt = now
  return jwt
}

async function importApnsPrivateKey(pem) {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')

  const binary = atob(pemBody)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
}

// notificationData: { title, body, data } where `data` is a flat object of
// string-able custom payload fields (delivered alongside `aps`).
export async function sendApnsNotification(deviceToken, notificationData, env) {
  const { APNS_BUNDLE_ID, APNS_ENVIRONMENT } = env

  if (!APNS_BUNDLE_ID) {
    return { success: false, error: 'APNS_BUNDLE_ID not configured' }
  }

  try {
    const jwt = await getApnsJwt(env)
    const host = APNS_ENVIRONMENT === 'production'
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com'

    const body = {
      aps: {
        alert: {
          title: notificationData.title,
          body: notificationData.body,
        },
        sound: 'default',
        badge: 1,
      },
      ...notificationData.data,
    }

    const response = await fetch(`${host}/3/device/${deviceToken}`, {
      method: 'POST',
      headers: {
        'authorization': `bearer ${jwt}`,
        'apns-topic': APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (response.status === 200) {
      return { success: true }
    }

    const errorBody = await response.json().catch(() => ({}))
    return { success: false, error: errorBody.reason || `APNs ${response.status}` }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Device tokens are stored in the `fcm_token` column regardless of platform
// (legacy naming from before the APNs rewrite) - only `device_type=ios`
// tokens are valid APNs device tokens.
/**
 * Every registered iOS device, with the email it belongs to.
 *
 * Used for a broadcast, where the caller needs to know who each token is for
 * so it can honour that person's notification preferences and log the send
 * against them. `getIosDeviceTokens` below stays as it is — it has callers.
 */
export async function getAllIosDevices(env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/user_devices?device_type=eq.ios&select=user_email,fcm_token`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      }
    }
  )

  if (!response.ok) {
    throw new Error('Failed to fetch devices')
  }

  const devices = await response.json()
  return devices
    .filter(d => d.fcm_token && d.user_email)
    .map(d => ({ email: String(d.user_email).toLowerCase(), token: d.fcm_token }))
}

/**
 * The people who have switched a given notification off.
 *
 * Read once for a broadcast rather than per person — a send to forty staff
 * should not be forty round trips. Only rows that have explicitly opted out
 * come back; everyone else is treated as opted in, which matches
 * `wantsNotification` in src/shared/notificationEvents.js.
 */
export async function getOptedOutEmails(eventKey, env) {
  if (!eventKey) return new Set()

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/user_preferences?select=user_email,push_notifications,notification_prefs`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      }
    }
  )

  if (!response.ok) return new Set()

  const rows = await response.json()
  const out = new Set()
  for (const row of rows) {
    const email = String(row.user_email || '').toLowerCase()
    if (!email) continue
    if (row.push_notifications === false) { out.add(email); continue }
    if (row.notification_prefs && row.notification_prefs[eventKey] === false) out.add(email)
  }
  return out
}

export async function getIosDeviceTokens(userEmail, env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/user_devices?user_email=eq.${encodeURIComponent(userEmail)}&device_type=eq.ios&select=fcm_token`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      }
    }
  )

  if (!response.ok) {
    throw new Error('Failed to fetch user devices')
  }

  const devices = await response.json()
  return devices.map(d => d.fcm_token).filter(Boolean)
}

export async function logPushNotification(userEmail, notificationType, notificationData, delivered, env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

  await fetch(`${SUPABASE_URL}/rest/v1/push_notifications`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      user_email: userEmail,
      notification_type: notificationType || 'general',
      title: notificationData.title,
      body: notificationData.body,
      data: notificationData.data,
      sent_at: new Date().toISOString(),
      delivered,
    })
  })
}
