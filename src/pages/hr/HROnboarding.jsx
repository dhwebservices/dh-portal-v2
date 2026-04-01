import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { normalizeEmail, syncOnboardingSubmissionToHrProfile } from '../../utils/hrProfileSync'

const STEPS = [
  { key:'personal',   label:'Personal Info'       },
  { key:'address',    label:'Address & Contact'   },
  { key:'employment', label:'Employment'          },
  { key:'emergency',  label:'Emergency Contact'   },
  { key:'bank',       label:'Bank Details'        },
  { key:'rtw',        label:'Right to Work'       },
  { key:'contract',   label:'Contract & Sign Off' },
]

const RTW_DOCS = ['UK Passport','British National (Overseas) Passport','EU/EEA Passport','BRP Card (Biometric Residence Permit)','UK Birth Certificate + NI evidence','Certificate of Naturalisation','Visa (specify type)','Other']

export default function HROnboarding() {
  const { user, isAdmin, isOnboarding } = useAuth()
  const isHRAdmin = isAdmin && !isOnboarding
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading]         = useState(true)
  const [mySubmission, setMy]         = useState(null)
  const [step, setStep]               = useState(0)
  const [saving, setSaving]           = useState(false)
  const [viewSub, setViewSub]         = useState(null)
  const [adminBusyEmail, setAdminBusyEmail] = useState('')
  const [adminMessage, setAdminMessage] = useState('')
  const rtwRef = useRef()

  const [form, setForm] = useState({
    // Personal
    full_name:'', preferred_name:'', dob:'', gender:'', nationality:'', ni_number:'',
    // Address
    address_line1:'', address_line2:'', city:'', postcode:'', personal_email:'', personal_phone:'',
    // Employment
    job_title:'', department:'', start_date:'', contract_type:'', hours_per_week:'', manager_name:'', work_location:'',
    // Emergency
    emergency_name:'', emergency_relationship:'', emergency_phone:'', emergency_email:'',
    // Bank
    bank_name:'', account_name:'', sort_code:'', account_number:'', payment_frequency:'Monthly',
    // RTW
    rtw_type:'', rtw_document_url:'', rtw_expiry:'', rtw_notes:'',
    // Contract
    contract_signed:false, handbook_read:false, data_consent:false, photo_url:'', additional_notes:'',
  })

  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { load() }, [user?.email])

  const load = async () => {
    setLoading(true)
    const currentEmail = normalizeEmail(user?.email || '')
    const [{ data: all }, { data: mine }] = await Promise.all([
      isHRAdmin ? supabase.from('onboarding_submissions').select('*').order('submitted_at', { ascending:false }) : Promise.resolve({ data:[] }),
      supabase.from('onboarding_submissions').select('*').ilike('user_email', currentEmail).maybeSingle(),
    ])
    setSubmissions(all||[])
    if (mine) {
      setMy(mine)
      // Pre-fill form from existing submission
      const saved = { ...form }
      Object.keys(saved).forEach(k => { if (mine[k] !== undefined && mine[k] !== null) saved[k] = mine[k] })
      setForm(saved)
    }
    setLoading(false)
  }

  const uploadRTW = async (file) => {
    const path = `rtw/${normalizeEmail(user.email)}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('hr-documents').upload(path, file)
    if (!error) {
      const { data } = supabase.storage.from('hr-documents').getPublicUrl(path)
      sf('rtw_document_url', data.publicUrl)
    }
  }

  const submit = async () => {
    setSaving(true)
    const normalizedEmail = normalizeEmail(user?.email || '')
    const payload = {
      user_email: normalizedEmail,
      user_name: user.name,
      ...form,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }
    await supabase.from('onboarding_submissions').upsert(payload, { onConflict:'user_email' })
    await syncOnboardingSubmissionToHrProfile(payload)
    setSaving(false)
    load()
  }

  const saveDraft = async () => {
    setSaving(true)
    await supabase.from('onboarding_submissions').upsert({ user_email: normalizeEmail(user?.email || ''), user_name: user.name, ...form, status:'draft' }, { onConflict:'user_email' })
    setSaving(false)
  }

  const decide = async (email, status, notes='') => {
    const normalizedEmail = normalizeEmail(email)
    setAdminBusyEmail(normalizedEmail)
    setAdminMessage('')
    try {
      const { data, error } = await supabase
        .from('onboarding_submissions')
        .update({ status, decided_by: user.name, decided_at: new Date().toISOString(), admin_notes: notes })
        .ilike('user_email', normalizedEmail)
        .select('*')

      if (error) throw error
      const submission = Array.isArray(data) ? data[0] : data
      if (!submission) throw new Error('No onboarding submission was updated for this staff member.')

      if (status === 'approved') {
        await syncOnboardingSubmissionToHrProfile(submission, { overwrite: true })
      }

      setSubmissions((current) =>
        current.map((item) =>
          normalizeEmail(item.user_email) === normalizedEmail
            ? { ...item, ...submission }
            : item
        )
      )
      if (viewSub && normalizeEmail(viewSub.user_email) === normalizedEmail) {
        setViewSub({ ...viewSub, ...submission })
      } else {
        setViewSub(null)
      }
      setAdminMessage(status === 'approved' ? 'Onboarding approved successfully.' : 'Onboarding marked as rejected.')
    } catch (err) {
      console.error('Onboarding decision failed:', err)
      alert('Onboarding update failed: ' + (err.message || 'Unknown error'))
    } finally {
      setAdminBusyEmail('')
    }
  }

  const removeSubmission = async (email) => {
    const normalizedEmail = normalizeEmail(email)
    const confirmed = confirm(`Remove the onboarding record for ${normalizedEmail}? This only clears the onboarding submission from the queue.`)
    if (!confirmed) return

    setAdminBusyEmail(normalizedEmail)
    setAdminMessage('')
    try {
      const { error } = await supabase
        .from('onboarding_submissions')
        .delete()
        .ilike('user_email', normalizedEmail)

      if (error) throw error

      setSubmissions((current) => current.filter((item) => normalizeEmail(item.user_email) !== normalizedEmail))
      if (viewSub && normalizeEmail(viewSub.user_email) === normalizedEmail) {
        setViewSub(null)
      }
      setAdminMessage('Onboarding record removed from the queue.')
    } catch (err) {
      console.error('Onboarding removal failed:', err)
      alert('Could not remove onboarding record: ' + (err.message || 'Unknown error'))
    } finally {
      setAdminBusyEmail('')
    }
  }

  const completionPct = () => {
    const required = ['full_name','dob','ni_number','address_line1','city','postcode','personal_email','personal_phone','emergency_name','emergency_phone','bank_name','sort_code','account_number','rtw_type']
    const filled = required.filter(k => form[k] && form[k].toString().trim() !== '').length
    return Math.round((filled / required.length) * 100)
  }

  const pct = completionPct()

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Onboarding</h1><p className="page-sub">Staff onboarding forms and submissions</p></div>
      </div>

      {/* Welcome banner for onboarding users */}
      {isOnboarding && !mySubmission?.status?.match(/submitted|approved/) && (
        <div style={{ background:'linear-gradient(135deg, var(--accent-soft) 0%, var(--bg2) 100%)', border:'1px solid var(--accent-border)', borderRadius:14, padding:'24px 28px', marginBottom:24, display:'flex', gap:20, alignItems:'flex-start' }}>
          <div style={{ fontSize:36, flexShrink:0 }}>👋</div>
          <div>
            <div style={{ fontSize:20, fontWeight:600, color:'var(--text)', marginBottom:6 }}>Welcome to DH Website Services, {user?.name?.split(' ')[0]}!</div>
            <div style={{ fontSize:14, color:'var(--sub)', lineHeight:1.6 }}>
              Please complete your onboarding form below. Fill in all sections and upload your right to work documents. 
              Once submitted, HR will review and get back to you within 1 business day.
            </div>
          </div>
        </div>
      )}

      {/* Admin panel */}
      {isHRAdmin && submissions.length > 0 && (
        <div className="card" style={{ overflow:'hidden', marginBottom:24 }}>
          <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--faint)' }}>
            Submissions ({submissions.length})
          </div>
          {adminMessage && (
            <div style={{ padding:'10px 18px', borderBottom:'1px solid var(--border)', fontSize:12.5, color:'var(--green)', background:'var(--green-bg)' }}>
              {adminMessage}
            </div>
          )}
          <table className="tbl">
            <thead><tr><th>Staff Member</th><th>Email</th><th>Submitted</th><th>Status</th><th>Completion</th><th></th></tr></thead>
            <tbody>
              {submissions.map(s => (
                <tr key={s.user_email}>
                  <td className="t-main">{s.user_name||s.full_name||'—'}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{s.user_email}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('en-GB') : 'Draft'}</td>
                  <td><span className={'badge badge-'+(s.status==='approved'?'green':s.status==='rejected'?'red':s.status==='submitted'?'amber':'grey')}>{s.status}</span></td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ flex:1, height:4, background:'var(--bg3)', borderRadius:2, overflow:'hidden', minWidth:60 }}>
                        <div style={{ height:'100%', background:'var(--accent)', borderRadius:2, width: `${(() => { const r=['full_name','dob','ni_number','address_line1','city','postcode','personal_email','personal_phone','emergency_name','emergency_phone','bank_name','sort_code','account_number','rtw_type']; const f=r.filter(k=>s[k]&&s[k].toString().trim()!=='').length; return Math.round(f/r.length*100) })()}%` }}/>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setViewSub(s)}>Review</button>
                      {s.status==='submitted' && <>
                        <button className="btn btn-sm" style={{ background:'var(--green)', color:'#fff' }} disabled={adminBusyEmail === normalizeEmail(s.user_email)} onClick={() => decide(s.user_email,'approved')}>✓</button>
                        <button className="btn btn-danger btn-sm" disabled={adminBusyEmail === normalizeEmail(s.user_email)} onClick={() => decide(s.user_email,'rejected')}>✗</button>
                      </>}
                      <button className="btn btn-outline btn-sm" disabled={adminBusyEmail === normalizeEmail(s.user_email)} onClick={() => removeSubmission(s.user_email)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Staff form */}
      {(!mySubmission || mySubmission.status === 'draft' || mySubmission.status === 'rejected') ? (
        <div>
          {mySubmission?.status === 'rejected' && (
            <div style={{ padding:'12px 16px', background:'var(--red-bg)', border:'1px solid var(--red)', borderRadius:8, marginBottom:20, fontSize:13, color:'var(--red)' }}>
              Your previous submission was rejected. Please review and resubmit.
              {mySubmission.admin_notes && <div style={{ marginTop:6, fontWeight:500 }}>Notes: {mySubmission.admin_notes}</div>}
            </div>
          )}

          {/* Progress bar */}
          <div className="card card-pad" style={{ marginBottom:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:13, fontWeight:500 }}>Form completion</span>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color: pct===100?'var(--green)':'var(--accent)' }}>{pct}%</span>
            </div>
            <div style={{ height:6, background:'var(--bg3)', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', background: pct===100?'var(--green)':'var(--accent)', borderRadius:3, width:`${pct}%`, transition:'width 0.4s ease' }}/>
            </div>
          </div>

          {/* Step tabs */}
          <div style={{ display:'flex', gap:4, marginBottom:24, background:'var(--bg2)', borderRadius:10, padding:4, flexWrap:'wrap' }}>
            {STEPS.map((s,i) => (
              <button key={s.key} onClick={() => setStep(i)} style={{ flex:1, minWidth:90, padding:'7px 10px', borderRadius:7, border:'none', background: step===i ? 'var(--card)' : 'transparent', color: step===i ? 'var(--text)' : 'var(--faint)', fontSize:12, fontWeight: step===i ? 500 : 400, cursor:'pointer', transition:'all 0.15s', boxShadow: step===i ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', whiteSpace:'nowrap' }}>
                {s.label}
              </button>
            ))}
          </div>

          <div className="card card-pad" style={{ maxWidth:640, marginBottom:20 }}>
            {step === 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:4 }}>Personal Information</h3>
                <div className="fg">
                  <div><label className="lbl">Legal Full Name *</label><input className="inp" value={form.full_name} onChange={e=>sf('full_name',e.target.value)} placeholder="As on passport/ID"/></div>
                  <div><label className="lbl">Preferred Name</label><input className="inp" value={form.preferred_name} onChange={e=>sf('preferred_name',e.target.value)} placeholder="What you like to be called"/></div>
                  <div><label className="lbl">Date of Birth *</label><input className="inp" type="date" value={form.dob} onChange={e=>sf('dob',e.target.value)}/></div>
                  <div><label className="lbl">Gender</label>
                    <select className="inp" value={form.gender} onChange={e=>sf('gender',e.target.value)}>
                      <option value="">Prefer not to say</option>
                      {['Male','Female','Non-binary','Prefer to self-describe','Prefer not to say'].map(g=><option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div><label className="lbl">Nationality</label><input className="inp" value={form.nationality} onChange={e=>sf('nationality',e.target.value)} placeholder="e.g. British"/></div>
                  <div><label className="lbl">National Insurance Number *</label><input className="inp" value={form.ni_number} onChange={e=>sf('ni_number',e.target.value)} placeholder="AB 12 34 56 C" style={{ fontFamily:'var(--font-mono)' }}/></div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:4 }}>Address & Contact Details</h3>
                <div className="fg">
                  <div className="fc"><label className="lbl">Address Line 1 *</label><input className="inp" value={form.address_line1} onChange={e=>sf('address_line1',e.target.value)} placeholder="House number and street"/></div>
                  <div className="fc"><label className="lbl">Address Line 2</label><input className="inp" value={form.address_line2} onChange={e=>sf('address_line2',e.target.value)} placeholder="Apartment, flat, etc."/></div>
                  <div><label className="lbl">City / Town *</label><input className="inp" value={form.city} onChange={e=>sf('city',e.target.value)}/></div>
                  <div><label className="lbl">Postcode *</label><input className="inp" value={form.postcode} onChange={e=>sf('postcode',e.target.value)} style={{ fontFamily:'var(--font-mono)' }}/></div>
                  <div><label className="lbl">Personal Email *</label><input className="inp" type="email" value={form.personal_email} onChange={e=>sf('personal_email',e.target.value)}/></div>
                  <div><label className="lbl">Personal Phone *</label><input className="inp" value={form.personal_phone} onChange={e=>sf('personal_phone',e.target.value)} placeholder="07700 000000"/></div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:4 }}>Employment Details</h3>
                <div className="fg">
                  <div><label className="lbl">Job Title</label><input className="inp" value={form.job_title} onChange={e=>sf('job_title',e.target.value)}/></div>
                  <div><label className="lbl">Department</label><input className="inp" value={form.department} onChange={e=>sf('department',e.target.value)}/></div>
                  <div><label className="lbl">Start Date</label><input className="inp" type="date" value={form.start_date} onChange={e=>sf('start_date',e.target.value)}/></div>
                  <div><label className="lbl">Contract Type</label>
                    <select className="inp" value={form.contract_type} onChange={e=>sf('contract_type',e.target.value)}>
                      <option value="">Select...</option>
                      {['Full-time','Part-time','Contractor','Zero Hours','Apprentice','Freelance'].map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className="lbl">Hours per Week</label><input className="inp" type="number" value={form.hours_per_week} onChange={e=>sf('hours_per_week',e.target.value)} placeholder="e.g. 37.5"/></div>
                  <div><label className="lbl">Work Location</label>
                    <select className="inp" value={form.work_location} onChange={e=>sf('work_location',e.target.value)}>
                      <option value="">Select...</option>
                      {['Remote','Office','Hybrid','On-site (client)'].map(l=><option key={l}>{l}</option>)}
                    </select>
                  </div>
                  <div><label className="lbl">Manager Name</label><input className="inp" value={form.manager_name} onChange={e=>sf('manager_name',e.target.value)}/></div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:4 }}>Emergency Contact</h3>
                <p style={{ fontSize:13, color:'var(--sub)' }}>Who should we contact in an emergency? This information is kept confidential.</p>
                <div className="fg">
                  <div><label className="lbl">Full Name *</label><input className="inp" value={form.emergency_name} onChange={e=>sf('emergency_name',e.target.value)}/></div>
                  <div><label className="lbl">Relationship</label><input className="inp" value={form.emergency_relationship} onChange={e=>sf('emergency_relationship',e.target.value)} placeholder="e.g. Partner, Parent, Sibling"/></div>
                  <div><label className="lbl">Phone Number *</label><input className="inp" value={form.emergency_phone} onChange={e=>sf('emergency_phone',e.target.value)} placeholder="07700 000000"/></div>
                  <div><label className="lbl">Email Address</label><input className="inp" type="email" value={form.emergency_email} onChange={e=>sf('emergency_email',e.target.value)}/></div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:4 }}>Bank Details</h3>
                <div style={{ padding:'10px 14px', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius:7, fontSize:13, color:'var(--accent)' }}>
                  Your bank details are stored securely and only accessible by HR/admin. They are used solely for payroll purposes.
                </div>
                <div className="fg">
                  <div><label className="lbl">Bank Name *</label><input className="inp" value={form.bank_name} onChange={e=>sf('bank_name',e.target.value)} placeholder="e.g. Barclays, HSBC"/></div>
                  <div><label className="lbl">Account Name *</label><input className="inp" value={form.account_name} onChange={e=>sf('account_name',e.target.value)} placeholder="Name on account"/></div>
                  <div><label className="lbl">Sort Code *</label><input className="inp" value={form.sort_code} onChange={e=>sf('sort_code',e.target.value)} placeholder="12-34-56" style={{ fontFamily:'var(--font-mono)' }}/></div>
                  <div><label className="lbl">Account Number *</label><input className="inp" value={form.account_number} onChange={e=>sf('account_number',e.target.value)} placeholder="12345678" style={{ fontFamily:'var(--font-mono)' }}/></div>
                  <div><label className="lbl">Payment Frequency</label>
                    <select className="inp" value={form.payment_frequency} onChange={e=>sf('payment_frequency',e.target.value)}>
                      {['Monthly','Weekly','Fortnightly'].map(f=><option key={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:4 }}>Right to Work</h3>
                <p style={{ fontSize:13, color:'var(--sub)', lineHeight:1.6 }}>Under UK law, we are required to check your right to work before employment begins. Please provide one of the documents below.</p>
                <div className="fg">
                  <div className="fc"><label className="lbl">Document Type *</label>
                    <select className="inp" value={form.rtw_type} onChange={e=>sf('rtw_type',e.target.value)}>
                      <option value="">Select document type...</option>
                      {RTW_DOCS.map(d=><option key={d}>{d}</option>)}
                    </select>
                  </div>
                  {form.rtw_type === 'Visa (specify type)' && (
                    <div className="fc"><label className="lbl">Visa Type / Notes</label><input className="inp" value={form.rtw_notes} onChange={e=>sf('rtw_notes',e.target.value)} placeholder="e.g. Skilled Worker visa, expiry date..."/></div>
                  )}
                  <div><label className="lbl">Document Expiry Date</label><input className="inp" type="date" value={form.rtw_expiry} onChange={e=>sf('rtw_expiry',e.target.value)}/><div style={{ fontSize:11, color:'var(--faint)', marginTop:4 }}>Leave blank if document does not expire (e.g. British passport)</div></div>
                  <div>
                    <label className="lbl">Upload Document *</label>
                    <input type="file" ref={rtwRef} style={{ display:'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={e=>{ if(e.target.files[0]) uploadRTW(e.target.files[0]) }}/>
                    {form.rtw_document_url ? (
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span className="badge badge-green">✓ Uploaded</span>
                        <a href={form.rtw_document_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'var(--accent)' }}>View document</a>
                        <button onClick={() => rtwRef.current?.click()} className="btn btn-outline btn-sm">Replace</button>
                      </div>
                    ) : (
                      <button onClick={() => rtwRef.current?.click()} className="btn btn-outline" style={{ marginTop:4 }}>
                        📎 Upload Document (PDF, JPG, PNG)
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ padding:'12px 14px', background:'var(--bg2)', borderRadius:8, fontSize:12, color:'var(--sub)', lineHeight:1.7 }}>
                  <strong>Acceptable documents include:</strong> UK/EU passport, BRP card, UK birth certificate with NI evidence. Documents will be reviewed by HR within 2 working days. If you have any questions, contact your manager.
                </div>
              </div>
            )}

            {step === 6 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:4 }}>Sign Off</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {[
                    ['contract_signed','I confirm I have received, read and signed my employment contract'],
                    ['handbook_read', 'I have read and understood the DH Website Services staff handbook and policies'],
                    ['data_consent', 'I consent to DH Website Services storing and processing my personal data in accordance with GDPR and the company Privacy Policy'],
                  ].map(([k, label]) => (
                    <label key={k} style={{ display:'flex', alignItems:'flex-start', gap:12, cursor:'pointer', padding:'12px 14px', borderRadius:8, border:`1px solid ${form[k]?'var(--green)':'var(--border)'}`, background:form[k]?'var(--green-bg)':'transparent', transition:'all 0.15s' }}>
                      <input type="checkbox" checked={form[k]} onChange={e=>sf(k,e.target.checked)} style={{ width:18,height:18,accentColor:'var(--green)',flexShrink:0,marginTop:1 }}/>
                      <span style={{ fontSize:13, lineHeight:1.6, color:'var(--text)' }}>{label}</span>
                    </label>
                  ))}
                </div>
                <div>
                  <label className="lbl">Additional Notes / Questions for HR</label>
                  <textarea className="inp" rows={4} value={form.additional_notes} onChange={e=>sf('additional_notes',e.target.value)} style={{ resize:'vertical' }} placeholder="Anything you'd like HR to know, or any questions you have..."/>
                </div>
                {(!form.contract_signed || !form.handbook_read || !form.data_consent) && (
                  <div style={{ fontSize:12, color:'var(--amber)' }}>⚠ Please check all three boxes above before submitting</div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div style={{ display:'flex', gap:8, marginTop:20, justifyContent:'space-between' }}>
              <div style={{ display:'flex', gap:8 }}>
                {step > 0 && <button className="btn btn-outline" onClick={() => setStep(s=>s-1)}>← Back</button>}
                <button className="btn btn-ghost" onClick={saveDraft} disabled={saving}>Save Draft</button>
              </div>
              <div>
                {step < STEPS.length-1
                  ? <button className="btn btn-primary" onClick={() => setStep(s=>s+1)}>Next →</button>
                  : <button className="btn btn-primary" onClick={submit} disabled={saving||!form.contract_signed||!form.handbook_read||!form.data_consent}>
                      {saving ? 'Submitting...' : '✓ Submit Onboarding'}
                    </button>
                }
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card card-pad" style={{ maxWidth:480, textAlign:'center' }}>
          <div style={{ fontSize:52, marginBottom:16 }}>
            {mySubmission.status==='approved' ? '✅' : mySubmission.status==='submitted' ? '⏳' : '🔄'}
          </div>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:400, marginBottom:8 }}>
            {mySubmission.status==='approved' ? 'Onboarding Complete' : 'Submission Under Review'}
          </h2>
          <p style={{ fontSize:14, color:'var(--sub)', lineHeight:1.7, marginBottom:20 }}>
            {mySubmission.status==='approved'
              ? 'Your onboarding has been approved by HR. Welcome to the team!'
              : 'Your onboarding form has been submitted and is being reviewed by HR. You\'ll be notified once approved.'}
          </p>
          {mySubmission.status === 'submitted' && (
            <div style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>
              Submitted {new Date(mySubmission.submitted_at).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}
            </div>
          )}
        </div>
      )}

      {/* Admin review modal */}
      {viewSub && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', backdropFilter:'blur(8px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={() => setViewSub(null)}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, width:'100%', maxWidth:640, maxHeight:'90vh', overflow:'auto' }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:'18px 22px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:17, fontWeight:600 }}>{viewSub.full_name||viewSub.user_name} — Onboarding Review</div>
              <button onClick={() => setViewSub(null)} style={{ background:'var(--bg2)', border:'none', borderRadius:'50%', width:28, height:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
            </div>
            <div style={{ padding:'18px 22px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                {[
                  ['Email', viewSub.user_email],
                  ['NI Number', viewSub.ni_number],
                  ['DOB', viewSub.dob],
                  ['Start Date', viewSub.start_date],
                  ['Job Title', viewSub.job_title],
                  ['Contract', viewSub.contract_type],
                  ['Bank', viewSub.bank_name ? `${viewSub.bank_name} ••${viewSub.account_number?.slice(-4)}` : '—'],
                  ['RTW Doc', viewSub.rtw_type||'—'],
                  ['Emergency', viewSub.emergency_name ? `${viewSub.emergency_name} (${viewSub.emergency_phone})` : '—'],
                  ['Address', viewSub.address_line1 ? `${viewSub.address_line1}, ${viewSub.city}, ${viewSub.postcode}` : '—'],
                ].map(([k,v]) => (
                  <div key={k} style={{ padding:'8px 12px', background:'var(--bg2)', borderRadius:7 }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:3 }}>{k}</div>
                    <div style={{ fontSize:13, fontWeight:500 }}>{v||'—'}</div>
                  </div>
                ))}
              </div>
              {viewSub.rtw_document_url && (
                <div style={{ marginBottom:16 }}>
                  <label className="lbl">Right to Work Document</label>
                  <a href={viewSub.rtw_document_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">View Document ↗</a>
                </div>
              )}
              {viewSub.additional_notes && (
                <div style={{ padding:'10px 14px', background:'var(--bg2)', borderRadius:7, marginBottom:16, fontSize:13, color:'var(--sub)' }}>
                  <div className="lbl" style={{ marginBottom:4 }}>Notes from staff</div>
                  {viewSub.additional_notes}
                </div>
              )}
              {viewSub.status === 'submitted' && (
                <div style={{ display:'flex', gap:8, paddingTop:14, borderTop:'1px solid var(--border)' }}>
                  <button className="btn btn-primary" disabled={adminBusyEmail === normalizeEmail(viewSub.user_email)} onClick={() => decide(viewSub.user_email,'approved')}>✓ Approve</button>
                  <button className="btn btn-danger" disabled={adminBusyEmail === normalizeEmail(viewSub.user_email)} onClick={() => { const notes=prompt('Reason for rejection (optional):'); decide(viewSub.user_email,'rejected',notes||'') }}>✗ Reject</button>
                  <button className="btn btn-outline" disabled={adminBusyEmail === normalizeEmail(viewSub.user_email)} onClick={() => removeSubmission(viewSub.user_email)}>Remove record</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
