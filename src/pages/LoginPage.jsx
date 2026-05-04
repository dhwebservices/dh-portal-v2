import { useMsal } from '@azure/msal-react'
import { loginRequest } from '../authConfig'
import { useState } from 'react'

export default function LoginPage() {
  const { instance } = useMsal()
  const [loading, setLoading] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('dh-theme') === 'dark')

  const login = async () => {
    setLoading(true)
    try {
      await instance.loginPopup(loginRequest)
    } catch {
      setLoading(false)
    }
  }

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('dh-theme', next)
    setDark(!dark)
  }

  return (
    <div className="login-shell" style={{ minHeight:'100vh', background:'linear-gradient(180deg, var(--page-tint) 0%, var(--bg) 22%, var(--bg) 100%)', display:'flex', flexDirection:'column' }}>
      <nav className="login-nav" style={{ height:72, borderBottom:'1px solid rgba(var(--accent-rgb),0.08)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', background:'color-mix(in srgb, var(--bg) 84%, transparent)', backdropFilter:'blur(18px)', position:'sticky', top:0, zIndex:20 }}>
        <div className="login-nav-brand" style={{ display:'flex', alignItems:'center', gap:12 }}>
          <img src="/dh-logo.png" alt="DH Website Services" className="login-nav-logo" style={{ height:26, width:'auto', display:'block' }} />
          <div className="login-nav-copy">
            <div className="login-nav-title" style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:600, letterSpacing:'-0.03em', color:'var(--text)' }}>
              DH <span style={{ color:'var(--accent)' }}>Website Services</span>
            </div>
            <div className="login-nav-subtitle" style={{ fontSize:12, color:'var(--faint)', marginTop:3 }}>
              Staff portal
            </div>
          </div>
        </div>
        <button className="login-theme-btn" onClick={toggleTheme} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:999, padding:'6px 12px', cursor:'pointer', fontSize:12, color:'var(--sub)', display:'flex', alignItems:'center', gap:6 }}>
          {dark ? 'Light mode' : 'Dark mode'}
        </button>
      </nav>

      <div className="login-page-grid" style={{ flex:1, display:'grid', gridTemplateColumns:'1.08fr 0.92fr', gap:36, alignItems:'center', padding:'36px 24px 28px' }}>
        <section className="login-brand-panel" style={{ position:'relative', minHeight:520 }}>
          <div style={{ position:'absolute', inset:'7% 18% auto 0', height:220, borderRadius:28, background:'radial-gradient(circle at center, rgba(var(--accent-rgb),0.16), rgba(var(--accent-rgb),0.03) 58%, transparent 72%)', filter:'blur(4px)' }} />
          <div className="login-brand-inner" style={{ position:'relative', padding:'clamp(20px,3vw,40px) clamp(8px,1vw,12px) clamp(24px,3vw,32px) 0', display:'flex', flexDirection:'column', justifyContent:'space-between', height:'100%' }}>
            <div>
              <div className="login-brand-badge" style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'7px 12px', borderRadius:999, background:'rgba(var(--accent-rgb),0.08)', fontSize:12, color:'var(--accent)', fontWeight:600, marginBottom:22 }}>
                Microsoft-secured access
              </div>
              <h1 className="login-brand-title" style={{ fontFamily:'var(--font-display)', fontSize:'clamp(34px,5vw,62px)', fontWeight:600, letterSpacing:'-0.05em', lineHeight:0.96, color:'var(--text)', marginBottom:18, maxWidth:620 }}>
                Staff tools,
                <br />
                one calm entry point
              </h1>
              <p className="login-brand-body" style={{ maxWidth:560, fontSize:16, lineHeight:1.7, color:'var(--sub)', marginBottom:28 }}>
                Sign in once with your DH Website Services Microsoft account to open HR, schedules, outreach, recruiting, documents, and day-to-day operations.
              </p>
              <div className="login-feature-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:14 }}>
                {[
                  ['Outreach and follow-up', 'Appointments, lead handling, proposals, and client conversations.'],
                  ['People operations', 'Onboarding, leave, documents, permissions, and HR records.'],
                  ['Hiring and interviews', 'Job posts, applicants, interview scheduling, and review.'],
                ].map(([title, body]) => (
                  <div key={title} className="login-feature-card" style={{ padding:'0 0 14px', borderBottom:'1px solid rgba(var(--accent-rgb),0.12)' }}>
                    <div style={{ fontSize:15, fontWeight:600, color:'var(--text)', marginBottom:6 }}>{title}</div>
                    <div style={{ fontSize:13, lineHeight:1.65, color:'var(--sub)' }}>{body}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="login-brand-tags" style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:12, marginTop:32, maxWidth:620 }}>
              {[
                ['One identity', 'Access is linked to your Microsoft staff account.'],
                ['Role aware', 'Permissions and onboarding state load automatically after sign-in.'],
                ['Internal only', 'This portal is reserved for current DH Website Services staff.'],
              ].map(([title, body]) => (
                <div key={title} style={{ paddingTop:10, borderTop:'1px solid rgba(var(--accent-rgb),0.12)' }}>
                  <div style={{ fontSize:12, color:'var(--faint)', marginBottom:6 }}>{title}</div>
                  <div style={{ fontSize:13, color:'var(--sub)', lineHeight:1.55 }}>{body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="login-form-pane" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div className="login-form-card" style={{ width:'100%', maxWidth:460, padding:'34px clamp(24px,3vw,38px)', border:'1px solid rgba(var(--accent-rgb),0.12)', borderRadius:20, background:'color-mix(in srgb, var(--card) 94%, var(--page-tint))', boxShadow:'0 8px 26px rgba(10,16,28,0.05)' }}>
            <div className="login-form-mark" style={{ width:76, height:76, borderRadius:20, background:'linear-gradient(180deg, rgba(var(--accent-rgb),0.12), rgba(var(--accent-rgb),0.04))', border:'1px solid rgba(var(--accent-rgb),0.16)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 24px' }}>
              <img src="/dh-logo-icon.png" alt="DH logo" style={{ width:50, height:50, objectFit:'contain' }} />
            </div>
            <div className="login-form-copy" style={{ textAlign:'center', marginBottom:26 }}>
              <div className="login-form-title" style={{ fontFamily:'var(--font-display)', fontSize:'clamp(28px,4vw,40px)', fontWeight:600, letterSpacing:'-0.03em', color:'var(--text)', marginBottom:10 }}>
                Sign in to continue
              </div>
              <div className="login-form-body" style={{ fontSize:15, color:'var(--sub)', lineHeight:1.7 }}>
                Use your DH Website Services Microsoft account to open the internal staff portal.
              </div>
            </div>

            <button
              className="login-primary-btn"
              onClick={login}
              disabled={loading}
              style={{
                width:'100%',
                padding:'15px 22px',
                background: loading ? 'var(--bg3)' : 'var(--accent)',
                color: loading ? 'var(--sub)' : '#fff',
                border:'none',
                borderRadius:14,
                fontSize:15,
                fontWeight:600,
                cursor: loading ? 'not-allowed' : 'pointer',
                display:'flex',
                alignItems:'center',
                justifyContent:'center',
                gap:10,
                transition:'all 0.2s',
              }}
            >
              {loading ? (
                <>
                  <div style={{ width:16, height:16, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
                  Signing in...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 21 21" fill="none" aria-hidden="true">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                  </svg>
                  Sign in with Microsoft
                </>
              )}
            </button>

            <div className="login-form-notes" style={{ display:'grid', gap:12, marginTop:20 }}>
              <div className="login-note-card" style={{ padding:'14px 16px', borderRadius:14, background:'var(--bg2)', border:'1px solid rgba(var(--accent-rgb),0.08)' }}>
                <div className="login-note-label" style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)', marginBottom:6 }}>Access note</div>
                <div style={{ fontSize:13, color:'var(--sub)', lineHeight:1.6 }}>
                  Sign in with your `@dhwebsiteservices.co.uk` Microsoft account. Staff, recruiting, web-manager permissions, and onboarding access are handled automatically once you log in.
                </div>
              </div>
              <div className="login-form-meta" style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', fontSize:12, color:'var(--faint)' }}>
                <span>Microsoft SSO</span>
                <span>Internal staff access</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="login-footer" style={{ padding:'18px 24px 24px', display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap', color:'var(--faint)', fontSize:12 }}>
        <span>© 2026 DH Website Services</span>
        <span>Staff portal</span>
      </div>
    </div>
  )
}
