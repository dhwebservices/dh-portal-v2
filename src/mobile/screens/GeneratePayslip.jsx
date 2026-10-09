import { useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { sendManagedNotification } from '../../utils/notificationPreferences'
import { buildPayslip, gbp, formatNI, validNI, cleanNI, FREQUENCY_LABEL, taxYearOf } from '../../utils/payroll'
import { buildPayslipPdf, pdfToBase64 } from '../../utils/payslipPdf'
import { callPayroll } from '../../utils/payrollApi'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function lastMonth() {
  const now = new Date()
  return { start: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), end: iso(new Date(now.getFullYear(), now.getMonth(), 0)) }
}
const periodLabelOf = (start, end) => {
  const s = new Date(`${start}T12:00:00`); const e = new Date(`${end}T12:00:00`)
  const whole = s.getDate() === 1 && s.getMonth() === e.getMonth() && new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate() === e.getDate()
  return whole ? s.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : `${s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/**
 * Payslips from the rota, on the phone: the same working-out, PDF and
 * private storage as HR > Payslips on the web (see PayslipGenerator.jsx).
 */
export default function MobileGeneratePayslip({ goBack, isAdmin, can, staffEmail: initialStaffEmail }) {
  const { instance, accounts } = useMsal()
  const { user } = useAuth()
  const allowed = isAdmin || can?.('hr_profiles')
  const def = lastMonth()
  const [staffList, setStaffList] = useState([])
  const [email, setEmail] = useState(initialStaffEmail || '')
  const [periodStart, setPeriodStart] = useState(def.start)
  const [periodEnd, setPeriodEnd] = useState(def.end)
  const [payDate, setPayDate] = useState(def.end)
  const [data, setData] = useState(null)
  const [details, setDetails] = useState(null)
  const [rate, setRate] = useState('')
  const [taxOverride, setTaxOverride] = useState('')
  const [niOverride, setNiOverride] = useState('')
  const [pension, setPension] = useState('')
  const [studentLoan, setStudentLoan] = useState('')
  const [loading, setLoading] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  const api = (route, body) => callPayroll(instance, accounts?.[0], route, body, { interactive: true })

  useEffect(() => {
    if (allowed) supabase.from('hr_profiles').select('user_email, full_name').order('full_name').then(({ data: d }) => setStaffList(d || []))
  }, [allowed])
  useEffect(() => { setData(null) }, [email, periodStart, periodEnd, payDate])

  const load = async () => {
    setLoading(true); setError('')
    try {
      const d = await api('preview', { email, periodStart, periodEnd, payDate })
      setData(d)
      setRate(String(d.employee.hourlyRate || ''))
      setDetails({
        ni_number: d.details?.ni_number ? formatNI(d.details.ni_number) : '',
        tax_code: d.details?.tax_code || 'C1257L', ni_category: d.details?.ni_category || 'A',
        pay_frequency: d.details?.pay_frequency || 'monthly', employee_number: d.details?.employee_number || '',
        prior_tax_year: d.details?.prior_tax_year || taxYearOf(payDate),
        prior_gross: d.details?.prior_gross ?? 0, prior_tax: d.details?.prior_tax ?? 0, prior_ni: d.details?.prior_ni ?? 0,
      })
      setTaxOverride(''); setNiOverride('')
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const slip = useMemo(() => {
    if (!data || !details) return null
    return buildPayslip({
      shifts: data.shifts.filter((s) => s.published !== false), hourlyRate: rate, frequency: details.pay_frequency, payDate,
      taxCode: details.tax_code, niCategory: details.ni_category,
      grossToDate: data.toDate.gross, taxToDate: data.toDate.tax, niToDate: data.toDate.ni,
      taxOverride, niOverride, pension, studentLoan,
    })
  }, [data, details, rate, payDate, taxOverride, niOverride, pension, studentLoan])

  const issue = async () => {
    setError('')
    if (!validNI(details.ni_number)) { setError('Add a valid NI number first.'); return }
    if (!slip.hours) { setError('No published rota shifts in this period.'); return }
    setIssuing(true)
    await Haptics.impact({ style: ImpactStyle.Medium })
    try {
      // Save the payroll details with the payslip so the next one starts from them.
      await api('details', { email, ...details, ni_number: cleanNI(details.ni_number) })
      const periodLabel = periodLabelOf(periodStart, periodEnd)
      const pdf = await buildPayslipPdf(slip, {
        employee: data.employee, details: { ...details, ni_number: cleanNI(details.ni_number) },
        periodStart, periodEnd, payDate, periodLabel,
      })
      await api('issue', {
        email, name: data.employee.name, periodLabel, periodStart, periodEnd, payDate,
        frequency: details.pay_frequency, taxCode: details.tax_code, niCategory: details.ni_category,
        figures: slip, pdfBase64: pdfToBase64(pdf),
      })
      await sendManagedNotification({
        event: 'payslip_available', userEmail: email, userName: data.employee.name,
        title: 'Payslip available', message: `Your payslip for ${periodLabel} is ready to view.`,
        link: '/hr/payslips', type: 'info', category: 'hr', sentBy: user?.name || user?.email,
      }).catch(() => {})
      await Haptics.notification({ type: NotificationType.Success })
      setDone({ name: data.employee.name, net: slip.net, periodLabel })
    } catch (e) {
      setError(e.message)
      await Haptics.notification({ type: NotificationType.Error })
    }
    setIssuing(false)
  }

  const header = (
    <div className="mobile-screen-header">
      <button className="mobile-back-btn" onClick={goBack}><Icon name="chevronLeft" size={24} color="var(--mobile-accent)" /></button>
      <h1>Generate Payslip</h1>
      <div style={{ width: 60 }} />
    </div>
  )

  if (!allowed) {
    return <div className="mobile-screen">{header}<div style={{ padding: 40, textAlign: 'center', color: 'var(--mobile-text-secondary)' }}>Only HR can make payslips.</div></div>
  }
  if (done) {
    return (
      <div className="mobile-screen">
        <div className="onboarding-status">
          <div className="status-icon"><Icon name="check" size={40} color="#34c759" /></div>
          <h1>Payslip issued</h1>
          <p>{done.name}'s payslip for {done.periodLabel} (net {gbp(done.net)}) is in their payslips, and they've been notified.</p>
          <button className="gp-primary-btn" onClick={goBack}>Done</button>
        </div>
        {payslipStyles}
      </div>
    )
  }

  const setD = (k) => (e) => setDetails((d) => ({ ...d, [k]: e.target.value }))
  return (
    <div className="mobile-screen">
      {header}
      <div style={{ padding: 20, paddingBottom: 100, display: 'grid', gap: 14 }}>
        {error && <div className="gp-error">{error}</div>}
        <MobileCard>
          <h3 className="gp-section">Who and when</h3>
          <label className="gp-label">Staff member</label>
          <select className="gp-select" value={email} onChange={(e) => setEmail(e.target.value)}>
            <option value="">Select staff...</option>
            {staffList.map((s) => <option key={s.user_email} value={s.user_email}>{s.full_name || s.user_email}</option>)}
          </select>
          <label className="gp-label">Period from</label>
          <input className="gp-input" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          <label className="gp-label">Period to</label>
          <input className="gp-input" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          <label className="gp-label">Pay date</label>
          <input className="gp-input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          <button className="gp-primary-btn" style={{ marginTop: 14 }} disabled={!email || loading} onClick={load}>{loading ? 'Working out...' : 'Work out pay'}</button>
        </MobileCard>

        {slip && (
          <>
            {data.overlaps.length > 0 && <div className="gp-error">A payslip already covers part of this period.</div>}
            <MobileCard>
              <h3 className="gp-section">Payroll details</h3>
              <label className="gp-label">NI number</label>
              <input className="gp-input" value={details.ni_number} onChange={setD('ni_number')} placeholder="AB 12 34 56 C" autoCapitalize="characters" />
              <label className="gp-label">Tax code (as in Basic PAYE Tools)</label>
              <input className="gp-input" value={details.tax_code} onChange={setD('tax_code')} autoCapitalize="characters" />
              <label className="gp-label">NI category</label>
              <input className="gp-input" value={details.ni_category} onChange={setD('ni_category')} maxLength={1} autoCapitalize="characters" />
              <label className="gp-label">Pay frequency</label>
              <select className="gp-select" value={details.pay_frequency} onChange={setD('pay_frequency')}>
                {Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <label className="gp-label">Paid before the portal this tax year (£ gross / tax / NI)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <input className="gp-input" type="number" step="0.01" value={details.prior_gross} onChange={setD('prior_gross')} />
                <input className="gp-input" type="number" step="0.01" value={details.prior_tax} onChange={setD('prior_tax')} />
                <input className="gp-input" type="number" step="0.01" value={details.prior_ni} onChange={setD('prior_ni')} />
              </div>
            </MobileCard>

            <MobileCard>
              <h3 className="gp-section">Pay and deductions</h3>
              <div className="gp-hours-summary">
                <div className="gp-hours-row"><span>Rota shifts</span><span>{slip.shifts.length}</span></div>
                <div className="gp-hours-row"><span>Hours</span><span>{slip.hours.toFixed(2)}</span></div>
              </div>
              <label className="gp-label">Hourly rate (£)</label>
              <input className="gp-input" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
              <label className="gp-label">Income tax (worked out {gbp(slip.calculatedTax)})</label>
              <input className="gp-input" type="number" step="0.01" value={taxOverride} placeholder={slip.calculatedTax.toFixed(2)} onChange={(e) => setTaxOverride(e.target.value)} />
              <label className="gp-label">Employee NI (worked out {gbp(slip.calculatedNI)})</label>
              <input className="gp-input" type="number" step="0.01" value={niOverride} placeholder={slip.calculatedNI.toFixed(2)} onChange={(e) => setNiOverride(e.target.value)} />
              <label className="gp-label">Pension (£)</label>
              <input className="gp-input" type="number" step="0.01" value={pension} onChange={(e) => setPension(e.target.value)} />
              <label className="gp-label">Student loan (£)</label>
              <input className="gp-input" type="number" step="0.01" value={studentLoan} onChange={(e) => setStudentLoan(e.target.value)} />
            </MobileCard>

            <MobileCard>
              <h3 className="gp-section">{periodLabelOf(periodStart, periodEnd)}</h3>
              <div className="gp-hours-summary">
                <div className="gp-hours-row"><span>Gross (before tax)</span><span>{gbp(slip.gross)}</span></div>
                <div className="gp-hours-row"><span>Income tax</span><span>−{gbp(slip.tax)}</span></div>
                <div className="gp-hours-row"><span>National Insurance</span><span>−{gbp(slip.ni)}</span></div>
                {slip.pension > 0 && <div className="gp-hours-row"><span>Pension</span><span>−{gbp(slip.pension)}</span></div>}
                {slip.studentLoan > 0 && <div className="gp-hours-row"><span>Student loan</span><span>−{gbp(slip.studentLoan)}</span></div>}
                <div className="gp-hours-row total"><span>Net (after tax)</span><span>{gbp(slip.net)}</span></div>
              </div>
              {slip.notes.map((n) => <p key={n} style={{ fontSize: 13, color: '#ff9500' }}>{n}</p>)}
              <p style={{ fontSize: 12, color: 'var(--mobile-text-secondary)' }}>Leave tax and NI blank to use the worked-out figures, or type what Basic PAYE Tools says.</p>
              <button className="gp-primary-btn" disabled={issuing} onClick={issue}>{issuing ? 'Issuing...' : `Issue payslip to ${data.employee.name}`}</button>
            </MobileCard>
          </>
        )}
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
      background: var(--mobile-accent);
      color: white;
      border-color: var(--mobile-accent);
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
      background: var(--mobile-accent);
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
