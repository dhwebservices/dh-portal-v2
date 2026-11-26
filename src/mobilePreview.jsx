// Dev-only: renders the phone app in a browser with a stand-in signed-in
// user, so screens can be checked without the iOS build. Not part of the
// production build (vite builds index.html only). With ?mock=1 every API
// answer is canned (previewMock.js); without it real calls run signed out.
import './previewMock'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { msal } from './msalInstance'
import { AuthContextForPreview } from './contexts/AuthContext'
import MobileApp from './MobileApp'
import MobileOnboarding from './mobile/screens/Onboarding'
import MobileLogin from './mobile/screens/LoginProfessional'
import './styles/global.css'
import './styles/design-system.css'

const user = { name: 'David Hooper', email: 'david@dhwebsiteservices.co.uk' }
const value = { user, loading: false, isAdmin: true, can: () => true, isOnboarding: false }

// ?mock=1: a stand-in signed-in Microsoft account, so token calls succeed;
// the API answers themselves come from previewMock.js.
if (new URLSearchParams(window.location.search).get('mock')) {
  const account = { homeAccountId: 'preview', environment: 'login.microsoftonline.com', tenantId: 'preview', username: user.email, localAccountId: 'preview', name: user.name }
  msal.getAllAccounts = () => [account]
  msal.getActiveAccount = () => account
  msal.acquireTokenSilent = async () => ({ idToken: 'preview', accessToken: 'preview', account })
}

const only = new URLSearchParams(window.location.search).get('only')

msal.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <MsalProvider instance={msal}>
      <AuthContextForPreview.Provider value={value}>
        {/* ?only=onboarding|signin shows the screens MobileApp/App render outside the shell. */}
        {only === 'onboarding' ? <MobileOnboarding user={user} /> : only === 'signin' ? <MobileLogin /> : <MobileApp />}
      </AuthContextForPreview.Provider>
    </MsalProvider>
  )
})
