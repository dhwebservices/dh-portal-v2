import { useState, useEffect } from 'react'
import { Plus, Check, X, Calendar } from 'lucide-react'
import { supabase } from '../../utils/supabase'
import { useMsal } from '@azure/msal-react'

const WORKER_URL = 'https://dh-email-worker.aged-silence-66a7.workers.dev'
const TYPES = ['Annual Leave','Sick Leave','Unpaid Leave','Compassionate Leave','Other']
const STATUS_BADGE = { pending:'amber', approved:'green', declined:'red' }

function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">{title}</span><button onClick={onClose} style={{background:'none',border:'none',color:'var(--faint)',cursor:'pointer',fontSize:20,lineHeight:1}}>×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
  )
}

export default function HRLeave() {
  const { accounts } = useMsal()
  const me = accounts[0]
  const myEmail = me?.username?.toLowerCase()||''
  const [isManager, setIsManager] = useState(false)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ type:'Annual Leave',start:'',end:'',reason:'' })
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState('mine')
  const [balance, setBalance] = useState(null)
  const [staffList, setStaffList] = useState([])
  const [onBehalf, setOnBehalf] = useState('')
  const [onBehalfName, setOnBehalfName] = useState('')

  useEffect(() => { checkRole() }, [myEmail])
  useEffect(() => { if (myEmail) { load(); loadBalance() } }, [view, myEmail])
  useEffect(() => { if (isManager) loadStaff() }, [isManager])

  const checkRole = async () => {
    const { data } = await supabase.from('user_permissions').select('permissions').ilike('user_email',myEmail).maybeSingle()
    const p = data?.permissions; setIsManager(!p||p.admin===true||p.hr_manage===true)
  }
  const loadBalance = async () => {
    const { data } = await supabase.from('leave_balances').select('*').ilike('user_email',myEmail).maybeSingle()
    setBalance(data)
  }
  const load = async () => {
    setLoading(true)
    let q = supabase.from('leave_requests').select('*').order('created_at',{ascending:false})
    if (view==='mine') q = q.ilike('user_email',myEmail)
    else if (view==='pending') q = q.eq('status','pending')
    const { data } = await q; setRequests(data||[]); setLoading(false)
  }
  const loadStaff = async () => {
    const { data } = await supabase.from('hr_profiles').select('user_email,full_name').order('full_name')
    setStaffList((data||[]).map(u=>({ email:u.user_email, name:u.full_name||u.user_email })))
  }

  const submit = async () => {
    setSaving(true)
    const email = isManager&&onBehalf ? onBehalf : myEmail
    const name = isManager&&onBehalf ? onBehalfName : me?.name||myEmail
    const days = Math.ceil((new Date(form.end)-new Date(form.start))/(1000*60*60*24))+1
    const { data } = await supabase.from('leave_requests').insert([{ user_email:email,user_name:name,type:form.type,start_date:form.start,end_date:form.end,days,reason:form.reason,status:'pending',created_at:new Date().toISOString() }]).select().single()
    try {
      await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'custom_email',data:{to:['david@dhwebsiteservices.co.uk'],from:'DH Website Services <noreply@dhwebsiteservices.co.uk>',subject:`Leave Request — ${name} (${days} day${days!==1?'s':''})`,html:`<div style="font-family:Arial,sans-serif;padding:24px"><h2>Leave Request</h2><p><strong>${name}</strong> has requested ${form.type} from ${form.start} to ${form.end} (${days} days).</p>${form.reason?`<p>Reason: ${form.reason}</p>`:''}</div>`}})})
    } catch(e) {}
    setSaving(false); setModal(false); setForm({type:'Annual Leave',start:'',end:'',reason:''}); setOnBehalf(''); load()
  }

  const decide = async (req, decision) => {
    await supabase.from('leave_requests').update({status:decision,decided_by:me?.name||myEmail,decided_at:new Date().toISOString()}).eq('id',req.id)
    try {
      await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'custom_email',data:{to:[req.user_email],from:'DH Website Services <noreply@dhwebsiteservices.co.uk>',subject:`Leave Request ${decision==='approved'?'Approved':'Declined'}`,html:`<div style="font-family:Arial,sans-serif;padding:24px"><h2>Leave Request ${decision==='approved'?'Approved ✓':'Declined ✗'}</h2><p>Your ${req.type} request from ${req.start_date} to ${req.end_date} has been <strong>${decision}</strong>.</p></div>`}})})
    } catch(e) {}
    load()
  }

  const totalDays = () => {
    if (!form.start||!form.end) return 0
    return Math.max(0,Math.ceil((new Date(form.end)-new Date(form.start))/(1000*60*60*24))+1)
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leave Management</h1>
          {balance && <p className="page-sub">{balance.annual_remaining||0} days remaining · {balance.sick_remaining||0} sick days remaining</p>}
        </div>
        <button onClick={()=>setModal(true)} className="btn btn-primary"><Plus size={14}/>Request Leave</button>
      </div>

      {/* Balance cards */}
      {balance && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:24}}>
          {[['Annual Leave',balance.annual_remaining||0,balance.annual_total||25,'var(--green)'],['Sick Days',balance.sick_remaining||0,balance.sick_total||10,'var(--amber)'],['Carried Over',balance.carried_over||0,null,'var(--blue)']].map(([l,val,total,c])=>(
            <div key={l} className="stat-card">
              <div className="stat-val" style={{color:c}}>{val}{total?`/${total}`:''}</div>
              <div className="stat-label">{l}</div>
            </div>
          ))}
        </div>
      )}

      {isManager && (
        <div className="tabs">
          {[['mine','My Requests'],['team','Team'],['pending','Pending Approval']].map(([k,l])=>(
            <button key={k} onClick={()=>setView(k)} className={`tab${view===k?' active':''}`}>{l}</button>
          ))}
        </div>
      )}

      <div className="card" style={{overflow:'hidden'}}>
        {loading ? <div className="spin-center"><div className="spin"/></div> : requests.length===0 ? (
          <div className="empty"><p>No leave requests</p></div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Staff</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th>{isManager&&view==='pending'&&<th></th>}</tr></thead>
            <tbody>
              {requests.map(r=>(
                <tr key={r.id}>
                  <td className="text-main">{r.user_name}</td>
                  <td>{r.type}</td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{r.start_date}</span></td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{r.end_date}</span></td>
                  <td>{r.days}</td>
                  <td><span className={`badge badge-${STATUS_BADGE[r.status]||'grey'}`} style={{textTransform:'capitalize'}}>{r.status}</span></td>
                  {isManager&&view==='pending'&&<td>
                    <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                      <button onClick={()=>decide(r,'approved')} className="btn btn-sm" style={{background:'var(--green-bg)',color:'var(--green)',border:'none'}}><Check size={12}/>Approve</button>
                      <button onClick={()=>decide(r,'declined')} className="btn btn-sm" style={{background:'var(--red-bg)',color:'var(--red)',border:'none'}}><X size={12}/>Decline</button>
                    </div>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal title="Request Leave" onClose={()=>setModal(false)} footer={<><button onClick={()=>setModal(false)} className="btn btn-outline">Cancel</button><button onClick={submit} disabled={saving||!form.start||!form.end} className="btn btn-primary">{saving?'Submitting...':'Submit Request'}</button></>}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {isManager && (
              <div>
                <label className="inp-label">On behalf of (optional)</label>
                <select className="inp" value={onBehalf} onChange={e=>{const s=staffList.find(x=>x.email===e.target.value);setOnBehalf(e.target.value);setOnBehalfName(s?.name||'')}}>
                  <option value="">Myself</option>
                  {staffList.map(s=><option key={s.email} value={s.email}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div><label className="inp-label">Leave Type</label>
              <select className="inp" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                {TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-grid">
              <div><label className="inp-label">Start Date</label><input className="inp" type="date" value={form.start} onChange={e=>setForm(p=>({...p,start:e.target.value}))} /></div>
              <div><label className="inp-label">End Date</label><input className="inp" type="date" value={form.end} onChange={e=>setForm(p=>({...p,end:e.target.value}))} /></div>
            </div>
            {form.start&&form.end&&<div style={{padding:'10px 14px',background:'var(--gold-bg)',borderRadius:8,fontSize:13,color:'var(--gold)'}}>Duration: {totalDays()} day{totalDays()!==1?'s':''}</div>}
            <div><label className="inp-label">Reason (optional)</label><textarea className="inp" rows={3} value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))} style={{resize:'vertical'}} /></div>
          </div>
        </div></div>)}
      )}
    
  )
}
