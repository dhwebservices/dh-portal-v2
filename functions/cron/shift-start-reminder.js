// Pre-shift clock-in reminder.
//
// Runs every 5 minutes and pushes "time to clock in" to anyone whose rota shift
// starts in roughly LEAD_MINUTES' time. Unlike the old daily 8am reminder this
// is targeted: it only reaches people who actually have a shift starting, and it
// stays quiet for anyone who has already clocked in.
//
// This is a real Worker (`export default { scheduled }`), not a Pages Function.
// The older functions/cron/daily-clock-in-reminder.js exports `onRequest`, which
// a cron trigger never calls - that reminder has never fired.
//
// Required environment variables (wrangler-shift-start-reminder.toml):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   APNS_KEY_ID, APNS_TEAM_ID, APNS_AUTH_KEY, APNS_BUNDLE_ID, APNS_ENVIRONMENT
// Optional:
//   SHIFT_REMINDER_LEAD_MINUTES - how far ahead to warn (default 10)

import { sendApnsNotification, getIosDeviceTokens, logPushNotification } from '../api/_apns.js'

const DEFAULT_LEAD_MINUTES = 10

// Must match the cron cadence in wrangler-shift-start-reminder.toml. The window
// is what stops a shift falling between two ticks and never being notified.
const WINDOW_MINUTES = 5

const TIMEZONE = 'Europe/London'

// Rota times are wall-clock UK time, but the worker runs in UTC and the UK
// changes offset twice a year. Read "now" through the London calendar rather
// than doing arithmetic on the UTC clock.
export function londonNow(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value
      return acc
    }, {})

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// '09:00' and '9:00 am' both appear in the wild depending on how the shift was
// created, so parse defensively and skip anything unreadable rather than
// guessing and notifying at the wrong time.
export function parseStartMinutes(startTime) {
  const raw = String(startTime || '').trim().toLowerCase()
  const match = raw.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?/)
  if (!match) return null

  let hours = Number(match[1])
  const minutes = Number(match[2])
  const meridiem = match[3]

  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes > 59) return null
  if (meridiem === 'pm' && hours < 12) hours += 12
  if (meridiem === 'am' && hours === 12) hours = 0
  if (hours > 23) return null

  return hours * 60 + minutes
}

async function supabaseGet(env, path) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
  if (!response.ok) {
    throw new Error(`Supabase GET ${path} failed: ${response.status} ${await response.text()}`)
  }
  return response.json()
}

async function markReminderSent(env, shiftId) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/shifts?id=eq.${shiftId}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ clock_in_reminder_sent_at: new Date().toISOString() }),
  })
}

// Respects the per-user "Push Notifications" toggle in mobile Settings, which
// lives in user_preferences.push_notifications. Missing row means the user has
// never changed the default, which is on.
async function pushEnabledFor(env, email) {
  const rows = await supabaseGet(
    env,
    `user_preferences?user_email=eq.${encodeURIComponent(email)}&select=push_notifications`,
  )
  return rows[0]?.push_notifications !== false
}

async function alreadyClockedIn(env, email, shiftDate) {
  const rows = await supabaseGet(
    env,
    `attendance?user_email=eq.${encodeURIComponent(email)}&date=eq.${shiftDate}` +
      `&clock_in=not.is.null&select=id&limit=1`,
  )
  return rows.length > 0
}

export async function sendShiftStartReminders(env, referenceDate = new Date()) {
  const leadMinutes = Number(env.SHIFT_REMINDER_LEAD_MINUTES) || DEFAULT_LEAD_MINUTES
  const now = londonNow(referenceDate)

  // A shift just after midnight is "tomorrow" by date but only minutes away, so
  // look at both days and rank candidates by how far off they actually are.
  const days = [
    { date: now.date, offset: 0 },
    { date: addDays(now.date, 1), offset: 1 },
  ]

  const candidates = []
  for (const day of days) {
    const shifts = await supabaseGet(
      env,
      `shifts?shift_date=eq.${day.date}&published=is.true&clock_in_reminder_sent_at=is.null` +
        `&select=id,employee_email,employee_name,shift_date,start_time`,
    )

    for (const shift of shifts) {
      const startMinutes = parseStartMinutes(shift.start_time)
      if (startMinutes === null) {
        console.warn(`Skipping shift ${shift.id}: unparseable start_time "${shift.start_time}"`)
        continue
      }
      if (!shift.employee_email) continue

      const minutesUntilStart = day.offset * 1440 + startMinutes - now.minutes
      if (minutesUntilStart >= leadMinutes && minutesUntilStart < leadMinutes + WINDOW_MINUTES) {
        candidates.push({ shift, minutesUntilStart })
      }
    }
  }

  const result = { checked: candidates.length, sent: 0, skipped: [], errors: [] }

  for (const { shift, minutesUntilStart } of candidates) {
    const email = shift.employee_email
    try {
      if (await alreadyClockedIn(env, email, shift.shift_date)) {
        // Mark it anyway - they are already at work, so a later tick shouldn't
        // catch this shift either.
        await markReminderSent(env, shift.id)
        result.skipped.push(`${email}: already clocked in`)
        continue
      }

      if (!(await pushEnabledFor(env, email))) {
        await markReminderSent(env, shift.id)
        result.skipped.push(`${email}: push notifications turned off`)
        continue
      }

      const tokens = await getIosDeviceTokens(email, env)
      if (tokens.length === 0) {
        result.skipped.push(`${email}: no registered devices`)
        continue
      }

      const notification = {
        title: 'Your shift starts soon',
        body: `Your shift starts at ${shift.start_time}. Tap to clock in \u{1F4CD}`,
        data: {
          type: 'shift_start_reminder',
          shift_id: shift.id,
          shift_date: shift.shift_date,
          start_time: shift.start_time,
          minutes_until_start: String(minutesUntilStart),
          click_action: 'https://staff.dhwebsiteservices.co.uk/clock-in',
        },
      }

      const results = await Promise.all(
        tokens.map((token) => sendApnsNotification(token, notification, env)),
      )
      const delivered = results.filter((r) => r.success).length
      const rejected = results.filter((r) => !r.success)

      await logPushNotification(email, 'shift_start_reminder', notification, delivered > 0, env)

      // Mark sent even if every token failed. A failed token is almost always a
      // stale device registration, and retrying every 5 minutes until the shift
      // starts would just spam the log.
      await markReminderSent(env, shift.id)

      result.sent += delivered

      // Report rejected tokens even when others succeeded. People accumulate
      // dead registrations from reinstalls, and a partial failure that only
      // shows up as a lower number is invisible until someone stops getting
      // notifications altogether.
      if (rejected.length) {
        const detail = rejected.map((r) => r.error).join('; ')
        result.errors.push(
          `${email}: ${rejected.length}/${tokens.length} device(s) rejected - ${detail}`,
        )
      }
    } catch (error) {
      result.errors.push(`${email}: ${error.message}`)
    }
  }

  console.log(
    `Shift reminders: ${result.checked} due, ${result.sent} sent, ` +
      `${result.skipped.length} skipped, ${result.errors.length} errored`,
  )

  return result
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendShiftStartReminders(env))
  },

  // Manual trigger for testing: GET the worker URL. Guarded so it can't be used
  // to force sends from outside.
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!env.CRON_TEST_SECRET || url.searchParams.get('secret') !== env.CRON_TEST_SECRET) {
      return new Response('Not found', { status: 404 })
    }

    const result = await sendShiftStartReminders(env)
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
}
