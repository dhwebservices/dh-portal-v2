import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Geolocation } from '@capacitor/geolocation'
import MobileButton from '../components/MobileButton'
import MobileCard from '../components/MobileCard'
import Icon from '../components/Icon'
import { clockIn, clockOut, getTodayAttendance, verifyLocationNearOffice, OFFICE_LOCATIONS } from '../../utils/gpsClockIn'

export default function MobileClockIn({ goBack, user }) {
  const [attendance, setAttendance] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [locationStatus, setLocationStatus] = useState(null)
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    loadAttendance()
    checkLocation()

    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const loadAttendance = async () => {
    try {
      const today = await getTodayAttendance(user.email)
      setAttendance(today)
    } catch (error) {
      console.error('Failed to load attendance:', error)
    }
  }

  const checkLocation = async () => {
    try {
      const permission = await Geolocation.checkPermissions()

      if (permission.location !== 'granted') {
        setLocationStatus({
          verified: false,
          needsPermission: true,
          error: 'Location permission required'
        })
        return
      }

      const location = await verifyLocationNearOffice()
      setLocationStatus(location)
    } catch (error) {
      console.log('Location check failed:', error)
      setLocationStatus({ verified: false, error: error.message })
    }
  }

  const requestLocationPermission = async () => {
    try {
      const request = await Geolocation.requestPermissions()

      if (request.location === 'granted') {
        await checkLocation()
        return true
      } else {
        setError('Location permission denied. Please enable in Settings.')
        return false
      }
    } catch (error) {
      setError('Failed to request location permission')
      return false
    }
  }

  const handleClockIn = async () => {
    setLoading(true)
    setError('')

    try {
      if (locationStatus?.needsPermission) {
        const granted = await requestLocationPermission()
        if (!granted) {
          setLoading(false)
          return
        }
      }

      await Haptics.impact({ style: ImpactStyle.Heavy })

      const result = await clockIn(user.email, user.name)

      await Haptics.notification({ type: NotificationType.Success })

      setAttendance(result)
      loadAttendance()

    } catch (error) {
      await Haptics.notification({ type: NotificationType.Error })
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleClockOut = async () => {
    setLoading(true)
    setError('')

    try {
      await Haptics.impact({ style: ImpactStyle.Heavy })

      await clockOut(attendance.attendanceId || attendance.id, user.email)

      await Haptics.notification({ type: NotificationType.Success })

      loadAttendance()

    } catch (error) {
      await Haptics.notification({ type: NotificationType.Error })
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const isClockedIn = attendance && attendance.clock_in && !attendance.clock_out

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const formatDate = (date) => {
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    })
  }

  return (
    <div className="mobile-clockin">
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          <Icon name="chevronLeft" size={24} color="#0066cc" />
        </button>
        <h1>Clock In/Out</h1>
        <div style={{ width: 40 }} />
      </div>

      <div className="mobile-time-display">
        <div className="mobile-time-large">
          {formatTime(currentTime)}
        </div>
        <div className="mobile-date">
          {formatDate(currentTime)}
        </div>
      </div>

      {locationStatus?.needsPermission && (
        <MobileCard style={{ margin: '0 20px 20px' }}>
          <div className="permission-prompt">
            <Icon name="mapPin" size={32} color="#ff9500" />
            <h3>Location Permission Required</h3>
            <p>We need your location to verify you're at the office when clocking in.</p>
            <MobileButton fullWidth onPress={requestLocationPermission}>
              Enable Location
            </MobileButton>
          </div>
        </MobileCard>
      )}

      {locationStatus && !locationStatus.needsPermission && (
        <MobileCard className="mobile-location-card">
          <div className="mobile-location-status">
            <Icon
              name={locationStatus.verified ? 'checkCircle' : 'alertTriangle'}
              size={28}
              color={locationStatus.verified ? '#34c759' : '#ff9500'}
            />
            {locationStatus.verified ? (
              <div>
                <h3>Location Verified</h3>
                <p>{locationStatus.office}</p>
                <p className="mobile-location-distance">
                  {locationStatus.distance}m from office
                </p>
              </div>
            ) : (
              <div>
                <h3>Location Not Verified</h3>
                <p>
                  You are {locationStatus.distanceToNearestOffice}m from{' '}
                  {locationStatus.nearestOffice}
                </p>
                <p className="mobile-location-help">
                  Please be within {OFFICE_LOCATIONS[0].radius}m of an office to clock in
                </p>
              </div>
            )}
          </div>
        </MobileCard>
      )}

      <div className="mobile-clock-button-container">
        {!isClockedIn ? (
          <MobileButton
            variant="success"
            fullWidth
            loading={loading}
            disabled={locationStatus && !locationStatus.verified}
            onPress={handleClockIn}
            icon={<Icon name="play" size={20} color="white" />}
          >
            Clock In
          </MobileButton>
        ) : (
          <MobileButton
            variant="danger"
            fullWidth
            loading={loading}
            onPress={handleClockOut}
            icon={<Icon name="pause" size={20} color="white" />}
          >
            Clock Out
          </MobileButton>
        )}
      </div>

      {isClockedIn && attendance && (
        <MobileCard style={{ margin: '0 20px 20px' }}>
          <div className="mobile-session-info">
            <h3>Current Session</h3>
            <div className="mobile-session-row">
              <span>Clock In</span>
              <strong>
                {new Date(attendance.clock_in).toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </strong>
            </div>
            {attendance.office_location && (
              <div className="mobile-session-row">
                <span>Location</span>
                <strong>{attendance.office_location}</strong>
              </div>
            )}
          </div>
        </MobileCard>
      )}

      {error && (
        <div className="mobile-error-message">
          {error}
        </div>
      )}

      <style>{`
        .mobile-clockin {
          min-height: 100vh;
          background: var(--mobile-bg);
          padding-bottom: 40px;
        }

        .mobile-screen-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: var(--mobile-card);
          border-bottom: 1px solid var(--mobile-border);
        }

        .mobile-back-btn {
          background: none;
          border: none;
          padding: 8px 0;
          cursor: pointer;
          display: flex;
          align-items: center;
        }

        .mobile-screen-header h1 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          color: var(--mobile-text);
        }

        .mobile-time-display {
          text-align: center;
          padding: 32px 20px;
          background: var(--mobile-card);
          margin-bottom: 20px;
          border-bottom: 1px solid var(--mobile-border);
        }

        .mobile-time-large {
          font-size: 44px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--mobile-text);
          margin-bottom: 6px;
        }

        .mobile-date {
          font-size: 15px;
          color: var(--mobile-text-secondary);
        }

        .permission-prompt {
          text-align: center;
          padding: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .permission-prompt h3 {
          font-size: 16px;
          font-weight: 600;
          margin: 4px 0 0 0;
          color: var(--mobile-text);
        }

        .permission-prompt p {
          font-size: 14px;
          color: var(--mobile-text-secondary);
          margin: 0 0 8px 0;
        }

        .mobile-location-card {
          margin: 0 20px 20px 20px;
        }

        .mobile-location-status {
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }

        .mobile-location-status h3 {
          font-size: 15px;
          font-weight: 600;
          margin: 0 0 4px 0;
          color: var(--mobile-text);
        }

        .mobile-location-status p {
          font-size: 13px;
          color: var(--mobile-text-secondary);
          margin: 0;
        }

        .mobile-location-distance {
          font-weight: 600;
          color: var(--mobile-accent) !important;
          margin-top: 4px !important;
        }

        .mobile-location-help {
          font-size: 12px !important;
          margin-top: 4px !important;
        }

        .mobile-clock-button-container {
          padding: 0 20px 20px;
        }

        .mobile-session-info {
          padding: 4px 0;
        }

        .mobile-session-info h3 {
          font-size: 15px;
          font-weight: 600;
          margin: 0 0 12px 0;
          color: var(--mobile-text);
        }

        .mobile-session-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 14px;
          color: var(--mobile-text-secondary);
        }

        .mobile-session-row strong {
          color: var(--mobile-text);
        }

        .mobile-error-message {
          margin: 0 20px;
          padding: 14px 16px;
          background: rgba(255, 59, 48, 0.1);
          border: 1px solid #ff3b30;
          border-radius: 8px;
          color: #ff3b30;
          font-size: 14px;
          text-align: center;
        }
      `}</style>
    </div>
  )
}
