const EMAIL_LOG_API_PATH = '/api/email-log'

function buildQuery(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  return query.toString()
}

export async function fetchEmailLogs(params = {}) {
  const query = buildQuery(params)
  const response = await fetch(query ? `${EMAIL_LOG_API_PATH}?${query}` : EMAIL_LOG_API_PATH, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    console.warn('Email log API unavailable:', data?.error || response.status)
    return []
  }
  return Array.isArray(data?.logs) ? data.logs : []
}
