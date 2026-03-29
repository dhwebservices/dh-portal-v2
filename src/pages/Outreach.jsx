import { useState, useEffect, useRef } from 'react'
import { Plus, Search, Upload, Download, Edit2, Trash2, ArrowRight, Filter } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { logAction } from '../utils/audit'
import { useMsal } from '@azure/msal-react'

const STATUSES = ['Contacted','Interested','Not Interested','To Be Onboarded']
const STATUS_BADGE = { 'Contacted':'grey','Interested':'green','Not Interested':'red','To Be Onboarded':'gold' }
const EMPTY = { business_name:'',contact_name:'',phone:'',email:'',website:'',status:'Contacted',notes:'',added_by:'' }

function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--faint)',cursor:'pointer',fontSize:20,lineHeight:1 }}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
  )
}

export default function Outreach() {
  const { accounts } = useMsal()
  const user = accounts[0]
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('outreach').select('*').order('created_at',{ascending:false})
    setRecords(data||[])
    setLoading(false)
  }

  const filtered = records.filter(r => {
    const q = search.toLowerCase()
    const s = !q || r.business_name?.toLowerCase().includes(q) || r.contact_name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q)
    return s && (filter==='all' || r.status===filter)
  })

  const openAdd = () => { setForm({...EMPTY, added_by: user?.name||''}); setSelected(null); setModal('form') }
  const openEdit = r => { setForm({...r}); setSelected(r); setModal('form') }
  const close = () => { setModal(null); setSelected(null) }
  const u = (k,v) => setForm(p=>({...p,[k]:v}))

  const save = async () => {
    setSaving(true)
    if (selected) {
      await supabase.from('outreach').update(form).eq('id',selected.id)
      await logAction(user?.username,user?.name,'outreach_updated',form.business_name,selected.id,{status:form.status})
    } else {
      const { data } = await supabase.from('outreach').insert([form]).select().single()
      await logAction(user?.username,user?.name,'outreach_added',form.business_name,data?.id,{status:form.status})
    }
    setSaving(false); close(); load()
  }

  const del = async r => {
    if (!confirm(`Delete ${r.business_name}?`)) return
    await supabase.from('outreach').delete().eq('id',r.id)
    await logAction(user?.username,user?.name,'outreach_deleted',r.business_name,r.id,{})
    load()
  }

  const exportCSV = () => {
    const h = ['Business','Contact','Phone','Email','Website','Status','Notes','Added By','Date']
    const rows = filtered.map(r => [r.business_name,r.contact_name,r.phone,r.email,r.website,r.status,r.notes,r.added_by,r.created_at].map(v=>`"${v||''}"`).join(','))
    const blob = new Blob([h.join(',')+'\n'+rows.join('\n')],{type:'text/csv'})
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='outreach.csv'; a.click()
  }

  const importCSV = async e => {
    const file = e.target.files[0]; if (!file) return
    const text = await file.text()
    const lines = text.split('\n').slice(1).filter(Boolean)
    const rows = lines.map(l => { const p=l.split(',').map(v=>v.replace(/^"|"$/g,'').trim()); return { business_name:p[0],contact_name:p[1],phone:p[2],email:p[3],website:p[4],status:p[5]||'Contacted',notes:p[6],added_by:user?.name||'' } })
    await supabase.from('outreach').insert(rows); load()
    e.target.value=''
  }

  const INP = { className: 'inp' }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Clients Contacted</h1>
          <p className="page-sub">{records.length} total records</p>
        </div>
        <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
          <button onClick={exportCSV} className="btn btn-outline btn-sm"><Download size={13} />Export</button>
          <button onClick={()=>fileRef.current?.click()} className="btn btn-outline btn-sm"><Upload size={13} />Import</button>
          <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={importCSV} />
          <button onClick={openAdd} className="btn btn-primary"><Plus size={14} />Add Contact</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center' }}>
        <div className="search-wrap" style={{ flex:1,minWidth:200 }}>
          <Search size={13} className="search-icon" />
          <input className="inp" style={{paddingLeft:36}} placeholder="Search by name, contact or email..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
          {['all',...STATUSES].map(s=>(
            <button key={s} onClick={()=>setFilter(s)} className={`filter-pill${filter===s?' active':''}`}>{s==='all'?'All':s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-center"><div className="spin"/></div> : filtered.length===0 ? (
          <div className="empty"><p>{search||filter!=='all'?'No matching records':'No outreach contacts yet'}</p></div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Added By</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r=>(
                  <tr key={r.id}>
                    <td className="text-main">{r.business_name}</td>
                    <td>{r.contact_name}</td>
                    <td>{r.email && <a href={`mailto:${r.email}`} style={{color:'var(--blue)',textDecoration:'none'}}>{r.email}</a>}</td>
                    <td>{r.phone}</td>
                    <td><span className={`badge badge-${STATUS_BADGE[r.status]||'grey'}`}>{r.status}</span></td>
                    <td>{r.added_by}</td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{new Date(r.created_at).toLocaleDateString('en-GB')}</span></td>
                    <td>
                      <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                        <button onClick={()=>openEdit(r)} className="btn btn-ghost btn-sm btn-icon"><Edit2 size={12}/></button>
                        <button onClick={()=>del(r)} className="btn btn-ghost btn-sm btn-icon" style={{color:'var(--red)'}}><Trash2 size={12}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal==='form' && (
        <Modal title={selected?'Edit Contact':'Add Contact'} onClose={close} footer={<><button onClick={close} className="btn btn-outline">Cancel</button><button onClick={save} disabled={saving} className="btn btn-primary">{saving?'Saving...':'Save'}</button></>}>
          <div className="form-grid">
            <div><label className="inp-label">Business Name *</label><input {...INP} value={form.business_name} onChange={e=>u('business_name',e.target.value)} /></div>
            <div><label className="inp-label">Contact Name</label><input {...INP} value={form.contact_name} onChange={e=>u('contact_name',e.target.value)} /></div>
            <div><label className="inp-label">Email</label><input {...INP} type="email" value={form.email} onChange={e=>u('email',e.target.value)} /></div>
            <div><label className="inp-label">Phone</label><input {...INP} value={form.phone} onChange={e=>u('phone',e.target.value)} /></div>
            <div><label className="inp-label">Website</label><input {...INP} value={form.website} onChange={e=>u('website',e.target.value)} /></div>
            <div><label className="inp-label">Status</label>
              <select className="inp" value={form.status} onChange={e=>u('status',e.target.value)}>
                {STATUSES.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-col"><label className="inp-label">Notes</label><textarea className="inp" rows={3} value={form.notes} onChange={e=>u('notes',e.target.value)} style={{resize:'vertical'}} /></div>
          </div>
        </div></div>)}
      )}
    
  )
}
