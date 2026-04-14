import { useEffect, useState } from 'react'

const STORAGE_KEY = 'dh-portal-loader-seen'

export default function InitialLoader() {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (window.sessionStorage.getItem(STORAGE_KEY) === '1') return undefined

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const minVisible = reducedMotion ? 280 : 820
    const exitDuration = reducedMotion ? 160 : 380

    setVisible(true)
    window.sessionStorage.setItem(STORAGE_KEY, '1')

    const exitTimer = window.setTimeout(() => setExiting(true), minVisible)
    const hideTimer = window.setTimeout(() => setVisible(false), minVisible + exitDuration)

    return () => {
      window.clearTimeout(exitTimer)
      window.clearTimeout(hideTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <div className={`portal-loader${exiting ? ' is-exiting' : ''}`} aria-hidden="true">
      <div className="portal-loader__glow" />
      <div className="portal-loader__shell">
        <div className="portal-loader__mark-wrap">
          <img src="/dh-logo-icon.png" alt="" className="portal-loader__mark" />
        </div>
        <div className="portal-loader__eyebrow">Loading workspace</div>
        <div className="portal-loader__title">DH Website Services</div>
        <div className="portal-loader__track">
          <span className="portal-loader__bar" />
        </div>
      </div>
    </div>
  )
}
