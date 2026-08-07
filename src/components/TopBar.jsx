import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function TopBar() {
  const { user, logout } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleSearch = (e) => {
    if (e.key === 'Enter') {
      // TODO: Implement global search
      console.log('Search:', e.target.value)
    }
  }

  return (
    <div className="ds-topbar">
      <div className="flex items-center gap-xl">
        <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
          DH
        </div>
        <input
          type="text"
          placeholder="Search everything..."
          onKeyPress={handleSearch}
          style={{
            width: '320px',
            height: '32px',
            background: 'var(--color-gray-100)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--border-radius-md)',
            padding: '0 12px',
            fontSize: 'var(--font-size-body)',
            color: 'var(--color-text-primary)'
          }}
        />
      </div>

      <div style={{ position: 'relative' }}>
        <div
          onClick={() => setShowUserMenu(!showUserMenu)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
            padding: '6px 12px',
            borderRadius: 'var(--border-radius-md)',
            transition: 'background var(--transition-normal)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'var(--color-primary)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 600
          }}>
            {user?.name?.[0] || 'U'}
          </div>
          <span style={{ fontSize: 'var(--font-size-body)' }}>
            {user?.name || 'User'}
          </span>
        </div>

        {showUserMenu && (
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 'var(--space-sm)',
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--border-radius-md)',
            boxShadow: 'var(--shadow-md)',
            minWidth: '200px',
            zIndex: 1000
          }}>
            <div style={{ padding: 'var(--space-sm) 0' }}>
              <div style={{ padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 'var(--font-size-small)', color: 'var(--color-text-secondary)' }}>
                  Signed in as
                </div>
                <div style={{ fontSize: 'var(--font-size-body)', fontWeight: 500 }}>
                  {user?.email}
                </div>
              </div>
              <button
                onClick={() => {
                  setShowUserMenu(false)
                  logout()
                }}
                style={{
                  width: '100%',
                  padding: 'var(--space-sm) var(--space-md)',
                  textAlign: 'left',
                  fontSize: 'var(--font-size-body)',
                  color: 'var(--color-text-primary)',
                  background: 'transparent',
                  border: 'none',
                  transition: 'background var(--transition-fast)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
