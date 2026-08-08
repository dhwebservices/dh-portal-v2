import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { sendManagedNotification } from '../../utils/notificationPreferences'
import { normalizeEmail } from '../../utils/hrProfileSync'
import MobileCard from '../components/MobileCard'
import MobileButton from '../components/MobileButton'
import Icon from '../components/Icon'

const PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'
const RTW_DOCS = ['UK Passport', 'British National (Overseas) Passport', 'EU/EEA Passport', 'BRP Card (Biometric Residence Permit)', 'UK Birth Certificate + NI evidence', 'Certificate of Naturalisation', 'Visa (specify type)', 'Other']

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  dob: '',
  personal_email: '',
  phone: '',
  address: '',
  emergency_contact: '',
  emergency_phone: '',
  bank_name: '',
  account_name: '',
  sort_code: '',
  account_number: '',
  rtw_type: RTW_DOCS[0],
  rtw_expiry: '',
  rtw_doc_url: '',
  contract_acknowledged: false,
}

export default function MobileOnboarding({ goBack, user }) {
  const { logout } = useAuth()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submission, setSubmission] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [managerInfo, setManagerInfo] = useState(null)
  const [rtwUploading, setRtwUploading] = useState(false)
  const [rtwFileName, setRtwFileName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [user?.email])

  const load = async () => {
    setLoading(true)
    try {
      const email = normalizeEmail(user.email)

      const [{ data: submissionRows }, { data: profileRow }] = await Promise.all([
        supabase.from('onboarding_submissions').select('*').ilike('user_email', email).order('created_at', { ascending: false }).limit(1),
        supabase.from('hr_profiles').select('manager_email, manager_name, full_name').ilike('user_email', email).maybeSingle(),
      ])

      const existing = submissionRows?.[0] || null
      setSubmission(existing)
      setManagerInfo(profileRow || null)

      if (existing && ['draft', 'rejected'].includes(existing.status)) {
        setForm({
          first_name: existing.first_name || '',
          last_name: existing.last_name || '',
          dob: existing.dob || '',
          personal_email: existing.personal_email || '',
          phone: existing.phone || '',
          address: existing.address || '',
          emergency_contact: existing.emergency_contact || '',
          emergency_phone: existing.emergency_phone || '',
          bank_name: existing.bank_name || '',
          account_name: existing.account_name || '',
          sort_code: existing.sort_code || '',
          account_number: existing.account_number || '',
          rtw_type: existing.rtw_type || RTW_DOCS[0],
          rtw_expiry: existing.rtw_expiry || '',
          rtw_doc_url: existing.rtw_doc_url || '',
          contract_acknowledged: !!existing.contract_acknowledged,
        })
        if (existing.rtw_doc_url) setRtwFileName('Uploaded document')
      } else if (!existing) {
        setForm({ ...EMPTY_FORM, personal_email: '' })
      }
    } catch (err) {
      console.error('Failed to load onboarding:', err)
      setError('Failed to load onboarding. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleRtwFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setRtwUploading(true)
    setError('')
    try {
      const path = `rtw/${normalizeEmail(user.email)}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('hr-documents').upload(path, file)
      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('hr-documents').getPublicUrl(path)
      updateField('rtw_doc_url', data.publicUrl)
      setRtwFileName(file.name)
      await Haptics.impact({ style: ImpactStyle.Light })
    } catch (err) {
      console.error('RTW upload failed:', err)
      setError(err.message || 'Could not upload the document. Please try again.')
    } finally {
      setRtwUploading(false)
    }
  }

  const validate = () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return 'Please enter your first and last name.'
    if (!form.dob) return 'Please enter your date of birth.'
    if (!form.phone.trim()) return 'Please enter a contact phone number.'
    if (!form.address.trim()) return 'Please enter your address.'
    if (!form.rtw_doc_url) return 'Please upload your right-to-work document.'
    if (!form.contract_acknowledged) return 'Please confirm you have read and accept your contract terms.'
    return ''
  }

  const handleSubmit = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      await Haptics.notification({ type: NotificationType.Error })
      return
    }

    setSubmitting(true)
    setError('')
    await Haptics.impact({ style: ImpactStyle.Medium })

    try {
      const email = normalizeEmail(user.email)
      const payload = {
        ...form,
        user_email: email,
        user_name: `${form.first_name} ${form.last_name}`.trim() || user.name,
        manager_email: managerInfo?.manager_email || null,
        manager_name: managerInfo?.manager_name || null,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        contract_acknowledged_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        declined_by: null,
        declined_at: null,
        decline_reason: null,
      }

      if (submission?.id) {
        const { error: updateError } = await supabase
          .from('onboarding_submissions')
          .update(payload)
          .eq('id', submission.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from('onboarding_submissions')
          .insert([{ ...payload, created_at: new Date().toISOString() }])
        if (insertError) throw insertError
      }

      // Notify admin/manager - portal + email (native push best-effort, see notes)
      const notifyTarget = managerInfo?.manager_email || 'managers'
      await sendManagedNotification({
        userEmail: notifyTarget,
        userName: managerInfo?.manager_name || 'Managers',
        title: '📋 Onboarding submitted',
        message: `${payload.user_name} has submitted their onboarding for review.`,
        link: '/hr/onboarding',
        type: 'info',
        category: 'hr',
        emailSubject: `Onboarding submitted — ${payload.user_name}`,
        emailHtml: `<p>${payload.user_name} has submitted their onboarding, including right-to-work document, and is waiting for review.</p>`,
        sentBy: user?.name || user?.email,
        portalUrl: PORTAL_URL,
      }).catch(() => {})

      await Haptics.notification({ type: NotificationType.Success })
      load()
    } catch (err) {
      console.error('Failed to submit onboarding:', err)
      setError(err.message || 'Failed to submit onboarding. Please try again.')
      await Haptics.notification({ type: NotificationType.Error })
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    if (!confirm('Are you sure you want to logout?')) return
    try {
      await logout()
    } catch (err) {
      alert('Logout failed')
    }
  }

  if (loading) {
    return (
      <div className="onboarding-screen">
        <div className="onboarding-loading">
          <div className="spinner" />
        </div>
      </div>
    )
  }

  // Waiting for review
  if (submission?.status === 'submitted') {
    return (
      <div className="onboarding-screen">
        <div className="onboarding-status">
          <div className="status-icon submitted">
            <Icon name="check" size={40} color="#0066cc" />
          </div>
          <h1>Onboarding Submitted</h1>
          <p>Thanks, {form.first_name || user.name}. Your onboarding details have been sent for review.</p>
          <p className="status-sub">
            {managerInfo?.manager_name ? `${managerInfo.manager_name} will` : 'Your manager will'} review your submission and you'll be notified once it's approved.
          </p>
          <button className="onboarding-logout" onClick={handleLogout}>Logout</button>
        </div>
        {onboardingStyles}
      </div>
    )
  }

  // Declined - show reason, allow resubmit
  const declined = submission?.status === 'rejected'

  return (
    <div className="onboarding-screen">
      <div className="onboarding-header">
        <h1>Complete Your Onboarding</h1>
        <p>Fill in your details below. This information is used for payroll, right-to-work checks, and your employee record.</p>
      </div>

      {declined && (
        <div className="decline-banner">
          <strong>Your submission was declined.</strong>
          {submission.decline_reason && <p>{submission.decline_reason}</p>}
          <p>Please update your details below and resubmit.</p>
        </div>
      )}

      {error && <div className="onboarding-error">{error}</div>}

      <div className="onboarding-form">
        <MobileCard>
          <h3 className="section-title">Personal Information</h3>
          <label className="field-label">First Name</label>
          <input className="field-input" value={form.first_name} onChange={e => updateField('first_name', e.target.value)} />
          <label className="field-label">Last Name</label>
          <input className="field-input" value={form.last_name} onChange={e => updateField('last_name', e.target.value)} />
          <label className="field-label">Date of Birth</label>
          <input className="field-input" type="date" value={form.dob} onChange={e => updateField('dob', e.target.value)} />
          <label className="field-label">Personal Email</label>
          <input className="field-input" type="email" value={form.personal_email} onChange={e => updateField('personal_email', e.target.value)} />
          <label className="field-label">Phone</label>
          <input className="field-input" type="tel" value={form.phone} onChange={e => updateField('phone', e.target.value)} />
          <label className="field-label">Address</label>
          <textarea className="field-textarea" rows={3} value={form.address} onChange={e => updateField('address', e.target.value)} />
        </MobileCard>

        <MobileCard style={{ marginTop: 16 }}>
          <h3 className="section-title">Emergency Contact</h3>
          <label className="field-label">Contact Name</label>
          <input className="field-input" value={form.emergency_contact} onChange={e => updateField('emergency_contact', e.target.value)} />
          <label className="field-label">Contact Phone</label>
          <input className="field-input" type="tel" value={form.emergency_phone} onChange={e => updateField('emergency_phone', e.target.value)} />
        </MobileCard>

        <MobileCard style={{ marginTop: 16 }}>
          <h3 className="section-title">Bank Details</h3>
          <label className="field-label">Bank Name</label>
          <input className="field-input" value={form.bank_name} onChange={e => updateField('bank_name', e.target.value)} />
          <label className="field-label">Account Name</label>
          <input className="field-input" value={form.account_name} onChange={e => updateField('account_name', e.target.value)} />
          <label className="field-label">Sort Code</label>
          <input className="field-input" value={form.sort_code} onChange={e => updateField('sort_code', e.target.value)} placeholder="12-34-56" />
          <label className="field-label">Account Number</label>
          <input className="field-input" value={form.account_number} onChange={e => updateField('account_number', e.target.value)} placeholder="12345678" />
        </MobileCard>

        <MobileCard style={{ marginTop: 16 }}>
          <h3 className="section-title">Right to Work</h3>
          <p className="section-desc">Under UK law, we're required to check your right to work before employment begins.</p>
          <label className="field-label">Document Type</label>
          <select className="field-select" value={form.rtw_type} onChange={e => updateField('rtw_type', e.target.value)}>
            {RTW_DOCS.map(doc => <option key={doc} value={doc}>{doc}</option>)}
          </select>
          <label className="field-label">Document Expiry (if applicable)</label>
          <input className="field-input" type="date" value={form.rtw_expiry} onChange={e => updateField('rtw_expiry', e.target.value)} />
          <label className="field-label">Upload Document</label>
          <label className="rtw-upload">
            <input type="file" accept="image/*,application/pdf" capture="environment" onChange={handleRtwFile} hidden />
            <Icon name="file" size={20} color="#0066cc" />
            <span>{rtwUploading ? 'Uploading...' : rtwFileName || 'Take photo or choose file'}</span>
          </label>
          {form.rtw_doc_url && <div className="rtw-uploaded">✓ Document uploaded</div>}
        </MobileCard>

        <MobileCard style={{ marginTop: 16 }}>
          <h3 className="section-title">Contract & Sign-off</h3>
          <label className="contract-check">
            <input
              type="checkbox"
              checked={form.contract_acknowledged}
              onChange={e => updateField('contract_acknowledged', e.target.checked)}
            />
            <span>I confirm the details above are accurate and I have read and accept my contract terms.</span>
          </label>
        </MobileCard>

        <MobileButton
          variant="primary"
          fullWidth
          loading={submitting}
          onPress={handleSubmit}
        >
          {declined ? 'Resubmit Onboarding' : 'Submit Onboarding'}
        </MobileButton>

        <button className="onboarding-logout" onClick={handleLogout}>Logout</button>
      </div>

      {onboardingStyles}
    </div>
  )
}

const onboardingStyles = (
  <style>{`
    .onboarding-screen {
      min-height: 100vh;
      background: var(--mobile-bg);
      padding-bottom: 60px;
    }

    .onboarding-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--mobile-border);
      border-top-color: var(--mobile-accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .onboarding-header {
      padding: 24px 20px 8px;
    }

    .onboarding-header h1 {
      font-size: 24px;
      font-weight: 700;
      color: var(--mobile-text);
      margin: 0 0 8px 0;
    }

    .onboarding-header p {
      font-size: 14px;
      color: var(--mobile-text-secondary);
      margin: 0;
      line-height: 1.5;
    }

    .decline-banner {
      margin: 16px 20px 0;
      padding: 14px 16px;
      background: rgba(255, 59, 48, 0.1);
      border: 1px solid #ff3b30;
      border-radius: 10px;
      color: var(--mobile-text);
      font-size: 14px;
    }

    .decline-banner p {
      margin: 6px 0 0 0;
      color: var(--mobile-text-secondary);
    }

    .onboarding-error {
      margin: 16px 20px 0;
      padding: 12px 16px;
      background: rgba(255, 59, 48, 0.1);
      border: 1px solid #ff3b30;
      border-radius: 8px;
      color: #ff3b30;
      font-size: 14px;
    }

    .onboarding-form {
      padding: 20px;
    }

    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--mobile-text);
      margin: 0 0 12px 0;
    }

    .section-desc {
      font-size: 13px;
      color: var(--mobile-text-secondary);
      margin: -8px 0 12px 0;
      line-height: 1.5;
    }

    .field-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--mobile-text);
      margin: 12px 0 6px 0;
    }

    .field-label:first-of-type {
      margin-top: 0;
    }

    .field-input,
    .field-select,
    .field-textarea {
      width: 100%;
      min-height: 44px;
      padding: 10px 14px;
      font-size: 16px;
      border: 1px solid var(--mobile-border);
      border-radius: 8px;
      background: var(--mobile-bg);
      color: var(--mobile-text);
      font-family: inherit;
    }

    .field-textarea {
      resize: vertical;
    }

    .rtw-upload {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border: 1px dashed var(--mobile-border);
      border-radius: 8px;
      font-size: 14px;
      color: var(--mobile-text);
      cursor: pointer;
    }

    .rtw-uploaded {
      margin-top: 8px;
      font-size: 13px;
      color: #34c759;
      font-weight: 600;
    }

    .contract-check {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 14px;
      color: var(--mobile-text);
      line-height: 1.5;
    }

    .contract-check input {
      margin-top: 3px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .onboarding-status {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 60px 32px;
    }

    .status-icon {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 102, 204, 0.1);
      margin-bottom: 20px;
    }

    .onboarding-status h1 {
      font-size: 22px;
      font-weight: 700;
      color: var(--mobile-text);
      margin: 0 0 12px 0;
    }

    .onboarding-status p {
      font-size: 15px;
      color: var(--mobile-text-secondary);
      margin: 0 0 8px 0;
      line-height: 1.5;
    }

    .status-sub {
      font-size: 13px !important;
    }

    .onboarding-logout {
      margin-top: 24px;
      background: none;
      border: none;
      color: #ff3b30;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
  `}</style>
)
