// Cloudflare Pages Function for sending individual push notifications
// Uses Firebase Admin SDK V1 API (modern method)

// Helper function to get OAuth access token from service account
async function getAccessToken(serviceAccountJson) {
  const serviceAccount = JSON.parse(serviceAccountJson)

  // Create JWT
  const now = Math.floor(Date.now() / 1000)
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  }

  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }

  // Encode JWT
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signatureInput = `${encodedHeader}.${encodedPayload}`

  // Import private key
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  // Sign JWT
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signatureInput)
  )

  const signature = base64UrlEncode(signatureBuffer)
  const jwt = `${signatureInput}.${signature}`

  // Exchange JWT for access token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const result = await response.json()
  return result.access_token
}

function base64UrlEncode(input) {
  let str = typeof input === 'string' ? input : arrayBufferToBase64(input)
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export async function onRequest(context) {
  const { request, env } = context
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIREBASE_SERVICE_ACCOUNT } = env

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
    const { userEmail, title, body, data = {} } = payload

    if (!userEmail || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userEmail, title, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get all device tokens for this user
    const devicesResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/user_devices?user_email=eq.${encodeURIComponent(userEmail)}&select=fcm_token`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    )

    if (!devicesResponse.ok) {
      throw new Error('Failed to fetch user devices')
    }

    const devices = await devicesResponse.json()

    if (!devices || devices.length === 0) {
      console.log(`No devices registered for ${userEmail}`)
      return new Response(
        JSON.stringify({ message: 'No devices registered', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get OAuth access token from service account
    const accessToken = await getAccessToken(FIREBASE_SERVICE_ACCOUNT)

    let sent = 0
    let errors = []

    // Send to each device using Firebase Admin SDK V1 API
    for (const device of devices) {
      const fcmPayload = {
        message: {
          token: device.fcm_token,
          notification: {
            title,
            body,
          },
          data: {
            ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
            click_action: data.link || 'https://staff.dhwebsiteservices.co.uk',
          },
          android: {
            priority: 'high',
          },
          apns: {
            headers: {
              'apns-priority': '10',
            },
            payload: {
              aps: {
                sound: 'default',
              },
            },
          },
        },
      }

      const fcmResponse = await fetch(
        `https://fcm.googleapis.com/v1/projects/dh-portal-96a3b/messages:send`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fcmPayload),
        }
      )

      if (fcmResponse.ok) {
        const result = await fcmResponse.json()

        // Log notification sent
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
            notification_type: data.type || 'general',
            title,
            body,
            data,
            sent_at: new Date().toISOString(),
            delivered: true,
            fcm_message_id: result.name,
          }),
        })

        sent++
      } else {
        const errorText = await fcmResponse.text()
        errors.push(errorText)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        total_devices: devices.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Push notification error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
