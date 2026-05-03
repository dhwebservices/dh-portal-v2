import { supabase } from './supabase'

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

  const now = new Date().toISOString()

  try {
    const { data: existing, error: existingError } = await supabase
      .from('microsoft_calendar_sync_jobs')
      .select('id,status')
      .eq('staff_email', normalizedStaffEmail)
      .eq('job_type', jobType)
      .eq('source_table', sourceTable)
      .eq('source_id', normalizedSourceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingError) throw existingError

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('microsoft_calendar_sync_jobs')
        .update({
          payload,
          direction,
          available_at: now,
          updated_at: now,
          last_error: null,
        })
        .eq('id', existing.id)

      if (updateError) throw updateError
      return { queued: true, updated: true, id: existing.id }
    }

    const { data: created, error: insertError } = await supabase
      .from('microsoft_calendar_sync_jobs')
      .insert([{
        staff_email: normalizedStaffEmail,
        job_type: jobType,
        source_table: sourceTable,
        source_id: normalizedSourceId,
        payload,
        direction,
        status: 'pending',
        attempts: 0,
        available_at: now,
        created_at: now,
        updated_at: now,
      }])
      .select('id')
      .maybeSingle()

    if (insertError) throw insertError
    return { queued: true, created: true, id: created?.id || null }
  } catch (error) {
    console.warn('Microsoft calendar sync job enqueue failed:', error)
    return { queued: false, error: error?.message || 'queue_failed' }
  }
}
