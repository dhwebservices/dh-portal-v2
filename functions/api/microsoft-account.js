const DEFAULT_ALLOWED_ORIGINS = [
  'https://staff.dhwebsiteservices.co.uk',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function getAllowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS)
}

function resolveRequestOrigin(request) {
  const origin = request.headers.get('origin')
  if (origin) return origin
  const referer = request.headers.get('referer')
  if (!referer) return ''
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

function isAllowedOrigin(request, env) {
  const origin = resolveRequestOrigin(request)
  if (!origin) return false
  return getAllowedOrigins(env).has(origin)
}

function normalizeEmail(value = '') {
  return String(value || '').toLowerCase().trim()
}

function splitDisplayName(displayName = '') {
  const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { givenName: '', surname: '' }
  if (parts.length === 1) return { givenName: parts[0], surname: '.' }
  return {
    givenName: parts.slice(0, -1).join(' '),
    surname: parts[parts.length - 1],
  }
}

function validatePayload(data = {}) {
  const required = [
    ['displayName', 'Display name'],
    ['userPrincipalName', 'Work email'],
    ['password', 'Temporary password'],
  ]
  const missing = required.find(([key]) => !String(data[key] || '').trim())
  if (missing) throw new Error(`${missing[1]} is required.`)
  if (!String(data.userPrincipalName || '').includes('@')) {
    throw new Error('Work email looks invalid.')
  }
}

async function getGraphAccessToken(env) {
  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    client_secret: env.MICROSOFT_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })

  const response = await fetch(`https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Microsoft token request failed (${response.status}): ${text}`)
  }

  const payload = await response.json().catch(() => null)
  if (!payload?.access_token) throw new Error('Microsoft token response did not include an access token.')
  return payload.access_token
}

async function graphFetch(token, path, options = {}) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Graph request failed (${response.status}) ${path}: ${text}`)
  }

  if (response.status === 204) return null
  return response.json().catch(() => null)
}

async function findUserByEmail(token, email) {
  const safeEmail = normalizeEmail(email)
  if (!safeEmail) return null
  const query = encodeURIComponent(`userPrincipalName eq '${safeEmail}'`)
  const payload = await graphFetch(token, `/users?$select=id,displayName,userPrincipalName&$filter=${query}`)
  return Array.isArray(payload?.value) ? payload.value[0] || null : null
}

async function assignManager(token, userId, managerEmail) {
  const manager = await findUserByEmail(token, managerEmail)
  if (!manager?.id) return null
  await graphFetch(token, `/users/${encodeURIComponent(userId)}/manager/$ref`, {
    method: 'PUT',
    body: JSON.stringify({
      '@odata.id': `https://graph.microsoft.com/v1.0/users/${manager.id}`,
    }),
  })
  return manager
}

async function assignLicense(token, userId, skuId) {
  if (!skuId) return null
  return graphFetch(token, `/users/${encodeURIComponent(userId)}/assignLicense`, {
    method: 'POST',
    body: JSON.stringify({
      addLicenses: [{ skuId, disabledPlans: [] }],
      removeLicenses: [],
    }),
  })
}

export async function onRequestPost(context) {
  if (!isAllowedOrigin(context.request, context.env)) {
    return json({ error: 'Origin is not allowed.' }, 403)
  }

  if (!context.env.MICROSOFT_TENANT_ID || !context.env.MICROSOFT_CLIENT_ID || !context.env.MICROSOFT_CLIENT_SECRET) {
    return json({ error: 'Microsoft account provisioning is not configured.' }, 503)
  }

  let payload
  try {
    payload = await context.request.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  const data = payload && typeof payload === 'object' ? payload : {}

  try {
    validatePayload(data)
    const token = await getGraphAccessToken(context.env)
    const existing = await findUserByEmail(token, data.userPrincipalName)
    if (existing?.id) {
      return json({ error: 'A Microsoft 365 account already exists for this email.', existing }, 409)
    }

    const { givenName, surname } = splitDisplayName(data.displayName)
    const mailNickname = String(data.mailNickname || normalizeEmail(data.userPrincipalName).split('@')[0] || '')
      .replace(/[^a-z0-9._-]/g, '')

    const createdUser = await graphFetch(token, '/users', {
      method: 'POST',
      body: JSON.stringify({
        accountEnabled: true,
        displayName: data.displayName,
        givenName,
        surname,
        userPrincipalName: normalizeEmail(data.userPrincipalName),
        mailNickname,
        department: String(data.department || '').trim() || undefined,
        jobTitle: String(data.jobTitle || '').trim() || undefined,
        usageLocation: String(data.usageLocation || context.env.MICROSOFT_DEFAULT_USAGE_LOCATION || 'GB').trim(),
        passwordProfile: {
          forceChangePasswordNextSignIn: true,
          password: String(data.password || ''),
        },
      }),
    })

    let manager = null
    if (data.managerEmail) {
      manager = await assignManager(token, createdUser.id, data.managerEmail).catch(() => null)
    }

    let licenseAssigned = false
    const licenseSkuId = String(data.licenseSkuId || context.env.MICROSOFT_DEFAULT_LICENSE_SKU_ID || '').trim()
    if (licenseSkuId) {
      await assignLicense(token, createdUser.id, licenseSkuId)
      licenseAssigned = true
    }

    return json({
      ok: true,
      user: {
        id: createdUser.id,
        displayName: createdUser.displayName,
        userPrincipalName: createdUser.userPrincipalName,
      },
      manager,
      licenseAssigned,
    })
  } catch (error) {
    console.warn('Microsoft account provisioning failed:', error)
    return json({ error: error?.message || 'microsoft_account_provision_failed' }, 502)
  }
}
