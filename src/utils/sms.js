const SMS_API_PATH = '/api/send-sms'
const DEFAULT_PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'

export function normalizePortalPhone(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const cleaned = raw.replace(/[^\d+]/g, '')
  if (!cleaned) return ''

  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`
  if (cleaned.startsWith('44')) return `+${cleaned}`
  if (cleaned.startsWith('0')) return `+44${cleaned.slice(1)}`
  return `+${cleaned}`
}

function buildSmsMessage(text = '', link = '') {
  const body = String(text || '').trim()
  const safeLink = String(link || '').trim()
  return [body, safeLink].filter(Boolean).join(' ')
}

export async function sendPortalSms({
  recipients = [],
  message = '',
  category = 'general',
  link = '',
  sentByEmail = '',
  sentByName = '',
  audienceType = 'manual',
  metadata = {},
}) {
  const normalizedRecipients = recipients
    .map((recipient) => ({
      phone: normalizePortalPhone(recipient?.phone),
      name: String(recipient?.name || '').trim(),
      email: String(recipient?.email || '').toLowerCase().trim(),
    }))
    .filter((recipient) => recipient.phone)

  const body = buildSmsMessage(message, link)
  if (!normalizedRecipients.length) throw new Error('No valid SMS recipients found.')
  if (!body) throw new Error('SMS message is empty.')

  const response = await fetch(SMS_API_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: normalizedRecipients.map((recipient) => ({
        ...recipient,
        message: body,
        category,
      })),
      category,
      sentByEmail,
      sentByName,
      audienceType,
      metadata,
    }),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || 'SMS sending failed.')
  }

  return data
}

export function buildPortalSmsNotificationMessage({
  title = '',
  message = '',
  link = '',
  portalUrl = DEFAULT_PORTAL_URL,
}) {
  const safeTitle = String(title || '').trim()
  const safeMessage = String(message || '').trim()
  const safeLink = String(link || '').trim()
  const fullLink = safeLink
    ? safeLink.startsWith('http')
      ? safeLink
      : `${portalUrl}${safeLink.startsWith('/') ? safeLink : `/${safeLink}`}`
    : ''

  return buildSmsMessage(
    ['DH Portal:', safeTitle, safeMessage].filter(Boolean).join(' '),
    fullLink
  )
}
