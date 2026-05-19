const SERVICE_ADMIN_API_PATH = '/api/service-admin'

async function parseJsonSafe(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function request(path = '', options = {}) {
  const response = await fetch(`${SERVICE_ADMIN_API_PATH}${path}`, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  const payload = await parseJsonSafe(response)
  if (!response.ok || payload?.ok === false) {
    const error = payload?.error || `service_admin_http_${response.status}`
    throw new Error(error)
  }
  return payload
}

export async function fetchServiceAdminOverview() {
  return request('', { method: 'GET' })
}

export async function runServiceAdminAction(action, payload = {}) {
  return request('', {
    method: 'POST',
    body: JSON.stringify({
      action,
      ...payload,
    }),
  })
}
