import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { buildBookingLink } from '../utils/bookingLinks'

const PUBLIC_BOOKING_API_PATH = '/api/public-booking'

const EMPTY_FORM = {
  client_name: '',
  client_business: '',
  client_email: '',
  client_phone: '',
  notes: '',
}

function prettyDate(dateStr = '') {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function PublicBookingPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [staff, setStaff] = useState(null)
  const [availability, setAvailability] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`${PUBLIC_BOOKING_API_PATH}?slug=${encodeURIComponent(slug)}`)
        const result = await response.json().catch(() => null)
        if (!response.ok || result?.error) {
          throw new Error(result?.error || 'Could not load booking page.')
        }
        if (cancelled) return
        setStaff(result.staff || null)
        setAvailability(Array.isArray(result.availability) ? result.availability : [])
        const firstDay = Array.isArray(result.availability) ? result.availability[0] : null
        setSelectedDate(firstDay?.date || '')
        setSelectedTime(firstDay?.slots?.[0] || '')
      } catch (err) {
        if (cancelled) return
        setError(err?.message || 'Could not load booking page.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [slug])

  const selectedDay = useMemo(
    () => availability.find((item) => item.date === selectedDate) || availability[0] || null,
    [availability, selectedDate]
  )

  useEffect(() => {
    if (!selectedDay) return
    if (!selectedDay.slots.includes(selectedTime)) {
      setSelectedTime(selectedDay.slots[0] || '')
    }
  }, [selectedDay, selectedTime])

  async function submitBooking(event) {
    event.preventDefault()
    if (!selectedDate || !selectedTime) {
      setError('Choose a date and time first.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(PUBLIC_BOOKING_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          ...form,
          date: selectedDate,
          start_time: selectedTime,
        }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || result?.error) {
        throw new Error(result?.error || 'Could not complete booking.')
      }
      setMessage(`Booked for ${prettyDate(selectedDate)} at ${selectedTime}. A confirmation email has been sent.`)
      setForm(EMPTY_FORM)
    } catch (err) {
      setError(err?.message || 'Could not complete booking.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="public-booking-shell">
      <div className="public-booking-topbar">
        <button className="public-booking-brand" type="button" onClick={() => navigate('/')}>
          <img src="/dh-logo-icon.png" alt="" />
          <span>DH Website Services</span>
        </button>
        <a href={staff ? buildBookingLink(staff.full_name, staff.email) : '#'} className="public-booking-linkhint">
          Shareable booking link
        </a>
      </div>

      <div className="public-booking-stage">
        <section className="public-booking-intro">
          <span className="public-booking-kicker">Book a call</span>
          <h1>{staff ? `Speak with ${staff.first_name}.` : 'Book a call.'}</h1>
          <p>
            Choose a time that works, add your details, and your appointment will be added directly into the staff portal.
          </p>
          {staff ? (
            <div className="public-booking-staffmeta">
              <div>
                <span>Staff member</span>
                <strong>{staff.full_name}</strong>
              </div>
              {staff.role ? (
                <div>
                  <span>Role</span>
                  <strong>{staff.role}</strong>
                </div>
              ) : null}
              <div>
                <span>Call length</span>
                <strong>30 minutes</strong>
              </div>
            </div>
          ) : null}
        </section>

        <section className="public-booking-panel">
          {loading ? (
            <div className="spin-wrap" style={{ minHeight: 320 }}><div className="spin" /></div>
          ) : error && !staff ? (
            <div className="public-booking-state">
              <h2>Booking link unavailable</h2>
              <p>{error}</p>
            </div>
          ) : (
            <>
              <div className="public-booking-section-head">
                <div>
                  <span>Availability</span>
                  <h2>Choose a slot</h2>
                </div>
                <p>Available times are shown in 30-minute slots and update live against existing appointments.</p>
              </div>

              <div className="public-booking-days">
                {availability.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    className={`public-booking-day ${selectedDay?.date === day.date ? 'is-active' : ''}`}
                    onClick={() => setSelectedDate(day.date)}
                  >
                    <strong>{prettyDate(day.date)}</strong>
                    <span>{day.slots.length} slot{day.slots.length === 1 ? '' : 's'}</span>
                  </button>
                ))}
              </div>

              <div className="public-booking-slots">
                {(selectedDay?.slots || []).map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={`public-booking-slot ${selectedTime === slot ? 'is-active' : ''}`}
                    onClick={() => setSelectedTime(slot)}
                  >
                    {slot}
                  </button>
                ))}
              </div>

              <form className="public-booking-form" onSubmit={submitBooking}>
                <div className="public-booking-section-head">
                  <div>
                    <span>Your details</span>
                    <h2>Confirm the booking</h2>
                  </div>
                  <p>Add the contact details the staff member should use for the call.</p>
                </div>

                <div className="public-booking-grid">
                  <div>
                    <label className="lbl">Full name *</label>
                    <input className="inp" value={form.client_name} onChange={(e) => setForm((s) => ({ ...s, client_name: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="lbl">Business</label>
                    <input className="inp" value={form.client_business} onChange={(e) => setForm((s) => ({ ...s, client_business: e.target.value }))} />
                  </div>
                  <div>
                    <label className="lbl">Email *</label>
                    <input className="inp" type="email" value={form.client_email} onChange={(e) => setForm((s) => ({ ...s, client_email: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="lbl">Phone</label>
                    <input className="inp" value={form.client_phone} onChange={(e) => setForm((s) => ({ ...s, client_phone: e.target.value }))} />
                  </div>
                  <div className="fc">
                    <label className="lbl">Notes</label>
                    <textarea className="inp" rows={4} value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} style={{ resize: 'vertical' }} />
                  </div>
                </div>

                {message ? <div className="public-booking-message is-success">{message}</div> : null}
                {error && staff ? <div className="public-booking-message is-error">{error}</div> : null}

                <div className="public-booking-actions">
                  <div className="public-booking-summary">
                    <span>Selected slot</span>
                    <strong>{selectedDate && selectedTime ? `${prettyDate(selectedDate)} · ${selectedTime}` : 'Choose a time'}</strong>
                  </div>
                  <button className="btn btn-primary" disabled={saving || !selectedDate || !selectedTime}>
                    {saving ? 'Booking...' : 'Book call'}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
