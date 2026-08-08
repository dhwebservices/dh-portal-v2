// Cloudflare Pages Function for sending individual push notifications.
//
// This used to call Firebase Cloud Messaging, but this app has no Firebase
// iOS SDK - @capacitor/push-notifications registers a raw APNs device token
// on iOS, not an FCM token - and the FCM v1 API rejects APNs tokens, so
// every push sent through this endpoint was silently failing. Sends via
// APNs directly now (see ./_apns.js for credentials/config).

import { sendApnsNotification, getIosDeviceTokens, logPushNotification } from './_apns.js'

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
    const { userEmail, title, body, data = {} } = payload

    if (!userEmail || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userEmail, title, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tokens = await getIosDeviceTokens(userEmail, env)

    if (tokens.length === 0) {
      console.log(`No iOS devices registered for ${userEmail}`)
      return new Response(
        JSON.stringify({ message: 'No devices registered', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    await logPushNotification(userEmail, data.type, notificationData, sent > 0, env)

    return new Response(
      JSON.stringify({
        success: true,
        sent,
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
