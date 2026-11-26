import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { getUserDevices, removeDevice } from '../../utils/pushNotifications'
import Icon from '../components/Icon'
import { Screen, Empty, Loading } from '../components/UI'

/**
 * Which phones are signed in and receiving notifications.
 *
 * Worth having for a mundane reason: a device that was replaced or wiped keeps
 * its row in `user_devices`, and every notification sent to it fails silently
 * against a token Apple no longer recognises. Being able to see and remove one
 * is the difference between "notifications are broken" and "that's my old
 * phone".
 *
 * Built entirely on `getUserDevices` and `removeDevice`, which already existed
 * in utils/pushNotifications.js with no screen behind them.
 */
export default function MobileDeviceHistory({ goBack, user }) {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    load()
  }, [user?.email])

  const load = async () => {
    setLoading(true)
    try {
      const rows = await getUserDevices(user?.email)
      setDevices(Array.isArray(rows) ? rows : [])
    } catch (error) {
      console.error('Failed to load devices:', error)
      setDevices([])
    } finally {
      setLoading(false)
    }
  }

  const forget = async (device) => {
    if (!confirm('Stop sending notifications to this device?')) return
    await Haptics.impact({ style: ImpactStyle.Medium })
    setBusy(device.id)
    try {
      await removeDevice(device.id)
      setDevices(list => list.filter(d => d.id !== device.id))
    } catch (error) {
      alert('Could not remove that device.')
    } finally {
      setBusy(null)
    }
  }

  const lastActive = (value) => {
    if (!value) return 'Never used'
    const then = new Date(value)
    const days = Math.floor((Date.now() - then.getTime()) / 86_400_000)
    if (days <= 0) return 'Active today'
    if (days === 1) return 'Active yesterday'
    if (days < 30) return `Active ${days} days ago`
    return `Last active ${then.toLocaleDateString('en-GB')}`
  }

  return (
    <Screen title="Your devices" onBack={goBack}>
      <span className="dh-sub">Where your notifications are sent. Remove any you don't use.</span>

      {loading && <Loading />}

      {!loading && devices.length === 0 && (
        <Empty icon="smartphone" title="No devices yet" sub="Allow notifications on a phone and it will appear here." />
      )}

      {devices.length > 0 && (
        <div className="dh-card">
          {devices.map(device => (
            <div key={device.id} className="dh-row">
              <span className="dh-ic"><Icon name="smartphone" size={18} /></span>
              <span className="dh-g">
                <span className="dh-t">{device.device_name || device.device_model || 'This device'}</span>
                <span className="dh-sub">{[device.device_model, device.app_version ? `v${device.app_version}` : null, lastActive(device.last_active)].filter(Boolean).join(' · ')}</span>
              </span>
              <button type="button" className="dh-sec-act" style={{ color: '#B42318' }} onClick={() => forget(device)} disabled={busy === device.id}>
                {busy === device.id ? '…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}
    </Screen>
  )
}
