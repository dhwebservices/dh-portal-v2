import { supabase } from './supabase'

const WORKER = 'https://dh-email-worker.aged-silence-66a7.workers.dev'
const PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'

function normalizeEmailPayload(type, data = {}) {
  if (type !== 'send_email') {
    return { type, data, originalType: type }
  }

  const message = data.html || (data.text ? data.text.replace(/\n/g, '<br/>') : '')

  return {
    type: 'outreach_contact',
    originalType: type,
    data: {
      to_email: data.to || data.to_email,
      contact_name: data.contact_name || data.to_name || '',
      subject: data.subject,
      message,
      from_email: data.from_email,
      sent_by: data.sent_by,
      business_name: data.business_name,
      website: data.website,
      portal_url: data.portal_url || PORTAL_URL,
      log_outreach: data.log_outreach === true,
    },
  }
}

/**
 * Send email via Cloudflare Worker.
 * If type = 'outreach_contact', also logs to outreach table.
 */
export async function sendEmail(type, data) {
  try {
    const payload = normalizeEmailPayload(type, data)
    const res = await fetch(WORKER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await res.json().catch(() => ({}))

    if (!res.ok || result?.error) {
      throw new Error(result?.error || 'Worker request failed')
    }

    // Auto-log only explicit outreach sends, not every portal email adapted through send_email.
    if (
      payload.type === 'outreach_contact' &&
      payload.originalType === 'outreach_contact' &&
      payload.data.to_email
    ) {
      try {
        await supabase.from('outreach').insert([{
          business_name: payload.data.business_name || payload.data.to_email,
          contact_name: payload.data.contact_name || '',
          contact_email: payload.data.to_email,
          website: payload.data.website || '',
          status: 'contacted',
          notes: `Auto-logged from email sent on ${new Date().toLocaleDateString('en-GB')}`,
          added_by: payload.data.sent_by || 'System',
          created_at: new Date().toISOString(),
        }])
      } catch {
        // Outreach logging should never block a successful send.
      }
    }

    return { ok: true, status: res.status, result }
  } catch (e) {
    console.warn('Email send failed:', e)
    return { ok: false, error: e.message }
  }
}
