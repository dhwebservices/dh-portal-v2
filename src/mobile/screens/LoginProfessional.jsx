import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor } from '@capacitor/core'
import { isBiometricAvailable, biometricLogin } from '../../utils/biometricAuth'
import { loginWithMicrosoftMobile, exchangeCodeForTokens } from '../../utils/mobileAuth'
import { saveNativeSession } from '../../utils/nativeSession'
import { saveNativeTokens, NATIVE_SCOPES } from '../../utils/staffToken'
import { loginRequest } from '../../authConfig'

export default function MobileLoginProfessional() {
  const { instance } = useMsal()
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricType, setBiometricType] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    configureStatusBar()
    checkBiometric()
  }, [])

  const configureStatusBar = async () => {
    if (!Capacitor.isNativePlatform()) return

    try {
      // Light text on the blue sign-in screen.
      await StatusBar.setStyle({ style: Style.Dark })
      await StatusBar.setBackgroundColor({ color: '#0b5fd0' })
    } catch (error) {
      console.log('Status bar config failed:', error)
    }
  }

  const checkBiometric = async () => {
    const result = await isBiometricAvailable()
    if (result.available) {
      setBiometricAvailable(true)
      setBiometricType(result.biometryType)
    }
  }

  const handleMicrosoftLogin = async () => {
    setLoading(true)
    setError('')

    try {
      await Haptics.impact({ style: ImpactStyle.Medium })

      if (Capacitor.isNativePlatform()) {
        // Native: run the OAuth code+PKCE flow in the system browser (Entra
        // blocks/degrades embedded WebView redirects), then exchange the
        // code directly against Entra's token endpoint ourselves - MSAL's
        // own acquireTokenByCode doesn't correctly carry a custom-scheme
        // redirect_uri + PKCE verifier through (see mobileAuth.js).
        const { code, codeVerifier, redirectUri } = await loginWithMicrosoftMobile(NATIVE_SCOPES)
        const tokenResponse = await exchangeCodeForTokens({
          code,
          codeVerifier,
          redirectUri,
          scopes: NATIVE_SCOPES,
        })
        saveNativeSession(tokenResponse)
        // Kept so the phone system can check who you are without a key.
        saveNativeTokens(tokenResponse)
      } else {
        await instance.loginRedirect({ scopes: loginRequest.scopes })
      }
    } catch (error) {
      console.error('Login failed:', error)
      setError(error?.message || 'Login failed. Please try again.')
      await Haptics.impact({ style: ImpactStyle.Heavy })
    } finally {
      setLoading(false)
    }
  }

  const handleBiometricLogin = async () => {
    setLoading(true)
    setError('')

    try {
      await Haptics.impact({ style: ImpactStyle.Light })
      const credentials = await biometricLogin()
      await handleMicrosoftLogin()
    } catch (error) {
      console.error('Biometric login failed:', error)
      setError(error.message || 'Biometric login failed')
      await Haptics.impact({ style: ImpactStyle.Heavy })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="si">
      <div className="si-top">
        <span className="si-mark">DH</span>
        <div className="si-words">
          <h1>Staff Portal</h1>
          <p>Apps, leads, clients and the phone line, in one place.</p>
        </div>
      </div>

      <div className="si-bottom">
        <button className="si-btn ms" onClick={handleMicrosoftLogin} disabled={loading}>
          {loading ? (
            <span>Signing in…</span>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="1" y="1" width="10" height="10" fill="#f25022"/>
                <rect x="13" y="1" width="10" height="10" fill="#7fba00"/>
                <rect x="1" y="13" width="10" height="10" fill="#00a4ef"/>
                <rect x="13" y="13" width="10" height="10" fill="#ffb900"/>
              </svg>
              <span>Sign in with Microsoft</span>
            </>
          )}
        </button>

        {biometricAvailable && (
          <button className="si-btn ghost" onClick={handleBiometricLogin} disabled={loading}>
            Use {biometricType === 'faceId' ? 'Face ID' : 'Touch ID'}
          </button>
        )}

        {error && <div className="si-error">{error}</div>}

        <p className="si-foot">
          Tech support: 01443 805303 · david@dhwebsiteservices.co.uk<br />
          DH Website Services (David Hooper Home Limited)
        </p>
      </div>

      <style>{`
        .si { min-height: 100vh; box-sizing: border-box; background: #0b5fd0; color: #fff; display: flex; flex-direction: column; justify-content: space-between;
          padding: calc(env(safe-area-inset-top) + 96px) 24px calc(env(safe-area-inset-bottom) + 32px); font-family: 'IBM Plex Sans', system-ui, sans-serif; }
        .si-top { display: flex; flex-direction: column; gap: 20px; }
        .si-mark { width: 72px; height: 72px; border-radius: 22px; background: #fff; color: #0b5fd0; display: flex; align-items: center; justify-content: center;
          font-family: Archivo, system-ui, sans-serif; font-weight: 800; font-size: 26px; }
        .si-words { display: flex; flex-direction: column; gap: 8px; }
        .si-words h1 { margin: 0; font-family: Archivo, system-ui, sans-serif; font-weight: 800; font-size: 40px; letter-spacing: -0.02em; color: #fff; }
        .si-words p { margin: 0; font-size: 17px; line-height: 1.45; color: #d6e6ff; }
        .si-bottom { display: flex; flex-direction: column; gap: 12px; }
        .si-btn { height: 54px; width: 100%; border-radius: 14px; border: 0; font: inherit; font-size: 16px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; }
        .si-btn.ms { background: #fff; color: #0e1726; }
        .si-btn.ghost { background: transparent; color: #fff; border: 1px solid rgba(255, 255, 255, .4); }
        .si-btn:disabled { opacity: .7; }
        .si-error { background: rgba(255, 255, 255, .14); border-radius: 12px; padding: 12px 14px; font-size: 14px; line-height: 1.45; }
        .si-foot { margin: 12px 0 0; font-size: 13px; line-height: 1.5; color: #d6e6ff; text-align: center; }
      `}</style>
    </div>
  )
}
