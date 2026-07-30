import { Capacitor } from '@capacitor/core'

// Simplified biometric auth for web - mobile features disabled for now
export async function isBiometricAvailable() {
  // For web, biometrics not available
  return { available: false, reason: 'Biometric auth only available in native mobile app' }
}

export async function authenticateWithBiometric(reason = 'Please authenticate to continue') {
  throw new Error('Biometric authentication only available in native mobile app')
}

export async function saveCredentials(username, password) {
  return { success: false, reason: 'Web platform' }
}

export async function getCredentials() {
  return null
}

export async function deleteCredentials() {
  return { success: false }
}

export async function biometricLogin() {
  throw new Error('Biometric login only available in native mobile app')
}

export async function enableBiometricLogin(username, password) {
  throw new Error('Biometric authentication not available on this device')
}
