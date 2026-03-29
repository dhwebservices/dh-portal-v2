import { useState, useEffect } from 'react'

export function usePortalTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('dh_portal_theme')
    if (saved) return saved === 'dark'
    return true // default dark for staff portal
  })

  useEffect(() => {
    localStorage.setItem('dh_portal_theme', dark ? 'dark' : 'light')
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  return { dark, toggle: () => setDark(d => !d) }
}
