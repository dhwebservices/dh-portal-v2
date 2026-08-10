/**
 * Scans for appointments that are due now and starts the call for each.
 *
 * Called by the dh-appointment-calls worker on its five-minute cron, not by a
 * browser, so it authenticates with a shared secret rather than Entra. It is
 * also safe to hit by hand for testing: call_status acts as the lock, so an
 * appointment already in flight is never dialled twice.
 *
 * Note the status filter is 'confirmed'. That is what the booking endpoint
 * writes - the staff_meetings worker's 'scheduled' does not appear in this
 * table at all.
 */

import {
  AGENT_RING_SECONDS,
  baseUrl,
  buildEscalationList,
  json,
  normalizePhone,
  patchAppointment,
  placeCall,
  supabaseFetch,
} from './_twilio.js'

const TIME_ZONE = 'Europe/London'
// How late the cron may still start a call. Wider than the 5 minute cron so a
// delayed tick does not silently drop an appointment, tight enough that a call
// never arrives long after the customer expected it.
const DUE_WINDOW_MS = 10 * 60 * 1000

function getTimeZoneOffset(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return asUtc - date.getTime()
}

function zonedDateTimeToUtc(dateString, timeString, timeZone = TIME_ZONE) {
  const [year, month, day] = String(dateString || '').split('-').map(Number)
  const [hour, minute] = String(timeString || '').split(':').map(Number)
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return null
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  return new Date(guess.getTime() - getTimeZoneOffset(guess, timeZone))
}

function formatDateInZone(date, timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function isDue(appointment, now) {
  if (appointment.call_status) return false
  const startAt = zonedDateTimeToUtc(appointment.date, appointment.start_time)
  if (!startAt) return false
  const elapsed = now.getTime() - startAt.getTime()
  return elapsed >= 0 && elapsed < DUE_WINDOW_MS
}

export async function onRequestPost(context) {
  const { request, env } = context

  const secret = String(env.APPOINTMENT_CALL_SECRET || '').trim()
  if (!secret) return json({ error: 'Appointment call secret is not configured.' }, 503)
  if (request.headers.get('x-appointment-call-secret') !== secret) {
    return json({ error: 'Unauthorized.' }, 401)
  }
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    return json({ error: 'Twilio credentials are not configured.' }, 503)
  }

  const now = new Date()
  const today = formatDateInZone(now)

  const query = new URLSearchParams({
    select: 'id,client_name,client_email,client_phone,client_business,staff_email,staff_name,date,start_time,status,call_status,call_attempts',
    status: 'eq.confirmed',
    date: `eq.${today}`,
  })
  query.append('call_status', 'is.null')

  const rows = await supabaseFetch(env, `/rest/v1/appointments?${query.toString()}`)
  const due = (Array.isArray(rows) ? rows : []).filter((row) => isDue(row, now))

  const results = []
  for (const appointment of due) {
    results.push(await startCall(env, request, appointment, now))
  }

  return json({
    ok: true,
    scanned: Array.isArray(rows) ? rows.length : 0,
    due: due.length,
    started: results.filter((item) => item.status === 'started').length,
    skipped: results.filter((item) => item.status === 'skipped').length,
    errors: results.filter((item) => item.status === 'error').length,
    results,
  })
}

async function startCall(env, request, appointment, now) {
  const customer = normalizePhone(appointment.client_phone)
  if (!customer) {
    await patchAppointment(env, appointment.id, {
      call_status: 'skipped',
      call_last_checked_at: now.toISOString(),
      call_attempts: [{ stage: 'skip', outcome: 'no_client_phone', at: now.toISOString() }],
    })
    return { id: appointment.id, status: 'skipped', reason: 'no_client_phone' }
  }

  const escalation = await buildEscalationList(env, appointment)
  if (!escalation.length) {
    await patchAppointment(env, appointment.id, {
      call_status: 'skipped',
      call_last_checked_at: now.toISOString(),
      call_attempts: [{ stage: 'skip', outcome: 'no_agent_phone', at: now.toISOString() }],
    })
    return { id: appointment.id, status: 'skipped', reason: 'no_agent_phone' }
  }

  // Claim it before dialling. If the Twilio call then fails the status is
  // corrected below - but a second cron tick can never pick up the same row.
  await patchAppointment(env, appointment.id, {
    call_status: 'pending',
    call_started_at: now.toISOString(),
    call_last_checked_at: now.toISOString(),
  })

  const query = `appt=${encodeURIComponent(appointment.id)}&i=0`
  try {
    const call = await placeCall(env, {
      to: escalation[0].phone,
      answerUrl: `${baseUrl(request)}/agent?${query}`,
      statusUrl: `${baseUrl(request)}/status?${query}`,
      timeout: AGENT_RING_SECONDS,
    })
    await patchAppointment(env, appointment.id, { call_sid: call?.sid || null })
    return { id: appointment.id, status: 'started', agent: escalation[0].email }
  } catch (error) {
    await patchAppointment(env, appointment.id, {
      call_status: 'failed',
      call_last_checked_at: now.toISOString(),
      call_attempts: [
        { stage: 'error', message: String(error?.message || error), at: now.toISOString() },
      ],
    })
    return { id: appointment.id, status: 'error', reason: String(error?.message || error) }
  }
}
