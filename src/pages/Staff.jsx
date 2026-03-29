import { useState, useEffect } from 'react'
import { Plus, TrendingUp, Clock, CheckCircle, UserCog, Edit2 } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { logAction } from '../utils/audit'
import { useMsal } from '@azure/msal-react'

const EMPTY = { name:'', email:'', role:'Outreach Specialist', commission_rate:15, status:'active' }

function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--faint)',cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
  )
}

export default function Staff() {
  const { accounts } = useMsal()
  const user = accounts[0]
  const [staff, setStaff] = useState([])
  const [commissions, setCommissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('staff')

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from('staff').select('*').order('created_at',{ascending:false}),
      supabase.from('commissions').select('*').order('created_at',{ascending:false}),
    ])
    setStaff(s||[]); setCommissions(c||[]); setLoading(false)
  }

  const openAdd  = () => { setForm(EMPTY); setSelected(null); setModal('form') }
  const openEdit = s  => { setSelected(s); setForm({...s}); setModal('form') }
  const close    = () => { setModal(null); setSelected(null) }
  const u = (k,v) => setForm(p=>({...p,[k]:v}))

  const save = async () => {
    setSaving(true)
    if (!selected) {
      await supabase.from('staff').insert([{...form,total_earned:0,pending_payout:0,sales_count:0}])
      await logAction(user?.username,user?.name,'staff_added',form.name,null,{name:form.name,role:form.role})
    } else {
      await supabase.from('staff').update(form).eq('id',selected.id)
      await logAction(user?.username,user?.name,'staff_updated',form.name,selected.id,{name:form.name})
    }
    await loadAll(); setSaving(false); close()
  }

  const markPaid = async (id, comm) => {
    await supabase.from('commissions').update({status:'paid'}).eq('id',id)
    await logAction(user?.username,user?.name,'commission_paid',comm.staff_name,id,{amount:comm.commission_amount})
    loadAll()
  }

  const totalPending = commissions.filter(c=>c.status==='pending').reduce((s,c)=>s+Number(c.commission_amount||0),0)
  const totalPaid    = commissions.filter(c=>c.status==='paid').reduce((s,c)=>s+Number(c.commission_amount||0),0)

  return (
    <div className="fade-in">
      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:16,marginBottom:24}}>
        {[
          {icon:TrendingUp, label:'Total Paid Out',   val:`£${totalPaid.toFixed(2)}`,    color:'var(--green)'},
          {icon:Clock,      label:'Pending Payout',   val:`£${totalPending.toFixed(2)}`, color:'var(--amber)'},
          {icon:CheckCircle,label:'Active Staff',     val:staff.filter(s=>s.status==='active').length, color:'var(--gold)'},
        ].map(({icon:Icon,label,val,color})=>(
          <div key={label} className="stat-card">
            <div style={{width:32,height:32,borderRadius:8,background:`${color}18`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:12}}>
              <Icon size={15} color={color}/>
            </div>
            <div className="stat-val" style={{color}}>{val}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab${tab==='staff'?' active':''}`} onClick={()=>setTab('staff')}>Staff Members</button>
        <button className={`tab${tab==='commissions'?' active':''}`} onClick={()=>setTab('commissions')}>Commissions</button>
      </div>

      {/* Staff tab */}
      {tab==='staff' && (
        <>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:14}}>
            <button className="btn btn-primary" onClick={openAdd}><Plus size={13}/>Add Staff Member</button>
          </div>
          <div className="card" style={{overflow:'hidden'}}>
            {loading ? <div className="spin-center"><div className="spin"/></div>
            : staff.length===0 ? (
              <div className="empty">
                <UserCog size={28} color="var(--faint)" style={{margin:'0 auto 12px'}}/>
                <p>No staff members yet</p>
                <button className="btn btn-primary" style={{margin:'16px auto 0'}} onClick={openAdd}><Plus size={13}/>Add First Staff Member</button>
              </div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Name</th><th>Email</th><th>Commission</th><th>Sales</th><th>Total Earned</th><th>Pending</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {staff.map(s=>(
                    <tr key={s.id} style={{cursor:'pointer'}} onClick={()=>openEdit(s)}>
                      <td className="text-main">{s.name}<div style={{fontSize:11,color:'var(--faint)',marginTop:2}}>{s.role}</div></td>
                      <td style={{fontSize:13}}>{s.email}</td>
                      <td><span style={{color:'var(--gold)',fontWeight:700}}>{s.commission_rate}%</span></td>
                      <td>{s.sales_count||0}</td>
                      <td><span style={{color:'var(--green)',fontWeight:700}}>£{Number(s.total_earned||0).toFixed(2)}</span></td>
                      <td>{Number(s.pending_payout)>0 ? <span style={{color:'var(--amber)',fontWeight:700}}>£{Number(s.pending_payout).toFixed(2)}</span> : <span style={{color:'var(--faint)'}}>—</span>}</td>
                      <td><span className={`badge badge-${s.status==='active'?'green':'grey'}`} style={{textTransform:'capitalize'}}>{s.status}</span></td>
                      <td onClick={e=>e.stopPropagation()}><button className="btn btn-ghost btn-sm btn-icon" onClick={()=>openEdit(s)}><Edit2 size={12}/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Commissions tab */}
      {tab==='commissions' && (
        <div className="card" style={{overflow:'hidden'}}>
          {commissions.length===0 ? (
            <div className="empty"><p>No commissions yet. They appear once clients are signed and invoices paid.</p></div>
          ) : (
            <table className="tbl">
              <thead><tr><th>Staff</th><th>Client</th><th>Sale Value</th><th>Commission</th><th>Date</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {commissions.map(c=>(
                  <tr key={c.id}>
                    <td className="text-main">{c.staff_name}</td>
                    <td>{c.client}</td>
                    <td><span style={{fontWeight:600}}>£{c.sale_value}</span></td>
                    <td><span style={{color:'var(--green)',fontWeight:700}}>£{Number(c.commission_amount||0).toFixed(2)}</span></td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{c.date}</span></td>
                    <td><span className={`badge badge-${c.status==='paid'?'green':'amber'}`} style={{textTransform:'capitalize'}}>{c.status}</span></td>
                    <td>{c.status==='pending' && <button className="btn btn-sm" style={{background:'var(--green-bg)',color:'var(--green)',border:'none'}} onClick={()=>markPaid(c.id,c)}><CheckCircle size={12}/>Mark Paid</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Form modal */}
      {(!!modal) && (<div className="modal-backdrop" onClick={close}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><span className="modal-title">{selected?'Edit Staff Member':'Add Staff Member'}</span><button onClick={close} style={{background:"none",border:"none",color:"var(--faint)",cursor:"pointer",fontSize:20,lineHeight:1}}>×</button></div><div className="modal-body">
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className="form-grid">
            <div><label className="inp-label">Full Name</label><input className="inp" value={form.name} onChange={e=>u('name',e.target.value)} placeholder="Jane Smith" /></div>
            <div><label className="inp-label">Email</label><input className="inp" type="email" value={form.email} onChange={e=>u('email',e.target.value)} placeholder="jane@dhwebsiteservices.co.uk" /></div>
            <div><label className="inp-label">Role</label>
              <select className="inp" value={form.role} onChange={e=>u('role',e.target.value)}>
                <option>Senior Outreach Lead</option>
                <option>Outreach Specialist</option>
                <option>Client Success</option>
              </select>
            </div>
            <div><label className="inp-label">Commission Rate (%)</label><input className="inp" type="number" value={form.commission_rate} onChange={e=>u('commission_rate',Number(e.target.value))} /></div>
            <div><label className="inp-label">Status</label>
              <select className="inp" value={form.status} onChange={e=>u('status',e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div style={{padding:'12px 14px',background:'var(--gold-bg)',border:'1px solid var(--gold-border)',borderRadius:8,fontSize:13,color:'var(--sub)',lineHeight:1.6}}>
            Staff are <strong style={{color:'var(--text)'}}>self-employed contractors</strong> — not PAYE employees. Commission is paid only after client invoice is confirmed received.
          </div>
          <div className="modal-footer" style={{padding:0,marginTop:4}}>
            <button className="btn btn-outline" onClick={close}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':selected?'Save Changes':'Add Staff'}</button>
          </div>
        </div>
      </div></div></div>)}
    </div>
  )
}
