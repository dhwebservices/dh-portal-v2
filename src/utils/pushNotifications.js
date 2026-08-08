import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

// Initialize push notifications for mobile
export async function initPushNotifications(userEmail) {
  // Only run on mobile platforms
  if (!Capacitor.isNativePlatform()) {
    console.log('Push notifications only available on mobile')
    return { supported: false }
  }

  try {
    // Request permission
    let permStatus = await PushNotifications.checkPermissions()

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions()
    }

    if (permStatus.receive !== 'granted') {
      console.log('Push notification permission denied')
      return { supported: true, permitted: false }
    }

    // Attach listeners BEFORE calling register() - the native side can fire
    // the 'registration' event as soon as it has a token, and if register()
    // resolves/fires before these listeners are attached, the event (and
    // with it, the only chance to ever save this device's token) is lost.
    // This was the actual reason no device had ever completed registration.
    const registrationDone = new Promise((resolve) => {
      PushNotifications.addListener('registration', async (token) => {
        console.log('Push registration success, token:', token.value)
        await registerDeviceToken(userEmail, token.value)
        resolve({ success: true })
      })

      PushNotifications.addListener('registrationError', (error) => {
        console.error('Push registration error:', error)
        resolve({ success: false, error })
      })
    })

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received:', notification)
      // Notification shown automatically by OS
    })

    await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('Push notification tapped:', notification)
      handleNotificationTap(notification)
    })

    await PushNotifications.register()

    const result = await registrationDone

    return { supported: true, permitted: true, registered: result.success, error: result.error }

  } catch (error) {
    console.error('Push notification init error:', error)
    return { supported: true, error: error.message }
  }
}

async function registerDeviceToken(userEmail, fcmToken) {
  try {
    const platform = Capacitor.getPlatform() // 'ios' or 'android'
    const deviceInfo = await getDeviceInfo()

    const { error } = await supabase
      .from('user_devices')
      .upsert({
        user_email: userEmail,
        device_type: platform,
        fcm_token: fcmToken,
        device_name: deviceInfo.name,
        device_model: deviceInfo.model,
        os_version: deviceInfo.osVersion,
        app_version: deviceInfo.appVersion,
      }, {
        onConflict: 'user_email,fcm_token'
      })

    if (error) {
      console.error('Failed to register device token:', error)
    } else {
      console.log('Device token registered successfully')
    }

  } catch (error) {
    console.error('Device registration error:', error)
  }
}

async function getDeviceInfo() {
  try {
    const { Device } = await import('@capacitor/device')
    const info = await Device.getInfo()

    return {
      name: info.name || 'Unknown',
      model: info.model || 'Unknown',
      osVersion: info.osVersion || 'Unknown',
      appVersion: '1.0.0', // TODO: Get from package.json or Capacitor config
    }
  } catch (error) {
    return {
      name: 'Unknown',
      model: 'Unknown',
      osVersion: 'Unknown',
      appVersion: '1.0.0',
    }
  }
}

const NOTIFICATION_TYPE_TO_SCREEN = {
  leave_request: 'leave',
  leave_approved: 'leave',
  leave_rejected: 'leave',
  onboarding_submitted: 'onboarding-review',
  onboarding_approved: 'home',
  onboarding_rejected: 'home',
}

const PENDING_NAV_KEY = 'dh-pending-push-nav'

function handleNotificationTap(notification) {
  const data = notification.notification.data

  if (!data) return

  // Mark notification as clicked in database
  if (data.leave_request_id) {
    markNotificationClicked(data.leave_request_id, data.type)
  }

  // The app runs from bundled local assets (no Capacitor "server" config),
  // so setting window.location.href to a live https:// URL would navigate
  // the native WebView away from the app entirely and load the public
  // website instead of routing within MobileApp's own screen state. Queue
  // the target screen instead - MobileApp picks this up on launch/resume
  // and calls its own navigate().
  const screen = NOTIFICATION_TYPE_TO_SCREEN[data.type]
  if (screen) {
    try {
      localStorage.setItem(PENDING_NAV_KEY, JSON.stringify({ screen, at: Date.now() }))
    } catch (_) {}
  }
}

export function consumePendingPushNavigation() {
  try {
    const raw = localStorage.getItem(PENDING_NAV_KEY)
    if (!raw) return null
    localStorage.removeItem(PENDING_NAV_KEY)
    const parsed = JSON.parse(raw)
    // Ignore stale entries (e.g. app relaunched days later for unrelated reasons)
    if (Date.now() - parsed.at > 24 * 60 * 60 * 1000) return null
    return parsed.screen
  } catch (_) {
    return null
  }
}

async function markNotificationClicked(leaveRequestId, notificationType) {
  try {
    await supabase
      .from('push_notifications')
      .update({ clicked: true })
      .match({
        notification_type: notificationType,
        data: { leave_request_id: leaveRequestId }
      })
  } catch (error) {
    console.error('Failed to mark notification as clicked:', error)
  }
}

// Unregister device token on logout
export async function unregisterPushNotifications(userEmail, fcmToken) {
  if (!Capacitor.isNativePlatform()) {
    return
  }

  try {
    await supabase
      .from('user_devices')
      .delete()
      .match({
        user_email: userEmail,
        fcm_token: fcmToken
      })

    await PushNotifications.removeAllListeners()
    console.log('Device unregistered successfully')

  } catch (error) {
    console.error('Failed to unregister device:', error)
  }
}

// Get user's registered devices
export async function getUserDevices(userEmail) {
  const { data, error } = await supabase
    .from('user_devices')
    .select('*')
    .eq('user_email', userEmail)
    .order('last_active_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch user devices:', error)
    return []
  }

  return data
}

// Remove a specific device
export async function removeDevice(deviceId) {
  const { error } = await supabase
    .from('user_devices')
    .delete()
    .eq('id', deviceId)

  if (error) {
    throw error
  }
}
