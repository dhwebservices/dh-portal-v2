// Small date and money helpers for HQ screens. Plain British English.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Dates like '2026-11-09' are read as local dates, not UTC.
const toDate = (value) => (value instanceof Date ? value : new Date(value.length === 10 ? `${value}T00:00:00` : value))
const pad = (n) => String(n).padStart(2, '0')

export const dayShort = (value) => DAYS[toDate(value).getDay()]               // "Fri"
export const time = (value) => { const d = toDate(value); return `${pad(d.getHours())}:${pad(d.getMinutes())}` } // "17:42"
export const dayTime = (value) => `${dayShort(value)} ${time(value)}`        // "Fri 17:42"
export const longDate = (value) => { const d = toDate(value); return `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` } // "Monday 9 November"

// "5pm Fri" style, for "since 5pm Fri".
export const hourDay = (value) => {
  const d = toDate(value)
  const h = d.getHours()
  const label = h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
  return `${label} ${DAYS[d.getDay()]}`
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const shortDate = (value) => { const d = toDate(value); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` } // "7 Nov"
export const fullDate = (value) => { const d = toDate(value); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` } // "7 Nov 2026"
export const monthYear = (value) => { const d = toDate(value); return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` } // "Oct 2026"

// "Today", "Yesterday", "Sat" within the week, then "7 Nov" (or "14 Aug 2025" in another year).
export const sinceLabel = (value, today) => {
  const d = toDate(value)
  const t = toDate(today)
  const days = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return dayShort(d)
  return d.getFullYear() === t.getFullYear() ? shortDate(d) : fullDate(d)
}

// '2026-11-09' plus n days, as '2026-11-10'.
export const addDays = (iso, n) => {
  const d = toDate(iso)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// The Sunday that ends the week of the given date (weeks run Monday to Sunday).
export const endOfWeek = (iso) => addDays(iso, (7 - toDate(iso).getDay()) % 7)

export const dayDate = (value) => `${dayShort(value)} ${shortDate(value)}` // "Wed 11 Nov"

export const pounds = (amount) =>
  `£${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
