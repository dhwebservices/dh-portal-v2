import { supabase } from './supabase'
import { sendEmail } from './email'
import {
  buildPreferenceSettingKey,
  DEFAULT_PORTAL_PREFERENCES,
  mergePortalPreferences,
  NOTIFICATION_CATEGORY_OPTIONS,
} from './portalPreferences'

const CATEGORY_KEYS = new Set(NOTIFICATION_CATEGORY_OPTIONS.map(([key]) => key))
const DEFAULT_PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'

export function getNotificationCategoryLabel(category = 'general') {
  return NOTIFICATION_CATEGORY_OPTIONS.find(([key]) => key === category)?.[1] || 'General updates'
}

export function resolveNotificationDelivery(preferences, category = 'general', { forceImportant = false, type = 'info' } = {}) {
  if (forceImportant || category === 'urgent' || type === 'urgent') {
    return { portal: true, email: true, delivery: 'both' }
  }

  const safeCategory = CATEGORY_KEYS.has(category) ? category : 'general'
  const delivery = preferences?.notificationPreferences?.[safeCategory] || DEFAULT_PORTAL_PREFERENCES.notificationPreferences[safeCategory] || 'both'

  return {
    portal: delivery === 'portal' || delivery === 'both',
    email: delivery === 'email' || delivery === 'both',
    delivery,
  }
}

export async function getUserPortalPreferences(email = '') {
  const safeEmail = String(email || '').toLowerCase().trim()
  if (!safeEmail) return mergePortalPreferences(DEFAULT_PORTAL_PREFERENCES)

  const { data } = await supabase
    .from('portal_settings')
    .select('value')
    .eq('key', buildPreferenceSettingKey(safeEmail))
    .maybeSingle()

  const raw = data?.value?.value ?? data?.value ?? {}
  return mergePortalPreferences(DEFAULT_PORTAL_PREFERENCES, raw)
}

export async function sendManagedNotification({
  userEmail,
  userName = '',
  title,
  message,
  type = 'info',
  link = '/notifications',
  category = 'general',
  emailSubject,
  emailHtml,
  emailText,
  sentBy,
  fromEmail,
  portalUrl = DEFAULT_PORTAL_URL,
  forceImportant = false,
  forceDelivery = '',
}) {
  const safeEmail = String(userEmail || '').toLowerCase().trim()
  if (!safeEmail || !title || !message) {
    throw new Error('Missing notification details')
  }

  const preferences = await getUserPortalPreferences(safeEmail)
  const resolved = resolveNotificationDelivery(preferences, category, { forceImportant, type })
  const delivery = forceDelivery === 'both'
    ? { portal: true, email: true, delivery: 'both' }
    : forceDelivery === 'portal'
      ? { portal: true, email: false, delivery: 'portal' }
      : forceDelivery === 'email'
        ? { portal: false, email: true, delivery: 'email' }
        : resolved
  const createdAt = new Date().toISOString()
  let portalSent = false
  let emailSent = false
  let portalError = null
  let emailError = null

  if (delivery.portal) {
    const { error } = await supabase.from('notifications').insert([{
      user_email: safeEmail,
      title,
      message,
      type,
      link,
      read: false,
      created_at: createdAt,
    }])
    if (error) portalError = error
    else portalSent = true
  }

  if (delivery.email) {
    const firstName = (userName || safeEmail).split(' ')[0]
    const safeLink = String(link || '/notifications').startsWith('http')
      ? String(link)
      : `${portalUrl}${String(link || '/notifications').startsWith('/') ? String(link || '/notifications') : `/${String(link || '/notifications')}`}`
    const html = emailHtml || (
      `<p>Hi ${firstName || 'there'},</p>` +
      `<p>${String(message).replace(/\n/g, '<br/>')}</p>` +
      `<p><a href="${safeLink}" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open in DH Portal</a></p>`
    )

    const result = await sendEmail('send_email', {
      to: safeEmail,
      to_name: userName || safeEmail,
      subject: emailSubject || `${title} — DH Portal`,
      html,
      text: emailText,
      sent_by: sentBy,
      from_email: fromEmail,
      log_outreach: false,
    })

    if (!result.ok) emailError = new Error(result.error || 'Email send failed')
    else emailSent = true
  }

  if (!portalSent && !emailSent) {
    throw portalError || emailError || new Error('Notification delivery failed')
  }

  return {
    portalSent,
    emailSent,
    delivery: delivery.delivery,
    portalError,
    emailError,
  }
}
