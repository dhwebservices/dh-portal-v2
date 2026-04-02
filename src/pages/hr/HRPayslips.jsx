import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function HRPayslips() {
  const { user, can } = useAuth()
  const isManager = can('admin')
  const [payslips, setPayslips] = useState([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')
  const [staff, setStaff]       = useState([])
  const [form, setForm]         = useState({ user_email:'', user_name:'', period:'' })
  const [periodFilter, setPeriodFilter] = useState('all')
  const [staffFilter, setStaffFilter] = useState('all')
  const fileRef = useRef()

  const fileTypeLabel = (name = '') => {
    const ext = name.split('.').pop()?.toUpperCase()
    return ext ? `${ext} File` : 'Payslip'
  }

  useEffect(() => { load() }, [user?.email])
  const load = async () => {
    setLoading(true)
    try {
      const q = isManager
        ? supabase.from('payslips').select('*').order('uploaded_at',{ascending:false})
        : supabase.from('payslips').select('*').ilike('user_email',user?.email).order('uploaded_at',{ascending:false})
      const [psResult, stResult] = await Promise.all([q, supabase.from('hr_profiles').select('user_email,full_name')])
      setPayslips(psResult.data || [])
      setStaff((stResult.data || []).map(p => ({ name: p.full_name || p.user_email, email: p.user_email })))
    } catch (err) {
      console.warn('Payslips load error:', err)
      setPayslips([])
      setStaff([])
    }
    setLoading(false)
  }

  const upload = async () => {
    if (!selectedFile) {
      setUploadError('Choose a PDF file first.')
      return
    }
    if (!form.user_email) {
      setUploadError('Select a staff member first.')
      return
    }
    if (!form.period.trim()) {
      setUploadError('Enter the payslip period before uploading.')
      return
    }
    setUploading(true)
    setUploadError('')
    setUploadSuccess('')
    const path = `payslips/${form.user_email}/${form.period.trim()}-${Date.now()}.pdf`
    const { error } = await supabase.storage.from('hr-documents').upload(path, selectedFile, { upsert: false })
    if (!error) {
      const { data: urlData } = supabase.storage.from('hr-documents').getPublicUrl(path)
      const { error: insertError } = await supabase.from('payslips').insert([{
        user_email: form.user_email,
        user_name: form.user_name,
        period: form.period.trim(),
        file_url: urlData.publicUrl,
        file_path: path,
        uploaded_by: user?.name,
        uploaded_at: new Date().toISOString(),
      }])
      if (insertError) {
        setUploadError(insertError.message || 'Could not save the payslip record.')
      } else {
        setUploadSuccess(`Uploaded ${selectedFile.name}`)
        setSelectedFile(null)
        setForm((current) => ({ ...current, period: '' }))
        if (fileRef.current) fileRef.current.value = ''
        await load()
      }
    } else {
      setUploadError(error.message || 'Could not upload the payslip PDF.')
    }
    setUploading(false)
  }

  const availablePeriods = [...new Set(payslips.map((p) => p.period).filter(Boolean))]
  const filteredPayslips = payslips.filter((p) => {
    const periodMatch = periodFilter === 'all' || p.period === periodFilter
    const staffMatch = !isManager || staffFilter === 'all' || p.user_email === staffFilter
    return periodMatch && staffMatch
  })

  const summary = {
    total: payslips.length,
    visible: filteredPayslips.length,
    staffCovered: new Set(payslips.map((p) => p.user_email)).size,
    latestUpload: payslips[0]?.uploaded_at,
  }

  return (
    <div className="fade-in">
      <div className="page-hd"><div><h1 className="page-title">Payslips</h1></div></div>

      <div className="dashboard-stat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0,1fr))', gap:14, marginBottom:20 }}>
        <div className="stat-card"><div className="stat-val">{summary.total}</div><div className="stat-lbl">Payslips stored</div></div>
        <div className="stat-card"><div className="stat-val">{summary.visible}</div><div className="stat-lbl">Visible in view</div></div>
        <div className="stat-card"><div className="stat-val">{isManager ? summary.staffCovered : availablePeriods.length}</div><div className="stat-lbl">{isManager ? 'Staff covered' : 'Periods available'}</div></div>
        <div className="stat-card"><div className="stat-val">{summary.latestUpload ? new Date(summary.latestUpload).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : '—'}</div><div className="stat-lbl">Latest upload</div></div>
      </div>

      {isManager && (
        <div className="card card-pad" style={{ marginBottom:20, maxWidth:560 }}>
          <div className="lbl" style={{ marginBottom:12 }}>Upload Payslip</div>
          <div className="fg" style={{ marginBottom:12 }}>
            <div><label className="lbl">Staff Member</label>
              <select className="inp" value={form.user_email} onChange={e=>{ const s=staff.find(s=>s.email===e.target.value); setForm(p=>({...p,user_email:e.target.value,user_name:s?.name||''})); setUploadError(''); setUploadSuccess('') }}>
                <option value="">Select staff...</option>
                {staff.map(s=><option key={s.email} value={s.email}>{s.name}</option>)}
              </select>
            </div>
            <div><label className="lbl">Period</label><input className="inp" value={form.period} onChange={e=>{ setForm(p=>({...p,period:e.target.value})); setUploadError(''); setUploadSuccess('') }} placeholder="e.g. March 2026"/></div>
          </div>
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
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
            <button className="btn btn-outline" type="button" onClick={()=>fileRef.current?.click()} disabled={uploading}>
              {selectedFile ? 'Change PDF' : 'Choose PDF'}
            </button>
            <button className="btn btn-primary" type="button" onClick={upload} disabled={uploading || !selectedFile}>
              {uploading?'Uploading...':'Upload PDF'}
            </button>
          </div>
          <div style={{ fontSize:12, color:selectedFile ? 'var(--text)' : 'var(--sub)', marginTop:10 }}>
            {selectedFile ? `Selected: ${selectedFile.name}` : 'No PDF selected yet.'}
          </div>
          {uploadError ? <div style={{ fontSize:12, color:'var(--red)', marginTop:8 }}>{uploadError}</div> : null}
          {uploadSuccess ? <div style={{ fontSize:12, color:'var(--green)', marginTop:8 }}>{uploadSuccess}</div> : null}
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:14, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div>
            <div className="lbl" style={{ marginBottom:6 }}>Library view</div>
            <div style={{ fontSize:13, color:'var(--sub)' }}>Filter payslips by period and, for admins, by staff member.</div>
          </div>
          <div className="fg" style={{ width:'min(560px, 100%)' }}>
            <div>
              <label className="lbl">Period</label>
              <select className="inp" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
                <option value="all">All periods</option>
                {availablePeriods.map((period) => <option key={period} value={period}>{period}</option>)}
              </select>
            </div>
            {isManager ? (
              <div>
                <label className="lbl">Staff member</label>
                <select className="inp" value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
                  <option value="all">All staff</option>
                  {staff.map((person) => <option key={person.email} value={person.email}>{person.name}</option>)}
                </select>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : filteredPayslips.length===0 ? <div className="empty"><p>No payslips match this view yet.</p></div> : (
          <div style={{ display:'grid', gap:12, padding:12 }}>
            {filteredPayslips.map((p) => (
              <div key={p.id} className="card" style={{ padding:16, display:'grid', gap:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'flex-start', flexWrap:'wrap' }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>
                      {isManager ? (p.user_name || p.user_email) : p.period}
                    </div>
                    <div style={{ fontSize:13, color:'var(--sub)', marginTop:4 }}>
                      {isManager ? `${p.period} payslip` : 'Payroll document ready to open'}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    <span className="badge badge-blue">{fileTypeLabel(p.file_path || p.file_url)}</span>
                    <span className="badge badge-green">Stored</span>
                    <span className="badge badge-grey">Uploaded {new Date(p.uploaded_at).toLocaleDateString('en-GB')}</span>
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'center', flexWrap:'wrap', paddingTop:10, borderTop:'1px solid var(--border)' }}>
                  <div style={{ display:'grid', gap:4 }}>
                    {isManager ? <div style={{ fontSize:12, color:'var(--sub)' }}>{p.user_email}</div> : null}
                    <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{p.file_path || 'Stored in HR documents'}</div>
                  </div>
                  <a href={p.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Open payslip</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
