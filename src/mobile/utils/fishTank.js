/**
 * One Fish Tank operator call, the same way the Fish Tank screen makes it:
 * the portal's proxy first (Entra-authenticated, key kept server-side), then
 * the game's Worker directly with the operator key stored on this device.
 *
 * Home used the proxy only, and the proxy answers 500 while
 * FISHTANK_OPERATOR_KEY isn't set on the Pages project, so Home showed a dash
 * while the Fish Tank screen, which falls back, showed real numbers.
 */
import { getPortalIdToken } from '../../utils/portalApi'
import { apiUrl } from '../../utils/apiBase'

const WORKER = 'https://fishtank.aged-silence-66a7.workers.dev/v1'
const KEY_STORAGE = 'fishtank.operatorKey'

export async function fishTankCall(instance, account, path) {
  if (account) {
    try {
      const token = await getPortalIdToken(instance, account)
      const res = await fetch(apiUrl(`/api/fishtank${path}`), { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) return res.json()
    } catch { /* fall through to the stored key */ }
  }
  let key = ''
  try { key = localStorage.getItem(KEY_STORAGE) || '' } catch { /* no storage */ }
  if (!key) throw new Error('no-key')
  const res = await fetch(`${WORKER}${path}`, { headers: { Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`fishtank ${res.status}`)
  return res.json()
}
