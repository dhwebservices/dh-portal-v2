import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PublicClientApplication } from '@azure/msal-browser'
import { MsalProvider } from '@azure/msal-react'
import { msalConfig } from './authConfig'
import App from './App'
import './styles/global.css'

// Apply theme BEFORE React renders — prevents blank cream flash
const saved = localStorage.getItem('dh_portal_theme')
const isDark = saved ? saved === 'dark' : true // default dark for staff portal
document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')

const msalInstance = new PublicClientApplication(msalConfig)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MsalProvider instance={msalInstance}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MsalProvider>
  </React.StrictMode>
)
