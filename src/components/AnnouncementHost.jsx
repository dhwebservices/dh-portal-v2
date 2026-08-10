/**
 * Decides whether to show the "what's new" modal, and remembers the answer.
 *
 * Mounted once at the top of the app. Reads the release notes already authored
 * in Settings > Experience. Renders nothing until that payload is loaded,
 * confirmed active, and confirmed unseen by this person - and never shows to
 * someone still in onboarding, who has quite enough on screen already.
 */

import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import AnnouncementModal from './AnnouncementModal'
import { loadWhatsNew, loadSeenVersion, markSeen, shouldShow } from '../utils/announcements'

export default function AnnouncementHost() {
  const { user, isOnboarding, loading } = useAuth()
  const email = user?.email
  const [announcement, setAnnouncement] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (loading || !email || isOnboarding) return undefined
    let active = true

    ;(async () => {
      try {
        const [current, seen] = await Promise.all([
          loadWhatsNew(),
          loadSeenVersion(email),
        ])
        if (!active) return
        if (shouldShow(current, seen)) {
          setAnnouncement(current)
          setVisible(true)
        }
      } catch {
        // An announcement failing to load is never worth interrupting anyone.
      }
    })()

    return () => { active = false }
  }, [loading, email, isOnboarding])

  if (!visible || !announcement) return null

  const close = async () => {
    setVisible(false)
    // Closing counts as seen: nobody wants the same dialog on every page load.
    try { await markSeen(email, announcement.version) } catch { /* not worth surfacing */ }
  }

  return (
    <AnnouncementModal
      slides={announcement.slides}
      onDismiss={close}
      onDontShowAgain={close}
    />
  )
}
