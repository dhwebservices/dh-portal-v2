// Cloudflare Pages Cron Function - Daily Clock-In Reminder
// Runs every day at 8:00 AM UTC (9:00 AM BST / 8:00 AM GMT)
// Sends push notification to all staff to remind them to clock in
// Uses Firebase Admin SDK V1 API (modern method)

// Helper function to get OAuth access token from service account
async function getAccessToken(serviceAccountJson) {
  const serviceAccount = JSON.parse(serviceAccountJson)

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signatureInput = `${encodedHeader}.${encodedPayload}`

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signatureInput)
  )

  const signature = base64UrlEncode(signatureBuffer)
  const jwt = `${signatureInput}.${signature}`

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
  const { env } = context
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIREBASE_SERVICE_ACCOUNT } = env

  try {
    // Get OAuth access token
    const accessToken = await getAccessToken(FIREBASE_SERVICE_ACCOUNT)

    // Get all active staff members
    const staffResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/staff?active=eq.true&select=email,name`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    )

    if (!staffResponse.ok) {
      throw new Error('Failed to fetch staff list')
    }

    const staff = await staffResponse.json()

    if (!staff || staff.length === 0) {
      console.log('No staff found')
      return new Response(JSON.stringify({ message: 'No staff to notify' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    let notificationsSent = 0
    let errors = []

    // Send notification to each staff member
    for (const person of staff) {
      try {
        // Get all device tokens for this person
        const devicesResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/user_devices?user_email=eq.${encodeURIComponent(person.email)}&select=fcm_token`,
          {
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
          }
        )

        if (!devicesResponse.ok) {
          throw new Error(`Failed to fetch devices for ${person.email}`)
        }

        const devices = await devicesResponse.json()

        if (!devices || devices.length === 0) {
          console.log(`No devices registered for ${person.email}`)
          continue
        }

        // Send FCM notification to each device using V1 API
        for (const device of devices) {
          const fcmPayload = {
            message: {
              token: device.fcm_token,
              notification: {
                title: 'Good morning! ☀️',
                body: "Don't forget to clock in when you start work 📍",
              },
              data: {
                type: 'clock_in_reminder',
                click_action: 'https://staff.dhwebsiteservices.co.uk/clock-in',
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
                user_email: person.email,
                notification_type: 'clock_in_reminder',
                title: 'Good morning! ☀️',
                body: "Don't forget to clock in when you start work 📍",
                data: { type: 'clock_in_reminder' },
                sent_at: new Date().toISOString(),
                delivered: true,
                fcm_message_id: result.name,
              }),
            })

            notificationsSent++
          } else {
            const errorText = await fcmResponse.text()
            errors.push(`Failed to send to ${person.email}: ${errorText}`)
          }
        }

      } catch (error) {
        errors.push(`Error processing ${person.email}: ${error.message}`)
      }
    }

    console.log(`✅ Sent ${notificationsSent} clock-in reminders`)
    if (errors.length > 0) {
      console.error('Errors:', errors)
    }

    return new Response(
      JSON.stringify({
        message: 'Clock-in reminders sent',
        sent: notificationsSent,
        total_staff: staff.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Cron job error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
