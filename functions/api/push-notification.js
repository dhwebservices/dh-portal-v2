// Cloudflare Pages Function for sending push notifications directly via
// Apple Push Notification service (APNs).
//
// This app has no Firebase iOS SDK integration (@capacitor/push-notifications
// registers directly with APNs on iOS and returns the raw APNs device token),
// so routing through Firebase Cloud Messaging was never going to work - and
// in fact the previous implementation called Google's Legacy FCM HTTP API
// (fcm.googleapis.com/fcm/send), which Google shut down in June 2024 and
// now returns 404 for every request. Every push notification this app has
// ever attempted to send has silently failed. Going straight to APNs is
// both simpler and the correct approach for an iOS-only app with no
// Firebase SDK wired up.
//
// Required Cloudflare Pages environment variables:
//   APNS_KEY_ID        - Key ID of the APNs Auth Key (.p8) from Apple Developer
//   APNS_TEAM_ID        - Apple Developer Team ID
//   APNS_AUTH_KEY       - Full contents of the .p8 file (PEM, including
//                          "-----BEGIN PRIVATE KEY-----" / "-----END..." lines)
//   APNS_BUNDLE_ID      - App bundle ID, e.g. uk.co.dhwebsiteservices.staff
//   APNS_ENVIRONMENT    - "sandbox" (Xcode debug builds) or "production"
//                          (TestFlight / App Store builds). Defaults to
//                          "sandbox" - MUST be switched to "production"
//                          before/at App Store release, otherwise pushes to
//                          production-signed builds will fail.

export async function onRequest(context) {
  const { request, env } = context

  const corsHeaders = {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const payload = await request.json()
    const { type, manager_email, staff_email, staff_name, leave_type, start_date, end_date, days, reason, leave_request_id, decided_by, decline_reason } = payload

    const managerRoutedTypes = ['leave_request', 'onboarding_submitted']
    let recipientEmails = []

    if (managerRoutedTypes.includes(type)) {
      // Most staff don't have a manager_email set on their HR profile, and
      // approving leave/onboarding in this app is gated on admin status,
      // not a formal manager hierarchy - so when there's no specific
      // manager, notify every admin instead of silently notifying nobody
      // (or, as it was before this fix, silently falling back to the
      // submitter's own email).
      recipientEmails = manager_email ? [manager_email] : await getAdminEmails(env)
    } else if (staff_email) {
      recipientEmails = [staff_email]
    }

    if (recipientEmails.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No recipient could be determined' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tokensPerRecipient = await Promise.all(
      recipientEmails.map(email => getUserDeviceTokens(email, env))
    )
    const tokens = [...new Set(tokensPerRecipient.flat())]
    const recipientEmail = recipientEmails[0]

    if (tokens.length === 0) {
      console.log(`No device tokens found for ${recipientEmails.join(', ')}`)
      return new Response(
        JSON.stringify({ message: 'No devices registered', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let notificationData

    if (type === 'leave_request') {
      notificationData = {
        title: '🏖️ New Leave Request',
        body: `${staff_name} requested ${days} day${days > 1 ? 's' : ''} off (${leave_type})`,
        data: {
          type: 'leave_request',
          leave_request_id,
          staff_email,
          staff_name,
          leave_type,
          start_date,
          end_date,
          days: String(days),
          reason: reason || '',
          click_action: `https://staff.dhwebsiteservices.co.uk/my-team`
        }
      }
    } else if (type === 'leave_approved') {
      notificationData = {
        title: '✅ Leave Request Approved',
        body: `Your ${leave_type} request (${start_date} - ${end_date}) was approved by ${decided_by}`,
        data: {
          type: 'leave_approved',
          leave_request_id,
          leave_type,
          start_date,
          end_date,
          decided_by: decided_by || '',
          click_action: `https://staff.dhwebsiteservices.co.uk/my-profile`
        }
      }
    } else if (type === 'leave_rejected') {
      notificationData = {
        title: '❌ Leave Request Rejected',
        body: `Your ${leave_type} request (${start_date} - ${end_date}) was rejected by ${decided_by}`,
        data: {
          type: 'leave_rejected',
          leave_request_id,
          leave_type,
          start_date,
          end_date,
          decided_by: decided_by || '',
          click_action: `https://staff.dhwebsiteservices.co.uk/my-profile`
        }
      }
    } else if (type === 'onboarding_submitted') {
      notificationData = {
        title: '📋 Onboarding Submitted',
        body: `${staff_name} has submitted their onboarding for review`,
        data: {
          type: 'onboarding_submitted',
          staff_email,
          staff_name,
          click_action: `https://staff.dhwebsiteservices.co.uk/hr/onboarding`
        }
      }
    } else if (type === 'onboarding_approved') {
      notificationData = {
        title: '✅ Onboarding Approved',
        body: `Your onboarding has been approved${decided_by ? ` by ${decided_by}` : ''}. Welcome aboard!`,
        data: {
          type: 'onboarding_approved',
          decided_by: decided_by || '',
          click_action: `https://staff.dhwebsiteservices.co.uk/my-profile`
        }
      }
    } else if (type === 'onboarding_rejected') {
      notificationData = {
        title: '❌ Onboarding Declined',
        body: decline_reason ? `Declined: ${decline_reason}` : 'Your onboarding submission was declined. Please review and resubmit.',
        data: {
          type: 'onboarding_rejected',
          decided_by: decided_by || '',
          decline_reason: decline_reason || '',
          click_action: `https://staff.dhwebsiteservices.co.uk/onboarding`
        }
      }
    } else {
      // Generic fallback for notification types not modelled above, so this
      // endpoint stays usable without needing a hardcoded branch per type.
      notificationData = {
        title: payload.title || 'DH Staff Portal',
        body: payload.body || payload.message || '',
        data: { type: type || 'general', click_action: payload.click_action || 'https://staff.dhwebsiteservices.co.uk' },
      }
    }

    const results = await Promise.all(
      tokens.map(token => sendApnsNotification(token, notificationData, env))
    )

    const successCount = results.filter(r => r.success).length
    if (successCount === 0 && results.length > 0) {
      console.error('All APNs sends failed:', results)
    }

    await logNotification(recipientEmail, notificationData, successCount > 0, env)

    return new Response(
      JSON.stringify({
        message: 'Notification sent',
        sent: successCount,
        total: tokens.length,
        errors: results.filter(r => !r.success).map(r => r.error),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Push notification error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function getAdminEmails(env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/user_permissions?select=user_email&permissions->>admin=eq.true`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      }
    }
  )

  if (!response.ok) return []

  const rows = await response.json()
  return rows.map(r => r.user_email).filter(Boolean)
}

async function getUserDeviceTokens(userEmail, env) {
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

// --- APNs (Apple Push Notification service) via HTTP/2 + JWT (ES256) ---

let cachedApnsJwt = null
let cachedApnsJwtIssuedAt = 0

async function getApnsJwt(env) {
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

async function sendApnsNotification(deviceToken, notificationData, env) {
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

async function logNotification(userEmail, notificationData, delivered, env) {
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
      notification_type: notificationData.data.type,
      title: notificationData.title,
      body: notificationData.body,
      data: notificationData.data,
      delivered,
    })
  })
}
