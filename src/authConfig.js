export const msalConfig = {
  auth: {
    clientId: '79722400-3699-4f12-a4a1-df71949b5805',
    authority: 'https://login.microsoftonline.com/c8bd84c5-4ddb-4cb7-8276-0b7d30a42e5f',
    redirectUri: typeof window !== 'undefined'
      ? (window.location.origin.includes('capacitor://') || window.location.origin.includes('ionic://'))
        ? 'http://localhost'
        : window.location.origin
      : 'https://staff.dhwebsiteservices.co.uk',
  },
  // storeAuthStateInCookie is required for Safari/iOS: intelligent tracking
  // prevention can drop web storage across the auth redirect, which loses the
  // state MSAL needs to complete sign-in when it comes back.
  cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: true },
}

/**
 * Should this browser use the full-page redirect flow instead of a popup?
 *
 * loginPopup() opens about:blank and then navigates it to Microsoft. iOS
 * Safari refuses that navigation, so the user is dumped on a blank tab and
 * sign-in silently never happens - and because nothing throws, a try/catch
 * fallback to redirect never runs. Mobile browsers get the redirect flow.
 */
export function prefersRedirectFlow() {
  if (typeof navigator === 'undefined') return false

  const ua = navigator.userAgent || ''
  if (ua.includes('DHStaffPortalDesktop')) return true
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true

  // iPadOS 13+ reports itself as desktop Safari; touch points give it away.
  if (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1) return true

  return false
}

export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
}

export const microsoftCalendarReadRequest = {
  scopes: ['Calendars.Read'],
}
