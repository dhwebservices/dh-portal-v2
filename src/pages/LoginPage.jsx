import { useMsal } from '@azure/msal-react'
import { loginRequest } from '../authConfig'
import { useState } from 'react'

export default function LoginPage() {
  const { instance } = useMsal()
  const [loading, setLoading] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('dh-theme') === 'dark')

  const login = async () => {
    setLoading(true)
    try { await instance.loginPopup(loginRequest) }
    catch { setLoading(false) }
  }

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('dh-theme', next)
    setDark(!dark)
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column' }}>
      {/* Nav */}
      <nav style={{ height:52, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 32px', background:'rgba(255,255,255,0.85)', backdropFilter:'blur(20px)', position:'sticky', top:0 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, letterSpacing:'-0.02em' }}>
          DH<span style={{ color:'var(--accent)' }}> Portal</span>
        </div>
        <button onClick={toggleTheme} style={{ background:'none', border:'1px solid var(--border)', borderRadius:100, padding:'5px 12px', cursor:'pointer', fontSize:12, color:'var(--sub)', display:'flex', alignItems:'center', gap:6 }}>
          {dark ? '☀ Light' : '◐ Dark'}
        </button>
      </nav>

      {/* Hero */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'60px 24px', textAlign:'center' }}>
        <div style={{ maxWidth:440, width:'100%' }}>
          {/* Icon */}
          <div style={{ width:64, height:64, borderRadius:16, background:'var(--accent-soft)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 28px', fontSize:28 }}>
            🏢
          </div>

          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(32px,5vw,48px)', fontWeight:400, letterSpacing:'-0.03em', lineHeight:1.1, marginBottom:12 }}>
            DH Staff Portal
          </h1>
          <p style={{ fontSize:16, color:'var(--sub)', marginBottom:40, lineHeight:1.6 }}>
            Sign in with your DH Website Services Microsoft account to access the portal.
          </p>

          <button
            onClick={login}
            disabled={loading}
            style={{ width:'100%', padding:'14px 24px', background: loading ? 'var(--bg3)' : 'var(--accent)', color: loading ? 'var(--sub)' : '#fff', border:'none', borderRadius:100, fontSize:15, fontWeight:500, cursor: loading ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, transition:'all 0.2s', fontFamily:'var(--font-body)' }}
            onMouseOver={e => { if (!loading) e.currentTarget.style.background='var(--accent-hover)' }}
            onMouseOut={e => { if (!loading) e.currentTarget.style.background='var(--accent)' }}
          >
            {loading ? (
              <><div style={{ width:16, height:16, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'white', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/> Signing in...</>
            ) : (
              <><svg width="16" height="16" viewBox="0 0 21 21" fill="none"><rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/><rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/></svg> Sign in with Microsoft</>
            )}
          </button>

          <p style={{ fontSize:12, color:'var(--faint)', marginTop:20 }}>
            Use your @dhwebsiteservices.co.uk account
          </p>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding:'20px 32px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:12, color:'var(--faint)' }}>© 2026 DH Website Services</span>
        <span style={{ fontSize:12, color:'var(--faint)' }}>dhwebsiteservices.co.uk</span>
      </div>
    </div>
  )
}
