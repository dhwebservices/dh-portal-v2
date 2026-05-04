const CALENDAR_SYNC_API_PATH = '/api/enqueue-calendar-sync'

export async function enqueueMicrosoftCalendarSyncJob({
  staffEmail,
  jobType,
  sourceTable,
  sourceId,
  payload = {},
  direction = 'portal_to_microsoft',
}) {
  const normalizedStaffEmail = String(staffEmail || '').trim().toLowerCase()
  const normalizedSourceId = String(sourceId || '').trim()

  if (!normalizedStaffEmail || !jobType || !sourceTable || !normalizedSourceId) {
    return { queued: false, reason: 'missing_fields' }
  }

  try {
    const response = await fetch(CALENDAR_SYNC_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffEmail: normalizedStaffEmail,
        jobType,
        sourceTable,
        sourceId: normalizedSourceId,
        payload,
        direction,
      }),
    })

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        queued: false,
        error: data?.error || data?.reason || 'queue_failed',
      }
    }

    return {
      queued: data?.queued === true,
      created: data?.created === true,
      updated: data?.updated === true,
      id: data?.id || null,
    }
  } catch (error) {
    console.warn('Microsoft calendar sync job enqueue failed:', error)
    return { queued: false, error: error?.message || 'queue_failed' }
  }
}
