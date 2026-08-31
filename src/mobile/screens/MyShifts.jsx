import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import Icon from '../components/Icon'
import InfoRow from '../components/InfoRow'
import SectionHeader from '../components/SectionHeader'

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
export default function MobileMyShifts({ navigate, user, isAdmin }) {
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
    <div className="shifts-screen">
      <div className="shifts-head">
        <h1>Shifts</h1>
        <p>{isAdmin ? 'Everyone, from today' : 'Yours, from today'}</p>
      </div>

      {loading && <p className="shifts-note">Loading…</p>}

      {!loading && shifts.length === 0 && (
        <div className="shifts-empty">
          <Icon name="calendar-off" size={34} />
          <p className="shifts-empty-title">Nothing scheduled</p>
          <p className="shifts-note">
            {isAdmin
              ? 'No published shifts from today onwards.'
              : 'You have no upcoming shifts. They appear here once your rota is published.'}
          </p>
        </div>
      )}

      {Object.entries(byDay).map(([date, list]) => (
        <section key={date} className="shifts-day">
          <SectionHeader title={dayLabel(date)} />
          <div className="shifts-stack">
            {list.map(shift => (
              <InfoRow
                key={shift.id}
                icon="clock"
                tone="accent"
                title={`${shift.start_time} – ${shift.end_time}`}
                subtitle={[
                  isAdmin ? shift.employee_name || shift.employee_email : null,
                  shift.role,
                  shift.break_minutes ? `${shift.break_minutes}m break` : null,
                ].filter(Boolean).join(' · ') || undefined}
                value={length(shift)}
                onPress={() => navigate('rota', { date: shift.shift_date })}
              />
            ))}
          </div>
        </section>
      ))}

      <style>{`
        .shifts-screen {
          padding: 20px 16px 24px;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }

        .shifts-head h1 {
          margin: 0 0 2px;
          font-size: 26px;
          font-weight: 700;
          color: var(--mobile-text);
          letter-spacing: -0.02em;
        }

        .shifts-head p {
          margin: 0;
          font-size: 14px;
          color: var(--mobile-text-secondary);
        }

        .shifts-day { display: block; }

        .shifts-stack {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .shifts-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 44px 24px;
          color: var(--mobile-text-secondary);
          text-align: center;
        }

        .shifts-empty-title {
          margin: 4px 0 0;
          font-size: 17px;
          font-weight: 600;
          color: var(--mobile-text);
        }

        .shifts-note {
          margin: 0;
          font-size: 14px;
          color: var(--mobile-text-secondary);
          max-width: 34ch;
        }
      `}</style>
    </div>
  )
}
