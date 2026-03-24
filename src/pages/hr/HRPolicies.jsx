import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function HRPolicies() {
  const { user, can } = useAuth()
  const isManager = can('admin')
  const [policies, setPolicies]   = useState([])
  const [acks, setAcks]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [form, setForm]           = useState({ title:'', description:'' })
  const fileRef = useRef()

  useEffect(() => { load() }, [user?.email])
  const load = async () => {
    setLoading(true)
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from('hr_policies').select('*').order('created_at',{ascending:false}),
      supabase.from('policy_acknowledgements').select('policy_id').ilike('user_email',user?.email||''),
    ])
    setPolicies(p||[])
    setAcks((a||[]).map(a=>a.policy_id))
    setLoading(false)
  }

  const del = async (p) => {
    if (!confirm('Delete "'+p.title+'"? This cannot be undone.')) return
    if (p.file_path) await supabase.storage.from('hr-documents').remove([p.file_path]).catch(()=>{})
    await supabase.from('hr_policies').delete().eq('id', p.id)
    load()
  }

  const upload = async (file) => {
    if (!file || !form.title) return
    setUploading(true)
    const path = `policies/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('hr-documents').upload(path, file)
    if (!error) {
      const { data: urlData } = supabase.storage.from('hr-documents').getPublicUrl(path)
      await supabase.from('hr_policies').insert([{ title: form.title, description: form.description, file_url: urlData.publicUrl, file_path: path, uploaded_by: user?.name, created_at: new Date().toISOString() }])
      setForm({ title:'', description:'' }); load()
    }
    setUploading(false)
  }

  const acknowledge = async (policyId) => {
    await supabase.from('policy_acknowledgements').insert([{ policy_id: policyId, user_email: user.email, user_name: user.name, acknowledged_at: new Date().toISOString() }])
    setAcks(p => [...p, policyId])
  }

  return (
    <div className="fade-in">
      <div className="page-hd"><div><h1 className="page-title">HR Policies</h1><p className="page-sub">{policies.length} policies</p></div></div>

      {isManager && (
        <div className="card card-pad" style={{ marginBottom:20, maxWidth:480 }}>
          <div className="lbl" style={{ marginBottom:12 }}>Upload Policy</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div><label className="lbl">Title</label><input className="inp" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="e.g. Remote Working Policy"/></div>
            <div><label className="lbl">Description</label><input className="inp" value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="Short description..."/></div>
            <input type="file" accept=".pdf" ref={fileRef} style={{ display:'none' }} onChange={e=>upload(e.target.files[0])}/>
            <button className="btn btn-primary" style={{ alignSelf:'flex-start' }} onClick={()=>fileRef.current?.click()} disabled={uploading}>{uploading?'Uploading...':'Upload PDF'}</button>
          </div>
        </div>
      )}

      {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {policies.length===0 && <div className="empty"><p>No policies uploaded yet</p></div>}
          {policies.map(p => {
            const acknowledged = acks.includes(p.id)
            return (
              <div key={p.id} className="card card-pad" style={{ display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, marginBottom:3 }}>{p.title}</div>
                  {p.description && <div style={{ fontSize:13, color:'var(--sub)', marginBottom:4 }}>{p.description}</div>}
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)' }}>Uploaded {new Date(p.created_at).toLocaleDateString('en-GB')}</div>
                </div>
                <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                  <a href={p.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">View PDF</a>
                  {isManager && (
                    <button className="btn btn-danger btn-sm" onClick={() => del(p)}>Delete</button>
                  )}
                  {!isManager && (acknowledged
                    ? <span className="badge badge-green">✓ Acknowledged</span>
                    : <button className="btn btn-primary btn-sm" onClick={()=>acknowledge(p.id)}>Acknowledge</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
