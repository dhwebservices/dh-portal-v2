const CLICKSEND_SMS_URL = 'https://rest.clicksend.com/v3/sms/send'
const DEFAULT_SENDER_ID = 'DHPortal'
const DEFAULT_PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'
const REMINDER_WINDOW_MS = 30 * 60 * 1000
const LOOKAHEAD_DAYS = 1
const TIME_ZONE = 'Europe/London'

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function normalizePhone(value = '') {
  const raw = String(value || '').trim()
  const cleaned = raw.replace(/[^\d+]/g, '')
  if (!cleaned) return ''
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`
  if (cleaned.startsWith('44')) return `+${cleaned}`
  if (cleaned.startsWith('0')) return `+44${cleaned.slice(1)}`
  return `+${cleaned}`
}

function normalizeSenderId(value = '') {
  const sender = String(value || '').replace(/\s+/g, '').trim()
  if (!sender) return DEFAULT_SENDER_ID
  if (!/^[A-Za-z0-9]{3,11}$/.test(sender)) {
    throw new Error('CLICKSEND_SENDER_ID must be 3-11 alphanumeric characters with no spaces.')
  }
  return sender
}

function basicAuth(username, password) {
  return `Basic ${btoa(`${username}:${password}`)}`
}

function getFormatterParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

function getTimeZoneOffset(date, timeZone) {
  const parts = getFormatterParts(date, timeZone)
  const utcTime = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )
  return utcTime - date.getTime()
}

function zonedDateTimeToUtc(dateString, timeString, timeZone = TIME_ZONE) {
  const [year, month, day] = String(dateString || '').split('-').map(Number)
  const [hour, minute] = String(timeString || '').split(':').map(Number)
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  const offset = getTimeZoneOffset(guess, timeZone)
  return new Date(guess.getTime() - offset)
}

function formatDateInZone(date, timeZone = TIME_ZONE) {
  const parts = getFormatterParts(date, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

function addDays(dateString, days) {
  const [year, month, day] = String(dateString || '').split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function buildReminderBody(meeting) {
  const bits = [
    `DH Portal: Meeting in 30 mins.`,
    `"${meeting.title}"`,
    meeting.meeting_with_name ? `With ${meeting.meeting_with_name}.` : '',
    `Starts at ${meeting.start_time} on ${meeting.date}.`,
    meeting.location ? `Location: ${meeting.location}.` : '',
    `${DEFAULT_PORTAL_URL}/appointments`,
  ]
  return bits.filter(Boolean).join(' ')
}

async function supabaseFetch(env, path, options = {}) {
  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Supabase request failed (${response.status}): ${errorText}`)
  }

  if (response.status === 204) return null
  return response.json().catch(() => null)
}

async function fetchUpcomingMeetings(env, now) {
  const fromDate = formatDateInZone(now)
  const toDate = addDays(fromDate, LOOKAHEAD_DAYS)
  const query = new URLSearchParams({
    select: 'id,title,meeting_with_name,meeting_type,staff_email,staff_name,organizer_email,organizer_name,date,start_time,end_time,notes,location,status,reminder_sent_at',
    status: 'eq.scheduled',
    date: `gte.${fromDate}`,
  })
  query.append('date', `lte.${toDate}`)
  query.append('order', 'date.asc')
  query.append('order', 'start_time.asc')
  return supabaseFetch(env, `/rest/v1/staff_meetings?${query.toString()}`)
}

async function fetchProfile(env, email) {
  const safeEmail = String(email || '').toLowerCase().trim()
  if (!safeEmail) return null

  const query = new URLSearchParams({
    select: 'user_email,full_name,phone',
    user_email: `ilike.${safeEmail}`,
    limit: '1',
  })
  const rows = await supabaseFetch(env, `/rest/v1/hr_profiles?${query.toString()}`)
  return Array.isArray(rows) ? rows[0] || null : null
}

async function patchMeeting(env, id, payload) {
  await supabaseFetch(env, `/rest/v1/staff_meetings?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  })
}

async function insertSmsLog(env, row) {
  await supabaseFetch(env, '/rest/v1/sms_logs', {
    method: 'POST',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify([row]),
  })
}

async function sendSms(env, meeting, profile) {
  const username = env.CLICKSEND_USERNAME
  const apiKey = env.CLICKSEND_API_KEY
  const senderId = normalizeSenderId(env.CLICKSEND_SENDER_ID || DEFAULT_SENDER_ID)
  const to = normalizePhone(profile?.phone || '')

  if (!username || !apiKey) {
    throw new Error('ClickSend credentials are not configured.')
  }
  if (!to) {
    throw new Error('Staff member does not have a valid phone number.')
  }

  const body = buildReminderBody(meeting)
  const response = await fetch(CLICKSEND_SMS_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(username, apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          source: 'javascript',
          to,
          body,
          from: senderId,
          custom_string: meeting.staff_email || meeting.id,
        },
      ],
    }),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.response_msg || data?.error || 'ClickSend request failed.')
  }

  const providerMessage = Array.isArray(data?.data?.messages) ? data.data.messages[0] || {} : {}
  await insertSmsLog(env, {
    recipient_phone: to,
    recipient_name: profile?.full_name || meeting.staff_name || meeting.staff_email || null,
    recipient_email: meeting.staff_email || null,
    sender_id: senderId,
    message: body,
    category: 'appointments',
    provider: 'clicksend',
    provider_message_id: providerMessage.message_id || providerMessage.messageid || null,
    status: providerMessage.status || providerMessage.message_status || 'queued',
    sent_by_email: meeting.organizer_email || 'system',
    sent_by_name: 'Meeting reminder worker',
    audience_type: 'meeting_reminder',
    metadata: {
      meeting_id: meeting.id,
      meeting_title: meeting.title,
      meeting_date: meeting.date,
      meeting_start_time: meeting.start_time,
      reminder_type: '30_minute',
      provider_response: providerMessage,
    },
    created_at: new Date().toISOString(),
  })
}

function isReminderEligible(meeting, now) {
  if (!meeting?.date || !meeting?.start_time || meeting?.reminder_sent_at) return false
  const startAt = zonedDateTimeToUtc(meeting.date, meeting.start_time)
  const diff = startAt.getTime() - now.getTime()
  return diff > 0 && diff <= REMINDER_WINDOW_MS
}

async function processMeeting(env, meeting, now) {
  const profile = await fetchProfile(env, meeting.staff_email)
  if (!profile?.phone) {
    await patchMeeting(env, meeting.id, {
      reminder_last_checked_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    return { id: meeting.id, status: 'skipped', reason: 'missing_phone' }
  }

  await sendSms(env, meeting, profile)
  await patchMeeting(env, meeting.id, {
    reminder_sent_at: now.toISOString(),
    reminder_last_checked_at: now.toISOString(),
    updated_at: now.toISOString(),
  })

  return { id: meeting.id, status: 'sent', staff_email: meeting.staff_email }
}

async function runMeetingReminders(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase credentials are not configured.')
  }

  const now = new Date()
  const meetings = await fetchUpcomingMeetings(env, now)
  const eligible = (Array.isArray(meetings) ? meetings : []).filter((meeting) => isReminderEligible(meeting, now))
  const results = []

  for (const meeting of eligible) {
    try {
      results.push(await processMeeting(env, meeting, now))
    } catch (error) {
      results.push({
        id: meeting.id,
        status: 'error',
        reason: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return {
    scanned: Array.isArray(meetings) ? meetings.length : 0,
    eligible: eligible.length,
    sent: results.filter((item) => item.status === 'sent').length,
    skipped: results.filter((item) => item.status === 'skipped').length,
    errors: results.filter((item) => item.status === 'error').length,
    results,
  }
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runMeetingReminders(env))
  },

  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, worker: 'meeting-reminders' })
    }

    if (request.method === 'POST' && url.pathname === '/run') {
      const expectedToken = String(env.MEETING_REMINDER_SECRET || '').trim()
      const providedToken = request.headers.get('x-reminder-secret') || ''

      if (expectedToken && providedToken !== expectedToken) {
        return json({ error: 'Unauthorized.' }, 401)
      }

      try {
        const result = await runMeetingReminders(env)
        return json({ ok: true, ...result })
      } catch (error) {
        return json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500)
      }
    }

    return json({ error: 'Not found.' }, 404)
  },
}
