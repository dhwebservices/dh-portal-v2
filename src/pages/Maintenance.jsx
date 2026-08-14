import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { loadActivePortalStaffAudience } from '../utils/staffAudience'
import { sendEmail, sendPacedEmailBroadcast } from '../utils/email'
import PushNotificationSender from '../components/PushNotificationSender'
import {
  Button,
  Toggle,
  FormField,
  FormLabel,
  FormInput,
  FormSelect,
  FormHint,
  Alert
} from '../components/ds'

const STATUS_OPTS = [
  { value: 'operational', label: 'Operational', color: '#10B981' },
  { value: 'degraded', label: 'Degraded', color: '#F59E0B' },
  { value: 'outage', label: 'Outage', color: '#EF4444' },
  { value: 'maintenance', label: 'Maintenance', color: '#0066CC' },
]

const PRESET_SYSTEMS = [
  { name: 'Staff Portal', url: 'https://staff.dhwebsiteservices.co.uk' },
  { name: 'Client Portal', url: 'https://app.dhwebsiteservices.co.uk' },
  { name: 'Public Website', url: 'https://dhwebsiteservices.co.uk' },
  { name: 'Email (Microsoft 365)', url: '' },
  { name: 'Supabase Database', url: 'https://supabase.com' },
  { name: 'Cloudflare CDN', url: 'https://cloudflare.com' },
  { name: 'Microsoft 365', url: 'https://portal.office.com' },
  { name: 'GitHub', url: 'https://github.com/dhwebservices' },
]

export default function Maintenance() {
  const { user } = useAuth()
  const [systems, setSystems] = useState([])
  const [portalMaintenance, setPortalMaintenance] = useState({ enabled: false, message: '', eta: '' })
  const [savedPortalMaintenance, setSavedPortalMaintenance] = useState({ enabled: false, message: '', eta: '' })
  const [loading, setLoading] = useState(true)
  const [portalSaving, setPortalSaving] = useState(false)
  const [portalSaved, setPortalSaved] = useState('')
  const [portalError, setPortalError] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data }, { data: maintenanceSetting }] = await Promise.all([
      supabase.from('maintenance_systems').select('*').order('name'),
      supabase.from('portal_settings').select('value').eq('key', 'portal_maintenance').maybeSingle(),
    ])
    setSystems(data || [])
    const raw = maintenanceSetting?.value?.value ?? maintenanceSetting?.value ?? {}
    const nextMaintenance = {
      enabled: raw?.enabled === true,
      message: raw?.message || '',
      eta: raw?.eta || '',
    }
    setPortalMaintenance(nextMaintenance)
    setSavedPortalMaintenance(nextMaintenance)
    setLoading(false)
  }

  const addPreset = async (preset) => {
    if (systems.find(s => s.name === preset.name)) return
    await supabase.from('maintenance_systems').insert([{
      name: preset.name,
      url: preset.url,
      status: 'operational',
      updated_at: new Date().toISOString()
    }])
    load()
  }

  const savePortalMaintenance = async () => {
    setPortalSaving(true)
    setPortalError('')
    const shouldNotifyStaff = !savedPortalMaintenance.enabled && portalMaintenance.enabled

    const { error: settingsError } = await supabase
      .from('portal_settings')
      .upsert({
        key: 'portal_maintenance',
        value: { value: portalMaintenance },
      }, { onConflict: 'key' })

    if (settingsError) {
      setPortalSaving(false)
      setPortalError(settingsError.message || 'Unable to save maintenance mode.')
      return
    }

    if (shouldNotifyStaff) {
      try {
        const recipients = await loadActivePortalStaffAudience()
        const subject = 'DH Staff Portal Under Maintenance'
        const message = `
          <p>Hi {{name}},</p>
          <p>${portalMaintenance.message || 'The DH Staff Portal is currently under maintenance. Please come back later.'}</p>
          ${portalMaintenance.eta ? `<p><strong>Expected return time:</strong> ${portalMaintenance.eta}</p>` : ''}
          <p>You will be able to log in again once maintenance has been completed.</p>
        `

        await sendPacedEmailBroadcast(
          recipients,
          (recipient) => sendEmail('send_email', {
            to: recipient.email,
            to_name: recipient.name,
            subject,
            html: message.replace('{{name}}', recipient.name || 'there'),
            sent_by: user?.name || 'System',
            from_email: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
            log_outreach: false,
          })
        )
      } catch (err) {
        console.error('Maintenance notification send failed:', err)
      }
    }

    setSavedPortalMaintenance({ ...portalMaintenance })
    setPortalSaved('saved')
    setTimeout(() => setPortalSaved(''), 3000)
    setPortalSaving(false)
  }

  const overall = systems.length === 0 ? 'operational' : systems.every(s => s.status === 'operational') ? 'operational' : systems.some(s => s.status === 'outage') ? 'outage' : 'degraded'
  const overallColor = { operational: '#10B981', degraded: '#F59E0B', outage: '#EF4444', maintenance: '#0066CC' }[overall] || '#10B981'

  if (loading) {
    return (
      <div className="ds-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className="ds-content">
      {/* Page Header */}
      <div className="ds-page-header">
        <div>
          <h1>Maintenance</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Control portal access and system status
          </p>
        </div>
      </div>

      <PushNotificationSender />

      {/* Portal Maintenance Lock */}
      <div style={{
        background: portalMaintenance.enabled ? '#FEF3C7' : 'var(--color-bg-surface)',
        border: `2px solid ${portalMaintenance.enabled ? '#F59E0B' : 'var(--color-border)'}`,
        borderRadius: 'var(--border-radius-lg)',
        padding: 'var(--space-xl)',
        marginBottom: 'var(--space-xl)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-lg)',
          marginBottom: 'var(--space-lg)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--border-radius-md)',
            background: portalMaintenance.enabled ? '#F59E0B' : '#E5E5E5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: '24px'
          }}>
            {portalMaintenance.enabled ? '🔒' : '🔓'}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{
              fontSize: 'var(--font-size-h2)',
              fontWeight: 'var(--font-weight-semibold)',
              marginBottom: '4px'
            }}>
              Portal Maintenance Lock
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              {portalMaintenance.enabled
                ? 'Maintenance mode is active. Staff are blocked from accessing the portal.'
                : 'Portal is accessible. All staff can log in normally.'}
            </p>
          </div>
          <Toggle
            enabled={portalMaintenance.enabled}
            onChange={(enabled) => setPortalMaintenance({ ...portalMaintenance, enabled })}
          />
        </div>

        <div style={{
          display: 'grid',
          gap: 'var(--space-md)',
          marginBottom: 'var(--space-lg)'
        }}>
          <FormField>
            <FormLabel>Message for staff</FormLabel>
            <textarea
              value={portalMaintenance.message}
              onChange={(e) => setPortalMaintenance({ ...portalMaintenance, message: e.target.value })}
              placeholder="The portal is undergoing scheduled maintenance and will return shortly."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--border-radius-md)',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />
            <FormHint>This message will be shown to staff when they try to log in</FormHint>
          </FormField>

          <FormField>
            <FormLabel>Expected return time</FormLabel>
            <FormInput
              value={portalMaintenance.eta}
              onChange={(e) => setPortalMaintenance({ ...portalMaintenance, eta: e.target.value })}
              placeholder="e.g. Today at 18:30 or 7 Aug 2026, 09:00"
            />
            <FormHint>Optional - let staff know when they can log back in</FormHint>
          </FormField>
        </div>

        {portalMaintenance.enabled && (
          <Alert variant="warning" style={{ marginBottom: 'var(--space-md)' }}>
            <strong>All staff except admins are blocked.</strong><br />
            Enabling maintenance mode will immediately prevent staff from accessing the portal. Admins can still log in.
          </Alert>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            onClick={savePortalMaintenance}
            disabled={portalSaving}
          >
            {portalSaving ? 'Saving...' : 'Save Changes'}
          </Button>
          {portalSaved === 'saved' && (
            <span style={{ fontSize: '14px', color: '#10B981', fontWeight: 500 }}>
              ✓ Saved successfully
            </span>
          )}
          {portalError && (
            <span style={{ fontSize: '14px', color: '#EF4444' }}>
              {portalError}
            </span>
          )}
        </div>
      </div>

      {/* Overall Status */}
      <div style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg)',
        padding: 'var(--space-lg)',
        marginBottom: 'var(--space-xl)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)'
      }}>
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: overallColor,
          flexShrink: 0,
          boxShadow: `0 0 8px ${overallColor}`
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '16px', fontWeight: 600 }}>
            All Systems <span style={{ color: overallColor, textTransform: 'capitalize' }}>
              {overall === 'operational' ? 'Operational' : overall}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            {systems.length} systems monitored · Last updated {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Quick Add Presets */}
      {systems.length < PRESET_SYSTEMS.length && (
        <div style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--border-radius-lg)',
          padding: 'var(--space-lg)',
          marginBottom: 'var(--space-xl)'
        }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 600,
            marginBottom: 'var(--space-md)',
            color: 'var(--color-text-secondary)'
          }}>
            Quick Add Systems
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            {PRESET_SYSTEMS.filter(p => !systems.find(s => s.name === p.name)).map(p => (
              <Button
                key={p.name}
                variant="secondary"
                onClick={() => addPreset(p)}
              >
                + {p.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Systems Table */}
      <div style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg)',
        overflow: 'hidden'
      }}>
        {systems.length === 0 ? (
          <div style={{
            padding: 'var(--space-3xl)',
            textAlign: 'center',
            color: 'var(--color-text-secondary)'
          }}>
            <p style={{ fontSize: '14px' }}>No systems added yet.</p>
            <p style={{ fontSize: '13px', marginTop: '8px' }}>Use the quick-add buttons above to get started.</p>
          </div>
        ) : (
          <table className="ds-table">
            <thead style={{ background: '#FAFAFA' }}>
              <tr>
                <th style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  System
                </th>
                <th style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Status
                </th>
                <th style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Note
                </th>
                <th style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {systems.map(s => {
                const statusOpt = STATUS_OPTS.find(o => o.value === s.status)
                return (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ fontWeight: 500, fontSize: '14px', marginBottom: '2px' }}>{s.name}</div>
                      {s.url && (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}
                        >
                          {s.url}
                        </a>
                      )}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: statusOpt?.color
                      }}>
                        <span style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: statusOpt?.color,
                          flexShrink: 0
                        }} />
                        {statusOpt?.label || s.status}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                      {s.note || '—'}
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                      {s.updated_at ? new Date(s.updated_at).toLocaleDateString('en-GB') : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
