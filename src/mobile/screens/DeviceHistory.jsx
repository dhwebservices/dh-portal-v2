import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { getUserDevices, removeDevice } from '../../utils/pushNotifications'
import Icon from '../components/Icon'
import InfoRow from '../components/InfoRow'

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
    <div className="devices-screen">
      <div className="devices-head">
        <button className="devices-back" onClick={goBack} aria-label="Back">
          <Icon name="chevron-left" size={20} />
        </button>
        <h1>Your devices</h1>
      </div>

      <p className="devices-note">
        Notifications go to every device listed here. Remove any you no longer
        use.
      </p>

      {loading && <p className="devices-note">Loading…</p>}

      {!loading && devices.length === 0 && (
        <p className="devices-note">
          No devices registered yet. Allow notifications on a phone and it will
          appear here.
        </p>
      )}

      <div className="devices-list">
        {devices.map(device => (
          <InfoRow
            key={device.id}
            icon="smartphone"
            title={device.device_name || device.device_model || 'This device'}
            subtitle={[
              device.device_model,
              device.app_version ? `v${device.app_version}` : null,
              lastActive(device.last_active),
            ].filter(Boolean).join(' · ')}
            value={busy === device.id ? '…' : undefined}
            onPress={() => forget(device)}
          />
        ))}
      </div>

      <style>{`
        .devices-screen { padding: 16px 16px 40px; }

        .devices-head {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .devices-head h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
          color: var(--mobile-text);
        }

        .devices-back {
          background: none;
          border: none;
          padding: 4px;
          color: var(--mobile-text);
          cursor: pointer;
          display: grid;
          place-items: center;
        }

        .devices-note {
          margin: 0 4px 14px;
          font-size: 14px;
          line-height: 1.45;
          color: var(--mobile-text-secondary);
        }

        .devices-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
      `}</style>
    </div>
  )
}
