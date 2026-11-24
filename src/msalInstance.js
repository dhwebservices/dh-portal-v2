import { PublicClientApplication } from '@azure/msal-browser'
import { msalConfig } from './authConfig'

// The one MSAL instance for the whole app. App.jsx initialises it; helpers that
// need the signed-in user's token outside React (email, push, service admin)
// import it from here instead of needing useMsal().
export const msal = new PublicClientApplication(msalConfig)
