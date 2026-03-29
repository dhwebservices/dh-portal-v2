import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'

const DEFAULTS = {
  colorAccent:   '#00C2FF',
  colorGreen:    '#00E5A0',
  colorAmber:    '#FFB800',
  colorRed:      '#FF4D6A',
  fontFamily:    'Inter',
  fontSize:      'normal',  // small | normal | large
  darkMode:      true,
  blockOrder:    ['stats', 'chart', 'status', 'suggest', 'quicklinks'],
  hiddenBlocks:  [],
}

export function usePreferences(userEmail) {
  const [prefs, setPrefs] = useState({ ...DEFAULTS })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userEmail) return
    loadPrefs()
  }, [userEmail])

  const loadPrefs = async () => {
    setLoading(true)
    try {
      const { data } = await supabase.from('user_preferences')
        .select('preferences').eq('user_email', userEmail).maybeSingle()
      if (data?.preferences) {
        const merged = { ...DEFAULTS, ...data.preferences }
        setPrefs(merged)
        applyPrefs(merged)
      }
    } catch (e) { console.warn('Preferences not loaded:', e.message) }
    setLoading(false)
  }

  const save = async (newPrefs) => {
    const merged = { ...prefs, ...newPrefs }
    setPrefs(merged)
    try {
      await supabase.from('user_preferences').upsert({
        user_email: userEmail,
        preferences: merged,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_email' })
    } catch (e) { console.warn('Preferences save failed:', e.message) }
    applyPrefs(merged)
  }

  const applyPrefs = (p) => {
    const root = document.documentElement
    root.style.setProperty('--brand-accent',  p.colorAccent)
    root.style.setProperty('--brand-green',   p.colorGreen)
    root.style.setProperty('--brand-amber',   p.colorAmber)
    root.style.setProperty('--brand-red',     p.colorRed)
    const fontMap = { Inter: "'Inter', sans-serif", Poppins: "'Poppins', sans-serif", Roboto: "'Roboto', sans-serif", Mono: "'JetBrains Mono', monospace" }
    root.style.setProperty('--font-body', fontMap[p.fontFamily] || fontMap.Inter)
    const sizeMap = { small: '13px', normal: '14px', large: '15.5px' }
    root.style.setProperty('--font-base', sizeMap[p.fontSize] || '14px')
  }

  // Apply on load
  useEffect(() => { if (!loading) applyPrefs(prefs) }, [loading])

  return { prefs, save, loading }
}
