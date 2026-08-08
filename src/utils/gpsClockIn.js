import { Geolocation } from '@capacitor/geolocation'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

// Office locations (add more as needed)
export const OFFICE_LOCATIONS = [
  {
    name: 'DH Website Services Office',
    latitude: 51.609215, // 36b Coedpenmaen Road, Pontypridd, CF37 4LP (OS Code-Point postcode centroid)
    longitude: -3.330585,
    radius: 200, // meters - allows for GPS drift + postcode-centroid approximation
  },
  // Add more office locations here
]

export async function checkLocationPermission() {
  if (!Capacitor.isNativePlatform()) {
    return { granted: false, reason: 'Web platform' }
  }

  try {
    const permission = await Geolocation.checkPermissions()

    return {
      granted: permission.location === 'granted',
      status: permission.location,
    }
  } catch (error) {
    console.error('Location permission check error:', error)
    return { granted: false, reason: error.message }
  }
}

export async function requestLocationPermission() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Location services only available on mobile')
  }

  try {
    const permission = await Geolocation.requestPermissions()

    if (permission.location !== 'granted') {
      throw new Error('Location permission denied')
    }

    return { granted: true }

  } catch (error) {
    console.error('Location permission request error:', error)
    throw error
  }
}

export async function getCurrentPosition() {
  const permissionCheck = await checkLocationPermission()

  if (!permissionCheck.granted) {
    await requestLocationPermission()
  }

  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    })

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    }

  } catch (error) {
    console.error('Get position error:', error)
    throw new Error('Failed to get current location')
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  // Haversine formula to calculate distance between two coordinates
  const R = 6371e3 // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

export async function verifyLocationNearOffice() {
  const position = await getCurrentPosition()

  // Check if user is near any office location
  for (const office of OFFICE_LOCATIONS) {
    const distance = calculateDistance(
      position.latitude,
      position.longitude,
      office.latitude,
      office.longitude
    )

    if (distance <= office.radius) {
      return {
        verified: true,
        office: office.name,
        distance: Math.round(distance),
        position,
      }
    }
  }

  // Not near any office
  const nearestOffice = OFFICE_LOCATIONS.reduce((nearest, office) => {
    const distance = calculateDistance(
      position.latitude,
      position.longitude,
      office.latitude,
      office.longitude
    )

    if (!nearest || distance < nearest.distance) {
      return { office, distance }
    }

    return nearest
  }, null)

  return {
    verified: false,
    nearestOffice: nearestOffice.office.name,
    distanceToNearestOffice: Math.round(nearestOffice.distance),
    position,
  }
}

export async function clockIn(userEmail, userName, bypassGPS = false) {
  let locationData = null

  if (!bypassGPS && Capacitor.isNativePlatform()) {
    try {
      locationData = await verifyLocationNearOffice()

      if (!locationData.verified) {
        throw new Error(
          `You are ${locationData.distanceToNearestOffice}m from ${locationData.nearestOffice}. Please be within ${OFFICE_LOCATIONS[0].radius}m of an office to clock in.`
        )
      }
    } catch (error) {
      if (!bypassGPS) {
        throw error
      }
      // If bypass enabled, continue without GPS verification
    }
  }

  // Record clock in
  const { data, error } = await supabase
    .from('attendance')
    .insert({
      user_email: userEmail,
      user_name: userName,
      clock_in: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      location_verified: !!locationData?.verified,
      office_location: locationData?.office || null,
      gps_latitude: locationData?.position?.latitude || null,
      gps_longitude: locationData?.position?.longitude || null,
      gps_accuracy: locationData?.position?.accuracy || null,
    })
    .select()
    .single()

  if (error) throw error

  return {
    success: true,
    attendanceId: data.id,
    clockInTime: data.clock_in,
    office: locationData?.office,
    distance: locationData?.distance,
  }
}

export async function clockOut(attendanceId, userEmail) {
  const { data, error } = await supabase
    .from('attendance')
    .update({
      clock_out: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', attendanceId)
    .eq('user_email', userEmail)
    .select()
    .single()

  if (error) throw error

  // Calculate hours worked
  const clockIn = new Date(data.clock_in)
  const clockOut = new Date(data.clock_out)
  const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60)

  return {
    success: true,
    clockOutTime: data.clock_out,
    hoursWorked: hoursWorked.toFixed(2),
  }
}

export async function getTodayAttendance(userEmail) {
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('user_email', userEmail)
    .eq('date', today)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  return data
}

export async function getAttendanceHistory(userEmail, limit = 30) {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('user_email', userEmail)
    .order('date', { ascending: false })
    .limit(limit)

  if (error) throw error

  return data
}

// Admin function to add office locations
export function addOfficeLocation(name, latitude, longitude, radius = 100) {
  OFFICE_LOCATIONS.push({
    name,
    latitude,
    longitude,
    radius,
  })
}
