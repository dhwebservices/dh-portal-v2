import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'

export function useTheme(userEmail) {
  const [theme, setTheme] = useState('light')
  const [systemTheme, setSystemTheme] = useState('light')

  useEffect(() => {
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e) => {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }

    setSystemTheme(mediaQuery.matches ? 'dark' : 'light')
    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (userEmail) {
      loadThemePreference()
    }
  }, [userEmail])

  useEffect(() => {
    applyTheme()
  }, [theme, systemTheme])

  const loadThemePreference = async () => {
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('theme')
        .eq('user_email', userEmail)
        .single()

      if (data && data.theme) {
        setTheme(data.theme)
      }
    } catch (error) {
      console.error('Failed to load theme preference:', error)
    }
  }

  const applyTheme = () => {
    const activeTheme = theme === 'auto' ? systemTheme : theme

    if (activeTheme === 'dark') {
      document.body.classList.add('dark-theme')
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.body.classList.remove('dark-theme')
      document.documentElement.setAttribute('data-theme', 'light')
    }
  }

  const saveTheme = async (newTheme) => {
    setTheme(newTheme)

    if (userEmail) {
      try {
        await supabase
          .from('user_preferences')
          .upsert({
            user_email: userEmail,
            theme: newTheme,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_email'
          })
      } catch (error) {
        console.error('Failed to save theme:', error)
      }
    }
  }

  return {
    theme,
    activeTheme: theme === 'auto' ? systemTheme : theme,
    setTheme: saveTheme
  }
}
