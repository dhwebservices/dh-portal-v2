import { supabase } from './supabase'

const WORKER = 'https://dh-email-worker.aged-silence-66a7.workers.dev'

/**
 * Send email via Cloudflare Worker.
 * If type = 'outreach_contact', also logs to outreach table.
 */
export async function sendEmail(type, data) {
  try {
    const res = await fetch(WORKER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data }),
    })

    // Auto-log domain outreach emails to the outreach table
    if (type === 'outreach_contact' && data.to_email) {
      await supabase.from('outreach').insert([{
        business_name: data.business_name || data.to_email,
        contact_name:  data.contact_name  || '',
        email:         data.to_email,
        website:       data.website       || '',
        status:        'contacted',
        notes:         `Auto-logged from email sent on ${new Date().toLocaleDateString('en-GB')}`,
        added_by:      data.sent_by       || 'System',
        created_at:    new Date().toISOString(),
      }]).catch(() => {}) // don't block if insert fails
    }

    return res.ok
  } catch (e) {
    console.warn('Email send failed:', e)
    return false
  }
}
