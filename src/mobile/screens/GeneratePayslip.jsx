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
import { Screen, Card, Sec, KV, Field, Btn, Note, Empty } from '../components/UI'

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

  if (!allowed) {
    return <Screen title="Generate payslip" onBack={goBack}><Empty icon="lock" title="Only HR can make payslips." /></Screen>
  }
  if (done) {
    return (
      <Screen title="Payslip issued" onBack={goBack}>
        <Card pad className="gp-done">
          <span className="dh-ic" style={{ background: '#EAF7EE', color: '#1E7B3A', width: 56, height: 56, borderRadius: 28 }}><Icon name="check" size={28} /></span>
          <span className="dh-h2">Payslip issued</span>
          <span className="dh-sub">{done.name}'s payslip for {done.periodLabel} (net {gbp(done.net)}) is in their payslips, and they've been notified.</span>
        </Card>
        <Btn onPress={goBack}>Done</Btn>
      </Screen>
    )
  }

  const setD = (k) => (e) => setDetails((d) => ({ ...d, [k]: e.target.value }))
  return (
    <Screen title="Generate payslip" onBack={goBack}>
        <Note tone="error">{error}</Note>
        <Sec>Who and when</Sec>
        <div className="dh-card">
          <Field label="Staff member">
            <select value={email} onChange={(e) => setEmail(e.target.value)}>
              <option value="">Select staff...</option>
              {staffList.map((s) => <option key={s.user_email} value={s.user_email}>{s.full_name || s.user_email}</option>)}
            </select>
          </Field>
          <Field label="Period from">
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </Field>
          <Field label="Period to">
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </Field>
          <Field label="Pay date">
            <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </Field>
          </div>
        <Btn disabled={!email || loading} onPress={load}>{loading ? 'Working out…' : 'Work out pay'}</Btn>

        {slip && (
          <>
            {data.overlaps.length > 0 && <Note tone="warn">A payslip already covers part of this period.</Note>}
            <Sec>Payroll details</Sec>
            <div className="dh-card">
              <Field label="NI number">
                <input value={details.ni_number} onChange={setD('ni_number')} placeholder="AB 12 34 56 C" autoCapitalize="characters" />
              </Field>
              <Field label="Tax code (as in basic PAYE tools)">
                <input value={details.tax_code} onChange={setD('tax_code')} autoCapitalize="characters" />
              </Field>
              <Field label="NI category">
                <input value={details.ni_category} onChange={setD('ni_category')} maxLength={1} autoCapitalize="characters" />
              </Field>
              <Field label="Pay frequency">
                <select value={details.pay_frequency} onChange={setD('pay_frequency')}>
                  {Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <div className="dh-fld"><label>Paid before the portal this tax year (£ gross / tax / NI)</label>
              <div className="gp-three">
                <input className="dh-input" type="number" step="0.01" aria-label="Prior gross" placeholder="Gross" value={details.prior_gross} onChange={setD('prior_gross')} />
                <input className="dh-input" type="number" step="0.01" aria-label="Prior tax" placeholder="Tax" value={details.prior_tax} onChange={setD('prior_tax')} />
                <input className="dh-input" type="number" step="0.01" aria-label="Prior NI" placeholder="NI" value={details.prior_ni} onChange={setD('prior_ni')} />
              </div></div>
            </div>

            <Sec>Pay and deductions</Sec>
            <div className="dh-card">
              <KV k="Rota shifts" v={slip.shifts.length} />
              <KV k="Hours from rota shifts" v={`${slip.hours.toFixed(2)}h`} />
              <Field label="Hourly rate (£)">
                <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
              </Field>
              <Field label="Income tax (worked out {gbp(slip.calculatedTax)})">
                <input type="number" step="0.01" value={taxOverride} placeholder={slip.calculatedTax.toFixed(2)} onChange={(e) => setTaxOverride(e.target.value)} />
              </Field>
              <Field label="Employee NI (worked out {gbp(slip.calculatedNI)})">
                <input type="number" step="0.01" value={niOverride} placeholder={slip.calculatedNI.toFixed(2)} onChange={(e) => setNiOverride(e.target.value)} />
              </Field>
              <Field label="Pension (£)">
                <input type="number" step="0.01" value={pension} onChange={(e) => setPension(e.target.value)} />
              </Field>
              <Field label="Student loan (£)">
                <input type="number" step="0.01" value={studentLoan} onChange={(e) => setStudentLoan(e.target.value)} />
              </Field>
            </div>

            <Sec>{periodLabelOf(periodStart, periodEnd)}</Sec>
            <div className="dh-card">
              <KV k="Gross (before tax)" v={gbp(slip.gross)} />
              <KV k="Income tax" v={`−${gbp(slip.tax)}`} />
              <KV k="National Insurance" v={`−${gbp(slip.ni)}`} />
              {slip.pension > 0 && <KV k="Pension" v={`−${gbp(slip.pension)}`} />}
              {slip.studentLoan > 0 && <KV k="Student loan" v={`−${gbp(slip.studentLoan)}`} />}
              <div className="dh-row" style={{ background: 'var(--mobile-accent-soft)' }}><span className="dh-g"><span className="dh-t">Net (after tax)</span></span><span className="dh-val" style={{ fontSize: 18 }}>{gbp(slip.net)}</span></div>
            </div>
            {slip.notes.map((n) => <Note key={n} tone="warn">{n}</Note>)}
            <span className="dh-sub">Leave tax and NI blank to use the worked-out figures, or type what Basic PAYE Tools says.</span>
            <Btn disabled={issuing} onPress={issue}>{issuing ? 'Issuing…' : `Issue payslip to ${data.employee.name}`}</Btn>
          </>
        )}
        <style>{`
          .gp-three { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
          .gp-three .dh-input { padding: 8px 10px; }
          .gp-done { align-items: center; text-align: center; }
        `}</style>
    </Screen>
  )
}
