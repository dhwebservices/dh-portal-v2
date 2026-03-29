import { useState, useEffect } from 'react'
import { Check, X, Eye } from 'lucide-react'
import { supabase } from '../../utils/supabase'
import { useMsal } from '@azure/msal-react'

const WORKER_URL = 'https://dh-email-worker.aged-silence-66a7.workers.dev'
const STATUS_BADGE = { submitted:'amber', in_progress:'blue', approved:'green', declined:'red' }

function Field({ label, value }) {
  return (
    <div>
      <div style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--faint)',marginBottom:3}}>{label}</div>
      <div style={{fontSize:13.5,color:value?'var(--text)':'var(--faint)'}}>{value||'—'}</div>
  )
}

export default function HROnboarding() {
  const { accounts } = useMsal()
  const me = accounts[0]
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [modal, setModal] = useState(false)
  const [users, setUsers] = useState([])
  const [manager, setManager] = useState('')
  const [acting, setActing] = useState(false)
  const [view, setView] = useState('pending')

  useEffect(() => { load() }, [view])
  useEffect(() => { loadUsers() }, [])

  const load = async () => {
    setLoading(true)
    const statuses = view==='pending' ? ['submitted','in_progress'] : view==='approved' ? ['approved'] : ['declined']
    const { data: submissions } = await supabase.from('onboarding_submissions').select('*').in('status',statuses).order('created_at',{ascending:false})
    if (view==='pending') {
      const { data: flagged } = await supabase.from('user_permissions').select('user_email').eq('onboarding',true)
      const emails = new Set((submissions||[]).map(s=>s.user_email?.toLowerCase()))
      const extra = (flagged||[]).filter(r=>!emails.has(r.user_email?.toLowerCase())).map(r=>({ user_email:r.user_email,user_name:r.user_email,status:'in_progress',submitted_at:null }))
      setItems([...(submissions||[]),...extra])
    } else { setItems(submissions||[]) }
    setLoading(false)
  }

  const loadUsers = async () => {
    const { data } = await supabase.from('hr_profiles').select('user_email,full_name,role,department').order('full_name')
    setUsers(data||[])
  }

  const openItem = item => { setSelected(item); setManager(item.manager||''); setModal(true) }

  const approve = async () => {
    setActing(true)
    await supabase.from('onboarding_submissions').update({ status:'approved',manager,decided_by:me?.name||me?.username,decided_at:new Date().toISOString() }).eq('id',selected.id)
    await supabase.from('user_permissions').update({ onboarding:false }).ilike('user_email',selected.user_email)
    try { await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'custom_email',data:{to:[selected.user_email],from:'DH Website Services <noreply@dhwebsiteservices.co.uk>',subject:'Onboarding Approved — Welcome to the Team!',html:`<div style="font-family:Arial,sans-serif;padding:24px"><h2>Onboarding Approved</h2><p>Welcome to the team! Your onboarding has been approved. You now have full access to the staff portal.</p></div>`}})}) } catch(e) {}
    setActing(false); setModal(false); load()
  }

  const decline = async () => {
    setActing(true)
    await supabase.from('onboarding_submissions').update({ status:'declined',decided_by:me?.name||me?.username,decided_at:new Date().toISOString() }).eq('id',selected.id)
    try { await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'custom_email',data:{to:[selected.user_email],from:'DH Website Services <noreply@dhwebsiteservices.co.uk>',subject:'Onboarding — Action Required',html:`<div style="font-family:Arial,sans-serif;padding:24px"><h2>Onboarding Requires Attention</h2><p>Your onboarding submission has been flagged. Please contact your manager for next steps.</p></div>`}})}) } catch(e) {}
    setActing(false); setModal(false); load()
  }

  const counts = { pending:0, approved:0, declined:0 }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Onboarding</h1>
          <p className="page-sub">{items.length} {view} submissions</p>
        </div>
      </div>

      <div className="tabs">
        {[['pending','Pending Review'],['approved','Approved'],['declined','Declined']].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)} className={`tab${view===k?' active':''}`}>{l}</button>
        ))}
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        {loading ? <div className="spin-center"><div className="spin"/></div> : items.length===0 ? (
          <div className="empty"><p>No {view} submissions</p></div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Staff Member</th><th>Email</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.map((item,i)=>(
                <tr key={item.id||i}>
                  <td className="text-main">{item.user_name||item.user_email}</td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{item.user_email}</span></td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{item.submitted_at ? new Date(item.submitted_at).toLocaleDateString('en-GB') : '—'}</span></td>
                  <td><span className={`badge badge-${STATUS_BADGE[item.status]||'grey'}`} style={{textTransform:'capitalize'}}>{item.status?.replace('_',' ')}</span></td>
                  <td>
                    <button onClick={()=>openItem(item)} className="btn btn-outline btn-sm"><Eye size={11}/>Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && selected && (
        <div className="modal-backdrop" onClick={()=>setModal(false)}>
          <div className="modal" style={{maxWidth:640}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Onboarding — {selected.user_name||selected.user_email}</span>
              <button onClick={()=>setModal(false)} style={{background:'none',border:'none',color:'var(--faint)',cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
            </div>
            <div className="modal-body">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
                <Field label="Full Name" value={selected.full_name} />
                <Field label="Email" value={selected.user_email} />
                <Field label="Phone" value={selected.phone} />
                <Field label="Personal Email" value={selected.personal_email} />
                <Field label="Address" value={selected.address} />
                <Field label="Start Date" value={selected.start_date} />
                <Field label="Emergency Contact" value={selected.emergency_contact} />
                <Field label="Emergency Phone" value={selected.emergency_phone} />
              </div>
              {selected.right_to_work && (
                <div style={{padding:'12px 16px',background:'var(--bg2)',borderRadius:8,marginBottom:16}}>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--faint)',marginBottom:4}}>Right to Work</div>
                  <div style={{fontSize:13.5}}>{selected.right_to_work}</div>
                </div>
              )}
              {view==='pending' && (
                <div>
                  <label className="inp-label">Assign Manager</label>
                  <select className="inp" value={manager} onChange={e=>setManager(e.target.value)}>
                    <option value="">Select manager...</option>
                    {users.map(u=><option key={u.user_email} value={u.full_name||u.user_email}>{u.full_name||u.user_email}</option>)}
                  </select>
                </div>
              )}
            </div>
            {view==='pending' && (
              <div className="modal-footer">
                <button onClick={()=>setModal(false)} className="btn btn-outline">Cancel</button>
                <button onClick={decline} disabled={acting} className="btn btn-danger"><X size={13}/>Decline</button>
                <button onClick={approve} disabled={acting} className="btn btn-primary"><Check size={13}/>{acting?'Saving...':'Approve'}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
