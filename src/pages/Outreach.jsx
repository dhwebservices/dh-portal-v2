import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { logAction } from '../utils/audit'

const STATUSES = ['new','contacted','interested','not_interested','follow_up','converted']
const EMPTY = { business_name:'', contact_name:'', phone:'', email:'', website:'', status:'new', notes:'' }
const statusColor = { new:'grey', contacted:'blue', interested:'green', not_interested:'red', follow_up:'amber', converted:'green' }

export default function Outreach() {
  const { user } = useAuth()
  const [tab, setTab]         = useState('contacts') // contacts | emails
  const [rows, setRows]       = useState([])
  const [emails, setEmails]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewEmail, setViewEmail] = useState(null)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)

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

  const openAdd  = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = r => { setEditing(r); setForm({ ...r }); setModal(true) }
  const close    = () => { setModal(false); setEditing(null) }
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    // Only send columns that exist in the table
    const payload = {
      business_name: form.business_name,
      contact_name: form.contact_name,
      phone: form.phone,
      email: form.email,
      website: form.website,
      status: form.status,
      notes: form.notes,
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
    setSaving(false); close(); load()
  }

  const quickStatus = async (id, status) => {
    const { error } = await supabase.from('outreach').update({ status }).eq('id', id)
    if (!error) load()
  }

  const del = async (id, name) => {
    if (!confirm('Delete ' + name + '?')) return
    await supabase.from('outreach').delete().eq('id', id)
    await logAction(user?.email, user?.name, 'outreach_deleted', name, id, {})
    load()
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchQ = !q || r.business_name?.toLowerCase().includes(q) || r.contact_name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q) || r.added_by?.toLowerCase().includes(q)
    const matchF = filter === 'all' || r.status === filter
    return matchQ && matchF
  })

  const filteredEmails = emails.filter(e => {
    const q = search.toLowerCase()
    const sentTo = Array.isArray(e.sent_to) ? e.sent_to.join(' ') : (e.sent_to || '')
    return !q || sentTo.toLowerCase().includes(q) || e.subject?.toLowerCase().includes(q) || e.sent_by?.toLowerCase().includes(q)
  })

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Clients Contacted</h1>
          <p className="page-sub">{rows.length} contacts · {emails.length} emails sent</p>
        </div>
        {tab === 'contacts' && <button className="btn btn-primary" onClick={openAdd}>+ Add Contact</button>}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, background:'var(--bg2)', borderRadius:10, padding:4, width:'fit-content' }}>
        {[['contacts','📋 Contacts'],['emails','✉️ Emails Sent']].map(([k,l]) => (
          <button key={k} onClick={() => { setTab(k); setSearch('') }}
            style={{ padding:'7px 18px', borderRadius:7, border:'none', background: tab===k ? 'var(--card)' : 'transparent', color: tab===k ? 'var(--text)' : 'var(--faint)', fontSize:13, fontWeight: tab===k ? 500 : 400, cursor:'pointer', transition:'all 0.15s', boxShadow: tab===k ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
            {l}
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <svg style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--faint)',pointerEvents:'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="inp" style={{ paddingLeft:34 }} placeholder={tab === 'contacts' ? 'Search contacts...' : 'Search emails...'} value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        {tab === 'contacts' && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {['all', ...STATUSES].map(s => (
              <button key={s} onClick={() => setFilter(s)} className={'pill'+(filter===s?' on':'')}>
                {s === 'all' ? 'All' : s.replace('_',' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contacts tab */}
      {tab === 'contacts' && (
        <div className="card" style={{ overflow:'hidden' }}>
          {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Business</th><th>Contact</th><th>Email</th><th>Status</th><th>Added By</th><th>Notes</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td className="t-main">{r.business_name}</td>
                    <td>{r.contact_name}</td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{r.email}</td>
                    <td>
                      <select
                        className="inp"
                        style={{ padding:'4px 8px', fontSize:11, fontFamily:'var(--font-mono)', width:120, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg2)', cursor:'pointer' }}
                        value={r.status || 'new'}
                        onChange={e => quickStatus(r.id, e.target.value)}
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                      </select>
                    </td>
                    <td>
                      {r.added_by ? (
                        <span style={{ fontSize:12, color:'var(--sub)', display:'flex', alignItems:'center', gap:5 }}>
                          <span style={{ width:18, height:18, borderRadius:'50%', background:'var(--accent-soft)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:600, color:'var(--accent)' }}>
                            {r.added_by.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                          </span>
                          {r.added_by}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.notes}</td>
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => del(r.id, r.business_name)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>No contacts found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Emails Sent tab */}
      {tab === 'emails' && (
        <div className="card" style={{ overflow:'hidden' }}>
          {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Sent To</th><th>Subject</th><th>From</th><th>Sent By</th><th>Date</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filteredEmails.map(e => (
                  <tr key={e.id} style={{ cursor:'pointer' }} onClick={() => setViewEmail(e)}>
                    <td className="t-main" style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>{Array.isArray(e.sent_to) ? e.sent_to[0] : e.sent_to}</td>
                    <td style={{ maxWidth:280 }}>
                      <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:13, fontWeight:500 }}>{e.subject}</div>
                    </td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--faint)' }}>{e.from_address}</td>
                    <td>
                      {e.sent_by ? (
                        <span style={{ fontSize:12, color:'var(--sub)', display:'flex', alignItems:'center', gap:5 }}>
                          <span style={{ width:18, height:18, borderRadius:'50%', background:'var(--accent-soft)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:600, color:'var(--accent)' }}>
                            {(e.sent_by||'').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                          </span>
                          {e.sent_by}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--faint)', whiteSpace:'nowrap' }}>
                      {e.sent_at ? new Date(e.sent_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={ev => { ev.stopPropagation(); setViewEmail(e) }}>View</button>
                    </td>
                  </tr>
                ))}
                {filteredEmails.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>No emails logged yet</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Email view modal */}
      {viewEmail && (
        <div style={{ position:'fixed', inset:0, zIndex:600, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
          <div onClick={() => setViewEmail(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)' }}/>
          <div style={{ position:'relative', width:560, maxWidth:'95vw', height:'100vh', background:'var(--card)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', boxShadow:'-8px 0 32px rgba(0,0,0,0.15)', overflowY:'auto' }}>
            <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:17, fontWeight:600, color:'var(--text)', marginBottom:8, lineHeight:1.3 }}>{viewEmail.subject}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {[['To', Array.isArray(viewEmail.sent_to) ? viewEmail.sent_to.join(', ') : viewEmail.sent_to], ['From', viewEmail.from_address], ['Sent by', viewEmail.sent_by], ['Date', viewEmail.sent_at ? new Date(viewEmail.sent_at).toLocaleString('en-GB') : '—']].map(([l,v]) => (
                    <div key={l} style={{ display:'flex', gap:8, fontSize:12 }}>
                      <span style={{ color:'var(--faint)', fontFamily:'var(--font-mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em', width:50, flexShrink:0, paddingTop:1 }}>{l}</span>
                      <span style={{ color:'var(--sub)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setViewEmail(null)} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:20, lineHeight:1, padding:4 }}>×</button>
            </div>
            <div style={{ flex:1, padding:'20px 24px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:12 }}>Message</div>
              <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.7, whiteSpace:'pre-wrap', background:'var(--bg2)', borderRadius:10, padding:'16px 20px' }}>
                {viewEmail.body}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/edit contact modal */}
      {modal && (
        <Modal
          title={editing ? 'Edit Contact' : 'Add Contact'}
          onClose={close}
          footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}
        >
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="fg">
              <div><label className="lbl">Business Name</label><input className="inp" value={form.business_name} onChange={e=>sf('business_name',e.target.value)} placeholder="Acme Ltd"/></div>
              <div><label className="lbl">Contact Name</label><input className="inp" value={form.contact_name} onChange={e=>sf('contact_name',e.target.value)} placeholder="John Smith"/></div>
              <div><label className="lbl">Email</label><input className="inp" type="email" value={form.email} onChange={e=>sf('email',e.target.value)}/></div>
              <div><label className="lbl">Phone</label><input className="inp" value={form.phone} onChange={e=>sf('phone',e.target.value)}/></div>
              <div><label className="lbl">Website</label><input className="inp" value={form.website} onChange={e=>sf('website',e.target.value)} placeholder="https://"/></div>
              <div><label className="lbl">Status</label>
                <select className="inp" value={form.status} onChange={e=>sf('status',e.target.value)}>
                  {STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                </select>
              </div>
            </div>
            {!editing && (
              <div style={{ padding:'8px 12px', background:'var(--bg2)', borderRadius:7, fontSize:13, color:'var(--sub)', display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ color:'var(--faint)', fontFamily:'var(--font-mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em' }}>Added by</span>
                <span style={{ fontWeight:500, color:'var(--text)' }}>{user?.name}</span>
              </div>
            )}
            <div><label className="lbl">Notes</label><textarea className="inp" rows={3} value={form.notes} onChange={e=>sf('notes',e.target.value)} style={{ resize:'vertical' }}/></div>
          </div>
        </Modal>
      )}
    </div>
  )
}
