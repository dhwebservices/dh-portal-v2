import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchServiceAdminOverview, runServiceAdminAction } from '../utils/serviceAdmin'

const TABS = [
  { key: 'control', label: 'Control Center' },
  { key: 'status', label: 'Service Status' },
  { key: 'releases', label: 'Releases' },
  { key: 'config', label: 'Config' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'recovery', label: 'Audit & Recovery' },
]

const STATUS_OPTIONS = ['operational', 'degraded', 'outage', 'maintenance', 'incident']

const FEATURE_FLAG_PRESETS = [
  ['booking_links', 'Staff shareable booking links', true],
  ['pdf_workspace', 'Internal PDF Workspace', true],
  ['public_booking', 'Public booking pages', true],
  ['onboarding_redesign', 'New starter onboarding redesign', true],
  ['release_popups', 'Portal update popups and banners', true],
  ['microsoft_calendar_sync', 'Microsoft calendar two-way sync', false],
  ['service_admin_v2', 'Service Admin control layer', true],
]

const CONFIG_CATEGORY_LABELS = {
  branding: 'Branding',
  support: 'Support contacts',
  communications: 'Communications',
  payments: 'Payments',
  operational: 'Operational flags',
  booking: 'Booking links',
  onboarding: 'Onboarding defaults',
  releases: 'Release updates',
  governance: 'Governance',
  security: 'Security',
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function badgeTone(status = '') {
  const safe = String(status || '').toLowerCase()
  if (['pass', 'configured', 'operational'].includes(safe)) return 'badge-green'
  if (['degraded', 'warning'].includes(safe)) return 'badge-amber'
  if (['missing', 'fail', 'outage', 'incident'].includes(safe)) return 'badge-red'
  return 'badge-blue'
}

function Card({ title, value, meta, action, onClick }) {
  return (
    <div className="service-admin-stat">
      <div>
        <div className="service-admin-stat__label">{title}</div>
        <div className="service-admin-stat__value">{value}</div>
        {meta ? <div className="service-admin-stat__meta">{meta}</div> : null}
      </div>
      {action && onClick ? <button className="btn btn-outline btn-sm" onClick={onClick}>{action}</button> : null}
    </div>
  )
}

export default function ServiceAdmin() {
  const navigate = useNavigate()
  const { user, realUser, isPreviewing, previewTarget } = useAuth()
  const actorEmail = String((isPreviewing ? realUser?.email : user?.email) || user?.email || '').trim()
  const actorName = String((isPreviewing ? realUser?.name : user?.name) || user?.name || actorEmail).trim()

  const [activeTab, setActiveTab] = useState('control')
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [statusDrafts, setStatusDrafts] = useState({})
  const [configDrafts, setConfigDrafts] = useState({})
  const [releaseForm, setReleaseForm] = useState({ version: '', title: '', notes: '', mode: 'soft_announce', force_refresh: false, blocked: false })
  const [flagForm, setFlagForm] = useState({ key: '', description: '', enabled: false, audience_scope: 'all_staff', expires_at: '' })
  const [portalMaintenanceDraft, setPortalMaintenanceDraft] = useState({ enabled: false, message: '', eta: '' })
  const [sessionEmails, setSessionEmails] = useState('')
  const [sessionReason, setSessionReason] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await fetchServiceAdminOverview()
      setOverview(payload)
      const nextStatusDrafts = {}
      for (const row of payload?.serviceStatus?.systems || []) {
        nextStatusDrafts[row.name] = {
          name: row.name,
          status: row.status || 'operational',
          note: row.note || '',
          url: row.url || '',
          severity: row.status === 'outage' ? 'high' : 'normal',
          audience: 'staff',
          public_note: row.note || '',
          internal_note: '',
          starts_at: '',
          ends_at: '',
        }
      }
      setStatusDrafts(nextStatusDrafts)
      const nextConfigDrafts = {}
      for (const item of payload?.configManager?.settings || []) {
        nextConfigDrafts[item.key] = item.value ?? ''
      }
      setConfigDrafts(nextConfigDrafts)
      setPortalMaintenanceDraft(payload?.serviceStatus?.portalMaintenance || { enabled: false, message: '', eta: '' })
      setReleaseForm((current) => ({
        ...current,
        version: payload?.releaseManager?.currentVersion || current.version,
        title: payload?.releaseManager?.whatsNewPayload?.title || current.title,
        notes: payload?.releaseManager?.whatsNewPayload?.body || current.notes,
      }))
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load service admin.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const runAction = async (action, payload = {}, successMessage = 'Saved') => {
    setBusyAction(action)
    setSaveMessage('')
    setError('')
    try {
      await runServiceAdminAction(action, {
        actor_email: actorEmail,
        actor_name: actorName,
        ...payload,
      })
      setSaveMessage(successMessage)
      await load()
    } catch (actionError) {
      setError(actionError?.message || 'Action failed.')
    } finally {
      setBusyAction('')
    }
  }

  const controlCenter = overview?.controlCenter || {}
  const systems = overview?.serviceStatus?.systems || []
  const integrations = overview?.integrations || []
  const recentReleaseRows = overview?.releaseManager?.releases || []
  const featureFlags = overview?.releaseManager?.featureFlags || []
  const configHistory = overview?.configManager?.history || []
  const safeguards = overview?.safeguards || []
  const auditRecovery = overview?.auditAndRecovery || {}

  const flaggedChecks = useMemo(
    () => safeguards.filter((check) => check.status && check.status !== 'pass'),
    [safeguards]
  )

  const groupedConfig = useMemo(() => {
    const groups = new Map()
    for (const item of overview?.configManager?.settings || []) {
      const category = item.category || 'general'
      if (!groups.has(category)) groups.set(category, [])
      groups.get(category).push(item)
    }
    return Array.from(groups.entries())
  }, [overview?.configManager?.settings])

  const fillFlagPreset = ([key, description, enabled]) => {
    setFlagForm({
      key,
      description,
      enabled,
      audience_scope: 'all_staff',
      expires_at: '',
    })
  }

  const renderControlCenter = () => (
    <div className="service-admin-control-layout">
      <div className="service-admin-main">
        <div className="service-admin-stat-grid">
          <Card title="Portal maintenance" value={controlCenter.portalMaintenanceEnabled ? 'Enabled' : 'Off'} meta="Live staff access block" action="Toggle" onClick={() => setActiveTab('status')} />
          <Card title="Staff portal status" value={controlCenter.staffPortalStatus || 'Operational'} meta="Public-facing system row" action="Open status" onClick={() => setActiveTab('status')} />
          <Card title="Current release" value={controlCenter.currentVersion || 'Untracked'} meta={controlCenter.previousVersion ? `Previous ${controlCenter.previousVersion}` : 'No previous version'} action="Open releases" onClick={() => setActiveTab('releases')} />
          <Card title="Live staff" value={String(controlCenter.liveStaffCount || 0)} meta={`${controlCenter.suspendedAccounts || 0} suspended`} action="Open recovery" onClick={() => setActiveTab('recovery')} />
        </div>

        <div className="service-admin-section">
          <div className="service-admin-section__head">
            <div>
              <div className="service-admin-section__eyebrow">Action tiles</div>
              <h3>Immediate controls</h3>
            </div>
          </div>
          <div className="service-admin-action-grid">
            <button className="service-admin-action" onClick={() => setActiveTab('status')}>
              <strong>Enable maintenance</strong>
              <span>Set the staff portal into maintenance or degraded mode.</span>
            </button>
            <button className="service-admin-action" onClick={() => setActiveTab('releases')}>
              <strong>Force refresh clients</strong>
              <span>Publish a release as mandatory and trigger the update watcher.</span>
            </button>
            <button className="service-admin-action" onClick={() => setActiveTab('integrations')}>
              <strong>Test integrations</strong>
              <span>Check Microsoft, email, SMS, Supabase, and update endpoints.</span>
            </button>
            <button className="service-admin-action" onClick={() => setActiveTab('recovery')}>
              <strong>Revoke sessions</strong>
              <span>Force selected staff to re-authenticate across the portal.</span>
            </button>
          </div>
        </div>

        <div className="service-admin-section">
          <div className="service-admin-section__head">
            <div>
              <div className="service-admin-section__eyebrow">Operational checks</div>
              <h3>Current issues</h3>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/admin-safeguards')}>Open safeguards</button>
          </div>
          {flaggedChecks.length === 0 ? (
            <div className="service-admin-empty">No failed or warning checks at the moment.</div>
          ) : (
            <div className="service-admin-list">
              {flaggedChecks.map((check) => (
                <div key={check.id || check.check_key} className="service-admin-list__row">
                  <div>
                    <strong>{check.check_key || 'Check'}</strong>
                    <div>{check.detail || 'Issue requires review.'}</div>
                  </div>
                  <span className={`badge ${badgeTone(check.status)}`}>{check.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <aside className="service-admin-side">
        <div className="service-admin-panel">
          <div className="service-admin-section__eyebrow">Live staff</div>
          <h3>Current presence</h3>
          <div className="service-admin-chip-stack">
            {(auditRecovery.liveStaff || []).map((person) => (
              <span key={person.email} className="badge badge-green">
                {person.user_name || person.email} · {person.status}
              </span>
            ))}
          </div>
        </div>
        <div className="service-admin-panel">
          <div className="service-admin-section__eyebrow">Shortcuts</div>
          <div className="service-admin-link-list">
            <button className="service-admin-link" onClick={() => navigate('/settings')}>Open legacy settings</button>
            <button className="service-admin-link" onClick={() => navigate('/maintenance')}>Open maintenance board</button>
            <button className="service-admin-link" onClick={() => navigate('/workflow-automation')}>Open automations</button>
            <button className="service-admin-link" onClick={() => navigate('/audit')}>Open audit log</button>
          </div>
        </div>
      </aside>
    </div>
  )

  const renderStatus = () => (
    <div className="service-admin-grid single">
      <div className="service-admin-main">
        <div className="service-admin-section">
          <div className="service-admin-section__head">
            <div>
              <div className="service-admin-section__eyebrow">Staff portal lock</div>
              <h3>Portal maintenance</h3>
            </div>
          </div>
          <div className="service-admin-form-grid">
            <label className="service-admin-field service-admin-field--toggle">
              <span>Enabled</span>
              <button
                type="button"
                className={`service-admin-toggle ${portalMaintenanceDraft.enabled ? 'is-on' : ''}`}
                onClick={() => setPortalMaintenanceDraft((current) => ({ ...current, enabled: !current.enabled }))}
              >
                <span />
              </button>
            </label>
            <label className="service-admin-field service-admin-field--full">
              <span>Staff message</span>
              <textarea value={portalMaintenanceDraft.message} onChange={(event) => setPortalMaintenanceDraft((current) => ({ ...current, message: event.target.value }))} rows={3} />
            </label>
            <label className="service-admin-field">
              <span>Expected return time</span>
              <input value={portalMaintenanceDraft.eta} onChange={(event) => setPortalMaintenanceDraft((current) => ({ ...current, eta: event.target.value }))} />
            </label>
          </div>
          <div className="service-admin-actions">
            <button className="btn btn-primary" onClick={() => runAction('portal_maintenance_update', { portal_maintenance: portalMaintenanceDraft }, 'Portal maintenance updated')} disabled={busyAction === 'portal_maintenance_update'}>
              {busyAction === 'portal_maintenance_update' ? 'Saving…' : 'Save maintenance state'}
            </button>
          </div>
        </div>

        <div className="service-admin-section">
          <div className="service-admin-section__head">
            <div>
              <div className="service-admin-section__eyebrow">Service rows</div>
              <h3>Public-facing system status</h3>
            </div>
          </div>
          <div className="service-admin-table">
            {(systems || []).map((system) => {
              const draft = statusDrafts[system.name] || {
                name: system.name,
                status: system.status || 'operational',
                note: system.note || '',
                url: system.url || '',
                severity: system.status === 'outage' ? 'high' : 'normal',
                audience: 'staff',
                public_note: system.note || '',
                internal_note: '',
                starts_at: '',
                ends_at: '',
              }
              return (
                <div key={system.id || system.name} className="service-admin-table__row">
                  <div className="service-admin-table__title">
                    <strong>{system.name}</strong>
                    <span>{system.url || 'Internal service'}</span>
                  </div>
                  <select value={draft.status} onChange={(event) => setStatusDrafts((current) => ({ ...current, [system.name]: { ...draft, status: event.target.value } }))}>
                    {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <input value={draft.note} onChange={(event) => setStatusDrafts((current) => ({ ...current, [system.name]: { ...draft, note: event.target.value, public_note: event.target.value } }))} placeholder="Public note" />
                  <button className="btn btn-outline btn-sm" onClick={() => runAction('status_update', { status: draft }, `${system.name} updated`)} disabled={busyAction === 'status_update'}>
                    Save
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )

  const renderReleases = () => (
    <div className="service-admin-grid">
      <div className="service-admin-main">
        <div className="service-admin-section">
          <div className="service-admin-section__head">
            <div>
              <div className="service-admin-section__eyebrow">Release manager</div>
              <h3>Publish a portal release</h3>
            </div>
          </div>
          <div className="service-admin-form-grid">
            <label className="service-admin-field">
              <span>Version</span>
              <input value={releaseForm.version} onChange={(event) => setReleaseForm((current) => ({ ...current, version: event.target.value }))} />
            </label>
            <label className="service-admin-field">
              <span>Mode</span>
              <select value={releaseForm.mode} onChange={(event) => setReleaseForm((current) => ({ ...current, mode: event.target.value }))}>
                <option value="soft_announce">Soft announce only</option>
                <option value="mandatory_update">Mandatory update</option>
              </select>
            </label>
            <label className="service-admin-field service-admin-field--full">
              <span>Title</span>
              <input value={releaseForm.title} onChange={(event) => setReleaseForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="service-admin-field service-admin-field--full">
              <span>Notes</span>
              <textarea value={releaseForm.notes} onChange={(event) => setReleaseForm((current) => ({ ...current, notes: event.target.value }))} rows={4} />
            </label>
            <label className="service-admin-field service-admin-field--toggle">
              <span>Force refresh all clients</span>
              <button type="button" className={`service-admin-toggle ${releaseForm.force_refresh ? 'is-on' : ''}`} onClick={() => setReleaseForm((current) => ({ ...current, force_refresh: !current.force_refresh }))}><span /></button>
            </label>
            <label className="service-admin-field service-admin-field--toggle">
              <span>Block this version</span>
              <button type="button" className={`service-admin-toggle ${releaseForm.blocked ? 'is-on' : ''}`} onClick={() => setReleaseForm((current) => ({ ...current, blocked: !current.blocked }))}><span /></button>
            </label>
          </div>
          <div className="service-admin-actions">
            <button className="btn btn-primary" onClick={() => runAction('release_publish', { release: releaseForm, current_version: overview?.releaseManager?.currentVersion || '' }, 'Release published')} disabled={busyAction === 'release_publish'}>
              {busyAction === 'release_publish' ? 'Publishing…' : 'Publish release'}
            </button>
          </div>
        </div>

        <div className="service-admin-section">
          <div className="service-admin-section__head">
            <div>
              <div className="service-admin-section__eyebrow">Feature flags</div>
              <h3>Operational toggles</h3>
            </div>
          </div>
          <div className="service-admin-preset-strip" aria-label="Feature flag presets">
            {FEATURE_FLAG_PRESETS.map((preset) => (
              <button key={preset[0]} type="button" className="service-admin-preset" onClick={() => fillFlagPreset(preset)}>
                {preset[0].replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <div className="service-admin-form-grid compact">
            <label className="service-admin-field">
              <span>Key</span>
              <input value={flagForm.key} onChange={(event) => setFlagForm((current) => ({ ...current, key: event.target.value }))} placeholder="booking_links" />
            </label>
            <label className="service-admin-field">
              <span>Audience</span>
              <input value={flagForm.audience_scope} onChange={(event) => setFlagForm((current) => ({ ...current, audience_scope: event.target.value }))} placeholder="all_staff" />
            </label>
            <label className="service-admin-field service-admin-field--full">
              <span>Description</span>
              <input value={flagForm.description} onChange={(event) => setFlagForm((current) => ({ ...current, description: event.target.value }))} />
            </label>
            <label className="service-admin-field">
              <span>Expiry</span>
              <input value={flagForm.expires_at} onChange={(event) => setFlagForm((current) => ({ ...current, expires_at: event.target.value }))} placeholder="Optional ISO date" />
            </label>
            <label className="service-admin-field service-admin-field--toggle">
              <span>Enabled</span>
              <button type="button" className={`service-admin-toggle ${flagForm.enabled ? 'is-on' : ''}`} onClick={() => setFlagForm((current) => ({ ...current, enabled: !current.enabled }))}><span /></button>
            </label>
          </div>
          <div className="service-admin-actions">
            <button className="btn btn-outline" onClick={() => runAction('feature_flag_upsert', { flag: flagForm }, 'Feature flag saved')} disabled={busyAction === 'feature_flag_upsert'}>
              Save feature flag
            </button>
          </div>
          <div className="service-admin-list">
            {featureFlags.map((flag) => (
              <div key={flag.id || flag.key} className="service-admin-list__row">
                <div>
                  <strong>{flag.key}</strong>
                  <div>{flag.description || flag.audience_scope || 'No description'}</div>
                </div>
                <span className={`badge ${flag.enabled ? 'badge-green' : 'badge-grey'}`}>{flag.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="service-admin-side">
        <div className="service-admin-panel">
          <div className="service-admin-section__eyebrow">Release history</div>
          <h3>Recent publishes</h3>
          <div className="service-admin-list">
            {recentReleaseRows.length ? recentReleaseRows.map((row) => (
              <div key={row.id || row.version} className="service-admin-list__row">
                <div>
                  <strong>{row.version}</strong>
                  <div>{row.title || row.mode}</div>
                </div>
                <span>{formatDateTime(row.published_at)}</span>
              </div>
            )) : <div className="service-admin-empty">No release history yet.</div>}
          </div>
        </div>
      </div>
    </div>
  )

  const renderConfig = () => (
    <div className="service-admin-grid">
      <div className="service-admin-main">
        <div className="service-admin-section">
          <div className="service-admin-section__head">
            <div>
              <div className="service-admin-section__eyebrow">Typed settings</div>
              <h3>Service configuration</h3>
            </div>
          </div>
          <div className="service-admin-config-groups">
            {groupedConfig.map(([category, items]) => (
              <section key={category} className="service-admin-config-group">
                <div>
                  <h4>{CONFIG_CATEGORY_LABELS[category] || category}</h4>
                  <p>{items.length} setting{items.length === 1 ? '' : 's'}</p>
                </div>
                <div className="service-admin-form-grid">
                  {items.map((item) => (
                    <label key={item.key} className="service-admin-field">
                      <span>{item.label}</span>
                      {typeof item.value === 'boolean' ? (
                        <select value={String(configDrafts[item.key])} onChange={(event) => setConfigDrafts((current) => ({ ...current, [item.key]: event.target.value === 'true' }))}>
                          <option value="true">Enabled</option>
                          <option value="false">Disabled</option>
                        </select>
                      ) : (
                        <input value={configDrafts[item.key] ?? ''} onChange={(event) => setConfigDrafts((current) => ({ ...current, [item.key]: event.target.value }))} />
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="service-admin-actions">
            <button
              className="btn btn-primary"
              onClick={() => runAction(
                'config_save',
                {
                  items: (overview?.configManager?.settings || []).map((item) => ({
                    key: item.key,
                    label: item.label,
                    category: item.category,
                    value: configDrafts[item.key],
                    reason: 'Service admin update',
                  })),
                },
                'Configuration saved'
              )}
              disabled={busyAction === 'config_save'}
            >
              {busyAction === 'config_save' ? 'Saving…' : 'Save configuration'}
            </button>
          </div>
        </div>
      </div>

      <div className="service-admin-side">
        <div className="service-admin-panel">
          <div className="service-admin-section__eyebrow">History</div>
          <h3>Recent config changes</h3>
          <div className="service-admin-list">
            {configHistory.length ? configHistory.map((row) => (
              <div key={row.id || `${row.target_key}-${row.changed_at}`} className="service-admin-list__row">
                <div>
                  <strong>{row.target_key}</strong>
                  <div>{row.actor_name || row.actor_email || 'Unknown'}</div>
                </div>
                <span>{formatDateTime(row.changed_at)}</span>
              </div>
            )) : <div className="service-admin-empty">No config history yet.</div>}
          </div>
        </div>
        <div className="service-admin-panel">
          <div className="service-admin-section__eyebrow">Managed here</div>
          <h3>Settings you can now control</h3>
          <div className="service-admin-note-list">
            <span>Booking defaults and public booking toggles</span>
            <span>Onboarding manager, department, and starter guide defaults</span>
            <span>Email/SMS rates, support contacts, and update behaviour</span>
            <span>Audit retention, session re-auth, and sensitive action rules</span>
          </div>
        </div>
      </div>
    </div>
  )

  const renderIntegrations = () => (
    <div className="service-admin-grid single">
      <div className="service-admin-main">
        <div className="service-admin-section">
          <div className="service-admin-section__head">
            <div>
              <div className="service-admin-section__eyebrow">Connected services</div>
              <h3>Integration health</h3>
            </div>
          </div>
          <div className="service-admin-list">
            {integrations.map((integration) => (
              <div key={integration.key} className="service-admin-list__row service-admin-list__row--actionable">
                <div>
                  <strong>{integration.label}</strong>
                  <div>{integration.detail}</div>
                </div>
                <div className="service-admin-row-actions">
                  <span className={`badge ${badgeTone(integration.status)}`}>{integration.status}</span>
                  <button className="btn btn-outline btn-sm" onClick={() => runAction('integration_test', { integration_key: integration.key }, `${integration.label} check completed`)} disabled={busyAction === 'integration_test'}>
                    Test
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  const renderRecovery = () => (
    <div className="service-admin-grid">
      <div className="service-admin-main">
        <div className="service-admin-section">
          <div className="service-admin-section__head">
            <div>
              <div className="service-admin-section__eyebrow">Session control</div>
              <h3>Revoke selected staff sessions</h3>
            </div>
          </div>
          <div className="service-admin-form-grid">
            <label className="service-admin-field service-admin-field--full">
              <span>Staff emails</span>
              <textarea rows={3} value={sessionEmails} onChange={(event) => setSessionEmails(event.target.value)} placeholder="one email per line" />
            </label>
            <label className="service-admin-field service-admin-field--full">
              <span>Reason</span>
              <input value={sessionReason} onChange={(event) => setSessionReason(event.target.value)} placeholder="Why are these sessions being revoked?" />
            </label>
          </div>
          <div className="service-admin-actions">
            <button className="btn btn-primary" onClick={() => runAction('session_revoke', { session_control: { emails: sessionEmails.split('\n'), reason: sessionReason } }, 'Sessions revoked')} disabled={busyAction === 'session_revoke'}>
              {busyAction === 'session_revoke' ? 'Revoking…' : 'Force re-login'}
            </button>
          </div>
        </div>

        <div className="service-admin-section">
          <div className="service-admin-section__head">
            <div>
              <div className="service-admin-section__eyebrow">Recovery tools</div>
              <h3>Safe rollback actions</h3>
            </div>
          </div>
          <div className="service-admin-action-grid">
            <button className="service-admin-action" onClick={() => runAction('recovery_action', { recovery_action: 'clear_blocked_release' }, 'Blocked release marker cleared')}>
              <strong>Clear blocked release</strong>
              <span>Remove the current blocked-version marker.</span>
            </button>
            <button className="service-admin-action" onClick={() => runAction('recovery_action', { recovery_action: 'reset_portal_maintenance_message' }, 'Portal maintenance reset')}>
              <strong>Reset portal maintenance</strong>
              <span>Clear the staff maintenance lock and message.</span>
            </button>
          </div>
        </div>
      </div>

      <div className="service-admin-side">
        <div className="service-admin-panel">
          <div className="service-admin-section__eyebrow">Admin audit</div>
          <h3>Recent service-admin actions</h3>
          <div className="service-admin-list">
            {(auditRecovery.recentAdminActions || []).length ? auditRecovery.recentAdminActions.map((row) => (
              <div key={row.id || `${row.action}-${row.created_at}`} className="service-admin-list__row">
                <div>
                  <strong>{row.action}</strong>
                  <div>{row.user_name || row.user_email || 'Unknown actor'} · {row.target}</div>
                </div>
                <span>{formatDateTime(row.created_at)}</span>
              </div>
            )) : <div className="service-admin-empty">No service-admin audit entries yet.</div>}
          </div>
        </div>
      </div>
    </div>
  )

  const renderTab = () => {
    if (activeTab === 'status') return renderStatus()
    if (activeTab === 'releases') return renderReleases()
    if (activeTab === 'config') return renderConfig()
    if (activeTab === 'integrations') return renderIntegrations()
    if (activeTab === 'recovery') return renderRecovery()
    return renderControlCenter()
  }

  return (
    <div className="fade-in service-admin-page">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Service Admin</h1>
          <p className="page-sub">Platform operations, release control, service status, and recovery</p>
        </div>
        <div className="service-admin-top-actions">
          <button className="btn btn-outline" onClick={() => navigate('/maintenance')}>Legacy maintenance</button>
          <button className="btn btn-outline" onClick={() => navigate('/settings')}>Legacy settings</button>
        </div>
      </div>

      {error ? <div className="service-admin-banner error">{error}</div> : null}
      {saveMessage ? <div className="service-admin-banner success">{saveMessage}</div> : null}
      {isPreviewing && previewTarget?.email ? (
        <div className="service-admin-banner">
          Preview mode is active. Service-admin actions are attributed to {actorName || actorEmail}.
        </div>
      ) : null}

      <div className="service-admin-tabs">
        {TABS.map((tab) => (
          <button key={tab.key} className={`service-admin-tab ${activeTab === tab.key ? 'is-active' : ''}`} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? <div className="spin-wrap"><div className="spin" /></div> : renderTab()}
    </div>
  )
}
