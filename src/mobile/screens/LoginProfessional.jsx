import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor } from '@capacitor/core'
import { isBiometricAvailable, biometricLogin } from '../../utils/biometricAuth'
import DHLogo from '../components/DHLogo'

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
      await StatusBar.setStyle({ style: Style.Light })
      await StatusBar.setBackgroundColor({ color: '#ffffff' })
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

      // Use redirect instead of popup for mobile
      await instance.loginRedirect({
        scopes: ['User.Read'],
      })

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
    <div className="professional-login">
      <div className="professional-login-container">
        {/* Logo */}
        <div className="professional-login-logo">
          <DHLogo width={240} />
        </div>

        <div className="professional-login-title">DH Website Services</div>
        <div className="professional-login-subtitle">Staff Portal</div>
        <div className="professional-login-subtitle-2">Sign in to continue</div>

        {/* Login Buttons */}
        <div className="professional-login-form">
          <button
            className="professional-btn professional-btn-primary"
            onClick={handleMicrosoftLogin}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="professional-spinner" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <svg className="professional-icon" viewBox="0 0 24 24" fill="none">
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
            <>
              <div className="professional-divider">
                <span>or</span>
              </div>

              <button
                className="professional-btn professional-btn-secondary"
                onClick={handleBiometricLogin}
                disabled={loading}
              >
                <svg className="professional-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {biometricType === 'faceId' ? (
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-6.5c0 .83-.67 1.5-1.5 1.5S7 14.33 7 13.5 7.67 12 8.5 12s1.5.67 1.5 1.5zm7 0c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5.67-1.5 1.5-1.5 1.5.67 1.5 1.5z"/>
                  ) : (
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                  )}
                </svg>
                <span>Use {biometricType === 'faceId' ? 'Face ID' : 'Touch ID'}</span>
              </button>
            </>
          )}

          {error && (
            <div className="professional-error">
              {error}
            </div>
          )}
        </div>

        <div className="professional-login-footer">
          <div>Secure staff access</div>
          <div style={{ marginTop: '8px', fontSize: '12px' }}>DH Website Services (David Hooper Home Limited)</div>
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #d2d2d7', fontSize: '12px', lineHeight: '1.6' }}>
            <strong>Tech Support:</strong><br/>
            david@dhwebsiteservices.co.uk<br/>
            07364166285 or 02920024218 (opt 5)
          </div>
        </div>
      </div>

      <style>{`
        .professional-login {
          min-height: 100vh;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
        }

        .professional-login-container {
          width: 100%;
          max-width: 380px;
        }

        .professional-login-logo {
          margin-bottom: 24px;
          display: flex;
          justify-content: center;
        }

        .professional-login-title {
          font-size: 22px;
          font-weight: 700;
          color: #1a1a1a;
          text-align: center;
          margin-bottom: 4px;
          letter-spacing: -0.3px;
        }

        .professional-login-subtitle {
          font-size: 18px;
          font-weight: 600;
          color: #666;
          text-align: center;
          margin-bottom: 8px;
        }

        .professional-login-subtitle-2 {
          font-size: 15px;
          color: #86868b;
          text-align: center;
          margin-bottom: 40px;
        }

        .professional-login-form {
          margin-bottom: 32px;
        }

        .professional-btn {
          width: 100%;
          height: 52px;
          border-radius: 12px;
          border: none;
          font-size: 16px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .professional-btn:active {
          transform: scale(0.98);
        }

        .professional-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .professional-btn-primary {
          background: #0066cc;
          color: white;
          box-shadow: 0 2px 8px rgba(0, 102, 204, 0.25);
          margin-bottom: 16px;
        }

        .professional-btn-primary:hover:not(:disabled) {
          background: #0052a3;
        }

        .professional-btn-secondary {
          background: #f5f5f7;
          color: #1a1a1a;
          border: 1px solid #d2d2d7;
        }

        .professional-btn-secondary:hover:not(:disabled) {
          background: #e8e8ed;
        }

        .professional-icon {
          width: 20px;
          height: 20px;
        }

        .professional-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .professional-divider {
          display: flex;
          align-items: center;
          text-align: center;
          margin: 20px 0;
          color: #86868b;
          font-size: 14px;
        }

        .professional-divider::before,
        .professional-divider::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid #d2d2d7;
        }

        .professional-divider span {
          padding: 0 16px;
        }

        .professional-error {
          margin-top: 16px;
          padding: 12px 16px;
          background: #fff5f5;
          border: 1px solid #feb2b2;
          border-radius: 8px;
          color: #c53030;
          font-size: 14px;
          text-align: center;
        }

        .professional-login-footer {
          text-align: center;
          font-size: 13px;
          color: #86868b;
        }

        /* Safe area support */
        @supports (padding: max(0px)) {
          .professional-login {
            padding-top: max(40px, env(safe-area-inset-top));
            padding-bottom: max(40px, env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </div>
  )
}
