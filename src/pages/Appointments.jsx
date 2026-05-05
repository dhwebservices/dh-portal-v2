import { useState, useEffect, useCallback, useMemo } from 'react'
import { useMsal } from '@azure/msal-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { sendManagedNotification } from '../utils/notificationPreferences'
import { sendPortalSms } from '../utils/sms'
import { logAction } from '../utils/audit'
import { enqueueMicrosoftCalendarSyncJob } from '../utils/microsoftCalendarSyncQueue'
import { buildLifecycleStateMap, isSchedulableStaffEmail, normalizeStaffEmail } from '../utils/staffDirectory'
import { sendEmail } from '../utils/email'
import {
  acquireMicrosoftCalendarToken,
  fetchMicrosoftCalendars,
  fetchMicrosoftCalendarView,
} from '../utils/microsoftCalendar'
const PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'
const HOURS = Array.from({ length: 32 }, (_, i) => {
  const h = Math.floor(i / 2) + 9
  const m = i % 2 === 0 ? '00' : '30'
  return h < 17 ? `${String(h).padStart(2,'0')}:${m}` : null
}).filter(Boolean) // 09:00 - 16:30

function addMins(time, mins) {
  const [h,m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`
}

function formatDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' })
}

function isoLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function weekDays(anchor) {
  const d = new Date(anchor)
  d.setDate(d.getDate() - d.getDay() + 1) // Monday
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(d)
    dd.setDate(d.getDate() + i)
    return isoLocalDate(dd)
  })
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

function startsWithinWindow(appt, from, to) {
  return appt.date >= from && appt.date <= to
}

function formatMeetingDateTime(date, start, end) {
  return `${formatDate(date)} · ${start}${end ? ` - ${end}` : ''}`
}

function buildMeetingSmsMessage(meeting) {
  return [
    `DH Portal: ${meeting.title}.`,
    meeting.meeting_with_name ? `With ${meeting.meeting_with_name}.` : '',
    `At ${meeting.start_time}${meeting.end_time ? ` - ${meeting.end_time}` : ''} on ${formatDate(meeting.date)}.`,
    meeting.location ? `Location: ${meeting.location}.` : '',
    meeting.notes ? `Notes: ${meeting.notes}` : '',
  ].filter(Boolean).join(' ')
}

const EMPTY_MEETING = {
  title: '',
  meeting_with_name: '',
  meeting_type: 'internal',
  staff_email: '',
  date: new Date().toISOString().split('T')[0],
  start_time: '09:00',
  end_time: '09:30',
  location: '',
  notes: '',
}

export default function Appointments() {
  const { user, isAdmin } = useAuth()
  const { instance, accounts } = useMsal()
  const [tab, setTab] = useState('calendar')
  const [anchor, setAnchor] = useState(() => new Date().toISOString().split('T')[0])
  const [staffFilter, setStaffFilter] = useState('all')
  const [bookableStaff, setBookableStaff] = useState([])
  const [staffDirectory, setStaffDirectory] = useState([])
  const [availability, setAvailability] = useState([]) // staff_availability rows
  const [appointments, setAppointments] = useState([]) // appointments rows
  const [meetings, setMeetings] = useState([]) // staff_meetings rows
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null) // { date, staff, slot }
  const [detailAppt, setDetailAppt] = useState(null)
  const [slotModal, setSlotModal] = useState(null) // { date, staffEmail, staffName }
  const [meetingForm, setMeetingForm] = useState(EMPTY_MEETING)
  const [meetingSaving, setMeetingSaving] = useState(false)
  const [meetingFeedback, setMeetingFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [microsoftCalendars, setMicrosoftCalendars] = useState([])
  const [selectedMicrosoftCalendar, setSelectedMicrosoftCalendar] = useState('')
  const [microsoftEvents, setMicrosoftEvents] = useState([])
  const [microsoftStatus, setMicrosoftStatus] = useState('idle')
  const [microsoftError, setMicrosoftError] = useState('')

  const days = useMemo(() => weekDays(anchor), [anchor])
  const microsoftAccount = useMemo(() => {
    const userEmail = String(user?.email || '').toLowerCase()
    return accounts.find((account) => String(account.username || '').toLowerCase() === userEmail)
      || instance.getActiveAccount?.()
      || accounts[0]
      || null
  }, [accounts, instance, user?.email])

  const load = useCallback(async () => {
    setLoading(true)
    const from = days[0], to = days[6]
    const weekKey = getScheduleWeekStart(from)
    const [{ data: profiles }, { data: perms }, { data: schedules }, { data: avail }, { data: appts }, { data: meetingRows }, { data: lifecycleRows }] = await Promise.all([
      supabase.from('hr_profiles').select('user_email,full_name,role,bookable,phone').order('full_name'),
      supabase.from('user_permissions').select('user_email,bookable_staff').eq('bookable_staff', true),
      supabase.from('schedules').select('user_email,user_name,week_start,submitted,week_data').eq('week_start', weekKey).eq('submitted', true),
      supabase.from('staff_availability').select('*').gte('date', from).lte('date', to),
      supabase.from('appointments').select('*').gte('date', from).lte('date', to).neq('status','cancelled'),
      supabase.from('staff_meetings').select('*').gte('date', from).lte('date', to).neq('status','cancelled').order('date').order('start_time'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_lifecycle:%'),
    ])

    const lifecycleStateMap = buildLifecycleStateMap(lifecycleRows || [])
    const profileMap = new Map(
      (profiles || [])
        .filter((item) => isSchedulableStaffEmail(item.user_email, lifecycleStateMap))
        .map((item) => [normalizeStaffEmail(item.user_email), item])
    )
    const bookableEmails = new Set()

    for (const item of profiles || []) {
      const email = normalizeStaffEmail(item.user_email)
      if (!isSchedulableStaffEmail(email, lifecycleStateMap)) continue
      if (item.bookable) bookableEmails.add(email)
    }
    for (const item of perms || []) {
      const email = normalizeStaffEmail(item.user_email)
      if (!isSchedulableStaffEmail(email, lifecycleStateMap)) continue
      if (item.bookable_staff) bookableEmails.add(email)
    }
    for (const item of schedules || []) {
      const email = normalizeStaffEmail(item.user_email)
      if (!isSchedulableStaffEmail(email, lifecycleStateMap)) continue
      if (item.week_data) bookableEmails.add(email)
    }
    for (const item of avail || []) {
      const email = normalizeStaffEmail(item.staff_email)
      if (!isSchedulableStaffEmail(email, lifecycleStateMap)) continue
      bookableEmails.add(email)
    }
    for (const item of appts || []) {
      const email = normalizeStaffEmail(item.staff_email)
      if (!isSchedulableStaffEmail(email, lifecycleStateMap)) continue
      bookableEmails.add(email)
    }
    for (const item of meetingRows || []) {
      const email = normalizeStaffEmail(item.staff_email)
      if (!isSchedulableStaffEmail(email, lifecycleStateMap)) continue
      bookableEmails.add(email)
    }

    const staff = Array.from(bookableEmails)
      .map((email) => {
        const profile = profileMap.get(email)
        return {
          user_email: email,
          full_name: profile?.full_name || email,
          role: profile?.role || null,
          phone: profile?.phone || '',
        }
      })
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
    const directory = (profiles || [])
      .filter((profile) => isSchedulableStaffEmail(profile.user_email, lifecycleStateMap))
      .map((profile) => ({
        user_email: normalizeStaffEmail(profile.user_email),
        full_name: profile.full_name || profile.user_email,
        role: profile.role || null,
        phone: profile.phone || '',
      }))
      .filter((row) => row.user_email)
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))

    const explicitAvailability = avail || []
    const explicitKeys = new Set(
      explicitAvailability
        .filter((item) => item.staff_email && item.date && isSchedulableStaffEmail(item.staff_email, lifecycleStateMap))
        .map((item) => `${normalizeStaffEmail(item.staff_email)}::${item.date}`)
    )

    const scheduleMap = new Map(
      (schedules || []).map((item) => [String(item.user_email || '').toLowerCase(), item])
    )

    const derivedAvailability = []
    for (const staffMember of staff) {
      const schedule = scheduleMap.get(staffMember.user_email)
      if (!schedule?.week_data) continue

      for (const date of days) {
        const key = `${staffMember.user_email}::${date}`
        if (explicitKeys.has(key)) continue

        const entry = schedule.week_data?.[dayName(date)]
        if (!entry?.start || !entry?.end) continue

        derivedAvailability.push({
          id: `schedule:${staffMember.user_email}:${date}`,
          staff_email: staffMember.user_email,
          staff_name: staffMember.full_name,
          date,
          is_available: true,
          start_time: entry.start,
          end_time: entry.end,
          slots: buildWindowSlots(entry.start, entry.end),
          source: 'schedule',
        })
      }
    }

    setBookableStaff(staff)
    setStaffDirectory(directory)
    setAvailability([...explicitAvailability.filter((item) => isSchedulableStaffEmail(item.staff_email, lifecycleStateMap)), ...derivedAvailability])
    setAppointments((appts || []).filter((item) => isSchedulableStaffEmail(item.staff_email, lifecycleStateMap)))
    setMeetings((meetingRows || []).filter((item) => isSchedulableStaffEmail(item.staff_email, lifecycleStateMap)))
    setLoading(false)
  }, [days, anchor])

  useEffect(() => { load() }, [load])

  const loadMicrosoftCalendars = useCallback(async () => {
    if (!microsoftAccount) {
      setMicrosoftCalendars([])
      setMicrosoftEvents([])
      setMicrosoftStatus('unavailable')
      setMicrosoftError('No Microsoft account is active in this portal session.')
      return
    }

    setMicrosoftStatus('loading')
    setMicrosoftError('')
    try {
      const accessToken = await acquireMicrosoftCalendarToken(instance, microsoftAccount)
      const calendars = await fetchMicrosoftCalendars(accessToken)
      setMicrosoftCalendars(calendars)
      const defaultCalendar = calendars.find((calendar) => calendar.isDefaultCalendar) || calendars[0]
      setSelectedMicrosoftCalendar((current) => current || defaultCalendar?.id || '')
      setMicrosoftStatus('ready')
    } catch (error) {
      setMicrosoftCalendars([])
      setMicrosoftEvents([])
      setMicrosoftStatus('error')
      setMicrosoftError(error?.message || 'Could not load Microsoft calendars.')
    }
  }, [instance, microsoftAccount])

  useEffect(() => {
    loadMicrosoftCalendars()
  }, [loadMicrosoftCalendars])

  const loadMicrosoftEvents = useCallback(async () => {
    if (!microsoftAccount || !selectedMicrosoftCalendar) {
      setMicrosoftEvents([])
      return
    }

    setMicrosoftStatus('loading')
    setMicrosoftError('')
    try {
      const startIso = new Date(`${days[0]}T00:00:00`).toISOString()
      const endIso = new Date(`${days[6]}T23:59:59`).toISOString()
      const accessToken = await acquireMicrosoftCalendarToken(instance, microsoftAccount)
      const events = await fetchMicrosoftCalendarView(accessToken, {
        calendarId: selectedMicrosoftCalendar,
        startIso,
        endIso,
      })
      setMicrosoftEvents(events)
      setMicrosoftStatus('ready')
    } catch (error) {
      setMicrosoftEvents([])
      setMicrosoftStatus('error')
      setMicrosoftError(error?.message || 'Could not load Microsoft calendar events.')
    }
  }, [days, instance, microsoftAccount, selectedMicrosoftCalendar])

  useEffect(() => {
    if (selectedMicrosoftCalendar) {
      loadMicrosoftEvents()
    }
  }, [loadMicrosoftEvents, selectedMicrosoftCalendar])

  const prevWeek = () => { const d = new Date(anchor); d.setDate(d.getDate()-7); setAnchor(d.toISOString().split('T')[0]) }
  const nextWeek = () => { const d = new Date(anchor); d.setDate(d.getDate()+7); setAnchor(d.toISOString().split('T')[0]) }

  const getAvail = (staffEmail, date) => availability.find(a => String(a.staff_email || '').toLowerCase() === String(staffEmail || '').toLowerCase() && a.date === date)
  const getAppts = (staffEmail, date) => appointments.filter(a => a.staff_email === staffEmail && a.date === date)
  const getMeetings = (staffEmail, date) => meetings.filter((meeting) => String(meeting.staff_email || '').toLowerCase() === String(staffEmail || '').toLowerCase() && meeting.date === date)

  const toggleDayAvailable = async (staffEmail, staffName, date, makeAvailable) => {
    const existing = getAvail(staffEmail, date)
    if (existing) {
      await supabase.from('staff_availability').update({ is_available: makeAvailable, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('staff_availability').insert([{ staff_email: staffEmail, staff_name: staffName, date, is_available: makeAvailable, slots: [] }])
    }
    load()
  }

  const cancelAppt = async (appt) => {
    if (!confirm(`Cancel ${appt.client_name}'s appointment on ${appt.date} at ${appt.start_time}?`)) return
    setSaving(true)
    await supabase.from('appointments').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', appt.id)
    // Email client
    sendEmail('outreach_contact', {
      to_email: appt.client_email,
      contact_name: appt.client_name,
      subject: 'Your call on ' + appt.date + ' has been cancelled',
      message: [
        'Your scheduled call has been cancelled by our team.',
        '',
        'Date: ' + formatDate(appt.date),
        'Time: ' + appt.start_time + ' - ' + appt.end_time,
        'With: ' + appt.staff_name,
        '',
        'Please rebook at https://dhwebsiteservices.co.uk/contact or call 02920024218.',
      ].join('<br/>'),
    }).catch(()=>{})
    setSaving(false); setDetailAppt(null); load()
  }

  const saveMeeting = async () => {
    if (!meetingForm.title.trim() || !meetingForm.staff_email || !meetingForm.date || !meetingForm.start_time || !meetingForm.end_time) {
      alert('Add a meeting title, staff member, date, and start/end time.')
      return
    }

    const assignedStaff = staffDirectory.find((person) => person.user_email === meetingForm.staff_email)
    if (!assignedStaff) {
      alert('Choose a valid staff member first.')
      return
    }
    const appointmentConflict = appointments.find((entry) =>
      String(entry.staff_email || '').toLowerCase() === meetingForm.staff_email
      && entry.date === meetingForm.date
      && entry.start_time === meetingForm.start_time
      && entry.status !== 'cancelled'
    )
    if (appointmentConflict) {
      alert('That staff member already has a client appointment at that start time.')
      return
    }
    const meetingConflict = meetings.find((entry) =>
      String(entry.staff_email || '').toLowerCase() === meetingForm.staff_email
      && entry.date === meetingForm.date
      && entry.start_time === meetingForm.start_time
      && entry.status !== 'cancelled'
    )
    if (meetingConflict) {
      alert('That staff member already has a meeting at that start time.')
      return
    }

    setMeetingSaving(true)
    setMeetingFeedback('')
    const payload = {
      title: meetingForm.title.trim(),
      meeting_with_name: meetingForm.meeting_with_name.trim() || null,
      meeting_type: meetingForm.meeting_type || 'internal',
      staff_email: assignedStaff.user_email,
      staff_name: assignedStaff.full_name,
      organizer_email: user?.email || null,
      organizer_name: user?.name || user?.email || 'Portal',
      date: meetingForm.date,
      start_time: meetingForm.start_time,
      end_time: meetingForm.end_time,
      location: meetingForm.location.trim() || null,
      notes: meetingForm.notes.trim() || null,
      status: 'scheduled',
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase.from('staff_meetings').insert([payload]).select().maybeSingle()
    if (error) {
      setMeetingSaving(false)
      alert('Could not save meeting: ' + error.message)
      return
    }

    const deliveryIssues = []

    await sendManagedNotification({
      userEmail: assignedStaff.user_email,
      userName: assignedStaff.full_name,
      title: `You have a meeting: ${payload.title}`,
      message: [
        payload.meeting_with_name ? `You have a meeting with ${payload.meeting_with_name}` : 'You have a meeting booked',
        `at ${payload.start_time}${payload.end_time ? ` - ${payload.end_time}` : ''}`,
        `on ${formatDate(payload.date)}`,
        payload.location ? `at ${payload.location}` : '',
      ].filter(Boolean).join(' '),
      type: 'info',
      category: 'appointments',
      link: '/appointments',
      emailSubject: `${payload.title} — meeting scheduled`,
      emailHtml: `
        <p>Hi ${(assignedStaff.full_name || assignedStaff.user_email).split(' ')[0] || 'there'},</p>
        <p>You have a meeting booked in the DH Portal.</p>
        <p><strong>${payload.title}</strong><br/>${formatMeetingDateTime(payload.date, payload.start_time, payload.end_time)}${payload.meeting_with_name ? `<br/>With: ${payload.meeting_with_name}` : ''}${payload.location ? `<br/>Location: ${payload.location}` : ''}</p>
        ${payload.notes ? `<p>${payload.notes.replace(/\n/g, '<br/>')}</p>` : ''}
        <p><a href="${PORTAL_URL}/appointments" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open calendar</a></p>
      `,
      sentBy: user?.name || user?.email || 'Portal',
      portalUrl: PORTAL_URL,
      forceDelivery: 'both',
    }).catch((error) => {
      deliveryIssues.push(error?.message || 'Portal/email notification failed.')
    })

    const staffPhone = String(assignedStaff.phone || '').trim()
    if (staffPhone) {
      await sendPortalSms({
        recipients: [{
          phone: staffPhone,
          name: assignedStaff.full_name,
          email: assignedStaff.user_email,
        }],
        message: buildMeetingSmsMessage(payload),
        category: 'appointments',
        link: '/appointments',
        sentByEmail: user?.email || '',
        sentByName: user?.name || user?.email || 'Portal',
        audienceType: 'meeting_assignment',
        metadata: {
          meeting_id: data?.id,
          meeting_title: payload.title,
          meeting_date: payload.date,
          meeting_start_time: payload.start_time,
          meeting_type: payload.meeting_type,
        },
      }).catch((error) => {
        deliveryIssues.push(error?.message || 'SMS send failed.')
      })
    } else {
      deliveryIssues.push('No staff phone number is saved on the HR profile.')
    }

    await logAction(user?.email, user?.name, 'staff_meeting_created', assignedStaff.full_name, data?.id, payload)
    if (data?.id) {
      await enqueueMicrosoftCalendarSyncJob({
        staffEmail: assignedStaff.user_email,
        jobType: 'meeting_upsert',
        sourceTable: 'staff_meetings',
        sourceId: data.id,
        payload: {
          trigger: 'portal_meeting_created',
        },
      })
    }
    setMeetingForm({
      ...EMPTY_MEETING,
      staff_email: meetingForm.staff_email,
      date: meetingForm.date,
      start_time: meetingForm.start_time,
      end_time: meetingForm.end_time,
    })
    setMeetingFeedback(
      deliveryIssues.length
        ? `Meeting saved. Check delivery: ${deliveryIssues.join(' ')}`
        : 'Meeting saved and portal, email, and SMS notifications sent.'
    )
    setMeetingSaving(false)
    load()
  }

  const cancelMeeting = async (meeting) => {
    if (!confirm(`Cancel "${meeting.title}" for ${meeting.staff_name} on ${meeting.date}?`)) return
    setSaving(true)
    await supabase.from('staff_meetings').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', meeting.id)
    const deliveryIssues = []

    await sendManagedNotification({
      userEmail: meeting.staff_email,
      userName: meeting.staff_name,
      title: `Meeting cancelled: ${meeting.title}`,
      message: `Your meeting scheduled for ${formatMeetingDateTime(meeting.date, meeting.start_time, meeting.end_time)} has been cancelled.`,
      type: 'warning',
      category: 'appointments',
      link: '/appointments',
      emailSubject: `${meeting.title} — meeting cancelled`,
      sentBy: user?.name || user?.email || 'Portal',
      portalUrl: PORTAL_URL,
      forceDelivery: 'both',
    }).catch((error) => {
      deliveryIssues.push(error?.message || 'Portal/email cancellation notice failed.')
    })

    const staffPhone = String(
      staffDirectory.find((person) => person.user_email === String(meeting.staff_email || '').toLowerCase())?.phone || ''
    ).trim()

    if (staffPhone) {
      await sendPortalSms({
        recipients: [{
          phone: staffPhone,
          name: meeting.staff_name,
          email: meeting.staff_email,
        }],
        message: [
          `DH Portal: Meeting cancelled.`,
          `"${meeting.title}" on ${formatMeetingDateTime(meeting.date, meeting.start_time, meeting.end_time)} has been cancelled.`,
          meeting.location ? `Location: ${meeting.location}.` : '',
        ].filter(Boolean).join(' '),
        category: 'appointments',
        link: '/appointments',
        sentByEmail: user?.email || '',
        sentByName: user?.name || user?.email || 'Portal',
        audienceType: 'meeting_cancellation',
        metadata: {
          meeting_id: meeting.id,
          meeting_title: meeting.title,
          meeting_date: meeting.date,
          meeting_start_time: meeting.start_time,
        },
      }).catch((error) => {
        deliveryIssues.push(error?.message || 'SMS cancellation notice failed.')
      })
    } else {
      deliveryIssues.push('No staff phone number is saved on the HR profile.')
    }
    await logAction(user?.email, user?.name, 'staff_meeting_cancelled', meeting.staff_name, meeting.id, meeting)
    await enqueueMicrosoftCalendarSyncJob({
      staffEmail: meeting.staff_email,
      jobType: 'meeting_cancel',
      sourceTable: 'staff_meetings',
      sourceId: meeting.id,
      payload: {
        trigger: 'portal_meeting_cancelled',
      },
    })
    setSaving(false)
    setDetailAppt(null)
    if (deliveryIssues.length) {
      alert(`Meeting cancelled. Delivery issues: ${deliveryIssues.join(' ')}`)
    }
    load()
  }

  const today = new Date().toISOString().split('T')[0]
  const weekLabel = formatDate(days[0]) + ' – ' + formatDate(days[6])
  const visibleStaff = staffFilter === 'all'
    ? bookableStaff
    : bookableStaff.filter((staffMember) => staffMember.user_email === staffFilter)

  const weeklySummary = useMemo(() => {
    const visibleEmails = new Set(visibleStaff.map((staffMember) => staffMember.user_email))
    const weekAppointments = appointments.filter((appt) => visibleEmails.has(appt.staff_email) && startsWithinWindow(appt, days[0], days[6]))
    const weekMeetings = meetings.filter((meeting) => visibleEmails.has(meeting.staff_email) && startsWithinWindow(meeting, days[0], days[6]))
    const todayAppointments = weekAppointments.filter((appt) => appt.date === today)
    const todayMeetings = weekMeetings.filter((meeting) => meeting.date === today)
    const availableToday = visibleStaff.filter((staffMember) => {
      const avail = getAvail(staffMember.user_email, today)
      return avail?.is_available
    }).length
    const bookedToday = todayAppointments.filter((appt) => appt.status === 'confirmed').length
    return {
      staff: visibleStaff.length,
      availableToday,
      weekBookings: weekAppointments.filter((appt) => appt.status === 'confirmed').length,
      bookedToday,
      weekMeetings: weekMeetings.length,
      meetingsToday: todayMeetings.length,
      microsoftWeekEvents: microsoftEvents.length,
    }
  }, [appointments, meetings, visibleStaff, availability, today, days, microsoftEvents])

  const todayOverview = useMemo(() => {
    return visibleStaff.map((staffMember) => {
      const avail = getAvail(staffMember.user_email, today)
      const staffAppointments = getAppts(staffMember.user_email, today)
      return {
        ...staffMember,
        available: !!avail?.is_available,
        window: avail?.start_time && avail?.end_time ? `${avail.start_time} – ${avail.end_time}` : 'Unavailable',
        bookings: staffAppointments.length,
        meetings: getMeetings(staffMember.user_email, today).length,
      }
    })
  }, [visibleStaff, availability, appointments, meetings, today])

  const selectedMicrosoftCalendarMeta = useMemo(
    () => microsoftCalendars.find((calendar) => calendar.id === selectedMicrosoftCalendar) || null,
    [microsoftCalendars, selectedMicrosoftCalendar]
  )

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Appointment Manager</h1><p className="page-sub">Manage staff availability and client bookings</p></div>
      </div>

      <div className="dashboard-stat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:20 }}>
        {[
          ['Bookable staff', weeklySummary.staff, 'Shown in this view'],
          ['Available today', weeklySummary.availableToday, formatDate(today)],
          ['Booked today', weeklySummary.bookedToday, 'Confirmed appointments'],
          ['Week bookings', weeklySummary.weekBookings, 'Current week confirmed'],
          ['Meetings today', weeklySummary.meetingsToday, 'Internal calendar items'],
          ['MS events', weeklySummary.microsoftWeekEvents, selectedMicrosoftCalendarMeta?.name || 'Current Microsoft calendar'],
        ].map(([label, value, hint]) => (
          <div key={label} className="stat-card">
            <div className="stat-val">{value}</div>
            <div className="stat-lbl">{label}</div>
            <div style={{ fontSize:12, color:'var(--sub)', marginTop:6, lineHeight:1.5 }}>{hint}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom:24 }}>
        {[['calendar','Calendar'],['bookings','All Bookings'],['meetings','Meetings']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={'tab'+(tab===k?' on':'')}>{l}</button>
        ))}
      </div>

      <MicrosoftCalendarPanel
        calendars={microsoftCalendars}
        selectedCalendar={selectedMicrosoftCalendar}
        setSelectedCalendar={setSelectedMicrosoftCalendar}
        events={microsoftEvents}
        status={microsoftStatus}
        error={microsoftError}
        onReloadCalendars={loadMicrosoftCalendars}
        onReloadEvents={loadMicrosoftEvents}
      />

      {tab === 'calendar' && (
        <>
          {/* Week navigator */}
          <div className="legacy-toolbar" style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20 }}>
            <button className="btn btn-ghost btn-sm" onClick={prevWeek}>← Prev</button>
            <span style={{ fontSize:14, fontWeight:500, color:'var(--text)', minWidth:280, textAlign:'center' }}>{weekLabel}</span>
            <button className="btn btn-ghost btn-sm" onClick={nextWeek}>Next →</button>
            <button className="btn btn-outline btn-sm" onClick={() => setAnchor(today)} style={{ marginLeft:8 }}>Today</button>
            <div style={{ minWidth:220, marginLeft:'auto' }}>
              <select className="inp" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
                <option value="all">All bookable staff</option>
                {bookableStaff.map((staffMember) => (
                  <option key={staffMember.user_email} value={staffMember.user_email}>
                    {staffMember.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card card-pad" style={{ marginBottom:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:12, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Today overview</div>
                <div style={{ fontSize:14, color:'var(--sub)', marginTop:4 }}>Quick view of who is available and how many calls are already booked.</div>
              </div>
              <span className="badge badge-grey">{formatDate(today)}</span>
            </div>
            <div className="compact-card-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
              {todayOverview.map((staffMember) => (
                <div key={staffMember.user_email} style={{ padding:'14px 15px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{staffMember.full_name}</div>
                      <div style={{ fontSize:11, color:'var(--faint)', marginTop:2 }}>{staffMember.role || 'Bookable staff'}</div>
                    </div>
                    <span className={`badge badge-${staffMember.available ? (staffMember.bookings ? 'blue' : 'green') : 'red'}`}>
                      {staffMember.available ? (staffMember.bookings ? 'Booked' : 'Free') : 'Off'}
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <span className="badge badge-grey">{staffMember.window}</span>
                    <span className="badge badge-grey">{staffMember.bookings} booking{staffMember.bookings === 1 ? '' : 's'}</span>
                    <span className="badge badge-grey">{staffMember.meetings} meeting{staffMember.meetings === 1 ? '' : 's'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
            <div className="tbl-wrap">
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr>
                    <th style={{ width:60, padding:'8px 12px', borderBottom:'2px solid var(--border)', color:'var(--faint)', fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textAlign:'left' }}>TIME</th>
                    {visibleStaff.map(s => (
                      <th key={s.user_email} style={{ padding:'8px 12px', borderBottom:'2px solid var(--border)', borderLeft:'1px solid var(--border)', minWidth:140 }}>
                        <div style={{ fontWeight:600, color:'var(--text)', fontSize:12, marginBottom:2 }}>{s.full_name?.split(' ')[0]}</div>
                        <div style={{ fontSize:10, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{s.role}</div>
                      </th>
                    ))}
                  </tr>
                  {/* Day headers */}
                  <tr style={{ background:'var(--bg2)' }}>
                    <td style={{ padding:'6px 12px', borderBottom:'1px solid var(--border)', fontSize:10, color:'var(--faint)' }}>STAFF →</td>
                    {visibleStaff.map(s => (
                      <td key={s.user_email} style={{ padding:'6px 12px', borderBottom:'1px solid var(--border)', borderLeft:'1px solid var(--border)' }}>
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                          {days.map(d => {
                            const avail = getAvail(s.user_email, d)
                            const isOn = avail ? avail.is_available : false
                            const dayAppts = getAppts(s.user_email, d)
                            const dayMeetings = getMeetings(s.user_email, d)
                            const isPast = d < today
                            return (
                              <button key={d} onClick={() => !isPast && setSlotModal({ date:d, staffEmail:s.user_email, staffName:s.full_name })}
                                style={{ width:22, height:22, borderRadius:5, border:'1px solid ' + (d===today?'var(--accent)':'var(--border)'), background: isPast ? 'var(--bg3)' : dayMeetings.length > 0 ? '#fef3c7' : isOn ? (dayAppts.length > 0 ? '#dbeafe' : '#dcfce7') : '#fee2e2', cursor: isPast?'default':'pointer', fontSize:9, fontWeight:600, color: isPast?'var(--faint)': dayMeetings.length > 0 ? '#b45309' : isOn?(dayAppts.length>0?'#1d4ed8':'#166534'):'#991b1b', transition:'all 0.1s' }}
                                title={formatDate(d) + (dayAppts.length > 0 ? ' · ' + dayAppts.length + ' booked' : '') + (dayMeetings.length > 0 ? ' · ' + dayMeetings.length + ' meeting' + (dayMeetings.length === 1 ? '' : 's') : '')}>
                                {new Date(d+'T12:00').getDate()}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map((time, ti) => (
                    <tr key={time} style={{ background: ti%2===0 ? 'transparent' : 'var(--bg2)' }}>
                      <td style={{ padding:'4px 12px', borderBottom:'1px solid var(--border-light)', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)', verticalAlign:'middle', whiteSpace:'nowrap' }}>{time}</td>
                      {visibleStaff.map(s => {
                        // Show all 7 days compressed in weekly view
                        // Find if any day this week has a booking at this time for this staff
                        const dayBookings = days.map(d => {
                          const appt = appointments.find(a => a.staff_email === s.user_email && a.date === d && a.start_time === time)
                          const meeting = meetings.find(m => m.staff_email === s.user_email && m.date === d && m.start_time === time)
                          const avail = getAvail(s.user_email, d)
                          const isOn = avail ? avail.is_available : false
                          return { d, appt, meeting, isOn }
                        })
                        // Show the week's most relevant info - today's column
                        const todayInfo = dayBookings.find(db => db.d === today) || dayBookings[0]
                        const appt = todayInfo?.appt
                        const meeting = todayInfo?.meeting
                        const isOn = todayInfo?.isOn

                        return (
                          <td key={s.user_email} style={{ padding:'2px 6px', borderBottom:'1px solid var(--border-light)', borderLeft:'1px solid var(--border)', verticalAlign:'middle', height:28 }}>
                            {appt ? (
                              <button onClick={() => setDetailAppt(appt)} style={{ width:'100%', padding:'2px 6px', borderRadius:4, border:'none', background:'#3b82f6', color:'#fff', fontSize:10, fontWeight:500, cursor:'pointer', textAlign:'left', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {appt.client_name}
                              </button>
                            ) : meeting ? (
                              <button onClick={() => setDetailAppt({ ...meeting, _type: 'meeting' })} style={{ width:'100%', padding:'2px 6px', borderRadius:4, border:'none', background:'#f59e0b', color:'#111827', fontSize:10, fontWeight:600, cursor:'pointer', textAlign:'left', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {meeting.title}
                              </button>
                            ) : !isOn ? (
                              <div style={{ width:'100%', height:20, borderRadius:4, background:'var(--bg3)', opacity:0.5 }}/>
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div style={{ display:'flex', gap:16, marginTop:16, fontSize:11, color:'var(--faint)' }}>
            {[['#dcfce7','#166534','Available'],['#dbeafe','#1d4ed8','Has bookings'],['#fee2e2','#991b1b','Unavailable'],['#fff7ed','#c2410c','Microsoft calendar shown above']].map(([bg,c,l]) => (
              <div key={l} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:12, height:12, borderRadius:3, background:bg, border:'1px solid ' + c }}/>
                <span>{l}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'bookings' && (
        <AllBookings appointments={appointments} loading={loading} onCancel={cancelAppt} saving={saving} isAdmin={isAdmin} user={user} onRefresh={load}/>
      )}

      {tab === 'meetings' && (
        <MeetingsPanel
          staffDirectory={staffDirectory}
          meetings={meetings}
          microsoftEvents={microsoftEvents}
          microsoftCalendarName={selectedMicrosoftCalendarMeta?.name || ''}
          form={meetingForm}
          setForm={setMeetingForm}
          onSave={saveMeeting}
          onCancelMeeting={cancelMeeting}
          saving={meetingSaving}
          feedback={meetingFeedback}
        />
      )}

      {/* Slot modal — manage a specific staff member's day */}
      {slotModal && (
        <DaySlotModal
          staffEmail={slotModal.staffEmail}
          staffName={slotModal.staffName}
          date={slotModal.date}
          avail={getAvail(slotModal.staffEmail, slotModal.date)}
          appts={getAppts(slotModal.staffEmail, slotModal.date)}
          meetings={getMeetings(slotModal.staffEmail, slotModal.date)}
          onClose={() => setSlotModal(null)}
          onSave={load}
          onCancelAppt={cancelAppt}
          onCancelMeeting={cancelMeeting}
          isAdmin={isAdmin}
          currentUser={user}
        />
      )}

      {/* Appointment detail panel */}
      {detailAppt && (
        <ApptDetail appt={detailAppt} onClose={() => setDetailAppt(null)} onCancel={detailAppt._type === 'meeting' ? cancelMeeting : cancelAppt} saving={saving}/>
      )}
    </div>
  )
}

function AllBookings({ appointments, loading, onCancel, saving, isAdmin, user, onRefresh }) {
  const [filter, setFilter] = useState('upcoming')
  const [staffFilter, setStaffFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('confirmed')
  const [search, setSearch] = useState('')
  const today = new Date().toISOString().split('T')[0]
  const staffOptions = Array.from(new Set(appointments.map((appointment) => appointment.staff_name).filter(Boolean)))
  const filtered = appointments
    .filter(a => filter === 'all' ? true : filter === 'upcoming' ? a.date >= today : a.date < today)
    .filter(a => staffFilter === 'all' ? true : a.staff_name === staffFilter)
    .filter(a => statusFilter === 'all' ? true : a.status === statusFilter)
    .filter(a => {
      if (!search.trim()) return true
      const haystack = `${a.client_name || ''} ${a.client_email || ''} ${a.client_business || ''} ${a.staff_name || ''}`.toLowerCase()
      return haystack.includes(search.trim().toLowerCase())
    })
    .sort((a,b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))

  return (
    <div>
      <div className="legacy-toolbar-actions" style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {[['upcoming','Upcoming'],['past','Past'],['all','All']].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)} className={'pill'+(filter===k?' on':'')}>{l}</button>
        ))}
        <div style={{ minWidth:220 }}>
          <select className="inp" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
            <option value="all">All staff</option>
            {staffOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div style={{ minWidth:180 }}>
          <select className="inp" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All statuses</option>
          </select>
        </div>
        <div style={{ minWidth:220, flex:1 }}>
          <input className="inp" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client, business, email..." />
        </div>
      </div>
      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
          <>
            <div className="tbl-wrap hide-mob">
              <table className="tbl">
                <thead><tr><th>Client</th><th>Business</th><th>Date</th><th>Time</th><th>Duration</th><th>Staff</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {filtered.map(a => (
                    <tr key={a.id}>
                      <td className="t-main">
                        <div style={{ fontWeight:500 }}>{a.client_name}</div>
                        <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{a.client_email}</div>
                      </td>
                      <td style={{ fontSize:13 }}>{a.client_business || '—'}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11, whiteSpace:'nowrap' }}>{formatDate(a.date)}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{a.start_time} – {a.end_time}</td>
                      <td style={{ fontSize:12 }}>{a.duration} min</td>
                      <td style={{ fontSize:12 }}>{a.staff_name?.split(' ')[0]}</td>
                      <td><span className={'badge badge-'+(a.status==='confirmed'?'green':a.status==='cancelled'?'red':'amber')}>{a.status}</span></td>
                      <td>
                        {a.status === 'confirmed' && (
                          <button className="btn btn-danger btn-sm" onClick={() => onCancel(a)} disabled={saving}>Cancel</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>No appointments found</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mobile-only" style={{ display:'none' }}>
              {filtered.length ? (
                <div style={{ display:'grid', gap:10, padding:12 }}>
                  {filtered.map((a) => (
                    <div key={a.id} className="card" style={{ padding:14, display:'grid', gap:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>{a.client_name}</div>
                          <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{a.client_email}</div>
                        </div>
                        <span className={'badge badge-'+(a.status==='confirmed'?'green':a.status==='cancelled'?'red':'amber')}>{a.status}</span>
                      </div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        <span className="badge badge-grey">{formatDate(a.date)}</span>
                        <span className="badge badge-grey">{a.start_time} - {a.end_time}</span>
                        <span className="badge badge-grey">{a.duration} min</span>
                      </div>
                      <div style={{ fontSize:12, color:'var(--sub)' }}>
                        {a.client_business || 'No business name'} · {a.staff_name}
                      </div>
                      {a.status === 'confirmed' ? (
                        <button className="btn btn-danger btn-sm" onClick={() => onCancel(a)} disabled={saving}>Cancel</button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : <div style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>No appointments found</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MicrosoftCalendarPanel({
  calendars,
  selectedCalendar,
  setSelectedCalendar,
  events,
  status,
  error,
  onReloadCalendars,
  onReloadEvents,
}) {
  const hasCalendars = calendars.length > 0
  const isLoading = status === 'loading'

  return (
    <div className="card card-pad" style={{ marginBottom:20, display:'grid', gap:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:18, fontWeight:600, color:'var(--text)' }}>Microsoft Calendar</div>
          <div style={{ fontSize:13, color:'var(--sub)', marginTop:6 }}>
            Shows the Outlook calendars your signed-in Microsoft account can access for the selected week.
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={onReloadCalendars} disabled={isLoading}>
            {isLoading ? 'Connecting...' : 'Refresh calendars'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={onReloadEvents} disabled={isLoading || !selectedCalendar}>
            Refresh events
          </button>
        </div>
      </div>

      <div className="fg">
        <div>
          <label className="lbl">Microsoft calendar</label>
          <select className="inp" value={selectedCalendar} onChange={(event) => setSelectedCalendar(event.target.value)} disabled={!hasCalendars || isLoading}>
            <option value="">{hasCalendars ? 'Choose calendar' : 'No Microsoft calendars found'}</option>
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}{calendar.isDefaultCalendar ? ' (Default)' : ''}{calendar.ownerName ? ` · ${calendar.ownerName}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display:'flex', alignItems:'flex-end' }}>
          <div style={{ padding:'12px 14px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg2)', width:'100%' }}>
            <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Status</div>
            <div style={{ marginTop:6, fontSize:14, color:'var(--text)', fontWeight:600 }}>
              {status === 'ready' ? `${events.length} event${events.length === 1 ? '' : 's'} loaded` : status === 'loading' ? 'Loading Microsoft Calendar…' : status === 'error' ? 'Connection issue' : 'Waiting for Microsoft session'}
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div style={{ padding:'10px 12px', border:'1px solid #fca5a5', background:'#fef2f2', color:'#991b1b', borderRadius:8, fontSize:13 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display:'grid', gap:10 }}>
        {events.length ? events.map((event) => (
          <a
            key={event.id}
            href={event.webLink || '#'}
            target={event.webLink ? '_blank' : undefined}
            rel={event.webLink ? 'noreferrer' : undefined}
            style={{ display:'grid', gap:4, padding:'14px 15px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)', textDecoration:'none' }}
          >
            <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{event.title}</div>
              <span className="badge badge-grey">{formatDate(event.date)}</span>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <span className="badge badge-grey">{event.timeLabel}</span>
              {event.location ? <span className="badge badge-grey">{event.location}</span> : null}
              {event.organizer ? <span className="badge badge-grey">Organiser: {event.organizer}</span> : null}
            </div>
          </a>
        )) : (
          <div style={{ padding:'18px 16px', border:'1px dashed var(--border)', borderRadius:12, color:'var(--faint)', fontSize:13 }}>
            {isLoading ? 'Loading Microsoft events for this week…' : 'No Microsoft Calendar events were found for this week.'}
          </div>
        )}
      </div>
    </div>
  )
}

function MeetingsPanel({ staffDirectory, meetings, microsoftEvents, microsoftCalendarName, form, setForm, onSave, onCancelMeeting, saving, feedback }) {
  const sf = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const upcoming = [...meetings]
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))

  return (
    <div style={{ display:'grid', gridTemplateColumns:'minmax(320px,0.95fr) minmax(0,1.05fr)', gap:20 }}>
      <div className="card card-pad" style={{ display:'grid', gap:14 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:600, color:'var(--text)' }}>Add meeting</div>
          <div style={{ fontSize:13, color:'var(--sub)', marginTop:6 }}>Create an internal meeting and notify the assigned staff member by portal, email, and SMS.</div>
        </div>
        <div><label className="lbl">Meeting title</label><input className="inp" value={form.title} onChange={(e) => sf('title', e.target.value)} placeholder="Weekly check-in" /></div>
        <div className="fg">
          <div>
            <label className="lbl">Assigned staff member</label>
            <select className="inp" value={form.staff_email} onChange={(e) => sf('staff_email', e.target.value)}>
              <option value="">Choose staff member</option>
              {staffDirectory.map((person) => <option key={person.user_email} value={person.user_email}>{person.full_name}</option>)}
            </select>
          </div>
          <div><label className="lbl">Meeting with</label><input className="inp" value={form.meeting_with_name} onChange={(e) => sf('meeting_with_name', e.target.value)} placeholder="Client / colleague / manager" /></div>
        </div>
        <div className="fg">
          <div><label className="lbl">Date</label><input className="inp" type="date" value={form.date} onChange={(e) => sf('date', e.target.value)} /></div>
          <div><label className="lbl">Type</label><select className="inp" value={form.meeting_type} onChange={(e) => sf('meeting_type', e.target.value)}><option value="internal">Internal</option><option value="client">Client</option><option value="review">Review</option><option value="manager">Manager</option></select></div>
        </div>
        <div className="fg">
          <div><label className="lbl">Start time</label><input className="inp" type="time" value={form.start_time} onChange={(e) => sf('start_time', e.target.value)} /></div>
          <div><label className="lbl">End time</label><input className="inp" type="time" value={form.end_time} onChange={(e) => sf('end_time', e.target.value)} /></div>
        </div>
        <div><label className="lbl">Location</label><input className="inp" value={form.location} onChange={(e) => sf('location', e.target.value)} placeholder="Google Meet / Office / Phone" /></div>
        <div><label className="lbl">Notes</label><textarea className="inp" rows={4} value={form.notes} onChange={(e) => sf('notes', e.target.value)} placeholder="Agenda or context..." style={{ resize:'vertical' }} /></div>
        {feedback ? <div style={{ padding:'10px 12px', border:'1px solid var(--green)', background:'var(--green-bg)', color:'var(--green)', borderRadius:8, fontSize:13 }}>{feedback}</div> : null}
        <button className="btn btn-primary" onClick={onSave} disabled={saving}>{saving ? 'Saving meeting...' : 'Save meeting + notify'}</button>
      </div>

      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ padding:'18px 18px 0', fontSize:18, fontWeight:600, color:'var(--text)' }}>Upcoming meetings</div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Title</th><th>Assigned to</th><th>Date</th><th>Time</th><th>With</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {upcoming.map((meeting) => (
                <tr key={meeting.id}>
                  <td className="t-main">
                    <div style={{ fontWeight:600 }}>{meeting.title}</div>
                    <div style={{ fontSize:11, color:'var(--faint)' }}>{meeting.location || meeting.meeting_type || 'Meeting'}</div>
                  </td>
                  <td>{meeting.staff_name}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{formatDate(meeting.date)}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{meeting.start_time} - {meeting.end_time}</td>
                  <td>{meeting.meeting_with_name || '—'}</td>
                  <td><span className={'badge badge-'+(meeting.status === 'scheduled' ? 'amber' : 'grey')}>{meeting.status}</span></td>
                  <td>{meeting.status === 'scheduled' ? <button className="btn btn-danger btn-sm" onClick={() => onCancelMeeting(meeting)}>Cancel</button> : null}</td>
                </tr>
              ))}
              {upcoming.length === 0 ? <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>No meetings added yet</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'18px', borderTop:'1px solid var(--border)', display:'grid', gap:10 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>Microsoft Calendar events</div>
            <div style={{ fontSize:12, color:'var(--sub)', marginTop:4 }}>
              {microsoftCalendarName ? `Showing ${microsoftCalendarName}.` : 'Showing the selected Microsoft calendar.'}
            </div>
          </div>
          {microsoftEvents.length ? microsoftEvents.map((event) => (
            <a
              key={event.id}
              href={event.webLink || '#'}
              target={event.webLink ? '_blank' : undefined}
              rel={event.webLink ? 'noreferrer' : undefined}
              style={{ display:'grid', gap:4, padding:'12px 14px', border:'1px solid var(--border)', borderRadius:10, background:'var(--bg2)', textDecoration:'none' }}
            >
              <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{event.title}</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <span className="badge badge-grey">{formatDate(event.date)}</span>
                <span className="badge badge-grey">{event.timeLabel}</span>
                {event.location ? <span className="badge badge-grey">{event.location}</span> : null}
              </div>
            </a>
          )) : (
            <div style={{ padding:'14px', border:'1px dashed var(--border)', borderRadius:10, fontSize:13, color:'var(--faint)' }}>
              No Microsoft events are loaded for this week.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DaySlotModal({ staffEmail, staffName, date, avail, appts, meetings, onClose, onSave, onCancelAppt, onCancelMeeting, isAdmin, currentUser }) {
  const [isAvailable, setIsAvailable] = useState(avail ? avail.is_available : true)
  const [saving, setSaving] = useState(false)

  const canEdit = isAdmin || currentUser?.email?.toLowerCase() === staffEmail?.toLowerCase()

  const save = async () => {
    setSaving(true)
    if (avail) {
      await supabase.from('staff_availability').update({ is_available: isAvailable, updated_at: new Date().toISOString() }).eq('id', avail.id)
    } else {
      await supabase.from('staff_availability').insert([{ staff_email: staffEmail, staff_name: staffName, date, is_available: isAvailable, slots: [] }])
    }
    setSaving(false); onSave(); onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:600, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)' }}/>
      <div className="legacy-side-sheet" style={{ position:'relative', width:480, maxWidth:'95vw', height:'100vh', background:'var(--card)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', boxShadow:'-8px 0 32px rgba(0,0,0,0.15)', overflowY:'auto' }}>
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:17, fontWeight:600, color:'var(--text)' }}>{staffName?.split(' ')[0]}</div>
            <div style={{ fontSize:12, color:'var(--faint)' }}>{formatDate(date)}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:20, lineHeight:1, padding:4 }}>×</button>
        </div>

        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:20 }}>
          {/* Availability toggle */}
          {canEdit && (
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Availability</div>
              <div style={{ display:'flex', gap:8 }}>
                {[true, false].map(v => (
                  <button key={String(v)} onClick={() => setIsAvailable(v)}
                    style={{ flex:1, padding:'10px', borderRadius:8, border:'1px solid '+(isAvailable===v?(v?'var(--green,#22c55e)':'var(--red)'):'var(--border)'), background:isAvailable===v?(v?'#dcfce7':'#fee2e2'):'transparent', color:isAvailable===v?(v?'#166534':'#991b1b'):'var(--sub)', cursor:'pointer', fontSize:13, fontWeight:isAvailable===v?600:400, transition:'all 0.15s' }}>
                    {v ? '✓ Available for bookings' : '✗ Unavailable this day'}
                  </button>
                ))}
              </div>
              <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop:12, width:'100%', justifyContent:'center' }}>
                {saving ? 'Saving...' : 'Save Availability'}
              </button>
            </div>
          )}

          {/* Bookings that day */}
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
              Bookings this day {appts.length > 0 && `(${appts.length})`}
            </div>
            {appts.length === 0 ? (
              <div style={{ fontSize:13, color:'var(--faint)', padding:'16px 0' }}>No bookings for this day</div>
            ) : appts.map(a => (
              <div key={a.id} style={{ background:'var(--bg2)', borderRadius:10, padding:'14px 16px', marginBottom:8, border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14, color:'var(--text)' }}>{a.client_name}</div>
                    <div style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{a.client_email}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--accent)', fontWeight:600 }}>{a.start_time} – {a.end_time}</div>
                    <div style={{ fontSize:11, color:'var(--faint)' }}>{a.duration} min</div>
                  </div>
                </div>
                {a.client_business && <div style={{ fontSize:12, color:'var(--sub)', marginBottom:8 }}>{a.client_business}</div>}
                {canEdit && (
                  <button className="btn btn-danger btn-sm" onClick={() => onCancelAppt(a)} style={{ marginTop:4 }}>Cancel booking</button>
                )}
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
              Meetings this day {meetings.length > 0 && `(${meetings.length})`}
            </div>
            {meetings.length === 0 ? (
              <div style={{ fontSize:13, color:'var(--faint)', padding:'16px 0' }}>No meetings for this day</div>
            ) : meetings.map((meeting) => (
              <div key={meeting.id} style={{ background:'var(--bg2)', borderRadius:10, padding:'14px 16px', marginBottom:8, border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6, gap:10 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14, color:'var(--text)' }}>{meeting.title}</div>
                    <div style={{ fontSize:12, color:'var(--sub)', marginTop:3 }}>{meeting.meeting_with_name || 'Internal meeting'}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'#b45309', fontWeight:600 }}>{meeting.start_time} – {meeting.end_time}</div>
                    <div style={{ fontSize:11, color:'var(--faint)' }}>{meeting.location || meeting.meeting_type}</div>
                  </div>
                </div>
                {meeting.notes ? <div style={{ fontSize:12, color:'var(--sub)', marginBottom:8, lineHeight:1.55 }}>{meeting.notes}</div> : null}
                {canEdit && (
                  <button className="btn btn-danger btn-sm" onClick={() => onCancelMeeting(meeting)} style={{ marginTop:4 }}>Cancel meeting</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ApptDetail({ appt, onClose, onCancel, saving }) {
  const isMeeting = appt._type === 'meeting'
  const rows = isMeeting
    ? [['Meeting', appt.title], ['Assigned to', appt.staff_name], ['With', appt.meeting_with_name || '—'], ['Date', formatDate(appt.date)], ['Time', appt.start_time + ' – ' + appt.end_time], ['Location', appt.location || '—'], ['Type', appt.meeting_type || 'internal'], ['Status', appt.status], ['Created', new Date(appt.created_at).toLocaleString('en-GB')]]
    : [['Client', appt.client_name], ['Business', appt.client_business||'—'], ['Email', appt.client_email], ['Date', formatDate(appt.date)], ['Time', appt.start_time + ' – ' + appt.end_time], ['Duration', appt.duration + ' min'], ['Staff', appt.staff_name], ['Status', appt.status], ['Booked', new Date(appt.created_at).toLocaleString('en-GB')]]
  return (
    <div style={{ position:'fixed', inset:0, zIndex:600, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)' }}/>
      <div className="legacy-side-sheet" style={{ position:'relative', width:420, maxWidth:'95vw', height:'100vh', background:'var(--card)', borderLeft:'1px solid var(--border)', padding:'24px', display:'flex', flexDirection:'column', gap:20, boxShadow:'-8px 0 32px rgba(0,0,0,0.15)', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:17, fontWeight:600, color:'var(--text)' }}>{isMeeting ? 'Meeting Details' : 'Appointment Details'}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:20, lineHeight:1, padding:4 }}>×</button>
        </div>
        {rows.map(([l,v]) => (
          <div key={l} style={{ display:'flex', gap:12, borderBottom:'1px solid var(--border-light)', paddingBottom:12 }}>
            <span style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em', width:70, flexShrink:0, paddingTop:1 }}>{l}</span>
            <span style={{ fontSize:13, color:'var(--text)' }}>{v}</span>
          </div>
        ))}
        {appt.status === 'confirmed' && (
          <button className="btn btn-danger" onClick={() => onCancel(appt)} disabled={saving} style={{ marginTop:'auto' }}>
            {saving ? 'Cancelling...' : 'Cancel Appointment'}
          </button>
        )}
        {appt.status === 'scheduled' && isMeeting && (
          <button className="btn btn-danger" onClick={() => onCancel(appt)} disabled={saving} style={{ marginTop:'auto' }}>
            {saving ? 'Cancelling...' : 'Cancel Meeting'}
          </button>
        )}
      </div>
    </div>
  )
}
