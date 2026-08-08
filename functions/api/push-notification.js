// Cloudflare Pages Function for sending push notifications directly via
// Apple Push Notification service (APNs), with hardcoded title/body copy
// for a handful of known notification types (leave, onboarding).
//
// NOTE: nothing in src/ currently calls this endpoint - the app's generic
// notification pipeline (src/utils/notificationPreferences.js) posts to
// /api/send-push-notification instead, which now also sends via APNs (see
// ./_apns.js). This file is kept for callers that want the richer
// type-specific payloads below (e.g. a future direct Supabase trigger).
//
// See ./_apns.js for required Cloudflare Pages environment variables.

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
      recipientEmails.map(email => getIosDeviceTokens(email, env))
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

    await logPushNotification(recipientEmail, notificationData.data.type, notificationData, successCount > 0, env)

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

