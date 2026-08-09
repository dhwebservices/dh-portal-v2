import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { StaffPicker } from '../components/StaffPicker'
import { Modal } from '../components/Modal'
import { sendManagedNotification } from '../utils/notificationPreferences'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

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

function fmtDate(ws) {
  return new Date(ws + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
}

function fmtMonth(d) {
  return d.toLocaleDateString('en-GB', { month:'long', year:'numeric' })
}

function fmtDateISO(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function initials(name) {
  return (name || '').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function shiftHours(s) {
  const [sh, sm] = s.start_time.split(':').map(Number)
  const [eh, em] = s.end_time.split(':').map(Number)
  const mins = Math.max(0, (eh * 60 + em) - (sh * 60 + sm) - (Number(s.break_minutes) || 0))
  return mins / 60
}

const EMPTY_EDIT = {
  id: null,
  employee_email: '',
  employee_name: '',
  shift_date: '',
  start_time: '09:00',
  end_time: '17:00',
  break_minutes: 0,
  role: '',
  note: '',
  publishNow: false,
  _wasPublished: false,
}

export default function Rotas() {
  const { user, isAdmin } = useAuth()
  const [view, setView] = useState('week')
  const [weekStart, setWeekStart] = useState(getWeekStart())
  const [monthDate, setMonthDate] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [roster, setRoster] = useState([])
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [savingShift, setSavingShift] = useState(false)
  const [addingEmployee, setAddingEmployee] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const weekDates = useMemo(() => DAYS.map((_, i) => shiftWeek(weekStart, i)), [weekStart])

  const monthRange = useMemo(() => {
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
    return { startIso: fmtDateISO(start), endIso: fmtDateISO(end), daysInMonth: end.getDate() }
  }, [monthDate])

  const load = useCallback(async () => {
    setLoading(true)
    const rangeStart = view === 'week' ? weekDates[0] : monthRange.startIso
    const rangeEnd = view === 'week' ? weekDates[6] : monthRange.endIso
    const [{ data: rosterData }, { data: shiftData }] = await Promise.all([
      supabase.from('rota_employees').select('*').order('employee_name', { ascending: true }),
      supabase.from('shifts').select('*').gte('shift_date', rangeStart).lte('shift_date', rangeEnd).order('start_time', { ascending: true }),
    ])
    setRoster(rosterData || [])
    setShifts(shiftData || [])
    setLoading(false)
  }, [view, weekDates, monthRange])

  useEffect(() => { load() }, [load])

  const employeeRows = useMemo(() => {
    const map = new Map()
    roster.forEach(r => map.set(r.employee_email, { email: r.employee_email, name: r.employee_name }))
    shifts.forEach(s => {
      if (s.employee_email && !map.has(s.employee_email)) {
        map.set(s.employee_email, { email: s.employee_email, name: s.employee_name })
      }
    })
    return Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [roster, shifts])

  const openShifts = useMemo(() => shifts.filter(s => !s.employee_email), [shifts])
  const shiftsFor = (email, date) => shifts.filter(s => s.employee_email === email && s.shift_date === date)
  const employeeWeekHours = (email) => shifts.filter(s => s.employee_email === email).reduce((sum, s) => sum + shiftHours(s), 0)
  const totalWeekHours = useMemo(() => shifts.reduce((sum, s) => sum + shiftHours(s), 0), [shifts])
  const draftCount = useMemo(() => shifts.filter(s => !s.published).length, [shifts])

  const switchView = (v) => {
    if (v === 'month') {
      const d = new Date(weekStart + 'T12:00:00')
      d.setDate(1)
      setMonthDate(d)
    }
    setView(v)
  }

  const goPrev = () => {
    if (view === 'week') setWeekStart(shiftWeek(weekStart, -7))
    else setMonthDate(d => { const nd = new Date(d); nd.setMonth(nd.getMonth() - 1); return nd })
  }
  const goNext = () => {
    if (view === 'week') setWeekStart(shiftWeek(weekStart, 7))
    else setMonthDate(d => { const nd = new Date(d); nd.setMonth(nd.getMonth() + 1); return nd })
  }

  const jumpToWeek = (dateIso) => {
    setWeekStart(getWeekStart(new Date(dateIso + 'T12:00:00')))
    setView('week')
  }

  const openAddModal = (email, name, date) => {
    setEditing({ ...EMPTY_EDIT, employee_email: email || '', employee_name: name || '', shift_date: date })
  }

  const openEditModal = (shift) => {
    setEditing({
      id: shift.id,
      employee_email: shift.employee_email || '',
      employee_name: shift.employee_name || '',
      shift_date: shift.shift_date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      break_minutes: shift.break_minutes || 0,
      role: shift.role || '',
      note: shift.note || '',
      publishNow: shift.published,
      _wasPublished: shift.published,
    })
  }

  const saveShift = async () => {
    if (!editing.start_time || !editing.end_time) return
    setSavingShift(true)
    const payload = {
      employee_email: editing.employee_email || null,
      employee_name: editing.employee_email ? editing.employee_name : null,
      shift_date: editing.shift_date,
      start_time: editing.start_time,
      end_time: editing.end_time,
      break_minutes: Number(editing.break_minutes) || 0,
      role: editing.role || null,
      note: editing.note || null,
      published: editing.publishNow,
      updated_at: new Date().toISOString(),
    }

    if (editing.id) {
      await supabase.from('shifts').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('shifts').insert([{ ...payload, created_by: user?.email }])
    }

    if (editing.employee_email) {
      await supabase.from('rota_employees').upsert(
        { employee_email: editing.employee_email, employee_name: editing.employee_name },
        { onConflict: 'employee_email' }
      )
    }

    if (editing.publishNow && !editing._wasPublished && editing.employee_email) {
      await sendManagedNotification({
        userEmail: editing.employee_email,
        userName: editing.employee_name,
        title: 'New shift published',
        message: `You've been scheduled ${editing.start_time}–${editing.end_time} on ${fmtDate(editing.shift_date)}${editing.role ? ' as ' + editing.role : ''}.`,
        link: '/rotas',
        category: 'general',
        sentBy: user?.email,
      }).catch(() => {})
    }

    setSavingShift(false)
    setEditing(null)
    load()
  }

  const deleteShift = async () => {
    if (!editing?.id) return
    if (!confirm('Delete this shift?')) return
    setSavingShift(true)
    await supabase.from('shifts').delete().eq('id', editing.id)
    setSavingShift(false)
    setEditing(null)
    load()
  }

  const addEmployee = async ({ email, name }) => {
    if (!email) return
    await supabase.from('rota_employees').upsert({ employee_email: email, employee_name: name }, { onConflict: 'employee_email' })
    setAddingEmployee(false)
    load()
  }

  const removeEmployee = async (email) => {
    if (!confirm('Remove this employee from the rota roster?')) return
    await supabase.from('rota_employees').delete().eq('employee_email', email)
    load()
  }

  const publishWeek = async () => {
    const draftShifts = shifts.filter(s => !s.published)
    if (draftShifts.length === 0) return
    setPublishing(true)
    const ids = draftShifts.map(s => s.id)
    await supabase.from('shifts').update({ published: true, updated_at: new Date().toISOString() }).in('id', ids)

    const byEmployee = new Map()
    draftShifts.forEach(s => {
      if (!s.employee_email) return
      if (!byEmployee.has(s.employee_email)) byEmployee.set(s.employee_email, { name: s.employee_name, count: 0 })
      byEmployee.get(s.employee_email).count += 1
    })
    await Promise.all(Array.from(byEmployee.entries()).map(([email, info]) =>
      sendManagedNotification({
        userEmail: email,
        userName: info.name,
        title: 'Rota published',
        message: `Your rota for w/c ${fmtDate(weekStart)} has been published (${info.count} shift${info.count === 1 ? '' : 's'}).`,
        link: '/rotas',
        category: 'general',
        sentBy: user?.email,
      }).catch(() => {})
    ))

    setPublishing(false)
    load()
  }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Rotas</h1><p className="page-sub">Team shift schedule</p></div>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" disabled={publishing || draftCount === 0} onClick={publishWeek}>
            {publishing ? 'Publishing…' : `Publish${draftCount > 0 ? ` (${draftCount})` : ''}`}
          </button>
        )}
      </div>

      <div className="tabs" style={{ marginBottom: 20 }}>
        {[['week', 'Week'], ['month', 'Month']].map(([k, l]) => (
          <button key={k} onClick={() => switchView(k)} className={'tab' + (view === k ? ' on' : '')}>{l}</button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-outline btn-sm" onClick={goPrev}>← Prev</button>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sub)' }}>
          {view === 'week' ? `Week of ${fmtDate(weekStart)}` : fmtMonth(monthDate)}
        </div>
        <button className="btn btn-outline btn-sm" onClick={goNext}>Next →</button>
        {view === 'week' && (
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>
            {totalWeekHours.toFixed(1)} hrs scheduled
          </div>
        )}
      </div>

      {loading ? <div className="spin-wrap"><div className="spin" /></div> : (
        <>
          {view === 'week' && (
            <div className="metric-grid" style={{ marginBottom: 16 }}>
              <div className="metric-tile"><div className="metric-label">Staff on rota</div><div className="metric-value">{employeeRows.length}</div></div>
              <div className="metric-tile"><div className="metric-label">Team hours</div><div className="metric-value">{totalWeekHours.toFixed(1)}h</div></div>
              <div className="metric-tile"><div className="metric-label">Open shifts</div><div className="metric-value">{openShifts.length}</div></div>
              <div className="metric-tile"><div className="metric-label">Draft</div><div className="metric-value">{draftCount}</div></div>
            </div>
          )}

          {view === 'week' ? (
            !isAdmin && employeeRows.length === 0 && openShifts.length === 0 ? (
              <div className="card"><div className="empty"><p>No one on the rota yet</p></div></div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px', minWidth: 170, fontSize: 12, fontWeight: 600, color: 'var(--sub)' }}>Staff</th>
                      {weekDates.map((date, i) => (
                        <th key={date} style={{ textAlign: 'left', padding: '10px 10px', minWidth: 130, fontSize: 12, fontWeight: 600, color: 'var(--sub)' }}>
                          {DAYS[i].slice(0, 3)} <span style={{ color: 'var(--faint)', fontWeight: 400 }}>{new Date(date + 'T12:00:00').getDate()}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                      <td style={{ padding: '12px 14px', verticalAlign: 'top', fontSize: 13, fontWeight: 600, color: 'var(--sub)' }}>Open shifts</td>
                      {weekDates.map(date => (
                        <td key={date} style={{ padding: '8px', verticalAlign: 'top' }}>
                          {openShifts.filter(s => s.shift_date === date).map(s => (
                            <div key={s.id} onClick={() => isAdmin && openEditModal(s)}
                              style={{ cursor: isAdmin ? 'pointer' : 'default', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 6, padding: '6px 8px', marginBottom: 4 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{s.start_time} – {s.end_time}</div>
                              {s.role && <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{s.role}</div>}
                              {!s.published && <span className="badge badge-amber" style={{ marginTop: 4, display: 'inline-block' }}>Draft</span>}
                            </div>
                          ))}
                          {isAdmin && <button className="btn btn-ghost btn-sm" style={{ width: '100%', fontSize: 12 }} onClick={() => openAddModal('', '', date)}>+ Add</button>}
                        </td>
                      ))}
                    </tr>

                    {employeeRows.map(emp => (
                      <tr key={emp.email} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>
                              {initials(emp.name)}
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{emp.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--faint)' }}>{employeeWeekHours(emp.email).toFixed(1)}h this week</div>
                            </div>
                          </div>
                          {isAdmin && (
                            <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 11 }} onClick={() => removeEmployee(emp.email)}>Remove</button>
                          )}
                        </td>
                        {weekDates.map(date => {
                          const cellShifts = shiftsFor(emp.email, date)
                          return (
                            <td key={date} style={{ padding: '8px', verticalAlign: 'top' }}>
                              {cellShifts.map(s => (
                                <div key={s.id} onClick={() => isAdmin && openEditModal(s)}
                                  style={{ cursor: isAdmin ? 'pointer' : 'default', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 6, padding: '6px 8px', marginBottom: 4 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{s.start_time} – {s.end_time}</div>
                                  {s.role && <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{s.role}</div>}
                                  {!s.published && <span className="badge badge-amber" style={{ marginTop: 4, display: 'inline-block' }}>Draft</span>}
                                </div>
                              ))}
                              {isAdmin ? (
                                <button className="btn btn-ghost btn-sm" style={{ width: '100%', fontSize: 12 }} onClick={() => openAddModal(emp.email, emp.name, date)}>+ Add</button>
                              ) : cellShifts.length === 0 && (
                                <div style={{ textAlign: 'center', color: 'var(--faint)', fontSize: 13 }}>–</div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}

                    {isAdmin && (
                      <tr>
                        <td colSpan={8} style={{ padding: '12px 14px' }}>
                          {addingEmployee ? (
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', maxWidth: 360 }}>
                              <div style={{ flex: 1 }}>
                                <StaffPicker placeholder="Select staff member to add..." value="" onChange={addEmployee} />
                              </div>
                              <button className="btn btn-ghost btn-sm" onClick={() => setAddingEmployee(false)}>Cancel</button>
                            </div>
                          ) : (
                            <button className="btn btn-outline btn-sm" onClick={() => setAddingEmployee(true)}>+ Add employee</button>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px', minWidth: 170, fontSize: 12, fontWeight: 600, color: 'var(--sub)' }}>Staff</th>
                    {Array.from({ length: monthRange.daysInMonth }, (_, i) => i + 1).map(day => (
                      <th key={day} style={{ textAlign: 'center', padding: '6px 4px', minWidth: 34, fontSize: 11, fontWeight: 600, color: 'var(--sub)' }}>{day}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employeeRows.length === 0 ? (
                    <tr><td colSpan={monthRange.daysInMonth + 1} style={{ padding: 24, textAlign: 'center', color: 'var(--faint)' }}>No one on the rota yet</td></tr>
                  ) : employeeRows.map(emp => (
                    <tr key={emp.email} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{emp.name}</td>
                      {Array.from({ length: monthRange.daysInMonth }, (_, i) => i + 1).map(day => {
                        const dateIso = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                        const dayShifts = shifts.filter(s => s.employee_email === emp.email && s.shift_date === dateIso)
                        const hrs = dayShifts.reduce((sum, s) => sum + shiftHours(s), 0)
                        return (
                          <td key={day} onClick={() => jumpToWeek(dateIso)}
                            style={{ padding: '6px 2px', textAlign: 'center', fontSize: 11, cursor: 'pointer', color: hrs > 0 ? 'var(--accent)' : 'var(--faint)', fontWeight: hrs > 0 ? 600 : 400 }}>
                            {hrs > 0 ? hrs.toFixed(0) + 'h' : '·'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit shift' : 'Add shift'} onClose={() => setEditing(null)} footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <div>
              {editing.id && (
                <button className="btn btn-ghost btn-sm" onClick={deleteShift} disabled={savingShift}>Delete</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={saveShift} disabled={savingShift || !editing.start_time || !editing.end_time}>
                {savingShift ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="lbl">Employee</label>
              <StaffPicker
                value={editing.employee_email}
                onChange={({ email, name, role }) => setEditing(e => ({
                  ...e,
                  employee_email: email,
                  employee_name: name,
                  role: e.role || role || '',
                }))}
                placeholder="Leave blank for an open (unassigned) shift"
              />
            </div>
            <div style={{ fontSize: 13, color: 'var(--sub)' }}>{fmtDate(editing.shift_date)}</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="lbl">Start</label>
                <input type="time" className="inp" value={editing.start_time} onChange={e => setEditing(x => ({ ...x, start_time: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="lbl">End</label>
                <input type="time" className="inp" value={editing.end_time} onChange={e => setEditing(x => ({ ...x, end_time: e.target.value }))} />
              </div>
              <div style={{ width: 100 }}>
                <label className="lbl">Break (min)</label>
                <input type="number" min="0" className="inp" value={editing.break_minutes} onChange={e => setEditing(x => ({ ...x, break_minutes: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="lbl">Role</label>
              <input type="text" className="inp" placeholder="e.g. Assistant" value={editing.role} onChange={e => setEditing(x => ({ ...x, role: e.target.value }))} />
            </div>
            <div>
              <label className="lbl">Note (optional)</label>
              <textarea className="inp" rows={2} value={editing.note} onChange={e => setEditing(x => ({ ...x, note: e.target.value }))} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--sub)' }}>
              <input type="checkbox" checked={editing.publishNow} onChange={e => setEditing(x => ({ ...x, publishNow: e.target.checked }))} />
              Publish and send notification?
            </label>
          </div>
        </Modal>
      )}
    </div>
  )
}
