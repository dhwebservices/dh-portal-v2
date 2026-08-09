import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { StaffPicker } from '../components/StaffPicker'
import { sendManagedNotification } from '../utils/notificationPreferences'
import { enqueueMicrosoftCalendarSyncJob } from '../utils/microsoftCalendarSyncQueue'
import { Button, FormField, FormLabel, FormInput, FormSelect, StatusBadge } from '../components/ds'

const DS_CARD = { background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)' }
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const WEEKDAYS = DAYS.slice(0, 5)
const PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'
const HOURS = Array.from({length:19},(_,i)=>{
  const h = i + 7 // 07:00 - 23:00
  return h.toString().padStart(2,'0') + ':00'
})
const QUICK_PATTERNS = [
  { id: 'starter', label: 'Weekdays 09:00-17:00', start: '09:00', end: '17:00', days: WEEKDAYS },
  { id: 'extended', label: 'Weekdays 10:00-18:00', start: '10:00', end: '18:00', days: WEEKDAYS },
  { id: 'full-week', label: 'Mon-Sat 10:00-18:00', start: '10:00', end: '18:00', days: DAYS.slice(0, 6) },
]

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

function dayHours(d) {
  if (!d?.start || !d?.end) return 0
  const [sh,sm] = d.start.split(':').map(Number)
  const [eh,em] = d.end.split(':').map(Number)
  return Math.max(0, (eh*60+em - sh*60-sm) / 60)
}

function shiftWeek(ws, offsetDays) {
  const d = new Date(ws + 'T12:00:00')
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

function fmtWeek(ws) {
  return new Date(ws + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
}

const EMPTY_SCHEDULE = Object.fromEntries(DAYS.map(d => [d, { start:'', end:'', note:'' }]))

function scheduleSummary(schedule) {
  return DAYS.map(day => {
    const entry = schedule?.[day] || {}
    if (!entry.start || !entry.end) return [day, 'Off']
    const suffix = entry.note ? ' (' + entry.note + ')' : ''
    return [day, entry.start + ' - ' + entry.end + suffix]
  })
}

function scheduleEmailHtml({ targetName, managerName, weekStart, schedule, submitted }) {
  const actionLabel = submitted ? 'submitted' : 'saved as a draft'
  return '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px">' +
    '<h2 style="color:#1A1612;margin-bottom:4px">Your schedule has been updated</h2>' +
    '<p style="color:#6b7280;margin-bottom:20px">Hi ' + targetName + ', your manager <strong>' + managerName + '</strong> has ' + actionLabel + ' your schedule for the week starting <strong>' + fmtWeek(weekStart) + '</strong>.</p>' +
    '<table style="width:100%;border-collapse:collapse;margin:16px 0">' +
    scheduleSummary(schedule).map(([label, value]) =>
      '<tr><td style="padding:9px 12px;background:#F9FAFB;border:1px solid #E5E7EB;font-weight:600;width:120px;font-size:13px">' + label + '</td><td style="padding:9px 12px;border:1px solid #E5E7EB;font-size:13px">' + value + '</td></tr>'
    ).join('') +
    '</table>' +
    '<a href="' + PORTAL_URL + '/schedule" style="display:inline-block;background:#1A1612;color:#fff;padding:10px 22px;border-radius:7px;text-decoration:none;font-size:13px;margin-top:8px">View Schedule →</a>' +
    '</div>'
}

export default function Schedule() {
  const { user, isAdmin } = useAuth()
  const [weekStart, setWeekStart] = useState(getWeekStart())
  const [schedule, setSchedule]   = useState(EMPTY_SCHEDULE)
  const [submitted, setSubmitted] = useState(false)
  const [recordId, setRecordId]   = useState(null)
  const [saving, setSaving]       = useState(false)
  const [loading, setLoading]     = useState(true)
  const [allSchedules, setAll]    = useState([])
  const [tab, setTab]             = useState('mine')
  // Admin: set schedule on behalf of another staff member
  const [onBehalfOf, setOnBehalfOf] = useState(null) // { email, name }
  const [patternForm, setPatternForm] = useState({ start: '09:00', end: '17:00', note: '' })

  const targetEmail = onBehalfOf ? onBehalfOf.email : user?.email
  const targetName  = onBehalfOf ? onBehalfOf.name  : user?.name

  const load = useCallback(async () => {
    if (!user?.email) return
    setLoading(true)

    // Load this user's (or target's) schedule for the week
    const { data } = await supabase
      .from('schedules')
      .select('*')
      .ilike('user_email', targetEmail)
      .eq('week_start', weekStart)
      .maybeSingle()

    if (data) {
      setSchedule(data.week_data || EMPTY_SCHEDULE)
      setSubmitted(data.submitted || false)
      setRecordId(data.id)
    } else {
      setSchedule(EMPTY_SCHEDULE)
      setSubmitted(false)
      setRecordId(null)
    }

    // Load all schedules for team view
    const { data: all } = await supabase
      .from('schedules')
      .select('*')
      .eq('week_start', weekStart)
      .order('user_name')
    setAll(all || [])

    setLoading(false)
  }, [weekStart, targetEmail, user?.email])

  useEffect(() => { load() }, [load])

  // Reset onBehalfOf when switching to My Schedule tab
  const switchTab = (t) => {
    setTab(t)
    if (t === 'mine') setOnBehalfOf(null)
  }

  const setDay = (day, field, val) =>
    setSchedule(p => ({ ...p, [day]: { ...(p[day]||{}), [field]: val } }))

  const save = async (submit = false) => {
    setSaving(true)
    const payload = {
      user_email: targetEmail,
      user_name: targetName,
      week_start: weekStart,
      week_data: schedule,
      submitted: submit,
      submitted_at: submit ? new Date().toISOString() : null,
      ...(onBehalfOf ? { manager_edited: true, manager_email: user.email, manager_name: user.name } : {}),
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('schedules')
      .upsert(payload, { onConflict: 'user_email,week_start' })
      .select()
      .maybeSingle()

    if (!error) {
      setSubmitted(submit)
      if (data) setRecordId(data.id)
      // Reload team view
      const { data: all } = await supabase.from('schedules').select('*').eq('week_start', weekStart).order('user_name')
      setAll(all || [])

      if (onBehalfOf) {
        const title = submit ? '📅 Your schedule has been submitted' : '📅 Your schedule has been updated'
        const message = (user?.name || user?.email) + ' ' + (submit ? 'submitted' : 'saved a draft of') + ' your schedule for the week starting ' + fmtWeek(weekStart)
        await sendManagedNotification({
          userEmail: targetEmail,
          userName: targetName,
          title,
          message,
          link: '/schedule',
          type: submit ? 'success' : 'info',
          category: 'schedule',
          emailSubject: title + ' — Week of ' + fmtWeek(weekStart),
          emailHtml: scheduleEmailHtml({
            targetName,
            managerName: user?.name || user?.email,
            weekStart,
            schedule,
            submitted: submit,
          }),
          sentBy: user?.name || user?.email,
          portalUrl: PORTAL_URL,
        }).catch(() => {})
      }

      if (data?.id) {
        await enqueueMicrosoftCalendarSyncJob({
          staffEmail: targetEmail,
          jobType: 'schedule_upsert',
          sourceTable: 'schedules',
          sourceId: data.id,
          payload: {
            trigger: submit ? 'schedule_submitted' : 'schedule_saved',
            submitted: !!submit,
            week_start: weekStart,
          },
        })
      }
    }
    setSaving(false)
  }

  const copyPreviousWeek = async () => {
    if (!targetEmail) return
    setSaving(true)
    const previousWeek = shiftWeek(weekStart, -7)
    const { data } = await supabase
      .from('schedules')
      .select('week_data')
      .ilike('user_email', targetEmail)
      .eq('week_start', previousWeek)
      .maybeSingle()

    if (data?.week_data) {
      setSchedule(data.week_data)
      setSubmitted(false)
      setRecordId(null)
    }
    setSaving(false)
  }

  const clearWeek = () => {
    setSchedule(EMPTY_SCHEDULE)
    setSubmitted(false)
    setRecordId(null)
  }

  const applyPattern = ({ start, end, days, note = '' }) => {
    setSchedule((current) => {
      const next = { ...current }
      DAYS.forEach((day) => {
        if (days.includes(day)) {
          next[day] = { start, end, note }
        }
      })
      return next
    })
    setSubmitted(false)
  }

  const applyCustomWeekdayPattern = () => {
    if (!patternForm.start || !patternForm.end) return
    applyPattern({ start: patternForm.start, end: patternForm.end, days: WEEKDAYS, note: patternForm.note || '' })
  }

  const editSchedule = async () => {
    // Unlock for editing — don't wipe the data
    if (recordId) {
      await supabase.from('schedules').update({ submitted: false, updated_at: new Date().toISOString() }).eq('id', recordId)
      await enqueueMicrosoftCalendarSyncJob({
        staffEmail: targetEmail,
        jobType: 'schedule_upsert',
        sourceTable: 'schedules',
        sourceId: recordId,
        payload: {
          trigger: 'schedule_unsubmitted',
          submitted: false,
          week_start: weekStart,
        },
      })
    }
    setSubmitted(false)
  }

  const prevWeek = () => setWeekStart(shiftWeek(weekStart, -7))
  const nextWeek = () => setWeekStart(shiftWeek(weekStart, 7))

  const totalHours = Object.values(schedule).reduce((sum, d) => sum + dayHours(d), 0)
  const isEditing = !submitted
  const canEdit = isAdmin || !onBehalfOf

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div><h1>Schedule</h1><p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Weekly availability</p></div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {[['mine','My Schedule'],['team','Team View']].map(([k,l]) => (
          <Button key={k} onClick={() => switchTab(k)} variant={tab===k ? 'primary' : 'secondary'} style={{ height:30, fontSize:12, padding:'0 10px' }}>{l}</Button>
        ))}
      </div>

      {/* Week navigator */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={prevWeek}>← Prev</Button>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--color-text-secondary)' }}>
          Week of {fmtWeek(weekStart)}
        </div>
        <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={nextWeek}>Next →</Button>
        <div style={{ marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--color-primary)' }}>
          {totalHours.toFixed(1)} hrs total
        </div>
        {submitted && <StatusBadge variant="active">Submitted</StatusBadge>}
      </div>

      {/* ── MY SCHEDULE TAB ── */}
      {tab === 'mine' && (
        <>
          {/* Admin: set schedule on behalf of staff */}
          {isAdmin && (
            <div style={{ marginBottom:16, padding:'12px 16px', background:'var(--color-gray-50)', borderRadius:10, border:'1px solid var(--color-border)' }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-secondary)', marginBottom:10 }}>
                Set schedule on behalf of staff member
              </div>
              <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:200 }}>
                  <StaffPicker
                    label=""
                    value={onBehalfOf?.email || ''}
                    onChange={({ email, name }) => setOnBehalfOf(email ? { email, name } : null)}
                    placeholder="Select staff member (or leave blank for yourself)..."
                  />
                </div>
                {onBehalfOf && (
                  <Button variant="ghost" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => setOnBehalfOf(null)}>
                    × Clear (back to my schedule)
                  </Button>
                )}
              </div>
              {onBehalfOf && (
                <div style={{ marginTop:8, fontSize:12, color:'var(--color-primary)', fontWeight:500 }}>
                  ✎ Editing schedule for: {onBehalfOf.name}
                </div>
              )}
            </div>
          )}

          {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
            <>
              <div style={{ ...DS_CARD, padding:20, marginBottom: 16, display:'grid', gap:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <div>
                    <div style={{ fontSize:16, fontWeight:600, marginBottom:4 }}>Weekly shortcuts</div>
                    <div style={{ fontSize:12, color:'var(--color-text-secondary)', lineHeight:1.6 }}>
                      Reuse a previous rota, apply a standard weekday pattern, or clear the week before rebuilding it.
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={copyPreviousWeek} disabled={saving}>
                      {saving ? 'Loading...' : 'Copy previous week'}
                    </Button>
                    <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={clearWeek}>
                      Clear week
                    </Button>
                  </div>
                </div>

                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {QUICK_PATTERNS.map((pattern) => (
                    <Button
                      key={pattern.id}
                      variant="secondary"
                      style={{ height:28, fontSize:12, padding:'0 8px' }}
                      onClick={() => applyPattern(pattern)}
                    >
                      {pattern.label}
                    </Button>
                  ))}
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16 }}>
                  <FormField>
                    <FormLabel>Weekday start</FormLabel>
                    <FormSelect value={patternForm.start} onChange={e => setPatternForm(p => ({ ...p, start: e.target.value }))}>
                      {HOURS.map(h => <option key={h}>{h}</option>)}
                    </FormSelect>
                  </FormField>
                  <FormField>
                    <FormLabel>Weekday end</FormLabel>
                    <FormSelect value={patternForm.end} onChange={e => setPatternForm(p => ({ ...p, end: e.target.value }))}>
                      {HOURS.map(h => <option key={h}>{h}</option>)}
                    </FormSelect>
                  </FormField>
                  <FormField className="staff-onboarding-fc">
                    <FormLabel>Shared note</FormLabel>
                    <FormInput value={patternForm.note} onChange={e => setPatternForm(p => ({ ...p, note: e.target.value }))} placeholder="Optional note applied Monday to Friday" />
                  </FormField>
                </div>

                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <Button variant="primary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={applyCustomWeekdayPattern}>
                    Apply weekday pattern
                  </Button>
                  <div style={{ fontSize:12, color:'var(--color-text-tertiary)', display:'flex', alignItems:'center' }}>
                    Fills Monday to Friday only. Weekend shifts stay as they are unless you edit them below.
                  </div>
                </div>
              </div>

              <div style={{ ...DS_CARD, overflow:'hidden', marginBottom:16 }}>
                <table className="ds-table">
                  <thead>
                    <tr><th>Day</th><th>Start</th><th>End</th><th>Hours</th><th>Note</th></tr>
                  </thead>
                  <tbody>
                    {DAYS.map(day => {
                      const d = schedule[day] || {}
                      const hrs = dayHours(d)
                      return (
                        <tr key={day}>
                          <td style={{ width:100 }}>{day}</td>
                          <td>
                            <FormSelect style={{ padding:'5px 8px', fontSize:12, width:90 }}
                              value={d.start||''} onChange={e=>setDay(day,'start',e.target.value)}
                              disabled={submitted && !isAdmin}>
                              <option value="">Off</option>
                              {HOURS.map(h=><option key={h}>{h}</option>)}
                            </FormSelect>
                          </td>
                          <td>
                            <FormSelect style={{ padding:'5px 8px', fontSize:12, width:90 }}
                              value={d.end||''} onChange={e=>setDay(day,'end',e.target.value)}
                              disabled={submitted && !isAdmin}>
                              <option value="">—</option>
                              {HOURS.map(h=><option key={h}>{h}</option>)}
                            </FormSelect>
                          </td>
                          <td style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>
                            {hrs > 0 ? hrs.toFixed(1)+'h' : '—'}
                          </td>
                          <td>
                            <FormInput style={{ padding:'5px 8px', fontSize:12 }}
                              value={d.note||''} onChange={e=>setDay(day,'note',e.target.value)}
                              placeholder="Optional note"
                              disabled={submitted && !isAdmin}/>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {(!submitted || isAdmin) && (
                  <Button variant="secondary" onClick={() => save(false)} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Draft'}
                  </Button>
                )}
                {(!submitted || isAdmin) && (
                  <Button variant="primary" onClick={() => save(true)} disabled={saving}>
                    {saving ? 'Submitting...' : onBehalfOf ? `Submit for ${onBehalfOf.name.split(' ')[0]}` : 'Submit Schedule'}
                  </Button>
                )}
                {submitted && !isAdmin && (
                  <Button variant="secondary" onClick={editSchedule}>
                    Edit Schedule
                  </Button>
                )}
                {submitted && (
                  <span style={{ fontSize:13, color:'var(--color-green-500)', display:'flex', alignItems:'center', gap:6 }}>
                    ✓ Schedule submitted
                  </span>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── TEAM VIEW TAB (rota grid) ── */}
      {tab === 'team' && (
        <div>
          {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
            <>
              {allSchedules.length === 0 ? (
                <div style={{ ...DS_CARD }}><div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No schedules submitted for this week</div></div>
              ) : (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom: 16 }}>
                    <div style={{ ...DS_CARD, padding:20 }}>
                      <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Staff scheduled</div>
                      <div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{allSchedules.length}</div>
                    </div>
                    <div style={{ ...DS_CARD, padding:20 }}>
                      <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Team hours</div>
                      <div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>
                        {allSchedules.reduce((sum, s) => sum + Object.values(s.week_data || {}).reduce((a, d) => a + dayHours(d), 0), 0).toFixed(1)}h
                      </div>
                    </div>
                    <div style={{ ...DS_CARD, padding:20 }}>
                      <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Submitted</div>
                      <div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{allSchedules.filter(s => s.submitted).length}</div>
                    </div>
                    <div style={{ ...DS_CARD, padding:20 }}>
                      <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Draft</div>
                      <div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{allSchedules.filter(s => !s.submitted).length}</div>
                    </div>
                  </div>

                  <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                    <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-gray-50)' }}>
                          <th style={{ textAlign: 'left', padding: '10px 14px', minWidth: 170, fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Staff</th>
                          {DAYS.map((d, i) => (
                            <th key={d} style={{ textAlign: 'left', padding: '10px 10px', minWidth: 118, fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                              {d.slice(0, 3)} <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>{new Date(shiftWeek(weekStart, i) + 'T12:00:00').getDate()}</span>
                            </th>
                          ))}
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Total</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Status</th>
                          {isAdmin && <th style={{ padding: '10px 14px' }}></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {allSchedules.map((s) => {
                          const hrs = Object.values(s.week_data || {}).reduce((sum, d) => sum + dayHours(d), 0)
                          return (
                            <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{s.user_name?.split('(')[0].trim()}</div>
                                {s.manager_edited && (
                                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                                    edited by {s.manager_name?.split(' ')[0]}
                                  </div>
                                )}
                              </td>
                              {DAYS.map((day) => {
                                const d = (s.week_data || {})[day] || {}
                                const hasShift = d.start && d.end
                                return (
                                  <td key={day} style={{ padding: '8px', verticalAlign: 'top' }}>
                                    {hasShift ? (
                                      <div style={{
                                        background: 'var(--color-blue-50)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 6,
                                        padding: '6px 8px',
                                      }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)' }}>{d.start} – {d.end}</div>
                                        {d.note && <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{d.note}</div>}
                                      </div>
                                    ) : (
                                      <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>–</div>
                                    )}
                                  </td>
                                )
                              })}
                              <td style={{ padding: '12px 14px', verticalAlign: 'top', fontSize: 13, fontWeight: 600, color: hrs > 0 ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}>
                                {hrs.toFixed(1)}h
                              </td>
                              <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                                <StatusBadge variant={s.submitted ? 'active' : 'warning'}>
                                  {s.submitted ? 'Submitted' : 'Draft'}
                                </StatusBadge>
                              </td>
                              {isAdmin && (
                                <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                                  <Button variant="ghost" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => {
                                    setOnBehalfOf({ email: s.user_email, name: s.user_name })
                                    switchTab('mine')
                                  }}>
                                    Edit
                                  </Button>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
