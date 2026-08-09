import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Button, FormField, FormLabel, FormInput, StatusBadge, Alert } from '../../components/ds'

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

  const cardStyle = { background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)' }
  const ackVariant = (count) => count === 0 ? 'error' : count < 2 ? 'warning' : 'active'

  return (
    <div className="ds-content">
      <div className="ds-page-header"><div><h1>HR Policies</h1><p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>{policies.length} policies</p></div></div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:14, marginBottom:20 }}>
        <div style={{ ...cardStyle, padding:20 }}><div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{summary.total}</div><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Policies</div></div>
        <div style={{ ...cardStyle, padding:20 }}><div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{summary.acknowledged}</div><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>{isManager ? 'With reads' : 'Acknowledged'}</div></div>
        <div style={{ ...cardStyle, padding:20 }}><div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{summary.outstanding}</div><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>{isManager ? 'Need attention' : 'Still to read'}</div></div>
      </div>

      {!isManager && summary.outstanding > 0 && (
        <div style={{ marginBottom:20 }}>
          <Alert variant="warning">
            <div style={{ fontSize:15, fontWeight:600 }}>You still have {summary.outstanding} policy{summary.outstanding === 1 ? '' : 'ies'} to acknowledge.</div>
            <div style={{ fontSize:13, marginTop:6, lineHeight:1.6 }}>Open each policy below, review the PDF, and acknowledge it so your HR record stays current.</div>
          </Alert>
        </div>
      )}

      {isManager && summary.leastRead.length > 0 && (
        <div style={{ ...cardStyle, padding:20, marginBottom:20 }}>
          <div style={{ fontSize:11, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--color-text-tertiary)', marginBottom:10 }}>Coverage snapshot</div>
          <div style={{ display:'grid', gap:10 }}>
            {summary.leastRead.map(({ policy, count }) => (
              <div key={policy.id} style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--color-border)' }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--color-text-primary)' }}>{policy.title}</div>
                  <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:3 }}>{policy.description || 'No description provided.'}</div>
                </div>
                <StatusBadge variant={ackVariant(count)}>{count} acknowledgements</StatusBadge>
              </div>
            ))}
          </div>
        </div>
      )}

      {isManager && (
        <div style={{ ...cardStyle, padding:20, marginBottom:20, maxWidth:480 }}>
          <div style={{ fontSize:14, fontWeight:500, color:'var(--color-text-primary)', marginBottom:12 }}>Upload Policy</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <FormField><FormLabel>Title</FormLabel><FormInput value={form.title} onChange={e=>{ setForm(p=>({...p,title:e.target.value})); if (uploadError) setUploadError('') }} placeholder="e.g. Remote Working Policy"/></FormField>
            <FormField><FormLabel>Description</FormLabel><FormInput value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="Short description..."/></FormField>
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
              <Button variant="secondary" type="button" onClick={()=>fileRef.current?.click()} disabled={uploading}>
                {selectedFile ? 'Change PDF' : 'Choose PDF'}
              </Button>
              <Button variant="primary" type="button" onClick={upload} disabled={uploading || !selectedFile}>
                {uploading ? 'Uploading...' : 'Upload PDF'}
              </Button>
            </div>
            <div style={{ fontSize:12, color:selectedFile ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
              {selectedFile ? `Selected: ${selectedFile.name}` : 'No PDF selected yet.'}
            </div>
            {uploadError ? <div style={{ fontSize:12, color:'var(--color-red-500)' }}>{uploadError}</div> : null}
            {uploadSuccess ? <div style={{ fontSize:12, color:'var(--color-green-500)' }}>{uploadSuccess}</div> : null}
          </div>
        </div>
      )}

      {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {policies.length===0 && <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No policies uploaded yet</div>}
          {policies.map(p => {
            const acknowledged = acks.includes(p.id)
            const ackCount = summary.ackByPolicy[p.id] || 0
            return (
              <div key={p.id} style={{ ...cardStyle, padding:20, display:'grid', gap:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'flex-start', flexWrap:'wrap' }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:600, marginBottom:4, color:'var(--color-text-primary)' }}>{p.title}</div>
                    {p.description && <div style={{ fontSize:13, color:'var(--color-text-secondary)', lineHeight:1.55 }}>{p.description}</div>}
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    <StatusBadge variant="info">{fileTypeLabel(p.file_path || p.file_url || p.title)}</StatusBadge>
                    <StatusBadge variant="info">Uploaded {new Date(p.created_at).toLocaleDateString('en-GB')}</StatusBadge>
                    {isManager ? <StatusBadge variant={ackVariant(ackCount)}>{ackCount} acknowledgements</StatusBadge> : null}
                    {!isManager ? (
                      acknowledged
                        ? <StatusBadge variant="active">Acknowledged</StatusBadge>
                        : <StatusBadge variant="warning">Needs acknowledgement</StatusBadge>
                    ) : null}
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'center', flexWrap:'wrap', paddingTop:10, borderTop:'1px solid var(--color-border)' }}>
                  <div style={{ display:'grid', gap:4 }}>
                    <div style={{ fontSize:12, color:'var(--color-text-secondary)' }}>
                      Uploaded by <strong style={{ color:'var(--color-text-primary)', fontWeight:600 }}>{p.uploaded_by || 'Unknown uploader'}</strong>
                    </div>
                    <div style={{ fontSize:11, color:'var(--color-text-tertiary)', fontFamily:'var(--font-mono)' }}>
                      {p.file_path || 'Stored in HR documents'}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>
                    <Button variant="secondary" onClick={() => window.open(p.file_url, '_blank', 'noreferrer')}>Open PDF</Button>
                  {isManager && (
                    <Button variant="secondary" style={{ color:'var(--color-red-500)' }} onClick={() => del(p)}>Delete</Button>
                  )}
                  {!isManager && (acknowledged
                    ? <StatusBadge variant="active">✓ Acknowledged</StatusBadge>
                    : <Button variant="primary" onClick={()=>acknowledge(p.id)}>Acknowledge</Button>
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
