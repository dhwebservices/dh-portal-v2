import { useState, useEffect, useRef } from 'react'
import { Upload, Download, FileText, Plus } from 'lucide-react'
import { supabase } from '../../utils/supabase'
import { useMsal } from '@azure/msal-react'

const WORKER_URL = 'https://dh-email-worker.aged-silence-66a7.workers.dev'

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

export default function HRPayslips() {
  const { accounts, instance } = useMsal()
  const me = accounts[0]
  const myEmail = me?.username?.toLowerCase()||''
  const [isAdmin, setIsAdmin] = useState(false)
  const [payslips, setPayslips] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ user_email:'',user_name:'',period:'',file:null })
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  useEffect(() => { checkRole() }, [myEmail])
  useEffect(() => { if (myEmail) { load(); if (isAdmin) loadUsers() } }, [myEmail, isAdmin])

  const checkRole = async () => {
    const { data } = await supabase.from('user_permissions').select('permissions').ilike('user_email',myEmail).maybeSingle()
    const p = data?.permissions; setIsAdmin(!p||p.admin===true)
  }
  const load = async () => {
    setLoading(true)
    let q = supabase.from('payslips').select('*').order('period',{ascending:false})
    if (!isAdmin) q = q.ilike('user_email',myEmail)
    const { data } = await q; setPayslips(data||[]); setLoading(false)
  }
  const loadUsers = async () => {
    try {
      const token = (await instance.acquireTokenSilent({scopes:['https://graph.microsoft.com/User.Read.All'],account:me})).accessToken
      const r = await fetch('https://graph.microsoft.com/v1.0/users?$select=displayName,userPrincipalName&$top=50',{headers:{Authorization:`Bearer ${token}`}})
      const d = await r.json(); setUsers(d.value||[])
    } catch { setUsers([]) }
  }

  const upload = async () => {
    if (!form.file||!form.user_email||!form.period) return
    setUploading(true)
    const fileName = `payslips/${form.user_email}/${form.period}-${Date.now()}.pdf`
    const { error } = await supabase.storage.from('hr-documents').upload(fileName,form.file)
    if (error) { console.error(error); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('hr-documents').getPublicUrl(fileName)
    const usr = users.find(u=>u.userPrincipalName===form.user_email)
    await supabase.from('payslips').insert([{ user_email:form.user_email,user_name:usr?.displayName||form.user_email,period:form.period,file_url:urlData.publicUrl,file_path:fileName,uploaded_by:myEmail,uploaded_at:new Date().toISOString(),viewed:false }])
    try {
      await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'custom_email',data:{to:[form.user_email],from:'DH Website Services <noreply@dhwebsiteservices.co.uk>',subject:`Your Payslip is Ready — ${form.period}`,html:`<div style="font-family:Arial,sans-serif;padding:24px"><h2>Your payslip is ready</h2><p>Your payslip for <strong>${form.period}</strong> is now available in the staff portal under HR → Payslips.</p></div>`}})})
    } catch(e) {}
    await load(); setUploading(false); setModal(false); setForm({user_email:'',user_name:'',period:'',file:null})
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payslips</h1>
          <p className="page-sub">{payslips.length} {isAdmin?'total':'your'} payslips</p>
        </div>
        {isAdmin && <button onClick={()=>setModal(true)} className="btn btn-primary"><Upload size={14}/>Upload Payslip</button>}
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        {loading ? <div className="spin-center"><div className="spin"/></div> : payslips.length===0 ? (
          <div className="empty"><FileText size={28} color="var(--faint)" /><p style={{marginTop:12}}>No payslips yet</p></div>
        ) : (
          <table className="tbl">
            <thead><tr>{isAdmin&&<th>Staff Member</th>}<th>Period</th><th>Uploaded</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {payslips.map(p=>(
                <tr key={p.id}>
                  {isAdmin&&<td className="text-main">{p.user_name||p.user_email}</td>}
                  <td className="text-main">{p.period}</td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{new Date(p.uploaded_at).toLocaleDateString('en-GB')}</span></td>
                  <td>{p.viewed ? <span className="badge badge-grey">Viewed</span> : <span className="badge badge-gold">New</span>}</td>
                  <td><a href={p.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" onClick={async()=>{await supabase.from('payslips').update({viewed:true}).eq('id',p.id)}}><Download size={12}/>Download</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal title="Upload Payslip" onClose={()=>setModal(false)} footer={<><button onClick={()=>setModal(false)} className="btn btn-outline">Cancel</button><button onClick={upload} disabled={uploading||!form.file||!form.user_email||!form.period} className="btn btn-primary">{uploading?'Uploading...':'Upload & Notify'}</button></>}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div><label className="inp-label">Staff Member</label>
              <select className="inp" value={form.user_email} onChange={e=>setForm(p=>({...p,user_email:e.target.value}))}>
                <option value="">Select staff member...</option>
                {users.map(u=><option key={u.userPrincipalName} value={u.userPrincipalName}>{u.displayName}</option>)}
              </select>
            </div>
            <div><label className="inp-label">Pay Period (e.g. March 2026)</label><input className="inp" value={form.period} onChange={e=>setForm(p=>({...p,period:e.target.value}))} placeholder="March 2026" /></div>
            <div>
              <label className="inp-label">PDF File</label>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button onClick={()=>fileRef.current?.click()} className="btn btn-outline btn-sm"><Upload size={12}/>Choose PDF</button>
                {form.file&&<span style={{fontSize:13,color:'var(--sub)'}}>{form.file.name}</span>}
              </div>
              <input ref={fileRef} type="file" accept=".pdf" style={{display:'none'}} onChange={e=>setForm(p=>({...p,file:e.target.files[0]}))} />
            </div>
          </div>
        </div></div>)}
      )}
    
  )
}
