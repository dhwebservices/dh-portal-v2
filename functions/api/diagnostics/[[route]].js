/**
 * Remote diagnostics for staff iPhones.
 *
 * A person opts their own phone in from the app (Settings > Diagnostics).
 * After that an admin can ask that phone to run a check. The phone is woken
 * by a silent push, runs the checks natively in the background, and posts the
 * report back with the one-time key that came in the push. If the phone
 * doesn't answer (iOS delays or drops silent pushes, and never delivers them
 * to an app that was swiped away), the admin can nudge it: a normal
 * notification that opens the Diagnostics screen and runs the check there.
 *
 *   POST /api/diagnostics/consent  { token, consent }         the phone's owner
 *   POST /api/diagnostics/devices                             admin
 *   POST /api/diagnostics/request  { token }                  admin
 *   POST /api/diagnostics/nudge    { id }                     admin
 *   POST /api/diagnostics/status   { id }                     admin
 *   POST /api/diagnostics/history  { token }                  admin, or the phone's owner
 *   POST /api/diagnostics/report   { id, key, report }        the phone, with the one-time key
 *   POST /api/diagnostics/report   { token, report }          the phone's owner, signed in (a check they ran themselves)
 *
 * Admin means a director/owner, or anyone holding the device_diagnostics permission.
 */
import { requirePortalUser } from '../_portalAuth.js'
import { sendApnsNotification, sendApnsBackground } from '../_apns.js'

const PERMISSION = 'device_diagnostics'
const MAX_REPORT_BYTES = 64 * 1024
const REQUEST_TTL_MS = 15 * 60 * 1000

function cors(request) {
  return {
    'access-control-allow-origin': request.headers.get('Origin') ?? '*',
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '600',
  }
}

const reply = (request, body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(request) },
})

function db(env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  }
  return async (path, init = {}) => {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })
    const text = await res.text()
    if (!res.ok) throw new Error(`Database: ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : null
  }
}

const enc = encodeURIComponent
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e }
const cleanToken = (t) => {
  const s = String(t || '').trim()
  if (!/^[A-Fa-f0-9]{32,200}$/.test(s)) fail(400, 'That is not a device we know.')
  return s
}
const randomKey = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('')

/** A short, safe summary of a report for lists. */
function summarise(report) {
  if (!report || typeof report !== 'object') return null
  return {
    issues: Array.isArray(report.issues) ? report.issues.slice(0, 6) : [],
    battery: report.battery?.level ?? null,
    storageFreeGB: report.storage?.freeGB ?? null,
    thermal: report.thermal ?? null,
    restarts: report.restarts?.sinceLastReport ?? null,
    network: report.network?.type ?? null,
  }
}

function publicRow(row) {
  if (!row) return null
  const { upload_key, ...rest } = row
  const expired = row.status !== 'done' && Date.now() - new Date(row.requested_at).getTime() > REQUEST_TTL_MS
  return { ...rest, status: expired ? 'expired' : row.status }
}

async function deviceFor(rest, token) {
  const rows = await rest(`user_devices?fcm_token=eq.${enc(token)}&device_type=eq.ios&select=user_email,fcm_token,device_name,device_model,os_version,diagnostics_consent,diagnostics_consent_at&limit=1`)
  return Array.isArray(rows) ? rows[0] : null
}

export async function onRequest(context) {
  const { request, env, params } = context
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) })
  if (request.method !== 'POST') return reply(request, { error: 'Not found.' }, 404)
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return reply(request, { error: 'Diagnostics are not configured.' }, 500)

  const route = Array.isArray(params.route) ? params.route.join('/') : String(params.route || '')
  const raw = await request.text()
  if (raw.length > MAX_REPORT_BYTES + 4096) return reply(request, { error: 'That report is too large.' }, 413)
  let body = {}
  try { body = raw ? JSON.parse(raw) : {} } catch { return reply(request, { error: 'Bad request.' }, 400) }
  const rest = db(env)

  try {
    // ----- the phone posting a report -----
    if (route === 'report') {
      const report = body.report
      if (!report || typeof report !== 'object' || Array.isArray(report)) fail(400, 'The report could not be read.')
      const stamped = { ...report, receivedAt: new Date().toISOString() }

      if (body.id && body.key) {
        // Background run woken by our push: the one-time key is the proof.
        const rows = await rest(`device_diagnostics?id=eq.${enc(body.id)}&select=*&limit=1`)
        const row = rows?.[0]
        if (!row || !row.upload_key || row.upload_key !== String(body.key)) fail(403, 'This check has already been sent or was cancelled.')
        if (Date.now() - new Date(row.requested_at).getTime() > REQUEST_TTL_MS) fail(410, 'This request has expired. Ask for a new check.')
        const device = await deviceFor(rest, row.device_token)
        if (!device?.diagnostics_consent) fail(403, 'Diagnostics are switched off on this iPhone.')
        await rest(`device_diagnostics?id=eq.${enc(row.id)}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'done', completed_at: new Date().toISOString(), report: stamped, upload_key: null }),
        })
        return reply(request, { ok: true })
      }

      // A check the person ran themselves from the app.
      const user = await requirePortalUser(request, env)
      const token = cleanToken(body.token)
      const device = await deviceFor(rest, token)
      if (!device || device.user_email.toLowerCase() !== user.email) fail(403, 'That device is not signed in as you.')
      const created = await rest('device_diagnostics', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ device_token: token, user_email: device.user_email, device_name: device.device_name, trigger: 'manual', status: 'done', requested_by: user.email, completed_at: new Date().toISOString(), report: stamped }),
      })
      return reply(request, { ok: true, id: created?.[0]?.id })
    }

    // ----- the owner switching diagnostics on or off -----
    if (route === 'consent') {
      const user = await requirePortalUser(request, env)
      const token = cleanToken(body.token)
      const device = await deviceFor(rest, token)
      if (!device || device.user_email.toLowerCase() !== user.email) fail(403, 'This iPhone is not registered to you yet. Open the app with notifications allowed, then try again.')
      const on = body.consent === true
      await rest(`user_devices?fcm_token=eq.${enc(token)}&user_email=eq.${enc(device.user_email)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ diagnostics_consent: on, diagnostics_consent_at: on ? new Date().toISOString() : null }),
      })
      if (!on) {
        // Withdrawing consent cancels anything still waiting.
        await rest(`device_diagnostics?device_token=eq.${enc(token)}&status=in.(requested,nudged)`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'expired', upload_key: null }),
        })
      }
      return reply(request, { ok: true, consent: on })
    }

    // ----- history: admin, or the owner of that phone -----
    if (route === 'history') {
      const user = await requirePortalUser(request, env)
      const token = cleanToken(body.token)
      const device = await deviceFor(rest, token)
      const isOwner = device && device.user_email.toLowerCase() === user.email
      if (!isOwner) await requirePortalUser(request, env, PERMISSION)
      const rows = await rest(`device_diagnostics?device_token=eq.${enc(token)}&select=*&order=requested_at.desc&limit=20`)
      return reply(request, { device: device ? { ...device, fcm_token: undefined } : null, history: (rows || []).map(publicRow) })
    }

    // ----- everything below is admin only -----
    const admin = await requirePortalUser(request, env, PERMISSION)

    if (route === 'devices') {
      const devices = await rest('user_devices?device_type=eq.ios&select=user_email,fcm_token,device_name,device_model,os_version,diagnostics_consent,diagnostics_consent_at,created_at&order=user_email.asc')
      const tokens = (devices || []).map((d) => d.fcm_token).filter(Boolean)
      let latest = []
      if (tokens.length) {
        latest = await rest(`device_diagnostics?device_token=in.(${tokens.map(enc).join(',')})&select=id,device_token,status,trigger,requested_at,completed_at,report,upload_key&order=requested_at.desc&limit=200`)
      }
      const byToken = new Map()
      for (const row of latest || []) if (!byToken.has(row.device_token)) byToken.set(row.device_token, row)
      return reply(request, {
        devices: (devices || []).map((d) => {
          const last = publicRow(byToken.get(d.fcm_token))
          return { ...d, last: last ? { id: last.id, status: last.status, trigger: last.trigger, requested_at: last.requested_at, completed_at: last.completed_at, summary: summarise(last.report) } : null }
        }),
      })
    }

    if (route === 'request') {
      const token = cleanToken(body.token)
      const device = await deviceFor(rest, token)
      if (!device) fail(404, 'That iPhone is no longer registered.')
      if (!device.diagnostics_consent) fail(403, `${device.user_email} hasn't switched on diagnostics on this iPhone yet.`)
      const key = randomKey()
      const created = await rest('device_diagnostics', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ device_token: token, user_email: device.user_email, device_name: device.device_name, trigger: 'remote', status: 'requested', requested_by: admin.email, upload_key: key }),
      })
      const id = created?.[0]?.id
      const push = await sendApnsBackground(token, { diag: id, key, api: 'https://staff.dhwebsiteservices.co.uk/api/diagnostics/report' }, env)
      return reply(request, { ok: true, id, pushed: push.success, pushError: push.success ? undefined : push.error })
    }

    if (route === 'nudge') {
      const rows = await rest(`device_diagnostics?id=eq.${enc(body.id)}&select=*&limit=1`)
      const row = rows?.[0]
      if (!row) fail(404, 'That check no longer exists.')
      if (row.status === 'done') return reply(request, { ok: true, alreadyDone: true })
      if (!row.upload_key) fail(410, 'This check was cancelled.')
      const push = await sendApnsNotification(row.device_token, {
        title: 'Run a quick check?',
        body: `${admin.name || 'DH'} asked to run diagnostics on this iPhone. Tap to run it.`,
        data: { type: 'diagnostics', screen: 'diagnostics', diag: row.id, key: row.upload_key },
      }, env)
      await rest(`device_diagnostics?id=eq.${enc(row.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'nudged', nudged_at: new Date().toISOString() }),
      })
      return reply(request, { ok: true, pushed: push.success, pushError: push.success ? undefined : push.error })
    }

    if (route === 'status') {
      const rows = await rest(`device_diagnostics?id=eq.${enc(body.id)}&select=*&limit=1`)
      if (!rows?.[0]) fail(404, 'That check no longer exists.')
      return reply(request, { check: publicRow(rows[0]) })
    }

    fail(404, 'Not found.')
  } catch (error) {
    return reply(request, { error: error.message || 'Something went wrong.' }, error.status || 500)
  }
}
