import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

// Set theme before render to prevent flash
const saved = localStorage.getItem('dh-theme') || 'light'
document.documentElement.setAttribute('data-theme', saved)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
