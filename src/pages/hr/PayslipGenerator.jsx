import { useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useAuth } from '../../contexts/AuthContext'
import { sendManagedNotification } from '../../utils/notificationPreferences'
import { Button, FormField, FormLabel, FormInput, FormSelect, FormHint, Alert, StatusBadge } from '../../components/ds'
import { buildPayslip, gbp, formatNI, validNI, cleanNI, FREQUENCY_LABEL, taxYearOf } from '../../utils/payroll'
import { buildPayslipPdf, pdfToBase64 } from '../../utils/payslipPdf'
import { callPayroll } from '../../utils/payrollApi'

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function lastMonth() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 0)
  return { start: iso(start), end: iso(end) }
}
const periodLabelOf = (start, end) => {
  const s = new Date(`${start}T12:00:00`); const e = new Date(`${end}T12:00:00`)
  const wholeMonth = s.getDate() === 1 && new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate() === e.getDate() && s.getMonth() === e.getMonth()
  return wholeMonth
    ? s.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : `${s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

const card = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)', padding: 20 }
const sectionTitle = { fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 12 }
const grid = (n) => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, gap: 14 })
const row = { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, color: 'var(--color-text-primary)' }
const money = (v) => (v === '' || v === null || v === undefined ? '' : v)

/**
 * Payslips from the rota: pick someone and a pay period, check their shifts,
 * payroll details and the tax and NI worked out (overridable to match HMRC
 * Basic PAYE Tools), then issue a branded PDF they can open in the portal.
 */
export default function PayslipGenerator({ staff, onIssued }) {
  const { instance, accounts } = useMsal()
  const { user } = useAuth()
  const account = accounts?.[0]
  const def = lastMonth()
  const [email, setEmail] = useState('')
  const [periodStart, setPeriodStart] = useState(def.start)
  const [periodEnd, setPeriodEnd] = useState(def.end)
  const [payDate, setPayDate] = useState(def.end)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [details, setDetails] = useState(null)
  const [detailsSaved, setDetailsSaved] = useState('')
  const [excluded, setExcluded] = useState(new Set())
  const [rate, setRate] = useState('')
  const [extraPay, setExtraPay] = useState([])
  const [taxOverride, setTaxOverride] = useState('')
  const [niOverride, setNiOverride] = useState('')
  const [pension, setPension] = useState('')
  const [studentLoan, setStudentLoan] = useState('')
  const [others, setOthers] = useState([])
  const [issuing, setIssuing] = useState(false)
  const [done, setDone] = useState('')

  const api = (route, body) => callPayroll(instance, account, route, body)

  const load = async () => {
    if (!email) return
    setLoading(true); setError(''); setDone('')
    try {
      const d = await api('preview', { email, periodStart, periodEnd, payDate })
      setData(d)
      setRate(String(d.employee.hourlyRate || ''))
      setDetails({
        ni_number: d.details?.ni_number ? formatNI(d.details.ni_number) : '',
        tax_code: d.details?.tax_code || 'C1257L',
        ni_category: d.details?.ni_category || 'A',
        pay_frequency: d.details?.pay_frequency || 'monthly',
        employee_number: d.details?.employee_number || '',
        prior_tax_year: d.details?.prior_tax_year || taxYearOf(payDate),
        prior_gross: d.details?.prior_gross ?? 0,
        prior_tax: d.details?.prior_tax ?? 0,
        prior_ni: d.details?.prior_ni ?? 0,
      })
      // Unpublished shifts are drafts: left out unless ticked.
      setExcluded(new Set(d.shifts.filter((s) => s.published === false).map((s) => s.id)))
      setTaxOverride(''); setNiOverride('')
    } catch (e) {
      setError(e.message); setData(null)
    }
    setLoading(false)
  }
  useEffect(() => { setData(null) }, [email, periodStart, periodEnd, payDate])

  const saveDetails = async () => {
    setError(''); setDetailsSaved('')
    if (details.ni_number && !validNI(details.ni_number)) { setError('That NI number is not valid (two letters, six numbers, a letter A–D).'); return }
    try {
      await api('details', { email, ...details, ni_number: details.ni_number ? cleanNI(details.ni_number) : null })
      setDetailsSaved('Saved')
      await load()
    } catch (e) { setError(e.message) }
  }

  // Pay before the portal counts only for the same tax year; the server adds
  // portal payslips already issued this year on top.
  const slip = useMemo(() => {
    if (!data || !details) return null
    const shifts = data.shifts.filter((s) => !excluded.has(s.id))
    return buildPayslip({
      shifts, hourlyRate: rate, frequency: details.pay_frequency, payDate,
      taxCode: details.tax_code, niCategory: details.ni_category,
      grossToDate: data.toDate.gross, taxToDate: data.toDate.tax, niToDate: data.toDate.ni,
      taxOverride, niOverride, pension, studentLoan, otherDeductions: others, extraPay,
    })
  }, [data, details, excluded, rate, payDate, taxOverride, niOverride, pension, studentLoan, others, extraPay])

  const info = () => ({
    employee: data.employee, details: { ...details, ni_number: cleanNI(details.ni_number) },
    periodStart, periodEnd, payDate, periodLabel: periodLabelOf(periodStart, periodEnd),
  })

  const previewPdf = async () => {
    const pdf = await buildPayslipPdf(slip, info())
    window.open(URL.createObjectURL(pdf.output('blob')), '_blank', 'noreferrer')
  }

  const issue = async () => {
    setError(''); setDone('')
    if (!details.ni_number) { setError('Add their NI number first (and save it).'); return }
    if (!slip.hours) { setError('There are no shifts ticked in this period.'); return }
    if (data.overlaps.length && !window.confirm('A payslip already covers part of this period. Issue another one anyway?')) return
    setIssuing(true)
    try {
      const i = info()
      const pdf = await buildPayslipPdf(slip, i)
      await api('issue', {
        email, name: data.employee.name, periodLabel: i.periodLabel, periodStart, periodEnd, payDate,
        frequency: details.pay_frequency, taxCode: details.tax_code, niCategory: details.ni_category,
        figures: slip, pdfBase64: pdfToBase64(pdf),
      })
      await sendManagedNotification({
        event: 'payslip_available', userEmail: email, userName: data.employee.name,
        title: 'Payslip available', message: `Your payslip for ${i.periodLabel} is ready to view.`,
        link: '/hr/payslips', type: 'info', category: 'hr', sentBy: user?.name || user?.email,
      }).catch(() => {})
      setDone(`Payslip for ${i.periodLabel} issued to ${data.employee.name}: net ${gbp(slip.net)}.`)
      setData(null)
      onIssued?.()
    } catch (e) { setError(e.message) }
    setIssuing(false)
  }

  const setD = (k) => (e) => { setDetails((d) => ({ ...d, [k]: e.target.value })); setDetailsSaved('') }
  const lineEditor = (lines, setLines, placeholder) => (
    <div style={{ display: 'grid', gap: 8 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: 8 }}>
          <FormInput value={l.label} placeholder={placeholder} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <FormInput type="number" step="0.01" value={l.amount} placeholder="£" onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
          <Button variant="secondary" type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</Button>
        </div>
      ))}
      <div><Button variant="secondary" type="button" onClick={() => setLines([...lines, { label: '', amount: '' }])}>Add line</Button></div>
    </div>
  )

  return (
    <div style={{ ...card, marginBottom: 20 }}>
      <div style={sectionTitle}>Generate payslip from the rota</div>
      <div style={grid(4)}>
        <FormField>
          <FormLabel>Staff member</FormLabel>
          <FormSelect value={email} onChange={(e) => setEmail(e.target.value)}>
            <option value="">Select staff...</option>
            {staff.map((s) => <option key={s.email} value={s.email}>{s.name}</option>)}
          </FormSelect>
        </FormField>
        <FormField><FormLabel>Period from</FormLabel><FormInput type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></FormField>
        <FormField><FormLabel>Period to</FormLabel><FormInput type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></FormField>
        <FormField><FormLabel>Pay date</FormLabel><FormInput type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></FormField>
      </div>
      <div style={{ marginTop: 12 }}>
        <Button variant="primary" type="button" onClick={load} disabled={!email || loading}>{loading ? 'Loading...' : 'Work out pay'}</Button>
      </div>
      {error ? <div style={{ fontSize: 13, color: 'var(--color-red-500)', marginTop: 12 }}>{error}</div> : null}
      {done ? <div style={{ fontSize: 13, color: 'var(--color-green-500)', marginTop: 12 }}>{done}</div> : null}

      {data && details && slip ? (
        <div style={{ display: 'grid', gap: 18, marginTop: 20 }}>
          {data.overlaps.length ? <Alert variant="warning">A payslip has already been issued for part of this period ({data.overlaps.map((o) => `${o.period_start} to ${o.period_end}`).join(', ')}).</Alert> : null}

          <div style={{ ...card, padding: 16 }}>
            <div style={sectionTitle}>{data.employee.name}: payroll details</div>
            <div style={grid(4)}>
              <FormField><FormLabel>NI number</FormLabel><FormInput value={details.ni_number} onChange={setD('ni_number')} placeholder="AB 12 34 56 C" /></FormField>
              <FormField><FormLabel>Tax code</FormLabel><FormInput value={details.tax_code} onChange={setD('tax_code')} placeholder="C1257L" /><FormHint>As in Basic PAYE Tools. Welsh codes start with C.</FormHint></FormField>
              <FormField><FormLabel>NI category</FormLabel><FormInput value={details.ni_category} onChange={setD('ni_category')} maxLength={1} /><FormHint>A for most; M if under 21.</FormHint></FormField>
              <FormField>
                <FormLabel>Pay frequency</FormLabel>
                <FormSelect value={details.pay_frequency} onChange={setD('pay_frequency')}>
                  {Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </FormSelect>
              </FormField>
              <FormField><FormLabel>Employee no. (optional)</FormLabel><FormInput value={details.employee_number} onChange={setD('employee_number')} /></FormField>
              <FormField><FormLabel>Paid before the portal ({details.prior_tax_year})</FormLabel><FormInput type="number" step="0.01" value={details.prior_gross} onChange={setD('prior_gross')} /><FormHint>Gross pay this tax year from earlier payslips or a P45.</FormHint></FormField>
              <FormField><FormLabel>Tax paid before the portal</FormLabel><FormInput type="number" step="0.01" value={details.prior_tax} onChange={setD('prior_tax')} /></FormField>
              <FormField><FormLabel>NI paid before the portal</FormLabel><FormInput type="number" step="0.01" value={details.prior_ni} onChange={setD('prior_ni')} /></FormField>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
              <Button variant="secondary" type="button" onClick={saveDetails}>Save payroll details</Button>
              {detailsSaved ? <StatusBadge variant="active">{detailsSaved}</StatusBadge> : <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Stored privately; only HR can see them.</span>}
            </div>
          </div>

          <div style={{ ...card, padding: 16 }}>
            <div style={sectionTitle}>Rota shifts ({data.shifts.length})</div>
            {data.shifts.length === 0 ? <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>No shifts on the rota in this period.</div> : (
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead><tr style={{ color: 'var(--color-text-secondary)', textAlign: 'left' }}><th style={{ width: 30 }} /><th>Date</th><th>Start</th><th>Finish</th><th>Break</th><th>Role</th><th style={{ textAlign: 'right' }}>Hours</th></tr></thead>
                <tbody>
                  {slip && data.shifts.map((s) => {
                    const on = !excluded.has(s.id)
                    const h = slip.shifts.find((x) => x.id === s.id)?.hours
                    return (
                      <tr key={s.id} style={{ borderTop: '1px solid var(--color-border)', opacity: on ? 1 : 0.5 }}>
                        <td><input type="checkbox" checked={on} onChange={() => setExcluded((x) => { const n = new Set(x); if (on) n.add(s.id); else n.delete(s.id); return n })} /></td>
                        <td>{new Date(`${s.shift_date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}{s.published === false ? ' (draft)' : ''}</td>
                        <td>{String(s.start_time).slice(0, 5)}</td><td>{String(s.end_time).slice(0, 5)}</td>
                        <td>{s.break_minutes ? `${s.break_minutes} min` : '—'}</td><td>{s.role || ''}</td>
                        <td style={{ textAlign: 'right' }}>{on && h != null ? h.toFixed(2) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div style={grid(2)}>
            <div style={{ ...card, padding: 16 }}>
              <div style={sectionTitle}>Pay</div>
              <div style={grid(2)}>
                <FormField><FormLabel>Hours (from rota)</FormLabel><FormInput value={slip.hours.toFixed(2)} readOnly /></FormField>
                <FormField><FormLabel>Hourly rate (£)</FormLabel><FormInput type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></FormField>
              </div>
              <FormLabel>Other pay (holiday pay, bonus...)</FormLabel>
              {lineEditor(extraPay, setExtraPay, 'e.g. Holiday pay')}
            </div>
            <div style={{ ...card, padding: 16 }}>
              <div style={sectionTitle}>Deductions</div>
              <div style={grid(2)}>
                <FormField><FormLabel>Income tax (worked out {gbp(slip.calculatedTax)})</FormLabel><FormInput type="number" step="0.01" value={money(taxOverride)} placeholder={slip.calculatedTax.toFixed(2)} onChange={(e) => setTaxOverride(e.target.value)} /></FormField>
                <FormField><FormLabel>Employee NI (worked out {gbp(slip.calculatedNI)})</FormLabel><FormInput type="number" step="0.01" value={money(niOverride)} placeholder={slip.calculatedNI.toFixed(2)} onChange={(e) => setNiOverride(e.target.value)} /></FormField>
                <FormField><FormLabel>Pension (£)</FormLabel><FormInput type="number" step="0.01" value={pension} onChange={(e) => setPension(e.target.value)} /></FormField>
                <FormField><FormLabel>Student loan (£)</FormLabel><FormInput type="number" step="0.01" value={studentLoan} onChange={(e) => setStudentLoan(e.target.value)} /></FormField>
              </div>
              <FormHint>Leave tax and NI blank to use the worked-out figures, or type the amounts Basic PAYE Tools gives you.</FormHint>
              <div style={{ marginTop: 8 }}><FormLabel>Other deductions</FormLabel>{lineEditor(others, setOthers, 'e.g. Uniform')}</div>
            </div>
          </div>

          <div style={{ ...card, padding: 16 }}>
            <div style={sectionTitle}>Summary: {periodLabelOf(periodStart, periodEnd)}, {details.pay_frequency === 'monthly' ? 'month' : 'week'} {slip.period} of {slip.taxYear.replace('-', '/')}</div>
            <div style={grid(2)}>
              <div>
                <div style={row}><span>Basic pay ({slip.hours.toFixed(2)} h × {gbp(slip.rate)})</span><span>{gbp(slip.basic)}</span></div>
                {slip.extras.map((e) => <div key={e.label} style={row}><span>{e.label}</span><span>{gbp(e.amount)}</span></div>)}
                <div style={{ ...row, fontWeight: 600, borderTop: '1px solid var(--color-border)' }}><span>Gross pay (before tax)</span><span>{gbp(slip.gross)}</span></div>
                <div style={row}><span>Income tax</span><span>−{gbp(slip.tax)}</span></div>
                <div style={row}><span>National Insurance</span><span>−{gbp(slip.ni)}</span></div>
                {slip.pension ? <div style={row}><span>Pension</span><span>−{gbp(slip.pension)}</span></div> : null}
                {slip.studentLoan ? <div style={row}><span>Student loan</span><span>−{gbp(slip.studentLoan)}</span></div> : null}
                {slip.others.map((o) => <div key={o.label} style={row}><span>{o.label}</span><span>−{gbp(o.amount)}</span></div>)}
                <div style={{ ...row, fontWeight: 700, fontSize: 16, borderTop: '1px solid var(--color-border)' }}><span>Net pay (after tax)</span><span>{gbp(slip.net)}</span></div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Year to date ({slip.taxYear.replace('-', '/')}, including this payslip)</div>
                <div style={row}><span>Taxable pay</span><span>{gbp(slip.ytd.gross)}</span></div>
                <div style={row}><span>Tax</span><span>{gbp(slip.ytd.tax)}</span></div>
                <div style={row}><span>Employee NI</span><span>{gbp(slip.ytd.ni)}</span></div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                  NI number {details.ni_number ? formatNI(details.ni_number) : 'missing'} · tax code {details.tax_code} · category {details.ni_category}
                </div>
              </div>
            </div>
            {slip.notes.map((n) => <div key={n} style={{ marginTop: 10 }}><Alert variant="warning">{n}</Alert></div>)}
            <div style={{ marginTop: 10 }}><Alert variant="info">Run the same pay through Basic PAYE Tools and send the FPS to HMRC on or before the pay date. If its tax or NI differ, type its figures above so the payslip matches what HMRC has.</Alert></div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <Button variant="secondary" type="button" onClick={previewPdf}>Preview PDF</Button>
              <Button variant="primary" type="button" onClick={issue} disabled={issuing}>{issuing ? 'Issuing...' : `Issue payslip to ${data.employee.name}`}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
