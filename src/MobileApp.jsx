// NATIVE MOBILE APP - Completely separate from web version
import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { App as CapacitorApp } from '@capacitor/app'
import { useAuth } from './contexts/AuthContext'
import { initCrashReporter } from './utils/crashReporter'
import { initPushNotifications, consumePendingPushNavigation } from './utils/pushNotifications'
import ErrorBoundary from './components/ErrorBoundary'
import { useUserPreferences } from './hooks/useUserPreferences'
import { isBiometricAvailable, authenticateWithBiometric } from './utils/biometricAuth'
import { supabase } from './utils/supabase'
import MobileOnboarding from './mobile/screens/Onboarding'
import MobileOnboardingReview from './mobile/screens/OnboardingReview'
import MobileGeneratePayslip from './mobile/screens/GeneratePayslip'
import MobileAddStaff from './mobile/screens/AddStaff'

// Mobile-native screens
import MobileHome from './mobile/screens/HomeProfessional'
import MobileProfile from './mobile/screens/Profile'
import MobileAttendance from './mobile/screens/Attendance'
import MobileClockIn from './mobile/screens/ClockIn'
import MobilePayslips from './mobile/screens/Payslips'
import MobileLeave from './mobile/screens/Leave'
import MobileNotifications from './mobile/screens/Notifications'
import MobileSettings from './mobile/screens/Settings'
import MobileStaffDirectory from './mobile/screens/StaffDirectory'
import MobileStaffProfile from './mobile/screens/StaffProfile'
import MobileEditStaffProfile from './mobile/screens/EditStaffProfile'
import MobileEditPermissions from './mobile/screens/EditPermissions'
import MobileOutreach from './mobile/screens/Outreach'
import MobileTimesheet from './mobile/screens/Timesheet'
import MobileRota from './mobile/screens/Rota'
import Icon from './mobile/components/Icon'

export default function MobileApp() {
  const { user, can, loading, isAdmin } = useAuth()
  const [currentScreen, setCurrentScreen] = useState('home')
  const [screenHistory, setScreenHistory] = useState(['home'])
  const [screenParams, setScreenParams] = useState({})
  const { preferences, loading: prefsLoading, savePreference } = useUserPreferences(user?.email)
  const [systemTheme, setSystemTheme] = useState('light')
  const [locked, setLocked] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [lockError, setLockError] = useState('')
  const [onboardingActive, setOnboardingActive] = useState(false)
  const [onboardingChecked, setOnboardingChecked] = useState(false)

  useEffect(() => {
    if (!user?.email) {
      if (!loading) setOnboardingChecked(true)
      return
    }
    let cancelled = false
    supabase
      .from('user_permissions')
      .select('onboarding')
      .ilike('user_email', user.email)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setOnboardingActive(!!data?.onboarding)
        setOnboardingChecked(true)
      })
      .catch(() => { if (!cancelled) setOnboardingChecked(true) })
    return () => { cancelled = true }
  }, [user?.email])

  const activeTheme = preferences.theme === 'auto' ? systemTheme : preferences.theme

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e) => setSystemTheme(e.matches ? 'dark' : 'light')
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light')
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (activeTheme === 'dark') {
      document.body.classList.add('dark-theme')
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.body.classList.remove('dark-theme')
      document.documentElement.setAttribute('data-theme', 'light')
    }
  }, [activeTheme])

  // App-lock: if the user has enabled Biometric Authentication in Settings,
  // require Face ID / Touch ID before showing any authenticated content -
  // both on cold launch and whenever the app returns from the background.
  useEffect(() => {
    if (prefsLoading || !Capacitor.isNativePlatform()) return
    setLocked(preferences.biometricAuth === true)
  }, [prefsLoading, preferences.biometricAuth])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined
    // Use 'resume' (real backgrounding), not 'appStateChange' (isActive) -
    // the latter also fires when the Face ID system prompt itself briefly
    // covers the app, which would re-trigger the lock and loop forever.
    const listener = CapacitorApp.addListener('resume', () => {
      if (preferences.biometricAuth) {
        setLocked(true)
      }
    })
    return () => { listener.remove() }
  }, [preferences.biometricAuth])

  const unlock = async () => {
    setUnlocking(true)
    setLockError('')
    try {
      const availability = await isBiometricAvailable()
      if (!availability.available) {
        // Device has no biometrics enrolled - don't hold the user hostage
        setLocked(false)
        return
      }
      await authenticateWithBiometric('Unlock DH Staff Portal')
      setLocked(false)
    } catch (error) {
      setLockError(error.message || 'Authentication failed')
    } finally {
      setUnlocking(false)
    }
  }

  useEffect(() => {
    if (locked) unlock()
  }, [locked])

  // Pick up a screen queued by a tapped push notification (see
  // pushNotifications.js - the WebView has no live server URL to route to,
  // so the tap handler stores an intent here instead of navigating away).
  useEffect(() => {
    if (loading || locked || !onboardingChecked || onboardingActive) return
    const targetScreen = consumePendingPushNavigation()
    if (targetScreen) {
      setCurrentScreen(targetScreen)
      setScreenHistory(['home', targetScreen])
    }
  }, [loading, locked, onboardingChecked, onboardingActive])

  useEffect(() => {
    configureNativeApp()
    handleBackButton()

    // Initialize crash reporter
    if (user?.email) {
      initCrashReporter(user.email)

      // Initialize push notifications
      initPushNotifications(user.email).then(result => {
        console.log('Push notifications initialized:', result)
      })
    }
  }, [user?.email])

  const configureNativeApp = async () => {
    try {
      // Configure status bar based on active theme
      const isDark = activeTheme === 'dark'

      await StatusBar.setStyle({
        style: isDark ? Style.Dark : Style.Light,
      })

      await StatusBar.setBackgroundColor({
        color: isDark ? '#1a1612' : '#ffffff',
      })

      // Hide splash screen
      const { SplashScreen } = await import('@capacitor/splash-screen')
      await SplashScreen.hide()

    } catch (error) {
      console.log('Native config error:', error)
    }
  }

  const handleBackButton = () => {
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (screenHistory.length > 1) {
        // Navigate to previous screen
        goBack()
      } else {
        // Exit app if on home screen
        CapacitorApp.exitApp()
      }
    })
  }

  const navigate = async (screen, params = {}) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    setCurrentScreen(screen)
    setScreenHistory([...screenHistory, screen])
    setScreenParams(params)
  }

  const goBack = async () => {
    await Haptics.impact({ style: ImpactStyle.Light })
    const newHistory = screenHistory.slice(0, -1)
    setScreenHistory(newHistory)
    setCurrentScreen(newHistory[newHistory.length - 1])
  }

  const resetToHome = async () => {
    await Haptics.impact({ style: ImpactStyle.Medium })
    setCurrentScreen('home')
    setScreenHistory(['home'])
  }

  // Render current screen
  const renderScreen = () => {
    const screenProps = { navigate, goBack, user, can, isAdmin, ...screenParams }

    switch (currentScreen) {
      case 'home':
        return <MobileHome {...screenProps} />
      case 'profile':
        return <MobileProfile {...screenProps} />
      case 'attendance':
        return <MobileAttendance {...screenProps} />
      case 'clockin':
        return <MobileClockIn {...screenProps} />
      case 'payslips':
        return <MobilePayslips {...screenProps} />
      case 'leave':
        return <MobileLeave {...screenProps} />
      case 'notifications':
        return <MobileNotifications {...screenProps} />
      case 'settings':
        return (
          <MobileSettings
            {...screenProps}
            preferences={preferences}
            prefsLoading={prefsLoading}
            savePreference={savePreference}
          />
        )
      case 'staff-directory':
        return <MobileStaffDirectory {...screenProps} />
      case 'staff-profile':
        return <MobileStaffProfile {...screenProps} />
      case 'edit-staff':
        return <MobileEditStaffProfile {...screenProps} />
      case 'edit-permissions':
        return <MobileEditPermissions {...screenProps} />
      case 'onboarding-review':
        return <MobileOnboardingReview {...screenProps} />
      case 'generate-payslip':
        return <MobileGeneratePayslip {...screenProps} />
      case 'add-staff':
        return <MobileAddStaff {...screenProps} />
      case 'outreach':
        return <MobileOutreach {...screenProps} />
      case 'timesheet':
        return <MobileTimesheet {...screenProps} />
      case 'rota':
        return <MobileRota {...screenProps} />
      default:
        return <MobileHome {...screenProps} />
    }
  }

  if (loading || !onboardingChecked) {
    return (
      <div className="mobile-loading">
        <div className="mobile-spinner" />
        <p>Loading...</p>
      </div>
    )
  }

  if (onboardingActive) {
    return (
      <ErrorBoundary>
        <MobileOnboarding user={user} />
      </ErrorBoundary>
    )
  }

  if (locked) {
    return (
      <div className={`mobile-app ${activeTheme}`}>
        <div className="lock-screen">
          <div className="lock-icon">
            <Icon name="lock" size={40} color="#b8960c" />
          </div>
          <h2>DH Staff Portal Locked</h2>
          <p>{lockError || 'Authenticate to continue'}</p>
          <button className="unlock-btn" onClick={unlock} disabled={unlocking}>
            {unlocking ? 'Authenticating...' : 'Unlock'}
          </button>
        </div>

        <style>{`
          .lock-screen {
            height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 24px;
            text-align: center;
            background: var(--mobile-bg);
            color: var(--mobile-text);
          }

          .lock-icon {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            background: var(--mobile-card);
            border: 1px solid var(--mobile-border);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 8px;
          }

          .lock-screen h2 {
            font-size: 19px;
            font-weight: 700;
            margin: 0;
          }

          .lock-screen p {
            font-size: 14px;
            color: var(--mobile-text-secondary);
            margin: 0 0 12px 0;
          }

          .unlock-btn {
            padding: 12px 28px;
            border-radius: 8px;
            border: none;
            background: var(--mobile-accent);
            color: white;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
          }

          .unlock-btn:disabled {
            opacity: 0.6;
          }

          .unlock-btn:active {
            opacity: 0.8;
          }
        `}</style>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className={`mobile-app ${activeTheme}`}>
        {/* Screen Content */}
        <div className="mobile-screen">
          {renderScreen()}
        </div>

      {/* Bottom Tab Navigation */}
      <nav className="mobile-tabs">
        <TabButton
          iconName="home"
          label="Dashboard"
          active={currentScreen === 'home'}
          onPress={() => navigate('home')}
        />
        <TabButton
          iconName="clock"
          label="Clock In"
          active={currentScreen === 'clockin'}
          onPress={() => navigate('clockin')}
        />
        <TabButton
          iconName="calendar"
          label="Leave"
          active={currentScreen === 'leave'}
          onPress={() => navigate('leave')}
        />
        <TabButton
          iconName="bell"
          label="Alerts"
          active={currentScreen === 'notifications'}
          onPress={() => navigate('notifications')}
        />
        <TabButton
          iconName="user"
          label="Profile"
          active={currentScreen === 'profile'}
          onPress={() => navigate('profile')}
        />
      </nav>

      <style>{`
        .mobile-app {
          width: 100vw;
          max-width: 100vw;
          height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--mobile-bg);
          padding-top: env(safe-area-inset-top);
          overflow: hidden;
        }

        .mobile-app.light {
          --mobile-bg: #f5f5f5;
          --mobile-card: #ffffff;
          --mobile-text: #000000;
          --mobile-text-secondary: #666666;
          --mobile-border: #e0e0e0;
          --mobile-accent: #b8960c;
        }

        .mobile-app.dark {
          --mobile-bg: #1a1612;
          --mobile-card: #2a2622;
          --mobile-text: #ffffff;
          --mobile-text-secondary: #a8a096;
          --mobile-border: #3a3632;
          --mobile-accent: #b8960c;
        }

        .mobile-screen {
          flex: 1;
          width: 100%;
          max-width: 100vw;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 20px;
        }

        .mobile-tabs {
          display: flex;
          background: var(--mobile-card);
          border-top: 1px solid var(--mobile-border);
          padding-bottom: env(safe-area-inset-bottom);
          box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
        }

        .mobile-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          gap: 16px;
        }

        .mobile-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--mobile-border);
          border-top-color: var(--mobile-accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Disable text selection (native feel) */
        .mobile-app {
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
        }

        /* Enable text selection in specific areas */
        .mobile-app input,
        .mobile-app textarea,
        .mobile-app .selectable {
          -webkit-user-select: text;
          user-select: text;
        }

        /* Remove tap highlight */
        .mobile-app * {
          -webkit-tap-highlight-color: transparent;
        }

        /* Smooth momentum scrolling */
        .mobile-screen {
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-y: contain;
          overscroll-behavior-x: none;
        }
      `}</style>
      </div>
    </ErrorBoundary>
  )
}

function TabButton({ iconName, label, active, onPress }) {
  const handlePress = async () => {
    await Haptics.impact({ style: ImpactStyle.Light })
    onPress()
  }

  return (
    <button
      className={`mobile-tab-btn ${active ? 'active' : ''}`}
      onClick={handlePress}
    >
      <Icon name={iconName} size={22} strokeWidth={active ? 2.5 : 2} />
      <span className="mobile-tab-label">{label}</span>

      <style>{`
        .mobile-tab-btn {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 8px 0;
          border: none;
          background: none;
          color: #86868b;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .mobile-tab-btn:active {
          transform: scale(0.95);
        }

        .mobile-tab-btn.active {
          color: #0066cc;
        }

        .mobile-tab-label {
          font-size: 11px;
          font-weight: 500;
        }

        .mobile-tab-btn.active .mobile-tab-label {
          font-weight: 600;
        }
      `}</style>
    </button>
  )
}
