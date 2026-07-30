// Xero Payroll integration utilities

const API_BASE = '/api/xero'

async function call(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || `HTTP ${res.status}`)
  }

  return res.json()
}

export async function checkXeroConnection() {
  return call('/status')
}

export async function startXeroOAuth() {
  window.location.href = `${API_BASE}/auth`
}

export async function syncXeroEmployees() {
  return call('/sync-employees', { method: 'POST' })
}

export async function syncXeroLeaveBalances() {
  return call('/sync-leave', { method: 'POST' })
}

export async function syncXeroPayslips() {
  return call('/sync-payslips', { method: 'POST' })
}

export async function getXeroLeaveBalance(userEmail) {
  return call(`/leave-balance?email=${encodeURIComponent(userEmail)}`)
}

export async function getXeroPayslips(userEmail) {
  return call(`/payslips?email=${encodeURIComponent(userEmail)}`)
}

export function getPayslipPDFUrl(xeroPayslipId) {
  return `${API_BASE}/payslip/${xeroPayslipId}/pdf`
}
