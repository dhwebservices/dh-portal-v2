import { Browser } from '@capacitor/browser'
import { App } from '@capacitor/app'
import { CapacitorHttp } from '@capacitor/core'

export const NATIVE_REDIRECT_URI = 'msauth.uk.co.dhwebsiteservices.staff://auth'

const CLIENT_ID = '79722400-3699-4f12-a4a1-df71949b5805'
const TENANT_ID = 'c8bd84c5-4ddb-4cb7-8276-0b7d30a42e5f'

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomVerifier() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes.buffer)
}

async function codeChallengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(digest)
}

/**
 * Runs the OAuth2 authorization-code + PKCE flow in the system browser
 * (not the app's embedded WebView, which Entra frequently blocks/degrades
 * for public clients). Returns { code, codeVerifier } for the caller to
 * complete via MSAL's instance.acquireTokenByCode(...) - this keeps MSAL's
 * own token cache authoritative so acquireTokenSilent() and everything else
 * in the app that depends on it (Graph calendar sync, etc.) keeps working.
 */
export async function loginWithMicrosoftMobile(scopes = ['openid', 'profile', 'email', 'User.Read']) {
  const codeVerifier = randomVerifier()
  const codeChallenge = await codeChallengeFor(codeVerifier)
  const state = randomVerifier()

  const authUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?` +
    `client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(NATIVE_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes.join(' '))}` +
    `&response_mode=query` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&code_challenge_method=S256` +
    `&state=${encodeURIComponent(state)}` +
    `&prompt=select_account`

  await Browser.open({ url: authUrl, presentationStyle: 'fullscreen' })

  return new Promise((resolve, reject) => {
    let settled = false

    const listener = App.addListener('appUrlOpen', async (event) => {
      if (!event.url || !event.url.startsWith(NATIVE_REDIRECT_URI)) return
      if (settled) return
      settled = true

      try { await Browser.close() } catch (_) {}

      const url = new URL(event.url)
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')

      listener.remove()
      clearTimeout(timeoutId)

      if (error) {
        reject(new Error(errorDescription || error))
      } else if (returnedState !== state) {
        reject(new Error('Login state mismatch - possible tampering, please try again.'))
      } else if (code) {
        resolve({ code, codeVerifier, redirectUri: NATIVE_REDIRECT_URI })
      } else {
        reject(new Error('No authorization code received from Microsoft.'))
      }
    })

    const timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      listener.remove()
      Browser.close().catch(() => {})
      reject(new Error('Login timed out. Please try again.'))
    }, 5 * 60 * 1000)
  })
}

/**
 * Exchanges the authorization code for tokens via a direct POST to Entra's
 * token endpoint. Deliberately bypasses MSAL's own acquireTokenByCode: that
 * method routes through HybridSpaAuthorizationCodeClient, which is built for
 * same-origin "hybrid SPA" handoff (its own source comments say "PKCE not
 * needed") and does not correctly carry a custom-scheme redirect_uri + PKCE
 * verifier through to the token request - confirmed on a real device via
 * AADSTS700009 ("reply address must be provided...").
 *
 * Also deliberately uses CapacitorHttp (native URLSession/OkHttp) instead of
 * fetch(): a plain fetch() call runs inside the WKWebView, which sends an
 * Origin: capacitor://localhost header, and Entra rejects that as a
 * cross-origin browser token redemption unless the redirect URI is
 * registered as a Single-Page Application - confirmed via AADSTS9002326.
 * Our redirect URI is (correctly) registered as native iOS/macOS, not SPA,
 * so the request needs to come from outside the WebView's origin entirely.
 */
export async function exchangeCodeForTokens({ code, codeVerifier, redirectUri, scopes }) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    scope: scopes.join(' '),
  })

  const response = await CapacitorHttp.post({
    url: `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: body.toString(),
  })

  const json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
  if (response.status < 200 || response.status >= 300) {
    throw new Error(json.error_description || json.error || 'Token exchange failed.')
  }

  return json // { access_token, id_token, refresh_token, expires_in, ... }
}
