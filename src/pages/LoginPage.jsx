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
    <div className="login-shell" style={{ minHeight:'100vh', background:'#fff', display:'flex', flexDirection:'column' }}>
      <nav className="login-nav" style={{ height:76, borderBottom:'1px solid rgba(15,23,42,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 32px', background:'#fff', position:'sticky', top:0, zIndex:20 }}>
        <div className="login-nav-brand" style={{ display:'flex', alignItems:'center', gap:12 }}>
          <img src="/dh-logo.png" alt="DH Website Services" className="login-nav-logo" style={{ height:26, width:'auto', display:'block' }} />
          <div className="login-nav-copy">
            <div className="login-nav-title" style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:600, letterSpacing:'-0.03em', color:'var(--text)' }}>
              DH <span style={{ color:'var(--accent)' }}>Website Services</span>
            </div>
            <div className="login-nav-subtitle" style={{ fontSize:12, color:'var(--faint)', marginTop:3 }}>
              Internal access
            </div>
          </div>
        </div>
        <button className="login-theme-btn" onClick={toggleTheme} style={{ background:'#fff', border:'1px solid rgba(15,23,42,0.08)', borderRadius:999, padding:'7px 14px', cursor:'pointer', fontSize:12, color:'var(--sub)', display:'flex', alignItems:'center', gap:6 }}>
          {dark ? 'Light mode' : 'Dark mode'}
        </button>
      </nav>

      <div style={{
        flex: 1,
        backgroundColor: '#fff',
        backgroundImage: 'radial-gradient(rgba(24,34,48,0.08) 0.85px, transparent 0.85px)',
        backgroundSize: '22px 22px',
      }}>
        <div className="login-page-grid" style={{ display:'grid', gridTemplateColumns:'minmax(0,1.15fr) minmax(420px,0.85fr)', gap:64, alignItems:'center', padding:'64px 32px 36px', maxWidth:1480, width:'100%', margin:'0 auto' }}>
        <section className="login-brand-panel" style={{ position:'relative', minHeight:560, display:'flex', alignItems:'center' }}>
          <div style={{ position:'absolute', inset:'auto auto 10% 6%', width:260, height:260, borderRadius:'50%', background:'radial-gradient(circle, rgba(var(--accent-rgb),0.10), rgba(var(--accent-rgb),0.015) 64%, transparent 76%)', filter:'blur(18px)' }} />
          <div className="login-brand-inner" style={{ position:'relative', padding:'0 20px 0 0', display:'flex', flexDirection:'column', justifyContent:'center', gap:40, width:'100%' }}>
            <div>
              <div className="login-brand-badge" style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'9px 16px', borderRadius:999, background:'#fff', border:'1px solid rgba(15,23,42,0.08)', fontSize:13, color:'#475467', fontWeight:500, marginBottom:30, boxShadow:'0 4px 12px rgba(15,23,42,0.04)' }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:'#34C759', display:'inline-block' }} />
                Microsoft-secured internal access
              </div>
              <h1 className="login-brand-title" style={{ fontFamily:'var(--font-display)', fontSize:'clamp(48px,6vw,88px)', fontWeight:600, letterSpacing:'-0.07em', lineHeight:0.93, color:'#111827', marginBottom:22, maxWidth:900 }}>
                Your portal,
                <br />
                <span style={{ color:'var(--accent)' }}>ready before your</span>
                <br />
                <span style={{ color:'var(--accent)' }}>next shift.</span>
              </h1>
              <p className="login-brand-body" style={{ maxWidth:660, fontSize:18, lineHeight:1.72, color:'#667085', marginBottom:34 }}>
                Staff access for HR, outreach, schedules, hiring, documents, and daily operations. Faster to reach, easier to understand, and tied directly to your work account.
              </p>
              <div className="login-feature-grid" style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:34 }}>
                {['HR and documents', 'Client follow-up', 'Recruitment and interviews'].map((label) => (
                  <div key={label} style={{ padding:'12px 18px', borderRadius:999, background:'#fff', border:'1px solid rgba(15,23,42,0.08)', color:'#344054', fontSize:14, boxShadow:'0 4px 10px rgba(15,23,42,0.03)' }}>
                    {label}
                  </div>
                ))}
              </div>
              <div className="login-feature-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:28, maxWidth:920 }}>
                {[
                  ['People operations', 'Onboarding, leave, documents, and staff records in one place.'],
                  ['Commercial workflow', 'Outreach, appointments, proposals, and client activity tracking.'],
                  ['Hiring pipeline', 'Roles, applicants, interview scheduling, and review.'],
                ].map(([title, body]) => (
                  <div key={title} className="login-feature-card" style={{ padding:'0 8px 0 0' }}>
                    <div style={{ width:48, height:2, background:'rgba(var(--accent-rgb),0.28)', marginBottom:16 }} />
                    <div style={{ fontSize:15, fontWeight:600, color:'#182230', marginBottom:8 }}>{title}</div>
                    <div style={{ fontSize:13.5, lineHeight:1.72, color:'#667085' }}>{body}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="login-brand-tags" style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:24, maxWidth:820, paddingTop:8 }}>
              {[
                ['One identity', 'Microsoft work account'],
                ['Role aware', 'Permissions load automatically'],
                ['Internal only', 'Reserved for current staff'],
                ['Fast access', 'One sign-in, no extra steps'],
              ].map(([title, body]) => (
                <div key={title} style={{ borderTop:'1px solid rgba(15,23,42,0.08)', paddingTop:16 }}>
                  <div style={{ fontSize:32, fontWeight:600, letterSpacing:'-0.05em', color:'#111827', marginBottom:4 }}>{title}</div>
                  <div style={{ fontSize:13.5, color:'#98A2B3', lineHeight:1.6 }}>{body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="login-form-pane" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div className="login-form-card" style={{ width:'100%', maxWidth:452, padding:'44px 40px 36px', border:'1px solid rgba(15,23,42,0.08)', borderRadius:30, background:'rgba(255,255,255,0.96)', boxShadow:'0 18px 44px rgba(15,23,42,0.05)' }}>
            <div className="login-form-mark" style={{ width:64, height:64, borderRadius:18, background:'#F8FBFF', border:'1px solid rgba(var(--accent-rgb),0.12)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 28px' }}>
              <img src="/dh-logo-icon.png" alt="DH logo" style={{ width:42, height:42, objectFit:'contain' }} />
            </div>
            <div className="login-form-copy" style={{ textAlign:'center', marginBottom:28 }}>
              <div className="login-form-title" style={{ fontFamily:'var(--font-display)', fontSize:'clamp(30px,4vw,44px)', fontWeight:600, letterSpacing:'-0.04em', color:'#111827', marginBottom:12 }}>
                Sign in to continue
              </div>
              <div className="login-form-body" style={{ fontSize:15, color:'#667085', lineHeight:1.7 }}>
                Use your work Microsoft account to enter the staff portal.
              </div>
            </div>

            <button
              className="login-primary-btn"
              onClick={login}
              disabled={loading}
              style={{
                width:'100%',
                padding:'16px 22px',
                background: loading ? 'var(--bg3)' : 'var(--accent)',
                color: loading ? 'var(--sub)' : '#fff',
                border:'none',
                borderRadius:999,
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
              <div className="login-note-card" style={{ padding:'16px 18px', borderRadius:18, background:'#F8FAFC', border:'1px solid rgba(15,23,42,0.05)' }}>
                <div className="login-note-label" style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)', marginBottom:6 }}>Access note</div>
                <div style={{ fontSize:13, color:'#667085', lineHeight:1.7 }}>
                  Use your `@dhwebsiteservices.co.uk` account. Access is applied automatically from your role and onboarding status.
                </div>
              </div>
              <div className="login-form-meta" style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', fontSize:12, color:'#98A2B3' }}>
                <span>Microsoft SSO</span>
                <span>Role-based access</span>
              </div>
            </div>
          </div>
        </section>
        </div>
      </div>

      <div className="login-footer" style={{ padding:'18px 32px 24px', display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap', color:'#98A2B3', fontSize:12 }}>
        <span>© 2026 DH Website Services</span>
        <span>Internal access</span>
      </div>
    </div>
  )
}
