import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../utils/supabase'

const DEFAULTS = {
  pushNotifications: true,
  emailNotifications: true,
  theme: 'light',
  biometricAuth: false,
}

const FIELD_MAP = {
  pushNotifications: 'push_notifications',
  emailNotifications: 'email_notifications',
  theme: 'theme',
  biometricAuth: 'biometric_auth',
}

// Single source of truth for user_preferences - shared between MobileApp
// (theme/biometric-lock enforcement) and the Settings screen (toggle UI),
// so a change made in Settings takes effect immediately app-wide instead
// of the two owning separate, unsynced copies of the same DB row.
export function useUserPreferences(userEmail) {
  const [preferences, setPreferences] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userEmail) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_email', userEmail)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setPreferences({
          pushNotifications: data.push_notifications !== false,
          emailNotifications: data.email_notifications !== false,
          theme: data.theme || 'light',
          biometricAuth: data.biometric_auth || false,
        })
      } else {
        setPreferences(DEFAULTS)
      }
    } catch (err) {
      console.error('Failed to load preferences:', err)
    } finally {
      setLoading(false)
    }
  }, [userEmail])

  useEffect(() => {
    load()
  }, [load])

  const savePreference = useCallback(async (key, value) => {
    setPreferences(prev => ({ ...prev, [key]: value }))

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_email: userEmail,
          [FIELD_MAP[key]]: value,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_email'
        })

      if (error) throw error
    } catch (err) {
      console.error('Failed to save preference:', err)
      load()
    }
  }, [userEmail, load])

  return { preferences, loading, savePreference, reload: load }
}
