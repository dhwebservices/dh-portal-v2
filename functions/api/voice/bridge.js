/**
 * Handles the agent's keypress and, on acceptance, bridges in the customer.
 *
 * Two stages share this endpoint:
 *   (no stage)   - the <Gather> result: 1 accepts, anything else declines.
 *   stage=after  - the <Dial> result, once the customer leg has finished.
 */

import {
  CUSTOMER_RING_SECONDS,
  baseUrl,
  esc,
  getAppointment,
  normalizePhone,
  patchAppointment,
  verifyTwilioRequest,
  xml,
} from './_twilio.js'

function say(message) {
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
  const stage = url.searchParams.get('stage') || ''

  const appointment = await getAppointment(env, appointmentId)
  if (!appointment) return say('That appointment could not be found. Goodbye.')

  // Second pass: the customer leg has ended, so close the record out.
  if (stage === 'after') {
    const dialStatus = params.DialCallStatus || ''
    await patchAppointment(env, appointmentId, {
      call_status: dialStatus === 'completed' ? 'connected' : 'no_answer',
      call_last_checked_at: new Date().toISOString(),
      call_attempts: [
        ...(Array.isArray(appointment.call_attempts) ? appointment.call_attempts : []),
        {
          stage: 'customer',
          outcome: dialStatus || 'unknown',
          at: new Date().toISOString(),
        },
      ],
    })
    if (dialStatus === 'completed') {
      return xml('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>')
    }
    return say('The client did not answer. The appointment has been marked accordingly. Goodbye.')
  }

  const digit = params.Digits || ''
  const attempts = Array.isArray(appointment.call_attempts) ? appointment.call_attempts : []

  if (digit !== '1') {
    // Declined. Leave the status short of "connected" so the status callback
    // cascades to the next person on the list.
    await patchAppointment(env, appointmentId, {
      call_last_checked_at: new Date().toISOString(),
      call_attempts: [
        ...attempts,
        {
          stage: 'agent',
          index: attempt,
          outcome: digit ? 'declined' : 'no_input',
          at: new Date().toISOString(),
        },
      ],
    })
    return say('No problem. Trying somebody else. Goodbye.')
  }

  const customer = normalizePhone(appointment.client_phone)
  if (!customer) {
    await patchAppointment(env, appointmentId, {
      call_status: 'skipped',
      call_last_checked_at: new Date().toISOString(),
    })
    return say('There is no phone number on this appointment. Goodbye.')
  }

  await patchAppointment(env, appointmentId, {
    call_status: 'connected',
    call_connected_at: new Date().toISOString(),
    call_answered_by: params.To || null,
    call_attempts: [
      ...attempts,
      { stage: 'agent', index: attempt, outcome: 'accepted', at: new Date().toISOString() },
    ],
  })

  const after = `${baseUrl(request)}/bridge?appt=${encodeURIComponent(appointmentId)}&i=${attempt}&stage=after`
  const callerId = env.TWILIO_CALLER_ID || '+442920024218'

  return xml(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy" language="en-GB">Connecting you now.</Say>
  <Dial callerId="${esc(callerId)}" timeout="${CUSTOMER_RING_SECONDS}" action="${esc(after)}" method="POST">
    <Number>${esc(customer)}</Number>
  </Dial>
</Response>`,
  )
}

export const onRequestGet = onRequestPost
