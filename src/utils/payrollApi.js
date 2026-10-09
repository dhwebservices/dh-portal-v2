/**
 * Calls /api/payroll with proof of who you are (your Microsoft ID token).
 * The native app has no same-origin API, so it calls the live portal.
 */
import { Capacitor } from '@capacitor/core'
import { getStaffIdToken } from './staffToken'

const BASE = Capacitor.isNativePlatform() ? 'https://staff.dhwebsiteservices.co.uk' : ''

export async function callPayroll(instance, account, route, body, { interactive = false } = {}) {
  const token = await getStaffIdToken({ instance, account, interactive })
  const response = await fetch(`${BASE}/api/payroll/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.error) throw new Error(payload?.error || `Payroll request failed (${response.status}).`)
  return payload
}

/** Opens a payslip: a short-lived link for payslips made from the rota, the stored link for uploaded ones. */
export async function payslipLink(instance, account, payslip) {
  if (!String(payslip?.file_path || '').startsWith('payroll:')) return payslip?.file_url || null
  const { url } = await callPayroll(instance, account, 'open', { payslipId: payslip.id })
  return url
}
