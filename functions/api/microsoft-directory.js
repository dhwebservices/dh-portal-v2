/**
 * Read-only Entra directory lookups for the new-starter flow.
 *
 * Lets the portal populate real pickers instead of asking an admin to paste
 * GUIDs by hand:
 *   GET ?resource=groups   -> security/distribution groups (id + name + type)
 *   GET ?resource=licenses -> subscribed SKUs with remaining seat counts
 *   GET ?resource=all      -> both
 *   GET ?resource=check-upn&upn=someone@domain -> { available: bool }
 *
 * Requires (Application, admin-consented) on the DH portal app registration:
 *   GroupMember.ReadWrite.All  - listing groups + adding members
 *   Organization.Read.All      - reading subscribed SKUs
 *   User.ReadWrite.All         - the UPN availability check
 */

const DEFAULT_ALLOWED_ORIGINS = [
  'https://staff.dhwebsiteservices.co.uk',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

// Friendly names for the SKUs DH actually uses. Graph only returns skuPartNumber
// (e.g. "O365_BUSINESS_PREMIUM"), which is not something you want in a dropdown.
const SKU_DISPLAY_NAMES = {
  O365_BUSINESS_ESSENTIALS: 'Microsoft 365 Business Basic',
  O365_BUSINESS_PREMIUM: 'Microsoft 365 Business Standard',
  SPB: 'Microsoft 365 Business Premium',
  O365_BUSINESS: 'Microsoft 365 Apps for Business',
  OFFICESUBSCRIPTION: 'Microsoft 365 Apps for Enterprise',
  ENTERPRISEPACK: 'Office 365 E3',
  ENTERPRISEPREMIUM: 'Office 365 E5',
  STANDARDPACK: 'Office 365 E1',
  EXCHANGESTANDARD: 'Exchange Online (Plan 1)',
  EXCHANGEENTERPRISE: 'Exchange Online (Plan 2)',
  POWER_BI_STANDARD: 'Power BI (free)',
  TEAMS_EXPLORATORY: 'Microsoft Teams Exploratory',
  MCOMEETADV: 'Microsoft 365 Audio Conferencing',
  FLOW_FREE: 'Power Automate (free)',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
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

async function graphGetAll(token, path) {
  // Follow @odata.nextLink so a large directory isn't silently truncated.
  const collected = []
  let url = `https://graph.microsoft.com/v1.0${path}`
  while (url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Graph request failed (${response.status}) ${path}: ${text}`)
    }
    const payload = await response.json()
    collected.push(...(payload.value || []))
    url = payload['@odata.nextLink'] || null
  }
  return collected
}

function describeGroupType(group) {
  if (group.groupTypes?.includes('Unified')) return 'Microsoft 365'
  if (group.securityEnabled && !group.mailEnabled) return 'Security'
  if (group.mailEnabled && !group.securityEnabled) return 'Distribution'
  if (group.mailEnabled && group.securityEnabled) return 'Mail-enabled security'
  return 'Group'
}

export async function onRequestGet(context) {
  if (!isAllowedOrigin(context.request, context.env)) {
    return json({ error: 'Origin is not allowed.' }, 403)
  }
  if (!context.env.MICROSOFT_TENANT_ID || !context.env.MICROSOFT_CLIENT_ID || !context.env.MICROSOFT_CLIENT_SECRET) {
    return json({ error: 'Microsoft directory lookup is not configured.' }, 503)
  }

  const url = new URL(context.request.url)
  const resource = String(url.searchParams.get('resource') || 'all').toLowerCase()

  try {
    const token = await getGraphAccessToken(context.env)

    if (resource === 'check-upn') {
      const upn = String(url.searchParams.get('upn') || '').toLowerCase().trim()
      if (!upn.includes('@')) return json({ error: 'A full work email is required.' }, 400)
      const query = encodeURIComponent(`userPrincipalName eq '${upn}'`)
      const matches = await graphGetAll(token, `/users?$select=id&$filter=${query}`)
      return json({ upn, available: matches.length === 0 })
    }

    const result = {}

    if (resource === 'groups' || resource === 'all') {
      const groups = await graphGetAll(
        token,
        '/groups?$select=id,displayName,description,mailEnabled,securityEnabled,groupTypes&$top=999'
      )
      result.groups = groups
        .map((group) => ({
          id: group.id,
          name: group.displayName || '(unnamed group)',
          description: group.description || '',
          type: describeGroupType(group),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }

    if (resource === 'licenses' || resource === 'all') {
      const skus = await graphGetAll(token, '/subscribedSkus')
      result.licenses = skus
        .filter((sku) => sku.capabilityStatus === 'Enabled')
        .map((sku) => {
          const total = sku.prepaidUnits?.enabled ?? 0
          const used = sku.consumedUnits ?? 0
          return {
            skuId: sku.skuId,
            partNumber: sku.skuPartNumber,
            name: SKU_DISPLAY_NAMES[sku.skuPartNumber] || sku.skuPartNumber,
            total,
            used,
            available: Math.max(0, total - used),
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    }

    return json({ ok: true, ...result })
  } catch (error) {
    console.warn('Microsoft directory lookup failed:', error)
    return json({ error: error?.message || 'microsoft_directory_lookup_failed' }, 502)
  }
}
