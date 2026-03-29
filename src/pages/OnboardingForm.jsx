import { useState, useEffect, useRef } from 'react'
import { Check, ChevronRight, ChevronLeft, Save, Send, Upload } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useMsal } from '@azure/msal-react'

const WORKER_URL = 'https://dh-email-worker.aged-silence-66a7.workers.dev'

const STEPS = [
  { key: 'personal',  label: 'Personal Details',     icon: '👤' },
  { key: 'bank',      label: 'Bank Details',          icon: '🏦' },
  { key: 'rtw',       label: 'Right to Work',         icon: '📄' },
  { key: 'contract',  label: 'Contract',              icon: '✍️'  },
]

const Field = ({ label, required, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--sub)' }}>
      {label} {required && <span style={{ color: 'var(--red)' }}>*</span>}
    </label>
    {children}
  </div>
)

const inp = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '9px', padding: '10px 14px', color: 'var(--text)', fontSize: '13.5px', width: '100%', boxSizing: 'border-box' }

export default function OnboardingForm({ onComplete }) {
  const { accounts } = useMsal()
  const me = accounts[0]
  const myEmail = me?.username?.toLowerCase() || ''
  const fileRef = useRef()

  const [step, setStep]       = useState(0)
  const [saving, setSaving]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [record, setRecord]   = useState(null)
  const [flashSaved, setFlash] = useState(false)
  const [rtwFile, setRtwFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  const [form, setForm] = useState({
    first_name: '', last_name: '', dob: '', personal_email: '', phone: '', address: '',
    emergency_contact: '', emergency_phone: '',
    bank_name: '', account_name: '', sort_code: '', account_number: '',
    rtw_type: 'Passport', rtw_expiry: '', rtw_doc_url: '',
    contract_acknowledged: false, contract_acknowledged_at: null,
  })

  useEffect(() => { loadDraft() }, [myEmail])

  const loadDraft = async () => {
    const { data } = await supabase.from('onboarding_submissions')
      .select('*').ilike('user_email', myEmail).maybeSingle()
    if (data) {
      setRecord(data)
      setForm(p => ({ ...p, ...data }))
      // Resume at last incomplete step
      if (!data.first_name) setStep(0)
      else if (!data.bank_name) setStep(1)
      else if (!data.rtw_doc_url) setStep(2)
      else if (!data.contract_acknowledged) setStep(3)
    }
  }

  const u = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const saveDraft = async (showFlash = true) => {
    setSaving(true)
    const payload = { ...form, user_email: myEmail, user_name: me?.name || myEmail, status: 'in_progress', updated_at: new Date().toISOString() }
    if (record?.id) {
      await supabase.from('onboarding_submissions').update(payload).eq('id', record.id)
    } else {
      const { data } = await supabase.from('onboarding_submissions').insert([{ ...payload, created_at: new Date().toISOString() }]).select().single()
      setRecord(data)
    }
    setSaving(false)
    if (showFlash) { setFlash(true); setTimeout(() => setFlash(false), 2500) }
  }

  const uploadRTW = async (file) => {
    setUploading(true)
    const path = `rtw/${myEmail}/${Date.now()}-${file.name}`
    await supabase.storage.from('hr-documents').upload(path, file)
    const { data } = supabase.storage.from('hr-documents').getPublicUrl(path)
    u('rtw_doc_url', data.publicUrl)
    setUploading(false)
  }

  const submit = async () => {
    setSubmitting(true)
    await saveDraft(false)
    await supabase.from('onboarding_submissions').update({
      ...form, user_email: myEmail, user_name: me?.name || myEmail,
      status: 'submitted', submitted_at: new Date().toISOString()
    }).eq('id', record?.id)
    // Email admin
    await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'custom_email', data: {
        to: ['david@dhwebsiteservices.co.uk'],
        from: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        subject: `📋 Onboarding Submitted — ${form.first_name} ${form.last_name}`,
        html: `<div style="font-family:Arial,sans-serif;padding:24px;max-width:600px">
          <h2 style="color:var(--charcoal)">New Onboarding Submission</h2>
          <p><strong>${form.first_name} ${form.last_name}</strong> (${myEmail}) has completed their onboarding form.</p>
          <p>Log in to the staff portal → HR → Onboarding to review and approve.</p>
        </div>`
      }})
    })
    setSubmitting(false)
    if (onComplete) onComplete()
  }

  const stepComplete = (s) => {
    if (s === 0) return form.first_name && form.last_name && form.dob && form.phone && form.address && form.emergency_contact
    if (s === 1) return form.bank_name && form.account_name && form.sort_code && form.account_number
    if (s === 2) return form.rtw_doc_url
    if (s === 3) return form.contract_acknowledged
    return false
  }

  const allComplete = STEPS.every((_, i) => stepComplete(i))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: '680px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ width: 40, height: 40, background: 'var(--gold)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px', color: '#fff' }}>DH</div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', color: 'var(--text)' }}>Welcome to DH Website Services</div>
            <div style={{ fontSize: '13px', color: 'var(--sub)' }}>Complete your onboarding to get started</div>
          </div>
        </div>

        {/* Progress steps */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
          {STEPS.map((s, i) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
              <button onClick={() => setStep(i)} style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
                background: stepComplete(i) ? 'var(--green)' : i === step ? 'var(--gold)' : 'var(--bg2)',
                transition: 'all 0.2s',
              }} title={s.label}>
                {stepComplete(i) ? <Check size={16} color="#fff" /> : <span>{s.icon}</span>}
              </button>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 2, background: stepComplete(i) ? 'var(--green)' : 'var(--border)', margin: '0 4px', transition: 'background 0.3s' }} />
              )}
            </div>
          ))}
        </div>

        {/* Step label */}
        <div style={{ marginTop: '12px', fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
          Step {step + 1} of {STEPS.length} — {STEPS[step].label}
        </div>
      </div>

      {/* Form card */}
      <div style={{ width: '100%', maxWidth: '680px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '32px' }}>

        {/* Step 0: Personal Details */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <Field label="First Name" required><input style={inp} value={form.first_name} onChange={e => u('first_name', e.target.value)} placeholder="Jane" /></Field>
              <Field label="Last Name" required><input style={inp} value={form.last_name} onChange={e => u('last_name', e.target.value)} placeholder="Smith" /></Field>
              <Field label="Date of Birth" required><input style={inp} type="date" value={form.dob} onChange={e => u('dob', e.target.value)} /></Field>
              <Field label="Personal Email" required><input style={inp} type="email" value={form.personal_email} onChange={e => u('personal_email', e.target.value)} placeholder="jane@example.com" /></Field>
              <Field label="Phone Number" required><input style={inp} value={form.phone} onChange={e => u('phone', e.target.value)} placeholder="07700 000000" /></Field>
            </div>
            <Field label="Home Address" required><textarea style={{ ...inp, resize: 'vertical' }} rows={3} value={form.address} onChange={e => u('address', e.target.value)} placeholder="Full address including postcode" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <Field label="Emergency Contact Name" required><input style={inp} value={form.emergency_contact} onChange={e => u('emergency_contact', e.target.value)} placeholder="Full name" /></Field>
              <Field label="Emergency Contact Phone" required><input style={inp} value={form.emergency_phone} onChange={e => u('emergency_phone', e.target.value)} placeholder="07700 000000" /></Field>
            </div>
          </div>
        )}

        {/* Step 1: Bank Details */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '12px 16px', background: 'rgba(0,194,255,0.06)', border: '1px solid var(--gold-bg)', borderRadius: '10px', fontSize: '13px', color: 'var(--sub)' }}>
              🔒 Your bank details are stored securely and only accessible by authorised payroll staff.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <Field label="Bank Name" required><input style={inp} value={form.bank_name} onChange={e => u('bank_name', e.target.value)} placeholder="e.g. Barclays" /></Field>
              <Field label="Account Name" required><input style={inp} value={form.account_name} onChange={e => u('account_name', e.target.value)} placeholder="As it appears on your account" /></Field>
              <Field label="Sort Code" required><input style={inp} value={form.sort_code} onChange={e => u('sort_code', e.target.value)} placeholder="00-00-00" maxLength={8} /></Field>
              <Field label="Account Number" required><input style={inp} value={form.account_number} onChange={e => u('account_number', e.target.value)} placeholder="8 digits" maxLength={8} /></Field>
            </div>
          </div>
        )}

        {/* Step 2: Right to Work */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <Field label="Document Type" required>
                <select style={inp} value={form.rtw_type} onChange={e => u('rtw_type', e.target.value)}>
                  {['Passport','UK Birth Certificate','Biometric Residence Permit','Share Code','Visa','Other'].map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Document Expiry Date">
                <input style={inp} type="date" value={form.rtw_expiry} onChange={e => u('rtw_expiry', e.target.value)} />
              </Field>
            </div>
            <Field label="Upload Document" required>
              <div onClick={() => fileRef.current?.click()} style={{ padding: '32px', border: '2px dashed var(--border)', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseOver={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                {uploading ? (
                  <div style={{ color: 'var(--sub)', fontSize: '13.5px' }}>Uploading…</div>
                ) : form.rtw_doc_url ? (
                  <div style={{ color: 'var(--green)', fontSize: '13.5px', fontWeight: 600 }}>✓ Document uploaded successfully</div>
                ) : (
                  <>
                    <Upload size={24} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                    <div style={{ fontSize: '13.5px', color: 'var(--sub)' }}>Click to upload your document</div>
                    <div style={{ fontSize: '12px', color: 'var(--faint)', marginTop: '4px' }}>PDF, JPG or PNG accepted</div>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) { setRtwFile(f); uploadRTW(f) } }} />
            </Field>
          </div>
        )}

        {/* Step 3: Contract */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', maxHeight: '320px', overflowY: 'auto', fontSize: '13.5px', color: 'var(--sub)', lineHeight: 1.8 }}>
              <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '12px', fontSize: '15px' }}>Employment Agreement — DH Website Services</strong>
              <p>This agreement is between DH Website Services (David Hooper Home Limited, Company No. 17018784) and you as a member of our team.</p>
              <p><strong style={{ color: 'var(--text)' }}>Confidentiality:</strong> You agree to keep all client information, business strategies, and internal systems strictly confidential during and after your employment.</p>
              <p><strong style={{ color: 'var(--text)' }}>Data Protection:</strong> You agree to handle all personal data in accordance with GDPR and the company's data protection policy. Any breach must be reported immediately.</p>
              <p><strong style={{ color: 'var(--text)' }}>Acceptable Use:</strong> Company systems and tools are to be used for business purposes only. Misuse may result in disciplinary action.</p>
              <p><strong style={{ color: 'var(--text)' }}>Right to Work:</strong> You confirm that the right to work documentation you have provided is genuine and up to date. You will notify the company immediately if your status changes.</p>
              <p><strong style={{ color: 'var(--text)' }}>Commission & Pay:</strong> Payment terms will be communicated separately by your manager. Commission is paid on confirmed client receipts as agreed.</p>
              <p>By acknowledging below, you confirm you have read, understood and agree to the terms above.</p>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', padding: '14px 16px', background: form.contract_acknowledged ? 'rgba(0,229,160,0.08)' : 'var(--bg2)', border: `1px solid ${form.contract_acknowledged ? 'var(--green)' : 'var(--border)'}`, borderRadius: '10px', transition: 'all 0.2s' }}>
              <input type="checkbox" checked={form.contract_acknowledged} onChange={e => { u('contract_acknowledged', e.target.checked); if (e.target.checked) u('contract_acknowledged_at', new Date().toISOString()) }} style={{ width: 18, height: 18, marginTop: '1px', flexShrink: 0, accentColor: 'var(--green)' }} />
              <span style={{ fontSize: '13.5px', color: 'var(--text)', lineHeight: 1.6 }}>
                I confirm I have read and agree to the employment terms above. I understand this constitutes a digital acknowledgement on {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
              </span>
            </label>
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => saveDraft()} disabled={saving} style={{ padding: '8px 16px', borderRadius: '9px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--sub)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={13} /> {saving ? 'Saving…' : 'Save & Continue Later'}
            </button>
            {flashSaved && <span style={{ fontSize: '12.5px', color: 'var(--green)' }}>✓ Draft saved</span>}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} style={{ padding: '10px 18px', borderRadius: '9px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--sub)', fontSize: '13.5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ChevronLeft size={15} /> Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button onClick={() => { saveDraft(false); setStep(s => s + 1) }} style={{ padding: '10px 22px', borderRadius: '9px', border: 'none', background: 'var(--gold)', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Next <ChevronRight size={15} />
              </button>
            ) : (
              <button onClick={submit} disabled={submitting || !allComplete} style={{ padding: '10px 22px', borderRadius: '9px', border: 'none', background: allComplete ? 'var(--green)' : 'var(--border)', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: allComplete ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Send size={15} /> {submitting ? 'Submitting…' : 'Submit Onboarding'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Submitted state */}
      {/* (handled by parent via onComplete prop) */}
  )
}
