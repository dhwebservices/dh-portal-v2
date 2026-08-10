/**
 * Calls to portal API routes that verify who you are.
 *
 * Most functions in functions/api/ gate on the Origin header alone, which does
 * not survive contact with curl. Routes that can change something public - the
 * website CMS to begin with - verify a real Entra token instead, so the caller
 * has to send one.
 *
 * Usage inside a component:
 *
 *   const { instance, accounts } = useMsal()
 *   await callPortalApi(instance, accounts[0], '/api/website-cms', {
 *     action: 'save_content', section, content,
 *   })
 */

import { loginRequest } from '../authConfig'

/**
 * Get an ID token for the signed-in account without prompting.
 * Silent only: this runs during a save, and a popup mid-save would be lost
 * behind the page on iOS and blocked by most desktop browsers.
 */
export async function getPortalIdToken(instance, account) {
  if (!instance || !account) throw new Error('You are not signed in.')

  const result = await instance.acquireTokenSilent({
    ...loginRequest,
    account,
  })

  const token = result?.idToken
  if (!token) throw new Error('Could not confirm your sign-in. Reload and try again.')
  return token
}

/**
 * POST JSON to a portal API route with proof of who is calling.
 * Throws with the server's message so callers can surface it directly.
 */
export async function callPortalApi(instance, account, path, body) {
  const token = await getPortalIdToken(instance, account)

  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body || {}),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error || `Request failed (${response.status}).`)
  }

  return payload
}
