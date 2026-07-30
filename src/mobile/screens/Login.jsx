import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor } from '@capacitor/core'
import { isBiometricAvailable, biometricLogin } from '../../utils/biometricAuth'

export default function MobileLogin() {
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
      await StatusBar.setStyle({ style: Style.Dark })
      await StatusBar.setBackgroundColor({ color: '#1a1612' })
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

      await instance.loginPopup({
        scopes: ['User.Read'],
      })

      // Login successful - handled by AuthenticatedTemplate in App.jsx
    } catch (error) {
      console.error('Login failed:', error)
      setError('Login failed. Please try again.')
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

      // Use credentials to auto-login (would need backend support)
      console.log('Biometric login successful')

      // For now, fall back to Microsoft login
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
    <div className="mobile-login">
      {/* Gradient Background */}
      <div className="mobile-login-gradient" />

      {/* Logo & Branding */}
      <div className="mobile-login-header">
        <div className="mobile-login-logo">
          <div className="mobile-login-logo-icon">DH</div>
        </div>
        <h1 className="mobile-login-title">DH Staff Portal</h1>
        <p className="mobile-login-subtitle">Welcome back</p>
      </div>

      {/* Login Form */}
      <div className="mobile-login-content">
        {/* Microsoft Login Button */}
        <button
          className="mobile-login-button mobile-login-microsoft"
          onClick={handleMicrosoftLogin}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="mobile-login-spinner" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <svg className="mobile-login-icon" viewBox="0 0 24 24" fill="none">
                <rect x="1" y="1" width="10" height="10" fill="#f25022"/>
                <rect x="13" y="1" width="10" height="10" fill="#7fba00"/>
                <rect x="1" y="13" width="10" height="10" fill="#00a4ef"/>
                <rect x="13" y="13" width="10" height="10" fill="#ffb900"/>
              </svg>
              <span>Sign in with Microsoft</span>
            </>
          )}
        </button>

        {/* Biometric Login (if available) */}
        {biometricAvailable && (
          <>
            <div className="mobile-login-divider">
              <span>or</span>
            </div>

            <button
              className="mobile-login-button mobile-login-biometric"
              onClick={handleBiometricLogin}
              disabled={loading}
            >
              <span className="mobile-login-biometric-icon">
                {biometricType === 'faceId' ? '👤' : '👆'}
              </span>
              <span>
                Sign in with {biometricType === 'faceId' ? 'Face ID' : 'Fingerprint'}
              </span>
            </button>
          </>
        )}

        {/* Error Message */}
        {error && (
          <div className="mobile-login-error">
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mobile-login-footer">
        <p>DH Website Services Ltd</p>
        <p>Secure staff access</p>
      </div>

      <style>{`
        .mobile-login {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          background: #1a1612;
        }

        .mobile-login-gradient {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 60vh;
          background: linear-gradient(135deg, #b8960c 0%, #d4af37 50%, #b8960c 100%);
          opacity: 0.1;
          filter: blur(60px);
          pointer-events: none;
        }

        .mobile-login-header {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px 40px;
          position: relative;
          z-index: 1;
        }

        .mobile-login-logo {
          margin-bottom: 24px;
          position: relative;
        }

        .mobile-login-logo-icon {
          width: 100px;
          height: 100px;
          border-radius: 24px;
          background: linear-gradient(135deg, #b8960c 0%, #d4af37 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 42px;
          font-weight: 800;
          color: white;
          box-shadow: 0 20px 40px rgba(184, 150, 12, 0.3);
          position: relative;
        }

        .mobile-login-logo-icon::after {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: 26px;
          padding: 4px;
          background: linear-gradient(135deg, #b8960c, #d4af37, #b8960c);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0.5;
        }

        .mobile-login-title {
          font-size: 32px;
          font-weight: 800;
          margin: 0 0 8px 0;
          color: white;
          text-align: center;
          letter-spacing: -0.5px;
        }

        .mobile-login-subtitle {
          font-size: 18px;
          color: rgba(255, 255, 255, 0.6);
          margin: 0;
          text-align: center;
        }

        .mobile-login-content {
          padding: 0 32px 40px;
          position: relative;
          z-index: 1;
        }

        .mobile-login-button {
          width: 100%;
          min-height: 56px;
          border-radius: 16px;
          border: none;
          font-size: 17px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .mobile-login-button:active {
          transform: scale(0.98);
        }

        .mobile-login-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .mobile-login-microsoft {
          background: white;
          color: #1a1612;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
          margin-bottom: 20px;
        }

        .mobile-login-microsoft::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, transparent 0%, rgba(184, 150, 12, 0.05) 100%);
          opacity: 0;
          transition: opacity 0.3s;
        }

        .mobile-login-microsoft:active::before {
          opacity: 1;
        }

        .mobile-login-biometric {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
        }

        .mobile-login-icon {
          width: 24px;
          height: 24px;
        }

        .mobile-login-biometric-icon {
          font-size: 24px;
        }

        .mobile-login-spinner {
          width: 20px;
          height: 20px;
          border: 3px solid rgba(26, 22, 18, 0.2);
          border-top-color: #1a1612;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .mobile-login-divider {
          display: flex;
          align-items: center;
          text-align: center;
          margin: 24px 0;
          color: rgba(255, 255, 255, 0.4);
        }

        .mobile-login-divider::before,
        .mobile-login-divider::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .mobile-login-divider span {
          padding: 0 16px;
          font-size: 14px;
          font-weight: 500;
        }

        .mobile-login-error {
          margin-top: 20px;
          padding: 16px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
          color: #f87171;
          font-size: 14px;
          text-align: center;
        }

        .mobile-login-footer {
          padding: 40px 20px;
          padding-bottom: calc(40px + env(safe-area-inset-bottom));
          text-align: center;
          position: relative;
          z-index: 1;
        }

        .mobile-login-footer p {
          margin: 4px 0;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.4);
        }

        .mobile-login-footer p:first-child {
          font-weight: 600;
          color: rgba(255, 255, 255, 0.6);
        }

        /* Safe area support */
        @supports (padding: max(0px)) {
          .mobile-login-header {
            padding-top: max(60px, env(safe-area-inset-top));
          }
        }
      `}</style>
    </div>
  )
}
