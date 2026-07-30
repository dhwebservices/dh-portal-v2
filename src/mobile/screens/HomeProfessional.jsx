import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import MobileCard from '../components/MobileCard'
import Icon from '../components/Icon'
import { getTodayAttendance } from '../../utils/gpsClockIn'
import { getLeaveBalance } from '../../utils/leaveBalance'

export default function MobileHomeProfessional({ navigate, user, isAdmin }) {
  const [attendance, setAttendance] = useState(null)
  const [leaveBalance, setLeaveBalance] = useState(null)
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    loadData()
    setGreetingMessage()
  }, [])

  const loadData = async () => {
    try {
      const todayAttendance = await getTodayAttendance(user.email)
      setAttendance(todayAttendance)

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
    <div className="professional-home">
      {/* Header */}
      <div className="professional-home-header">
        <div className="professional-home-greeting">
          <h1>{greeting}</h1>
          <p>{user.name}</p>
        </div>
        <button className="professional-avatar" onClick={() => navigate('profile')}>
          <Icon name="user" size={20} color="white" />
        </button>
      </div>

      {/* Clock In Card */}
      <div className="professional-section">
        <MobileCard onPress={handleClockInPress} highlight={!isClockedIn}>
          <div className="professional-clock-status">
            <div className="professional-clock-icon">
              <Icon name={isClockedIn ? 'pause' : 'play'} size={28} color="#0066cc" />
            </div>
            <div className="professional-clock-info">
              <h3>{isClockedIn ? 'Clocked In' : 'Clock In'}</h3>
              {isClockedIn && attendance.clock_in ? (
                <p className="professional-clock-time">
                  Since {new Date(attendance.clock_in).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              ) : (
                <p>Tap to start your shift</p>
              )}
            </div>
            <Icon name="chevronRight" size={20} color="#86868b" />
          </div>
        </MobileCard>
      </div>

      {/* Quick Stats */}
      <div className="professional-section">
        <h2 className="professional-section-title">Quick Access</h2>
        <div className="professional-stats-grid">
          {isAdmin && (
            <MobileCard small onPress={() => navigate('staff-directory')}>
              <div className="professional-stat">
                <Icon name="users" size={24} color="#0066cc" />
                <div>
                  <h4>Staff Directory</h4>
                  <p>Manage all staff</p>
                </div>
              </div>
            </MobileCard>
          )}

          <MobileCard small onPress={() => navigate('leave')}>
            <div className="professional-stat">
              <Icon name="calendar" size={24} color="#34c759" />
              <div>
                <h4>Leave Balance</h4>
                <p>{leaveBalance?.annual_remaining || '–'} days remaining</p>
              </div>
            </div>
          </MobileCard>

          <MobileCard small onPress={() => navigate('payslips')}>
            <div className="professional-stat">
              <Icon name="file" size={24} color="#5856d6" />
              <div>
                <h4>Payslips</h4>
                <p>View latest</p>
              </div>
            </div>
          </MobileCard>

          <MobileCard small onPress={() => navigate('attendance')}>
            <div className="professional-stat">
              <Icon name="barChart" size={24} color="#ff3b30" />
              <div>
                <h4>Attendance</h4>
                <p>This month's report</p>
              </div>
            </div>
          </MobileCard>

          <MobileCard small onPress={() => navigate('outreach')}>
            <div className="professional-stat">
              <Icon name="briefcase" size={24} color="#5856d6" />
              <div>
                <h4>Outreach</h4>
                <p>Client contacts</p>
              </div>
            </div>
          </MobileCard>

          <MobileCard small onPress={() => navigate('timesheet')}>
            <div className="professional-stat">
              <Icon name="calendar" size={24} color="#ff9500" />
              <div>
                <h4>My Schedule</h4>
                <p>Plan work hours</p>
              </div>
            </div>
          </MobileCard>
        </div>
      </div>

      <style>{`
        .professional-home {
          background: #f5f5f7;
          min-height: 100vh;
          padding-bottom: 100px;
        }

        .professional-home-header {
          background: white;
          padding: 60px 20px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #d2d2d7;
        }

        .professional-home-greeting h1 {
          font-size: 28px;
          font-weight: 700;
          color: #1a1a1a;
          margin: 0 0 4px 0;
          letter-spacing: -0.5px;
        }

        .professional-home-greeting p {
          font-size: 16px;
          color: #86868b;
          margin: 0;
        }

        .professional-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #0066cc;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .professional-section {
          padding: 20px;
        }

        .professional-section-title {
          font-size: 20px;
          font-weight: 700;
          color: #1a1a1a;
          margin: 0 0 16px 0;
          letter-spacing: -0.3px;
        }

        .professional-clock-status {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .professional-clock-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: #e3f2fd;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .professional-clock-info {
          flex: 1;
        }

        .professional-clock-info h3 {
          font-size: 17px;
          font-weight: 600;
          color: #1a1a1a;
          margin: 0 0 4px 0;
        }

        .professional-clock-info p {
          font-size: 14px;
          color: #86868b;
          margin: 0;
        }

        .professional-clock-time {
          font-weight: 600 !important;
          color: #0066cc !important;
        }

        .professional-stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .professional-stat {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .professional-stat h4 {
          font-size: 15px;
          font-weight: 600;
          color: #1a1a1a;
          margin: 0 0 4px 0;
        }

        .professional-stat p {
          font-size: 13px;
          color: #86868b;
          margin: 0;
        }

        /* Safe area support */
        @supports (padding: max(0px)) {
          .professional-home-header {
            padding-top: max(60px, env(safe-area-inset-top));
          }
        }
      `}</style>
    </div>
  )
}
