import { supabase } from './supabase'
import { buildApplicationRef } from './recruiting'

export async function convertApplicantToOnboarding(application, actor = {}) {
  if (!application?.email) throw new Error('Application email is required')

  const summaryRow = {
    user_email: String(application.email || '').toLowerCase(),
    user_name: application.full_name || application.email,
    full_name: application.full_name || '',
    address: application.location || '',
    personal_email: application.email || '',
    status: 'draft',
    submitted_at: null,
    decided_by: actor.name || actor.email || '',
    decided_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('onboarding_submissions')
    .upsert(summaryRow, { onConflict: 'user_email' })

  if (error) throw error

  return {
    onboarding_email: summaryRow.user_email,
    reference: buildApplicationRef(),
  }
}
