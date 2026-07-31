import { Browser } from '@capacitor/browser'
import { App } from '@capacitor/app'

export async function loginWithMicrosoftMobile() {
  const clientId = '79722400-3699-4f12-a4a1-df71949b5805'
  const tenantId = 'c8bd84c5-4ddb-4cb7-8276-0b7d30a42e5f'
  const redirectUri = 'msauth.uk.co.dhwebsiteservices.staff://auth'
  const scopes = 'openid profile email User.Read'

  // Build Microsoft OAuth URL
  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
    `client_id=${clientId}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&response_mode=query`

  // Open in system browser
  await Browser.open({ url: authUrl })

  // Listen for app URL callback
  return new Promise((resolve, reject) => {
    const listener = App.addListener('appUrlOpen', async (event) => {
      await Browser.close()

      // Parse the callback URL
      const url = new URL(event.url)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      listener.remove()

      if (error) {
        reject(new Error(error))
      } else if (code) {
        // Exchange code for token (would need backend endpoint)
        resolve({ code })
      } else {
        reject(new Error('No code received'))
      }
    })

    // Timeout after 5 minutes
    setTimeout(() => {
      listener.remove()
      reject(new Error('Login timeout'))
    }, 5 * 60 * 1000)
  })
}
