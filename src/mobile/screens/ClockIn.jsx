import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Geolocation } from '@capacitor/geolocation'
import { Screen, Card, Sec, KV, Btn, Hero, Note } from '../components/UI'
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

  const blocked = !!(locationStatus && !locationStatus.verified)
  return (
    <Screen title="Clock in" onBack={goBack}>
      <Hero dark className="ci-hero">
        <span className="dh-sub">{formatDate(currentTime)}</span>
        <span className="dh-big ci-time">{formatTime(currentTime)}</span>
        <span className="dh-sub">
          {isClockedIn && attendance
            ? `Clocked in at ${new Date(attendance.clock_in).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
            : 'Not clocked in'}
        </span>
      </Hero>

      {locationStatus?.needsPermission && (
        <Card pad>
          <span className="dh-ic" style={{ background: '#FFF1DE', color: '#8A4A00' }}><Icon name="mapPin" size={18} /></span>
          <span className="dh-t">Location permission needed</span>
          <span className="dh-sub">We need your location to verify you're at the office when clocking in.</span>
          <Btn onPress={requestLocationPermission}>Enable location</Btn>
        </Card>
      )}

      {locationStatus && !locationStatus.needsPermission && (
        <div className="dh-card">
          <div className="dh-row">
            <span className="dh-ic" style={locationStatus.verified ? { background: '#EAF7EE', color: '#1E7B3A' } : { background: '#FFF1DE', color: '#8A4A00' }}>
              <Icon name={locationStatus.verified ? 'checkCircle' : 'alertTriangle'} size={18} />
            </span>
            {locationStatus.verified ? (
              <span className="dh-g">
                <span className="dh-t">Location verified</span>
                <span className="dh-sub">{locationStatus.office} · {locationStatus.distance}m from the office</span>
              </span>
            ) : (
              <span className="dh-g">
                <span className="dh-t">Location not verified</span>
                <span className="dh-sub">You are {locationStatus.distanceToNearestOffice}m from {locationStatus.nearestOffice}. Be within {OFFICE_LOCATIONS[0].radius}m of an office to clock in.</span>
              </span>
            )}
          </div>
        </div>
      )}

      {!isClockedIn ? (
        <button type="button" className="ci-btn" disabled={loading || blocked} onClick={handleClockIn}>
          {loading ? '…' : 'Clock in'}
        </button>
      ) : (
        <button type="button" className="ci-btn out" disabled={loading} onClick={handleClockOut}>
          {loading ? '…' : 'Clock out'}
        </button>
      )}

      <Note tone="error">{error}</Note>

      {isClockedIn && attendance && (
        <>
          <Sec>Current session</Sec>
          <div className="dh-card">
            <KV k="Clocked in" v={new Date(attendance.clock_in).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} />
            {attendance.office_location && <KV k="Location" v={attendance.office_location} />}
          </div>
        </>
      )}

      <style>{`
        .ci-hero { align-items: center; text-align: center; padding: 28px 20px; gap: 6px; }
        .ci-time { font-size: 56px; color: #fff; font-variant-numeric: tabular-nums; }
        .ci-btn { width: 200px; height: 200px; border-radius: 100px; border: 0; align-self: center; margin: 8px 0; background: var(--mobile-accent); color: #fff; font-family: Archivo, system-ui, sans-serif; font-weight: 800; font-size: 24px; box-shadow: 0 10px 30px rgba(11, 95, 208, .3); }
        .ci-btn.out { background: #b42318; box-shadow: 0 10px 30px rgba(180, 35, 24, .3); }
        .ci-btn:disabled { opacity: .45; box-shadow: none; }
        .ci-btn:active:not(:disabled) { transform: scale(.97); }
      `}</style>
    </Screen>
  )
}
