// Cloudflare Pages Cron Function - Daily Clock-In Reminder
// Runs every day at 8:00 AM UTC (9:00 AM BST / 8:00 AM GMT)
// Sends a push notification to all staff to remind them to clock in.
//
// Sends via APNs directly (see ../api/_apns.js) - this used to call Firebase
// Cloud Messaging, but this app has no Firebase iOS SDK and registers raw
// APNs device tokens, which FCM rejects, so every reminder was silently
// failing to send.

import { sendApnsNotification, getIosDeviceTokens, logPushNotification } from '../api/_apns.js'

export async function onRequest(context) {
  const { env } = context
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

  try {
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

    const notificationData = {
      title: 'Good morning! ☀️',
      body: "Don't forget to clock in when you start work 📍",
      data: { type: 'clock_in_reminder', click_action: 'https://staff.dhwebsiteservices.co.uk/clock-in' },
    }

    let notificationsSent = 0
    let errors = []

    for (const person of staff) {
      try {
        const tokens = await getIosDeviceTokens(person.email, env)

        if (tokens.length === 0) {
          console.log(`No devices registered for ${person.email}`)
          continue
        }

        const results = await Promise.all(
          tokens.map(token => sendApnsNotification(token, notificationData, env))
        )

        const sent = results.filter(r => r.success).length
        if (sent > 0) notificationsSent += sent

        const failed = results.filter(r => !r.success)
        for (const r of failed) {
          errors.push(`Failed to send to ${person.email}: ${r.error}`)
        }

        await logPushNotification(person.email, 'clock_in_reminder', notificationData, sent > 0, env)
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
