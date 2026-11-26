// Dev-only: renders the phone app in a browser with a stand-in signed-in
// user, so screens can be checked without the iOS build. Not part of the
// production build (vite builds index.html only). Real data calls still run
// and fail or succeed as they would signed out.
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { msal } from './msalInstance'
import { AuthContextForPreview } from './contexts/AuthContext'
import MobileApp from './MobileApp'
import './styles/global.css'
import './styles/design-system.css'

const user = { name: 'David Hooper', email: 'david@dhwebsiteservices.co.uk' }
const value = { user, loading: false, isAdmin: true, can: () => true, isOnboarding: false }

// ?mock=1: canned Fish Tank answers so its signed-in screens can be seen.
if (new URLSearchParams(window.location.search).get('mock')) {
  localStorage.setItem('fishtank.operatorKey', 'x'.repeat(64))
  const day = 86_400_000
  const now = Date.now()
  const players = Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, username: `Player${i}`, platform: i % 2 ? 'ios' : 'android', created_at: now - i * day * 0.9, seen_at: now - (i % 7) * day, best_score: 100 * i, wins: 0, kills: 0, unclaimed: 0 }))
  const canned = {
    '/operator/overview': { totals: { total: 14, banned: 0, new_24h: 1, new_7d: 6, active_24h: 1, active_7d: 12 }, platforms: [{ platform: 'ios', n: 7 }, { platform: 'android', n: 7 }], top: [], newest: [], crashes_7d: 0, push_devices: 9, stale: 2 },
    '/operator/players': players,
    '/operator/maintenance': { on: false, message: 'Due to a critical PHP code vulnerability affecting our servers we are closing the game for a short while' },
    '/operator/active': { counts: { last_hour: 0, today: 1, this_week: 12 }, recent: [] },
    '/operator/flags': { multiplayer: true, daily: true, leaderboard: true },
  }
  const real = window.fetch.bind(window)
  window.fetch = async (url, opts) => {
    const u = String(url)
    if (u.includes('fishtank')) {
      const path = Object.keys(canned).find(k => u.split('?')[0].endsWith(k))
      return new Response(JSON.stringify(path ? canned[path] : []), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return real(url, opts)
  }
}

msal.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <MsalProvider instance={msal}>
      <AuthContextForPreview.Provider value={value}>
        <MobileApp />
      </AuthContextForPreview.Provider>
    </MsalProvider>
  )
})
