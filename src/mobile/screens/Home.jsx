import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import MobileCard from '../components/MobileCard'
import MobileButton from '../components/MobileButton'
import { getTodayAttendance } from '../../utils/gpsClockIn'
import { getLeaveBalance } from '../../utils/leaveBalance'

export default function MobileHome({ navigate, user, isAdmin }) {
  const [attendance, setAttendance] = useState(null)
  const [leaveBalance, setLeaveBalance] = useState(null)
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    loadData()
    setGreetingMessage()
  }, [])

  const loadData = async () => {
    try {
      // Load today's attendance
      const todayAttendance = await getTodayAttendance(user.email)
      setAttendance(todayAttendance)

      // Load leave balance
      const balance = await getLeaveBalance(user.email)
      setLeaveBalance(balance)
    } catch (error) {
      console.error('Failed to load data:', error)
    }
  }

  const setGreetingMessage = () => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 18) setGreeting('Good afternoon')
    else setGreeting('Good evening')
  }

  const handleClockInPress = async () => {
    await Haptics.impact({ style: ImpactStyle.Medium })
    navigate('clockin')
  }

  const isClockedIn = attendance && attendance.clock_in && !attendance.clock_out

  return (
    <div className="mobile-home">
      {/* Header */}
      <div className="mobile-home-header">
        <div>
          <h1>{greeting}</h1>
          <p>{user.name}</p>
        </div>
        <button className="mobile-avatar" onClick={() => navigate('profile')}>
          {user.name?.charAt(0)}
        </button>
      </div>

      {/* Quick Actions */}
      <div className="mobile-quick-actions">
        <MobileCard onPress={handleClockInPress} highlight={!isClockedIn}>
          <div className="mobile-clock-status">
            <span className="mobile-clock-icon">
              {isClockedIn ? '⏸️' : '▶️'}
            </span>
            <div>
              <h3>{isClockedIn ? 'Clocked In' : 'Clock In'}</h3>
              {isClockedIn && attendance.clock_in && (
                <p className="mobile-clock-time">
                  Since {new Date(attendance.clock_in).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              )}
              {!isClockedIn && <p>Tap to start your shift</p>}
            </div>
          </div>
        </MobileCard>
      </div>

      {/* Stats Grid */}
      <div className="mobile-stats-grid">
        {isAdmin && (
          <MobileCard small onPress={() => navigate('staff-directory')}>
            <div className="mobile-stat">
              <span className="mobile-stat-icon">👥</span>
              <div>
                <h4>Staff Directory</h4>
                <p className="mobile-stat-value">Manage all</p>
              </div>
            </div>
          </MobileCard>
        )}

        <MobileCard small onPress={() => navigate('leave')}>
          <div className="mobile-stat">
            <span className="mobile-stat-icon">🏖️</span>
            <div>
              <h4>Leave Balance</h4>
              <p className="mobile-stat-value">
                {leaveBalance?.annual || '–'} days
              </p>
            </div>
          </div>
        </MobileCard>

        <MobileCard small onPress={() => navigate('tasks')}>
          <div className="mobile-stat">
            <span className="mobile-stat-icon">✓</span>
            <div>
              <h4>My Tasks</h4>
              <p className="mobile-stat-value">3 open</p>
            </div>
          </div>
        </MobileCard>

        <MobileCard small onPress={() => navigate('payslips')}>
          <div className="mobile-stat">
            <span className="mobile-stat-icon">💰</span>
            <div>
              <h4>Payslips</h4>
              <p className="mobile-stat-value">View latest</p>
            </div>
          </div>
        </MobileCard>

        <MobileCard small onPress={() => navigate('attendance')}>
          <div className="mobile-stat">
            <span className="mobile-stat-icon">📊</span>
            <div>
              <h4>Attendance</h4>
              <p className="mobile-stat-value">This month</p>
            </div>
          </div>
        </MobileCard>
      </div>

      {/* Recent Activity */}
      <div className="mobile-section">
        <h2>Recent Activity</h2>
        <MobileCard>
          <div className="mobile-activity-empty">
            <p>No recent activity</p>
          </div>
        </MobileCard>
      </div>

      <style>{`
        .mobile-home {
          padding: 20px;
        }

        .mobile-home-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
        }

        .mobile-home-header h1 {
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 4px 0;
          color: var(--mobile-text);
        }

        .mobile-home-header p {
          font-size: 16px;
          color: var(--mobile-text-secondary);
          margin: 0;
        }

        .mobile-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: var(--mobile-accent);
          color: white;
          font-size: 20px;
          font-weight: 600;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mobile-quick-actions {
          margin-bottom: 24px;
        }

        .mobile-clock-status {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .mobile-clock-icon {
          font-size: 40px;
        }

        .mobile-clock-status h3 {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 4px 0;
          color: var(--mobile-text);
        }

        .mobile-clock-status p {
          font-size: 14px;
          color: var(--mobile-text-secondary);
          margin: 0;
        }

        .mobile-clock-time {
          font-weight: 600;
          color: var(--mobile-accent) !important;
        }

        .mobile-stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }

        .mobile-stat {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .mobile-stat-icon {
          font-size: 32px;
        }

        .mobile-stat h4 {
          font-size: 13px;
          font-weight: 500;
          color: var(--mobile-text-secondary);
          margin: 0 0 4px 0;
        }

        .mobile-stat-value {
          font-size: 18px;
          font-weight: 700;
          color: var(--mobile-text);
          margin: 0;
        }

        .mobile-section {
          margin-bottom: 24px;
        }

        .mobile-section h2 {
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 12px 0;
          color: var(--mobile-text);
        }

        .mobile-activity-empty {
          text-align: center;
          padding: 20px;
          color: var(--mobile-text-secondary);
        }
      `}</style>
    </div>
  )
}
