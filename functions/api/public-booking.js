const DEFAULT_ALLOWED_ORIGINS = [
  'https://staff.dhwebsiteservices.co.uk',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

const DEFAULT_EMAIL_WORKER_URL = 'https://dh-email-worker.aged-silence-66a7.workers.dev'
const DEFAULT_SUPABASE_URL = 'https://xtunnfdwltfesscmpove.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function getAllowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS)
}

function resolveRequestOrigin(request) {
  const origin = request.headers.get('origin')
  if (origin) return origin
  const referer = request.headers.get('referer')
  if (!referer) return ''
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

function isAllowedOrigin(request, env) {
  const origin = resolveRequestOrigin(request)
  if (!origin) return false
  return getAllowedOrigins(env).has(origin)
}

function normalizeStaffEmail(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeSlugPart(value = '') {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildBookingSlug(fullName = '', email = '') {
  const safeName = normalizeSlugPart(fullName)
  if (safeName) return safeName
  const localPart = String(email || '').split('@')[0] || ''
  return normalizeSlugPart(localPart) || 'staff'
}

function isoLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMins(time, mins) {
  const [h, m] = String(time || '00:00').split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function buildWindowSlots(start, end) {
  if (!start || !end) return []
  const slots = []
  let current = start
  while (addMins(current, 30) <= end) {
    slots.push(current)
    current = addMins(current, 30)
  }
  return slots
}

function getScheduleWeekStart(dateStr) {
  const dt = new Date(`${dateStr}T12:00:00`)
  const day = dt.getDay()
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
  dt.setDate(diff)
  dt.setHours(0, 0, 0, 0)
  return dt.toISOString().split('T')[0]
}

function dayName(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })
}

function buildLifecycleStateMap(rows = []) {
  const map = new Map()
  for (const row of rows) {
    const key = String(row?.key || '')
    if (!key.startsWith('staff_lifecycle:')) continue
    const email = normalizeStaffEmail(key.replace('staff_lifecycle:', ''))
    const value = row?.value && typeof row.value === 'object' ? row.value : {}
    map.set(email, String(value.state || '').trim().toLowerCase())
  }
  return map
}

function isSchedulableStaffEmail(email = '', lifecycleStateMap = new Map()) {
  const normalized = normalizeStaffEmail(email)
  if (!normalized) return false
  const state = String(lifecycleStateMap.get(normalized) || '').toLowerCase()
  return !['terminated', 'termination_approved', 'left', 'archived'].includes(state)
}

function resolveSupabaseConfig(env) {
  const url = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim()
  const key = String(
    env.SUPABASE_SERVICE_ROLE_KEY
    || env.SUPABASE_ANON_KEY
    || env.VITE_SUPABASE_ANON_KEY
    || env.VITE_SUPABASE_ANON
    || DEFAULT_SUPABASE_ANON_KEY
    || ''
  ).trim()
  return { url, key }
}

async function supabaseFetch(env, path, options = {}) {
  const { url, key } = resolveSupabaseConfig(env)
  if (!url || !key) {
    throw new Error('Booking service is not configured.')
  }

  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Supabase request failed (${response.status}): ${errorText}`)
  }

  if (response.status === 204) return null
  return response.json().catch(() => null)
}

async function sendWorkerEmail(env, payload) {
  const workerUrl = String(env.EMAIL_WORKER_URL || DEFAULT_EMAIL_WORKER_URL).trim()
  if (!workerUrl) return false
  const response = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return response.ok
}

async function resolveBookableStaff(env, slug) {
  const today = isoLocalDate(new Date())
  const end = isoLocalDate(addDays(new Date(), 13))
  const weekStarts = Array.from(new Set(
    Array.from({ length: 14 }, (_, index) => getScheduleWeekStart(isoLocalDate(addDays(new Date(), index))))
  ))

  const [profiles, permissions, lifecycleRows] = await Promise.all([
    supabaseFetch(env, '/rest/v1/hr_profiles?select=user_email,full_name,role,phone,bookable&order=full_name.asc'),
    supabaseFetch(env, '/rest/v1/user_permissions?select=user_email,bookable_staff'),
    supabaseFetch(env, '/rest/v1/portal_settings?select=key,value&key=like.staff_lifecycle:%'),
  ])

  const lifecycleMap = buildLifecycleStateMap(lifecycleRows || [])
  const bookableEmails = new Set()

  for (const item of profiles || []) {
    const email = normalizeStaffEmail(item.user_email)
    if (!isSchedulableStaffEmail(email, lifecycleMap)) continue
    if (item.bookable) bookableEmails.add(email)
  }
  for (const item of permissions || []) {
    const email = normalizeStaffEmail(item.user_email)
    if (!isSchedulableStaffEmail(email, lifecycleMap)) continue
    if (item.bookable_staff) bookableEmails.add(email)
  }

  const staffRows = (profiles || [])
    .filter((item) => {
      const email = normalizeStaffEmail(item.user_email)
      return email && bookableEmails.has(email)
    })
    .map((item) => ({
      email: normalizeStaffEmail(item.user_email),
      full_name: item.full_name || item.user_email,
      role: item.role || '',
      phone: item.phone || '',
      slug: buildBookingSlug(item.full_name || '', item.user_email || ''),
    }))

  return {
    lifecycleMap,
    staff: staffRows,
    match: staffRows.find((item) => item.slug === slug) || null,
    today,
    end,
    weekStarts,
  }
}

function formatDate(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

async function loadPublicAvailability(env, staffEmail, today, end, weekStarts, lifecycleMap) {
  const encodedEmail = encodeURIComponent(staffEmail)
  const [availRows, appointmentRows, meetingRows, scheduleRows] = await Promise.all([
    supabaseFetch(env, `/rest/v1/staff_availability?select=staff_email,date,is_available,start_time,end_time,slots&staff_email=eq.${encodedEmail}&date=gte.${today}&date=lte.${end}`),
    supabaseFetch(env, `/rest/v1/appointments?select=staff_email,date,start_time,status&staff_email=eq.${encodedEmail}&date=gte.${today}&date=lte.${end}&status=neq.cancelled`),
    supabaseFetch(env, `/rest/v1/staff_meetings?select=staff_email,date,start_time,status&staff_email=eq.${encodedEmail}&date=gte.${today}&date=lte.${end}&status=neq.cancelled`),
    supabaseFetch(env, `/rest/v1/schedules?select=user_email,week_start,submitted,week_data&user_email=eq.${encodedEmail}&submitted=eq.true&week_start=in.(${weekStarts.join(',')})`),
  ])

  const explicitMap = new Map(
    (availRows || [])
      .filter((item) => isSchedulableStaffEmail(item.staff_email, lifecycleMap))
      .map((item) => [`${normalizeStaffEmail(item.staff_email)}::${item.date}`, item])
  )
  const scheduleMap = new Map((scheduleRows || []).map((row) => [row.week_start, row]))
  const takenSlots = new Set()

  for (const row of appointmentRows || []) {
    takenSlots.add(`${row.date}::${row.start_time}`)
  }
  for (const row of meetingRows || []) {
    takenSlots.add(`${row.date}::${row.start_time}`)
  }

  const days = []
  for (let index = 0; index < 14; index += 1) {
    const date = isoLocalDate(addDays(new Date(), index))
    const explicit = explicitMap.get(`${staffEmail}::${date}`)
    let slots = []

    if (explicit) {
      if (explicit.is_available === false) {
        days.push({ date, label: formatDate(date), slots: [] })
        continue
      }
      if (Array.isArray(explicit.slots) && explicit.slots.length) {
        slots = explicit.slots
      } else if (explicit.start_time && explicit.end_time) {
        slots = buildWindowSlots(explicit.start_time, explicit.end_time)
      }
    } else {
      const schedule = scheduleMap.get(getScheduleWeekStart(date))
      const entry = schedule?.week_data?.[dayName(date)]
      if (entry?.start && entry?.end) {
        slots = buildWindowSlots(entry.start, entry.end)
      }
    }

    const openSlots = slots.filter((slot) => !takenSlots.has(`${date}::${slot}`))
    days.push({
      date,
      label: formatDate(date),
      slots: openSlots,
    })
  }

  return days.filter((day) => day.slots.length)
}

export async function onRequestGet(context) {
  if (!isAllowedOrigin(context.request, context.env)) {
    return json({ error: 'Origin is not allowed.' }, 403)
  }
  const { url, key } = resolveSupabaseConfig(context.env)
  if (!url || !key) {
    return json({ error: 'Booking service is not configured.' }, 500)
  }

  try {
    const url = new URL(context.request.url)
    const slug = normalizeSlugPart(url.searchParams.get('slug') || '')
    if (!slug) return json({ error: 'Missing booking slug.' }, 400)

    const { lifecycleMap, match, today, end, weekStarts } = await resolveBookableStaff(context.env, slug)
    if (!match) return json({ error: 'No matching bookable staff member found.' }, 404)

    const availability = await loadPublicAvailability(context.env, match.email, today, end, weekStarts, lifecycleMap)
    return json({
      staff: {
        email: match.email,
        full_name: match.full_name,
        first_name: String(match.full_name || '').split(' ')[0] || 'Staff member',
        role: match.role,
        slug: match.slug,
      },
      availability,
    })
  } catch (error) {
    console.warn('Public booking GET failed:', error)
    return json({ error: error?.message || 'public_booking_fetch_failed' }, 500)
  }
}

export async function onRequestPost(context) {
  if (!isAllowedOrigin(context.request, context.env)) {
    return json({ error: 'Origin is not allowed.' }, 403)
  }
  const { url, key } = resolveSupabaseConfig(context.env)
  if (!url || !key) {
    return json({ error: 'Booking service is not configured.' }, 500)
  }

  let payload
  try {
    payload = await context.request.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  const slug = normalizeSlugPart(payload?.slug || '')
  const clientName = String(payload?.client_name || '').trim()
  const clientEmail = String(payload?.client_email || '').trim().toLowerCase()
  const clientBusiness = String(payload?.client_business || '').trim()
  const clientPhone = String(payload?.client_phone || '').trim()
  const notes = String(payload?.notes || '').trim()
  const date = String(payload?.date || '').trim()
  const startTime = String(payload?.start_time || '').trim()

  if (!slug || !clientName || !clientEmail || !date || !startTime) {
    return json({ error: 'Missing required booking details.' }, 400)
  }

  try {
    const { lifecycleMap, match, today, end, weekStarts } = await resolveBookableStaff(context.env, slug)
    if (!match) return json({ error: 'No matching bookable staff member found.' }, 404)

    const availability = await loadPublicAvailability(context.env, match.email, today, end, weekStarts, lifecycleMap)
    const day = availability.find((item) => item.date === date)
    if (!day || !day.slots.includes(startTime)) {
      return json({ error: 'That slot is no longer available.' }, 409)
    }

    const endTime = addMins(startTime, 30)
    const bookingPayload = {
      client_name: clientName,
      client_email: clientEmail,
      client_business: clientBusiness || null,
      client_phone: clientPhone || null,
      notes: notes || null,
      staff_email: match.email,
      staff_name: match.full_name,
      date,
      start_time: startTime,
      end_time: endTime,
      duration: 30,
      status: 'confirmed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source: 'public_booking_link',
    }

    const created = await supabaseFetch(context.env, '/rest/v1/appointments', {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify([bookingPayload]),
    })

    const appointment = Array.isArray(created) ? created[0] : created

    const staffEmailPayload = {
      type: 'custom_email',
      data: {
        to: match.email,
        subject: `New call booked with ${clientName}`,
        html: `
          <p>Hi ${String(match.full_name || '').split(' ')[0] || 'there'},</p>
          <p>A new call has been booked through your shared booking link.</p>
          <p><strong>${clientName}</strong>${clientBusiness ? `<br/>${clientBusiness}` : ''}<br/>${clientEmail}${clientPhone ? `<br/>${clientPhone}` : ''}</p>
          <p><strong>${formatDate(date)}</strong><br/>${startTime} - ${endTime}</p>
          ${notes ? `<p>${notes.replace(/\n/g, '<br/>')}</p>` : ''}
          <p><a href="https://staff.dhwebsiteservices.co.uk/appointments" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open appointments</a></p>
        `,
      },
    }
    const clientEmailPayload = {
      type: 'custom_email',
      data: {
        to: clientEmail,
        subject: `Your call with ${match.full_name} is booked`,
        html: `
          <p>Hi ${clientName.split(' ')[0] || 'there'},</p>
          <p>Your call has been booked successfully.</p>
          <p><strong>${match.full_name}</strong>${match.role ? `<br/>${match.role}` : ''}<br/>${formatDate(date)}<br/>${startTime} - ${endTime}</p>
          <p>If you need to make any changes, reply to this email.</p>
        `,
      },
    }

    await Promise.allSettled([
      sendWorkerEmail(context.env, staffEmailPayload),
      sendWorkerEmail(context.env, clientEmailPayload),
    ])

    return json({ ok: true, appointment })
  } catch (error) {
    console.warn('Public booking POST failed:', error)
    return json({ error: error?.message || 'public_booking_create_failed' }, 500)
  }
}
