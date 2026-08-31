import { Capacitor } from '@capacitor/core'

/**
 * Where the portal's API actually lives.
 *
 * On the web the app is served from the same origin as its Cloudflare Pages
 * Functions, so a relative `/api/...` is correct.
 *
 * In the native app it is not. There is no `server.url` in
 * capacitor.config.json, so the bundle is served from `capacitor://localhost`
 * and `/api/...` resolves *inside the app bundle*, where no API exists.
 * Capacitor answers unknown paths with index.html — the SPA fallback — so the
 * request does not even fail: it returns 200 with a page of HTML. Callers that
 * do `await response.json().catch(() => ({}))` then read an empty object and
 * report a successful send to nobody.
 *
 * That is exactly what "Nobody received it" meant on the Send a message
 * screen while the recipient's phone was registered and permitted: the request
 * never left the device.
 */
const PORTAL_ORIGIN = 'https://staff.dhwebsiteservices.co.uk'

export function apiUrl(path) {
  const clean = String(path || '')
  if (/^https?:\/\//i.test(clean)) return clean
  const suffix = clean.startsWith('/') ? clean : `/${clean}`
  return Capacitor.isNativePlatform() ? `${PORTAL_ORIGIN}${suffix}` : suffix
}
