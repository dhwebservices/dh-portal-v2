/**
 * Answer URL for the agent leg.
 *
 * The agent is rung first, before the customer, and hears who the call is with
 * before deciding. Only once someone presses 1 does Twilio dial the customer,
 * so a customer is never left holding for an agent who never arrives.
 */

import {
  baseUrl,
  esc,
  getAppointment,
  patchAppointment,
  verifyTwilioRequest,
  xml,
} from './_twilio.js'

function hangup(message) {
  return xml(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy" language="en-GB">${esc(message)}</Say>
  <Hangup/>
</Response>`,
  )
}

export async function onRequestPost(context) {
  const { request, env } = context

  const params = await verifyTwilioRequest(request, env)
  if (!params) return xml('<Response><Hangup/></Response>', 403)

  const url = new URL(request.url)
  const appointmentId = url.searchParams.get('appt') || ''
  const attempt = Number(url.searchParams.get('i') || '0')

  const appointment = await getAppointment(env, appointmentId)
  if (!appointment) return hangup('That appointment could not be found. Goodbye.')

  // Somebody already took it, or it was cancelled while this leg was ringing.
  if (appointment.status === 'cancelled') {
    return hangup('This appointment has been cancelled. Goodbye.')
  }
  if (appointment.call_status === 'connected') {
    return hangup('This call has already been answered by a colleague. Goodbye.')
  }

  await patchAppointment(env, appointmentId, {
    call_status: 'ringing',
    call_last_checked_at: new Date().toISOString(),
  })

  const who = appointment.client_name || 'a client'
  const business = appointment.client_business
    ? ` from ${appointment.client_business}`
    : ''
  const when = appointment.start_time ? ` at ${appointment.start_time}` : ''

  const prompt =
    `Appointment call with ${who}${business}${when}. `
    + 'Press 1 to connect. Press 2 if you cannot take it.'

  const action = `${baseUrl(request)}/bridge?appt=${encodeURIComponent(appointmentId)}&i=${attempt}`

  return xml(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" timeout="8" action="${esc(action)}" method="POST">
    <Say voice="Polly.Amy" language="en-GB">${esc(prompt)}</Say>
    <Pause length="1"/>
    <Say voice="Polly.Amy" language="en-GB">${esc(prompt)}</Say>
  </Gather>
  <Say voice="Polly.Amy" language="en-GB">No response received. Goodbye.</Say>
  <Hangup/>
</Response>`,
  )
}

// Twilio can be configured with GET; keep the behaviour identical either way.
export const onRequestGet = onRequestPost
