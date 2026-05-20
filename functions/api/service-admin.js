const DEFAULT_ALLOWED_ORIGINS = [
  'https://staff.dhwebsiteservices.co.uk',
  'https://dh-portal-v2.pages.dev',
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

function resolveSupabaseConfig(env) {
  return {
    url: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
    key: env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON || '',
  }
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
  if (!origin) return true
  if (getAllowedOrigins(env).has(origin)) return true

  try {
    const requestOrigin = new URL(request.url).origin
    if (origin === requestOrigin) return true
    const { hostname, protocol } = new URL(origin)
    return protocol === 'https:' && (
      hostname === 'staff.dhwebsiteservices.co.uk' ||
      hostname.endsWith('.dh-portal-v2.pages.dev') ||
      hostname.endsWith('.pages.dev')
    )
  } catch {
    return false
  }
}

async function supabaseFetch(env, path, options = {}) {
  const config = resolveSupabaseConfig(env)
  const response = await fetch(`${config.url}${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Supabase request failed (${response.status}): ${errorText}`)
  }

  if (response.status === 204) return null
  return response.json().catch(() => null)
}

function toKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeConfigItems(rawItems = []) {
  if (!Array.isArray(rawItems)) return []
  return rawItems
    .map((item) => {
      const key = String(item?.key || '').trim()
      if (!key) return null
      return {
        key,
        value: item?.value ?? '',
        category: String(item?.category || 'general').trim() || 'general',
        label: String(item?.label || key).trim(),
        reason: String(item?.reason || '').trim(),
      }
    })
    .filter(Boolean)
}

function normalizeFeatureFlag(raw = {}) {
  const key = toKey(raw?.key || '')
  if (!key) throw new Error('Missing feature flag key.')
  return {
    key,
    enabled: raw?.enabled === true,
    description: String(raw?.description || '').trim(),
    audience_scope: String(raw?.audience_scope || 'all_staff').trim() || 'all_staff',
    expires_at: String(raw?.expires_at || '').trim() || null,
  }
}

function normalizeStatusPayload(raw = {}) {
  const name = String(raw?.name || '').trim()
  if (!name) throw new Error('Missing system name.')
  const status = String(raw?.status || '').trim() || 'operational'
  return {
    name,
    status,
    note: String(raw?.note || '').trim(),
    url: String(raw?.url || '').trim(),
    public_note: String(raw?.public_note || '').trim(),
    internal_note: String(raw?.internal_note || '').trim(),
    severity: String(raw?.severity || 'normal').trim() || 'normal',
    audience: String(raw?.audience || 'staff').trim() || 'staff',
    starts_at: String(raw?.starts_at || '').trim() || null,
    ends_at: String(raw?.ends_at || '').trim() || null,
  }
}

function normalizePortalMaintenance(raw = {}) {
  return {
    enabled: raw?.enabled === true,
    message: String(raw?.message || '').trim(),
    eta: String(raw?.eta || '').trim(),
  }
}

function normalizeReleasePayload(raw = {}) {
  const version = String(raw?.version || '').trim()
  if (!version) throw new Error('Missing release version.')
  return {
    version,
    title: String(raw?.title || '').trim() || version,
    notes: String(raw?.notes || '').trim(),
    mode: String(raw?.mode || 'soft_announce').trim() || 'soft_announce',
    force_refresh: raw?.force_refresh === true,
    blocked: raw?.blocked === true,
  }
}

function normalizeSessionControl(raw = {}) {
  const emails = Array.isArray(raw?.emails)
    ? raw.emails.map((value) => String(value || '').toLowerCase().trim()).filter(Boolean)
    : []
  if (!emails.length) throw new Error('No user emails supplied.')
  return {
    emails,
    reason: String(raw?.reason || '').trim(),
  }
}

function buildHistoryRow({ actorEmail = '', actorName = '', category = '', targetKey = '', previousValue = null, nextValue = null, reason = '' } = {}) {
  return {
    actor_email: actorEmail,
    actor_name: actorName,
    category,
    target_key: targetKey,
    previous_value: previousValue,
    next_value: nextValue,
    reason,
    changed_at: new Date().toISOString(),
  }
}

function buildAuditRow({ actorEmail = '', actorName = '', action = '', target = '', targetId = null, details = {} } = {}) {
  return {
    user_email: actorEmail,
    user_name: actorName,
    action,
    target,
    target_id: targetId ? String(targetId) : null,
    details: {
      scope: 'service_admin',
      outcome: 'success',
      ...details,
    },
    created_at: new Date().toISOString(),
  }
}

async function writeAudit(env, row) {
  try {
    await supabaseFetch(env, '/rest/v1/audit_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([row]),
    })
  } catch (error) {
    console.warn('Service admin audit write failed:', error)
  }
}

async function fetchPortalSettingsMap(env) {
  const rows = await supabaseFetch(env, '/rest/v1/portal_settings?select=key,value')
  const map = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    map.set(String(row.key || '').trim(), row.value)
  }
  return map
}

async function fetchMaintenanceSummary(env) {
  const systems = await supabaseFetch(env, '/rest/v1/maintenance_systems?select=*&order=name.asc').catch(() => [])
  const settingsMap = await fetchPortalSettingsMap(env).catch(() => new Map())
  const portalMaintenanceRaw = settingsMap.get('portal_maintenance')
  const portalMaintenance = {
    enabled: portalMaintenanceRaw?.value?.enabled === true || portalMaintenanceRaw?.enabled === true,
    message: portalMaintenanceRaw?.value?.message || portalMaintenanceRaw?.message || '',
    eta: portalMaintenanceRaw?.value?.eta || portalMaintenanceRaw?.eta || '',
  }
  return {
    systems: Array.isArray(systems) ? systems : [],
    portalMaintenance,
  }
}

async function fetchServiceChecks(env) {
  return supabaseFetch(env, '/rest/v1/service_admin_checks?select=*&order=checked_at.desc&limit=12').catch(() => [])
}

async function fetchReleaseHistory(env) {
  return supabaseFetch(env, '/rest/v1/service_admin_release_history?select=*&order=published_at.desc&limit=8').catch(() => [])
}

async function fetchConfigHistory(env) {
  return supabaseFetch(env, '/rest/v1/service_admin_config_history?select=*&order=changed_at.desc&limit=12').catch(() => [])
}

async function fetchFeatureFlags(env) {
  return supabaseFetch(env, '/rest/v1/service_admin_flags?select=*&order=key.asc').catch(() => [])
}

async function fetchStaffPresenceRows(env) {
  return supabaseFetch(env, '/rest/v1/portal_settings?select=key,value&key=like.staff_presence:%').catch(() => [])
}

function countSuspendedAccounts(settingsRows = []) {
  return settingsRows.reduce((count, row) => {
    const value = row?.value
    const locked = value?.portal_access_locked === true
    return count + (locked ? 1 : 0)
  }, 0)
}

async function fetchOverview(env) {
  const config = resolveSupabaseConfig(env)
  if (!config.url || !config.key) {
    return {
      ok: true,
      configured: false,
      controlCenter: {},
      serviceStatus: { systems: [], portalMaintenance: { enabled: false, message: '', eta: '' } },
      releaseManager: { currentVersion: '', releases: [], featureFlags: [] },
      configManager: { settings: [], history: [] },
      integrations: [],
      safeguards: [],
      automations: [],
      auditAndRecovery: { recentAdminActions: [], suspendedAccounts: 0, liveStaff: [] },
    }
  }

  const [
    maintenanceSummary,
    serviceChecks,
    releases,
    featureFlags,
    configHistory,
    settingsRows,
    presenceRows,
    recentAdminActions,
  ] = await Promise.all([
    fetchMaintenanceSummary(env),
    fetchServiceChecks(env),
    fetchReleaseHistory(env),
    fetchFeatureFlags(env),
    fetchConfigHistory(env),
    supabaseFetch(env, '/rest/v1/portal_settings?select=key,value').catch(() => []),
    fetchStaffPresenceRows(env),
    supabaseFetch(env, '/rest/v1/audit_log?select=id,user_name,action,target,target_id,details,created_at&order=created_at.desc&limit=20').catch(() => []),
  ])

  const settingsMap = new Map()
  for (const row of Array.isArray(settingsRows) ? settingsRows : []) {
    settingsMap.set(String(row.key || '').trim(), row.value)
  }

  const liveStaff = (Array.isArray(presenceRows) ? presenceRows : [])
    .map((row) => {
      const key = String(row.key || '')
      const email = key.replace(/^staff_presence:/, '')
      const value = row.value || {}
      return {
        email,
        status: String(value.status || 'offline'),
        note: String(value.note || ''),
        user_name: String(value.user_name || email),
        seen_at: String(value.seen_at || ''),
      }
    })
    .sort((a, b) => String(b.seen_at).localeCompare(String(a.seen_at)))
    .slice(0, 8)

  const suspendedAccounts = countSuspendedAccounts(
    (Array.isArray(settingsRows) ? settingsRows : []).filter((row) => String(row.key || '').startsWith('account_security:'))
  )

  const flaggedChecks = (Array.isArray(serviceChecks) ? serviceChecks : []).filter((check) => check.status && check.status !== 'pass')
  const currentVersion = String(settingsMap.get('release_current_version')?.value || settingsMap.get('release_current_version') || '').trim()
  const previousVersion = String(settingsMap.get('release_previous_version')?.value || settingsMap.get('release_previous_version') || '').trim()
  const whatsNewPayload = settingsMap.get('whats_new_payload') || null

  const configItems = [
    { key: 'portal_name', label: 'Portal name', category: 'branding', value: settingsMap.get('portal_name')?.value ?? settingsMap.get('portal_name') ?? 'DH Website Services' },
    { key: 'portal_tagline', label: 'Portal tagline', category: 'branding', value: settingsMap.get('portal_tagline')?.value ?? settingsMap.get('portal_tagline') ?? 'Internal access' },
    { key: 'support_email', label: 'Support email', category: 'support', value: settingsMap.get('support_email')?.value ?? settingsMap.get('support_email') ?? 'mgmt@dhwebsiteservices.co.uk' },
    { key: 'support_phone', label: 'Support phone', category: 'support', value: settingsMap.get('support_phone')?.value ?? settingsMap.get('support_phone') ?? '' },
    { key: 'technical_contact_name', label: 'Technical contact', category: 'support', value: settingsMap.get('technical_contact_name')?.value ?? settingsMap.get('technical_contact_name') ?? 'David Hooper' },
    { key: 'technical_contact_email', label: 'Technical contact email', category: 'support', value: settingsMap.get('technical_contact_email')?.value ?? settingsMap.get('technical_contact_email') ?? 'mgmt@dhwebsiteservices.co.uk' },
    { key: 'technical_contact_phone', label: 'Technical contact phone', category: 'support', value: settingsMap.get('technical_contact_phone')?.value ?? settingsMap.get('technical_contact_phone') ?? '07359587007' },
    { key: 'from_name', label: 'Email from name', category: 'communications', value: settingsMap.get('from_name')?.value ?? settingsMap.get('from_name') ?? 'DH Website Services' },
    { key: 'email_footer', label: 'Email footer', category: 'communications', value: settingsMap.get('email_footer')?.value ?? settingsMap.get('email_footer') ?? '' },
    { key: 'batch_email_rate_limit_per_second', label: 'Email batch rate limit/sec', category: 'communications', value: settingsMap.get('batch_email_rate_limit_per_second')?.value ?? settingsMap.get('batch_email_rate_limit_per_second') ?? '4' },
    { key: 'batch_sms_rate_limit_per_second', label: 'SMS batch rate limit/sec', category: 'communications', value: settingsMap.get('batch_sms_rate_limit_per_second')?.value ?? settingsMap.get('batch_sms_rate_limit_per_second') ?? '2' },
    { key: 'gocardless_env', label: 'GoCardless environment', category: 'payments', value: settingsMap.get('gocardless_env')?.value ?? settingsMap.get('gocardless_env') ?? 'sandbox' },
    { key: 'notifications_email_enabled', label: 'Email notifications enabled', category: 'operational', value: settingsMap.get('notifications_email_enabled')?.value ?? settingsMap.get('notifications_email_enabled') ?? true },
    { key: 'notifications_sms_enabled', label: 'SMS notifications enabled', category: 'operational', value: settingsMap.get('notifications_sms_enabled')?.value ?? settingsMap.get('notifications_sms_enabled') ?? false },
    { key: 'booking_links_enabled', label: 'Booking links enabled', category: 'booking', value: settingsMap.get('booking_links_enabled')?.value ?? settingsMap.get('booking_links_enabled') ?? true },
    { key: 'booking_default_duration_minutes', label: 'Default booking length', category: 'booking', value: settingsMap.get('booking_default_duration_minutes')?.value ?? settingsMap.get('booking_default_duration_minutes') ?? '30' },
    { key: 'booking_default_buffer_minutes', label: 'Default booking buffer', category: 'booking', value: settingsMap.get('booking_default_buffer_minutes')?.value ?? settingsMap.get('booking_default_buffer_minutes') ?? '15' },
    { key: 'booking_max_calls_per_day', label: 'Max booking calls/day', category: 'booking', value: settingsMap.get('booking_max_calls_per_day')?.value ?? settingsMap.get('booking_max_calls_per_day') ?? '8' },
    { key: 'onboarding_default_manager_email', label: 'Default onboarding manager', category: 'onboarding', value: settingsMap.get('onboarding_default_manager_email')?.value ?? settingsMap.get('onboarding_default_manager_email') ?? '' },
    { key: 'onboarding_default_department', label: 'Default onboarding department', category: 'onboarding', value: settingsMap.get('onboarding_default_department')?.value ?? settingsMap.get('onboarding_default_department') ?? '' },
    { key: 'onboarding_sales_guide_required', label: 'Attach sales guide by default', category: 'onboarding', value: settingsMap.get('onboarding_sales_guide_required')?.value ?? settingsMap.get('onboarding_sales_guide_required') ?? true },
    { key: 'portal_update_popup_enabled', label: 'Update popup enabled', category: 'releases', value: settingsMap.get('portal_update_popup_enabled')?.value ?? settingsMap.get('portal_update_popup_enabled') ?? true },
    { key: 'portal_update_banner_after_defer', label: 'Banner after defer', category: 'releases', value: settingsMap.get('portal_update_banner_after_defer')?.value ?? settingsMap.get('portal_update_banner_after_defer') ?? true },
    { key: 'audit_retention_days', label: 'Audit retention days', category: 'governance', value: settingsMap.get('audit_retention_days')?.value ?? settingsMap.get('audit_retention_days') ?? '365' },
    { key: 'terminated_staff_schedule_hidden', label: 'Hide terminated staff from schedules', category: 'governance', value: settingsMap.get('terminated_staff_schedule_hidden')?.value ?? settingsMap.get('terminated_staff_schedule_hidden') ?? true },
    { key: 'sensitive_action_reason_required', label: 'Require reason for sensitive changes', category: 'security', value: settingsMap.get('sensitive_action_reason_required')?.value ?? settingsMap.get('sensitive_action_reason_required') ?? true },
    { key: 'session_reauth_hours', label: 'Session re-auth hours', category: 'security', value: settingsMap.get('session_reauth_hours')?.value ?? settingsMap.get('session_reauth_hours') ?? '12' },
  ]

  const integrations = [
    {
      key: 'supabase',
      label: 'Supabase',
      status: config.url && config.key ? 'configured' : 'missing',
      detail: config.url ? 'Database endpoint configured' : 'Missing Supabase config',
    },
    {
      key: 'email_worker',
      label: 'Email worker',
      status: env.VITE_WORKER_URL ? 'configured' : 'missing',
      detail: env.VITE_WORKER_URL ? 'Worker endpoint present' : 'Missing worker URL',
    },
    {
      key: 'sms',
      label: 'ClickSend / SMS',
      status: env.CLICKSEND_API_KEY && env.CLICKSEND_USERNAME ? 'configured' : 'missing',
      detail: env.CLICKSEND_API_KEY && env.CLICKSEND_USERNAME ? 'SMS credentials present' : 'SMS credentials incomplete',
    },
    {
      key: 'microsoft_graph',
      label: 'Microsoft provisioning',
      status: env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && env.MICROSOFT_TENANT_ID ? 'configured' : 'missing',
      detail: env.MICROSOFT_CLIENT_ID ? 'Client ID present' : 'Microsoft Graph secrets missing',
    },
    {
      key: 'calendar_sync',
      label: 'Microsoft calendar sync',
      status: env.MICROSOFT_CALENDAR_SYNC_SECRET ? 'configured' : 'missing',
      detail: env.MICROSOFT_CALENDAR_SYNC_SECRET ? 'Sync secret configured' : 'Sync secret missing',
    },
    {
      key: 'update_manifest',
      label: 'Portal updates',
      status: 'configured',
      detail: 'Uses version.json and update-manifest.json',
    },
  ]

  return {
    ok: true,
    configured: true,
    controlCenter: {
      portalMaintenanceEnabled: maintenanceSummary.portalMaintenance.enabled,
      staffPortalStatus: (maintenanceSummary.systems.find((row) => row.name === 'Staff Portal') || {}).status || 'operational',
      activeIncidents: flaggedChecks.length,
      failedChecks: flaggedChecks.length,
      currentVersion,
      previousVersion,
      suspendedAccounts,
      liveStaffCount: liveStaff.length,
    },
    serviceStatus: maintenanceSummary,
    releaseManager: {
      currentVersion,
      previousVersion,
      whatsNewPayload,
      releases: Array.isArray(releases) ? releases : [],
      featureFlags: Array.isArray(featureFlags) ? featureFlags : [],
    },
    configManager: {
      settings: configItems,
      history: Array.isArray(configHistory) ? configHistory : [],
    },
    integrations,
    safeguards: Array.isArray(serviceChecks) ? serviceChecks : [],
    automations: [
      { label: 'Workflow Automation', path: '/workflow-automation', description: 'Rules, triggers, and escalations' },
      { label: 'Admin Safeguards', path: '/admin-safeguards', description: 'Data integrity checks and recoveries' },
    ],
    auditAndRecovery: {
      recentAdminActions: Array.isArray(recentAdminActions) ? recentAdminActions.filter((row) => row?.details?.scope === 'service_admin').slice(0, 12) : [],
      suspendedAccounts,
      liveStaff,
    },
  }
}

async function saveConfig(env, body) {
  const actorEmail = String(body?.actor_email || '').toLowerCase().trim()
  const actorName = String(body?.actor_name || '').trim()
  const items = normalizeConfigItems(body?.items)
  if (!items.length) throw new Error('No config items supplied.')

  const settingsMap = await fetchPortalSettingsMap(env)
  const upsertRows = items.map((item) => ({
    key: item.key,
    value: { value: item.value, category: item.category, label: item.label },
  }))
  const historyRows = items.map((item) => buildHistoryRow({
    actorEmail,
    actorName,
    category: item.category,
    targetKey: item.key,
    previousValue: settingsMap.get(item.key) ?? null,
    nextValue: item.value,
    reason: item.reason,
  }))

  await supabaseFetch(env, '/rest/v1/portal_settings?on_conflict=key', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(upsertRows),
  })

  await supabaseFetch(env, '/rest/v1/service_admin_config_history', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(historyRows),
  })

  await writeAudit(env, buildAuditRow({
    actorEmail,
    actorName,
    action: 'service_admin_config_save',
    target: 'service_admin_config',
    details: {
      changed_keys: items.map((item) => item.key),
      reason: items.map((item) => item.reason).filter(Boolean).join(' | '),
    },
  }))

  return { ok: true }
}

async function upsertFeatureFlag(env, body) {
  const actorEmail = String(body?.actor_email || '').toLowerCase().trim()
  const actorName = String(body?.actor_name || '').trim()
  const flag = normalizeFeatureFlag(body?.flag)
  await supabaseFetch(env, '/rest/v1/service_admin_flags?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      ...flag,
      updated_at: new Date().toISOString(),
      updated_by_email: actorEmail,
      updated_by_name: actorName,
    }]),
  })

  await writeAudit(env, buildAuditRow({
    actorEmail,
    actorName,
    action: 'service_admin_feature_flag_upsert',
    target: 'service_admin_flag',
    targetId: flag.key,
    details: {
      enabled: flag.enabled,
      audience_scope: flag.audience_scope,
    },
  }))

  return { ok: true }
}

async function publishRelease(env, body) {
  const actorEmail = String(body?.actor_email || '').toLowerCase().trim()
  const actorName = String(body?.actor_name || '').trim()
  const release = normalizeReleasePayload(body?.release)
  const publishedAt = new Date().toISOString()

  await supabaseFetch(env, '/rest/v1/service_admin_release_history', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{
      version: release.version,
      title: release.title,
      notes: release.notes,
      mode: release.mode,
      force_refresh: release.force_refresh,
      blocked: release.blocked,
      published_at: publishedAt,
      published_by_email: actorEmail,
      published_by_name: actorName,
    }]),
  })

  const currentVersionSetting = body?.current_version ? String(body.current_version).trim() : ''
  const portalSettingRows = [
    { key: 'release_current_version', value: { value: release.version, published_at: publishedAt } },
    { key: 'release_blocked_version', value: { value: release.blocked ? release.version : '', blocked_at: publishedAt } },
    { key: 'release_last_mode', value: { value: release.mode, force_refresh: release.force_refresh } },
  ]
  if (currentVersionSetting && currentVersionSetting !== release.version) {
    portalSettingRows.push({ key: 'release_previous_version', value: { value: currentVersionSetting, replaced_at: publishedAt } })
  }
  if (release.notes || release.title) {
    portalSettingRows.push({
      key: 'whats_new_payload',
      value: {
        version: release.version,
        title: release.title,
        body: release.notes,
        mode: release.mode,
        published_at: publishedAt,
      },
    })
  }

  await supabaseFetch(env, '/rest/v1/portal_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(portalSettingRows),
  })

  await writeAudit(env, buildAuditRow({
    actorEmail,
    actorName,
    action: 'service_admin_release_publish',
    target: 'service_admin_release',
    targetId: release.version,
    details: {
      mode: release.mode,
      force_refresh: release.force_refresh,
      blocked: release.blocked,
    },
  }))

  return { ok: true }
}

async function updateStatus(env, body) {
  const actorEmail = String(body?.actor_email || '').toLowerCase().trim()
  const actorName = String(body?.actor_name || '').trim()
  const payload = normalizeStatusPayload(body?.status)
  const updatedAt = new Date().toISOString()

  const existingRows = await supabaseFetch(env, `/rest/v1/maintenance_systems?select=*&name=eq.${encodeURIComponent(payload.name)}`).catch(() => [])
  const existing = Array.isArray(existingRows) && existingRows.length ? existingRows[0] : null

  if (existing?.id) {
    await supabaseFetch(env, `/rest/v1/maintenance_systems?id=eq.${existing.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: payload.status,
        note: payload.note,
        url: payload.url,
        updated_at: updatedAt,
      }),
    })
  } else {
    await supabaseFetch(env, '/rest/v1/maintenance_systems', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([{
        name: payload.name,
        status: payload.status,
        note: payload.note,
        url: payload.url,
        updated_at: updatedAt,
      }]),
    })
  }

  await supabaseFetch(env, '/rest/v1/service_admin_incidents', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{
      system_name: payload.name,
      status: payload.status,
      severity: payload.severity,
      audience: payload.audience,
      public_note: payload.public_note,
      internal_note: payload.internal_note,
      starts_at: payload.starts_at,
      ends_at: payload.ends_at,
      changed_at: updatedAt,
      changed_by_email: actorEmail,
      changed_by_name: actorName,
    }]),
  })

  await writeAudit(env, buildAuditRow({
    actorEmail,
    actorName,
    action: 'service_admin_status_update',
    target: 'service_status',
    targetId: payload.name,
    details: {
      status: payload.status,
      severity: payload.severity,
      audience: payload.audience,
    },
  }))

  return { ok: true }
}

async function updatePortalMaintenance(env, body) {
  const actorEmail = String(body?.actor_email || '').toLowerCase().trim()
  const actorName = String(body?.actor_name || '').trim()
  const maintenance = normalizePortalMaintenance(body?.portal_maintenance)
  const settingValue = { value: maintenance }

  await supabaseFetch(env, '/rest/v1/portal_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ key: 'portal_maintenance', value: settingValue }]),
  })

  await supabaseFetch(env, '/rest/v1/service_admin_incidents', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{
      system_name: 'Staff Portal',
      status: maintenance.enabled ? 'maintenance' : 'operational',
      severity: maintenance.enabled ? 'high' : 'normal',
      audience: 'staff',
      public_note: maintenance.message,
      internal_note: '',
      starts_at: new Date().toISOString(),
      ends_at: maintenance.eta || null,
      changed_at: new Date().toISOString(),
      changed_by_email: actorEmail,
      changed_by_name: actorName,
    }]),
  })

  await writeAudit(env, buildAuditRow({
    actorEmail,
    actorName,
    action: 'service_admin_portal_maintenance_update',
    target: 'portal_maintenance',
    details: maintenance,
  }))

  return { ok: true }
}

async function revokeSessions(env, body) {
  const actorEmail = String(body?.actor_email || '').toLowerCase().trim()
  const actorName = String(body?.actor_name || '').trim()
  const payload = normalizeSessionControl(body?.session_control)
  const now = new Date().toISOString()
  const rows = payload.emails.map((email) => ({
    key: `account_security:${email}`,
    value: {
      portal_access_locked: false,
      required_session_after: now,
      session_revoked_at: now,
      session_revoked_by_email: actorEmail,
      session_revoked_by_name: actorName,
    },
  }))

  await supabaseFetch(env, '/rest/v1/portal_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })

  await writeAudit(env, buildAuditRow({
    actorEmail,
    actorName,
    action: 'service_admin_session_revoke',
    target: 'account_security',
    details: {
      emails: payload.emails,
      reason: payload.reason,
    },
  }))

  return { ok: true }
}

async function runIntegrationTest(env, body) {
  const actorEmail = String(body?.actor_email || '').toLowerCase().trim()
  const actorName = String(body?.actor_name || '').trim()
  const key = String(body?.integration_key || '').trim()
  if (!key) throw new Error('Missing integration key.')

  let status = 'pass'
  let detail = ''

  if (key === 'supabase') {
    await supabaseFetch(env, '/rest/v1/maintenance_systems?select=id&limit=1')
    detail = 'Supabase service query passed.'
  } else if (key === 'email_worker') {
    status = env.VITE_WORKER_URL ? 'pass' : 'fail'
    detail = env.VITE_WORKER_URL ? 'Email worker URL configured.' : 'Email worker URL missing.'
  } else if (key === 'microsoft_graph') {
    status = env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && env.MICROSOFT_TENANT_ID ? 'pass' : 'fail'
    detail = status === 'pass' ? 'Microsoft Graph secrets present.' : 'Microsoft Graph secrets missing.'
  } else if (key === 'sms') {
    status = env.CLICKSEND_API_KEY && env.CLICKSEND_USERNAME ? 'pass' : 'fail'
    detail = status === 'pass' ? 'SMS credentials present.' : 'SMS credentials missing.'
  } else if (key === 'update_manifest') {
    detail = 'Update manifest is generated at build time.'
  } else {
    throw new Error('Unknown integration key.')
  }

  await supabaseFetch(env, '/rest/v1/service_admin_checks', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{
      check_key: key,
      status,
      detail,
      checked_at: new Date().toISOString(),
      checked_by_email: actorEmail,
      checked_by_name: actorName,
    }]),
  }).catch(() => {})

  await writeAudit(env, buildAuditRow({
    actorEmail,
    actorName,
    action: 'service_admin_integration_test',
    target: 'integration_health',
    targetId: key,
    details: { status, detail },
  }))

  return { ok: true, status, detail }
}

async function runRecoveryAction(env, body) {
  const actorEmail = String(body?.actor_email || '').toLowerCase().trim()
  const actorName = String(body?.actor_name || '').trim()
  const action = String(body?.recovery_action || '').trim()
  if (!action) throw new Error('Missing recovery action.')

  let result = 'No change applied.'

  if (action === 'clear_blocked_release') {
    await supabaseFetch(env, '/rest/v1/portal_settings?on_conflict=key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ key: 'release_blocked_version', value: { value: '', cleared_at: new Date().toISOString() } }]),
    })
    result = 'Blocked release marker cleared.'
  } else if (action === 'reset_portal_maintenance_message') {
    await supabaseFetch(env, '/rest/v1/portal_settings?on_conflict=key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ key: 'portal_maintenance', value: { value: { enabled: false, message: '', eta: '' } } }]),
    })
    result = 'Portal maintenance lock reset.'
  } else {
    throw new Error('Unknown recovery action.')
  }

  await writeAudit(env, buildAuditRow({
    actorEmail,
    actorName,
    action: 'service_admin_recovery_action',
    target: 'service_admin_recovery',
    targetId: action,
    details: { result },
  }))

  return { ok: true, result }
}

export async function onRequestGet(context) {
  if (!isAllowedOrigin(context.request, context.env)) {
    return json({ ok: false, error: 'Origin is not allowed.' }, 403)
  }

  try {
    const payload = await fetchOverview(context.env)
    return json(payload)
  } catch (error) {
    console.warn('Service admin overview failed:', error)
    return json({ ok: false, error: error?.message || 'service_admin_overview_failed' }, 500)
  }
}

export async function onRequestPost(context) {
  if (!isAllowedOrigin(context.request, context.env)) {
    return json({ ok: false, error: 'Origin is not allowed.' }, 403)
  }

  let body
  try {
    body = await context.request.json()
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400)
  }

  const action = String(body?.action || '').trim()
  if (!action) {
    return json({ ok: false, error: 'Missing action.' }, 400)
  }

  try {
    if (action === 'config_save') return json(await saveConfig(context.env, body))
    if (action === 'feature_flag_upsert') return json(await upsertFeatureFlag(context.env, body))
    if (action === 'release_publish') return json(await publishRelease(context.env, body))
    if (action === 'status_update') return json(await updateStatus(context.env, body))
    if (action === 'portal_maintenance_update') return json(await updatePortalMaintenance(context.env, body))
    if (action === 'session_revoke') return json(await revokeSessions(context.env, body))
    if (action === 'integration_test') return json(await runIntegrationTest(context.env, body))
    if (action === 'recovery_action') return json(await runRecoveryAction(context.env, body))
    return json({ ok: false, error: 'Unknown action.' }, 400)
  } catch (error) {
    console.warn('Service admin action failed:', error)
    return json({ ok: false, error: error?.message || 'service_admin_action_failed' }, 500)
  }
}
