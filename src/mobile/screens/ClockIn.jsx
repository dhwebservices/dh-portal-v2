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

    // Update time every second
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
      // Check location permission first
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
      // Check location permission
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

      const result = await clockOut(attendance.attendanceId || attendance.id, user.email)

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
      {/* Header */}
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          ← Back
        </button>
        <h1>Clock In/Out</h1>
        <div style={{ width: 60 }} />
      </div>

      {/* Current Time Display */}
      <div className="mobile-time-display">
        <div className="mobile-time-large">
          {formatTime(currentTime)}
        </div>
        <div className="mobile-date">
          {formatDate(currentTime)}
        </div>
      </div>

      {/* Location Permission Prompt */}
      {locationStatus?.needsPermission && (
        <MobileCard style={{ margin: '20px', background: '#fff3cd', border: '1px solid #ffc107' }}>
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <Icon name="mapPin" size={48} color="#ff9500" />
            <h3 style={{ fontSize: '17px', fontWeight: '600', margin: '12px 0 8px' }}>
              Location Permission Required
            </h3>
            <p style={{ fontSize: '14px', color: '#6b6158', margin: '0 0 16px' }}>
              We need your location to verify you're at the office when clocking in.
            </p>
            <button
              onClick={requestLocationPermission}
              style={{
                width: '100%',
                padding: '14px',
                background: '#0066cc',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Enable Location
            </button>
          </div>
        </MobileCard>
      )}

      {/* Location Status */}
      {locationStatus && !locationStatus.needsPermission && (
        <MobileCard className="mobile-location-card">
          <div className="mobile-location-status">
            {locationStatus.verified ? (
              <>
                <span className="mobile-location-icon">📍</span>
                <div>
                  <h3>Location Verified</h3>
                  <p>{locationStatus.office}</p>
                  <p className="mobile-location-distance">
                    {locationStatus.distance}m from office
                  </p>
                </div>
              </>
            ) : (
              <>
                <span className="mobile-location-icon">⚠️</span>
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
              </>
            )}
          </div>
        </MobileCard>
      )}

      {/* Clock In/Out Button */}
      <div className="mobile-clock-button-container">
        {!isClockedIn ? (
          <button
            className="mobile-clock-button mobile-clock-in"
            onClick={handleClockIn}
            disabled={loading || (locationStatus && !locationStatus.verified)}
          >
            <span className="mobile-clock-button-icon">▶️</span>
            <span className="mobile-clock-button-text">
              {loading ? 'Clocking In...' : 'Clock In'}
            </span>
          </button>
        ) : (
          <button
            className="mobile-clock-button mobile-clock-out"
            onClick={handleClockOut}
            disabled={loading}
          >
            <span className="mobile-clock-button-icon">⏸️</span>
            <span className="mobile-clock-button-text">
              {loading ? 'Clocking Out...' : 'Clock Out'}
            </span>
          </button>
        )}
      </div>

      {/* Current Session Info */}
      {isClockedIn && attendance && (
        <MobileCard>
          <div className="mobile-session-info">
            <h3>Current Session</h3>
            <div className="mobile-session-row">
              <span>Clock In:</span>
              <strong>
                {new Date(attendance.clock_in).toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </strong>
            </div>
            {attendance.office_location && (
              <div className="mobile-session-row">
                <span>Location:</span>
                <strong>{attendance.office_location}</strong>
              </div>
            )}
          </div>
        </MobileCard>
      )}

      {/* Error Message */}
      {error && (
        <div className="mobile-error-message">
          {error}
        </div>
      )}

      <style>{`
        .mobile-clockin {
          min-height: 100vh;
          background: var(--mobile-bg);
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
          font-size: 16px;
          color: var(--mobile-accent);
          background: none;
          border: none;
          padding: 8px 0;
          cursor: pointer;
        }

        .mobile-screen-header h1 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          color: var(--mobile-text);
        }

        .mobile-time-display {
          text-align: center;
          padding: 40px 20px;
          background: var(--mobile-card);
          margin-bottom: 20px;
        }

        .mobile-time-large {
          font-size: 56px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--mobile-text);
          margin-bottom: 8px;
        }

        .mobile-date {
          font-size: 18px;
          color: var(--mobile-text-secondary);
        }

        .mobile-location-card {
          margin: 0 20px 20px 20px;
        }

        .mobile-location-status {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .mobile-location-icon {
          font-size: 40px;
        }

        .mobile-location-status h3 {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 4px 0;
          color: var(--mobile-text);
        }

        .mobile-location-status p {
          font-size: 14px;
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
          padding: 20px;
          display: flex;
          justify-content: center;
        }

        .mobile-clock-button {
          width: 200px;
          height: 200px;
          border-radius: 50%;
          border: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 24px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
        }

        .mobile-clock-button:active {
          transform: scale(0.95);
        }

        .mobile-clock-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .mobile-clock-in {
          background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
          color: white;
        }

        .mobile-clock-out {
          background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
          color: white;
        }

        .mobile-clock-button-icon {
          font-size: 48px;
        }

        .mobile-clock-button-text {
          font-size: 20px;
        }

        .mobile-session-info {
          padding: 4px 0;
        }

        .mobile-session-info h3 {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 12px 0;
          color: var(--mobile-text);
        }

        .mobile-session-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 15px;
          color: var(--mobile-text-secondary);
        }

        .mobile-session-row strong {
          color: var(--mobile-text);
        }

        .mobile-error-message {
          margin: 0 20px;
          padding: 16px;
          background: #fee;
          border: 1px solid #fcc;
          border-radius: 12px;
          color: #c00;
          font-size: 14px;
          text-align: center;
        }
      `}</style>
    </div>
  )
}
