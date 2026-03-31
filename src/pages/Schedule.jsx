import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { StaffPicker } from '../components/StaffPicker'
import { sendEmail } from '../utils/email'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'
const HOURS = Array.from({length:19},(_,i)=>{
  const h = i + 7 // 07:00 - 23:00
  return h.toString().padStart(2,'0') + ':00'
})

function getWeekStart(d = new Date()) {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
  dt.setDate(diff); dt.setHours(0,0,0,0)
  return dt.toISOString().split('T')[0]
}

function dayHours(d) {
  if (!d?.start || !d?.end) return 0
  const [sh,sm] = d.start.split(':').map(Number)
  const [eh,em] = d.end.split(':').map(Number)
  return Math.max(0, (eh*60+em - sh*60-sm) / 60)
}

function fmtWeek(ws) {
  return new Date(ws + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
}

const EMPTY_SCHEDULE = Object.fromEntries(DAYS.map(d => [d, { start:'', end:'', note:'' }]))

async function notify(user_email, title, message, link, type = 'info') {
  try {
    await supabase.from('notifications').insert([{
      user_email,
      title,
      message,
      type,
      link,
      read: false,
      created_at: new Date().toISOString(),
    }])
  } catch (_) {
    // Non-blocking helper for staff notifications
  }
}

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
        await notify(targetEmail, title, message, '/schedule', submit ? 'success' : 'info')
        sendEmail('send_email', {
          to: targetEmail,
          to_name: targetName,
          subject: title + ' — Week of ' + fmtWeek(weekStart),
          html: scheduleEmailHtml({
            targetName,
            managerName: user?.name || user?.email,
            weekStart,
            schedule,
            submitted: submit,
          }),
          sent_by: user?.name || user?.email,
          portal_url: PORTAL_URL,
        }).catch(() => {})
      }
    }
    setSaving(false)
  }

  const editSchedule = async () => {
    // Unlock for editing — don't wipe the data
    if (recordId) {
      await supabase.from('schedules').update({ submitted: false, updated_at: new Date().toISOString() }).eq('id', recordId)
    }
    setSubmitted(false)
  }

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate()-7); setWeekStart(d.toISOString().split('T')[0]) }
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate()+7); setWeekStart(d.toISOString().split('T')[0]) }

  const totalHours = Object.values(schedule).reduce((sum, d) => sum + dayHours(d), 0)
  const isEditing = !submitted
  const canEdit = isAdmin || !onBehalfOf

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Schedule</h1><p className="page-sub">Weekly availability</p></div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom:20 }}>
        {[['mine','My Schedule'],['team','Team View']].map(([k,l]) => (
          <button key={k} onClick={() => switchTab(k)} className={'tab'+(tab===k?' on':'')}>{l}</button>
        ))}
      </div>

      {/* Week navigator */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <button className="btn btn-outline btn-sm" onClick={prevWeek}>← Prev</button>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--sub)' }}>
          Week of {fmtWeek(weekStart)}
        </div>
        <button className="btn btn-outline btn-sm" onClick={nextWeek}>Next →</button>
        <div style={{ marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--accent)' }}>
          {totalHours.toFixed(1)} hrs total
        </div>
        {submitted && <span className="badge badge-green">Submitted</span>}
      </div>

      {/* ── MY SCHEDULE TAB ── */}
      {tab === 'mine' && (
        <>
          {/* Admin: set schedule on behalf of staff */}
          {isAdmin && (
            <div style={{ marginBottom:16, padding:'12px 16px', background:'var(--bg2)', borderRadius:10, border:'1px solid var(--border)' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
                📋 Set schedule on behalf of staff member
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
                  <button className="btn btn-ghost btn-sm" onClick={() => setOnBehalfOf(null)}>
                    × Clear (back to my schedule)
                  </button>
                )}
              </div>
              {onBehalfOf && (
                <div style={{ marginTop:8, fontSize:12, color:'var(--accent)', fontWeight:500 }}>
                  ✎ Editing schedule for: {onBehalfOf.name}
                </div>
              )}
            </div>
          )}

          {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
            <>
              <div className="card" style={{ overflow:'hidden', marginBottom:16 }}>
                <table className="tbl">
                  <thead>
                    <tr><th>Day</th><th>Start</th><th>End</th><th>Hours</th><th>Note</th></tr>
                  </thead>
                  <tbody>
                    {DAYS.map(day => {
                      const d = schedule[day] || {}
                      const hrs = dayHours(d)
                      return (
                        <tr key={day}>
                          <td className="t-main" style={{ width:100 }}>{day}</td>
                          <td>
                            <select className="inp" style={{ padding:'5px 8px', fontSize:12, width:90 }}
                              value={d.start||''} onChange={e=>setDay(day,'start',e.target.value)}
                              disabled={submitted && !isAdmin}>
                              <option value="">Off</option>
                              {HOURS.map(h=><option key={h}>{h}</option>)}
                            </select>
                          </td>
                          <td>
                            <select className="inp" style={{ padding:'5px 8px', fontSize:12, width:90 }}
                              value={d.end||''} onChange={e=>setDay(day,'end',e.target.value)}
                              disabled={submitted && !isAdmin}>
                              <option value="">—</option>
                              {HOURS.map(h=><option key={h}>{h}</option>)}
                            </select>
                          </td>
                          <td style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>
                            {hrs > 0 ? hrs.toFixed(1)+'h' : '—'}
                          </td>
                          <td>
                            <input className="inp" style={{ padding:'5px 8px', fontSize:12 }}
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
                  <button className="btn btn-outline" onClick={() => save(false)} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Draft'}
                  </button>
                )}
                {(!submitted || isAdmin) && (
                  <button className="btn btn-primary" onClick={() => save(true)} disabled={saving}>
                    {saving ? 'Submitting...' : onBehalfOf ? `Submit for ${onBehalfOf.name.split(' ')[0]}` : 'Submit Schedule'}
                  </button>
                )}
                {submitted && !isAdmin && (
                  <button className="btn btn-outline" onClick={editSchedule}>
                    Edit Schedule
                  </button>
                )}
                {submitted && (
                  <span style={{ fontSize:13, color:'var(--green)', display:'flex', alignItems:'center', gap:6 }}>
                    ✓ Schedule submitted
                  </span>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── TEAM VIEW TAB ── */}
      {tab === 'team' && (
        <div>
          {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
            <>
              {allSchedules.length === 0 ? (
                <div className="card"><div className="empty"><p>No schedules submitted for this week</p></div></div>
              ) : (
                <div style={{ overflowX:'auto' }}>
                  <table className="tbl" style={{ minWidth:700 }}>
                    <thead>
                      <tr>
                        <th style={{ minWidth:160 }}>Staff</th>
                        {DAYS.map(d => <th key={d} style={{ minWidth:90 }}>{d.slice(0,3)}</th>)}
                        <th>Total</th>
                        <th>Status</th>
                        {isAdmin && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {allSchedules.map(s => {
                        const hrs = Object.values(s.week_data||{}).reduce((sum,d) => sum + dayHours(d), 0)
                        return (
                          <tr key={s.id}>
                            <td className="t-main">
                              <div style={{ fontWeight:500 }}>{s.user_name?.split('(')[0].trim()}</div>
                              {s.manager_edited && (
                                <div style={{ fontSize:10, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>
                                  edited by {s.manager_name?.split(' ')[0]}
                                </div>
                              )}
                            </td>
                            {DAYS.map(day => {
                              const d = (s.week_data||{})[day] || {}
                              const hasShift = d.start && d.end
                              return (
                                <td key={day} style={{ fontFamily:'var(--font-mono)', fontSize:11, verticalAlign:'middle' }}>
                                  {hasShift ? (
                                    <div>
                                      <div style={{ color:'var(--text)', fontWeight:500 }}>{d.start}</div>
                                      <div style={{ color:'var(--faint)' }}>{d.end}</div>
                                    </div>
                                  ) : (
                                    <span style={{ color:'var(--border)', fontSize:13 }}>—</span>
                                  )}
                                </td>
                              )
                            })}
                            <td style={{ fontFamily:'var(--font-mono)', fontSize:12, fontWeight:600, color:hrs>0?'var(--accent)':'var(--faint)' }}>
                              {hrs.toFixed(1)}h
                            </td>
                            <td>
                              <span className={'badge badge-'+(s.submitted?'green':'amber')}>
                                {s.submitted ? 'Submitted' : 'Draft'}
                              </span>
                            </td>
                            {isAdmin && (
                              <td>
                                <button className="btn btn-ghost btn-sm" onClick={() => {
                                  setOnBehalfOf({ email: s.user_email, name: s.user_name })
                                  switchTab('mine')
                                }}>
                                  Edit
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
