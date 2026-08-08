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

function fmtWeek(ws) {
  return new Date(ws + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function dayHours(entry) {
  if (!entry?.start || !entry?.end) return 0
  const [sh, sm] = entry.start.split(':').map(Number)
  const [eh, em] = entry.end.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
}

export default function MobileRota({ goBack, user, isAdmin }) {
  const [view, setView] = useState('mine') // 'mine' | 'team'
  const [weekStart, setWeekStart] = useState(getWeekStart())
  const [mySchedule, setMySchedule] = useState(null)
  const [teamSchedules, setTeamSchedules] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [weekStart, user?.email])

  const load = async () => {
    setLoading(true)
    try {
      const { data: mine } = await supabase
        .from('schedules')
        .select('*')
        .ilike('user_email', user.email)
        .eq('week_start', weekStart)
        .maybeSingle()
      setMySchedule(mine || null)

      if (isAdmin) {
        const { data: team } = await supabase
          .from('schedules')
          .select('*')
          .eq('week_start', weekStart)
          .order('user_name')
        setTeamSchedules(team || [])
      }
    } catch (error) {
      console.error('Failed to load rota:', error)
    } finally {
      setLoading(false)
    }
  }

  const changeWeek = async (offset) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    setWeekStart(shiftWeek(weekStart, offset * 7))
  }

  const switchView = async (next) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    setView(next)
  }

  const myWeekTotal = mySchedule ? DAYS.reduce((sum, d) => sum + dayHours(mySchedule.week_data?.[d]), 0) : 0

  return (
    <div className="mobile-rota">
      <div className="mobile-rota-header">
        <button className="mobile-rota-back" onClick={goBack}>
          <Icon name="arrowLeft" size={20} />
        </button>
        <h1>Rota</h1>
        <div style={{ width: 20 }} />
      </div>

      {isAdmin && (
        <div className="mobile-rota-segment">
          <button className={view === 'mine' ? 'active' : ''} onClick={() => switchView('mine')}>My Shifts</button>
          <button className={view === 'team' ? 'active' : ''} onClick={() => switchView('team')}>Team Rota</button>
        </div>
      )}

      <div className="mobile-rota-week-nav">
        <button onClick={() => changeWeek(-1)}><Icon name="chevronLeft" size={18} /></button>
        <span>{fmtWeek(weekStart)}</span>
        <button onClick={() => changeWeek(1)}><Icon name="chevronRight" size={18} /></button>
      </div>

      {loading ? (
        <div className="mobile-rota-loading"><div className="mobile-spinner" /></div>
      ) : view === 'mine' ? (
        <div className="mobile-rota-list">
          <MobileCard small className="mobile-rota-total">
            <Icon name="clock" size={20} color="var(--mobile-accent)" />
            <div>
              <h4>{myWeekTotal.toFixed(1)}h</h4>
              <p>Scheduled this week</p>
            </div>
          </MobileCard>

          {DAYS.map((day, i) => {
            const entry = mySchedule?.week_data?.[day]
            const hasShift = entry?.start && entry?.end
            const date = new Date(shiftWeek(weekStart, i) + 'T12:00:00')
            return (
              <MobileCard key={day} small className="mobile-rota-day-row">
                <div className="mobile-rota-day-label">
                  <div className="mobile-rota-day-name">{day.slice(0, 3)}</div>
                  <div className="mobile-rota-day-date">{date.getDate()}</div>
                </div>
                {hasShift ? (
                  <div className="mobile-rota-shift-block">
                    <div className="mobile-rota-shift-time">{entry.start} – {entry.end}</div>
                    {entry.note && <div className="mobile-rota-shift-note">{entry.note}</div>}
                  </div>
                ) : (
                  <div className="mobile-rota-off">No shift</div>
                )}
              </MobileCard>
            )
          })}
        </div>
      ) : (
        <div className="mobile-rota-team">
          {teamSchedules.length === 0 ? (
            <div className="mobile-rota-empty">No schedules submitted for this week</div>
          ) : (
            <div className="mobile-rota-team-scroll">
              <table className="mobile-rota-table">
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
                  {teamSchedules.map((s) => {
                    const hrs = DAYS.reduce((sum, d) => sum + dayHours(s.week_data?.[d]), 0)
                    return (
                      <tr key={s.id}>
                        <td className="mobile-rota-sticky-col mobile-rota-staff-name">{s.user_name?.split('(')[0].trim()}</td>
                        {DAYS.map((day) => {
                          const entry = s.week_data?.[day]
                          const hasShift = entry?.start && entry?.end
                          return (
                            <td key={day}>
                              {hasShift ? (
                                <div className="mobile-rota-cell-shift">{entry.start}–{entry.end}</div>
                              ) : (
                                <span className="mobile-rota-cell-off">–</span>
                              )}
                            </td>
                          )
                        })}
                        <td className="mobile-rota-cell-total">{hrs.toFixed(1)}h</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <style>{`
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

        .mobile-rota-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .mobile-rota-total {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .mobile-rota-total h4 {
          font-size: 20px;
          font-weight: 700;
          color: var(--mobile-text);
          margin: 0;
        }

        .mobile-rota-total p {
          font-size: 12px;
          color: var(--mobile-text-secondary);
          margin: 2px 0 0;
        }

        .mobile-rota-day-row {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .mobile-rota-day-label {
          width: 44px;
          text-align: center;
          flex-shrink: 0;
        }

        .mobile-rota-day-name {
          font-size: 11px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
        }

        .mobile-rota-day-date {
          font-size: 16px;
          font-weight: 700;
          color: var(--mobile-text);
        }

        .mobile-rota-shift-block {
          flex: 1;
          background: rgba(184, 150, 12, 0.12);
          border-radius: 8px;
          padding: 8px 12px;
        }

        .mobile-rota-shift-time {
          font-size: 14px;
          font-weight: 600;
          color: var(--mobile-accent);
        }

        .mobile-rota-shift-note {
          font-size: 12px;
          color: var(--mobile-text-secondary);
          margin-top: 2px;
        }

        .mobile-rota-off {
          flex: 1;
          font-size: 13px;
          color: var(--mobile-text-secondary);
          padding: 8px 12px;
        }

        .mobile-rota-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--mobile-text-secondary);
          font-size: 14px;
        }

        .mobile-rota-team-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          background: var(--mobile-card);
          border-radius: 12px;
          border: 1px solid var(--mobile-border);
        }

        .mobile-rota-table {
          border-collapse: collapse;
          font-size: 12px;
          min-width: 640px;
          width: 100%;
        }

        .mobile-rota-table th {
          text-align: left;
          padding: 10px 12px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
          border-bottom: 1px solid var(--mobile-border);
          background: var(--mobile-bg);
          white-space: nowrap;
        }

        .mobile-rota-table td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--mobile-border);
          white-space: nowrap;
        }

        .mobile-rota-sticky-col {
          position: sticky;
          left: 0;
          background: var(--mobile-card);
          z-index: 1;
        }

        .mobile-rota-staff-name {
          font-weight: 600;
          color: var(--mobile-text);
        }

        .mobile-rota-cell-shift {
          color: var(--mobile-accent);
          font-weight: 600;
        }

        .mobile-rota-cell-off {
          color: var(--mobile-text-secondary);
        }

        .mobile-rota-cell-total {
          font-weight: 700;
          color: var(--mobile-text);
        }
      `}</style>
    </div>
  )
}
