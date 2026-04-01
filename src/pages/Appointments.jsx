import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'

const WORKER = 'https://dh-email-worker.aged-silence-66a7.workers.dev'
const HOURS = Array.from({ length: 32 }, (_, i) => {
  const h = Math.floor(i / 2) + 9
  const m = i % 2 === 0 ? '00' : '30'
  return h < 17 ? `${String(h).padStart(2,'0')}:${m}` : null
}).filter(Boolean) // 09:00 - 16:30

function addMins(time, mins) {
  const [h,m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`
}

function formatDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' })
}

function isoLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function weekDays(anchor) {
  const d = new Date(anchor)
  d.setDate(d.getDate() - d.getDay() + 1) // Monday
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(d)
    dd.setDate(d.getDate() + i)
    return isoLocalDate(dd)
  })
}

function getScheduleWeekStart(dateStr) {
  const dt = new Date(`${dateStr}T12:00:00`)
  const day = dt.getDay()
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
  dt.setDate(diff)
  dt.setHours(0, 0, 0, 0)
  return dt.toISOString().split('T')[0]
}

function dayName(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })
}

function buildWindowSlots(start, end) {
  if (!start || !end) return []
  const slots = []
  let current = start

  while (addMins(current, 30) <= end) {
    slots.push(current)
    current = addMins(current, 30)
  }

  return slots
}

function startsWithinWindow(appt, from, to) {
  return appt.date >= from && appt.date <= to
}

export default function Appointments() {
  const { user, isAdmin } = useAuth()
  const [tab, setTab] = useState('calendar')
  const [anchor, setAnchor] = useState(() => new Date().toISOString().split('T')[0])
  const [staffFilter, setStaffFilter] = useState('all')
  const [bookableStaff, setBookableStaff] = useState([])
  const [availability, setAvailability] = useState([]) // staff_availability rows
  const [appointments, setAppointments] = useState([]) // appointments rows
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null) // { date, staff, slot }
  const [detailAppt, setDetailAppt] = useState(null)
  const [slotModal, setSlotModal] = useState(null) // { date, staffEmail, staffName }
  const [saving, setSaving] = useState(false)

  const days = useMemo(() => weekDays(anchor), [anchor])

  const load = useCallback(async () => {
    setLoading(true)
    const from = days[0], to = days[6]
    const weekKey = getScheduleWeekStart(from)
    const [{ data: profiles }, { data: perms }, { data: schedules }, { data: avail }, { data: appts }] = await Promise.all([
      supabase.from('hr_profiles').select('user_email,full_name,role,bookable').order('full_name'),
      supabase.from('user_permissions').select('user_email,bookable_staff').eq('bookable_staff', true),
      supabase.from('schedules').select('user_email,user_name,week_start,submitted,week_data').eq('week_start', weekKey).eq('submitted', true),
      supabase.from('staff_availability').select('*').gte('date', from).lte('date', to),
      supabase.from('appointments').select('*').gte('date', from).lte('date', to).neq('status','cancelled'),
    ])

    const profileMap = new Map((profiles || []).map((item) => [String(item.user_email || '').toLowerCase(), item]))
    const bookableEmails = new Set()

    for (const item of profiles || []) {
      if (item.bookable) bookableEmails.add(String(item.user_email || '').toLowerCase())
    }
    for (const item of perms || []) {
      if (item.bookable_staff) bookableEmails.add(String(item.user_email || '').toLowerCase())
    }

    const staff = Array.from(bookableEmails)
      .map((email) => {
        const profile = profileMap.get(email)
        return {
          user_email: email,
          full_name: profile?.full_name || email,
          role: profile?.role || null,
        }
      })
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))

    const explicitAvailability = avail || []
    const explicitKeys = new Set(
      explicitAvailability
        .filter((item) => item.staff_email && item.date)
        .map((item) => `${String(item.staff_email).toLowerCase()}::${item.date}`)
    )

    const scheduleMap = new Map(
      (schedules || []).map((item) => [String(item.user_email || '').toLowerCase(), item])
    )

    const derivedAvailability = []
    for (const staffMember of staff) {
      const schedule = scheduleMap.get(staffMember.user_email)
      if (!schedule?.week_data) continue

      for (const date of days) {
        const key = `${staffMember.user_email}::${date}`
        if (explicitKeys.has(key)) continue

        const entry = schedule.week_data?.[dayName(date)]
        if (!entry?.start || !entry?.end) continue

        derivedAvailability.push({
          id: `schedule:${staffMember.user_email}:${date}`,
          staff_email: staffMember.user_email,
          staff_name: staffMember.full_name,
          date,
          is_available: true,
          start_time: entry.start,
          end_time: entry.end,
          slots: buildWindowSlots(entry.start, entry.end),
          source: 'schedule',
        })
      }
    }

    setBookableStaff(staff)
    setAvailability([...explicitAvailability, ...derivedAvailability])
    setAppointments(appts || [])
    setLoading(false)
  }, [days, anchor])

  useEffect(() => { load() }, [load])

  const prevWeek = () => { const d = new Date(anchor); d.setDate(d.getDate()-7); setAnchor(d.toISOString().split('T')[0]) }
  const nextWeek = () => { const d = new Date(anchor); d.setDate(d.getDate()+7); setAnchor(d.toISOString().split('T')[0]) }

  const getAvail = (staffEmail, date) => availability.find(a => String(a.staff_email || '').toLowerCase() === String(staffEmail || '').toLowerCase() && a.date === date)
  const getAppts = (staffEmail, date) => appointments.filter(a => a.staff_email === staffEmail && a.date === date)

  const toggleDayAvailable = async (staffEmail, staffName, date, makeAvailable) => {
    const existing = getAvail(staffEmail, date)
    if (existing) {
      await supabase.from('staff_availability').update({ is_available: makeAvailable, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('staff_availability').insert([{ staff_email: staffEmail, staff_name: staffName, date, is_available: makeAvailable, slots: [] }])
    }
    load()
  }

  const cancelAppt = async (appt) => {
    if (!confirm(`Cancel ${appt.client_name}'s appointment on ${appt.date} at ${appt.start_time}?`)) return
    setSaving(true)
    await supabase.from('appointments').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', appt.id)
    // Email client
    fetch(WORKER, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'outreach_contact', data:{
      to_email: appt.client_email,
      contact_name: appt.client_name,
      subject: 'Your call on ' + appt.date + ' has been cancelled',
      message: [
        'Your scheduled call has been cancelled by our team.',
        '',
        'Date: ' + formatDate(appt.date),
        'Time: ' + appt.start_time + ' - ' + appt.end_time,
        'With: ' + appt.staff_name,
        '',
        'Please rebook at https://dhwebsiteservices.co.uk/contact or call 02920024218.',
      ].join('<br/>'),
    }})}).catch(()=>{})
    setSaving(false); setDetailAppt(null); load()
  }

  const today = new Date().toISOString().split('T')[0]
  const weekLabel = formatDate(days[0]) + ' – ' + formatDate(days[6])
  const visibleStaff = staffFilter === 'all'
    ? bookableStaff
    : bookableStaff.filter((staffMember) => staffMember.user_email === staffFilter)

  const weeklySummary = useMemo(() => {
    const visibleEmails = new Set(visibleStaff.map((staffMember) => staffMember.user_email))
    const weekAppointments = appointments.filter((appt) => visibleEmails.has(appt.staff_email) && startsWithinWindow(appt, days[0], days[6]))
    const todayAppointments = weekAppointments.filter((appt) => appt.date === today)
    const availableToday = visibleStaff.filter((staffMember) => {
      const avail = getAvail(staffMember.user_email, today)
      return avail?.is_available
    }).length
    const bookedToday = todayAppointments.filter((appt) => appt.status === 'confirmed').length
    return {
      staff: visibleStaff.length,
      availableToday,
      weekBookings: weekAppointments.filter((appt) => appt.status === 'confirmed').length,
      bookedToday,
    }
  }, [appointments, visibleStaff, availability, today, days])

  const todayOverview = useMemo(() => {
    return visibleStaff.map((staffMember) => {
      const avail = getAvail(staffMember.user_email, today)
      const staffAppointments = getAppts(staffMember.user_email, today)
      return {
        ...staffMember,
        available: !!avail?.is_available,
        window: avail?.start_time && avail?.end_time ? `${avail.start_time} – ${avail.end_time}` : 'Unavailable',
        bookings: staffAppointments.length,
      }
    })
  }, [visibleStaff, availability, appointments, today])

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Appointment Manager</h1><p className="page-sub">Manage staff availability and client bookings</p></div>
      </div>

      <div className="dashboard-stat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:20 }}>
        {[
          ['Bookable staff', weeklySummary.staff, 'Shown in this view'],
          ['Available today', weeklySummary.availableToday, formatDate(today)],
          ['Booked today', weeklySummary.bookedToday, 'Confirmed appointments'],
          ['Week bookings', weeklySummary.weekBookings, 'Current week confirmed'],
        ].map(([label, value, hint]) => (
          <div key={label} className="stat-card">
            <div className="stat-val">{value}</div>
            <div className="stat-lbl">{label}</div>
            <div style={{ fontSize:12, color:'var(--sub)', marginTop:6, lineHeight:1.5 }}>{hint}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom:24 }}>
        {[['calendar','Calendar'],['bookings','All Bookings']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={'tab'+(tab===k?' on':'')}>{l}</button>
        ))}
      </div>

      {tab === 'calendar' && (
        <>
          {/* Week navigator */}
          <div className="legacy-toolbar" style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20 }}>
            <button className="btn btn-ghost btn-sm" onClick={prevWeek}>← Prev</button>
            <span style={{ fontSize:14, fontWeight:500, color:'var(--text)', minWidth:280, textAlign:'center' }}>{weekLabel}</span>
            <button className="btn btn-ghost btn-sm" onClick={nextWeek}>Next →</button>
            <button className="btn btn-outline btn-sm" onClick={() => setAnchor(today)} style={{ marginLeft:8 }}>Today</button>
            <div style={{ minWidth:220, marginLeft:'auto' }}>
              <select className="inp" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
                <option value="all">All bookable staff</option>
                {bookableStaff.map((staffMember) => (
                  <option key={staffMember.user_email} value={staffMember.user_email}>
                    {staffMember.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card card-pad" style={{ marginBottom:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:12, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Today overview</div>
                <div style={{ fontSize:14, color:'var(--sub)', marginTop:4 }}>Quick view of who is available and how many calls are already booked.</div>
              </div>
              <span className="badge badge-grey">{formatDate(today)}</span>
            </div>
            <div className="compact-card-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
              {todayOverview.map((staffMember) => (
                <div key={staffMember.user_email} style={{ padding:'14px 15px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{staffMember.full_name}</div>
                      <div style={{ fontSize:11, color:'var(--faint)', marginTop:2 }}>{staffMember.role || 'Bookable staff'}</div>
                    </div>
                    <span className={`badge badge-${staffMember.available ? (staffMember.bookings ? 'blue' : 'green') : 'red'}`}>
                      {staffMember.available ? (staffMember.bookings ? 'Booked' : 'Free') : 'Off'}
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <span className="badge badge-grey">{staffMember.window}</span>
                    <span className="badge badge-grey">{staffMember.bookings} booking{staffMember.bookings === 1 ? '' : 's'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
            <div className="tbl-wrap">
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr>
                    <th style={{ width:60, padding:'8px 12px', borderBottom:'2px solid var(--border)', color:'var(--faint)', fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textAlign:'left' }}>TIME</th>
                    {visibleStaff.map(s => (
                      <th key={s.user_email} style={{ padding:'8px 12px', borderBottom:'2px solid var(--border)', borderLeft:'1px solid var(--border)', minWidth:140 }}>
                        <div style={{ fontWeight:600, color:'var(--text)', fontSize:12, marginBottom:2 }}>{s.full_name?.split(' ')[0]}</div>
                        <div style={{ fontSize:10, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{s.role}</div>
                      </th>
                    ))}
                  </tr>
                  {/* Day headers */}
                  <tr style={{ background:'var(--bg2)' }}>
                    <td style={{ padding:'6px 12px', borderBottom:'1px solid var(--border)', fontSize:10, color:'var(--faint)' }}>STAFF →</td>
                    {visibleStaff.map(s => (
                      <td key={s.user_email} style={{ padding:'6px 12px', borderBottom:'1px solid var(--border)', borderLeft:'1px solid var(--border)' }}>
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                          {days.map(d => {
                            const avail = getAvail(s.user_email, d)
                            const isOn = avail ? avail.is_available : false
                            const dayAppts = getAppts(s.user_email, d)
                            const isPast = d < today
                            return (
                              <button key={d} onClick={() => !isPast && setSlotModal({ date:d, staffEmail:s.user_email, staffName:s.full_name })}
                                style={{ width:22, height:22, borderRadius:5, border:'1px solid ' + (d===today?'var(--accent)':'var(--border)'), background: isPast ? 'var(--bg3)' : isOn ? (dayAppts.length > 0 ? '#dbeafe' : '#dcfce7') : '#fee2e2', cursor: isPast?'default':'pointer', fontSize:9, fontWeight:600, color: isPast?'var(--faint)': isOn?(dayAppts.length>0?'#1d4ed8':'#166534'):'#991b1b', transition:'all 0.1s' }}
                                title={formatDate(d) + (dayAppts.length > 0 ? ' · ' + dayAppts.length + ' booked' : '')}>
                                {new Date(d+'T12:00').getDate()}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map((time, ti) => (
                    <tr key={time} style={{ background: ti%2===0 ? 'transparent' : 'var(--bg2)' }}>
                      <td style={{ padding:'4px 12px', borderBottom:'1px solid var(--border-light)', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)', verticalAlign:'middle', whiteSpace:'nowrap' }}>{time}</td>
                      {visibleStaff.map(s => {
                        // Show all 7 days compressed in weekly view
                        // Find if any day this week has a booking at this time for this staff
                        const dayBookings = days.map(d => {
                          const appt = appointments.find(a => a.staff_email === s.user_email && a.date === d && a.start_time === time)
                          const avail = getAvail(s.user_email, d)
                          const isOn = avail ? avail.is_available : false
                          return { d, appt, isOn }
                        })
                        // Show the week's most relevant info - today's column
                        const todayInfo = dayBookings.find(db => db.d === today) || dayBookings[0]
                        const appt = todayInfo?.appt
                        const isOn = todayInfo?.isOn

                        return (
                          <td key={s.user_email} style={{ padding:'2px 6px', borderBottom:'1px solid var(--border-light)', borderLeft:'1px solid var(--border)', verticalAlign:'middle', height:28 }}>
                            {appt ? (
                              <button onClick={() => setDetailAppt(appt)} style={{ width:'100%', padding:'2px 6px', borderRadius:4, border:'none', background:'#3b82f6', color:'#fff', fontSize:10, fontWeight:500, cursor:'pointer', textAlign:'left', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {appt.client_name}
                              </button>
                            ) : !isOn ? (
                              <div style={{ width:'100%', height:20, borderRadius:4, background:'var(--bg3)', opacity:0.5 }}/>
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div style={{ display:'flex', gap:16, marginTop:16, fontSize:11, color:'var(--faint)' }}>
            {[['#dcfce7','#166534','Available'],['#dbeafe','#1d4ed8','Has bookings'],['#fee2e2','#991b1b','Unavailable']].map(([bg,c,l]) => (
              <div key={l} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:12, height:12, borderRadius:3, background:bg, border:'1px solid ' + c }}/>
                <span>{l}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'bookings' && (
        <AllBookings appointments={appointments} loading={loading} onCancel={cancelAppt} saving={saving} isAdmin={isAdmin} user={user} onRefresh={load}/>
      )}

      {/* Slot modal — manage a specific staff member's day */}
      {slotModal && (
        <DaySlotModal
          staffEmail={slotModal.staffEmail}
          staffName={slotModal.staffName}
          date={slotModal.date}
          avail={getAvail(slotModal.staffEmail, slotModal.date)}
          appts={getAppts(slotModal.staffEmail, slotModal.date)}
          onClose={() => setSlotModal(null)}
          onSave={load}
          onCancelAppt={cancelAppt}
          isAdmin={isAdmin}
          currentUser={user}
        />
      )}

      {/* Appointment detail panel */}
      {detailAppt && (
        <ApptDetail appt={detailAppt} onClose={() => setDetailAppt(null)} onCancel={cancelAppt} saving={saving} worker={WORKER}/>
      )}
    </div>
  )
}

function AllBookings({ appointments, loading, onCancel, saving, isAdmin, user, onRefresh }) {
  const [filter, setFilter] = useState('upcoming')
  const [staffFilter, setStaffFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('confirmed')
  const [search, setSearch] = useState('')
  const today = new Date().toISOString().split('T')[0]
  const staffOptions = Array.from(new Set(appointments.map((appointment) => appointment.staff_name).filter(Boolean)))
  const filtered = appointments
    .filter(a => filter === 'all' ? true : filter === 'upcoming' ? a.date >= today : a.date < today)
    .filter(a => staffFilter === 'all' ? true : a.staff_name === staffFilter)
    .filter(a => statusFilter === 'all' ? true : a.status === statusFilter)
    .filter(a => {
      if (!search.trim()) return true
      const haystack = `${a.client_name || ''} ${a.client_email || ''} ${a.client_business || ''} ${a.staff_name || ''}`.toLowerCase()
      return haystack.includes(search.trim().toLowerCase())
    })
    .sort((a,b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))

  return (
    <div>
      <div className="legacy-toolbar-actions" style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {[['upcoming','Upcoming'],['past','Past'],['all','All']].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)} className={'pill'+(filter===k?' on':'')}>{l}</button>
        ))}
        <div style={{ minWidth:220 }}>
          <select className="inp" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
            <option value="all">All staff</option>
            {staffOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div style={{ minWidth:180 }}>
          <select className="inp" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All statuses</option>
          </select>
        </div>
        <div style={{ minWidth:220, flex:1 }}>
          <input className="inp" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client, business, email..." />
        </div>
      </div>
      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
          <>
            <div className="tbl-wrap hide-mob">
              <table className="tbl">
                <thead><tr><th>Client</th><th>Business</th><th>Date</th><th>Time</th><th>Duration</th><th>Staff</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {filtered.map(a => (
                    <tr key={a.id}>
                      <td className="t-main">
                        <div style={{ fontWeight:500 }}>{a.client_name}</div>
                        <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{a.client_email}</div>
                      </td>
                      <td style={{ fontSize:13 }}>{a.client_business || '—'}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11, whiteSpace:'nowrap' }}>{formatDate(a.date)}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{a.start_time} – {a.end_time}</td>
                      <td style={{ fontSize:12 }}>{a.duration} min</td>
                      <td style={{ fontSize:12 }}>{a.staff_name?.split(' ')[0]}</td>
                      <td><span className={'badge badge-'+(a.status==='confirmed'?'green':a.status==='cancelled'?'red':'amber')}>{a.status}</span></td>
                      <td>
                        {a.status === 'confirmed' && (
                          <button className="btn btn-danger btn-sm" onClick={() => onCancel(a)} disabled={saving}>Cancel</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>No appointments found</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mobile-only" style={{ display:'none' }}>
              {filtered.length ? (
                <div style={{ display:'grid', gap:10, padding:12 }}>
                  {filtered.map((a) => (
                    <div key={a.id} className="card" style={{ padding:14, display:'grid', gap:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>{a.client_name}</div>
                          <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{a.client_email}</div>
                        </div>
                        <span className={'badge badge-'+(a.status==='confirmed'?'green':a.status==='cancelled'?'red':'amber')}>{a.status}</span>
                      </div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        <span className="badge badge-grey">{formatDate(a.date)}</span>
                        <span className="badge badge-grey">{a.start_time} - {a.end_time}</span>
                        <span className="badge badge-grey">{a.duration} min</span>
                      </div>
                      <div style={{ fontSize:12, color:'var(--sub)' }}>
                        {a.client_business || 'No business name'} · {a.staff_name}
                      </div>
                      {a.status === 'confirmed' ? (
                        <button className="btn btn-danger btn-sm" onClick={() => onCancel(a)} disabled={saving}>Cancel</button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : <div style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>No appointments found</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DaySlotModal({ staffEmail, staffName, date, avail, appts, onClose, onSave, onCancelAppt, isAdmin, currentUser }) {
  const [isAvailable, setIsAvailable] = useState(avail ? avail.is_available : true)
  const [saving, setSaving] = useState(false)

  const canEdit = isAdmin || currentUser?.email?.toLowerCase() === staffEmail?.toLowerCase()

  const save = async () => {
    setSaving(true)
    if (avail) {
      await supabase.from('staff_availability').update({ is_available: isAvailable, updated_at: new Date().toISOString() }).eq('id', avail.id)
    } else {
      await supabase.from('staff_availability').insert([{ staff_email: staffEmail, staff_name: staffName, date, is_available: isAvailable, slots: [] }])
    }
    setSaving(false); onSave(); onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:600, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)' }}/>
      <div className="legacy-side-sheet" style={{ position:'relative', width:480, maxWidth:'95vw', height:'100vh', background:'var(--card)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', boxShadow:'-8px 0 32px rgba(0,0,0,0.15)', overflowY:'auto' }}>
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:17, fontWeight:600, color:'var(--text)' }}>{staffName?.split(' ')[0]}</div>
            <div style={{ fontSize:12, color:'var(--faint)' }}>{formatDate(date)}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:20, lineHeight:1, padding:4 }}>×</button>
        </div>

        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:20 }}>
          {/* Availability toggle */}
          {canEdit && (
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Availability</div>
              <div style={{ display:'flex', gap:8 }}>
                {[true, false].map(v => (
                  <button key={String(v)} onClick={() => setIsAvailable(v)}
                    style={{ flex:1, padding:'10px', borderRadius:8, border:'1px solid '+(isAvailable===v?(v?'var(--green,#22c55e)':'var(--red)'):'var(--border)'), background:isAvailable===v?(v?'#dcfce7':'#fee2e2'):'transparent', color:isAvailable===v?(v?'#166534':'#991b1b'):'var(--sub)', cursor:'pointer', fontSize:13, fontWeight:isAvailable===v?600:400, transition:'all 0.15s' }}>
                    {v ? '✓ Available for bookings' : '✗ Unavailable this day'}
                  </button>
                ))}
              </div>
              <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop:12, width:'100%', justifyContent:'center' }}>
                {saving ? 'Saving...' : 'Save Availability'}
              </button>
            </div>
          )}

          {/* Bookings that day */}
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
              Bookings this day {appts.length > 0 && `(${appts.length})`}
            </div>
            {appts.length === 0 ? (
              <div style={{ fontSize:13, color:'var(--faint)', padding:'16px 0' }}>No bookings for this day</div>
            ) : appts.map(a => (
              <div key={a.id} style={{ background:'var(--bg2)', borderRadius:10, padding:'14px 16px', marginBottom:8, border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14, color:'var(--text)' }}>{a.client_name}</div>
                    <div style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{a.client_email}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--accent)', fontWeight:600 }}>{a.start_time} – {a.end_time}</div>
                    <div style={{ fontSize:11, color:'var(--faint)' }}>{a.duration} min</div>
                  </div>
                </div>
                {a.client_business && <div style={{ fontSize:12, color:'var(--sub)', marginBottom:8 }}>{a.client_business}</div>}
                {canEdit && (
                  <button className="btn btn-danger btn-sm" onClick={() => onCancelAppt(a)} style={{ marginTop:4 }}>Cancel booking</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ApptDetail({ appt, onClose, onCancel, saving }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:600, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)' }}/>
      <div className="legacy-side-sheet" style={{ position:'relative', width:420, maxWidth:'95vw', height:'100vh', background:'var(--card)', borderLeft:'1px solid var(--border)', padding:'24px', display:'flex', flexDirection:'column', gap:20, boxShadow:'-8px 0 32px rgba(0,0,0,0.15)', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:17, fontWeight:600, color:'var(--text)' }}>Appointment Details</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:20, lineHeight:1, padding:4 }}>×</button>
        </div>
        {[['Client', appt.client_name], ['Business', appt.client_business||'—'], ['Email', appt.client_email], ['Date', formatDate(appt.date)], ['Time', appt.start_time + ' – ' + appt.end_time], ['Duration', appt.duration + ' min'], ['Staff', appt.staff_name], ['Status', appt.status], ['Booked', new Date(appt.created_at).toLocaleString('en-GB')]].map(([l,v]) => (
          <div key={l} style={{ display:'flex', gap:12, borderBottom:'1px solid var(--border-light)', paddingBottom:12 }}>
            <span style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em', width:70, flexShrink:0, paddingTop:1 }}>{l}</span>
            <span style={{ fontSize:13, color:'var(--text)' }}>{v}</span>
          </div>
        ))}
        {appt.status === 'confirmed' && (
          <button className="btn btn-danger" onClick={() => onCancel(appt)} disabled={saving} style={{ marginTop:'auto' }}>
            {saving ? 'Cancelling...' : 'Cancel Appointment'}
          </button>
        )}
      </div>
    </div>
  )
}
