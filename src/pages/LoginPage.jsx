import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0F0D0A',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', position: 'relative', overflow: 'hidden',
    }}>
      {/* Background blobs */}
      <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(201,168,76,0.05) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

      {/* Card */}
      <div style={{
        background: '#1F1B16', border: '1px solid #2E2820', borderRadius: '10px',
        padding: '48px 44px', width: '420px', maxWidth: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        animation: 'fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) both',
        position: 'relative',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '36px' }}>
          <img src="/dh-logo.png" alt="DH" style={{ height: '28px', filter: 'brightness(0) invert(1) opacity(0.9)' }} />
        </div>

        {/* Headline */}
        <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '32px', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: '10px', color: '#F5F0E8' }}>
          Welcome back
        </h1>
        <p style={{ color: '#9A8E7E', fontSize: '14px', marginBottom: '36px', lineHeight: 1.6 }}>
          Sign in with your DH Website Services Microsoft account to access the staff portal.
        </p>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '36px' }}>
          {['Secure SSO', 'Staff Portal', 'HR System'].map(text => (
            <div key={text} style={{
              padding: '5px 12px', borderRadius: '100px', fontSize: '12px',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em',
              background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)',
              color: '#C9A84C',
            }}>{text}</div>
          ))}
        </div>

        {/* Sign in button */}
        <button onClick={login} style={{
          width: '100%', padding: '14px',
          background: '#C9A84C', border: 'none', borderRadius: '6px',
          color: '#1A1612', fontSize: '14.5px', fontWeight: 700,
          fontFamily: "'Outfit', sans-serif", letterSpacing: '0.02em',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '10px', transition: 'all 0.2s',
        }}
          onMouseOver={e => { e.currentTarget.style.background = '#E8C96A'; e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseOut={e => { e.currentTarget.style.background = '#C9A84C'; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
            <rect x="1" y="1"  width="9" height="9" fill="#F25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
            <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
          </svg>
          Sign in with Microsoft
        </button>

        <p style={{ marginTop: '20px', fontSize: '12px', color: '#5A5048', textAlign: 'center', lineHeight: 1.6, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.02em' }}>
          Restricted to authorised DH Website Services staff
        </p>
      </div>
  )
}
