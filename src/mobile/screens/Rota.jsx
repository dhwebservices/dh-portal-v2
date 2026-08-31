import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function getWeekStart(d = new Date()) {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
  dt.setDate(diff)
  // Format from local date parts, not toISOString() - that converts to UTC
  // first, which rolls the date back by one whenever the local timezone is
  // ahead of UTC (e.g. British Summer Time), silently shifting every
  // computed Monday to the preceding Sunday.
  const year = dt.getFullYear()
  const month = String(dt.getMonth() + 1).padStart(2, '0')
  const day2 = String(dt.getDate()).padStart(2, '0')
  return `${year}-${month}-${day2}`
}

function shiftWeek(ws, offsetDays) {
  const d = new Date(ws + 'T12:00:00')
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

function fmtDay(iso) {
  const d = new Date(iso + 'T12:00:00')
  const today = new Date()
  const same = d.toDateString() === today.toDateString()
  const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  return same ? `${label} · Today` : label
}

function fmtWeek(ws) {
  return new Date(ws + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function shiftHours(shift) {
  if (!shift?.start_time || !shift?.end_time) return 0
  const [sh, sm] = String(shift.start_time).split(':').map(Number)
  const [eh, em] = String(shift.end_time).split(':').map(Number)
  const minutes = (eh * 60 + em) - (sh * 60 + sm) - (Number(shift.break_minutes) || 0)
  return Math.max(0, minutes / 60)
}

function totalHours(shifts) {
  return shifts.reduce((sum, shift) => sum + shiftHours(shift), 0)
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Times are stored as HH:MM:SS in places; the seconds are noise on a phone. */
function fmtTime(value) {
  return String(value || '').slice(0, 5)
}

export default function MobileRota({ goBack, navigate, user, isAdmin, date: initialDate }) {
  const [view, setView] = useState('mine') // 'mine' | 'team'
  // Day is the default because it is the question the rota is usually asked on
  // a phone — "who is in today" — and a seven-column grid answers it badly on
  // a 6-inch screen. The week grid is a tap away for planning.
  const [mode, setMode] = useState('day') // 'day' | 'week'
  const [focusDate, setFocusDate] = useState(initialDate || todayISO())
  const [weekStart, setWeekStart] = useState(getWeekStart(initialDate ? new Date(initialDate + 'T12:00:00') : new Date()))
  const [shifts, setShifts] = useState([])
  const [rates, setRates] = useState(new Map())
  const [onLeave, setOnLeave] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [weekStart, user?.email, isAdmin])

  useEffect(() => {
    // Everyone loads rates now: a shift worker sees what their own shift is
    // estimated to pay. Only a manager sees the whole-day cost.
    loadDayExtras()
  }, [focusDate, isAdmin])

  /**
   * Reads the `shifts` table - the same one the web Rotas page writes to.
   *
   * This screen used to read `schedules`, a separate and older table that the
   * web rota never writes. The two never met, so a shift published on the web
   * simply did not exist as far as the phone was concerned. Anyone carrying
   * leftover `schedules` rows still saw something, which is why the screen
   * looked like it worked for some people and was empty for everyone else.
   */
  const load = async () => {
    setLoading(true)
    try {
      const weekEnd = shiftWeek(weekStart, 6)
      let query = supabase
        .from('shifts')
        .select('*')
        .gte('shift_date', weekStart)
        .lte('shift_date', weekEnd)
        .eq('published', true)
        .order('start_time', { ascending: true })

      // Drafts are hidden from everyone here; the web page is where they are
      // built. Non-admins only ever pull their own row.
      if (!isAdmin) query = query.ilike('employee_email', user?.email || '')

      const { data, error } = await query
      if (error) throw error
      setShifts(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to load rota:', error)
      setShifts([])
    } finally {
      setLoading(false)
    }
  }

  /**
   * Pay rates and today's leave — only a manager sees either, so only a
   * manager pays for the queries.
   *
   * Rates come from `staff.hourly_rate`, which already exists; the cost
   * summary is arithmetic on the client rather than a new endpoint.
   */
  const loadDayExtras = async () => {
    try {
      const [{ data: staff }, { data: leave }] = await Promise.all([
        supabase.from('staff').select('email, hourly_rate'),
        supabase
          .from('leave_requests')
          .select('user_name')
          .eq('status', 'approved')
          .lte('start_date', focusDate)
          .gte('end_date', focusDate),
      ])
      setRates(new Map((staff ?? []).map(r => [String(r.email || '').toLowerCase(), Number(r.hourly_rate) || 0])))
      setOnLeave(leave ?? [])
    } catch (error) {
      console.error('Failed to load rota extras:', error)
    }
  }

  const changeDay = async (offset) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    const d = new Date(focusDate + 'T12:00:00')
    d.setDate(d.getDate() + offset)
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setFocusDate(next)
    // Keep the loaded week in step, so stepping across a Sunday still has data.
    const ws = getWeekStart(d)
    if (ws !== weekStart) setWeekStart(ws)
  }

  const changeWeek = async (offset) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    setWeekStart(shiftWeek(weekStart, offset * 7))
  }

  const switchMode = async (next) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    setMode(next)
  }

  const switchView = async (next) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    setView(next)
  }

  const myEmail = String(user?.email || '').toLowerCase()
  const myShifts = shifts.filter((s) => String(s.employee_email || '').toLowerCase() === myEmail)
  const myWeekTotal = totalHours(myShifts)

  // One row per person, ordered by name, so the team table reads the same way
  // as the web rota.
  const teamRows = Object.values(
    shifts.reduce((acc, shift) => {
      const key = String(shift.employee_email || '').toLowerCase()
      if (!key) return acc
      if (!acc[key]) acc[key] = { email: key, name: shift.employee_name || key, shifts: [] }
      acc[key].shifts.push(shift)
      return acc
    }, {}),
  ).sort((a, b) => a.name.localeCompare(b.name))

  const shiftsOn = (list, date) => list.filter((s) => s.shift_date === date)

  const dayShifts = shiftsOn(isAdmin ? shifts : myShifts, focusDate)

  /** What this shift is estimated to pay: hours worked x that person's rate. */
  const payFor = (shift) =>
    shiftHours(shift) * (rates.get(String(shift.employee_email || '').toLowerCase()) ?? 0)

  const dayCost = dayShifts.reduce(
    (sum, shift) => sum + shiftHours(shift) * (rates.get(String(shift.employee_email || '').toLowerCase()) ?? 0),
    0,
  )

  // "Open" is a shift with nobody's name on it. The web rota can create one,
  // so the phone has to be able to show that it exists and is unfilled.
  const openCount = dayShifts.filter(s => !String(s.employee_email || '').trim()).length

  function DayView() {
    return (
      <div className="rota-day">
        <div className="rota-day-stats">
          <div className="rota-stat">
            <span className="rota-stat-value">{openCount}</span>
            <span className="rota-stat-label">Open shift{openCount === 1 ? '' : 's'}</span>
          </div>
          <div className="rota-stat">
            <span className="rota-stat-value">{onLeave.length}</span>
            <span className="rota-stat-label">On leave</span>
          </div>
        </div>

        {isAdmin && (
          <div className="rota-cost">
            <span>Cost summary</span>
            <strong>£{dayCost.toFixed(2)}</strong>
          </div>
        )}

        {dayShifts.length === 0 ? (
          <div className="mobile-rota-empty">
            {isAdmin ? 'Nobody is scheduled on this day' : 'You are not scheduled on this day'}
          </div>
        ) : (
          <div className="rota-day-list">
            {dayShifts.map(shift => (
              <div
                key={shift.id}
                className={`rota-day-card${isAdmin ? ' rota-day-card-editable' : ''}`}
                onClick={isAdmin ? () => navigate('add-shift', { shift }) : undefined}
              >
                <span className="rota-day-bar" />
                <div className="rota-day-body">
                  <div className="rota-day-top">
                    <strong>{fmtTime(shift.start_time)} – {fmtTime(shift.end_time)}</strong>
                    <span className="rota-day-hours">
                      {shiftHours(shift).toFixed(1)}h
                      {payFor(shift) > 0 && <em> · £{payFor(shift).toFixed(2)}</em>}
                    </span>
                  </div>
                  <div className="rota-day-meta">
                    {[
                      isAdmin
                        ? (shift.employee_name || shift.employee_email || 'Open shift')
                        : null,
                      shift.role,
                      shift.break_minutes ? `${shift.break_minutes}m break` : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                  {isAdmin && !shift.published && (
                    <div className="rota-day-draft">Draft — not yet sent to them</div>
                  )}
                  {shift.note && <div className="rota-day-note">{shift.note}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {onLeave.length > 0 && (
          <div className="rota-leave">
            {onLeave.map(p => p.user_name).filter(Boolean).join(', ')} on leave
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mobile-rota">
      {/* No back button: this is a root tab now, not a screen you arrive at
          from somewhere. */}
      <div className="mobile-rota-header">
        <h1>Rota</h1>
        <div className="mobile-rota-header-right">
        {isAdmin && (
          <button
            className="mobile-rota-add"
            onClick={() => navigate('add-shift', { date: focusDate })}
            aria-label="Add a shift"
          >
            <Icon name="plus" size={18} />
          </button>
        )}
        <div className="mobile-rota-modes">
          <button
            className={mode === 'day' ? 'active' : ''}
            onClick={() => switchMode('day')}
            aria-pressed={mode === 'day'}
          >Day</button>
          <button
            className={mode === 'week' ? 'active' : ''}
            onClick={() => switchMode('week')}
            aria-pressed={mode === 'week'}
          >Week</button>
        </div>
        </div>
      </div>

      {isAdmin && mode === 'week' && (
        <div className="mobile-rota-segment">
          <button className={view === 'mine' ? 'active' : ''} onClick={() => switchView('mine')}>My Shifts</button>
          <button className={view === 'team' ? 'active' : ''} onClick={() => switchView('team')}>Team Rota</button>
        </div>
      )}

      <div className="mobile-rota-week-nav">
        <button
          onClick={() => (mode === 'day' ? changeDay(-1) : changeWeek(-1))}
          aria-label={mode === 'day' ? 'Previous day' : 'Previous week'}
        ><Icon name="chevronLeft" size={18} /></button>
        <span>{mode === 'day' ? fmtDay(focusDate) : fmtWeek(weekStart)}</span>
        <button
          onClick={() => (mode === 'day' ? changeDay(1) : changeWeek(1))}
          aria-label={mode === 'day' ? 'Next day' : 'Next week'}
        ><Icon name="chevronRight" size={18} /></button>
      </div>

      {mode === 'day' && !loading && <DayView />}

      {loading ? (
        <div className="mobile-rota-loading"><div className="mobile-spinner" /></div>
      ) : mode === 'day' ? null : view === 'mine' ? (
        <div className="rota-week">
          <div className="rota-week-total">
            <span>Scheduled this week</span>
            <strong>{myWeekTotal.toFixed(1)}h</strong>
          </div>

          {DAYS.map((day, i) => {
            const dateKey = shiftWeek(weekStart, i)
            const dayShifts = shiftsOn(myShifts, dateKey)
            const date = new Date(dateKey + 'T12:00:00')
            const isToday = dateKey === todayISO()
            return (
              <div key={day} className={`rota-week-day${isToday ? ' is-today' : ''}`}>
                <div className="rota-week-date">
                  <span className="rota-week-dow">{day.slice(0, 3)}</span>
                  <span className="rota-week-num">{date.getDate()}</span>
                </div>

                <div className="rota-week-body">
                  {dayShifts.length ? dayShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className={`rota-week-shift${isAdmin ? ' rota-editable' : ''}`}
                      onClick={isAdmin ? () => navigate('add-shift', { shift }) : undefined}
                    >
                      <span className="rota-week-bar" />
                      <div className="rota-week-shift-body">
                        <div className="rota-week-shift-top">
                          <strong>{fmtTime(shift.start_time)} – {fmtTime(shift.end_time)}</strong>
                          <span className="rota-week-hours">{shiftHours(shift).toFixed(1)}h</span>
                        </div>
                        {(shift.role || shift.note) && (
                          <div className="rota-week-meta">
                            {[shift.role, shift.note].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>
                  )) : (
                    <div className="rota-week-off">Not scheduled</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rota-team">
          {teamRows.length === 0 ? (
            <div className="mobile-rota-empty">No published shifts for this week</div>
          ) : (
            <div className="rota-team-scroll">
              <table className="rota-table">
                <thead>
                  <tr>
                    <th className="mobile-rota-sticky-col">Staff</th>
                    {DAYS.map((d, i) => (
                      <th key={d}>{d.slice(0, 3)} {new Date(shiftWeek(weekStart, i) + 'T12:00:00').getDate()}</th>
                    ))}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {teamRows.map((row) => (
                    <tr key={row.email}>
                      <td className="mobile-rota-sticky-col mobile-rota-staff-name">
                        {row.name.split('(')[0].trim()}
                      </td>
                      {DAYS.map((day, i) => {
                        const dayShifts = shiftsOn(row.shifts, shiftWeek(weekStart, i))
                        return (
                          <td key={day}>
                            {dayShifts.length ? (
                              dayShifts.map((shift) => (
                                <div
                                key={shift.id}
                                className={`mobile-rota-cell-shift${isAdmin ? ' rota-editable' : ''}`}
                                onClick={isAdmin ? () => navigate('add-shift', { shift }) : undefined}
                              >
                                  {fmtTime(shift.start_time)}–{fmtTime(shift.end_time)}
                                </div>
                              ))
                            ) : (
                              <span className="mobile-rota-cell-off">–</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="mobile-rota-cell-total">{totalHours(row.shifts).toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <style>{`
        .rota-day {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 0 16px 20px;
        }

        .rota-day-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .rota-stat {
          background: var(--mobile-card);
          border-radius: 14px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
        }

        .rota-stat-value {
          font-size: 22px;
          font-weight: 700;
          color: var(--mobile-text);
          font-variant-numeric: tabular-nums;
        }

        .rota-stat-label {
          font-size: 13px;
          color: var(--mobile-text-secondary);
        }

        .rota-cost {
          background: var(--mobile-card);
          border-radius: 14px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
          font-size: 15px;
          color: var(--mobile-text-secondary);
        }

        .rota-cost strong {
          font-size: 18px;
          color: var(--mobile-text);
          font-variant-numeric: tabular-nums;
        }

        .rota-day-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .rota-day-card {
          display: flex;
          gap: 12px;
          background: var(--mobile-card);
          border-radius: 14px;
          padding: 14px 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
        }

        /* The coloured spine RotaCloud puts down the left of every shift. */
        .rota-day-bar {
          flex: 0 0 auto;
          width: 4px;
          border-radius: 2px;
          background: var(--mobile-accent);
        }

        .rota-day-body { flex: 1; min-width: 0; }

        .rota-day-top {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }

        .rota-day-top strong {
          font-size: 16px;
          color: var(--mobile-text);
          font-variant-numeric: tabular-nums;
        }

        .rota-day-hours em {
          font-style: normal;
          color: var(--mobile-accent);
        }

        .rota-day-hours {
          font-size: 13px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
          font-variant-numeric: tabular-nums;
        }

        .rota-day-meta {
          margin-top: 2px;
          font-size: 13.5px;
          color: var(--mobile-text-secondary);
        }

        .mobile-rota-header-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .mobile-rota-add {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          border: none;
          background: var(--mobile-accent);
          color: var(--mobile-on-accent);
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        .rota-editable { cursor: pointer; }

        .rota-day-card-editable { cursor: pointer; }
        .rota-day-card-editable:active { transform: scale(0.995); }

        .rota-day-draft {
          margin-top: 6px;
          display: inline-block;
          font-size: 11.5px;
          font-weight: 600;
          color: #b8690c;
          background: rgba(214, 122, 20, 0.14);
          padding: 3px 8px;
          border-radius: 999px;
        }

        .rota-day-note {
          margin-top: 6px;
          font-size: 13px;
          color: var(--mobile-text-secondary);
          opacity: 0.85;
        }

        .rota-leave {
          font-size: 13px;
          color: var(--mobile-text-secondary);
          padding: 2px 4px;
        }

        .rota-week {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 0 16px 20px;
        }

        .rota-week-total {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--mobile-card);
          border-radius: 14px;
          padding: 14px 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
          font-size: 15px;
          color: var(--mobile-text-secondary);
        }

        .rota-week-total strong {
          font-size: 18px;
          color: var(--mobile-text);
          font-variant-numeric: tabular-nums;
        }

        .rota-week-day {
          display: flex;
          gap: 12px;
          background: var(--mobile-card);
          border-radius: 14px;
          padding: 12px 14px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
        }

        /* Today gets a quiet marker rather than a colour wash — you should be
           able to find it without it shouting. */
        .rota-week-day.is-today {
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07), inset 3px 0 0 var(--mobile-accent);
        }

        .rota-week-date {
          flex: 0 0 42px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1px;
        }

        .rota-week-dow {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--mobile-text-secondary);
        }

        .rota-week-num {
          font-size: 19px;
          font-weight: 700;
          color: var(--mobile-text);
          font-variant-numeric: tabular-nums;
        }

        .rota-week-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
          justify-content: center;
        }

        .rota-week-shift {
          display: flex;
          gap: 10px;
        }

        .rota-week-bar {
          flex: 0 0 auto;
          width: 3px;
          border-radius: 2px;
          background: var(--mobile-accent);
        }

        .rota-week-shift-body { flex: 1; min-width: 0; }

        .rota-week-shift-top {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }

        .rota-week-shift-top strong {
          font-size: 15px;
          color: var(--mobile-text);
          font-variant-numeric: tabular-nums;
        }

        .rota-week-hours {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
          font-variant-numeric: tabular-nums;
        }

        .rota-week-meta {
          margin-top: 1px;
          font-size: 13px;
          color: var(--mobile-text-secondary);
        }

        .rota-week-off {
          font-size: 13.5px;
          color: var(--mobile-text-secondary);
          opacity: 0.7;
        }

        .rota-team { padding: 0 16px 20px; }

        .rota-team-scroll {
          overflow-x: auto;
          background: var(--mobile-card);
          border-radius: 14px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
          -webkit-overflow-scrolling: touch;
        }

        .rota-table {
          border-collapse: collapse;
          width: 100%;
          font-size: 13px;
        }

        .rota-table th {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--mobile-text-secondary);
          text-align: left;
          padding: 12px 10px;
          white-space: nowrap;
          border-bottom: 1px solid var(--mobile-border);
        }

        .rota-table td {
          padding: 11px 10px;
          border-bottom: 1px solid var(--mobile-border);
          vertical-align: middle;
          color: var(--mobile-text);
        }

        .rota-table tr:last-child td { border-bottom: none; }

        /* The name column stays put while the days scroll under it. */
        .mobile-rota-sticky-col {
          position: sticky;
          left: 0;
          background: var(--mobile-card);
          z-index: 1;
        }

        .mobile-rota-staff-name {
          font-weight: 600;
          white-space: nowrap;
          padding-right: 14px;
        }

        .mobile-rota-cell-shift {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--mobile-accent);
          background: var(--mobile-accent-soft);
          border-radius: 7px;
          padding: 5px 8px;
          white-space: nowrap;
          margin-bottom: 4px;
          font-variant-numeric: tabular-nums;
        }

        .mobile-rota-cell-off {
          color: var(--mobile-text-secondary);
          opacity: 0.45;
        }

        .mobile-rota-cell-total {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }

        .mobile-rota-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--mobile-text-secondary);
          font-size: 14px;
        }

        .mobile-rota-modes {
          display: inline-flex;
          background: var(--mobile-accent-soft);
          border-radius: 10px;
          padding: 3px;
          gap: 2px;
        }

        .mobile-rota-modes button {
          border: none;
          background: none;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--mobile-accent);
          cursor: pointer;
        }

        .mobile-rota-modes button.active {
          background: var(--mobile-accent);
          color: var(--mobile-on-accent);
        }

        .mobile-rota {
          padding: 16px;
        }

        .mobile-rota-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .mobile-rota-header h1 {
          font-size: 20px;
          font-weight: 700;
          color: var(--mobile-text);
          margin: 0;
        }

        .mobile-rota-back {
          background: none;
          border: none;
          color: var(--mobile-text);
          padding: 4px;
        }

        .mobile-rota-segment {
          display: flex;
          background: var(--mobile-border);
          border-radius: 10px;
          padding: 3px;
          margin-bottom: 16px;
        }

        .mobile-rota-segment button {
          flex: 1;
          padding: 8px 0;
          border: none;
          background: transparent;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
        }

        .mobile-rota-segment button.active {
          background: var(--mobile-card);
          color: var(--mobile-text);
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .mobile-rota-week-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          padding: 0 4px;
        }

        .mobile-rota-week-nav button {
          background: var(--mobile-card);
          border: 1px solid var(--mobile-border);
          border-radius: 8px;
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--mobile-text);
        }

        .mobile-rota-week-nav span {
          font-size: 13px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
        }

        .mobile-rota-loading {
          display: flex;
          justify-content: center;
          padding: 40px 0;
        }

        /* A day can hold more than one shift now that these come from the
           shifts table rather than a single slot per day. */
      `}</style>
    </div>
  )
}
