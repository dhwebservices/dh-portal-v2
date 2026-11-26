import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { useAuth } from '../../contexts/AuthContext'
import { getUserDevices, removeDevice, initPushNotifications } from '../../utils/pushNotifications'
import Icon from '../components/Icon'
import { App as CapacitorApp } from '@capacitor/app'
import { Chip } from '../components/DH'
import { Screen, Sec, KV, Toggle, ToggleRow, Seg, Btn, Note, Loading } from '../components/UI'

import { eventsFor } from '../../shared/notificationEvents'
import { isDirectorEmail } from '../../utils/orgStructure'

export default function MobileSettings({ goBack, user, navigate, preferences, prefsLoading, savePreference, isAdmin, can }) {
  // Admins see every office screen. Anyone else sees only the app screens
  // they've been given in their permissions (Fish Tank, Phone system).
  const canFishTank = isAdmin || !!can?.('app_fishtank')
  const canPhone = isAdmin || !!can?.('app_phone')
  const isOwner = isDirectorEmail(user?.email)
  /**
   * Per-event push preferences.
   *
   * The master switch above these stays what it always was — turning it off
   * silences everything, and this list goes quiet with it rather than
   * pretending each row still means something. A missing key is ON, so
   * somebody who never opens this screen keeps receiving everything.
   */
  const eventPrefs = preferences?.notificationPrefs || {}

  const toggleEvent = (key, currentlyOn) => {
    savePreference('notificationPrefs', { ...eventPrefs, [key]: !currentlyOn })
  }
  const { logout } = useAuth()
  const loading = prefsLoading
  const [devices, setDevices] = useState([])
  const [devicesLoading, setDevicesLoading] = useState(true)
  const [checkingPush, setCheckingPush] = useState(false)
  const [appInfo, setAppInfo] = useState(null)

  useEffect(() => {
    CapacitorApp.getInfo().then(setAppInfo).catch(() => {})
  }, [])

  useEffect(() => {
    loadDevices()
  }, [user?.email])

  const loadDevices = async () => {
    setDevicesLoading(true)
    try {
      const data = await getUserDevices(user.email)
      setDevices(data || [])
    } finally {
      setDevicesLoading(false)
    }
  }

  const handleCheckPushStatus = async () => {
    setCheckingPush(true)
    await Haptics.impact({ style: ImpactStyle.Light })
    try {
      const timeout = new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 12000))
      const result = await Promise.race([initPushNotifications(user.email), timeout])

      if (result.timedOut) {
        alert('Timed out after 12s.\n\nPushNotifications.register() never fired a registration or registrationError event at all - this points to something blocking the native APNs handshake itself (network/firewall, or a plugin-level issue), not a permission or code problem.')
        return
      }

      const lines = [
        `Supported: ${result.supported}`,
        `Permitted: ${result.permitted ?? 'n/a'}`,
        `Registered: ${result.registered ?? 'n/a'}`,
      ]
      if (result.error) {
        lines.push(`Error: ${typeof result.error === 'string' ? result.error : JSON.stringify(result.error)}`)
      }
      alert(lines.join('\n'))
      loadDevices()
    } catch (error) {
      alert(`Push check threw: ${error.message || error}`)
    } finally {
      setCheckingPush(false)
    }
  }

  const handleRemoveDevice = async (device) => {
    await Haptics.impact({ style: ImpactStyle.Medium })
    if (!confirm(`Remove "${device.device_name || device.device_model || 'this device'}"? It will stop receiving push notifications.`)) return

    try {
      await removeDevice(device.id)
      setDevices(prev => prev.filter(d => d.id !== device.id))
      await Haptics.impact({ style: ImpactStyle.Heavy })
    } catch (error) {
      console.error('Failed to remove device:', error)
      alert('Failed to remove device. Please try again.')
    }
  }

  const handleToggle = async (key) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    savePreference(key, !preferences[key])
  }

  const handleThemeChange = async (theme) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    savePreference('theme', theme)
  }

  const handleLogout = async () => {
    await Haptics.impact({ style: ImpactStyle.Medium })

    if (!confirm('Are you sure you want to logout?')) return

    try {
      await logout()
      await Haptics.impact({ style: ImpactStyle.Heavy })
    } catch (error) {
      console.error('Logout failed:', error)
      alert('Logout failed')
    }
  }

  if (loading) {
    return (
      <Screen title="Settings" onBack={goBack}>
        <Loading />
      </Screen>
    )
  }

  const go = (screen) => () => navigate(screen)
  const chev = <span className="dh-chev"><Icon name="chevron-right" size={18} /></span>
  const LinkRow = ({ icon, title, sub, to }) => (
    <button type="button" className="dh-row" onClick={go(to)}>
      <span className="dh-ic"><Icon name={icon} size={18} /></span>
      <span className="dh-g"><span className="dh-t">{title}</span>{sub && <span className="dh-sub">{sub}</span>}</span>
      {chev}
    </button>
  )

  return (
    <Screen title="Settings" onBack={goBack}>
      <Sec>Notifications</Sec>
      <div className="dh-card">
        <ToggleRow title="Push notifications" sub="On this phone" on={!!preferences.pushNotifications} onChange={() => handleToggle('pushNotifications')} />
        <ToggleRow title="Also by email" sub="A copy of each notification by email" on={!!preferences.emailNotifications} onChange={() => handleToggle('emailNotifications')} />
      </div>

      {/* What you get told about. Dimmed rather than hidden when the master
          switch is off, so it is obvious why they have stopped mattering. */}
      <Sec>Tell me about</Sec>
      {!preferences.pushNotifications && (
        <Note tone="warn">
          Push notifications are off, so none of these will reach your phone.
          They still appear in your inbox.
        </Note>
      )}
      <div className="dh-card" style={preferences.pushNotifications ? undefined : { opacity: 0.5 }}>
        {eventsFor({ isManager: !!isAdmin }).map(event => {
          const on = eventPrefs[event.key] !== false
          return (
            <div className="dh-row" key={event.key}>
              <span className="dh-g"><span className="dh-t">{event.label}</span><span className="dh-sub">{event.description}</span></span>
              {event.required
                ? <Chip>Always</Chip>
                : <Toggle on={on} onChange={() => toggleEvent(event.key, on)} label={`${event.label}: ${on ? 'on' : 'off'}`} />}
            </div>
          )
        })}
      </div>

      <Sec>Appearance</Sec>
      <Seg
        value={preferences.theme || 'auto'}
        onChange={handleThemeChange}
        options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'Auto' }]}
      />

      {(isAdmin || canFishTank || canPhone) && (
        <>
          <Sec>Office</Sec>
          <div className="dh-card">
            {isAdmin && <LinkRow icon="bell" title="Send a message" sub="Notify staff on their phones" to="send-notification" />}
            {canPhone && <LinkRow icon="smartphone" title="Phone" sub="Call menu, who answers, missed calls" to="phone" />}
            {canFishTank && <LinkRow icon="gift" title="Fish Tank" sub="Players, coins, shop items and prizes" to="fishtank" />}
            {isAdmin && <LinkRow icon="mapPin" title="Fam & a Half" sub="Users, messages, banners and app settings" to="findmygang" />}
            {isAdmin && <LinkRow icon="pound" title="Bill Pal" sub="Bills, members, support chat and suppliers" to="billpal" />}
          </div>
        </>
      )}

      <Sec>Security and devices</Sec>
      <div className="dh-card">
        <ToggleRow icon="lock" title="Face ID" sub="Ask for Face ID or Touch ID when the app opens" on={!!preferences.biometricAuth} onChange={() => handleToggle('biometricAuth')} />
        <LinkRow icon="smartphone" title="Your devices" sub="Where your notifications are sent" to="devices" />
        {isOwner && <LinkRow icon="lock" title="Device management" sub="Staff phones: details, security and remote lock" to="device-management" />}
        <LinkRow icon="barChart" title="Diagnostics" sub={isAdmin ? 'Check this iPhone, or run checks on staff phones' : 'Check this iPhone and let DH help when it misbehaves'} to="diagnostics" />
      </div>

      <Sec>Push on this account</Sec>
      <div className="dh-card">
        {devicesLoading ? (
          <div className="dh-row"><span className="dh-sub">Loading…</span></div>
        ) : devices.length === 0 ? (
          <div className="dh-row"><span className="dh-g"><span className="dh-sub">No devices registered</span></span></div>
        ) : devices.map(device => (
          <div className="dh-row" key={device.id}>
            <span className="dh-ic muted"><Icon name="smartphone" size={18} /></span>
            <span className="dh-g">
              <span className="dh-t">{device.device_name || device.device_model || 'Unknown device'}</span>
              <span className="dh-sub">{device.device_type === 'ios' ? 'iOS' : device.device_type} · {device.os_version || 'Unknown version'}</span>
            </span>
            <button type="button" className="dh-sec-act" style={{ color: '#B42318' }} onClick={() => handleRemoveDevice(device)}>Remove</button>
          </div>
        ))}
      </div>
      <Btn variant="outline" onPress={handleCheckPushStatus} disabled={checkingPush}>
        {checkingPush ? 'Checking…' : 'Check push notification status'}
      </Btn>

      <Sec>About</Sec>
      <div className="dh-card">
        <KV k="Version" v={appInfo ? `${appInfo.version} (${appInfo.build})` : '1.1'} />
        <KV k="Developer" v="DH Website Services" />
        <KV k="Support" v="01443 805303" />
        <KV k="Email" v="david@dhwebsiteservices.co.uk" />
      </div>

      <Btn variant="danger" onPress={handleLogout}>Sign out</Btn>
    </Screen>
  )
}
