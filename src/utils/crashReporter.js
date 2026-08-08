import { Capacitor } from '@capacitor/core'

// Crash and error reporting.
//
// This deliberately does NOT show an interrupting full-screen dialog for
// every caught error and does NOT call a server endpoint - there is no
// /api/crash-report Cloudflare Function in this project, so every previous
// invocation silently failed its fetch anyway. Worse, `window.addEventListener
// ('error', ...)` fires for far more than uncaught app exceptions: WKWebView
// resource-load failures, benign cross-origin script errors, etc. Combined,
// the old implementation meant a completely harmless, invisible error could
// pop an intrusive "App Error Detected" dialog in front of the user with no
// way to actually reach support (the fetch beneath the Report button was
// broken too). That's a real stability/quality problem for App Store review
// (Guideline 2.1) as well as for real users. Actual fatal render-tree
// crashes are already handled correctly by ErrorBoundary's in-app fallback
// screen - this module now just logs for Xcode console visibility during
// development and testing.
export function initCrashReporter(userEmail = '') {
  if (!Capacitor.isNativePlatform()) return

  window.addEventListener('error', (event) => {
    logCrash({
      type: 'error',
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
      userEmail,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    logCrash({
      type: 'unhandledRejection',
      message: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
      userEmail,
    })
  })

  window.addEventListener('react-error', (event) => {
    logCrash({
      type: 'reactError',
      message: event.detail?.message,
      stack: event.detail?.stack,
      componentStack: event.detail?.componentStack,
      userEmail,
    })
  })
}

function logCrash(error) {
  console.error('[DH Staff Portal] Unhandled error:', {
    ...error,
    timestamp: new Date().toISOString(),
    platform: Capacitor.getPlatform(),
  })
}

// Detect app freeze (no activity for 10+ seconds)
let lastActivity = Date.now()

export function trackActivity() {
  lastActivity = Date.now()
}

setInterval(() => {
  const timeSinceActivity = Date.now() - lastActivity

  if (timeSinceActivity > 10000) {
    // App might be frozen
    console.warn('App appears frozen - no activity for 10+ seconds')
  }
}, 5000)

// Track user interactions
if (typeof window !== 'undefined') {
  ['click', 'touchstart', 'scroll', 'keypress'].forEach(event => {
    window.addEventListener(event, trackActivity, { passive: true })
  })
}
