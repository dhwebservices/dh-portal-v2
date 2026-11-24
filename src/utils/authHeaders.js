import { msal } from '../msalInstance'
import { loginRequest } from '../authConfig'

/**
 * `{ Authorization: 'Bearer <id token>' }` for the signed-in user, so portal
 * API routes can verify who is calling. Silent only; returns {} if there is no
 * session, and the route then answers 401 ("Sign-in required.").
 */
export async function authHeaders() {
  try {
    const account = msal.getActiveAccount() || msal.getAllAccounts()[0]
    if (!account) return {}
    const result = await msal.acquireTokenSilent({ ...loginRequest, account })
    return result?.idToken ? { Authorization: `Bearer ${result.idToken}` } : {}
  } catch {
    return {}
  }
}
