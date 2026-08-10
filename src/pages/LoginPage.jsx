import { useMsal } from '@azure/msal-react'
import { loginRequest, prefersRedirectFlow } from '../authConfig'
import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'

// Only surfaced when something is actually wrong. A permanent green
// "Operational" strip just advertises how long ago the row was last touched.
const STATUS_META = {
  degraded: { label: 'Degraded', color: 'var(--amber)' },
  outage: { label: 'Service issue', color: 'var(--red)' },
  maintenance: { label: 'Maintenance', color: 'var(--accent)' },
}

export default function LoginPage() {
  const { instance } = useMsal()
  const [loading, setLoading] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('dh-theme') === 'dark')
  const [portalStatus, setPortalStatus] = useState(null)
  const useRedirect = prefersRedirectFlow()

  const login = async () => {
    setLoading(true)
    try {
      if (useRedirect) {
        await instance.loginRedirect(loginRequest)
        return
      }
      await instance.loginPopup(loginRequest)
    } catch (error) {
      if (!useRedirect) {
        // Desktop popup can still be blocked by an extension or setting.
        try {
          await instance.loginRedirect(loginRequest)
          return
        } catch {
          // Keep the login button available if both browser flows fail.
        }
      }
      console.error('Microsoft sign-in failed:', error)
      setLoading(false)
    }
  }

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('dh-theme', next)
    setDark(next === 'dark')
  }

  useEffect(() => {
    let mounted = true

    const loadPortalStatus = async () => {
      const { data } = await supabase
        .from('maintenance_systems')
        .select('name,status,note,updated_at')
        .eq('name', 'Staff Portal')
        .maybeSingle()

      if (!mounted || !data) return
      setPortalStatus(data)
    }

    loadPortalStatus()
    return () => {
      mounted = false
    }
  }, [])

  const statusMeta = STATUS_META[portalStatus?.status] || null

  return (
    <div className="login-shell">
      <aside className="login-brand">
        <div className="login-brand-top">
          <img src="/dh-logo-white.png" alt="DH Web Services" className="login-brand-logo" />
        </div>
        <div className="login-brand-mid">
          <h1 className="login-brand-heading">Staff portal</h1>
          <p className="login-brand-sub">HR, rotas, clients and recruitment.</p>
        </div>
        <div className="login-brand-foot">© {new Date().getFullYear()} DH Website Services</div>
      </aside>

      <main className="login-panel">
        <div className="login-panel-head">
          <button className="login-theme-btn" onClick={toggleTheme}>
            {dark ? 'Light mode' : 'Dark mode'}
          </button>
        </div>

        {statusMeta && (
          <div className="login-status">
            <span className="login-status-dot" style={{ background: statusMeta.color }} />
            <span className="login-status-label" style={{ color: statusMeta.color }}>{statusMeta.label}</span>
            <span className="login-status-note">
              {portalStatus.note || 'The portal may not behave as expected.'}
            </span>
          </div>
        )}

        <div className="login-panel-body">
          <div className="login-form">
            <h2 className="login-form-title">Sign in</h2>
            <p className="login-form-body">Use your DH Website Services Microsoft account.</p>

            <button className="login-primary-btn" onClick={login} disabled={loading}>
              {loading ? (
                <>
                  <span className="login-spinner" />
                  Signing in…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 21 21" fill="none" aria-hidden="true">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                  </svg>
                  Sign in with Microsoft
                </>
              )}
            </button>

            <p className="login-form-help">
              Trouble signing in? Contact David Hooper on{' '}
              <a href="mailto:mgmt@dhwebsiteservices.co.uk">mgmt@dhwebsiteservices.co.uk</a>{' '}
              or <a href="tel:02920024218">029 2002 4218</a>.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
