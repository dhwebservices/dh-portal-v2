import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { ALL_PAGES, PERMISSION_GROUPS, ROLE_DEFAULTS, countEnabledPermissions } from '../../utils/permissionCatalog'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'

export default function MobileEditPermissions({ goBack, isAdmin, staffEmail }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState(null)
  const [perms, setPerms] = useState({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (staffEmail) load()
  }, [staffEmail])

  const load = async () => {
    setLoading(true)
    try {
      const [{ data: profileRow }, { data: permRow }] = await Promise.all([
        supabase.from('hr_profiles').select('*').ilike('user_email', staffEmail).maybeSingle(),
        supabase.from('user_permissions').select('*').ilike('user_email', staffEmail).maybeSingle(),
      ])
      setProfile(profileRow || { user_email: staffEmail })
      setPerms(permRow?.permissions || {})
    } catch (error) {
      console.error('Failed to load permissions:', error)
    } finally {
      setLoading(false)
    }
  }

  const togglePermission = async (key) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    setPerms(prev => ({ ...prev, [key]: !prev[key] }))
    setDirty(true)
  }

  const applyPreset = async (presetName) => {
    await Haptics.impact({ style: ImpactStyle.Medium })
    setPerms(ROLE_DEFAULTS[presetName])
    setDirty(true)
  }

  const clearAll = async () => {
    await Haptics.impact({ style: ImpactStyle.Medium })
    setPerms({})
    setDirty(true)
  }

  const handleSave = async () => {
    if (!isAdmin) return
    setSaving(true)
    await Haptics.impact({ style: ImpactStyle.Medium })

    try {
      const { error } = await supabase
        .from('user_permissions')
        .upsert({
          user_email: staffEmail.toLowerCase().trim(),
          permissions: perms,
          updated_by: user?.email || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_email' })

      if (error) throw error

      setDirty(false)
      await Haptics.notification({ type: 'SUCCESS' })
      goBack()
    } catch (error) {
      console.error('Failed to save permissions:', error)
      alert('Failed to save permissions. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="mobile-screen">
        <div className="mobile-screen-header">
          <button className="mobile-back-btn" onClick={goBack}>
            <Icon name="chevronLeft" size={24} color="#0066cc" />
          </button>
          <h1>Permissions</h1>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--mobile-text-secondary)' }}>
          You don't have access to edit permissions.
        </div>
      </div>
    )
  }

  const enabledCount = countEnabledPermissions(perms)

  return (
    <div className="mobile-screen">
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          <Icon name="chevronLeft" size={24} color="#0066cc" />
        </button>
        <h1>Permissions</h1>
        <button
          className="mobile-save-btn"
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          {saving ? '...' : 'Save'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div className="spinner" />
        </div>
      ) : (
        <div style={{ padding: '20px', paddingBottom: '100px' }}>
          <div className="perm-subject">
            <div className="perm-subject-name">{profile?.full_name || staffEmail}</div>
            <div className="perm-subject-email">{staffEmail}</div>
            <div className="perm-subject-count">{enabledCount} of {ALL_PAGES.length} permissions enabled</div>
          </div>

          <div className="preset-row">
            <button className="preset-chip" onClick={() => applyPreset('Director')}>Director</button>
            <button className="preset-chip" onClick={() => applyPreset('DepartmentManager')}>Manager</button>
            <button className="preset-chip" onClick={() => applyPreset('Staff')}>Staff</button>
            <button className="preset-chip" onClick={() => applyPreset('ReadOnly')}>Read-only</button>
            <button className="preset-chip clear" onClick={clearAll}>Clear all</button>
          </div>

          {PERMISSION_GROUPS.map(group => {
            const items = ALL_PAGES.filter(p => p.group === group)
            const groupEnabled = items.filter(p => perms?.[p.key]).length
            return (
              <MobileCard key={group} style={{ marginTop: 16 }}>
                <div style={{ padding: '8px' }}>
                  <div className="group-header">
                    <h3 className="section-title">{group}</h3>
                    <span className="group-count">{groupEnabled}/{items.length}</span>
                  </div>

                  {items.map(page => (
                    <div className="perm-row" key={page.key}>
                      <div className="perm-info">
                        <div className="perm-label">{page.label}</div>
                        {page.desc && <div className="perm-desc">{page.desc}</div>}
                      </div>
                      <button
                        className={`toggle-button ${perms?.[page.key] ? 'active' : ''}`}
                        onClick={() => togglePermission(page.key)}
                      >
                        <div className="toggle-slider" />
                      </button>
                    </div>
                  ))}
                </div>
              </MobileCard>
            )
          })}
        </div>
      )}

      <style>{`
        .mobile-save-btn {
          background: none;
          border: none;
          color: #0066cc;
          font-size: 16px;
          font-weight: 600;
          padding: 8px 12px;
          cursor: pointer;
        }

        .mobile-save-btn:disabled {
          opacity: 0.4;
        }

        .perm-subject {
          padding: 4px 4px 16px;
        }

        .perm-subject-name {
          font-size: 20px;
          font-weight: 700;
          color: var(--mobile-text);
        }

        .perm-subject-email {
          font-size: 14px;
          color: var(--mobile-text-secondary);
          margin-top: 2px;
        }

        .perm-subject-count {
          font-size: 13px;
          color: var(--mobile-accent);
          margin-top: 8px;
          font-weight: 600;
        }

        .preset-row {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 4px;
        }

        .preset-chip {
          padding: 8px 16px;
          background: var(--mobile-card);
          border: 1px solid var(--mobile-border);
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          color: var(--mobile-text);
          white-space: nowrap;
          cursor: pointer;
        }

        .preset-chip.clear {
          color: #ff3b30;
          border-color: #ff3b30;
        }

        .group-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--mobile-text);
          margin: 0;
        }

        .group-count {
          font-size: 13px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
        }

        .perm-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid var(--mobile-border);
        }

        .perm-row:last-child {
          border-bottom: none;
        }

        .perm-info {
          flex: 1;
        }

        .perm-label {
          font-size: 15px;
          font-weight: 600;
          color: var(--mobile-text);
        }

        .perm-desc {
          font-size: 12px;
          color: var(--mobile-text-secondary);
          margin-top: 2px;
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
          flex-shrink: 0;
        }

        .toggle-button.active {
          background: #34c759;
        }

        .toggle-slider {
          width: 27px;
          height: 27px;
          border-radius: 50%;
          background: white;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: left 0.2s;
        }

        .toggle-button.active .toggle-slider {
          left: 22px;
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
