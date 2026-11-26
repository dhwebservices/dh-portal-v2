import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import Icon from '../components/Icon'
import { Screen, Sec, Empty, Loading } from '../components/UI'

/**
 * Your shifts, in order, as a list.
 *
 * Distinct from the Rota tab on purpose. The rota is a grid you read across —
 * it answers "who is working Thursday". This answers "when am I next in",
 * which is the question a phone actually gets asked, and a grid is a poor way
 * to answer it on a 6-inch screen.
 *
 * A manager sees the whole team's; everyone else sees their own. The scoping
 * matches `Rota.jsx`, which filters on `employee_email` for non-admins.
 */
export default function MobileMyShifts({ navigate, goBack, user, isAdmin }) {
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [user?.email])

  const load = async () => {
    setLoading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)

      let query = supabase
        .from('shifts')
        .select('id, employee_email, employee_name, shift_date, start_time, end_time, break_minutes, role, note')
        .eq('published', true)
        .gte('shift_date', today)
        .order('shift_date')
        .order('start_time')
        .limit(60)

      // Same rule as the rota: unless you manage, you see yours.
      if (!isAdmin) query = query.ilike('employee_email', user?.email || '')

      const { data, error } = await query
      if (error) throw error
      setShifts(data ?? [])
    } catch (error) {
      console.error('Failed to load shifts:', error)
    } finally {
      setLoading(false)
    }
  }

  // Grouped by day, because "when am I next in" is answered by a date heading
  // far faster than by fifty rows each repeating their own date.
  const byDay = shifts.reduce((groups, shift) => {
    (groups[shift.shift_date] ||= []).push(shift)
    return groups
  }, {})

  const dayLabel = (iso) => {
    const date = new Date(`${iso}T00:00:00`)
    const today = new Date()
    const tomorrow = new Date()
    tomorrow.setDate(today.getDate() + 1)

    const same = (a, b) => a.toDateString() === b.toDateString()
    if (same(date, today)) return 'Today'
    if (same(date, tomorrow)) return 'Tomorrow'
    return date.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
  }

  const length = (shift) => {
    const minutes = (t) => {
      const [h, m] = String(t ?? '').split(':').map(Number)
      return Number.isFinite(h) ? h * 60 + (m || 0) : null
    }
    const from = minutes(shift.start_time)
    const to = minutes(shift.end_time)
    if (from === null || to === null) return null
    const worked = Math.max(0, to - from - (shift.break_minutes || 0))
    return `${(worked / 60).toFixed(worked % 60 === 0 ? 0 : 1)}h`
  }

  return (
    <Screen title="My shifts" onBack={goBack}>
      <span className="dh-sub">{isAdmin ? 'Everyone, from today' : 'Yours, from today'}</span>

      {loading && <Loading />}

      {!loading && shifts.length === 0 && (
        <Empty
          icon="calendar-off"
          title="Nothing scheduled"
          sub={isAdmin
            ? 'No published shifts from today onwards.'
            : 'You have no upcoming shifts. They appear here once your rota is published.'}
        />
      )}

      {Object.entries(byDay).map(([date, list]) => (
        <section key={date} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Sec>{dayLabel(date)}</Sec>
          <div className="dh-card">
            {list.map(shift => (
              <button key={shift.id} type="button" className="dh-row" onClick={() => navigate('rota', { date: shift.shift_date })}>
                <span className="dh-ic"><Icon name="clock" size={18} /></span>
                <span className="dh-g">
                  <span className="dh-t">{shift.start_time} – {shift.end_time}</span>
                  {[isAdmin ? shift.employee_name || shift.employee_email : null, shift.role, shift.break_minutes ? `${shift.break_minutes}m break` : null].filter(Boolean).length > 0 && (
                    <span className="dh-sub">
                      {[isAdmin ? shift.employee_name || shift.employee_email : null, shift.role, shift.break_minutes ? `${shift.break_minutes}m break` : null].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="dh-val">{length(shift)}</span>
                <span className="dh-chev"><Icon name="chevron-right" size={18} /></span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </Screen>
  )
}
