import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../utils/supabase'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { id: 'people', label: 'People', path: '/people' },
  { id: 'recruiting', label: 'Recruiting', path: '/recruiting' },
  { id: 'websites', label: 'Websites', path: '/website-builder' },
  { id: 'support', label: 'Support', path: '/support' },
  { id: 'reports', label: 'Reports', path: '/reports' },
  { id: 'admin', label: 'Admin', path: '/settings' },
]

export default function TopBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [unread, setUnread] = useState(0)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!user?.email) return
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_email', user.email)
      .eq('read', false)
      .then(({ count }) => setUnread(count || 0))
  }, [user?.email, location.pathname])

  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const isActive = (tab) => {
    if (tab.id === 'dashboard') return location.pathname === '/dashboard'
    return location.pathname.startsWith(tab.path)
  }

  return (
    <header style={{
      background: '#2563EB',
      height: '56px',
      display: 'flex',
      alignItems: 'stretch',
      padding: '0 24px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <div
        onClick={() => navigate('/dashboard')}
        style={{
          display: 'flex',
          alignItems: 'center',
          marginRight: '24px',
          cursor: 'pointer',
          fontSize: '18px',
          fontWeight: 800,
          color: '#FFFFFF',
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
        }}
      >
        DH
      </div>

      {/* Tabs */}
      <nav style={{
        display: 'flex',
        alignItems: 'stretch',
        flex: 1,
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {TABS.map((tab) => {
          const active = isActive(tab)
          return (
            <div
              key={tab.id}
              onClick={() => navigate(tab.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                fontSize: '15px',
                fontWeight: 600,
                color: '#FFFFFF',
                background: active ? 'rgba(255,255,255,0.18)' : 'transparent',
                borderBottom: active ? '3px solid #FFFFFF' : '3px solid transparent',
                paddingTop: '3px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.10)' }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              {tab.label}
            </div>
          )
        })}
      </nav>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Notifications */}
        <button
          onClick={() => navigate('/notifications')}
          aria-label="Notifications"
          style={{
            position: 'relative',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unread > 0 && (
            <span style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              minWidth: '16px',
              height: '16px',
              padding: '0 4px',
              background: '#DC2626',
              color: '#FFFFFF',
              fontSize: '10px',
              fontWeight: 700,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>

        {/* User menu */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <div
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 8px 4px 4px',
              borderRadius: '18px',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: '#FFFFFF',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 700,
            }}>
              {user?.name?.[0] || 'U'}
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {showUserMenu && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              minWidth: '220px',
              zIndex: 1000,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                  {user?.name || 'User'}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  {user?.email}
                </div>
              </div>
              <button
                onClick={() => { setShowUserMenu(false); navigate('/my-profile') }}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  textAlign: 'left',
                  fontSize: '14px',
                  color: '#0F172A',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                My profile
              </button>
              <button
                onClick={() => { setShowUserMenu(false); logout() }}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  textAlign: 'left',
                  fontSize: '14px',
                  color: '#DC2626',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderTop: '1px solid #F1F5F9',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
