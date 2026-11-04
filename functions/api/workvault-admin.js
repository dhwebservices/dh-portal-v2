/**
 * WorkVault admin: accounts and usage for the WorkVault app.
 *
 * WorkVault keeps every entry on the user's phone, so this sees accounts and
 * usage counts only, never content. Phone numbers are masked: knowing someone
 * uses WorkVault is itself sensitive.
 *
 * Needs the "workvault_admin" permission and these Pages secrets:
 *   WORKVAULT_SUPABASE_URL, WORKVAULT_SERVICE_ROLE_KEY
 */
import { requirePortalUser } from './_portalAuth.js'

const PERMISSION = 'workvault_admin'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function wv(env, path, init = {}) {
  return fetch(`${env.WORKVAULT_SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: env.WORKVAULT_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.WORKVAULT_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
}

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits ? `••• ${digits.slice(-3)}` : ''
}

async function audit(env, user, action, targetId, details = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return
  await fetch(`${env.SUPABASE_URL}/rest/v1/audit_log`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify([{
      user_email: user.email,
      user_name: user.name || user.email,
      action,
      target: 'workvault_user',
      target_id: targetId,
      details,
      created_at: new Date().toISOString(),
    }]),
  }).catch(() => {})
}

async function overview(env) {
  const [summaryRes, usersRes] = await Promise.all([
    wv(env, '/rest/v1/admin_user_summary?select=*&order=created_at.desc&limit=1000'),
    wv(env, '/auth/v1/admin/users?page=1&per_page=1000'),
  ])
  if (!summaryRes.ok || !usersRes.ok) {
    return json({ error: 'Could not load WorkVault accounts.' }, 502)
  }
  const summary = await summaryRes.json()
  const authUsers = (await usersRes.json())?.users || []
  const byId = new Map(authUsers.map((u) => [u.id, u]))

  const users = summary.map((row) => {
    const authUser = byId.get(row.id) || {}
    return {
      id: row.id,
      createdAt: row.created_at,
      signInMethod: row.sign_in_method,
      phone: maskPhone(authUser.phone),
      lastSeenAt: row.last_seen_at,
      appVersion: row.app_version,
      status: row.status,
      analyses30d: Number(row.analyses_30d || 0),
      analysesTotal: Number(row.analyses_total || 0),
      tokensTotal: Number(row.tokens_total || 0),
    }
  })

  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const stats = {
    users: users.length,
    activeLast30Days: users.filter((u) => u.lastSeenAt && Date.parse(u.lastSeenAt) > monthAgo).length,
    analysesLast30Days: users.reduce((sum, u) => sum + u.analyses30d, 0),
    tokensTotal: users.reduce((sum, u) => sum + u.tokensTotal, 0),
    suspended: users.filter((u) => u.status === 'suspended').length,
  }
  return json({ ok: true, stats, users })
}

async function setStatus(env, user, id, status) {
  const patch = await wv(env, `/rest/v1/profiles?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status }),
  })
  // Also block sign-in at the auth layer while suspended.
  const ban = await wv(env, `/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ban_duration: status === 'suspended' ? '876000h' : 'none' }),
  })
  if (!patch.ok || !ban.ok) return json({ error: 'Could not update the account.' }, 502)
  await audit(env, user, status === 'suspended' ? 'workvault_suspend' : 'workvault_restore', id)
  return json({ ok: true })
}

async function deleteUser(env, user, id) {
  const res = await wv(env, `/auth/v1/admin/users/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) return json({ error: 'Could not delete the account.' }, 502)
  await audit(env, user, 'workvault_delete', id)
  return json({ ok: true })
}

export async function onRequestPost({ request, env }) {
  if (!env.WORKVAULT_SUPABASE_URL || !env.WORKVAULT_SERVICE_ROLE_KEY) {
    return json({ error: 'WorkVault admin is not configured yet.' }, 503)
  }

  let user
  try {
    user = await requirePortalUser(request, env, PERMISSION)
  } catch (error) {
    return json({ error: error.message }, error.status || 401)
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const id = payload?.userId
  if (payload?.action !== 'overview' && !UUID_RE.test(String(id || ''))) {
    return json({ error: 'That account ID is not valid.' }, 400)
  }

  try {
    switch (payload?.action) {
      case 'overview': return await overview(env)
      case 'suspend': return await setStatus(env, user, id, 'suspended')
      case 'restore': return await setStatus(env, user, id, 'active')
      case 'delete': return await deleteUser(env, user, id)
      default: return json({ error: `Unknown action "${payload?.action}".` }, 400)
    }
  } catch (error) {
    console.warn('workvault-admin failed:', error?.name)
    return json({ error: 'WorkVault admin request failed.' }, 500)
  }
}
