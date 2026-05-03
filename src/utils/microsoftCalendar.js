import { microsoftCalendarReadRequest } from '../authConfig'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const OUTLOOK_TIMEZONE = 'GMT Standard Time'

function hasOffset(value = '') {
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
}

function parseGraphDateTime(dateTime) {
  if (!dateTime) return null
  const parsed = new Date(hasOffset(dateTime) ? dateTime : `${dateTime}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isoLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatClock(date) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

async function graphFetch(path, accessToken) {
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: `outlook.timezone="${OUTLOOK_TIMEZONE}"`,
    },
  })

  if (!response.ok) {
    let message = `Microsoft Calendar request failed (${response.status})`
    try {
      const body = await response.json()
      message = body?.error?.message || message
    } catch {
      // Ignore JSON parse failures and keep the generic message.
    }
    throw new Error(message)
  }

  return response.json()
}

export async function acquireMicrosoftCalendarToken(instance, account) {
  if (!instance || !account) throw new Error('No Microsoft account is available in this session.')

  try {
    const result = await instance.acquireTokenSilent({
      ...microsoftCalendarReadRequest,
      account,
    })
    return result.accessToken
  } catch (error) {
    const result = await instance.acquireTokenPopup({
      ...microsoftCalendarReadRequest,
      account,
    })
    return result.accessToken
  }
}

export async function fetchMicrosoftCalendars(accessToken) {
  const data = await graphFetch('/me/calendars?$select=id,name,isDefaultCalendar,canEdit,color,owner', accessToken)
  return (data?.value || []).map((calendar) => ({
    id: calendar.id,
    name: calendar.name || 'Calendar',
    isDefaultCalendar: !!calendar.isDefaultCalendar,
    canEdit: !!calendar.canEdit,
    color: calendar.color || null,
    ownerName: calendar.owner?.name || '',
    ownerAddress: calendar.owner?.address || '',
  }))
}

export async function fetchMicrosoftCalendarView(accessToken, { calendarId, startIso, endIso }) {
  const query = new URLSearchParams({
    startDateTime: startIso,
    endDateTime: endIso,
    $select: 'id,subject,start,end,location,webLink,isAllDay,showAs,organizer',
    $orderby: 'start/dateTime',
  })
  const basePath = calendarId ? `/me/calendars/${encodeURIComponent(calendarId)}/calendarView` : '/me/calendarView'
  const data = await graphFetch(`${basePath}?${query.toString()}`, accessToken)

  return (data?.value || [])
    .map((event) => {
      const startAt = parseGraphDateTime(event.start?.dateTime)
      const endAt = parseGraphDateTime(event.end?.dateTime)
      if (!startAt) return null

      return {
        id: event.id,
        title: event.subject || 'Untitled event',
        date: isoLocalDate(startAt),
        startAt,
        endAt,
        startTime: event.isAllDay ? 'All day' : formatClock(startAt),
        endTime: event.isAllDay || !endAt ? '' : formatClock(endAt),
        timeLabel: event.isAllDay
          ? 'All day'
          : `${formatClock(startAt)}${endAt ? ` - ${formatClock(endAt)}` : ''}`,
        location: event.location?.displayName || '',
        webLink: event.webLink || '',
        organizer: event.organizer?.emailAddress?.name || event.organizer?.emailAddress?.address || '',
        showAs: event.showAs || '',
        isAllDay: !!event.isAllDay,
      }
    })
    .filter(Boolean)
}
