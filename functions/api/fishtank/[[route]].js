/**
 * The Fish Tank operator API, proxied.
 *
 * The admin screen used to call the game's Worker directly from the browser
 * with a shared operator key kept in `localStorage`. Two problems with that:
 * the key was sitting in a WebView that ships no CSP, and it says nothing
 * about *who* is using it — bans, deletions and grants were recorded against
 * nobody.
 *
 * This route fixes both. The staff member proves who they are with the Entra
 * token the portal already issues; the key lives here as a Pages secret and
 * never reaches a browser; and the verified email travels on to the Worker as
 * `X-Operator`, which is what the operator log records.
 *
 * The Worker still checks the key, so this is a second lock rather than a
 * replacement for the first.
 */
import { requirePortalUser } from '../_portalAuth.js'

const WORKER = 'https://fishtank.aged-silence-66a7.workers.dev/v1'

/** Only the operator surface is reachable through here. */
const ALLOWED_PREFIX = 'operator/'

function problem(message, status) {
  return new Response(JSON.stringify({ error: { code: 'proxy', message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function onRequest(context) {
  const { request, env, params } = context

  // Preflight never carries the Authorization header, so it cannot be
  // authenticated and must not try to be.
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

  const key = env.FISHTANK_OPERATOR_KEY
  if (!key) return problem('The Fish Tank operator key is not configured.', 500)

  const route = Array.isArray(params.route) ? params.route.join('/') : String(params.route || '')
  if (!route.startsWith(ALLOWED_PREFIX)) {
    return problem('Only the operator API is reachable here.', 403)
  }

  const target = new URL(`${WORKER}/${route}`)
  new URL(request.url).searchParams.forEach((v, k) => target.searchParams.set(k, v))

  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${key}`,
      // Who to blame, in the Worker's operator_log.
      'X-Operator': user.email,
    },
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
  })

  const body = await upstream.text()
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': request.headers.get('Origin') ?? '*',
      'cache-control': 'no-store',
    },
  })
}
