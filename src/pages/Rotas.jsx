import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { StaffPicker } from '../components/StaffPicker'
import { Modal } from '../components/Modal'
import { sendManagedNotification } from '../utils/notificationPreferences'
import { Button, FormField, FormLabel, FormInput, StatusBadge } from '../components/ds'

const DS_CARD = { background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)' }
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
    <div className="ds-content">
      <div className="ds-page-header">
        <div><h1>Rotas</h1><p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Team shift schedule</p></div>
        {isAdmin && (
          <Button variant="primary" style={{ height:28, fontSize:12, padding:'0 8px' }} disabled={publishing || draftCount === 0} onClick={publishWeek}>
            {publishing ? 'Publishing…' : `Publish${draftCount > 0 ? ` (${draftCount})` : ''}`}
          </Button>
        )}
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {[['week', 'Week'], ['month', 'Month']].map(([k, l]) => (
          <Button key={k} onClick={() => switchView(k)} variant={view === k ? 'primary' : 'secondary'} style={{ height:30, fontSize:12, padding:'0 10px' }}>{l}</Button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={goPrev}>← Prev</Button>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)' }}>
          {view === 'week' ? `Week of ${fmtDate(weekStart)}` : fmtMonth(monthDate)}
        </div>
        <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={goNext}>Next →</Button>
        {view === 'week' && (
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-primary)' }}>
            {totalWeekHours.toFixed(1)} hrs scheduled
          </div>
        )}
      </div>

      {loading ? <div className="spin-wrap"><div className="spin" /></div> : (
        <>
          {view === 'week' && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom: 16 }}>
              <div style={{ ...DS_CARD, padding:20 }}><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Staff on rota</div><div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{employeeRows.length}</div></div>
              <div style={{ ...DS_CARD, padding:20 }}><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Team hours</div><div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{totalWeekHours.toFixed(1)}h</div></div>
              <div style={{ ...DS_CARD, padding:20 }}><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Open shifts</div><div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{openShifts.length}</div></div>
              <div style={{ ...DS_CARD, padding:20 }}><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Draft</div><div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{draftCount}</div></div>
            </div>
          )}

          {view === 'week' ? (
            !isAdmin && employeeRows.length === 0 && openShifts.length === 0 ? (
              <div style={{ ...DS_CARD }}><div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No one on the rota yet</div></div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-gray-50)' }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px', minWidth: 170, fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Staff</th>
                      {weekDates.map((date, i) => (
                        <th key={date} style={{ textAlign: 'left', padding: '10px 10px', minWidth: 130, fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                          {DAYS[i].slice(0, 3)} <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>{new Date(date + 'T12:00:00').getDate()}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-gray-50)' }}>
                      <td style={{ padding: '12px 14px', verticalAlign: 'top', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Open shifts</td>
                      {weekDates.map(date => (
                        <td key={date} style={{ padding: '8px', verticalAlign: 'top' }}>
                          {openShifts.filter(s => s.shift_date === date).map(s => (
                            <div key={s.id} onClick={() => isAdmin && openEditModal(s)}
                              style={{ cursor: isAdmin ? 'pointer' : 'default', background: 'var(--color-blue-50)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '6px 8px', marginBottom: 4 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)' }}>{s.start_time} – {s.end_time}</div>
                              {s.role && <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{s.role}</div>}
                              {!s.published && <span style={{ marginTop: 4, display: 'inline-block' }}><StatusBadge variant="warning">Draft</StatusBadge></span>}
                            </div>
                          ))}
                          {isAdmin && <Button variant="ghost" style={{ height:28, fontSize: 12, padding:'0 8px', width: '100%' }} onClick={() => openAddModal('', '', date)}>+ Add</Button>}
                        </td>
                      ))}
                    </tr>

                    {employeeRows.map(emp => (
                      <tr key={emp.email} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-blue-50)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-primary)', flexShrink: 0 }}>
                              {initials(emp.name)}
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{emp.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{employeeWeekHours(emp.email).toFixed(1)}h this week</div>
                            </div>
                          </div>
                          {isAdmin && (
                            <Button variant="ghost" style={{ height:28, padding:'0 8px', marginTop: 6, fontSize: 11 }} onClick={() => removeEmployee(emp.email)}>Remove</Button>
                          )}
                        </td>
                        {weekDates.map(date => {
                          const cellShifts = shiftsFor(emp.email, date)
                          return (
                            <td key={date} style={{ padding: '8px', verticalAlign: 'top' }}>
                              {cellShifts.map(s => (
                                <div key={s.id} onClick={() => isAdmin && openEditModal(s)}
                                  style={{ cursor: isAdmin ? 'pointer' : 'default', background: 'var(--color-blue-50)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '6px 8px', marginBottom: 4 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)' }}>{s.start_time} – {s.end_time}</div>
                                  {s.role && <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{s.role}</div>}
                                  {!s.published && <span style={{ marginTop: 4, display: 'inline-block' }}><StatusBadge variant="warning">Draft</StatusBadge></span>}
                                </div>
                              ))}
                              {isAdmin ? (
                                <Button variant="ghost" style={{ height:28, padding:'0 8px', width: '100%', fontSize: 12 }} onClick={() => openAddModal(emp.email, emp.name, date)}>+ Add</Button>
                              ) : cellShifts.length === 0 && (
                                <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>–</div>
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
                              <Button variant="ghost" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => setAddingEmployee(false)}>Cancel</Button>
                            </div>
                          ) : (
                            <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => setAddingEmployee(true)}>+ Add employee</Button>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
              <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-gray-50)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px', minWidth: 170, fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Staff</th>
                    {Array.from({ length: monthRange.daysInMonth }, (_, i) => i + 1).map(day => (
                      <th key={day} style={{ textAlign: 'center', padding: '6px 4px', minWidth: 34, fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{day}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employeeRows.length === 0 ? (
                    <tr><td colSpan={monthRange.daysInMonth + 1} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>No one on the rota yet</td></tr>
                  ) : employeeRows.map(emp => (
                    <tr key={emp.email} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{emp.name}</td>
                      {Array.from({ length: monthRange.daysInMonth }, (_, i) => i + 1).map(day => {
                        const dateIso = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                        const dayShifts = shifts.filter(s => s.employee_email === emp.email && s.shift_date === dateIso)
                        const hrs = dayShifts.reduce((sum, s) => sum + shiftHours(s), 0)
                        return (
                          <td key={day} onClick={() => jumpToWeek(dateIso)}
                            style={{ padding: '6px 2px', textAlign: 'center', fontSize: 11, cursor: 'pointer', color: hrs > 0 ? 'var(--color-primary)' : 'var(--color-text-tertiary)', fontWeight: hrs > 0 ? 600 : 400 }}>
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
                <Button variant="ghost" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={deleteShift} disabled={savingShift}>Delete</Button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={saveShift} disabled={savingShift || !editing.start_time || !editing.end_time}>
                {savingShift ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField>
              <FormLabel>Employee</FormLabel>
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
            </FormField>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{fmtDate(editing.shift_date)}</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <FormField>
                  <FormLabel>Start</FormLabel>
                  <FormInput type="time" value={editing.start_time} onChange={e => setEditing(x => ({ ...x, start_time: e.target.value }))} />
                </FormField>
              </div>
              <div style={{ flex: 1 }}>
                <FormField>
                  <FormLabel>End</FormLabel>
                  <FormInput type="time" value={editing.end_time} onChange={e => setEditing(x => ({ ...x, end_time: e.target.value }))} />
                </FormField>
              </div>
              <div style={{ width: 100 }}>
                <FormField>
                  <FormLabel>Break (min)</FormLabel>
                  <FormInput type="number" min="0" value={editing.break_minutes} onChange={e => setEditing(x => ({ ...x, break_minutes: e.target.value }))} />
                </FormField>
              </div>
            </div>
            <FormField>
              <FormLabel>Role</FormLabel>
              <FormInput type="text" placeholder="e.g. Assistant" value={editing.role} onChange={e => setEditing(x => ({ ...x, role: e.target.value }))} />
            </FormField>
            <FormField>
              <FormLabel>Note (optional)</FormLabel>
              <textarea className="ds-form-input" rows={2} style={{ padding:'8px 12px' }} value={editing.note} onChange={e => setEditing(x => ({ ...x, note: e.target.value }))} />
            </FormField>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <input type="checkbox" checked={editing.publishNow} onChange={e => setEditing(x => ({ ...x, publishNow: e.target.checked }))} />
              Publish and send notification?
            </label>
          </div>
        </Modal>
      )}
    </div>
  )
}
