import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function HRPolicies() {
  const { user, can } = useAuth()
  const isManager = can('admin')
  const [policies, setPolicies]   = useState([])
  const [acks, setAcks]           = useState([])
  const [allAcks, setAllAcks]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')
  const [form, setForm]           = useState({ title:'', description:'' })
  const fileRef = useRef()

  const fileTypeLabel = (name = '') => {
    const ext = name.split('.').pop()?.toUpperCase()
    return ext ? `${ext} File` : 'Policy File'
  }

  useEffect(() => { load() }, [user?.email])
  const load = async () => {
    setLoading(true)
    const [{ data: p }, { data: a }, { data: all }] = await Promise.all([
      supabase.from('hr_policies').select('*').order('created_at',{ascending:false}),
      supabase.from('policy_acknowledgements').select('policy_id').ilike('user_email',user?.email||''),
      isManager ? supabase.from('policy_acknowledgements').select('policy_id,user_email,acknowledged_at') : Promise.resolve({ data: [] }),
    ])
    setPolicies(p||[])
    setAcks((a||[]).map(a=>a.policy_id))
    setAllAcks(all || [])
    setLoading(false)
  }

  const del = async (p) => {
    if (!confirm('Delete "'+p.title+'"? This cannot be undone.')) return
    if (p.file_path) await supabase.storage.from('hr-documents').remove([p.file_path]).catch(()=>{})
    await supabase.from('hr_policies').delete().eq('id', p.id)
    load()
  }

  const upload = async () => {
    if (!selectedFile) {
      setUploadError('Choose a PDF file first.')
      return
    }
    if (!form.title.trim()) {
      setUploadError('Enter a policy title before uploading.')
      return
    }
    setUploading(true)
    setUploadError('')
    setUploadSuccess('')
    const path = `policies/${Date.now()}-${selectedFile.name}`
    const { error } = await supabase.storage.from('hr-documents').upload(path, selectedFile, { upsert: false })
    if (!error) {
      const { data: urlData } = supabase.storage.from('hr-documents').getPublicUrl(path)
      const { error: insertError } = await supabase.from('hr_policies').insert([{
        title: form.title.trim(),
        description: form.description.trim(),
        file_url: urlData.publicUrl,
        file_path: path,
        uploaded_by: user?.name,
        created_at: new Date().toISOString(),
      }])
      if (insertError) {
        setUploadError(insertError.message || 'Could not save the policy record.')
      } else {
        setUploadSuccess(`Uploaded ${selectedFile.name}`)
        setForm({ title:'', description:'' })
        setSelectedFile(null)
        if (fileRef.current) fileRef.current.value = ''
        await load()
      }
    } else {
      setUploadError(error.message || 'Could not upload the PDF.')
    }
    setUploading(false)
  }

  const acknowledge = async (policyId) => {
    await supabase.from('policy_acknowledgements').insert([{ policy_id: policyId, user_email: user.email, user_name: user.name, acknowledged_at: new Date().toISOString() }])
    setAcks(p => [...p, policyId])
  }

  const summary = (() => {
    const outstanding = policies.filter((policy) => !acks.includes(policy.id)).length
    const ackByPolicy = allAcks.reduce((acc, item) => {
      acc[item.policy_id] = acc[item.policy_id] || 0
      acc[item.policy_id] += 1
      return acc
    }, {})
    return {
      total: policies.length,
      outstanding,
      acknowledged: policies.length - outstanding,
      leastRead: isManager ? policies
        .map((policy) => ({ policy, count: ackByPolicy[policy.id] || 0 }))
        .sort((a, b) => a.count - b.count)
        .slice(0, 3) : [],
      ackByPolicy,
    }
  })()

  return (
    <div className="fade-in">
      <div className="page-hd"><div><h1 className="page-title">HR Policies</h1><p className="page-sub">{policies.length} policies</p></div></div>

      <div className="dashboard-stat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:14, marginBottom:20 }}>
        <div className="stat-card"><div className="stat-val">{summary.total}</div><div className="stat-lbl">Policies</div></div>
        <div className="stat-card"><div className="stat-val">{summary.acknowledged}</div><div className="stat-lbl">{isManager ? 'With reads' : 'Acknowledged'}</div></div>
        <div className="stat-card"><div className="stat-val">{summary.outstanding}</div><div className="stat-lbl">{isManager ? 'Need attention' : 'Still to read'}</div></div>
      </div>

      {!isManager && summary.outstanding > 0 && (
        <div className="card card-pad" style={{ marginBottom:20, borderColor:'var(--amber)', background:'linear-gradient(180deg, var(--card), var(--amber-bg))' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)' }}>Action needed</div>
          <div style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginTop:6 }}>You still have {summary.outstanding} policy{summary.outstanding === 1 ? '' : 'ies'} to acknowledge.</div>
          <div style={{ fontSize:13, color:'var(--sub)', marginTop:6, lineHeight:1.6 }}>Open each policy below, review the PDF, and acknowledge it so your HR record stays current.</div>
        </div>
      )}

      {isManager && summary.leastRead.length > 0 && (
        <div className="card card-pad" style={{ marginBottom:20 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)', marginBottom:10 }}>Coverage snapshot</div>
          <div style={{ display:'grid', gap:10 }}>
            {summary.leastRead.map(({ policy, count }) => (
              <div key={policy.id} style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{policy.title}</div>
                  <div style={{ fontSize:12, color:'var(--sub)', marginTop:3 }}>{policy.description || 'No description provided.'}</div>
                </div>
                <span className={`badge badge-${count === 0 ? 'red' : count < 2 ? 'amber' : 'green'}`}>{count} acknowledgements</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isManager && (
        <div className="card card-pad" style={{ marginBottom:20, maxWidth:480 }}>
          <div className="lbl" style={{ marginBottom:12 }}>Upload Policy</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div><label className="lbl">Title</label><input className="inp" value={form.title} onChange={e=>{ setForm(p=>({...p,title:e.target.value})); if (uploadError) setUploadError('') }} placeholder="e.g. Remote Working Policy"/></div>
            <div><label className="lbl">Description</label><input className="inp" value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="Short description..."/></div>
            <input
              type="file"
              accept=".pdf,application/pdf"
              ref={fileRef}
              style={{ display:'none' }}
              onChange={e => {
                const file = e.target.files?.[0] || null
                setSelectedFile(file)
                setUploadError('')
                setUploadSuccess('')
              }}
            />
            <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
              <button className="btn btn-outline" type="button" onClick={()=>fileRef.current?.click()} disabled={uploading}>
                {selectedFile ? 'Change PDF' : 'Choose PDF'}
              </button>
              <button className="btn btn-primary" type="button" onClick={upload} disabled={uploading || !selectedFile}>
                {uploading ? 'Uploading...' : 'Upload PDF'}
              </button>
            </div>
            <div style={{ fontSize:12, color:selectedFile ? 'var(--text)' : 'var(--sub)' }}>
              {selectedFile ? `Selected: ${selectedFile.name}` : 'No PDF selected yet.'}
            </div>
            {uploadError ? <div style={{ fontSize:12, color:'var(--red)' }}>{uploadError}</div> : null}
            {uploadSuccess ? <div style={{ fontSize:12, color:'var(--green)' }}>{uploadSuccess}</div> : null}
          </div>
        </div>
      )}

      {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {policies.length===0 && <div className="empty"><p>No policies uploaded yet</p></div>}
          {policies.map(p => {
            const acknowledged = acks.includes(p.id)
            const ackCount = summary.ackByPolicy[p.id] || 0
            return (
              <div key={p.id} className="card card-pad" style={{ display:'grid', gap:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'flex-start', flexWrap:'wrap' }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:600, marginBottom:4, color:'var(--text)' }}>{p.title}</div>
                    {p.description && <div style={{ fontSize:13, color:'var(--sub)', lineHeight:1.55 }}>{p.description}</div>}
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    <span className="badge badge-blue">{fileTypeLabel(p.file_path || p.file_url || p.title)}</span>
                    <span className="badge badge-grey">Uploaded {new Date(p.created_at).toLocaleDateString('en-GB')}</span>
                    {isManager ? <span className={`badge badge-${ackCount === 0 ? 'red' : ackCount < 2 ? 'amber' : 'green'}`}>{ackCount} acknowledgements</span> : null}
                    {!isManager ? (
                      acknowledged
                        ? <span className="badge badge-green">Acknowledged</span>
                        : <span className="badge badge-amber">Needs acknowledgement</span>
                    ) : null}
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'center', flexWrap:'wrap', paddingTop:10, borderTop:'1px solid var(--border)' }}>
                  <div style={{ display:'grid', gap:4 }}>
                    <div style={{ fontSize:12, color:'var(--sub)' }}>
                      Uploaded by <strong style={{ color:'var(--text)', fontWeight:600 }}>{p.uploaded_by || 'Unknown uploader'}</strong>
                    </div>
                    <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>
                      {p.file_path || 'Stored in HR documents'}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>
                    <a href={p.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Open PDF</a>
                  {isManager && (
                    <button className="btn btn-danger btn-sm" onClick={() => del(p)}>Delete</button>
                  )}
                  {!isManager && (acknowledged
                    ? <span className="badge badge-green">✓ Acknowledged</span>
                    : <button className="btn btn-primary btn-sm" onClick={()=>acknowledge(p.id)}>Acknowledge</button>
                  )}
                </div>
              </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
