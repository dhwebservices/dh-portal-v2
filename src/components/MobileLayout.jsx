import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import MobileBottomNav from './MobileBottomNav'

export default function MobileLayout({ children, user, can }) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Detect if running on native mobile
    setIsMobile(Capacitor.isNativePlatform())

    // Configure status bar for mobile
    if (Capacitor.isNativePlatform()) {
      configureStatusBar()
    }
  }, [])

  const configureStatusBar = async () => {
    try {
      // Set status bar style based on theme
      const isDark = document.documentElement.classList.contains('dark')

      await StatusBar.setStyle({
        style: isDark ? Style.Dark : Style.Light,
      })

      // iOS: Make status bar background match app
      await StatusBar.setBackgroundColor({
        color: '#1a1612', // Your app's background color
      })

      // Show status bar (don't overlay content)
      await StatusBar.show()
    } catch (error) {
      console.log('Status bar configuration not available:', error)
    }
  }

  // Listen for theme changes
  useEffect(() => {
    if (!isMobile) return

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          configureStatusBar()
        }
      })
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [isMobile])

  if (!isMobile) {
    // Desktop: render children as-is (with sidebar)
    return children
  }

  // Mobile: wrap with bottom nav and mobile-specific styles
  return (
    <>
      <div className="mobile-layout">
        <div className="mobile-content">
          {children}
        </div>
        <MobileBottomNav user={user} can={can} />
      </div>

      <style>{`
        /* Mobile Layout Styles */
        .mobile-layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          padding-top: env(safe-area-inset-top);
        }

        .mobile-content {
          flex: 1;
          padding-bottom: calc(70px + env(safe-area-inset-bottom));
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        /* Hide desktop sidebar on mobile */
        .mobile-layout .sidebar {
          display: none !important;
        }

        /* Hide desktop header on mobile (if you have one) */
        .mobile-layout .desktop-header {
          display: none !important;
        }

        /* Full-width content on mobile */
        .mobile-layout .main-content {
          margin-left: 0 !important;
          width: 100% !important;
        }

        /* Mobile-specific padding */
        .mobile-layout .page-container {
          padding: 16px;
        }

        /* Mobile-friendly cards */
        .mobile-layout .card {
          border-radius: 12px;
          margin-bottom: 16px;
        }

        /* Mobile-friendly buttons */
        .mobile-layout .btn {
          min-height: 44px; /* Apple's recommended touch target */
          font-size: 16px;
          border-radius: 10px;
        }

        /* Mobile-friendly inputs */
        .mobile-layout .inp,
        .mobile-layout input,
        .mobile-layout textarea,
        .mobile-layout select {
          min-height: 44px;
          font-size: 16px; /* Prevent iOS zoom on focus */
          border-radius: 10px;
        }

        /* Mobile tables - make scrollable */
        .mobile-layout table {
          display: block;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          white-space: nowrap;
        }

        /* Prevent text selection on mobile (better UX) */
        .mobile-layout {
          -webkit-user-select: none;
          user-select: none;
        }

        /* Allow text selection in inputs and content areas */
        .mobile-layout input,
        .mobile-layout textarea,
        .mobile-layout .selectable,
        .mobile-layout p,
        .mobile-layout span {
          -webkit-user-select: text;
          user-select: text;
        }

        /* Safe area padding for notched devices */
        @supports (padding: max(0px)) {
          .mobile-layout {
            padding-left: max(0px, env(safe-area-inset-left));
            padding-right: max(0px, env(safe-area-inset-right));
          }
        }

        /* Pull-to-refresh indicator space */
        .mobile-content {
          overscroll-behavior-y: contain;
        }

        /* Smooth scrolling */
        .mobile-content {
          scroll-behavior: smooth;
        }

        /* Remove hover states on mobile */
        @media (hover: none) {
          .mobile-layout *:hover {
            background: inherit !important;
          }
        }
      `}</style>
    </>
  )
}
