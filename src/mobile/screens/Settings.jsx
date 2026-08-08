import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { useAuth } from '../../contexts/AuthContext'
import { getUserDevices, removeDevice } from '../../utils/pushNotifications'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'

export default function MobileSettings({ goBack, user, navigate, preferences, prefsLoading, savePreference }) {
  const { logout } = useAuth()
  const loading = prefsLoading
  const [devices, setDevices] = useState([])
  const [devicesLoading, setDevicesLoading] = useState(true)

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
            <Icon name="chevronLeft" size={24} color="#0066cc" />
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
          <Icon name="chevronLeft" size={24} color="#0066cc" />
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
                <Icon name="bell" size={20} color="#0066cc" />
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
                <Icon name="mail" size={20} color="#0066cc" />
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
                <Icon name="sun" size={20} color={preferences.theme === 'light' ? '#0066cc' : '#86868b'} />
                Light
              </button>
              <button
                className={`theme-button ${preferences.theme === 'dark' ? 'active' : ''}`}
                onClick={() => handleThemeChange('dark')}
              >
                <Icon name="moon" size={20} color={preferences.theme === 'dark' ? '#0066cc' : '#86868b'} />
                Dark
              </button>
              <button
                className={`theme-button ${preferences.theme === 'auto' ? 'active' : ''}`}
                onClick={() => handleThemeChange('auto')}
              >
                <Icon name="smartphone" size={20} color={preferences.theme === 'auto' ? '#0066cc' : '#86868b'} />
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
                  <Icon name="smartphone" size={20} color="#0066cc" />
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
        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--mobile-text);
          margin: 0 0 16px 0;
        }

        .setting-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid var(--mobile-border);
        }

        .setting-row:last-child {
          border-bottom: none;
        }

        .setting-info {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          flex: 1;
        }

        .setting-label {
          font-size: 15px;
          font-weight: 600;
          color: var(--mobile-text);
          margin-bottom: 2px;
        }

        .setting-description {
          font-size: 13px;
          color: var(--mobile-text-secondary);
        }

        .toggle-button {
          width: 51px;
          height: 31px;
          border-radius: 31px;
          background: var(--mobile-border);
          border: none;
          cursor: pointer;
          position: relative;
          transition: background 0.2s;
        }

        .toggle-button.active {
          background: #34c759;
        }

        .toggle-slider {
          width: 27px;
          height: 27px;
          border-radius: 50%;
          background: var(--mobile-card);
          position: absolute;
          top: 2px;
          left: 2px;
          transition: left 0.2s;
        }

        .toggle-button.active .toggle-slider {
          left: 22px;
        }

        .theme-options {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 12px;
        }

        .theme-button {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 12px;
          background: var(--mobile-bg);
          border: 2px solid transparent;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
          cursor: pointer;
        }

        .theme-button.active {
          border-color: #0066cc;
          color: #0066cc;
          background: #e3f2fd;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid var(--mobile-border);
        }

        .info-row:last-child {
          border-bottom: none;
        }

        .info-label {
          font-size: 15px;
          color: var(--mobile-text);
        }

        .info-value {
          font-size: 15px;
          color: var(--mobile-text-secondary);
          text-align: right;
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

        .logout-button {
          width: 100%;
          padding: 14px;
          background: var(--mobile-card);
          border: 1px solid #ff3b30;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          color: #ff3b30;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 24px;
          cursor: pointer;
        }

        .logout-button:active {
          opacity: 0.7;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--mobile-border);
          border-top-color: #0066cc;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
