/**
 * The payslip PDF: DH branding, the company's legal details, the employee's
 * payroll details (NI number, tax code), pay and deductions, year to date,
 * and the rota shifts the hours came from.
 */
import { gbp, formatNI, FREQUENCY_LABEL } from './payroll.js'

export const EMPLOYER = {
  name: 'David Hooper Home Limited',
  tradingAs: 'DH Website Services',
  address: '36b Coedpenmaen Road, Trallwn, Pontypridd CF37 4LP',
  companyNumber: '17018784',
  phone: '01443 805303',
  web: 'dhwebsiteservices.co.uk',
}

const CHARCOAL = [69, 70, 74]
const BLUE = [68, 181, 249]
const GREY = [120, 122, 128]
const LINE = [222, 223, 227]
const TINT = [244, 246, 248]

async function logoDataUrl() {
  try {
    const res = await fetch('/dh-logo.png')
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

const fmtDate = (s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(`${s}T12:00:00`).toLocaleDateString('en-GB', opts)

/**
 * slip: the result of buildPayslip(). info: { employee, details, periodStart,
 * periodEnd, payDate, periodLabel, payeRef }. Returns a jsPDF document.
 */
export async function buildPayslipPdf(slip, info) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const M = 40
  let y = M

  const text = (s, x, yy, { size = 9, bold = false, color = CHARCOAL, align = 'left' } = {}) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    pdf.setTextColor(...color)
    pdf.text(String(s ?? ''), x, yy, { align })
  }
  const rule = (yy, color = LINE) => { pdf.setDrawColor(...color); pdf.setLineWidth(0.6); pdf.line(M, yy, W - M, yy) }

  // ── Header: logo, company, PAYSLIP ─────────────────────────────────────────
  const logo = await logoDataUrl()
  if (logo) pdf.addImage(logo, 'PNG', M - 6, y - 8, 78, 66)
  const hx = M + 84
  text(EMPLOYER.name, hx, y + 10, { size: 12, bold: true })
  text(`trading as ${EMPLOYER.tradingAs}`, hx, y + 24, { size: 9, color: GREY })
  text(EMPLOYER.address, hx, y + 37, { size: 8.5, color: GREY })
  text(`Company No. ${EMPLOYER.companyNumber}  ·  ${EMPLOYER.phone}  ·  ${EMPLOYER.web}`, hx, y + 49, { size: 8.5, color: GREY })
  if (info.payeRef) text(`Employer PAYE ref ${info.payeRef}`, hx, y + 61, { size: 8.5, color: GREY })

  text('PAYSLIP', W - M, y + 12, { size: 20, bold: true, color: BLUE, align: 'right' })
  text(info.periodLabel, W - M, y + 30, { size: 10, bold: true, align: 'right' })
  text(`Paid ${fmtDate(info.payDate)}`, W - M, y + 44, { size: 9, color: GREY, align: 'right' })
  y += 78
  pdf.setFillColor(...BLUE); pdf.rect(M, y, W - 2 * M, 3, 'F')
  y += 18

  // ── Employee and payroll details ──────────────────────────────────────────
  const d = info.details || {}
  const left = [
    ['Employee', info.employee.name],
    ['Employee no.', d.employee_number || '—'],
    ['NI number', d.ni_number ? formatNI(d.ni_number) : 'Not provided'],
    ['Role', info.employee.role || '—'],
  ]
  const right = [
    ['Tax code', d.tax_code || '1257L'],
    ['NI category', d.ni_category || 'A'],
    ['Pay frequency', FREQUENCY_LABEL[slip.frequency] || 'Monthly'],
    ['Tax period', `${slip.frequency === 'monthly' ? 'Month' : 'Week'} ${slip.period}, ${slip.taxYear.replace('-', '/')}`],
  ]
  pdf.setFillColor(...TINT); pdf.roundedRect(M, y, W - 2 * M, 74, 6, 6, 'F')
  const col = (rows, x) => rows.forEach(([k, v], i) => {
    text(k, x + 12, y + 18 + i * 15, { size: 8.5, color: GREY })
    text(v, x + 92, y + 18 + i * 15, { size: 9, bold: true })
  })
  col(left, M); col(right, W / 2)
  y += 74 + 10
  text(`Pay period ${fmtDate(info.periodStart)} to ${fmtDate(info.periodEnd)}`, M, y + 8, { size: 8.5, color: GREY })
  y += 24

  // ── Payments and deductions, side by side ─────────────────────────────────
  const half = (W - 2 * M - 16) / 2
  const table = (x, title, rows, total) => {
    let yy = y
    text(title.toUpperCase(), x, yy, { size: 8, bold: true, color: GREY })
    yy += 8; pdf.setDrawColor(...CHARCOAL); pdf.setLineWidth(0.8); pdf.line(x, yy, x + half, yy); yy += 14
    rows.forEach((r) => {
      text(r[0], x, yy, { size: 9 })
      if (r[1]) text(r[1], x + half - 70, yy, { size: 8.5, color: GREY, align: 'right' })
      text(r[2], x + half, yy, { size: 9, align: 'right' })
      yy += 15
    })
    pdf.setDrawColor(...LINE); pdf.line(x, yy - 6, x + half, yy - 6); yy += 6
    text(total[0], x, yy, { size: 9.5, bold: true })
    text(total[1], x + half, yy, { size: 9.5, bold: true, align: 'right' })
    return yy
  }
  const payments = [
    ['Basic pay (rota)', `${slip.hours.toFixed(2)} h × ${gbp(slip.rate)}`, gbp(slip.basic)],
    ...slip.extras.map((e) => [e.label, '', gbp(e.amount)]),
  ]
  const deductions = [
    ['Income tax (PAYE)', '', gbp(slip.tax)],
    ['National Insurance', '', gbp(slip.ni)],
    ...(slip.pension ? [['Pension', '', gbp(slip.pension)]] : []),
    ...(slip.studentLoan ? [['Student loan', '', gbp(slip.studentLoan)]] : []),
    ...slip.others.map((o) => [o.label, '', gbp(o.amount)]),
  ]
  const end1 = table(M, 'Payments', payments, ['Gross pay', gbp(slip.gross)])
  const end2 = table(M + half + 16, 'Deductions', deductions, ['Total deductions', gbp(slip.totalDeductions)])
  y = Math.max(end1, end2) + 22

  // ── Net pay and year to date ─────────────────────────────────────────────
  pdf.setFillColor(...CHARCOAL); pdf.roundedRect(M, y, W - 2 * M, 54, 6, 6, 'F')
  text('NET PAY', M + 16, y + 22, { size: 9, bold: true, color: [200, 202, 206] })
  text('Paid to your bank account', M + 16, y + 38, { size: 8.5, color: [200, 202, 206] })
  text(gbp(slip.net), W / 2 - 20, y + 35, { size: 22, bold: true, color: [255, 255, 255], align: 'right' })
  const ytd = [['Taxable pay to date', slip.ytd.gross], ['Tax paid to date', slip.ytd.tax], ['Employee NI to date', slip.ytd.ni]]
  ytd.forEach(([k, v], i) => {
    text(k, W / 2 + 10, y + 16 + i * 14, { size: 8.5, color: [200, 202, 206] })
    text(gbp(v), W - M - 16, y + 16 + i * 14, { size: 9, bold: true, color: [255, 255, 255], align: 'right' })
  })
  y += 54 + 24

  // ── Rota shifts ───────────────────────────────────────────────────────────
  text(`ROTA SHIFTS THIS PERIOD (${slip.shifts.length})`, M, y, { size: 8, bold: true, color: GREY })
  y += 8; pdf.setDrawColor(...CHARCOAL); pdf.setLineWidth(0.8); pdf.line(M, y, W - M, y); y += 13
  const cols = [M, M + 120, M + 200, M + 270, M + 340, W - M]
  const header = ['Date', 'Start', 'Finish', 'Break', 'Role', 'Hours']
  header.forEach((h, i) => text(h, cols[i], y, { size: 8, bold: true, color: GREY, align: i === 5 ? 'right' : 'left' }))
  y += 12
  const footerTop = H - 64
  slip.shifts.forEach((s, i) => {
    if (y > footerTop - 14) {
      pdf.addPage(); y = M
      header.forEach((h, j) => text(h, cols[j], y, { size: 8, bold: true, color: GREY, align: j === 5 ? 'right' : 'left' }))
      y += 12
    }
    if (i % 2 === 0) { pdf.setFillColor(...TINT); pdf.rect(M - 4, y - 9, W - 2 * M + 8, 13, 'F') }
    text(fmtDate(s.shift_date, { weekday: 'short', day: 'numeric', month: 'short' }), cols[0], y, { size: 8.5 })
    text(String(s.start_time || '').slice(0, 5), cols[1], y, { size: 8.5 })
    text(String(s.end_time || '').slice(0, 5), cols[2], y, { size: 8.5 })
    text(s.break_minutes ? `${s.break_minutes} min` : '—', cols[3], y, { size: 8.5 })
    text(s.role || '', cols[4], y, { size: 8.5, color: GREY })
    text(s.hours.toFixed(2), cols[5], y, { size: 8.5, align: 'right' })
    y += 13
  })
  if (!slip.shifts.length) { text('No rota shifts in this period.', M, y, { size: 8.5, color: GREY }); y += 13 }
  rule(y - 4)
  text('Total hours', cols[4], y + 8, { size: 9, bold: true })
  text(slip.hours.toFixed(2), cols[5], y + 8, { size: 9, bold: true, align: 'right' })

  // ── Footer on every page ──────────────────────────────────────────────────
  const pages = pdf.internal.getNumberOfPages()
  for (let p = 1; p <= pages; p += 1) {
    pdf.setPage(p)
    pdf.setDrawColor(...LINE); pdf.line(M, H - 44, W - M, H - 44)
    text(`${EMPLOYER.name}, registered in England and Wales, company number ${EMPLOYER.companyNumber}. Registered office: ${EMPLOYER.address}.`,
      M, H - 30, { size: 7, color: GREY })
    text('Private and confidential. Keep this payslip for your records.', M, H - 19, { size: 7, color: GREY })
    if (pages > 1) text(`Page ${p} of ${pages}`, W - M, H - 19, { size: 7, color: GREY, align: 'right' })
  }
  return pdf
}

/** The PDF as base64, for sending to the payroll API. */
export function pdfToBase64(pdf) {
  return pdf.output('datauristring').split(',')[1]
}
