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

    // Register with FCM
    await PushNotifications.register()

    // Listen for registration success
    await PushNotifications.addListener('registration', async (token) => {
      console.log('Push registration success, token:', token.value)
      await registerDeviceToken(userEmail, token.value)
    })

    // Listen for registration errors
    await PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error)
    })

    // Listen for push notifications received
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received:', notification)
      // Notification shown automatically by OS
    })

    // Listen for notification tapped
    await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('Push notification tapped:', notification)
      handleNotificationTap(notification)
    })

    return { supported: true, permitted: true, registered: true }

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

function handleNotificationTap(notification) {
  const data = notification.notification.data

  if (!data || !data.click_action) {
    return
  }

  // Mark notification as clicked in database
  if (data.leave_request_id) {
    markNotificationClicked(data.leave_request_id, data.type)
  }

  // Navigate to the appropriate page
  // This will be handled by the router in App.jsx
  window.location.href = data.click_action
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
    .order('last_active', { ascending: false })

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
