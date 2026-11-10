/**
 * DH device management: our own MDM for staff iPhones, no Intune.
 *
 * Phones talk to it with Apple's MDM protocol:
 *   PUT /mdm/checkin?s=…   Authenticate, TokenUpdate, CheckOut
 *   PUT /mdm/connect?s=…   "anything for me?" and the results of each command
 * The `s` secret is unique to each phone and baked into its profile, so a
 * request without it (or for another phone's UDID) is refused.
 *
 * People enrol from a one-time link:
 *   GET /enroll/<token>          instructions page (open in Safari)
 *   GET /enroll/<token>/profile  the .mobileconfig, downloadable once
 *
 * The staff app and portal use the JSON API (Microsoft sign-in):
 * Every /api route is MDM_ADMINS only; anyone else gets 403.
 *   GET  /api/me                          who am I, my phones
 *   POST /api/enroll   { email?, name? }  a one-time link for anyone's phone
 *   GET  /api/devices                     every phone
 *   GET  /api/devices/<udid>              one phone
 *   POST /api/devices/<udid>/command { type, message?, phone? }
 *        type: refresh | screenlock | lock, restart | shutdown (supervised phones only)
 *   POST /api/devices/<udid>/remove       admin: take the phone out of management
 *   GET  /api/audit                       admin
 */
import { healthCheck, summarizeProfiles, summarizeCertificates } from './health.js'
import { parsePlist, buildPlist } from './plist.js'
import { requireStaff, requireAdmin } from './auth.js'
import { buildEnrollmentProfile, PROFILE_ID } from './profile.js'
import { wake, pushReady } from './apns.js'
import { enrollPage, messagePage } from './pages.js'

const LINK_TTL_MS = 24 * 3600 * 1000
const RESEND_AFTER_MS = 10 * 60 * 1000
const DEFAULT_LOCK_PHONE = '01443 805303'

const DEVICE_QUERIES = [
  'DeviceName', 'Model', 'ModelName', 'ProductName', 'SerialNumber', 'OSVersion', 'BuildVersion',
  'DeviceCapacity', 'AvailableDeviceCapacity', 'BatteryLevel', 'IsSupervised', 'IsActivationLockEnabled',
  'IsDeviceLocatorServiceEnabled', 'IsDoNotDisturbInEffect', 'IsCloudBackupEnabled', 'LastCloudBackupDate',
  'WiFiMAC', 'BluetoothMAC', 'IMEI', 'MEID', 'ModemFirmwareVersion', 'IsRoaming', 'PersonalHotspotEnabled',
  'SubscriberCarrierNetwork', 'CurrentCarrierNetwork', 'PhoneNumber', 'TimeZone', 'SupplementalBuildVersion',
]

// ── small helpers ─────────────────────────────────────────────────────────

const now = () => Date.now()
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
const randomToken = (n = 24) => hex(crypto.getRandomValues(new Uint8Array(n)))
async function sha256(text) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
}
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e }
const cleanEmail = (s) => String(s || '').trim().toLowerCase()
const cleanUdid = (s) => {
  const u = String(s || '').trim()
  if (!/^[A-Za-z0-9-]{20,64}$/.test(u)) fail(400, 'Unknown device.')
  return u
}

function cors(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim())
  return {
    'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0] || '',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
}
const json = (request, env, body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(request, env) },
})
const plist = (obj) => new Response(buildPlist(obj), { headers: { 'content-type': 'application/xml; charset=utf-8' } })
const html = (body, status = 200) => new Response(body, {
  status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' },
})

async function audit(env, actor, action, udid = null, detail = null) {
  await env.DB.prepare('INSERT INTO audit (at, actor, action, udid, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(now(), actor, action, udid, detail == null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail)).run()
}

// ── commands ──────────────────────────────────────────────────────────────

async function queueCommand(env, udid, requestType, payload, actor) {
  const uuid = crypto.randomUUID().toUpperCase()
  await env.DB.prepare('INSERT INTO commands (uuid, udid, request_type, payload_json, status, queued_by, queued_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(uuid, udid, requestType, JSON.stringify(payload || {}), 'queued', actor, now()).run()
  return uuid
}

/** The three queries behind "refresh": inventory, security and apps. */
async function queueRefresh(env, udid, actor) {
  const pending = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM commands WHERE udid = ? AND request_type = 'DeviceInformation' AND status IN ('queued','sent','notnow')",
  ).bind(udid).first()
  if (pending?.n) return false
  await queueCommand(env, udid, 'DeviceInformation', { Queries: DEVICE_QUERIES }, actor)
  await queueCommand(env, udid, 'SecurityInfo', {}, actor)
  await queueCommand(env, udid, 'InstalledApplicationList', { ManagedAppsOnly: false }, actor)
  await queueCommand(env, udid, 'ProfileList', {}, actor)
  await queueCommand(env, udid, 'CertificateList', {}, actor)
  return true
}

/**
 * Keeping every phone's details fresh without anyone opening anything: the
 * Ticker alarm (below) runs this every hour, and opening a device list runs
 * it too. A phone whose details are over 6 hours old gets a refresh queued
 * and a push, at most once an hour. Commands like Lock don't wait for this:
 * they push the moment they are queued.
 */
const STALE_MS = 6 * 3600 * 1000
async function refreshStale(env, devices) {
  const t = now()
  const stale = devices.filter((d) => d.status === 'enrolled' && (!d.info_at || t - d.info_at > STALE_MS) && (!d.last_push || t - d.last_push > 3600 * 1000))
  await Promise.all(stale.map(async (d) => {
    await queueRefresh(env, d.udid, 'auto-refresh')
    await wakeAndRecord(env, d)
  }))
  return stale.length
}

/** Make sure the hourly timer is running (cheap: one Durable Object call). */
const ensureTicker = (env) => env.TICKER.get(env.TICKER.idFromName('main')).fetch('https://ticker/ensure')

export class Ticker {
  constructor(state, env) { this.state = state; this.env = env }
  async fetch() {
    if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now() + 60 * 1000)
    return new Response('ok')
  }
  async alarm() {
    try {
      const { results } = await this.env.DB.prepare("SELECT * FROM devices WHERE status = 'enrolled'").all()
      await refreshStale(this.env, results)
      await this.env.DB.prepare("DELETE FROM commands WHERE status IN ('done','error','cancelled') AND queued_at < ?").bind(now() - 90 * 86400000).run()
    } finally {
      await this.state.storage.setAlarm(Date.now() + 3600 * 1000)
    }
  }
}

async function wakeAndRecord(env, device) {
  const result = await wake(env, device)
  if (result.ok) await env.DB.prepare('UPDATE devices SET last_push = ? WHERE udid = ?').bind(now(), device.udid).run()
  return result
}

// ── the phone's side ──────────────────────────────────────────────────────

async function readPlistBody(request) {
  const text = await request.text()
  if (text.length > 2 * 1024 * 1024) fail(413, 'Too large')
  return parsePlist(text)
}

async function checkin(request, env, url) {
  const secret = url.searchParams.get('s') || ''
  if (!/^[a-f0-9]{48}$/.test(secret)) return new Response('Unauthorised', { status: 401 })
  const secretHash = await sha256(secret)
  const msg = await readPlistBody(request)
  const udid = cleanUdid(msg.UDID)

  switch (msg.MessageType) {
    case 'Authenticate': {
      const enrollment = await env.DB.prepare('SELECT * FROM enrollments WHERE secret_hash = ?').bind(secretHash).first()
      if (!enrollment) return new Response('Unknown enrolment', { status: 401 })
      const existing = await env.DB.prepare('SELECT udid, secret_hash FROM devices WHERE udid = ?').bind(udid).first()
      // A phone re-enrolling with a new profile replaces its old record.
      await env.DB.prepare(`INSERT INTO devices (udid, enrollment_id, email, owner_name, secret_hash, topic, status, serial, model, product, os_version, device_name, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, 'enrolling', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(udid) DO UPDATE SET enrollment_id = excluded.enrollment_id, email = excluded.email, owner_name = excluded.owner_name,
          secret_hash = excluded.secret_hash, topic = excluded.topic, status = 'enrolling', removed_at = NULL, push_token = NULL, push_magic = NULL,
          serial = excluded.serial, model = excluded.model, product = excluded.product, os_version = excluded.os_version,
          device_name = COALESCE(excluded.device_name, devices.device_name), last_seen = excluded.last_seen`)
        .bind(udid, enrollment.id, enrollment.email, enrollment.name, secretHash, msg.Topic || env.MDM_PUSH_TOPIC,
          msg.SerialNumber || null, msg.ModelName || msg.Model || null, msg.ProductName || null, msg.OSVersion || null, msg.DeviceName || null, now()).run()
      await audit(env, enrollment.email, existing ? 'device.re-enrolling' : 'device.enrolling', udid, { serial: msg.SerialNumber, product: msg.ProductName })
      return plist({})
    }
    case 'TokenUpdate': {
      const device = await env.DB.prepare('SELECT * FROM devices WHERE udid = ? AND secret_hash = ?').bind(udid, secretHash).first()
      if (!device) return new Response('Unknown device', { status: 401 })
      if (msg.UserID || msg.UserShortName) return plist({}) // user channel: not used
      const token = msg.Token instanceof Uint8Array ? hex(msg.Token) : null
      const first = device.status !== 'enrolled'
      await env.DB.prepare(`UPDATE devices SET push_token = COALESCE(?, push_token), push_magic = COALESCE(?, push_magic), topic = COALESCE(?, topic),
          status = 'enrolled', enrolled_at = COALESCE(enrolled_at, ?), last_seen = ? WHERE udid = ?`)
        .bind(token, msg.PushMagic || null, msg.Topic || null, now(), now(), udid).run()
      if (first) {
        await audit(env, device.email, 'device.enrolled', udid)
        await queueRefresh(env, udid, 'enrolment')
        const fresh = await env.DB.prepare('SELECT * FROM devices WHERE udid = ?').bind(udid).first()
        // The phone checks in on its own straight after enrolling; the push is a backstop.
        await wakeAndRecord(env, fresh)
      }
      return plist({})
    }
    case 'CheckOut': {
      const device = await env.DB.prepare('SELECT * FROM devices WHERE udid = ? AND secret_hash = ?').bind(udid, secretHash).first()
      if (!device) return new Response('Unknown device', { status: 401 })
      await env.DB.prepare("UPDATE devices SET status = 'removed', removed_at = ?, push_token = NULL, push_magic = NULL WHERE udid = ?").bind(now(), udid).run()
      await env.DB.prepare("UPDATE commands SET status = 'cancelled' WHERE udid = ? AND status IN ('queued','sent','notnow')").bind(udid).run()
      await audit(env, device.email, 'device.removed-by-user', udid)
      return plist({})
    }
    case 'UserAuthenticate':
      return new Response('', { status: 410 }) // no per-user channel
    default:
      return plist({})
  }
}

/** Store what a finished command told us about the phone. */
async function absorbResult(env, udid, cmd, msg) {
  const t = now()
  if (cmd.request_type === 'DeviceInformation' && msg.QueryResponses) {
    const q = msg.QueryResponses
    const info = { ...q }
    for (const [k, v] of Object.entries(info)) if (v instanceof Uint8Array) delete info[k]
    await env.DB.prepare(`UPDATE devices SET info_json = ?, info_at = ?, device_name = COALESCE(?, device_name), model = COALESCE(?, model),
        product = COALESCE(?, product), serial = COALESCE(?, serial), os_version = COALESCE(?, os_version), supervised = ? WHERE udid = ?`)
      .bind(JSON.stringify(info), t, q.DeviceName || null, q.ModelName || q.Model || null, q.ProductName || null, q.SerialNumber || null,
        q.OSVersion || null, q.IsSupervised === true ? 1 : 0, udid).run()
  } else if (cmd.request_type === 'SecurityInfo' && msg.SecurityInfo) {
    const s = { ...msg.SecurityInfo }
    for (const [k, v] of Object.entries(s)) if (v instanceof Uint8Array) delete s[k]
    await env.DB.prepare('UPDATE devices SET security_json = ?, security_at = ? WHERE udid = ?').bind(JSON.stringify(s), t, udid).run()
  } else if (cmd.request_type === 'InstalledApplicationList' && Array.isArray(msg.InstalledApplicationList)) {
    const apps = msg.InstalledApplicationList.map((a) => ({
      name: a.Name || null, id: a.Identifier || null, version: a.ShortVersion || a.Version || null,
      sizeMB: a.BundleSize ? Math.round(a.BundleSize / 1e6) : null,
    })).sort((a, b) => String(a.name).localeCompare(String(b.name)))
    await env.DB.prepare('UPDATE devices SET apps_json = ?, apps_at = ? WHERE udid = ?').bind(JSON.stringify(apps), t, udid).run()
  } else if (cmd.request_type === 'ProfileList' && Array.isArray(msg.ProfileList)) {
    await env.DB.prepare('UPDATE devices SET profiles_json = ?, profiles_at = ? WHERE udid = ?')
      .bind(JSON.stringify(summarizeProfiles(msg.ProfileList)), t, udid).run()
  } else if (cmd.request_type === 'CertificateList' && Array.isArray(msg.CertificateList)) {
    await env.DB.prepare('UPDATE devices SET certs_json = ?, certs_at = ? WHERE udid = ?')
      .bind(JSON.stringify(summarizeCertificates(msg.CertificateList)), t, udid).run()
  }
}

/** Keep only small, readable parts of a result for the history list. */
function resultSummary(msg) {
  const out = {}
  if (Array.isArray(msg.ErrorChain)) out.errors = msg.ErrorChain.map((e) => e.LocalizedDescription || e.USEnglishDescription || e.ErrorCode).slice(0, 4)
  if (msg.Status) out.status = msg.Status
  return out
}

async function connect(request, env, url) {
  const secret = url.searchParams.get('s') || ''
  if (!/^[a-f0-9]{48}$/.test(secret)) return new Response('Unauthorised', { status: 401 })
  const secretHash = await sha256(secret)
  const msg = await readPlistBody(request)
  const udid = cleanUdid(msg.UDID)
  const device = await env.DB.prepare("SELECT * FROM devices WHERE udid = ? AND secret_hash = ? AND status != 'removed'").bind(udid, secretHash).first()
  if (!device) return new Response('Unknown device', { status: 401 })
  if (msg.UserID || msg.EnrollmentUserID) return new Response('', { status: 200 })

  const t = now()
  await env.DB.prepare('UPDATE devices SET last_seen = ? WHERE udid = ?').bind(t, udid).run()

  if (msg.Status && msg.Status !== 'Idle' && msg.CommandUUID) {
    const cmd = await env.DB.prepare('SELECT * FROM commands WHERE uuid = ? AND udid = ?').bind(msg.CommandUUID, udid).first()
    if (cmd) {
      if (msg.Status === 'Acknowledged') {
        await absorbResult(env, udid, cmd, msg)
        await env.DB.prepare("UPDATE commands SET status = 'done', done_at = ?, result_json = ? WHERE uuid = ?").bind(t, JSON.stringify(resultSummary(msg)), cmd.uuid).run()
      } else if (msg.Status === 'NotNow') {
        // The phone is locked or busy; it checks in again when it can. Don't send anything else now.
        await env.DB.prepare("UPDATE commands SET status = 'notnow' WHERE uuid = ?").bind(cmd.uuid).run()
        return new Response('', { status: 200 })
      } else {
        const summary = resultSummary(msg)
        await env.DB.prepare("UPDATE commands SET status = 'error', done_at = ?, result_json = ?, error = ? WHERE uuid = ?")
          .bind(t, JSON.stringify(summary), (summary.errors || [msg.Status]).join('; ').slice(0, 300), cmd.uuid).run()
      }
    }
  }

  // Next command: anything queued or deferred, or a send that never got an answer.
  const next = await env.DB.prepare(`SELECT * FROM commands WHERE udid = ? AND (status IN ('queued','notnow') OR (status = 'sent' AND sent_at < ?))
      ORDER BY queued_at LIMIT 1`).bind(udid, t - RESEND_AFTER_MS).first()
  if (!next) return new Response('', { status: 200 })
  await env.DB.prepare("UPDATE commands SET status = 'sent', sent_at = ? WHERE uuid = ?").bind(t, next.uuid).run()
  return plist({ CommandUUID: next.uuid, Command: { RequestType: next.request_type, ...JSON.parse(next.payload_json) } })
}

// ── enrolment links ───────────────────────────────────────────────────────

async function enrollmentFromToken(env, token) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null
  return env.DB.prepare('SELECT * FROM enrollments WHERE token_hash = ?').bind(await sha256(token)).first()
}

function linkProblem(enrollment) {
  if (!enrollment) return 'This enrolment link is not valid. Ask for a new one in the DH Staff Portal app.'
  if (enrollment.downloaded_at) return 'This link has already been used. If the profile did not install, get a new link from the DH Staff Portal app.'
  if (enrollment.expires_at < now()) return 'This enrolment link has expired. Get a new one from the DH Staff Portal app.'
  return null
}

async function enrollRoute(request, env, token, wantsProfile) {
  const enrollment = await enrollmentFromToken(env, token)
  const problem = linkProblem(enrollment)
  if (problem) return html(messagePage(env, 'Link not usable', problem), 410)
  if (!env.MDM_PUSH_TOPIC) return html(messagePage(env, 'Not ready yet', 'Device management is still being set up. Try again later.'), 503)
  if (!wantsProfile) return html(enrollPage(env, enrollment, `${env.PUBLIC_URL.replace(/\/$/, '')}/enroll/${token}/profile`))

  // Claim the link before building, so two taps can't both get a profile.
  const secret = randomToken(24)
  const claimed = await env.DB.prepare('UPDATE enrollments SET downloaded_at = ?, secret_hash = ? WHERE id = ? AND downloaded_at IS NULL')
    .bind(now(), await sha256(secret), enrollment.id).run()
  if (!claimed.meta?.changes) return html(messagePage(env, 'Link not usable', linkProblem({ downloaded_at: 1 })), 410)

  const profile = await buildEnrollmentProfile(env, { secret, email: enrollment.email, name: enrollment.name })
  await audit(env, enrollment.email, 'enrolment.profile-downloaded', null, { enrollment: enrollment.id })
  return new Response(buildPlist(profile), {
    headers: {
      'content-type': 'application/x-apple-aspen-config',
      'content-disposition': 'attachment; filename="DH-device-management.mobileconfig"',
      'cache-control': 'no-store',
    },
  })
}

// ── admin / staff API ─────────────────────────────────────────────────────

function deviceView(d, { full = false } = {}) {
  const info = d.info_json ? JSON.parse(d.info_json) : {}
  const sec = d.security_json ? JSON.parse(d.security_json) : {}
  const out = {
    udid: d.udid,
    email: d.email,
    owner: d.owner_name,
    status: d.status,
    name: d.device_name,
    product: d.product,
    model: d.model,
    serial: d.serial,
    osVersion: d.os_version,
    supervised: d.supervised === 1,
    enrolledAt: d.enrolled_at,
    lastSeen: d.last_seen,
    lastPush: d.last_push,
    infoAt: d.info_at,
    securityAt: d.security_at,
    battery: typeof info.BatteryLevel === 'number' ? Math.round(info.BatteryLevel * 100) : null,
    capacityGB: info.DeviceCapacity ?? null,
    freeGB: info.AvailableDeviceCapacity ?? null,
    findMy: info.IsDeviceLocatorServiceEnabled ?? null,
    activationLock: info.IsActivationLockEnabled ?? null,
    icloudBackup: info.IsCloudBackupEnabled ?? null,
    lastBackup: info.LastCloudBackupDate ?? null,
    passcode: sec.PasscodePresent ?? null,
    passcodeCompliant: sec.PasscodeCompliant ?? null,
    encrypted: sec.HardwareEncryptionCaps != null ? (sec.HardwareEncryptionCaps & 3) === 3 && sec.PasscodePresent === true : null,
    appCount: d.apps_json ? JSON.parse(d.apps_json).length : null,
  }
  if (full) {
    out.info = info
    out.security = sec
    out.apps = d.apps_json ? JSON.parse(d.apps_json) : []
    out.appsAt = d.apps_at
    out.profiles = d.profiles_json ? JSON.parse(d.profiles_json) : null
    out.certificates = d.certs_json ? JSON.parse(d.certs_json) : null
  }
  return out
}

async function api(request, env, url, ctx) {
  const parts = url.pathname.split('/').filter(Boolean) // ['api', ...]
  const method = request.method
  const body = method === 'POST' ? await request.json().catch(() => ({})) : {}

  // Device management is for MDM_ADMINS only (David). Staff never see or
  // control phones, not even their own: they enrol from a link an admin sends.
  await requireAdmin(request, env)

  if (parts[1] === 'me' && method === 'GET') {
    const user = await requireStaff(request, env)
    const { results } = await env.DB.prepare("SELECT * FROM devices WHERE email = ? AND status != 'removed' ORDER BY enrolled_at DESC").bind(user.email).all()
    ctx.waitUntil(refreshStale(env, results))
    return json(request, env, { email: user.email, isAdmin: user.isAdmin, pushReady: pushReady(env), devices: results.map((d) => deviceView(d)) })
  }

  if (parts[1] === 'enroll' && method === 'POST') {
    const user = await requireStaff(request, env)
    const email = cleanEmail(body.email) || user.email
    if (email !== user.email && !user.isAdmin) fail(403, 'You can only enrol your own phone.')
    if (!/^[^@\s]+@dhwebsiteservices\.co\.uk$/.test(email)) fail(400, 'Use a DH Website Services email address.')
    const token = randomToken(24)
    const id = crypto.randomUUID()
    const name = String(body.name || (email === user.email ? user.name : '') || '').slice(0, 80) || null
    const expiresAt = now() + LINK_TTL_MS
    await env.DB.prepare('INSERT INTO enrollments (id, token_hash, email, name, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, await sha256(token), email, name, user.email, now(), expiresAt).run()
    await audit(env, user.email, 'enrolment.link-created', null, { for: email })
    return json(request, env, { url: `${env.PUBLIC_URL.replace(/\/$/, '')}/enroll/${token}`, expiresAt })
  }

  if (parts[1] === 'devices' && !parts[2] && method === 'GET') {
    await requireAdmin(request, env)
    const { results } = await env.DB.prepare("SELECT * FROM devices ORDER BY status = 'removed', COALESCE(last_seen, 0) DESC").all()
    ctx.waitUntil(refreshStale(env, results))
    return json(request, env, { pushReady: pushReady(env), devices: results.map((d) => deviceView(d)) })
  }

  if (parts[1] === 'devices' && parts[2]) {
    const user = await requireStaff(request, env)
    const udid = cleanUdid(decodeURIComponent(parts[2]))
    const device = await env.DB.prepare('SELECT * FROM devices WHERE udid = ?').bind(udid).first()
    if (!device) fail(404, 'No such device.')
    const isOwner = device.email === user.email
    if (!user.isAdmin && !isOwner) fail(403, 'That is not your phone.')

    if (!parts[3] && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT uuid, request_type, status, queued_by, queued_at, sent_at, done_at, error FROM commands WHERE udid = ? ORDER BY queued_at DESC LIMIT 30').bind(udid).all()
      return json(request, env, { device: deviceView(device, { full: true }), health: await healthCheck(device), commands: results, canAdmin: user.isAdmin, pushReady: pushReady(env) })
    }

    if (parts[3] === 'command' && method === 'POST') {
      if (device.status !== 'enrolled') fail(409, 'This phone is not enrolled.')
      const type = String(body.type || '')
      let queued
      if (type === 'refresh') {
        await queueRefresh(env, udid, user.email)
        queued = 'Refreshing details'
      } else if (type === 'screenlock') {
        // A plain lock: the screen goes off and needs the passcode, nothing on the Lock Screen.
        await queueCommand(env, udid, 'DeviceLock', {}, user.email)
        queued = 'Screen lock'
      } else if (type === 'lock') {
        const message = String(body.message || `This iPhone belongs to ${env.ORG_NAME || 'DH Website Services'}. If found, please call ${DEFAULT_LOCK_PHONE}.`).slice(0, 200)
        const phone = String(body.phone || DEFAULT_LOCK_PHONE).replace(/[^\d+ ]/g, '').slice(0, 20)
        await queueCommand(env, udid, 'DeviceLock', { Message: message, PhoneNumber: phone }, user.email)
        queued = 'Lock'
      } else if (type === 'restart' || type === 'shutdown') {
        if (!user.isAdmin) fail(403, 'Only device admins can do that.')
        // Apple only accepts these from supervised phones; anything else returns an error from the phone.
        if (device.supervised !== 1) fail(409, 'Apple only allows restart and shut down on supervised phones. This one is not supervised.')
        await queueCommand(env, udid, type === 'restart' ? 'RestartDevice' : 'ShutDownDevice', {}, user.email)
        queued = type === 'restart' ? 'Restart' : 'Shut down'
      } else {
        fail(400, 'Unknown command.')
      }
      await audit(env, user.email, `command.${type}`, udid, type === 'lock' ? { message: body.message || null } : null)
      const pushed = await wakeAndRecord(env, device)
      return json(request, env, { queued, pushed: pushed.ok, pushError: pushed.ok ? null : pushed.reason })
    }

    if (parts[3] === 'remove' && method === 'POST') {
      if (!user.isAdmin) fail(403, 'Only device admins can do that.')
      if (device.status === 'enrolled') {
        await queueCommand(env, udid, 'RemoveProfile', { Identifier: PROFILE_ID }, user.email)
        await wakeAndRecord(env, device)
      } else {
        await env.DB.prepare("UPDATE devices SET status = 'removed', removed_at = ? WHERE udid = ?").bind(now(), udid).run()
      }
      await audit(env, user.email, 'device.remove-requested', udid)
      return json(request, env, { ok: true })
    }
  }

  if (parts[1] === 'audit' && method === 'GET') {
    await requireAdmin(request, env)
    const { results } = await env.DB.prepare('SELECT at, actor, action, udid, detail FROM audit ORDER BY at DESC LIMIT 200').all()
    return json(request, env, { entries: results })
  }

  fail(404, 'Not found.')
}

// ── entry points ──────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname
    try {
      if (path.startsWith('/api/')) {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) })
        ctx.waitUntil(ensureTicker(env).catch(() => {}))
        return await api(request, env, url, ctx)
      }
      if (path === '/mdm/checkin' && request.method === 'PUT') {
        ctx.waitUntil(ensureTicker(env).catch(() => {}))
        return await checkin(request, env, url)
      }
      if (path === '/mdm/connect' && request.method === 'PUT') return await connect(request, env, url)
      const enroll = path.match(/^\/enroll\/([a-f0-9]{48})(\/profile)?\/?$/)
      if (enroll && request.method === 'GET') return await enrollRoute(request, env, enroll[1], !!enroll[2])
      if (path === '/') return html(messagePage(env, 'DH device management', 'Enrol your iPhone from the DH Staff Portal app.'))
      return new Response('Not found', { status: 404 })
    } catch (e) {
      const status = e.status || 500
      if (status >= 500) console.error(path, e.stack || e.message)
      if (path.startsWith('/api/')) return json(request, env, { error: status >= 500 ? 'Something went wrong.' : e.message }, status)
      return new Response(status >= 500 ? 'Server error' : e.message, { status })
    }
  },
}
