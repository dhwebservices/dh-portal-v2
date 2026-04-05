import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useMsal } from '@azure/msal-react'
import { useState, useEffect } from 'react'

export default function HomeScreen() {
  const { user, isOnboarding, loading } = useAuth()
  const { instance } = useMsal()
  const navigate = useNavigate()

  // Onboarding users go straight to the form — no home screen for them
  if (!loading && isOnboarding) {
    navigate('/hr/onboarding', { replace: true })
    return null
  }
  const [dark, setDark] = useState(() => localStorage.getItem('dh-theme') === 'dark')

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('dh-theme', next)
    setDark(!dark)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column' }}>
      {/* Nav */}
      <nav style={{ height:52, background:'var(--card)', backdropFilter:'saturate(180%) blur(20px)', WebkitBackdropFilter:'saturate(180%) blur(20px)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 32px', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, letterSpacing:'-0.02em' }}>
          DH<span style={{ color:'var(--accent)' }}> Portal</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={toggleTheme} style={{ background:'none', border:'1px solid var(--border)', borderRadius:100, padding:'5px 12px', cursor:'pointer', fontSize:12, color:'var(--sub)' }}>
            {dark ? '☀ Light' : '◐ Dark'}
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 12px', borderRadius:100, border:'1px solid var(--border)', background:'var(--bg2)' }}>
            <div style={{ width:22, height:22, borderRadius:'50%', background:'var(--accent-soft)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
              <img src="/dh-logo-icon.png" alt="DH avatar" style={{ width:14, height:14, objectFit:'contain' }} />
            </div>
            <span style={{ fontSize:13, color:'var(--text)', fontWeight:400 }}>{user?.name}</span>
          </div>
          <button onClick={() => instance.logoutRedirect()} style={{ background:'none', border:'1px solid var(--border)', borderRadius:100, padding:'5px 12px', cursor:'pointer', fontSize:12, color:'var(--sub)' }}>
            Sign out
          </button>
        </div>
      </nav>

      {/* Content */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'60px 24px', background:'var(--bg)' }}>
        <div style={{ width:'100%', maxWidth:680 }}>
          {/* Greeting */}
          <div style={{ textAlign:'center', marginBottom:56 }}>
            <h1 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(32px,5vw,52px)', fontWeight:400, letterSpacing:'-0.03em', lineHeight:1.1, marginBottom:10, color:'var(--text)' }}>
              {greeting}, {user?.name?.split(' ')[0]}
            </h1>
            <p style={{ fontSize:15, color:'var(--sub)' }}>Choose where you'd like to go.</p>
          </div>

          {/* Cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:20 }}>

            {/* HR Portal */}
            <button
              onClick={() => navigate('/dashboard')}
              style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'36px 32px', textAlign:'left', cursor:'pointer', transition:'all 0.25s cubic-bezier(0.16,1,0.3,1)', display:'flex', flexDirection:'column', gap:18 }}
              onMouseOver={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow='0 16px 48px rgba(0,113,227,0.1)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}
            >
              <div style={{ width:52, height:52, borderRadius:12, background:'var(--accent-soft)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>
                👥
              </div>
              <div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:400, letterSpacing:'-0.01em', marginBottom:8, color:'var(--text)' }}>HR & Staff</div>
                <div style={{ fontSize:13.5, color:'var(--sub)', lineHeight:1.6 }}>
                  Staff management, leave, timesheets, payslips, client outreach and support tickets.
                </div>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {['Dashboard','HR','Tasks','Clients','Support'].map(t => (
                  <span key={t} style={{ padding:'3px 10px', borderRadius:100, background:'var(--bg2)', border:'1px solid var(--border)', fontSize:11, color:'var(--sub)', fontFamily:'var(--font-mono)' }}>{t}</span>
                ))}
              </div>
            </button>

            {/* Web Manager */}
            <button
              onClick={() => navigate('/web-manager')}
              style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'36px 32px', textAlign:'left', cursor:'pointer', transition:'all 0.25s cubic-bezier(0.16,1,0.3,1)', display:'flex', flexDirection:'column', gap:18 }}
              onMouseOver={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow='0 16px 48px rgba(0,113,227,0.1)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}
            >
              <div style={{ width:52, height:52, borderRadius:12, background:'var(--accent-soft)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>
                🌐
              </div>
              <div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:400, letterSpacing:'-0.01em', marginBottom:8, color:'var(--text)' }}>Web Manager</div>
                <div style={{ fontSize:13.5, color:'var(--sub)', lineHeight:1.6 }}>
                  Manage client websites, send invoices, track payments and edit your public site.
                </div>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {['Clients','Editor','Invoices','GoCardless','Public Site'].map(t => (
                  <span key={t} style={{ padding:'3px 10px', borderRadius:100, background:'var(--accent-soft)', border:'1px solid var(--accent-border)', fontSize:11, color:'var(--accent)', fontFamily:'var(--font-mono)' }}>{t}</span>
                ))}
              </div>
            </button>

            <button
              onClick={() => navigate('/recruiting')}
              style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'36px 32px', textAlign:'left', cursor:'pointer', transition:'all 0.25s cubic-bezier(0.16,1,0.3,1)', display:'flex', flexDirection:'column', gap:18 }}
              onMouseOver={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow='0 16px 48px rgba(0,113,227,0.1)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}
            >
              <div style={{ width:52, height:52, borderRadius:12, background:'var(--accent-soft)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>
                💼
              </div>
              <div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:400, letterSpacing:'-0.01em', marginBottom:8, color:'var(--text)' }}>Recruiting</div>
                <div style={{ fontSize:13.5, color:'var(--sub)', lineHeight:1.6 }}>
                  Run the hiring pipeline, manage live job posts, review CVs in full screen, and progress candidates through the recruitment process.
                </div>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {['Roles','Applicants','CVs','Pipeline','Status Emails'].map(t => (
                  <span key={t} style={{ padding:'3px 10px', borderRadius:100, background:'var(--bg2)', border:'1px solid var(--border)', fontSize:11, color:'var(--sub)', fontFamily:'var(--font-mono)' }}>{t}</span>
                ))}
              </div>
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding:'16px 32px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
        <span style={{ fontSize:12, color:'var(--faint)' }}>© 2026 DH Website Services</span>
        <span style={{ fontSize:12, color:'var(--faint)' }}>Staff Portal v2</span>
      </div>
    </div>
  )
}
