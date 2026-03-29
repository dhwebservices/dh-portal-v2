import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useLocation } from 'react-router-dom'

const typeStyles = {
  info:    { bg: 'rgba(26,86,219,0.1)',  border: 'rgba(26,86,219,0.25)',  color: 'var(--gold)', icon: 'ℹ️'  },
  success: { bg: 'rgba(0,229,160,0.1)',  border: 'rgba(0,229,160,0.25)',  color: '#00E5A0', icon: '✅' },
  warning: { bg: 'rgba(255,184,0,0.1)',  border: 'rgba(255,184,0,0.25)',  color: '#FFB800', icon: '⚠️' },
  urgent:  { bg: 'rgba(255,77,106,0.1)', border: 'rgba(255,77,106,0.25)', color: '#FF4D6A', icon: '🚨' },
}

export default function BannerDisplay({ userEmail }) {
  const [banners, setBanners]     = useState([])
  const [dismissed, setDismissed] = useState([])
  const [popup, setPopup]         = useState(null)
  const location = useLocation()

  useEffect(() => { fetchBanners() }, [userEmail])

  const fetchBanners = async () => {
    const { data } = await supabase.from('banners')
      .select('*').eq('active', true).order('created_at', { ascending: false })

    // Filter: staff target + not expired
    const now = new Date()
    const current = (data || []).filter(b => {
      if (b.target !== 'staff') return false
      if (b.ends_at && new Date(b.ends_at) < now) return false
      return true
    })

    // Only check dismissals for banners that currently exist
    const currentIds = current.map(b => b.id)
    let dismissedIds = []
    if (userEmail && currentIds.length > 0) {
      const { data: d } = await supabase.from('banner_dismissals')
        .select('banner_id')
        .eq('user_email', userEmail)
        .in('banner_id', currentIds)
      dismissedIds = (d || []).map(x => x.banner_id)
    }
    setDismissed(dismissedIds)

    const active     = current.filter(b => !dismissedIds.includes(b.id))
    const bannerBars = active.filter(b => b.display_type === 'banner')
    const popups     = active.filter(b => b.display_type === 'popup')
    setBanners(bannerBars)
    if (popups.length > 0) setPopup(popups[0])
  }

  const dismiss = async (id) => {
    if (userEmail) {
      await supabase.from('banner_dismissals').insert([{ banner_id: id, user_email: userEmail }])
    }
    setDismissed(p => [...p, id])
    setBanners(p => p.filter(b => b.id !== id))
    if (popup?.id === id) setPopup(null)
  }

  // Filter by page if target_page set
  const currentPath = location.pathname
  const visible = banners.filter(b => {
    if (!dismissed.includes(b.id) === false) return false
    if (b.target_page && b.target_page !== 'all' && b.target_page !== currentPath) return false
    return !dismissed.includes(b.id)
  })

  const showPopup = popup && !dismissed.includes(popup.id) &&
    (!popup.target_page || popup.target_page === 'all' || popup.target_page === currentPath)

  return (
    <>
      {visible.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          {visible.map(banner => {
            const s = typeStyles[banner.type] || typeStyles.info
            return (
              <div key={banner.id} style={{
                background: s.bg, border: `1px solid ${s.border}`,
                borderRadius: '10px', padding: '12px 16px',
                display: 'flex', alignItems: 'flex-start', gap: '10px',
              }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>{s.icon}</span>
                <div style={{ flex: 1 }}>
                  {banner.title && <div style={{ fontWeight: 700, fontSize: '13.5px', color: s.color, marginBottom: '2px' }}>{banner.title}</div>}
                  <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}>{banner.message}</div>
                </div>
                {banner.dismissible && (
                  <button onClick={() => dismiss(banner.id)} style={{ background: 'none', border: 'none', color: 'var(--sub)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                    <X size={15} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showPopup && (() => {
        const s = typeStyles[popup.type] || typeStyles.info
        return (
          <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 450, maxWidth: '360px', width: 'calc(100vw - 48px)', animation: 'fadeSlideUp 0.3s ease' }}>
            <style>{`@keyframes fadeSlideUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }`}</style>
            <div style={{ background: 'var(--card)', border: `1px solid ${s.border}`, borderLeft: `4px solid ${s.color}`, borderRadius: '12px', padding: '16px 18px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>{s.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {popup.title && <div style={{ fontWeight: 700, fontSize: '14px', color: s.color, marginBottom: '4px' }}>{popup.title}</div>}
                <p style={{ fontSize: '13px', color: 'var(--sub)', lineHeight: 1.6, margin: 0 }}>{popup.message}</p>
                {popup.dismissible && (
                  <button onClick={() => dismiss(popup.id)} style={{ marginTop: '10px', padding: '6px 16px', background: s.color, color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>Got it</button>
                )}
              </div>
              {popup.dismissible && (
                <button onClick={() => dismiss(popup.id)} style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', flexShrink: 0, fontSize: '16px', lineHeight: 1 }}>×</button>
              )}
            </div>
          </div>
        )
      })()}
    </>
  )
}
