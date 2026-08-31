import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { useAuth } from '../../contexts/AuthContext'
import { getUserDevices, removeDevice, initPushNotifications } from '../../utils/pushNotifications'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'

import { eventsFor } from '../../shared/notificationEvents'

export default function MobileSettings({ goBack, user, navigate, preferences, prefsLoading, savePreference, isAdmin }) {
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
      <div className="mobile-screen">
        <div className="mobile-screen-header">
          <button className="mobile-back-btn" onClick={goBack}>
            <Icon name="chevronLeft" size={24} color="var(--mobile-accent)" />
          </button>
          <h1>Settings</h1>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div className="spinner" />
        </div>
      </div>
    )
  }

  return (
    <div className="mobile-screen">
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          <Icon name="chevronLeft" size={24} color="var(--mobile-accent)" />
        </button>
        <h1>Settings</h1>
        <div style={{ width: 60 }} />
      </div>

      <div style={{ padding: '20px', paddingBottom: '100px' }}>
        {/* Notifications */}
        <MobileCard>
          <div style={{ padding: '8px' }}>
            <h3 className="section-title">Notifications</h3>

            <div className="setting-row">
              <div className="setting-info">
                <Icon name="bell" size={20} color="var(--mobile-accent)" />
                <div>
                  <div className="setting-label">Push Notifications</div>
                  <div className="setting-description">Receive notifications on your device</div>
                </div>
              </div>
              <button
                className={`toggle-button ${preferences.pushNotifications ? 'active' : ''}`}
                onClick={() => handleToggle('pushNotifications')}
              >
                <div className="toggle-slider" />
              </button>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <Icon name="mail" size={20} color="var(--mobile-accent)" />
                <div>
                  <div className="setting-label">Email Notifications</div>
                  <div className="setting-description">Receive notifications via email</div>
                </div>
              </div>
              <button
                className={`toggle-button ${preferences.emailNotifications ? 'active' : ''}`}
                onClick={() => handleToggle('emailNotifications')}
              >
                <div className="toggle-slider" />
              </button>
            </div>
          </div>
        </MobileCard>

        {isAdmin && (
          <MobileCard style={{ marginTop: '16px' }}>
            <div style={{ padding: '8px' }}>
              <div className="setting-section-title">Office</div>
              <div className="setting-row" onClick={() => navigate('send-notification')} style={{ cursor: 'pointer' }}>
                <div className="setting-info">
                  <Icon name="bell" size={20} color="var(--mobile-accent)" />
                  <div>
                    <div className="setting-label">Send a message</div>
                    <div className="setting-description">Notify staff on their phones</div>
                  </div>
                </div>
                <Icon name="chevron-right" size={18} color="var(--mobile-text-secondary)" />
              </div>

              <div className="setting-row" onClick={() => navigate('fishtank')} style={{ cursor: 'pointer' }}>
                <div className="setting-info">
                  <Icon name="gift" size={20} color="var(--mobile-accent)" />
                  <div>
                    <div className="setting-label">Fish Tank</div>
                    <div className="setting-description">Players, coins, shop items and prizes</div>
                  </div>
                </div>
                <Icon name="chevron-right" size={18} color="var(--mobile-text-secondary)" />
              </div>
            </div>
          </MobileCard>
        )}

        <MobileCard style={{ marginTop: '16px' }}>
          <div style={{ padding: '8px' }}>
            <div className="setting-section-title">Devices</div>
            <div className="setting-row" onClick={() => navigate('devices')} style={{ cursor: 'pointer' }}>
              <div className="setting-info">
                <Icon name="smartphone" size={20} color="var(--mobile-accent)" />
                <div>
                  <div className="setting-label">Your devices</div>
                  <div className="setting-description">Where your notifications are sent</div>
                </div>
              </div>
              <Icon name="chevron-right" size={18} color="var(--mobile-text-secondary)" />
            </div>
          </div>
        </MobileCard>

        {/* What you get told about. Dimmed rather than hidden when the master
            switch is off, so it is obvious why they have stopped mattering. */}
        <MobileCard style={{ marginTop: '16px' }}>
          <div style={{ padding: '8px' }}>
            <div className="setting-section-title">What you're told about</div>

            {!preferences.pushNotifications && (
              <p className="setting-muted-note">
                Push notifications are off, so none of these will reach your phone.
                They still appear in your inbox.
              </p>
            )}

            <div className={preferences.pushNotifications ? '' : 'setting-dimmed'}>
              {eventsFor({ isManager: !!isAdmin }).map(event => {
                const on = eventPrefs[event.key] !== false
                return (
                  <div className="setting-row" key={event.key}>
                    <div className="setting-info">
                      <div>
                        <div className="setting-label">{event.label}</div>
                        <div className="setting-description">{event.description}</div>
                      </div>
                    </div>
                    {event.required ? (
                      <span className="setting-always">Always</span>
                    ) : (
                      <button
                        className={`toggle-button ${on ? 'active' : ''}`}
                        onClick={() => toggleEvent(event.key, on)}
                        aria-label={`${event.label}: ${on ? 'on' : 'off'}`}
                      >
                        <div className="toggle-slider" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </MobileCard>

        {/* Appearance */}
        <MobileCard style={{ marginTop: '16px' }}>
          <div style={{ padding: '8px' }}>
            <h3 className="section-title">Appearance</h3>

            <div className="setting-row">
              <div className="setting-info">
                <Icon name="sun" size={20} color="#ff9500" />
                <div>
                  <div className="setting-label">Theme</div>
                  <div className="setting-description">Choose app appearance</div>
                </div>
              </div>
            </div>

            <div className="theme-options">
              <button
                className={`theme-button ${preferences.theme === 'light' ? 'active' : ''}`}
                onClick={() => handleThemeChange('light')}
              >
                <Icon name="sun" size={20} color={preferences.theme === 'light' ? 'var(--mobile-accent)' : 'var(--mobile-text-secondary)'} />
                Light
              </button>
              <button
                className={`theme-button ${preferences.theme === 'dark' ? 'active' : ''}`}
                onClick={() => handleThemeChange('dark')}
              >
                <Icon name="moon" size={20} color={preferences.theme === 'dark' ? 'var(--mobile-accent)' : 'var(--mobile-text-secondary)'} />
                Dark
              </button>
              <button
                className={`theme-button ${preferences.theme === 'auto' ? 'active' : ''}`}
                onClick={() => handleThemeChange('auto')}
              >
                <Icon name="smartphone" size={20} color={preferences.theme === 'auto' ? 'var(--mobile-accent)' : 'var(--mobile-text-secondary)'} />
                Auto
              </button>
            </div>
          </div>
        </MobileCard>

        {/* Security */}
        <MobileCard style={{ marginTop: '16px' }}>
          <div style={{ padding: '8px' }}>
            <h3 className="section-title">Security</h3>

            <div className="setting-row">
              <div className="setting-info">
                <Icon name="lock" size={20} color="#34c759" />
                <div>
                  <div className="setting-label">Biometric Authentication</div>
                  <div className="setting-description">Use Face ID / Touch ID</div>
                </div>
              </div>
              <button
                className={`toggle-button ${preferences.biometricAuth ? 'active' : ''}`}
                onClick={() => handleToggle('biometricAuth')}
              >
                <div className="toggle-slider" />
              </button>
            </div>
          </div>
        </MobileCard>

        {/* My Devices */}
        <MobileCard style={{ marginTop: '16px' }}>
          <div style={{ padding: '8px' }}>
            <h3 className="section-title">My Devices</h3>
            <p className="section-description">Devices registered to receive push notifications for your account.</p>

            {devicesLoading ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div className="spinner" />
              </div>
            ) : devices.length === 0 ? (
              <p className="devices-empty">No devices registered</p>
            ) : (
              devices.map(device => (
                <div className="device-row" key={device.id}>
                  <Icon name="smartphone" size={20} color="var(--mobile-accent)" />
                  <div className="device-info">
                    <div className="device-name">{device.device_name || device.device_model || 'Unknown device'}</div>
                    <div className="device-meta">
                      {device.device_type === 'ios' ? 'iOS' : device.device_type} · {device.os_version || 'Unknown version'}
                    </div>
                  </div>
                  <button className="device-remove" onClick={() => handleRemoveDevice(device)}>
                    <Icon name="trash" size={18} color="#ff3b30" />
                  </button>
                </div>
              ))
            )}

            <button className="check-push-btn" onClick={handleCheckPushStatus} disabled={checkingPush}>
              {checkingPush ? 'Checking...' : 'Check Push Notification Status'}
            </button>
          </div>
        </MobileCard>

        {/* About */}
        <MobileCard style={{ marginTop: '16px' }}>
          <div style={{ padding: '8px' }}>
            <h3 className="section-title">About</h3>

            <div className="info-row">
              <div className="info-label">App Version</div>
              <div className="info-value">1.0.0</div>
            </div>

            <div className="info-row">
              <div className="info-label">Build</div>
              <div className="info-value">{new Date().toISOString().split('T')[0]}</div>
            </div>

            <div className="info-row">
              <div className="info-label">Developer</div>
              <div className="info-value">DH Website Services</div>
            </div>
          </div>
        </MobileCard>

        {/* Support */}
        <MobileCard style={{ marginTop: '16px' }}>
          <div style={{ padding: '8px' }}>
            <h3 className="section-title">Support</h3>

            <div className="info-row">
              <div className="info-label">Email</div>
              <div className="info-value">david@dhwebsiteservices.co.uk</div>
            </div>

            <div className="info-row">
              <div className="info-label">Phone</div>
              <div className="info-value">07364166285 / 02920024218 (opt 5)</div>
            </div>
          </div>
        </MobileCard>

        {/* Logout */}
        <button className="logout-button" onClick={handleLogout}>
          <Icon name="logOut" size={20} color="#ff3b30" />
          Logout
        </button>
      </div>

      <style>{`
        /* Presentation only. Every toggle still writes the same preference
           through the same savePreference call. */
        .setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 13px 8px;
          border-bottom: 1px solid var(--mobile-border);
        }

        .setting-row:last-child { border-bottom: none; }

        .setting-info {
          display: flex;
          align-items: center;
          gap: 13px;
          min-width: 0;
          flex: 1;
        }

        .setting-label {
          font-size: 15.5px;
          font-weight: 600;
          color: var(--mobile-text);
        }

        .setting-description {
          margin-top: 1px;
          font-size: 13px;
          line-height: 1.35;
          color: var(--mobile-text-secondary);
        }

        /* A proper switch: the track carries the state, so it reads at a
           glance rather than needing the label to explain it. */
        .toggle-button {
          flex: 0 0 auto;
          position: relative;
          width: 50px;
          height: 30px;
          border-radius: 999px;
          border: none;
          background: var(--mobile-border);
          cursor: pointer;
          transition: background 0.18s ease;
          padding: 0;
        }

        .toggle-button.active { background: var(--mobile-accent); }

        .toggle-slider {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
          transition: transform 0.18s ease;
        }

        .toggle-button.active .toggle-slider { transform: translateX(20px); }

        .theme-options {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          padding: 8px;
        }

        .theme-button {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 14px 8px;
          border-radius: 12px;
          border: 1px solid var(--mobile-border);
          background: var(--mobile-card);
          font-size: 13px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
          cursor: pointer;
        }

        .theme-button.active {
          border-color: var(--mobile-accent);
          background: var(--mobile-accent-soft);
          color: var(--mobile-accent);
        }

        .info-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 11px 8px;
          border-bottom: 1px solid var(--mobile-border);
          font-size: 14.5px;
        }

        .info-row:last-child { border-bottom: none; }

        .info-label { color: var(--mobile-text-secondary); }

        .info-value {
          color: var(--mobile-text);
          font-weight: 600;
          text-align: right;
        }

        .logout-button {
          width: 100%;
          margin-top: 20px;
          padding: 15px;
          border-radius: 12px;
          border: 1px solid rgba(192, 57, 43, 0.35);
          background: none;
          font-size: 15.5px;
          font-weight: 600;
          color: #c0392b;
          cursor: pointer;
        }

        .section-title {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--mobile-text-secondary);
          padding: 4px 8px 10px;
        }

        /* Used three times on this screen and defined nowhere, so every
           section heading rendered as unstyled body text. */
        .setting-section-title {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--mobile-text-secondary);
          padding: 4px 8px 10px;
        }

        .setting-muted-note {
          margin: 4px 8px 12px;
          font-size: 13px;
          line-height: 1.4;
          color: var(--mobile-text-secondary);
        }

        .setting-dimmed {
          opacity: 0.45;
          pointer-events: none;
        }

        .setting-always {
          font-size: 12px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
          padding: 4px 10px;
          border-radius: 999px;
          background: var(--mobile-accent-soft);
        }

        .section-description {
          font-size: 13px;
          color: var(--mobile-text-secondary);
          margin: -8px 0 12px 0;
        }

        .devices-empty {
          text-align: center;
          font-size: 14px;
          color: var(--mobile-text-secondary);
          padding: 12px 0;
        }

        .device-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid var(--mobile-border);
        }

        .device-row:last-child {
          border-bottom: none;
        }

        .device-info {
          flex: 1;
        }

        .device-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--mobile-text);
        }

        .device-meta {
          font-size: 12px;
          color: var(--mobile-text-secondary);
          margin-top: 2px;
        }

        .device-remove {
          background: none;
          border: none;
          padding: 6px;
          cursor: pointer;
        }

        .check-push-btn {
          width: 100%;
          margin-top: 12px;
          padding: 12px;
          background: var(--mobile-bg);
          border: 1px solid var(--mobile-border);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          color: var(--mobile-accent);
          cursor: pointer;
        }

        .check-push-btn:disabled {
          opacity: 0.6;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
