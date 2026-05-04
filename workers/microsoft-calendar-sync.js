const OUTLOOK_TIMEZONE = 'GMT Standard Time'
const PORTAL_TIME_ZONE = 'Europe/London'
const LOOKBACK_DAYS = 7
const LOOKAHEAD_DAYS = 42
const MAX_JOBS_PER_RUN = 20
const PORTAL_MEETING_CATEGORY = 'DH Portal Meeting'
const PORTAL_SCHEDULE_CATEGORY = 'DH Portal Schedule'
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function authorizeManualRun(request, secretValue, headerName) {
  const expectedToken = String(secretValue || '').trim()
  if (!expectedToken) {
    return json({ error: 'Manual run secret is not configured.' }, 503)
  }
  const providedToken = request.headers.get(headerName) || ''
  if (providedToken !== expectedToken) {
    return json({ error: 'Unauthorized.' }, 401)
  }
  return null
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

async function getGraphAccessToken(env) {
  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    client_secret: env.MICROSOFT_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })

  const response = await fetch(`https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!response.ok) {
    throw new Error(`Microsoft token request failed (${response.status})`)
  }

  const data = await response.json()
  if (!data?.access_token) throw new Error('Microsoft token response did not include an access token.')
  return data.access_token
}

async function graphFetch(env, token, path, options = {}) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: `outlook.timezone="${OUTLOOK_TIMEZONE}"`,
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Graph request failed (${response.status}) ${path}: ${errorText}`)
  }

  if (response.status === 204) return null
  return response.json().catch(() => null)
}

function isoLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`)
  date.setDate(date.getDate() + days)
  return isoLocalDate(date)
}

function formatDateParts(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: PORTAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value
    return acc
  }, {})
}

function parseGraphDateTime(dateTime) {
  if (!dateTime) return null
  const parsed = new Date(dateTime)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function graphEventToPortalMeeting(event, staffEmail) {
  const startAt = parseGraphDateTime(event.start?.dateTime)
  const endAt = parseGraphDateTime(event.end?.dateTime)
  if (!startAt || event.isAllDay) return null

  const startParts = formatDateParts(startAt)
  const endParts = endAt ? formatDateParts(endAt) : startParts

  return {
    title: event.subject || 'Microsoft calendar event',
    meeting_with_name: event.organizer?.emailAddress?.name || event.organizer?.emailAddress?.address || null,
    meeting_type: 'microsoft',
    staff_email: staffEmail,
    staff_name: null,
    organizer_email: event.organizer?.emailAddress?.address || null,
    organizer_name: event.organizer?.emailAddress?.name || null,
    date: `${startParts.year}-${startParts.month}-${startParts.day}`,
    start_time: `${startParts.hour}:${startParts.minute}`,
    end_time: `${endParts.hour}:${endParts.minute}`,
    location: event.location?.displayName || null,
    notes: event.bodyPreview || null,
    status: 'scheduled',
    sync_source: 'microsoft',
    microsoft_event_id: event.id,
    microsoft_calendar_id: event.calendar?.id || null,
    sync_status: 'synced',
    sync_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function hashPayload(payload) {
  return JSON.stringify(payload)
}

function scheduleDateForDay(weekStart, dayName) {
  const index = DAYS.indexOf(dayName)
  if (index === -1) return null
  return addDays(weekStart, index)
}

function buildMeetingGraphEvent(meeting) {
  return {
    subject: meeting.title || 'Portal meeting',
    start: {
      dateTime: `${meeting.date}T${meeting.start_time}:00`,
      timeZone: OUTLOOK_TIMEZONE,
    },
    end: {
      dateTime: `${meeting.date}T${meeting.end_time}:00`,
      timeZone: OUTLOOK_TIMEZONE,
    },
    location: meeting.location ? { displayName: meeting.location } : undefined,
    body: {
      contentType: 'HTML',
      content: [
        `<p>${meeting.notes || 'Scheduled in DH Portal.'}</p>`,
        `<p><strong>Assigned staff:</strong> ${meeting.staff_name || meeting.staff_email || ''}</p>`,
        meeting.meeting_with_name ? `<p><strong>With:</strong> ${meeting.meeting_with_name}</p>` : '',
      ].filter(Boolean).join(''),
    },
    categories: [PORTAL_MEETING_CATEGORY],
  }
}

function buildScheduleGraphEvent(schedule, dayName, entry, shiftDate) {
  return {
    subject: `Shift: ${schedule.user_name || schedule.user_email}`,
    start: {
      dateTime: `${shiftDate}T${entry.start}:00`,
      timeZone: OUTLOOK_TIMEZONE,
    },
    end: {
      dateTime: `${shiftDate}T${entry.end}:00`,
      timeZone: OUTLOOK_TIMEZONE,
    },
    body: {
      contentType: 'HTML',
      content: [
        `<p>Shift synced from DH Portal rota.</p>`,
        `<p><strong>Staff:</strong> ${schedule.user_name || schedule.user_email}</p>`,
        `<p><strong>Day:</strong> ${dayName}</p>`,
        entry.note ? `<p><strong>Note:</strong> ${entry.note}</p>` : '',
      ].filter(Boolean).join(''),
    },
    categories: [PORTAL_SCHEDULE_CATEGORY],
  }
}

async function fetchConnections(env) {
  const query = new URLSearchParams({
    select: '*',
    sync_enabled: 'eq.true',
  })
  return supabaseFetch(env, `/rest/v1/microsoft_calendar_connections?${query.toString()}`)
}

async function fetchConnectionByStaffEmail(env, staffEmail) {
  const safe = String(staffEmail || '').trim().toLowerCase()
  if (!safe) return null
  const query = new URLSearchParams({
    select: '*',
    staff_email: `eq.${safe}`,
    limit: '1',
  })
  const rows = await supabaseFetch(env, `/rest/v1/microsoft_calendar_connections?${query.toString()}`)
  return Array.isArray(rows) ? rows[0] || null : null
}

async function patchConnection(env, id, payload) {
  await supabaseFetch(env, `/rest/v1/microsoft_calendar_connections?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  })
}

async function ensureCalendarTarget(env, token, connection) {
  const userPrincipal = connection.microsoft_user_principal_name || connection.staff_email
  let calendarId = connection.calendar_id

  if (!calendarId) {
    const calendar = await graphFetch(env, token, `/users/${encodeURIComponent(userPrincipal)}/calendar?$select=id,name`)
    calendarId = calendar?.id
    if (connection.id && calendarId) {
      await patchConnection(env, connection.id, {
        calendar_id: calendarId,
        calendar_name: calendar?.name || 'Calendar',
        updated_at: new Date().toISOString(),
      })
    }
  }

  if (!userPrincipal || !calendarId) {
    throw new Error(`Calendar target is incomplete for ${connection.staff_email}.`)
  }

  return { userPrincipal, calendarId }
}

async function fetchPendingJobs(env, limit = MAX_JOBS_PER_RUN) {
  const query = new URLSearchParams({
    select: '*',
    status: 'eq.pending',
    order: 'created_at.asc',
    limit: String(limit),
  })
  return supabaseFetch(env, `/rest/v1/microsoft_calendar_sync_jobs?${query.toString()}`)
}

async function patchJob(env, id, payload) {
  await supabaseFetch(env, `/rest/v1/microsoft_calendar_sync_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  })
}

async function fetchSchedule(env, id) {
  const query = new URLSearchParams({
    select: '*',
    id: `eq.${id}`,
    limit: '1',
  })
  const rows = await supabaseFetch(env, `/rest/v1/schedules?${query.toString()}`)
  return Array.isArray(rows) ? rows[0] || null : null
}

async function fetchMeeting(env, id) {
  const query = new URLSearchParams({
    select: '*',
    id: `eq.${id}`,
    limit: '1',
  })
  const rows = await supabaseFetch(env, `/rest/v1/staff_meetings?${query.toString()}`)
  return Array.isArray(rows) ? rows[0] || null : null
}

async function patchMeeting(env, id, payload) {
  await supabaseFetch(env, `/rest/v1/staff_meetings?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  })
}

async function insertMeeting(env, payload) {
  const rows = await supabaseFetch(env, '/rest/v1/staff_meetings', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([payload]),
  })
  return Array.isArray(rows) ? rows[0] || null : null
}

async function fetchLinkBySource(env, sourceTable, sourceId) {
  const query = new URLSearchParams({
    select: '*',
    source_table: `eq.${sourceTable}`,
    source_id: `eq.${sourceId}`,
    limit: '1',
  })
  const rows = await supabaseFetch(env, `/rest/v1/microsoft_calendar_sync_links?${query.toString()}`)
  return Array.isArray(rows) ? rows[0] || null : null
}

async function fetchLinksByPrefix(env, sourceTable, prefix) {
  const query = new URLSearchParams({
    select: '*',
    source_table: `eq.${sourceTable}`,
    source_id: `like.${prefix}%`,
  })
  return supabaseFetch(env, `/rest/v1/microsoft_calendar_sync_links?${query.toString()}`)
}

async function fetchLinkByMicrosoftEventId(env, eventId) {
  const query = new URLSearchParams({
    select: '*',
    microsoft_event_id: `eq.${eventId}`,
    limit: '1',
  })
  const rows = await supabaseFetch(env, `/rest/v1/microsoft_calendar_sync_links?${query.toString()}`)
  return Array.isArray(rows) ? rows[0] || null : null
}

async function upsertLink(env, row) {
  const query = new URLSearchParams({ on_conflict: 'source_table,source_id' })
  await supabaseFetch(env, `/rest/v1/microsoft_calendar_sync_links?${query.toString()}`, {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([row]),
  })
}

async function deleteLink(env, id) {
  await supabaseFetch(env, `/rest/v1/microsoft_calendar_sync_links?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })
}

async function deleteGraphEvent(env, token, userPrincipal, calendarId, eventId) {
  await graphFetch(env, token, `/users/${encodeURIComponent(userPrincipal)}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  })
}

async function upsertGraphEvent(env, token, userPrincipal, calendarId, eventId, payload) {
  if (eventId) {
    await graphFetch(env, token, `/users/${encodeURIComponent(userPrincipal)}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    return { id: eventId }
  }

  return graphFetch(env, token, `/users/${encodeURIComponent(userPrincipal)}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

async function syncMeetingToMicrosoft(env, token, connection, meeting) {
  const target = await ensureCalendarTarget(env, token, connection)
  const link = await fetchLinkBySource(env, 'staff_meetings', meeting.id)
  const event = await upsertGraphEvent(env, token, target.userPrincipal, target.calendarId, link?.microsoft_event_id || meeting.microsoft_event_id || null, buildMeetingGraphEvent(meeting))
  const now = new Date().toISOString()

  await upsertLink(env, {
    connection_id: connection.id || null,
    staff_email: connection.staff_email,
    source_table: 'staff_meetings',
    source_id: meeting.id,
    microsoft_event_id: event.id,
    microsoft_calendar_id: target.calendarId,
    source_hash: hashPayload(meeting),
    sync_direction: connection.sync_direction || 'bidirectional',
    portal_last_seen_at: now,
    microsoft_last_seen_at: now,
    updated_at: now,
  })

  await patchMeeting(env, meeting.id, {
    microsoft_event_id: event.id,
    microsoft_calendar_id: target.calendarId,
    sync_status: 'synced',
    sync_updated_at: now,
    updated_at: now,
  })

  await patchConnection(env, connection.id, {
    last_push_at: now,
    last_error: null,
    updated_at: now,
  })
}

async function syncMeetingCancellation(env, token, connection, job) {
  const link = await fetchLinkBySource(env, 'staff_meetings', job.source_id)
  if (!link) return
  const target = await ensureCalendarTarget(env, token, connection)
  await deleteGraphEvent(env, token, target.userPrincipal, link.microsoft_calendar_id || target.calendarId, link.microsoft_event_id)
  await deleteLink(env, link.id)
}

async function syncScheduleToMicrosoft(env, token, connection, schedule) {
  const target = await ensureCalendarTarget(env, token, connection)
  const now = new Date().toISOString()
  const prefix = `schedule:${schedule.id}:`
  const fetchedLinks = await fetchLinksByPrefix(env, 'schedule_shift', prefix)
  const existingLinks = Array.isArray(fetchedLinks) ? fetchedLinks : []
  const nextSourceIds = new Set()
  const weekData = schedule.week_data || {}

  for (const dayName of DAYS) {
    const entry = weekData[dayName]
    const shiftDate = scheduleDateForDay(schedule.week_start, dayName)
    if (!shiftDate) continue
    const sourceId = `${prefix}${shiftDate}`

    if (!schedule.submitted || !entry?.start || !entry?.end) {
      continue
    }

    const link = existingLinks.find((row) => row.source_id === sourceId)
    const event = await upsertGraphEvent(
      env,
      token,
      target.userPrincipal,
      target.calendarId,
      link?.microsoft_event_id || null,
      buildScheduleGraphEvent(schedule, dayName, entry, shiftDate)
    )

    await upsertLink(env, {
      connection_id: connection.id || null,
      staff_email: connection.staff_email,
      source_table: 'schedule_shift',
      source_id: sourceId,
      microsoft_event_id: event.id,
      microsoft_calendar_id: target.calendarId,
      source_hash: hashPayload(entry),
      sync_direction: 'portal_to_microsoft',
      portal_last_seen_at: now,
      microsoft_last_seen_at: now,
      updated_at: now,
    })
    nextSourceIds.add(sourceId)
  }

  for (const link of existingLinks) {
    if (nextSourceIds.has(link.source_id)) continue
    await deleteGraphEvent(env, token, target.userPrincipal, link.microsoft_calendar_id || target.calendarId, link.microsoft_event_id)
    await deleteLink(env, link.id)
  }

  await patchConnection(env, connection.id, {
    last_push_at: now,
    last_error: null,
    updated_at: now,
  })
}

async function pullMicrosoftCalendarIntoPortal(env, token, connection) {
  const target = await ensureCalendarTarget(env, token, connection)
  const today = isoLocalDate(new Date())
  const startDateTime = `${addDays(today, -LOOKBACK_DAYS)}T00:00:00`
  const endDateTime = `${addDays(today, LOOKAHEAD_DAYS)}T23:59:59`
  const query = new URLSearchParams({
    startDateTime,
    endDateTime,
    $select: 'id,subject,start,end,location,organizer,bodyPreview,isAllDay,categories',
    $orderby: 'start/dateTime',
  })

  const now = new Date().toISOString()
  const response = await graphFetch(env, token, `/users/${encodeURIComponent(target.userPrincipal)}/calendars/${encodeURIComponent(target.calendarId)}/calendarView?${query.toString()}`)
  const events = Array.isArray(response?.value) ? response.value : []

  for (const event of events) {
    const categories = Array.isArray(event.categories) ? event.categories : []
    const link = await fetchLinkByMicrosoftEventId(env, event.id)

    if (!link && categories.includes(PORTAL_SCHEDULE_CATEGORY)) continue

    const normalized = graphEventToPortalMeeting(event, connection.staff_email)
    if (!normalized) continue

    if (link?.source_table === 'staff_meetings') {
      await patchMeeting(env, link.source_id, {
        ...normalized,
        staff_name: normalized.staff_name,
      })
      await upsertLink(env, {
        ...link,
        updated_at: now,
        microsoft_last_seen_at: now,
      })
      continue
    }

    if (!link) {
      const inserted = await insertMeeting(env, normalized)
      if (!inserted?.id) continue

      await upsertLink(env, {
        connection_id: connection.id || null,
        staff_email: connection.staff_email,
        source_table: 'staff_meetings',
        source_id: inserted.id,
        microsoft_event_id: event.id,
        microsoft_calendar_id: target.calendarId,
        source_hash: hashPayload(normalized),
        sync_direction: connection.sync_direction || 'bidirectional',
        portal_last_seen_at: now,
        microsoft_last_seen_at: now,
        updated_at: now,
      })
    }
  }

  await patchConnection(env, connection.id, {
    last_pull_started_at: now,
    last_synced_at: now,
    last_error: null,
    updated_at: now,
  })
}

async function processJob(env, token, job) {
  const connection = await fetchConnectionByStaffEmail(env, job.staff_email)
  if (!connection?.sync_enabled) {
    throw new Error(`No active Microsoft calendar connection exists for ${job.staff_email}.`)
  }

  if (job.job_type === 'meeting_upsert') {
    if (!connection.sync_meetings || !connection.sync_portal_to_microsoft) return
    const meeting = await fetchMeeting(env, job.source_id)
    if (!meeting || meeting.status === 'cancelled') return
    await syncMeetingToMicrosoft(env, token, connection, meeting)
    return
  }

  if (job.job_type === 'meeting_cancel') {
    if (!connection.sync_meetings || !connection.sync_portal_to_microsoft) return
    await syncMeetingCancellation(env, token, connection, job)
    return
  }

  if (job.job_type === 'schedule_upsert') {
    if (!connection.sync_rota || !connection.sync_portal_to_microsoft) return
    const schedule = await fetchSchedule(env, job.source_id)
    if (!schedule) return
    await syncScheduleToMicrosoft(env, token, connection, schedule)
    return
  }

  throw new Error(`Unsupported sync job type: ${job.job_type}`)
}

async function runSync(env) {
  const token = await getGraphAccessToken(env)
  const fetchedJobs = await fetchPendingJobs(env)
  const jobs = Array.isArray(fetchedJobs) ? fetchedJobs : []
  const results = []

  for (const job of jobs) {
    await patchJob(env, job.id, {
      status: 'processing',
      locked_at: new Date().toISOString(),
      attempts: Number(job.attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    })

    try {
      await processJob(env, token, job)
      await patchJob(env, job.id, {
        status: 'processed',
        processed_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      results.push({ id: job.id, status: 'processed', job_type: job.job_type })
    } catch (error) {
      await patchJob(env, job.id, {
        status: 'failed',
        last_error: error?.message || 'sync_failed',
        updated_at: new Date().toISOString(),
      })
      results.push({ id: job.id, status: 'failed', job_type: job.job_type, error: error?.message || 'sync_failed' })
    }
  }

  const fetchedConnections = await fetchConnections(env)
  const connections = Array.isArray(fetchedConnections) ? fetchedConnections : []
  for (const connection of connections) {
    if (!connection.sync_microsoft_to_portal || !connection.sync_meetings) continue
    try {
      await pullMicrosoftCalendarIntoPortal(env, token, connection)
      results.push({ staff_email: connection.staff_email, status: 'pulled' })
    } catch (error) {
      await patchConnection(env, connection.id, {
        last_error: error?.message || 'pull_failed',
        updated_at: new Date().toISOString(),
      })
      results.push({ staff_email: connection.staff_email, status: 'pull_failed', error: error?.message || 'pull_failed' })
    }
  }

  return results
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return json({ ok: true, worker: 'microsoft-calendar-sync' })
    }
    if (url.pathname === '/run-sync' && request.method === 'POST') {
      const authError = authorizeManualRun(request, env.MICROSOFT_CALENDAR_SYNC_SECRET, 'x-calendar-sync-secret')
      if (authError) return authError
      try {
        const results = await runSync(env)
        return json({ ok: true, results })
      } catch (error) {
        return json({ ok: false, error: error?.message || 'sync_failed' }, 500)
      }
    }
    return json({ ok: false, error: 'Not found' }, 404)
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runSync(env))
  },
}
