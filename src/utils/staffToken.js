/**
 * Proof of who you are, for DH services outside the portal (the phone system).
 *
 * They check a Microsoft ID token, the same one the portal's own API checks,
 * so access follows your work account: no shared keys to type in or lose.
 *
 * On the web MSAL already holds the token. The native app signs in through
 * the system browser instead (mobileAuth.js), so it keeps its own copy here:
 * the ID token, which lasts about an hour, and a refresh token to get the
 * next one without asking again. Both live in this app's own storage and are
 * wiped on sign-out (clearNativeSession).
 */
import { Capacitor } from '@capacitor/core'
import { loginWithMicrosoftMobile, exchangeCodeForTokens, refreshTokens } from './mobileAuth'
import { getPortalIdToken } from './portalApi'
import { loginRequest } from '../authConfig'

export const NATIVE_TOKENS_KEY = 'dh-native-tokens'
// offline_access is what makes Entra hand over a refresh token.
export const NATIVE_SCOPES = [...new Set([...loginRequest.scopes, 'offline_access'])]

const EARLY_MS = 2 * 60 * 1000

function expiryOf(idToken) {
  try {
    const b64 = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))).exp * 1000
  } catch {
    return 0
  }
}

/** Keeps what a token response from Entra gives us. */
export function saveNativeTokens(tokenResponse) {
  if (!tokenResponse?.id_token) return
  const previous = readNativeTokens()
  localStorage.setItem(NATIVE_TOKENS_KEY, JSON.stringify({
    idToken: tokenResponse.id_token,
    expiresAt: expiryOf(tokenResponse.id_token),
    // Entra does not always rotate it; keep the old one if none came back.
    refreshToken: tokenResponse.refresh_token || previous?.refreshToken || '',
  }))
}

function readNativeTokens() {
  try {
    return JSON.parse(localStorage.getItem(NATIVE_TOKENS_KEY) || 'null')
  } catch {
    return null
  }
}

export function clearNativeTokens() {
  localStorage.removeItem(NATIVE_TOKENS_KEY)
}

export class SignInNeeded extends Error {}

/**
 * A current Microsoft ID token for the signed-in member of staff.
 *
 * `interactive` allows opening the Microsoft sign-in page if there is no way
 * to get one silently; only pass it from a button the person tapped.
 */
export async function getStaffIdToken({ instance, account, interactive = false } = {}) {
  if (!Capacitor.isNativePlatform()) {
    if (!account) throw new SignInNeeded('You are not signed in.')
    return getPortalIdToken(instance, account)
  }

  const stored = readNativeTokens()
  if (stored?.idToken && stored.expiresAt - EARLY_MS > Date.now()) return stored.idToken

  if (stored?.refreshToken) {
    try {
      const fresh = await refreshTokens({ refreshToken: stored.refreshToken, scopes: NATIVE_SCOPES })
      saveNativeTokens(fresh)
      return fresh.id_token
    } catch {
      // Revoked or expired (Entra's last 90 days unused). Fall through.
      clearNativeTokens()
    }
  }

  if (!interactive) throw new SignInNeeded('Confirm your Microsoft sign-in to continue.')

  const { code, codeVerifier, redirectUri } = await loginWithMicrosoftMobile(NATIVE_SCOPES)
  const tokens = await exchangeCodeForTokens({ code, codeVerifier, redirectUri, scopes: NATIVE_SCOPES })
  saveNativeTokens(tokens)
  return tokens.id_token
}
