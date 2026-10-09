/**
 * PAYE maths for payslips made from the rota.
 *
 * HMRC Basic PAYE Tools is what reports to HMRC, so these figures are a
 * working-out to check against it, and every one can be overridden before a
 * payslip is issued. The rules are HMRC's for 2026/27:
 *
 *   - Income tax, cumulative by tax period (or week 1 / month 1 when the code
 *     ends W1, M1 or X). Free pay = (code number x 10 + 9) / periods, pay
 *     rounded down to the pound, bands prorated. England, Wales (C codes) and
 *     Northern Ireland share the rates below; Scottish (S) codes have their
 *     own bands, so for those we say so rather than guess.
 *   - Class 1 employee NI, worked out on each period's pay on its own (never
 *     cumulative for employees): 8% between the primary threshold and the
 *     upper earnings limit, 2% above it. Categories A, M, H, V (and the
 *     other standard-rate letters) pay the same employee rate.
 *
 * Pure functions only: the payroll Pages Function imports this too.
 */

export const TAX_YEAR_RULES = {
  '2026-27': {
    basicBand: 37700,          // 20%
    higherLimit: 125140,       // 40% up to here, 45% above
    rates: { basic: 0.2, higher: 0.4, additional: 0.45 },
    ni: {
      main: 0.08, upper: 0.02,
      // Per pay period: primary threshold, upper earnings limit (HMRC tables).
      weekly: { pt: 242, uel: 967 },
      fortnightly: { pt: 484, uel: 1934 },
      four_weekly: { pt: 967, uel: 3867 },
      monthly: { pt: 1048, uel: 4189 },
    },
  },
}

export const PERIODS_PER_YEAR = { weekly: 52, fortnightly: 26, four_weekly: 13, monthly: 12 }
export const FREQUENCY_LABEL = { weekly: 'Weekly', fortnightly: 'Fortnightly', four_weekly: 'Four-weekly', monthly: 'Monthly' }

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const floor2 = (n) => Math.floor((Number(n) + 1e-9) * 100) / 100
const toDate = (s) => (s instanceof Date ? s : new Date(`${s}T12:00:00Z`))

/** "2026-27" for any date from 6 April 2026 to 5 April 2027. */
export function taxYearOf(date) {
  const d = toDate(date)
  const y = d.getUTCFullYear()
  const startsThisYear = d >= new Date(Date.UTC(y, 3, 6))
  const first = startsThisYear ? y : y - 1
  return `${first}-${String((first + 1) % 100).padStart(2, '0')}`
}

/** Tax period number (month 1 = 6 April to 5 May; week 1 = 6 to 12 April). */
export function taxPeriodOf(payDate, frequency) {
  const d = toDate(payDate)
  const first = Number(taxYearOf(d).slice(0, 4))
  const start = Date.UTC(first, 3, 6)
  if (frequency === 'monthly') {
    // Month n runs from the 6th of (April + n - 1).
    const months = (d.getUTCFullYear() - first) * 12 + (d.getUTCMonth() - 3)
    return Math.min(12, Math.max(1, d.getUTCDate() >= 6 ? months + 1 : months))
  }
  const days = Math.floor((d.getTime() - start) / 86400000)
  const week = Math.floor(days / 7) + 1
  if (frequency === 'fortnightly') return Math.min(27, Math.ceil(week / 2))
  if (frequency === 'four_weekly') return Math.min(14, Math.ceil(week / 4))
  return Math.min(53, week)
}

/** Reads a tax code: "1257L", "C1257L", "S1257L", "1257L M1", "BR", "D0", "NT", "0T", "K475". */
export function parseTaxCode(raw) {
  let code = String(raw || '1257L').toUpperCase().replace(/\s+/g, '')
  const result = { code: String(raw || '1257L').toUpperCase().trim(), region: 'rUK', cumulative: true, kind: 'standard', allowance: 0 }
  if (/(W1|M1|X)$/.test(code)) { result.cumulative = false; code = code.replace(/(W1|M1|X)$/, '') }
  if (code.startsWith('C')) { result.region = 'Wales'; code = code.slice(1) }
  else if (code.startsWith('S')) { result.region = 'Scotland'; code = code.slice(1) }
  if (code === 'BR') return { ...result, kind: 'BR' }
  if (code === 'D0') return { ...result, kind: 'D0' }
  if (code === 'D1') return { ...result, kind: 'D1' }
  if (code === 'NT') return { ...result, kind: 'NT' }
  if (code === '0T') return { ...result, kind: 'standard', allowance: 0 }
  const k = code.match(/^K(\d+)$/)
  if (k) return { ...result, kind: 'K', allowance: -(Number(k[1]) * 10 + 9) }
  const std = code.match(/^(\d+)[LMNT]$/)
  if (std) return { ...result, allowance: Number(std[1]) * 10 + 9 }
  return { ...result, kind: 'unknown' }
}

function bandTax(taxable, fraction, rules) {
  const basic = rules.basicBand * fraction
  const higherTop = (rules.higherLimit - 12570) * fraction  // the 40% band ends where 45% starts, less a basic allowance
  let tax = 0
  tax += Math.min(taxable, basic) * rules.rates.basic
  if (taxable > basic) tax += (Math.min(taxable, higherTop) - basic) * rules.rates.higher
  if (taxable > higherTop) tax += (taxable - higherTop) * rules.rates.additional
  return tax
}

/**
 * Income tax for this period.
 *   gross: this period's taxable pay
 *   grossToDate / taxToDate: earlier periods this tax year (not this one)
 */
export function incomeTax({ gross, grossToDate = 0, taxToDate = 0, taxCode, frequency, period, taxYear = '2026-27' }) {
  const rules = TAX_YEAR_RULES[taxYear] || TAX_YEAR_RULES['2026-27']
  const code = parseTaxCode(taxCode)
  const per = PERIODS_PER_YEAR[frequency] || 12
  const notes = []
  if (code.region === 'Scotland') notes.push('Scottish tax code: Scottish bands differ, so check the tax figure in Basic PAYE Tools.')
  if (code.kind === 'unknown') notes.push(`Tax code "${code.code}" not recognised; tax worked out on 1257L.`)

  if (code.kind === 'NT') return { tax: 0, notes }
  if (code.kind === 'BR') return { tax: floor2(Math.floor(gross) * rules.rates.basic), notes }
  if (code.kind === 'D0') return { tax: floor2(Math.floor(gross) * rules.rates.higher), notes }
  if (code.kind === 'D1') return { tax: floor2(Math.floor(gross) * rules.rates.additional), notes }

  const allowance = code.kind === 'unknown' ? 12579 : code.allowance
  if (!code.cumulative) {
    const taxable = Math.max(0, Math.floor(gross - allowance / per))
    let tax = floor2(bandTax(taxable, 1 / per, rules))
    if (code.kind === 'K') tax = Math.min(tax, floor2(gross * 0.5))  // the 50% regulatory limit
    return { tax, notes }
  }
  const n = Math.max(1, period)
  const payToDate = grossToDate + gross
  const freeToDate = (allowance * n) / per
  const taxable = Math.max(0, Math.floor(payToDate - freeToDate))
  const dueToDate = floor2(bandTax(taxable, n / per, rules))
  let tax = round2(dueToDate - taxToDate)
  if (code.kind === 'K') tax = Math.min(tax, floor2(gross * 0.5))
  if (tax < 0) notes.push('Tax refund: more tax was paid earlier in the year than is due so far.')
  return { tax, notes }
}

/** Class 1 employee NI for one period's pay. */
export function employeeNI({ gross, frequency, category = 'A', taxYear = '2026-27' }) {
  const rules = (TAX_YEAR_RULES[taxYear] || TAX_YEAR_RULES['2026-27']).ni
  const t = rules[frequency] || rules.monthly
  const notes = []
  if (['C', 'X'].includes(category)) return { ni: 0, notes: [`Category ${category}: no employee NI.`] }
  if (['B', 'E', 'I'].includes(category)) notes.push(`Category ${category} is a reduced-rate letter: check NI in Basic PAYE Tools.`)
  const main = Math.max(0, Math.min(gross, t.uel) - t.pt) * rules.main
  const upper = Math.max(0, gross - t.uel) * rules.upper
  return { ni: round2(main + upper), notes }
}

/** Hours on one rota shift ("09:00" to "17:30", less its break; past midnight allowed). */
export function shiftHours(shift) {
  const mins = (t) => {
    const m = String(t || '').match(/^(\d{1,2}):(\d{2})/)
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const start = mins(shift.start_time)
  let end = mins(shift.end_time)
  if (start == null || end == null) return 0
  if (end <= start) end += 24 * 60
  return Math.max(0, (end - start - Number(shift.break_minutes || 0)) / 60)
}

/**
 * The whole payslip from its inputs. Everything a person might override
 * (tax, NI) can be passed in; otherwise it's worked out.
 */
export function buildPayslip({
  shifts = [], hourlyRate, frequency = 'monthly', payDate, taxCode = '1257L', niCategory = 'A',
  grossToDate = 0, taxToDate = 0, niToDate = 0,
  taxOverride = null, niOverride = null, pension = 0, studentLoan = 0, otherDeductions = [], extraPay = [],
}) {
  const taxYear = taxYearOf(payDate)
  const period = taxPeriodOf(payDate, frequency)
  const rows = shifts.map((s) => ({ ...s, hours: round2(shiftHours(s)) }))
  const hours = round2(rows.reduce((sum, s) => sum + s.hours, 0))
  const rate = Number(hourlyRate) || 0
  const basic = round2(hours * rate)
  const extras = extraPay.filter((e) => e && Number(e.amount)).map((e) => ({ label: e.label || 'Other pay', amount: round2(e.amount) }))
  const gross = round2(basic + extras.reduce((s, e) => s + e.amount, 0))

  const taxCalc = incomeTax({ gross, grossToDate, taxToDate, taxCode, frequency, period, taxYear })
  const niCalc = employeeNI({ gross, frequency, category: niCategory, taxYear })
  const tax = taxOverride === null || taxOverride === '' || taxOverride === undefined ? taxCalc.tax : round2(taxOverride)
  const ni = niOverride === null || niOverride === '' || niOverride === undefined ? niCalc.ni : round2(niOverride)
  const others = otherDeductions.filter((d) => d && Number(d.amount)).map((d) => ({ label: d.label || 'Deduction', amount: round2(d.amount) }))
  const totalDeductions = round2(tax + ni + Number(pension || 0) + Number(studentLoan || 0) + others.reduce((s, d) => s + d.amount, 0))

  return {
    taxYear, period, frequency, hours, rate, basic, extras, gross,
    tax, ni, calculatedTax: taxCalc.tax, calculatedNI: niCalc.ni,
    pension: round2(pension || 0), studentLoan: round2(studentLoan || 0), others,
    totalDeductions, net: round2(gross - totalDeductions),
    ytd: { gross: round2(grossToDate + gross), tax: round2(taxToDate + tax), ni: round2(niToDate + ni) },
    shifts: rows, notes: [...taxCalc.notes, ...niCalc.notes],
  }
}

export const gbp = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(n) || 0)

/** "AB 12 34 56 C" for printing; stored without spaces. */
export function formatNI(ni) {
  const v = String(ni || '').toUpperCase().replace(/\s+/g, '')
  return v.length === 9 ? `${v.slice(0, 2)} ${v.slice(2, 4)} ${v.slice(4, 6)} ${v.slice(6, 8)} ${v.slice(8)}` : v
}
export const cleanNI = (ni) => String(ni || '').toUpperCase().replace(/\s+/g, '')
export const validNI = (ni) => {
  const v = cleanNI(ni)
  return /^[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z][0-9]{6}[A-D]$/.test(v) && !['BG', 'GB', 'NK', 'KN', 'TN', 'NT', 'ZZ'].includes(v.slice(0, 2))
}
