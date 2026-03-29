import { useState, useEffect, useRef } from 'react'
import { Upload, Check, FileCheck, ExternalLink } from 'lucide-react'
import { supabase } from '../../utils/supabase'
import { useMsal } from '@azure/msal-react'

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

export default function HRPolicies() {
  const { accounts } = useMsal()
  const me = accounts[0]
  const myEmail = me?.username?.toLowerCase()||''
  const [isAdmin, setIsAdmin] = useState(false)
  const [policies, setPolicies] = useState([])
  const [acks, setAcks] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ title:'',description:'',file:null })
  const [uploading, setUploading] = useState(false)
  const [acking, setAcking] = useState(null)
  const fileRef = useRef()

  useEffect(() => { checkRole() }, [myEmail])
  useEffect(() => { if (myEmail) { load(); loadAcks() } }, [myEmail])

  const checkRole = async () => {
    const { data } = await supabase.from('user_permissions').select('permissions').ilike('user_email',myEmail).maybeSingle()
    const p = data?.permissions; setIsAdmin(!p||p.admin===true)
  }
  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('hr_policies').select('*').order('created_at',{ascending:false})
    setPolicies(data||[]); setLoading(false)
  }
  const loadAcks = async () => {
    const { data } = await supabase.from('policy_acknowledgements').select('policy_id').ilike('user_email',myEmail)
    setAcks((data||[]).map(a=>a.policy_id))
  }

  const upload = async () => {
    if (!form.file||!form.title) return
    setUploading(true)
    const fileName = `policies/${Date.now()}-${form.file.name}`
    await supabase.storage.from('hr-documents').upload(fileName,form.file)
    const { data: urlData } = supabase.storage.from('hr-documents').getPublicUrl(fileName)
    await supabase.from('hr_policies').insert([{ title:form.title,description:form.description,file_url:urlData.publicUrl,file_path:fileName,uploaded_by:myEmail,created_at:new Date().toISOString() }])
    await load(); setUploading(false); setModal(false); setForm({title:'',description:'',file:null})
  }

  const acknowledge = async (policy) => {
    setAcking(policy.id)
    await supabase.from('policy_acknowledgements').insert([{ policy_id:policy.id,user_email:myEmail,user_name:me?.name||myEmail,acknowledged_at:new Date().toISOString() }])
    setAcks(p=>[...p,policy.id]); setAcking(null)
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Company Policies</h1>
          <p className="page-sub">{policies.length} policies · {acks.length} acknowledged</p>
        </div>
        {isAdmin && <button onClick={()=>setModal(true)} className="btn btn-primary"><Upload size={14}/>Upload Policy</button>}
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        {loading ? <div className="spin-center"><div className="spin"/></div> : policies.length===0 ? (
          <div className="empty"><FileCheck size={28} color="var(--faint)"/><p style={{marginTop:12}}>No policies uploaded yet</p></div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Policy</th><th>Description</th><th>Uploaded</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {policies.map(p=>{
                const acknowledged = acks.includes(p.id)
                return (
                  <tr key={p.id}>
                    <td className="text-main">{p.title}</td>
                    <td>{p.description}</td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{new Date(p.created_at).toLocaleDateString('en-GB')}</span></td>
                    <td>{acknowledged ? <span className="badge badge-green"><Check size={9}/>Acknowledged</span> : <span className="badge badge-amber">Pending</span>}</td>
                    <td>
                      <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                        <a href={p.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm"><ExternalLink size={11}/>View</a>
                        {!acknowledged && <button onClick={()=>acknowledge(p)} disabled={acking===p.id} className="btn btn-sm" style={{background:'var(--green-bg)',color:'var(--green)',border:'none'}}><Check size={11}/>Acknowledge</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal title="Upload Policy" onClose={()=>setModal(false)} footer={<><button onClick={()=>setModal(false)} className="btn btn-outline">Cancel</button><button onClick={upload} disabled={uploading||!form.file||!form.title} className="btn btn-primary">{uploading?'Uploading...':'Upload'}</button></>}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div><label className="inp-label">Policy Title *</label><input className="inp" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} /></div>
            <div><label className="inp-label">Description</label><textarea className="inp" rows={2} value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} style={{resize:'vertical'}} /></div>
            <div>
              <label className="inp-label">PDF File *</label>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button onClick={()=>fileRef.current?.click()} className="btn btn-outline btn-sm"><Upload size={12}/>Choose File</button>
                {form.file&&<span style={{fontSize:13,color:'var(--sub)'}}>{form.file.name}</span>}
              </div>
              <input ref={fileRef} type="file" accept=".pdf" style={{display:'none'}} onChange={e=>setForm(p=>({...p,file:e.target.files[0]}))} />
            </div>
          </div>
        </div></div>)}
      )}
    
  )
}
