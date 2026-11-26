import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import Icon from '../components/Icon'
import { Chip } from '../components/DH'
import { Screen, HeaderButton, Sec, KV, Seg, Pills, Pill, Btn, Note, Empty, Loading } from '../components/UI'

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

  function ShiftRow({ shift, who }) {
    const Tag = isAdmin ? 'button' : 'div'
    return (
      <Tag type={isAdmin ? 'button' : undefined} className="dh-row" onClick={isAdmin ? () => navigate('add-shift', { shift }) : undefined}>
        <span className="rota-bar" />
        <span className="dh-g">
          <span className="dh-t">{fmtTime(shift.start_time)} – {fmtTime(shift.end_time)}</span>
          <span className="dh-sub">
            {[
              who ? (shift.employee_name || shift.employee_email || 'Open shift') : null,
              shift.role,
              shift.break_minutes ? `${shift.break_minutes}m break` : null,
            ].filter(Boolean).join(' · ')}
          </span>
          {shift.note && <span className="dh-sub">{shift.note}</span>}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span className="dh-val">{shiftHours(shift).toFixed(1)}h</span>
          {isAdmin && !shift.published && <Chip tone="amber">Draft</Chip>}
          {who && payFor(shift) > 0 && <span className="dh-sub">£{payFor(shift).toFixed(2)}</span>}
        </span>
      </Tag>
    )
  }

  function DayView() {
    return (
      <>
        <div className={`dh-tiles${isAdmin ? ' t3' : ''}`}>
          <div className="dh-tile"><span className="dh-num">{openCount}</span><span className="dh-sub">Open shift{openCount === 1 ? '' : 's'}</span></div>
          <div className="dh-tile"><span className="dh-num">{onLeave.length}</span><span className="dh-sub">On leave</span></div>
          {isAdmin && <div className="dh-tile"><span className="dh-num">£{dayCost.toFixed(0)}</span><span className="dh-sub">Cost</span></div>}
        </div>

        {dayShifts.length === 0 ? (
          <Empty icon="calendar" title={isAdmin ? 'Nobody is scheduled on this day' : 'You are not scheduled on this day'} />
        ) : (
          <div className="dh-card">
            {dayShifts.map(shift => <ShiftRow key={shift.id} shift={shift} who={isAdmin} />)}
          </div>
        )}

        {onLeave.length > 0 && (
          <Note>{onLeave.map(p => p.user_name).filter(Boolean).join(', ')} on leave</Note>
        )}
      </>
    )
  }

  return (
    <Screen
      title="Rota"
      onBack={goBack}
      action={isAdmin ? <HeaderButton onPress={() => navigate('add-shift', { date: focusDate })} label="Add a shift"><Icon name="plus" size={20} /></HeaderButton> : null}
    >
      <Seg value={mode} onChange={switchMode} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} />

      {isAdmin && mode === 'week' && (
        <Pills>
          <Pill on={view === 'team'} onPress={() => switchView('team')}>Team rota</Pill>
          <Pill on={view === 'mine'} onPress={() => switchView('mine')}>My shifts</Pill>
        </Pills>
      )}

      <div className="rota-nav">
        <button type="button" className="dh-back" onClick={() => (mode === 'day' ? changeDay(-1) : changeWeek(-1))} aria-label={mode === 'day' ? 'Previous day' : 'Previous week'}>
          <Icon name="chevronLeft" size={22} />
        </button>
        <span className="dh-h2" style={{ fontSize: 17 }}>{mode === 'day' ? fmtDay(focusDate) : fmtWeek(weekStart)}</span>
        <button type="button" className="dh-back" onClick={() => (mode === 'day' ? changeDay(1) : changeWeek(1))} aria-label={mode === 'day' ? 'Next day' : 'Next week'}>
          <Icon name="chevronRight" size={22} />
        </button>
      </div>

      {mode === 'day' && !loading && <DayView />}

      {loading ? <Loading /> : mode === 'day' ? null : view === 'mine' ? (
        <>
          <div className="dh-card">
            {DAYS.map((day, i) => {
              const dateKey = shiftWeek(weekStart, i)
              const dayShifts = shiftsOn(myShifts, dateKey)
              const date = new Date(dateKey + 'T12:00:00')
              const isToday = dateKey === todayISO()
              return (
                <div key={day} className={`dh-row top rota-week-row${isToday ? ' today' : ''}`}>
                  <span className="rota-date"><span className="dh-t">{day.slice(0, 3)}</span><span className="dh-sub">{date.getDate()}</span></span>
                  <span className="dh-g">
                    {dayShifts.length ? dayShifts.map(shift => (
                      <span
                        key={shift.id}
                        className={`rota-chip${isAdmin ? ' edit' : ''}`}
                        onClick={isAdmin ? () => navigate('add-shift', { shift }) : undefined}
                      >
                        <b>{fmtTime(shift.start_time)} – {fmtTime(shift.end_time)}</b>
                        <span>{[`${shiftHours(shift).toFixed(1)}h`, shift.role, shift.note].filter(Boolean).join(' · ')}</span>
                      </span>
                    )) : <span className="dh-sub">Not scheduled</span>}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="dh-card">
            <div className="dh-row"><span className="dh-g"><span className="dh-t">Scheduled this week</span></span><span className="dh-val">{myWeekTotal.toFixed(1)}h</span></div>
          </div>
        </>
      ) : (
        teamRows.length === 0 ? <Empty icon="calendar" title="No published shifts for this week" /> : (
          <>
            <div className="dh-card">
              {DAYS.map((day, i) => {
                const dateKey = shiftWeek(weekStart, i)
                const date = new Date(dateKey + 'T12:00:00')
                const isToday = dateKey === todayISO()
                const entries = teamRows.flatMap(row => shiftsOn(row.shifts, dateKey).map(shift => ({ row, shift })))
                return (
                  <div key={day} className={`dh-row top rota-week-row${isToday ? ' today' : ''}`}>
                    <span className="rota-date"><span className="dh-t">{day.slice(0, 3)}</span><span className="dh-sub">{date.getDate()}</span></span>
                    <span className="dh-g">
                      {entries.length ? entries.map(({ row, shift }) => (
                        <span
                          key={shift.id}
                          className={`rota-chip${isAdmin ? ' edit' : ''}`}
                          onClick={isAdmin ? () => navigate('add-shift', { shift }) : undefined}
                        >
                          <b>{row.name.split('(')[0].trim()}</b>
                          <span>{fmtTime(shift.start_time)} – {fmtTime(shift.end_time)}{shift.role ? ` · ${shift.role}` : ''}</span>
                        </span>
                      )) : <span className="dh-sub">No published shifts</span>}
                    </span>
                  </div>
                )
              })}
            </div>
            <Sec>Hours this week</Sec>
            <div className="dh-card">
              {teamRows.map(row => <KV key={row.email} k={row.name.split('(')[0].trim()} v={`${totalHours(row.shifts).toFixed(1)}h`} />)}
            </div>
          </>
        )
      )}

      {isAdmin && <Btn onPress={() => navigate('add-shift', { date: focusDate })}>Add a shift</Btn>}

      <style>{`
        .rota-nav { display: flex; align-items: center; justify-content: space-between; margin: -4px -12px; }
        .rota-bar { width: 4px; align-self: stretch; border-radius: 2px; background: var(--mobile-accent); flex: none; }
        .rota-date { width: 44px; flex: none; display: flex; flex-direction: column; gap: 2px; }
        .rota-week-row.today { background: var(--mobile-accent-soft); }
        .rota-week-row .dh-g { gap: 6px; }
        .rota-chip { display: flex; flex-direction: column; gap: 1px; padding: 6px 10px; border-radius: 10px; background: var(--mobile-bg); border-left: 3px solid var(--mobile-accent); font-size: 13px; color: var(--mobile-text-secondary); }
        .rota-chip b { font-size: 14px; color: var(--mobile-text); font-weight: 600; }
        .rota-chip.edit { cursor: pointer; }
      `}</style>
    </Screen>
  )
}
