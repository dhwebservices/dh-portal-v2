// Native-only login session for the Capacitor app. Separate from MSAL's own
// cache because the native OAuth flow (system browser + PKCE, see
// mobileAuth.js) does not go through MSAL's redirect/popup clients, so
// nothing populates MSAL's cache on native builds. No native mobile screen
// currently calls acquireTokenSilent()/needs a Graph token, so this only
// needs to carry identity (name/email) for the rest of the app's
// Supabase-backed logic, which is exactly what AuthContext already reads
// off the MSAL account object on web (account.username / account.name).

const STORAGE_KEY = 'dh-native-session'
export const NATIVE_SESSION_EVENT = 'dh-native-session-changed'

function decodeIdTokenClaims(idToken) {
  const payload = idToken.split('.')[1]
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const json = decodeURIComponent(
    atob(padded)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  )
  return JSON.parse(json)
}

export function saveNativeSession(tokenResponse) {
  const claims = decodeIdTokenClaims(tokenResponse.id_token)
  const session = {
    username: (claims.preferred_username || claims.email || claims.upn || '').toLowerCase(),
    name: claims.name || claims.preferred_username || '',
    homeAccountId: claims.oid || claims.sub,
    // Deliberately NOT persisting id/access/refresh tokens. As the header note
    // says, no native screen needs a Graph token, and nothing reads these back
    // - AuthContext only uses username/name, App.jsx only checks existence.
    // Keeping them meant credentials sitting at rest for no benefit.
    expiresAt: Date.now() + (tokenResponse.expires_in || 3600) * 1000,
    savedAt: Date.now(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  window.dispatchEvent(new Event(NATIVE_SESSION_EVENT))
  return session
}

export function getNativeSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (_) {
    return null
  }
}

export function clearNativeSession() {
  localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event(NATIVE_SESSION_EVENT))
}
