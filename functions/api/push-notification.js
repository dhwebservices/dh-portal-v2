// Cloudflare Pages Function for sending push notifications via Firebase Cloud Messaging (FCM)

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
    const { type, manager_email, staff_email, staff_name, leave_type, start_date, end_date, days, reason, leave_request_id, decided_by } = payload

    // Get recipient email based on notification type
    const recipientEmail = type === 'leave_request' ? manager_email : staff_email

    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: 'Recipient email required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get FCM token(s) for user
    const tokens = await getUserDeviceTokens(recipientEmail, env)

    if (tokens.length === 0) {
      console.log(`No FCM tokens found for ${recipientEmail}`)
      return new Response(
        JSON.stringify({ message: 'No devices registered', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build notification payload based on type
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
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid notification type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send to all user devices
    const results = await Promise.all(
      tokens.map(token => sendFCMNotification(token, notificationData, env))
    )

    const successCount = results.filter(r => r.success).length

    // Log notification to database
    await logNotification(recipientEmail, notificationData, successCount > 0, env)

    return new Response(
      JSON.stringify({
        message: 'Notification sent',
        sent: successCount,
        total: tokens.length
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

async function getUserDeviceTokens(userEmail, env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/user_devices?user_email=eq.${encodeURIComponent(userEmail)}&select=fcm_token`,
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
  return devices.map(d => d.fcm_token)
}

async function sendFCMNotification(fcmToken, notificationData, env) {
  const { FCM_SERVER_KEY } = env

  if (!FCM_SERVER_KEY) {
    console.error('FCM_SERVER_KEY not configured')
    return { success: false, error: 'FCM not configured' }
  }

  const fcmPayload = {
    to: fcmToken,
    notification: {
      title: notificationData.title,
      body: notificationData.body,
      sound: 'default',
      badge: '1',
      click_action: notificationData.data.click_action
    },
    data: notificationData.data,
    priority: 'high'
  }

  try {
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${FCM_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fcmPayload)
    })

    const result = await response.json()

    if (!response.ok || result.failure === 1) {
      console.error('FCM send failed:', result)
      return { success: false, error: result.results?.[0]?.error || 'FCM error' }
    }

    return { success: true, messageId: result.results?.[0]?.message_id }

  } catch (error) {
    console.error('FCM request failed:', error)
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
