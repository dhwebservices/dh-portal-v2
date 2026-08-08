import { Capacitor } from '@capacitor/core'
import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth'

function biometryTypeName(type) {
  switch (type) {
    case BiometryType.faceId: return 'faceId'
    case BiometryType.touchId: return 'touchId'
    case BiometryType.fingerprintAuthentication: return 'fingerprint'
    case BiometryType.faceAuthentication: return 'face'
    case BiometryType.irisAuthentication: return 'iris'
    default: return null
  }
}

export async function isBiometricAvailable() {
  if (!Capacitor.isNativePlatform()) {
    return { available: false, reason: 'Biometric auth only available in native mobile app' }
  }

  try {
    const result = await BiometricAuth.checkBiometry()
    return {
      available: result.isAvailable,
      biometryType: biometryTypeName(result.biometryType),
      reason: result.reason || null,
    }
  } catch (error) {
    return { available: false, reason: error.message }
  }
}

export async function authenticateWithBiometric(reason = 'Please authenticate to continue') {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Biometric authentication only available in native mobile app')
  }

  await BiometricAuth.authenticate({
    reason,
    cancelTitle: 'Cancel',
    allowDeviceCredential: true,
    iosFallbackTitle: 'Enter Passcode',
  })

  return { success: true }
}

export async function biometricLogin() {
  return authenticateWithBiometric('Sign in to DH Staff Portal')
}
