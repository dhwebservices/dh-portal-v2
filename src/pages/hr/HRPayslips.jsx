import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function HRPayslips() {
  const { user, can } = useAuth()
  const isManager = can('admin')
  const [payslips, setPayslips] = useState([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [staff, setStaff]       = useState([])
  const [form, setForm]         = useState({ user_email:'', user_name:'', period:'' })
  const [periodFilter, setPeriodFilter] = useState('all')
  const [staffFilter, setStaffFilter] = useState('all')
  const fileRef = useRef()

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

  const upload = async (file) => {
    if (!file || !form.user_email || !form.period) return
    setUploading(true)
    const path = `payslips/${form.user_email}/${form.period}-${Date.now()}.pdf`
    const { error } = await supabase.storage.from('hr-documents').upload(path, file)
    if (!error) {
      const { data: urlData } = supabase.storage.from('hr-documents').getPublicUrl(path)
      await supabase.from('payslips').insert([{ user_email: form.user_email, user_name: form.user_name, period: form.period, file_url: urlData.publicUrl, file_path: path, uploaded_by: user?.name, uploaded_at: new Date().toISOString() }])
      load()
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
              <select className="inp" value={form.user_email} onChange={e=>{ const s=staff.find(s=>s.email===e.target.value); setForm(p=>({...p,user_email:e.target.value,user_name:s?.name||''})) }}>
                <option value="">Select staff...</option>
                {staff.map(s=><option key={s.email} value={s.email}>{s.name}</option>)}
              </select>
            </div>
            <div><label className="lbl">Period</label><input className="inp" value={form.period} onChange={e=>setForm(p=>({...p,period:e.target.value}))} placeholder="e.g. March 2026"/></div>
          </div>
          <input type="file" accept=".pdf" ref={fileRef} style={{ display:'none' }} onChange={e=>upload(e.target.files[0])}/>
          <button className="btn btn-primary" onClick={()=>fileRef.current?.click()} disabled={uploading}>{uploading?'Uploading...':'Upload PDF'}</button>
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
          <table className="tbl">
            <thead><tr>{isManager&&<th>Staff</th>}<th>Period</th><th>Uploaded</th><th></th></tr></thead>
            <tbody>
              {filteredPayslips.map(p => (
                <tr key={p.id}>
                  {isManager&&<td className="t-main">{p.user_name}</td>}
                  <td>{p.period}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(p.uploaded_at).toLocaleDateString('en-GB')}</td>
                  <td><a href={p.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Download</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
