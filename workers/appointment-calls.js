/**
 * Clock for the automated appointment call flow.
 *
 * All the logic lives in the portal's Pages Functions under /api/voice, because
 * the same code has to serve Twilio's webhooks. This worker exists only because
 * Pages Functions cannot have a cron trigger. It pokes the dispatcher every
 * five minutes and the dispatcher decides whether anything is due.
 *
 * Replaces an earlier staff-meeting reminder worker that was never deployed and
 * queried columns that never existed. That feature was abandoned; this worker
 * is a clean, independent replacement for the appointment call flow only.
 */

const DEFAULT_DISPATCH_URL = 'https://staff.dhwebsiteservices.co.uk/api/voice/dispatch'

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

async function dispatch(env) {
  const secret = String(env.APPOINTMENT_CALL_SECRET || '').trim()
  if (!secret) throw new Error('APPOINTMENT_CALL_SECRET is not configured.')

  const url = String(env.APPOINTMENT_CALL_URL || DEFAULT_DISPATCH_URL).trim()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-appointment-call-secret': secret,
      'Content-Type': 'application/json',
    },
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Dispatch failed (${response.status}): ${JSON.stringify(body)}`)
  }
  return body
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      dispatch(env).catch((error) => {
        console.error('Appointment call dispatch failed:', error?.message || error)
      }),
    )
  },

  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, worker: 'appointment-calls' })
    }

    if (request.method === 'POST' && url.pathname === '/run') {
      const expected = String(env.APPOINTMENT_CALL_SECRET || '').trim()
      if (!expected) return json({ error: 'Secret is not configured.' }, 503)
      if (request.headers.get('x-appointment-call-secret') !== expected) {
        return json({ error: 'Unauthorized.' }, 401)
      }
      try {
        return json({ ok: true, ...(await dispatch(env)) })
      } catch (error) {
        return json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500)
      }
    }

    return json({ error: 'Not found.' }, 404)
  },
}
