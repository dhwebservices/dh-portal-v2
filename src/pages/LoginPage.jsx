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
    <div className="login-shell" style={{ minHeight:'100vh', background:'linear-gradient(180deg, var(--page-tint) 0%, var(--bg) 26%, var(--bg) 100%)', display:'flex', flexDirection:'column' }}>
      <nav className="login-nav" style={{ height:64, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', background:'rgba(255,255,255,0.82)', backdropFilter:'blur(18px)', position:'sticky', top:0, zIndex:20 }}>
        <div className="login-nav-brand" style={{ display:'flex', alignItems:'center', gap:12 }}>
          <img src="/dh-logo.png" alt="DH Website Services" className="login-nav-logo" style={{ height:26, width:'auto', display:'block' }} />
          <div className="login-nav-copy">
            <div className="login-nav-title" style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:600, letterSpacing:'-0.03em', color:'var(--text)' }}>
              DH <span style={{ color:'var(--accent)' }}>Website Services</span>
            </div>
            <div className="login-nav-subtitle" style={{ fontSize:11, color:'var(--faint)', letterSpacing:'0.12em', textTransform:'uppercase', marginTop:2 }}>
              DH Workplace Staff Login Portal
            </div>
          </div>
        </div>
        <button className="login-theme-btn" onClick={toggleTheme} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:999, padding:'6px 12px', cursor:'pointer', fontSize:12, color:'var(--sub)', display:'flex', alignItems:'center', gap:6 }}>
          {dark ? 'Light mode' : 'Dark mode'}
        </button>
      </nav>

      <div className="login-page-grid" style={{ flex:1, display:'grid', gridTemplateColumns:'1.05fr 0.95fr', gap:28, alignItems:'stretch', padding:'32px 24px 24px' }}>
        <section className="login-brand-panel" style={{ border:'1px solid var(--border)', borderRadius:28, overflow:'hidden', background:'linear-gradient(135deg, var(--page-tint-strong) 0%, var(--panel-tint) 36%, var(--bg2) 100%)', position:'relative', minHeight:520 }}>
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(circle at top right, rgba(var(--accent-rgb),0.18), transparent 28%), radial-gradient(circle at bottom left, rgba(var(--accent-rgb),0.1), transparent 24%)' }} />
          <div className="login-brand-inner" style={{ position:'relative', padding:'clamp(28px,4vw,56px)', display:'flex', flexDirection:'column', justifyContent:'space-between', height:'100%' }}>
            <div>
              <div className="login-brand-badge" style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:999, border:'1px solid var(--accent-border)', background:'var(--accent-soft)', fontSize:12, color:'var(--accent)', fontWeight:600, marginBottom:22 }}>
                Staff access
              </div>
              <h1 className="login-brand-title" style={{ fontFamily:'var(--font-display)', fontSize:'clamp(34px,5vw,64px)', fontWeight:600, letterSpacing:'-0.04em', lineHeight:0.96, color:'var(--text)', marginBottom:18 }}>
                DH Workplace
                <br />
                Staff Login Portal
              </h1>
              <p className="login-brand-body" style={{ maxWidth:560, fontSize:16, lineHeight:1.7, color:'var(--sub)', marginBottom:28 }}>
                Access the DH Website Services internal workspace for outreach, HR, schedules, notifications, client operations, and staff tools from one secure Microsoft sign-in.
              </p>
              <div className="login-feature-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 }}>
                {[
                  ['Outreach workspace', 'Follow-ups, appointments, proposals, and conversions.'],
                  ['HR & staff tools', 'Onboarding, documents, leave, and permissions.'],
                  ['Recruiting workspace', 'Hiring pipeline, job posts, applicant review, and status updates.'],
                  ['Daily operations', 'Dashboard, notifications, schedules, and support.'],
                ].map(([title, body]) => (
                  <div key={title} className="login-feature-card" style={{ padding:'16px 16px 14px', border:'1px solid var(--border)', borderRadius:18, background:'rgba(255,255,255,0.6)' }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:6 }}>{title}</div>
                    <div style={{ fontSize:12.5, lineHeight:1.6, color:'var(--sub)' }}>{body}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="login-brand-tags" style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:28 }}>
              {['Microsoft-secured sign-in', 'Single staff identity', 'Internal workspace only'].map((item) => (
                <span key={item} style={{ padding:'8px 12px', borderRadius:999, background:'var(--card)', border:'1px solid var(--border)', fontSize:12, color:'var(--sub)' }}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="login-form-pane" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div className="login-form-card" style={{ width:'100%', maxWidth:480, padding:'32px clamp(22px,3vw,36px)', border:'1px solid var(--border)', borderRadius:28, background:'var(--card)', boxShadow:'0 22px 70px rgba(10,16,28,0.08)' }}>
            <div className="login-form-mark" style={{ width:84, height:84, borderRadius:24, background:'linear-gradient(180deg, var(--accent-soft), rgba(var(--accent-rgb),0.18))', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 24px' }}>
              <img src="/dh-logo-icon.png" alt="DH logo" style={{ width:50, height:50, objectFit:'contain' }} />
            </div>
            <div className="login-form-copy" style={{ textAlign:'center', marginBottom:26 }}>
              <div className="login-form-title" style={{ fontFamily:'var(--font-display)', fontSize:'clamp(28px,4vw,40px)', fontWeight:600, letterSpacing:'-0.03em', color:'var(--text)', marginBottom:10 }}>
                Sign in to continue
              </div>
              <div className="login-form-body" style={{ fontSize:15, color:'var(--sub)', lineHeight:1.7 }}>
                Use your DH Website Services Microsoft account to access the DH Workplace staff portal.
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
                borderRadius:18,
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
              <div className="login-note-card" style={{ padding:'14px 16px', borderRadius:16, background:'var(--bg2)', border:'1px solid var(--border)' }}>
                <div className="login-note-label" style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Access note</div>
                <div style={{ fontSize:13, color:'var(--sub)', lineHeight:1.6 }}>
                  Sign in with your `@dhwebsiteservices.co.uk` Microsoft account. Staff, recruiting, web-manager permissions, and onboarding access are handled automatically once you log in.
                </div>
              </div>
              <div className="login-form-meta" style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', fontSize:12, color:'var(--faint)' }}>
                <span>Secure internal workspace</span>
                <span>Staff access only</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="login-footer" style={{ padding:'18px 24px 24px', display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap', color:'var(--faint)', fontSize:12 }}>
        <span>© 2026 DH Website Services</span>
        <span>DH Workplace Staff Login Portal</span>
      </div>
    </div>
  )
}
