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

export const pounds = (amount) =>
  `£${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
