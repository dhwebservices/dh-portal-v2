/**
 * Status callback for the agent leg - and the thing that drives the cascade.
 *
 * Twilio calls this once an agent leg completes for any reason: no answer,
 * busy, declined, or a finished conversation. If the appointment is already
 * connected there is nothing to do. Otherwise the next person on the
 * escalation list is rung, and when the list runs out the customer gets an
 * apology and a rebooking link rather than a call from nobody.
 */

import {
  AGENT_RING_SECONDS,
  baseUrl,
  buildEscalationList,
  getAppointment,
  json,
  patchAppointment,
  placeCall,
  sendWorkerEmail,
  verifyTwilioRequest,
} from './_twilio.js'

const PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'

export async function onRequestPost(context) {
  const { request, env } = context

  const params = await verifyTwilioRequest(request, env)
  if (!params) return json({ error: 'Invalid signature.' }, 403)

  const url = new URL(request.url)
  const appointmentId = url.searchParams.get('appt') || ''
  const attempt = Number(url.searchParams.get('i') || '0')

  const appointment = await getAppointment(env, appointmentId)
  if (!appointment) return json({ ok: true, note: 'unknown appointment' })

  // Someone took it. The leg ending is just the conversation finishing.
  if (appointment.call_status === 'connected') {
    return json({ ok: true, note: 'already connected' })
  }
  if (appointment.status === 'cancelled') {
    await patchAppointment(env, appointmentId, { call_status: 'skipped' })
    return json({ ok: true, note: 'cancelled' })
  }

  const attempts = Array.isArray(appointment.call_attempts) ? appointment.call_attempts : []
  const logged = [
    ...attempts,
    {
      stage: 'agent-leg',
      index: attempt,
      outcome: params.CallStatus || 'unknown',
      duration: params.CallDuration || null,
      at: new Date().toISOString(),
    },
  ]

  const escalation = await buildEscalationList(env, appointment)
  const next = escalation[attempt + 1]

  if (next) {
    const query = `appt=${encodeURIComponent(appointmentId)}&i=${attempt + 1}`
    try {
      const call = await placeCall(env, {
        to: next.phone,
        answerUrl: `${baseUrl(request)}/agent?${query}`,
        statusUrl: `${baseUrl(request)}/status?${query}`,
        timeout: AGENT_RING_SECONDS,
      })
      await patchAppointment(env, appointmentId, {
        call_status: 'pending',
        call_sid: call?.sid || appointment.call_sid,
        call_last_checked_at: new Date().toISOString(),
        call_attempts: logged,
      })
      return json({ ok: true, escalated_to: next.email })
    } catch (error) {
      await patchAppointment(env, appointmentId, {
        call_status: 'failed',
        call_last_checked_at: new Date().toISOString(),
        call_attempts: [
          ...logged,
          { stage: 'error', message: String(error?.message || error), at: new Date().toISOString() },
        ],
      })
      return json({ ok: false, error: String(error?.message || error) }, 500)
    }
  }

  // Nobody left to try.
  await patchAppointment(env, appointmentId, {
    call_status: 'no_answer',
    call_last_checked_at: new Date().toISOString(),
    call_attempts: logged,
  })

  await notifyMissed(env, appointment)
  return json({ ok: true, note: 'escalation exhausted' })
}

async function notifyMissed(env, appointment) {
  const firstName = String(appointment.client_name || '').split(' ')[0] || 'there'
  const rebook = `${PORTAL_URL}/book`

  if (appointment.client_email) {
    await sendWorkerEmail(env, {
      to: appointment.client_email,
      subject: 'Sorry we missed your call',
      html: `
        <p>Hi ${firstName},</p>
        <p>We tried to reach you for your appointment today but could not get
        anyone on the line at the scheduled time. Apologies for that.</p>
        <p>You can pick a new time that suits you here:</p>
        <p><a href="${rebook}" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Rebook your call</a></p>
        <p>Or reply to this email and we will sort it out directly.</p>
        <p>DH Website Services</p>
      `,
    }).catch(() => false)
  }

  if (appointment.staff_email) {
    await sendWorkerEmail(env, {
      to: appointment.staff_email,
      subject: `Missed appointment call with ${appointment.client_name || 'a client'}`,
      html: `
        <p>Nobody accepted the automated call for this appointment, so the
        client was not dialled and has been emailed a rebooking link.</p>
        <p><strong>${appointment.client_name || 'Unknown'}</strong><br/>
        ${appointment.client_phone || 'No phone number'}<br/>
        ${appointment.date || ''} ${appointment.start_time || ''}</p>
        <p><a href="${PORTAL_URL}/appointments">Open appointments</a></p>
      `,
    }).catch(() => false)
  }
}

export const onRequestGet = onRequestPost
