const BOOKING_BASE_URL = 'https://staff.dhwebsiteservices.co.uk'

export function normalizeBookingSlugPart(value = '') {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildBookingSlug(fullName = '', email = '') {
  const safeName = normalizeBookingSlugPart(fullName)
  if (safeName) return safeName
  const localPart = String(email || '').split('@')[0] || ''
  return normalizeBookingSlugPart(localPart) || 'staff'
}

export function buildBookingLink(fullName = '', email = '') {
  return `${BOOKING_BASE_URL}/book/${buildBookingSlug(fullName, email)}`
}
