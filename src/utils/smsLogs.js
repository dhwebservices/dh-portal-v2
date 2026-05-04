const SMS_LOGS_API_PATH = '/api/sms-logs'

export async function fetchSmsLogs(limit = 12) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(50, Number(limit))) : 12
  const response = await fetch(`${SMS_LOGS_API_PATH}?limit=${safeLimit}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || 'Could not load SMS logs.')
  }

  return Array.isArray(data?.logs) ? data.logs : []
}
