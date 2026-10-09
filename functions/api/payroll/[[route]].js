/**
 * Payroll: payslips made from the rota.
 *
 * NI numbers, tax codes and pay breakdowns live in tables the browser can't
 * read (payroll_details, payroll_runs) and the PDFs in the private `payroll`
 * bucket. This is the only way in: the caller's Microsoft sign-in is checked,
 * HR staff (the hr_profiles permission, or a director) can prepare and issue
 * payslips, and everyone else can open only their own.
 *
 *   POST /api/payroll/preview   { email, periodStart, periodEnd, payDate }   HR
 *   POST /api/payroll/details   { email, ...payroll_details fields }         HR
 *   POST /api/payroll/issue     { email, name, ..., figures, pdfBase64 }     HR
 *   POST /api/payroll/open      { payslipId }                                owner or HR
 */
import { requirePortalUser, verifyEntraToken } from '../_portalAuth.js'
import { taxYearOf, cleanNI, validNI } from '../../../src/utils/payroll.js'

const HR_PERMISSION = 'hr_profiles'

function cors(request) {
  return {
    'access-control-allow-origin': request.headers.get('Origin') ?? '*',
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '600',
  }
}

const reply = (request, body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(request) },
})

function db(env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  }
  const rest = async (path, init = {}) => {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })
    const text = await res.text()
    if (!res.ok) throw new Error(`Database: ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : null
  }
  return { headers, rest }
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))
const enc = encodeURIComponent

export async function onRequest(context) {
  const { request, env, params } = context
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) })
  if (request.method !== 'POST') return reply(request, { error: 'Not found.' }, 404)
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return reply(request, { error: 'Payroll is not configured.' }, 500)

  const route = Array.isArray(params.route) ? params.route.join('/') : String(params.route || '')
  const body = await request.json().catch(() => ({}))

  try {
    if (route === 'open') return reply(request, await openPayslip(request, env, body))
    let user
    try {
      user = await requirePortalUser(request, env, HR_PERMISSION)
    } catch (error) {
      return reply(request, { error: error.message }, error.status || 401)
    }
    if (route === 'preview') return reply(request, await preview(env, body))
    if (route === 'details') return reply(request, await saveDetails(env, body, user))
    if (route === 'issue') return reply(request, await issue(env, body, user))
    return reply(request, { error: 'Not found.' }, 404)
  } catch (error) {
    return reply(request, { error: error.message || 'Something went wrong.' }, error.status || 500)
  }
}

/** Everything needed to work out a payslip: shifts, rate, payroll details, pay so far this tax year. */
async function preview(env, { email, periodStart, periodEnd, payDate }) {
  if (!email || !isDate(periodStart) || !isDate(periodEnd) || !isDate(payDate)) {
    throw Object.assign(new Error('Choose a staff member, the pay period and the pay date.'), { status: 400 })
  }
  const { rest } = db(env)
  const who = email.toLowerCase()
  const taxYear = taxYearOf(payDate)
  const [staffRows, profileRows, shiftRows, detailRows, runs] = await Promise.all([
    rest(`staff?email=ilike.${enc(who)}&select=name,hourly_rate,payment_type&limit=1`),
    rest(`hr_profiles?user_email=ilike.${enc(who)}&select=full_name,role,department,start_date&limit=1`),
    rest(`shifts?employee_email=ilike.${enc(who)}&shift_date=gte.${periodStart}&shift_date=lte.${periodEnd}`
      + '&select=id,shift_date,start_time,end_time,break_minutes,role,published&order=shift_date.asc,start_time.asc'),
    rest(`payroll_details?user_email=eq.${enc(who)}&limit=1`),
    rest(`payroll_runs?user_email=eq.${enc(who)}&tax_year=eq.${enc(taxYear)}&pay_date=lt.${payDate}`
      + '&select=gross,income_tax,employee_ni,period_start,period_end,pay_date&order=pay_date.asc'),
  ])
  const details = detailRows?.[0] || null
  const prior = details?.prior_tax_year === taxYear
    ? { gross: Number(details.prior_gross || 0), tax: Number(details.prior_tax || 0), ni: Number(details.prior_ni || 0) }
    : { gross: 0, tax: 0, ni: 0 }
  const sum = (k) => (runs || []).reduce((s, r) => s + Number(r[k] || 0), 0)
  // A period already paid through the portal: say so, so it isn't paid twice.
  const overlaps = (runs || []).filter((r) => r.period_start <= periodEnd && r.period_end >= periodStart)
  return {
    employee: {
      email: who,
      name: profileRows?.[0]?.full_name || staffRows?.[0]?.name || who,
      role: profileRows?.[0]?.role || null,
      startDate: profileRows?.[0]?.start_date || null,
      hourlyRate: Number(staffRows?.[0]?.hourly_rate || 0),
      paymentType: staffRows?.[0]?.payment_type || null,
    },
    details,
    shifts: shiftRows || [],
    taxYear,
    toDate: {
      gross: prior.gross + sum('gross'),
      tax: prior.tax + sum('income_tax'),
      ni: prior.ni + sum('employee_ni'),
      runs: (runs || []).length,
      includesPrior: prior.gross > 0 || prior.tax > 0,
    },
    overlaps,
  }
}

async function saveDetails(env, body, user) {
  const { rest } = db(env)
  const email = String(body.email || '').toLowerCase()
  if (!email) throw Object.assign(new Error('No staff member.'), { status: 400 })
  const ni = body.ni_number ? cleanNI(body.ni_number) : null
  if (ni && !validNI(ni)) throw Object.assign(new Error('That NI number is not valid (two letters, six numbers, a letter A–D).'), { status: 400 })
  const freq = ['weekly', 'fortnightly', 'four_weekly', 'monthly'].includes(body.pay_frequency) ? body.pay_frequency : 'monthly'
  const row = {
    user_email: email,
    ni_number: ni,
    tax_code: String(body.tax_code || '1257L').toUpperCase().trim().slice(0, 12),
    ni_category: String(body.ni_category || 'A').toUpperCase().slice(0, 1),
    pay_frequency: freq,
    employee_number: body.employee_number ? String(body.employee_number).slice(0, 20) : null,
    prior_tax_year: body.prior_tax_year || null,
    prior_gross: Number(body.prior_gross || 0),
    prior_tax: Number(body.prior_tax || 0),
    prior_ni: Number(body.prior_ni || 0),
    updated_by: user.email,
    updated_at: new Date().toISOString(),
  }
  const saved = await rest('payroll_details?on_conflict=user_email', {
    method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  })
  return { details: saved?.[0] || row }
}

async function issue(env, body, user) {
  const { rest, headers } = db(env)
  const email = String(body.email || '').toLowerCase()
  const f = body.figures || {}
  if (!email || !isDate(body.periodStart) || !isDate(body.periodEnd) || !isDate(body.payDate)) {
    throw Object.assign(new Error('The payslip is missing its staff member or dates.'), { status: 400 })
  }
  if (!body.pdfBase64 || !Number.isFinite(Number(f.gross)) || !Number.isFinite(Number(f.net))) {
    throw Object.assign(new Error('The payslip is missing its figures or PDF.'), { status: 400 })
  }
  const pdf = Uint8Array.from(atob(body.pdfBase64), (c) => c.charCodeAt(0))
  if (pdf.length > 5_000_000 || String.fromCharCode(...pdf.slice(0, 4)) !== '%PDF') {
    throw Object.assign(new Error('That is not a payslip PDF.'), { status: 400 })
  }

  const path = `${email}/${f.taxYear}-${body.frequency || 'monthly'}-${String(f.period).padStart(2, '0')}-${Date.now()}.pdf`
  const up = await fetch(`${env.SUPABASE_URL}/storage/v1/object/payroll/${path.split('/').map(enc).join('/')}`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/pdf', 'x-upsert': 'false' }, body: pdf,
  })
  if (!up.ok) throw new Error(`Could not store the PDF: ${(await up.text()).slice(0, 150)}`)

  // The payslips list row: gross only, as before. The full breakdown (tax,
  // NI, net, NI number) stays in payroll_runs and the private PDF.
  const slip = await rest('payslips', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      user_email: email,
      user_name: body.name || email,
      period: body.periodLabel,
      file_url: null,
      file_path: `payroll:${path}`,
      uploaded_by: user.name || user.email,
      uploaded_at: new Date().toISOString(),
      period_start: body.periodStart,
      period_end: body.periodEnd,
      hours_worked: f.hours,
      hourly_rate: f.rate,
      gross_pay: f.gross,
      source: 'rota',
      created_by: user.email,
    }),
  })
  const payslipId = slip?.[0]?.id
  await rest('payroll_runs', {
    method: 'POST',
    body: JSON.stringify({
      payslip_id: payslipId,
      user_email: email,
      user_name: body.name || email,
      tax_year: f.taxYear,
      frequency: body.frequency || 'monthly',
      tax_period: f.period,
      period_start: body.periodStart,
      period_end: body.periodEnd,
      pay_date: body.payDate,
      hours: f.hours,
      hourly_rate: f.rate,
      gross: f.gross,
      income_tax: f.tax,
      employee_ni: f.ni,
      pension: f.pension || 0,
      student_loan: f.studentLoan || 0,
      other_deductions: f.others || [],
      net: f.net,
      tax_code: body.taxCode || null,
      ni_category: body.niCategory || null,
      shifts: (f.shifts || []).map((s) => ({ date: s.shift_date, start: s.start_time, end: s.end_time, break: s.break_minutes || 0, hours: s.hours })),
      file_path: path,
      created_by: user.email,
    }),
  })
  return { payslipId, path }
}

/** A short-lived link to a payslip, for its owner or HR. */
async function openPayslip(request, env, { payslipId }) {
  const header = request.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  let caller
  try {
    caller = await verifyEntraToken(token, env)
  } catch (error) {
    throw Object.assign(new Error(error.message || 'Sign-in required.'), { status: 401 })
  }
  const { rest, headers } = db(env)
  const rows = await rest(`payslips?id=eq.${enc(payslipId)}&select=user_email,file_path,file_url&limit=1`)
  const slip = rows?.[0]
  if (!slip) throw Object.assign(new Error('Payslip not found.'), { status: 404 })
  if (String(slip.user_email).toLowerCase() !== caller.email) {
    try {
      await requirePortalUser(request, env, HR_PERMISSION)
    } catch {
      throw Object.assign(new Error('That payslip is not yours.'), { status: 403 })
    }
  }
  if (!String(slip.file_path || '').startsWith('payroll:')) return { url: slip.file_url }
  const path = slip.file_path.slice('payroll:'.length)
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/payroll/${path.split('/').map(enc).join('/')}`, {
    method: 'POST', headers, body: JSON.stringify({ expiresIn: 300 }),
  })
  const signed = await res.json().catch(() => ({}))
  if (!res.ok || !signed.signedURL) throw new Error('Could not open the payslip.')
  return { url: `${env.SUPABASE_URL}/storage/v1${signed.signedURL}` }
}
