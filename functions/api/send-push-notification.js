// Cloudflare Pages Function for sending individual push notifications.
//
// This used to call Firebase Cloud Messaging, but this app has no Firebase
// iOS SDK - @capacitor/push-notifications registers a raw APNs device token
// on iOS, not an FCM token - and the FCM v1 API rejects APNs tokens, so
// every push sent through this endpoint was silently failing. Sends via
// APNs directly now (see ./_apns.js for credentials/config).

import { sendApnsNotification, getIosDeviceTokens, getAllIosDevices, getOptedOutEmails, logPushNotification } from './_apns.js'

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
    const { userEmail, userEmails, audience, event, title, body, data = {} } = payload

    if (!title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: title, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Three ways to say who gets it, in order of specificity. The original
    // single-`userEmail` shape is first and unchanged, so every existing
    // caller keeps working exactly as it did.
    let recipients = []

    if (userEmail) {
      const tokens = await getIosDeviceTokens(userEmail, env)
      recipients = tokens.map(token => ({ email: String(userEmail).toLowerCase(), token }))
    } else if (Array.isArray(userEmails) && userEmails.length > 0) {
      const wanted = new Set(userEmails.map(e => String(e).toLowerCase()))
      const all = await getAllIosDevices(env)
      recipients = all.filter(d => wanted.has(d.email))
    } else if (audience === 'everyone') {
      recipients = await getAllIosDevices(env)
    } else {
      return new Response(
        JSON.stringify({ error: 'No recipient: pass userEmail, userEmails, or audience' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Anyone who turned this kind off, or push off entirely, drops out here.
    // Read once for the whole send rather than per person.
    if (event) {
      const optedOut = await getOptedOutEmails(event, env)
      recipients = recipients.filter(r => !optedOut.has(r.email))
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No devices to send to', sent: 0, total_devices: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tokens = recipients.map(r => r.token)

    const notificationData = {
      title,
      body,
      data: {
        ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        click_action: data.link || 'https://staff.dhwebsiteservices.co.uk',
      },
    }

    const results = await Promise.all(
      tokens.map(token => sendApnsNotification(token, notificationData, env))
    )

    const sent = results.filter(r => r.success).length
    const errors = results.filter(r => !r.success).map(r => r.error)

    // One log row per person reached, so `push_notifications` remains a
    // truthful record of who was told what.
    const reached = [...new Set(recipients.map(r => r.email))]
    await Promise.all(
      reached.map(email =>
        logPushNotification(email, event || data.type, notificationData, sent > 0, env)
          .catch(() => null)
      )
    )

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        recipients: reached.length,
        total_devices: tokens.length,
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
