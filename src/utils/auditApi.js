const AUDIT_LOG_API_PATH = '/api/audit-log'

function buildQuery(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  return query.toString()
}

export async function fetchAuditLogs(params = {}) {
  const query = buildQuery(params)
  const response = await fetch(query ? `${AUDIT_LOG_API_PATH}?${query}` : AUDIT_LOG_API_PATH, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    console.warn('Audit log API unavailable:', data?.error || response.status)
    return []
  }
  return Array.isArray(data?.logs) ? data.logs : []
}

export async function clearAuditLogs(before) {
  const query = buildQuery({ before })
  const response = await fetch(`${AUDIT_LOG_API_PATH}?${query}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || 'Could not clear audit logs.')
  }
  return data
}
