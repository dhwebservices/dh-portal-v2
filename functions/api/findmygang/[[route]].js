/**
 * The FindMyGang operator API, proxied.
 *
 * Same shape as the Fish Tank proxy: the staff member proves who they are
 * with their Entra token, the operator key lives here as a Pages secret
 * (FINDMYGANG_ADMIN_KEY) and never reaches a browser or the app, and the
 * verified email travels on as `X-Operator`, which FindMyGang's admin_log
 * records against every change.
 *
 * Upstream is the `admin` Edge Function on FindMyGang's Supabase project. It
 * checks the key again, so this is a second lock rather than the only one.
 */
import { requirePortalUser } from '../_portalAuth.js'

const UPSTREAM = 'https://sarrvfzboorqzsfbuiws.supabase.co/functions/v1/admin'

function problem(message, status) {
  return new Response(JSON.stringify({ error: { code: 'proxy', message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function onRequest(context) {
  const { request, env, params } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': request.headers.get('Origin') ?? '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': 'authorization,content-type',
        'access-control-max-age': '600',
      },
    })
  }

  let user
  try {
    user = await requirePortalUser(request, env, 'admin')
  } catch (error) {
    return problem(error.message || 'Not allowed.', error.status || 401)
  }

  const key = env.FINDMYGANG_ADMIN_KEY
  if (!key) return problem('The FindMyGang admin key is not configured.', 500)

  const route = Array.isArray(params.route) ? params.route.join('/') : String(params.route || '')
  if (!/^[a-z0-9/-]*$/i.test(route)) return problem('Not a FindMyGang admin route.', 400)

  const target = new URL(`${UPSTREAM}/${route}`)
  new URL(request.url).searchParams.forEach((v, k) => target.searchParams.set(k, v))

  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${key}`,
      'X-Operator': user.email,
    },
    body: ['GET', 'HEAD', 'DELETE'].includes(request.method) ? undefined : await request.text(),
  })

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': request.headers.get('Origin') ?? '*',
      'cache-control': 'no-store',
    },
  })
}
