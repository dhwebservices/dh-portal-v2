import { useMemo, useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { logAction } from '../utils/audit'

const STATUSES = ['new', 'contacted', 'interested', 'not_interested', 'follow_up', 'converted']
const FILTERS = ['all', 'follow_up_queue', 'overdue', 'hot', 'recent', 'converted', 'not_interested']
const EMPTY = { business_name: '', contact_name: '', phone: '', email: '', website: '', status: 'new', notes: '' }

const statusColor = {
  new: 'grey',
  contacted: 'blue',
  interested: 'green',
  not_interested: 'red',
  follow_up: 'amber',
  converted: 'green',
}

function labelize(value = '') {
  return String(value || '').replace(/_/g, ' ')
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTouchedAt(row) {
  return row.updated_at || row.created_at || null
}

function daysSince(value) {
  if (!value) return null
  const diff = Date.now() - new Date(value).getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}

function getLeadTemperature(row) {
  if (row.status === 'converted') return { label: 'Won', tone: 'green' }
  if (row.status === 'interested') return { label: 'Hot', tone: 'red' }
  if (row.status === 'follow_up') return { label: 'Warm', tone: 'amber' }
  if (row.status === 'contacted') return { label: 'Warm', tone: 'blue' }
  if (row.status === 'not_interested') return { label: 'Cold', tone: 'grey' }
  return { label: 'New', tone: 'grey' }
}

function needsFollowUp(row) {
  return ['contacted', 'interested', 'follow_up'].includes(row.status)
}

function isRecent(row) {
  const touched = getTouchedAt(row)
  const age = daysSince(touched)
  return age !== null && age <= 2
}

function isOverdue(row) {
  if (!needsFollowUp(row)) return false
  const touched = getTouchedAt(row)
  const age = daysSince(touched)
  if (age === null) return false
  if (row.status === 'interested') return age >= 2
  if (row.status === 'follow_up') return age >= 2
  return age >= 4
}

function getNextAction(row) {
  if (row.status === 'new') return 'First outreach'
  if (row.status === 'contacted') return 'Send follow-up'
  if (row.status === 'interested') return 'Book a call'
  if (row.status === 'follow_up') return 'Chase today'
  if (row.status === 'converted') return 'Hand over to delivery'
  return 'Close out or archive'
}

function getLastContactMethod(row, emails) {
  const emailLog = emails.find((entry) => {
    const sentTo = Array.isArray(entry.sent_to) ? entry.sent_to.join(' ').toLowerCase() : String(entry.sent_to || '').toLowerCase()
    const email = String(row.email || '').toLowerCase()
    return email && sentTo.includes(email)
  })

  if (emailLog) return 'Email sent'
  if (row.phone) return 'Call logged'
  return 'No method logged'
}

function buildQueue(rows, emails) {
  return rows
    .filter((row) => needsFollowUp(row))
    .map((row) => {
      const touched = getTouchedAt(row)
      const age = daysSince(touched)
      return {
        ...row,
        touched,
        age,
        overdue: isOverdue(row),
        nextAction: getNextAction(row),
        contactMethod: getLastContactMethod(row, emails),
        temperature: getLeadTemperature(row),
      }
    })
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      if ((b.age || 0) !== (a.age || 0)) return (b.age || 0) - (a.age || 0)
      return new Date(b.touched || 0).getTime() - new Date(a.touched || 0).getTime()
    })
}

function StatCard({ label, value, hint, tone = 'var(--accent)' }) {
  return (
    <div className="card" style={{ padding: '18px 18px 16px', minHeight: 122 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${tone}18`, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: tone, display: 'inline-block' }} />
      </div>
      <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>{value}</div>
      <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.5 }}>{hint}</div>
    </div>
  )
}

export default function Outreach() {
  const { user } = useAuth()
  const [tab, setTab] = useState('contacts')
  const [rows, setRows] = useState([])
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewEmail, setViewEmail] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: contacts }, { data: emailLog }] = await Promise.all([
      supabase.from('outreach').select('*').order('created_at', { ascending: false }),
      supabase.from('email_log').select('*').order('sent_at', { ascending: false }).limit(200),
    ])
    setRows(contacts || [])
    setEmails(emailLog || [])
    setLoading(false)
  }

  const openAdd = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = (r) => { setEditing(r); setForm({ ...r }); setModal(true) }
  const close = () => { setModal(false); setEditing(null) }
  const sf = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    const payload = {
      business_name: form.business_name,
      contact_name: form.contact_name,
      phone: form.phone,
      email: form.email,
      website: form.website,
      status: form.status,
      notes: form.notes,
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      const { error } = await supabase.from('outreach').update(payload).eq('id', editing.id)
      if (error) console.error('Outreach update error:', error)
      else await logAction(user?.email, user?.name, 'outreach_updated', form.business_name, editing.id, {})
    } else {
      const { error } = await supabase.from('outreach').insert([{ ...payload, added_by: user?.name, created_at: new Date().toISOString() }])
      if (error) console.error('Outreach insert error:', error)
      else await logAction(user?.email, user?.name, 'outreach_added', form.business_name, null, {})
    }
    setSaving(false)
    close()
    load()
  }

  const quickStatus = async (id, status) => {
    const { error } = await supabase.from('outreach').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (!error) load()
  }

  const del = async (id, name) => {
    if (!confirm('Delete ' + name + '?')) return
    await supabase.from('outreach').delete().eq('id', id)
    await logAction(user?.email, user?.name, 'outreach_deleted', name, id, {})
    load()
  }

  const followUpQueue = useMemo(() => buildQueue(rows, emails), [rows, emails])

  const stats = useMemo(() => ({
    total: rows.length,
    queue: followUpQueue.length,
    overdue: followUpQueue.filter((row) => row.overdue).length,
    hot: rows.filter((row) => row.status === 'interested').length,
    converted: rows.filter((row) => row.status === 'converted').length,
    recent: rows.filter((row) => isRecent(row)).length,
  }), [rows, followUpQueue])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const q = search.toLowerCase()
      const matchQ = !q
        || r.business_name?.toLowerCase().includes(q)
        || r.contact_name?.toLowerCase().includes(q)
        || r.email?.toLowerCase().includes(q)
        || r.added_by?.toLowerCase().includes(q)
        || r.notes?.toLowerCase().includes(q)

      const matchF =
        filter === 'all'
        || (filter === 'follow_up_queue' && needsFollowUp(r))
        || (filter === 'overdue' && isOverdue(r))
        || (filter === 'hot' && r.status === 'interested')
        || (filter === 'recent' && isRecent(r))
        || (filter === 'converted' && r.status === 'converted')
        || (filter === 'not_interested' && r.status === 'not_interested')
        || r.status === filter

      return matchQ && matchF
    })
  }, [rows, search, filter])

  const filteredEmails = emails.filter((e) => {
    const q = search.toLowerCase()
    const sentTo = Array.isArray(e.sent_to) ? e.sent_to.join(' ') : (e.sent_to || '')
    return !q || sentTo.toLowerCase().includes(q) || e.subject?.toLowerCase().includes(q) || e.sent_by?.toLowerCase().includes(q)
  })

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Clients Contacted</h1>
          <p className="page-sub">Outreach queue, recent contact history, and follow-up actions in one place.</p>
        </div>
        {tab === 'contacts' && <button className="btn btn-primary" onClick={openAdd}>+ Add Contact</button>}
      </div>

      <div className="dashboard-stat-grid outreach-mobile-hero" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 16, marginBottom: 22 }}>
        <StatCard label="Total leads" value={stats.total} hint="All outreach records in the portal" tone="var(--accent)" />
        <StatCard label="Follow-up queue" value={stats.queue} hint="Leads that still need another touch" tone="var(--amber)" />
        <StatCard label="Overdue" value={stats.overdue} hint="Follow-ups that are now late" tone="var(--red)" />
        <StatCard label="Hot leads" value={stats.hot} hint="Interested contacts worth prioritising" tone="var(--green)" />
        <StatCard label="Converted" value={stats.converted} hint="Handed over into live client work" tone="var(--blue)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(280px,0.75fr)', gap: 18, marginBottom: 22 }} className="dashboard-panel-grid">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)' }}>Follow-up queue</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>Who should outreach chase next?</div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => setFilter('follow_up_queue')}>Open queue view</button>
          </div>

          {followUpQueue.length ? (
            followUpQueue.slice(0, 6).map((row, index) => {
              const temperature = getLeadTemperature(row)
              const age = daysSince(getTouchedAt(row))
              return (
                <div
                  key={row.id}
                  style={{
                    padding: '14px 18px',
                    borderBottom: index < Math.min(followUpQueue.length, 6) - 1 ? '1px solid var(--border)' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 14,
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{row.business_name || 'Unnamed lead'}</span>
                      <span className={`badge badge-${temperature.tone}`}>{temperature.label}</span>
                      {row.overdue ? <span className="badge badge-red">Overdue</span> : null}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.6 }}>
                      {row.contact_name || 'No contact name'} · {getLastContactMethod(row, emails)} · {age === null ? 'No activity date' : `${age} day${age === 1 ? '' : 's'} since touch`}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 8 }}>
                      Next action: <strong>{getNextAction(row)}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(row)}>Open</button>
                    {row.status !== 'interested' ? <button className="btn btn-outline btn-sm" onClick={() => quickStatus(row.id, 'interested')}>Mark hot</button> : null}
                    {row.status !== 'follow_up' ? <button className="btn btn-outline btn-sm" onClick={() => quickStatus(row.id, 'follow_up')}>Set follow-up</button> : null}
                  </div>
                </div>
              )
            })
          ) : (
            <div style={{ padding: '34px 18px', textAlign: 'center', color: 'var(--faint)' }}>No leads currently need a follow-up.</div>
          )}
        </div>

        <div className="card card-pad">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 6 }}>Focus area</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Work the right leads first</div>
          <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.65, marginBottom: 14 }}>
            Outreach staff should spend most of their time on interested leads, follow-ups that are now overdue, and anyone recently contacted who still has momentum.
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {[
              ['Interested leads', `${stats.hot} ready for a stronger push`, 'green'],
              ['Overdue follow-ups', `${stats.overdue} contacts need chasing today`, 'red'],
              ['Recent activity', `${stats.recent} leads touched in the last 48 hours`, 'blue'],
            ].map(([title, text, tone]) => (
              <div key={title} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className={`badge badge-${tone}`}>{title}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.5 }}>{text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="tabs">
        {[['contacts', 'Contacts'], ['emails', 'Emails Sent']].map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setSearch('') }} className={'tab' + (tab === k ? ' on' : '')}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }} className="legacy-toolbar">
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="inp" style={{ paddingLeft: 34 }} placeholder={tab === 'contacts' ? 'Search leads, people, notes...' : 'Search emails...'} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {tab === 'contacts' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} className="legacy-toolbar-actions">
            {FILTERS.map((value) => (
              <button key={value} onClick={() => setFilter(value)} className={'pill' + (filter === value ? ' on' : '')}>
                {labelize(value)}
              </button>
            ))}
            {STATUSES.map((value) => (
              <button key={value} onClick={() => setFilter(value)} className={'pill' + (filter === value ? ' on' : '')}>
                {labelize(value)}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'contacts' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? <div className="spin-wrap"><div className="spin" /></div> : (
            <>
              <div className="tbl-wrap desktop-only">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Status</th>
                      <th>Temperature</th>
                      <th>Next action</th>
                      <th>Last touch</th>
                      <th>Added by</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const touched = getTouchedAt(r)
                      const age = daysSince(touched)
                      const temperature = getLeadTemperature(r)
                      const nextAction = getNextAction(r)
                      const overdue = isOverdue(r)
                      return (
                        <tr key={r.id}>
                          <td className="t-main">
                            <div style={{ fontWeight: 600 }}>{r.business_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4 }}>{r.contact_name || 'No contact'}{r.email ? ` · ${r.email}` : ''}</div>
                          </td>
                          <td>
                            <select
                              className="inp"
                              style={{ padding: '4px 8px', fontSize: 11, fontFamily: 'var(--font-mono)', width: 132, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer' }}
                              value={r.status || 'new'}
                              onChange={(e) => quickStatus(r.id, e.target.value)}
                            >
                              {STATUSES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
                            </select>
                          </td>
                          <td><span className={`badge badge-${temperature.tone}`}>{temperature.label}</span></td>
                          <td style={{ minWidth: 160 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{nextAction}</div>
                            <div style={{ fontSize: 11, color: overdue ? 'var(--red)' : 'var(--faint)', marginTop: 4 }}>
                              {overdue ? 'Overdue follow-up' : `${getLastContactMethod(r, emails)}${age !== null ? ` · ${age}d ago` : ''}`}
                            </div>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)' }}>{formatDateTime(touched)}</td>
                          <td>
                            {r.added_by ? (
                              <span style={{ fontSize: 12, color: 'var(--sub)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: 'var(--accent)' }}>
                                  {r.added_by.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                                </span>
                                {r.added_by}
                              </span>
                            ) : '—'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>Edit</button>
                              {r.status !== 'follow_up' ? <button className="btn btn-outline btn-sm" onClick={() => quickStatus(r.id, 'follow_up')}>Follow-up</button> : null}
                              {r.status !== 'converted' ? <button className="btn btn-outline btn-sm" onClick={() => quickStatus(r.id, 'converted')}>Convert</button> : null}
                              <button className="btn btn-danger btn-sm" onClick={() => del(r.id, r.business_name)}>Del</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--faint)' }}>No outreach records match that view.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mobile-only" style={{ display: 'none', padding: 14 }}>
                <div className="outreach-mobile-stack">
                  {filtered.map((r) => {
                    const touched = getTouchedAt(r)
                    const age = daysSince(touched)
                    const temperature = getLeadTemperature(r)
                    const overdue = isOverdue(r)
                    return (
                      <div key={`mobile-${r.id}`} className="card outreach-mobile-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{r.business_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4 }}>{r.contact_name || 'No contact'}{r.email ? ` · ${r.email}` : ''}</div>
                          </div>
                          <span className={`badge badge-${temperature.tone}`}>{temperature.label}</span>
                        </div>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                          <span className={`badge badge-${statusColor[r.status || 'new'] || 'grey'}`}>{labelize(r.status || 'new')}</span>
                          {overdue ? <span className="badge badge-red">Overdue</span> : null}
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.6, marginBottom: 12 }}>
                          {getNextAction(r)} · {getLastContactMethod(r, emails)}{age !== null ? ` · ${age}d ago` : ''}
                        </div>
                        <div style={{ display:'grid', gap:8, marginBottom:12 }}>
                          <div style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>Last touch</div>
                          <div style={{ fontSize:12.5, color:'var(--text)' }}>{formatDateTime(touched)}</div>
                          {r.notes ? (
                            <>
                              <div style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>Latest note</div>
                              <div style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.55 }}>{r.notes}</div>
                            </>
                          ) : null}
                        </div>
                        <div className="outreach-mobile-actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>Edit</button>
                          <button className="btn btn-outline btn-sm" onClick={() => quickStatus(r.id, 'follow_up')}>Follow-up</button>
                          <button className="btn btn-outline btn-sm" onClick={() => quickStatus(r.id, 'interested')}>Hot</button>
                          <button className="btn btn-outline btn-sm" onClick={() => quickStatus(r.id, 'converted')}>Convert</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'emails' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? <div className="spin-wrap"><div className="spin" /></div> : (
            <div className="tbl-wrap desktop-only">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Sent To</th><th>Subject</th><th>From</th><th>Sent By</th><th>Date</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmails.map((e) => (
                    <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => setViewEmail(e)}>
                      <td className="t-main" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{Array.isArray(e.sent_to) ? e.sent_to[0] : e.sent_to}</td>
                      <td style={{ maxWidth: 280 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500 }}>{e.subject}</div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)' }}>{e.from_address}</td>
                      <td>
                        {e.sent_by ? (
                          <span style={{ fontSize: 12, color: 'var(--sub)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: 'var(--accent)' }}>
                              {(e.sent_by || '').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                            </span>
                            {e.sent_by}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)', whiteSpace: 'nowrap' }}>
                        {e.sent_at ? new Date(e.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={(ev) => { ev.stopPropagation(); setViewEmail(e) }}>View</button>
                      </td>
                    </tr>
                  ))}
                  {filteredEmails.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--faint)' }}>No emails logged yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {!loading ? (
            <div className="mobile-only" style={{ display:'none', padding:14 }}>
              <div className="outreach-mobile-stack">
                {filteredEmails.map((e) => (
                  <button
                    key={`mobile-email-${e.id}`}
                    onClick={() => setViewEmail(e)}
                    className="card outreach-mobile-card"
                    style={{ textAlign:'left', border:'1px solid var(--border)', background:'var(--card)', width:'100%' }}
                  >
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:6, lineHeight:1.4 }}>{e.subject}</div>
                    <div style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.6, marginBottom:10 }}>
                      {Array.isArray(e.sent_to) ? e.sent_to[0] : e.sent_to}
                    </div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <span className="badge badge-blue">{e.sent_by || 'Portal'}</span>
                      <span className="badge badge-grey">{e.sent_at ? new Date(e.sent_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : 'No date'}</span>
                    </div>
                  </button>
                ))}
                {!filteredEmails.length ? <div style={{ textAlign:'center', padding:24, color:'var(--faint)' }}>No emails logged yet</div> : null}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {viewEmail && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
          <div onClick={() => setViewEmail(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: 560, maxWidth: '95vw', height: '100vh', background: 'var(--card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.15)', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 8, lineHeight: 1.3 }}>{viewEmail.subject}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[['To', Array.isArray(viewEmail.sent_to) ? viewEmail.sent_to.join(', ') : viewEmail.sent_to], ['From', viewEmail.from_address], ['Sent by', viewEmail.sent_by], ['Date', viewEmail.sent_at ? new Date(viewEmail.sent_at).toLocaleString('en-GB') : '—']].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                      <span style={{ color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', width: 50, flexShrink: 0, paddingTop: 1 }}>{l}</span>
                      <span style={{ color: 'var(--sub)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setViewEmail(null)} style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <div style={{ flex: 1, padding: '20px 24px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Message</div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: 'var(--bg2)', borderRadius: 10, padding: '16px 20px' }}>
                {viewEmail.body}
              </div>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <Modal
          title={editing ? 'Edit Contact' : 'Add Contact'}
          onClose={close}
          footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="fg">
              <div><label className="lbl">Business Name</label><input className="inp" value={form.business_name} onChange={(e) => sf('business_name', e.target.value)} placeholder="Acme Ltd" /></div>
              <div><label className="lbl">Contact Name</label><input className="inp" value={form.contact_name} onChange={(e) => sf('contact_name', e.target.value)} placeholder="John Smith" /></div>
              <div><label className="lbl">Email</label><input className="inp" type="email" value={form.email} onChange={(e) => sf('email', e.target.value)} /></div>
              <div><label className="lbl">Phone</label><input className="inp" value={form.phone} onChange={(e) => sf('phone', e.target.value)} /></div>
              <div><label className="lbl">Website</label><input className="inp" value={form.website} onChange={(e) => sf('website', e.target.value)} placeholder="https://" /></div>
              <div><label className="lbl">Status</label>
                <select className="inp" value={form.status} onChange={(e) => sf('status', e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
                </select>
              </div>
            </div>
            {!editing && (
              <div style={{ padding: '8px 12px', background: 'var(--bg2)', borderRadius: 7, fontSize: 13, color: 'var(--sub)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Added by</span>
                <span style={{ fontWeight: 500, color: 'var(--text)' }}>{user?.name}</span>
              </div>
            )}
            <div><label className="lbl">Notes</label><textarea className="inp" rows={4} value={form.notes} onChange={(e) => sf('notes', e.target.value)} style={{ resize: 'vertical' }} placeholder="What happened on the call? What should happen next?" /></div>
          </div>
        </Modal>
      )}
    </div>
  )
}
