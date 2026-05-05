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
    throw new Error(data?.error || 'Could not load email logs.')
  }
  return Array.isArray(data?.logs) ? data.logs : []
}
