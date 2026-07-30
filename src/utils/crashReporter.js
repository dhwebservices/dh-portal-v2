import { Capacitor } from '@capacitor/core'

// Crash and error reporting
export function initCrashReporter(userEmail = '') {
  if (!Capacitor.isNativePlatform()) return

  // Global error handler
  window.addEventListener('error', (event) => {
    reportCrash({
      type: 'error',
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
      userEmail,
    })
  })

  // Unhandled promise rejection
  window.addEventListener('unhandledrejection', (event) => {
    reportCrash({
      type: 'unhandledRejection',
      message: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
      userEmail,
    })
  })

  // React error boundary fallback
  window.addEventListener('react-error', (event) => {
    reportCrash({
      type: 'reactError',
      message: event.detail?.message,
      stack: event.detail?.stack,
      componentStack: event.detail?.componentStack,
      userEmail,
    })
  })
}

async function reportCrash(error) {
  try {
    const crashReport = {
      ...error,
      timestamp: new Date().toISOString(),
      platform: Capacitor.getPlatform(),
      appVersion: '1.0.0',
      userAgent: navigator.userAgent,
      url: window.location.href,
    }

    // Show crash dialog to user
    showCrashDialog(crashReport)

    // Log to console
    console.error('Crash detected:', crashReport)

    // Send to server (email to david@dhwebsiteservices.co.uk)
    await fetch('https://staff.dhwebsiteservices.co.uk/api/crash-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(crashReport),
    })

  } catch (err) {
    console.error('Failed to report crash:', err)
  }
}

function showCrashDialog(crashReport) {
  const existing = document.getElementById('crash-dialog')
  if (existing) existing.remove()

  const dialog = document.createElement('div')
  dialog.id = 'crash-dialog'
  dialog.innerHTML = `
    <div class="crash-overlay">
      <div class="crash-dialog">
        <div class="crash-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="2" width="32" height="32">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h3>App Error Detected</h3>
        </div>
        <p>The app encountered an unexpected error. Would you like to report this to our tech support team?</p>
        <div class="crash-buttons">
          <button class="crash-btn crash-btn-secondary" onclick="document.getElementById('crash-dialog').remove()">
            Dismiss
          </button>
          <button class="crash-btn crash-btn-primary" onclick="window.reportCrashToSupport()">
            Report Issue
          </button>
        </div>
        <div class="crash-support">
          <div style="font-size: 12px; color: #86868b; margin-top: 16px; padding-top: 16px; border-top: 1px solid #d2d2d7;">
            <strong>Tech Support:</strong><br/>
            david@dhwebsiteservices.co.uk<br/>
            07364166285 or 02920024218 (opt 5)
          </div>
        </div>
      </div>
    </div>
    <style>
      .crash-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        padding: 20px;
      }

      .crash-dialog {
        background: white;
        border-radius: 16px;
        padding: 24px;
        max-width: 360px;
        width: 100%;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      }

      .crash-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }

      .crash-header h3 {
        font-size: 18px;
        font-weight: 700;
        color: #1a1a1a;
        margin: 0;
      }

      .crash-dialog p {
        font-size: 15px;
        color: #666;
        line-height: 1.5;
        margin: 0 0 20px 0;
      }

      .crash-buttons {
        display: flex;
        gap: 12px;
      }

      .crash-btn {
        flex: 1;
        height: 44px;
        border-radius: 10px;
        border: none;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
      }

      .crash-btn-primary {
        background: #ff3b30;
        color: white;
      }

      .crash-btn-secondary {
        background: #f5f5f7;
        color: #1a1a1a;
      }

      .crash-support {
        text-align: center;
      }
    </style>
  `

  document.body.appendChild(dialog)

  // Global function to report crash
  window.reportCrashToSupport = () => {
    dialog.remove()
    sendCrashEmail(crashReport)
    alert('Thank you! The error has been reported to our support team.')
  }
}

async function sendCrashEmail(crashReport) {
  try {
    await fetch('https://staff.dhwebsiteservices.co.uk/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'custom',
        to: ['david@dhwebsiteservices.co.uk'],
        subject: `🐛 App Crash Report - ${crashReport.type}`,
        html: `
          <h2>App Crash Report</h2>
          <p><strong>Time:</strong> ${crashReport.timestamp}</p>
          <p><strong>User:</strong> ${crashReport.userEmail || 'Not logged in'}</p>
          <p><strong>Platform:</strong> ${crashReport.platform}</p>
          <p><strong>Type:</strong> ${crashReport.type}</p>
          <p><strong>Message:</strong> ${crashReport.message}</p>
          <h3>Stack Trace:</h3>
          <pre>${crashReport.stack || 'No stack trace'}</pre>
          <h3>Details:</h3>
          <pre>${JSON.stringify(crashReport, null, 2)}</pre>
        `,
      }),
    })
  } catch (err) {
    console.error('Failed to send crash email:', err)
  }
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
