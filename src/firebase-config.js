import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'
import { Capacitor } from '@capacitor/core'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'YOUR_SENDER_ID',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'YOUR_APP_ID'
}

const app = initializeApp(firebaseConfig)

// Only initialize messaging on web/native platforms that support it
let messaging = null
try {
  if (Capacitor.isNativePlatform() || typeof window !== 'undefined') {
    messaging = getMessaging(app)
  }
} catch (error) {
  console.log('Messaging not available:', error)
}

export { app, messaging }

// Listen for foreground messages
if (messaging) {
  onMessage(messaging, (payload) => {
    console.log('Foreground message received:', payload)

    // Show notification even when app is open
    if (payload.notification) {
      const notification = new Notification(payload.notification.title, {
        body: payload.notification.body,
        icon: '/icon-192.png',
        badge: '/badge-72.png',
      })

      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    }
  })
}
