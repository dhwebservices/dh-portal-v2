import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { logAction } from '../utils/audit'

const PLANS    = ['Starter','Growth','Pro','Enterprise']
const STATUSES = ['active','inactive','pending']
const EMPTY    = { name:'', contact:'', email:'', phone:'', plan:'Starter', status:'active', value:'', invoice_paid:false, website_url:'', notes:'' }

const COLOURS = ['#0071E3','#30A46C','#E54D2E','#8E4EC6','#C2500D','#0197C8','#D6409F']
const colourFor = (str) => COLOURS[(str||'').split('').reduce((a,c) => a+c.charCodeAt(0), 0) % COLOURS.length]

export default function Clients() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending:false })
    setRows(data || [])
    setLoading(false)
  }
  const openAdd  = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = (e, r) => { e.stopPropagation(); setEditing(r); setForm({ ...r }); setModal(true) }
  const close    = () => { setModal(false); setEditing(null) }
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!form.name?.trim()) { alert('Business name is required'); return }
    setSaving(true)
    try {
      const SUPABASE_URL = 'https://xtunnfdwltfesscmpove.supabase.co'
      const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM'
      const headers = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      const payload = {
        name: form.name || null,
        contact: form.contact || null,
        email: form.email || null,
        phone: form.phone || null,
        plan: form.plan || 'Starter',
        status: form.status || 'active',
        value: form.value || null,
        invoice_paid: form.invoice_paid || false,
        website_url: form.website_url || null,
        notes: form.notes || null,
      }
      if (editing) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${editing.id}`, {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() })
        })
        if (!res.ok) { const e = await res.text(); throw new Error(e) }
      } else {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ ...payload, created_at: new Date().toISOString() })
        })
        if (!res.ok) { const e = await res.text(); throw new Error(e) }
      }
      await logAction(user?.email, user?.name, editing ? 'client_updated' : 'client_added', form.name, editing?.id, {}).catch(() => {})
      close()
      load()
    } catch (err) {
      console.error('Client save error:', err)
      alert('Save failed: ' + (err?.message || JSON.stringify(err)))
    } finally {
      setSaving(false)
    }
  }

  const del = async (e, id, name) => {
    e.stopPropagation()
    if (!confirm('Delete ' + name + '?')) return
    await supabase.from('clients').delete().eq('id', id)
    load()
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchQ = !q || r.name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q)
    const matchF = filter === 'all' || r.status === filter
    return matchQ && matchF
  })

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Onboarded Clients</h1>
          <p className="page-sub">{rows.filter(r => r.status === 'active').length} active · {rows.length} total</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Client</button>
      </div>

      <div className="legacy-toolbar" style={{ display:'flex', gap:12, marginBottom:24, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <svg style={{ position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--faint)',pointerEvents:'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="inp" style={{ paddingLeft:34, borderRadius:100 }} placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <div className="legacy-toolbar-actions" style={{ display:'flex', gap:6 }}>
          {['all','active','pending','inactive'].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={'pill'+(filter===s?' on':'')}>{s}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="compact-card-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:16 }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="card" style={{ padding:24 }}>
              <div className="skel" style={{ width:52, height:52, borderRadius:12, marginBottom:14 }}/>
              <div className="skel" style={{ width:'70%', height:14, marginBottom:8 }}/>
              <div className="skel" style={{ width:'50%', height:12 }}/>
            </div>
          ))}
        </div>
      ) : (
        <div className="compact-card-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:16 }}>
          {filtered.map(r => {
            const colour = colourFor(r.email || r.name)
            return (
              <button
                key={r.id}
                onClick={() => navigate(`/clients/${r.id}`)}
                style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:'22px 20px', textAlign:'left', cursor:'pointer', transition:'all 0.2s cubic-bezier(0.16,1,0.3,1)', display:'flex', flexDirection:'column', gap:12, position:'relative' }}
                onMouseOver={e => { e.currentTarget.style.borderColor=colour; e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow=`0 8px 24px ${colour}22` }}
                onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}
              >
                {/* Edit/Delete */}
                <div style={{ position:'absolute', top:12, right:12, display:'flex', gap:4 }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={e => openEdit(e, r)} style={{ width:26, height:26, padding:0 }}>✎</button>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={e => del(e, r.id, r.name)} style={{ width:26, height:26, padding:0, color:'var(--red)' }}>✕</button>
                </div>

                {/* Avatar */}
                <div style={{ width:52, height:52, borderRadius:12, background:colour+'18', border:`1px solid ${colour}33`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700, fontFamily:'var(--font-display)', color:colour, flexShrink:0 }}>
                  {(r.name||'?')[0].toUpperCase()}
                </div>

                <div>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:3, paddingRight:40 }}>{r.name}</div>
                  <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.email}</div>
                  {r.contact && <div style={{ fontSize:12, color:'var(--sub)', marginTop:2 }}>{r.contact}</div>}
                </div>

                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <span className="badge badge-blue">{r.plan}</span>
                  <span className={`badge badge-${r.status==='active'?'green':r.status==='pending'?'amber':'grey'}`}>{r.status}</span>
                  {r.value && <span style={{ fontSize:11, color:'var(--sub)', fontFamily:'var(--font-mono)' }}>£{Number(r.value).toLocaleString()}</span>}
                </div>

                <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span className={`badge badge-${r.invoice_paid?'green':'amber'}`} style={{ fontSize:10 }}>{r.invoice_paid ? '✓ Paid' : 'Unpaid'}</span>
                  <span style={{ fontSize:11, color:'var(--accent)', fontFamily:'var(--font-mono)' }}>View profile →</span>
                </div>
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn:'1/-1' }}>
              <div className="empty"><p>No clients found</p></div>
            </div>
          )}
        </div>
      )}

      {modal && (
        <Modal title={editing ? 'Edit Client' : 'Add Client'} onClose={close}
          footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving...':'Save'}</button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="fg">
              <div><label className="lbl">Business Name</label><input className="inp" value={form.name} onChange={e=>sf('name',e.target.value)}/></div>
              <div><label className="lbl">Contact Person</label><input className="inp" value={form.contact} onChange={e=>sf('contact',e.target.value)}/></div>
              <div><label className="lbl">Email</label><input className="inp" type="email" value={form.email} onChange={e=>sf('email',e.target.value)}/></div>
              <div><label className="lbl">Phone</label><input className="inp" value={form.phone} onChange={e=>sf('phone',e.target.value)}/></div>
              <div><label className="lbl">Plan</label>
                <select className="inp" value={form.plan} onChange={e=>sf('plan',e.target.value)}>
                  {PLANS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div><label className="lbl">Status</label>
                <select className="inp" value={form.status} onChange={e=>sf('status',e.target.value)}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="lbl">Value (£)</label><input className="inp" type="number" value={form.value} onChange={e=>sf('value',e.target.value)}/></div>
              <div><label className="lbl">Website URL</label><input className="inp" value={form.website_url||''} onChange={e=>sf('website_url',e.target.value)} placeholder="https://"/></div>
            </div>
            <div><label className="lbl">Notes</label><textarea className="inp" rows={2} value={form.notes||''} onChange={e=>sf('notes',e.target.value)} style={{ resize:'vertical' }}/></div>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
              <input type="checkbox" checked={!!form.invoice_paid} onChange={e=>sf('invoice_paid',e.target.checked)} style={{ accentColor:'var(--accent)', width:16, height:16 }}/>
              Invoice Paid
            </label>
          </div>
        </Modal>
      )}
    </div>
  )
}
