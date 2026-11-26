import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { sendManagedNotification } from '../../utils/notificationPreferences'
import { normalizeEmail } from '../../utils/hrProfileSync'
import { Chip } from '../components/DH'
import { Card, Sec, Field, ToggleRow, Btn, Note } from '../components/UI'
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
    return <Shell><div className="dh-body"><p className="dh-note2">Loading…</p></div></Shell>
  }

  // Waiting for review
  if (submission?.status === 'submitted') {
    return (
      <Shell>
        <div className="dh-body ob-done">
          <span className="ob-tick"><Icon name="check" size={36} /></span>
          <h1 className="dh-h1" style={{ fontSize: 26 }}>Onboarding sent</h1>
          <p className="dh-note2" style={{ fontSize: 15 }}>Thanks, {form.first_name || user.name}. Your onboarding details have been sent for review.</p>
          <p className="dh-note2">
            {managerInfo?.manager_name ? `${managerInfo.manager_name} will` : 'Your manager will'} review your submission and you'll be notified once it's approved.
          </p>
          <Btn variant="outline" onPress={handleLogout}>Sign out</Btn>
        </div>
      </Shell>
    )
  }

  // Declined - show reason, allow resubmit
  const declined = submission?.status === 'rejected'
  const steps = [
    ['Personal information', !!(form.first_name && form.last_name && form.dob && form.phone)],
    ['Emergency contact', !!(form.emergency_contact && form.emergency_phone)],
    ['Bank details', !!(form.account_name && form.sort_code && form.account_number)],
    ['Right to work', !!form.rtw_doc_url],
    ['Contract and sign-off', !!form.contract_acknowledged],
  ]
  const doneCount = steps.filter(([, ok]) => ok).length

  return (
    <Shell>
      <div className="dh-body">
        <span className="dh-sub">{doneCount} of {steps.length} done</span>
        <div className="ob-bar"><div style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
        <h1 className="dh-h1" style={{ fontSize: 26 }}>Welcome to DH</h1>
        <p className="dh-note2" style={{ fontSize: 15 }}>A few details for payroll, right-to-work checks and your employee record. It takes about five minutes.</p>

        {declined && (
          <Card pad tone="danger">
            <span className="dh-t">Your submission was declined.</span>
            {submission.decline_reason && <span className="dh-sub">{submission.decline_reason}</span>}
            <span className="dh-sub">Please update your details below and resubmit.</span>
          </Card>
        )}

        <div className="dh-card">
          {steps.map(([name, ok], i) => (
            <div key={name} className="dh-row">
              <Chip tone={ok ? 'green' : 'neutral'}>{i + 1}</Chip>
              <span className="dh-g"><span className="dh-t">{name}</span></span>
              {ok && <span className="dh-sub">Done</span>}
            </div>
          ))}
        </div>

        <Note tone="error">{error}</Note>


        <Sec>Personal information</Sec>
        <div className="dh-card">
          <Field label="First name">
            <input value={form.first_name} onChange={e => updateField('first_name', e.target.value)} />
          </Field>
          <Field label="Last name">
            <input value={form.last_name} onChange={e => updateField('last_name', e.target.value)} />
          </Field>
          <Field label="Date of birth">
            <input type="date" value={form.dob} onChange={e => updateField('dob', e.target.value)} />
          </Field>
          <Field label="Personal email">
            <input type="email" value={form.personal_email} onChange={e => updateField('personal_email', e.target.value)} />
          </Field>
          <Field label="Phone">
            <input type="tel" value={form.phone} onChange={e => updateField('phone', e.target.value)} />
          </Field>
          <Field label="Address">
            <textarea rows={3} value={form.address} onChange={e => updateField('address', e.target.value)} />
          </Field>
        </div>

        <Sec>Emergency contact</Sec>
        <div className="dh-card">
          <Field label="Contact name">
            <input value={form.emergency_contact} onChange={e => updateField('emergency_contact', e.target.value)} />
          </Field>
          <Field label="Contact phone">
            <input type="tel" value={form.emergency_phone} onChange={e => updateField('emergency_phone', e.target.value)} />
          </Field>
        </div>

        <Sec>Bank details</Sec>
        <div className="dh-card">
          <Field label="Bank name">
            <input value={form.bank_name} onChange={e => updateField('bank_name', e.target.value)} />
          </Field>
          <Field label="Account name">
            <input value={form.account_name} onChange={e => updateField('account_name', e.target.value)} />
          </Field>
          <Field label="Sort code">
            <input value={form.sort_code} onChange={e => updateField('sort_code', e.target.value)} placeholder="12-34-56" />
          </Field>
          <Field label="Account number">
            <input value={form.account_number} onChange={e => updateField('account_number', e.target.value)} placeholder="12345678" />
          </Field>
        </div>

        <Sec>Right to work</Sec>
        <div className="dh-card">
          <div className="dh-row"><span className="dh-sub">Under UK law, we're required to check your right to work before employment begins.</span></div>
          <Field label="Document type">
            <select value={form.rtw_type} onChange={e => updateField('rtw_type', e.target.value)}>
              {RTW_DOCS.map(doc => <option key={doc} value={doc}>{doc}</option>)}
            </select>
          </Field>
          <Field label="Document expiry (if applicable)">
            <input type="date" value={form.rtw_expiry} onChange={e => updateField('rtw_expiry', e.target.value)} />
          </Field>
          <label className="dh-row" style={{ cursor: 'pointer' }}>
            <input type="file" accept="image/*,application/pdf" capture="environment" onChange={handleRtwFile} hidden />
            <span className="dh-ic"><Icon name="file" size={18} /></span>
            <span className="dh-g"><span className="dh-t" style={{ color: 'var(--mobile-accent)' }}>{rtwUploading ? 'Uploading…' : rtwFileName || 'Take a photo or choose a file'}</span><span className="dh-sub">Upload the document</span></span>
            {form.rtw_doc_url && <Chip tone="green">Uploaded</Chip>}
          </label>
        </div>

        <Sec>Contract and sign-off</Sec>
        <div className="dh-card">
          <ToggleRow
            title="I confirm"
            sub="The details above are accurate and I have read and accept my contract terms."
            on={!!form.contract_acknowledged}
            onChange={(v) => updateField('contract_acknowledged', v)}
          />
        </div>

        <Btn onPress={handleSubmit} disabled={submitting}>{submitting ? 'Sending…' : declined ? 'Resubmit' : 'Send for review'}</Btn>
        <Btn variant="ghost" onPress={handleLogout}>Sign out</Btn>
      </div>
    </Shell>
  )
}

// Onboarding is shown before the app shell (MobileApp returns it on its own),
// so it sets the DH colour tokens itself. Module-level so inputs keep focus.
function Shell({ children }) {
  return (
    <div className="ob-root">
      <style>{OB_CSS}</style>
      {children}
    </div>
  )
}

const OB_CSS = `
  .ob-root {
    --mobile-bg: #f3f5f9; --mobile-card: #ffffff; --mobile-text: #0e1726; --mobile-text-secondary: #556172;
    --mobile-border: #e1e6ee; --mobile-accent: #0b5fd0; --mobile-accent-soft: #e3eeff; --mobile-on-accent: #fff;
    min-height: 100vh; height: 100vh; overflow-y: auto; -webkit-overflow-scrolling: touch;
    background: var(--mobile-bg); color: var(--mobile-text); font-family: 'IBM Plex Sans', system-ui, sans-serif;
    padding-top: calc(env(safe-area-inset-top) + 12px); padding-bottom: env(safe-area-inset-bottom);
  }
  .ob-root * { box-sizing: border-box; }
  .ob-bar { height: 6px; border-radius: 3px; background: var(--mobile-border); overflow: hidden; }
  .ob-bar > div { height: 6px; border-radius: 3px; background: var(--mobile-accent); transition: width .3s; }
  .ob-done { align-items: center; text-align: center; padding-top: 60px; }
  .ob-tick { width: 72px; height: 72px; border-radius: 36px; background: var(--mobile-accent-soft); color: var(--mobile-accent); display: flex; align-items: center; justify-content: center; }
`
