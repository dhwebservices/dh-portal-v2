import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'
import './styles/redesign-overrides.css'
import { applyPortalAppearance, readStoredPortalPreferences } from './utils/portalPreferences'

// Set theme before render to prevent flash
applyPortalAppearance(readStoredPortalPreferences())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
