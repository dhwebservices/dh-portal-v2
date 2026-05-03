import { supabase } from './supabase'

const WORKER = 'https://dh-email-worker.aged-silence-66a7.workers.dev'
const PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'
const OUTREACH_NOTES_META_PREFIX = '[dh-outreach-meta]'

function normalizeEmail(value = '') {
  return String(value || '').toLowerCase().trim()
}

function buildOutreachAutoLogNotes({
  creatorEmail = '',
  creatorName = '',
  creatorDepartment = '',
  plainNotes = '',
} = {}) {
  const safeCreatorEmail = normalizeEmail(creatorEmail)
  const safeCreatorName = String(creatorName || '').trim()
  const safePlainNotes = String(plainNotes || '').trim()
  const meta = {
    outcome: 'none',
    follow_up_date: '',
    history: [{
      action: 'created',
      value: 'Lead auto-logged from email',
      actor: safeCreatorName || safeCreatorEmail || 'System',
      at: new Date().toISOString(),
    }],
    assigned_to_email: safeCreatorEmail,
    assigned_to_name: safeCreatorName,
    creator_email: safeCreatorEmail,
    creator_department: String(creatorDepartment || '').trim(),
    reminder_notice_key: '',
  }
  const metaBlock = `${OUTREACH_NOTES_META_PREFIX} ${JSON.stringify(meta)}`
  return safePlainNotes ? `${metaBlock}\n${safePlainNotes}` : metaBlock
}

function normalizeEmailPayload(type, data = {}) {
  if (type !== 'send_email') {
    return { type, data, originalType: type }
  }

  return {
    type: 'custom_email',
    originalType: type,
    data: {
      to: data.to || data.to_email,
      from: data.from_email,
      subject: data.subject,
      html: data.html || (data.text ? data.text.replace(/\n/g, '<br/>') : ''),
      text: data.text || '',
      reply_to: data.reply_to || data.from_email || undefined,
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

    if (payload.type === 'outreach_contact' && payload.data.to_email) {
      try {
        const sourceEmail = normalizeEmail(payload.data.sent_by_email || payload.data.reply_to || '')
        const sourceName = String(payload.data.sent_by || payload.data.from_name || '').trim()
        await supabase.from('outreach').insert([{
          business_name: payload.data.business_name || payload.data.to_email,
          contact_name: payload.data.contact_name || '',
          email: payload.data.to_email,
          website: payload.data.website || '',
          status: 'contacted',
          notes: buildOutreachAutoLogNotes({
            creatorEmail: sourceEmail,
            creatorName: sourceName,
            creatorDepartment: payload.data.creator_department || '',
            plainNotes: `Auto-logged from email sent on ${new Date().toLocaleDateString('en-GB')}`,
          }),
          added_by: sourceName || sourceEmail || 'System',
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
