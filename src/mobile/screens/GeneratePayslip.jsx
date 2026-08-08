import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { sendManagedNotification } from '../../utils/notificationPreferences'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'

const PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'

function formatDate(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function defaultPeriod() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { start: formatDate(start), end: formatDate(end) }
}

export default function MobileGeneratePayslip({ goBack, isAdmin, staffEmail: initialStaffEmail }) {
  const { user } = useAuth()
  const [staffList, setStaffList] = useState([])
  const [staffEmail, setStaffEmail] = useState(initialStaffEmail || '')
  const [staffRecord, setStaffRecord] = useState(null)
  const period = defaultPeriod()
  const [periodStart, setPeriodStart] = useState(period.start)
  const [periodEnd, setPeriodEnd] = useState(period.end)
  const [mode, setMode] = useState('hours') // 'hours' | 'file'
  const [computedHours, setComputedHours] = useState(null)
  const [computing, setComputing] = useState(false)
  const [hourlyRateOverride, setHourlyRateOverride] = useState('')
  const [file, setFile] = useState(null)
  const [fileName, setFileName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (isAdmin) loadStaffList()
  }, [isAdmin])

  useEffect(() => {
    if (staffEmail) loadStaffRecord()
  }, [staffEmail])

  useEffect(() => {
    if (mode === 'hours' && staffEmail && periodStart && periodEnd) computeHours()
  }, [mode, staffEmail, periodStart, periodEnd])

  const loadStaffList = async () => {
    const { data } = await supabase.from('hr_profiles').select('user_email, full_name').order('full_name')
    setStaffList(data || [])
  }

  const loadStaffRecord = async () => {
    const { data } = await supabase.from('staff').select('*').eq('email', staffEmail).maybeSingle()
    setStaffRecord(data || null)
    if (data?.hourly_rate) setHourlyRateOverride(String(data.hourly_rate))
  }

  const computeHours = async () => {
    setComputing(true)
    try {
      const { data, error: attError } = await supabase
        .from('attendance')
        .select('clock_in, clock_out')
        .eq('user_email', staffEmail)
        .gte('date', periodStart)
        .lte('date', periodEnd)
        .not('clock_out', 'is', null)

      if (attError) throw attError

      const totalHours = (data || []).reduce((sum, row) => {
        const start = new Date(row.clock_in)
        const end = new Date(row.clock_out)
        return sum + Math.max(0, (end - start) / (1000 * 60 * 60))
      }, 0)

      setComputedHours(totalHours)
    } catch (err) {
      console.error('Failed to compute hours:', err)
      setComputedHours(null)
    } finally {
      setComputing(false)
    }
  }

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setFileName(f.name)
  }

  const rate = parseFloat(hourlyRateOverride) || 0
  const grossPay = computedHours != null ? computedHours * rate : 0

  const staffName = staffList.find(s => s.user_email === staffEmail)?.full_name || staffEmail

  const handleSubmit = async () => {
    setError('')

    if (!staffEmail) {
      setError('Please select a staff member.')
      return
    }
    if (mode === 'file' && !file) {
      setError('Please choose a file to upload.')
      return
    }
    if (mode === 'hours' && (computedHours == null || rate <= 0)) {
      setError('Please set an hourly rate and ensure hours have been calculated.')
      return
    }

    setSubmitting(true)
    await Haptics.impact({ style: ImpactStyle.Medium })

    try {
      const periodLabel = new Date(periodEnd + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      let fileUrl = null
      let filePath = null

      if (mode === 'file') {
        const path = `payslips/${staffEmail.toLowerCase()}/${Date.now()}-${file.name}`
        const { error: uploadError } = await supabase.storage.from('hr-documents').upload(path, file)
        if (uploadError) throw uploadError
        const { data: publicData } = supabase.storage.from('hr-documents').getPublicUrl(path)
        fileUrl = publicData.publicUrl
        filePath = path
      }

      const { error: insertError } = await supabase
        .from('payslips')
        .insert([{
          user_email: staffEmail.toLowerCase(),
          user_name: staffName,
          period: periodLabel,
          period_start: periodStart,
          period_end: periodEnd,
          source: mode,
          hours_worked: mode === 'hours' ? computedHours : null,
          hourly_rate: mode === 'hours' ? rate : null,
          gross_pay: mode === 'hours' ? grossPay : null,
          file_url: fileUrl,
          file_path: filePath,
          uploaded_by: user?.email || null,
          created_by: user?.email || null,
          uploaded_at: new Date().toISOString(),
          viewed: false,
        }])

      if (insertError) throw insertError

      await sendManagedNotification({
        userEmail: staffEmail,
        userName: staffName,
        title: '💷 Payslip Available',
        message: `Your payslip for ${periodLabel} is now available in the app.`,
        link: '/hr/payslips',
        type: 'info',
        category: 'hr',
        emailSubject: `Payslip available — ${periodLabel}`,
        emailHtml: `<p>Your payslip for ${periodLabel} is now available. Open the app to view it.</p>`,
        sentBy: user?.name || user?.email,
        portalUrl: PORTAL_URL,
      }).catch(() => {})

      await Haptics.notification({ type: NotificationType.Success })
      setSuccess(true)
    } catch (err) {
      console.error('Failed to generate payslip:', err)
      setError(err.message || 'Failed to generate payslip. Please try again.')
      await Haptics.notification({ type: NotificationType.Error })
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="mobile-screen">
        <div className="mobile-screen-header">
          <button className="mobile-back-btn" onClick={goBack}>
            <Icon name="chevronLeft" size={24} color="#0066cc" />
          </button>
          <h1>Payslips</h1>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--mobile-text-secondary)' }}>
          You don't have access to generate payslips.
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="mobile-screen">
        <div className="onboarding-status">
          <div className="status-icon">
            <Icon name="check" size={40} color="#34c759" />
          </div>
          <h1>Payslip Sent</h1>
          <p>{staffName} has been notified and can now view their payslip in the app.</p>
          <button className="gp-primary-btn" onClick={goBack}>Done</button>
        </div>
        {payslipStyles}
      </div>
    )
  }

  return (
    <div className="mobile-screen">
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          <Icon name="chevronLeft" size={24} color="#0066cc" />
        </button>
        <h1>Generate Payslip</h1>
        <div style={{ width: 60 }} />
      </div>

      <div style={{ padding: 20, paddingBottom: 100 }}>
        {error && <div className="gp-error">{error}</div>}

        <MobileCard>
          <h3 className="gp-section">Staff Member</h3>
          <select className="gp-select" value={staffEmail} onChange={e => setStaffEmail(e.target.value)}>
            <option value="">Select staff...</option>
            {staffList.map(s => (
              <option key={s.user_email} value={s.user_email}>{s.full_name || s.user_email}</option>
            ))}
          </select>
        </MobileCard>

        <MobileCard style={{ marginTop: 16 }}>
          <h3 className="gp-section">Pay Period</h3>
          <label className="gp-label">Start Date</label>
          <input className="gp-input" type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
          <label className="gp-label">End Date</label>
          <input className="gp-input" type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
        </MobileCard>

        <MobileCard style={{ marginTop: 16 }}>
          <h3 className="gp-section">Method</h3>
          <div className="gp-mode-row">
            <button className={`gp-mode-btn ${mode === 'hours' ? 'active' : ''}`} onClick={() => setMode('hours')}>
              Calculate from Hours
            </button>
            <button className={`gp-mode-btn ${mode === 'file' ? 'active' : ''}`} onClick={() => setMode('file')}>
              Upload File
            </button>
          </div>

          {mode === 'hours' ? (
            <>
              <label className="gp-label">Hourly Rate (£)</label>
              <input
                className="gp-input"
                type="number"
                step="0.01"
                min="0"
                value={hourlyRateOverride}
                onChange={e => setHourlyRateOverride(e.target.value)}
                placeholder="0.00"
              />
              <div className="gp-hours-summary">
                {computing ? (
                  <span>Calculating hours from clock-ins...</span>
                ) : computedHours != null ? (
                  <>
                    <div className="gp-hours-row"><span>Hours worked</span><span>{computedHours.toFixed(2)}</span></div>
                    <div className="gp-hours-row"><span>Hourly rate</span><span>£{rate.toFixed(2)}</span></div>
                    <div className="gp-hours-row total"><span>Gross pay</span><span>£{grossPay.toFixed(2)}</span></div>
                  </>
                ) : (
                  <span>Select a staff member and period to calculate hours.</span>
                )}
              </div>
            </>
          ) : (
            <>
              <label className="gp-label">Payslip File</label>
              <label className="gp-upload">
                <input type="file" accept="application/pdf,image/*" onChange={handleFileChange} hidden />
                <Icon name="file" size={20} color="#0066cc" />
                <span>{fileName || 'Choose PDF or image'}</span>
              </label>
            </>
          )}
        </MobileCard>

        <button className="gp-primary-btn" disabled={submitting} onClick={handleSubmit}>
          {submitting ? 'Sending...' : 'Generate & Send Payslip'}
        </button>
      </div>

      {payslipStyles}
    </div>
  )
}

const payslipStyles = (
  <style>{`
    .gp-error {
      margin-bottom: 16px;
      padding: 12px 16px;
      background: rgba(255,59,48,0.1);
      border: 1px solid #ff3b30;
      border-radius: 8px;
      color: #ff3b30;
      font-size: 14px;
    }

    .gp-section {
      font-size: 16px;
      font-weight: 600;
      color: var(--mobile-text);
      margin: 0 0 12px 0;
    }

    .gp-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--mobile-text);
      margin: 12px 0 6px 0;
    }

    .gp-label:first-of-type {
      margin-top: 0;
    }

    .gp-select,
    .gp-input {
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

    .gp-mode-row {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .gp-mode-btn {
      flex: 1;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid var(--mobile-border);
      background: var(--mobile-bg);
      color: var(--mobile-text);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }

    .gp-mode-btn.active {
      background: #0066cc;
      color: white;
      border-color: #0066cc;
    }

    .gp-hours-summary {
      margin-top: 16px;
      padding: 14px;
      background: var(--mobile-bg);
      border-radius: 8px;
      font-size: 14px;
      color: var(--mobile-text-secondary);
    }

    .gp-hours-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      color: var(--mobile-text);
    }

    .gp-hours-row.total {
      font-weight: 700;
      border-top: 1px solid var(--mobile-border);
      margin-top: 6px;
      padding-top: 10px;
    }

    .gp-upload {
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

    .gp-primary-btn {
      width: 100%;
      margin-top: 20px;
      padding: 14px;
      background: #0066cc;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }

    .gp-primary-btn:disabled {
      opacity: 0.6;
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
      background: rgba(52,199,89,0.1);
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
      margin: 0;
      line-height: 1.5;
    }
  `}</style>
)
