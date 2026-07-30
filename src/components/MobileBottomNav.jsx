import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Capacitor } from '@capacitor/core'
import {
  Home,
  Users,
  Calendar,
  MessageSquare,
  Settings,
  MoreHorizontal,
  Clock,
  FileText,
  BarChart3,
  Briefcase,
  CheckSquare,
  Bell,
  User,
} from 'lucide-react'

export default function MobileBottomNav({ user, can }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [showMore, setShowMore] = useState(false)

  const hapticFeedback = async () => {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Light })
    }
  }

  const handleTabPress = (path) => {
    hapticFeedback()
    navigate(path)
    setShowMore(false)
  }

  const handleMorePress = () => {
    hapticFeedback()
    setShowMore(!showMore)
  }

  const isActive = (path) => location.pathname === path

  // Main bottom tabs (max 5 items for mobile best practice)
  const mainTabs = [
    { id: 'home', icon: Home, label: 'Home', path: '/home' },
    { id: 'team', icon: Users, label: 'Team', path: '/my-team', show: can('manager') },
    { id: 'tasks', icon: CheckSquare, label: 'Tasks', path: '/my-tasks' },
    { id: 'profile', icon: User, label: 'Profile', path: '/my-profile' },
    { id: 'more', icon: MoreHorizontal, label: 'More', path: null },
  ]

  // More menu items
  const moreItems = [
    { icon: Calendar, label: 'Schedule', path: '/schedule' },
    { icon: Clock, label: 'Attendance', path: '/attendance' },
    { icon: FileText, label: 'Documents', path: '/hr-documents' },
    { icon: Briefcase, label: 'Clients', path: '/clients', show: can('clientmgmt') },
    { icon: BarChart3, label: 'Dashboard', path: '/dashboard', show: can('dashboard') },
    { icon: MessageSquare, label: 'Support', path: '/support' },
    { icon: Bell, label: 'Notifications', path: '/notifications' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ]

  return (
    <>
      {/* More Menu Overlay */}
      {showMore && (
        <div
          className="mobile-more-overlay"
          onClick={() => setShowMore(false)}
        >
          <div
            className="mobile-more-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-more-header">
              <h3>More</h3>
              <button
                className="mobile-more-close"
                onClick={() => setShowMore(false)}
              >
                ✕
              </button>
            </div>
            <div className="mobile-more-grid">
              {moreItems
                .filter(item => item.show !== false)
                .map(item => (
                  <button
                    key={item.path}
                    className={`mobile-more-item ${isActive(item.path) ? 'active' : ''}`}
                    onClick={() => handleTabPress(item.path)}
                  >
                    <item.icon size={24} />
                    <span>{item.label}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Tab Bar */}
      <nav className="mobile-bottom-nav">
        {mainTabs
          .filter(tab => tab.show !== false)
          .map(tab => {
            const Icon = tab.icon
            const active = tab.path ? isActive(tab.path) : false

            return (
              <button
                key={tab.id}
                className={`mobile-tab ${active ? 'active' : ''}`}
                onClick={tab.path ? () => handleTabPress(tab.path) : handleMorePress}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                <span>{tab.label}</span>
              </button>
            )
          })}
      </nav>

      <style>{`
        .mobile-bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 70px;
          background: var(--bg);
          border-top: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-around;
          padding-bottom: env(safe-area-inset-bottom);
          z-index: 1000;
          box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
        }

        @supports (backdrop-filter: blur(10px)) {
          .mobile-bottom-nav {
            background: rgba(var(--bg-rgb), 0.9);
            backdrop-filter: blur(10px);
          }
        }

        .mobile-tab {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          flex: 1;
          height: 100%;
          border: none;
          background: none;
          color: var(--sub);
          cursor: pointer;
          transition: all 0.2s ease;
          -webkit-tap-highlight-color: transparent;
        }

        .mobile-tab:active {
          transform: scale(0.95);
        }

        .mobile-tab span {
          font-size: 11px;
          font-weight: 500;
        }

        .mobile-tab.active {
          color: var(--accent);
        }

        .mobile-tab.active span {
          font-weight: 600;
        }

        /* More Menu Overlay */
        .mobile-more-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          z-index: 2000;
          display: flex;
          align-items: flex-end;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .mobile-more-menu {
          width: 100%;
          background: var(--bg);
          border-radius: 20px 20px 0 0;
          padding: 20px;
          padding-bottom: calc(20px + env(safe-area-inset-bottom));
          max-height: 70vh;
          overflow-y: auto;
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        .mobile-more-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }

        .mobile-more-header h3 {
          font-size: 20px;
          font-weight: 700;
          margin: 0;
        }

        .mobile-more-close {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: none;
          background: var(--bg-secondary);
          color: var(--text);
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mobile-more-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .mobile-more-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--bg-secondary);
          color: var(--text);
          cursor: pointer;
          transition: all 0.2s ease;
          -webkit-tap-highlight-color: transparent;
        }

        .mobile-more-item:active {
          transform: scale(0.95);
          background: var(--bg-tertiary);
        }

        .mobile-more-item.active {
          background: var(--accent-soft);
          border-color: var(--accent);
          color: var(--accent);
        }

        .mobile-more-item span {
          font-size: 13px;
          font-weight: 500;
          text-align: center;
        }

        /* Hide on desktop */
        @media (min-width: 1025px) {
          .mobile-bottom-nav {
            display: none;
          }
        }
      `}</style>
    </>
  )
}
