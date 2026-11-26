import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { ALL_PAGES, PERMISSION_GROUPS, ROLE_DEFAULTS, countEnabledPermissions } from '../../utils/permissionCatalog'
import Icon from '../components/Icon'
import { Chip } from '../components/DH'
import { Screen, HeaderButton, Sec, Pills, Pill, ToggleRow, Btn, Empty, Loading } from '../components/UI'

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
      <Screen title="Permissions" onBack={goBack}>
        <Empty icon="lock" title="You don't have access to edit permissions." />
      </Screen>
    )
  }

  const enabledCount = countEnabledPermissions(perms)
  const firstRaw = (profile?.full_name || staffEmail || '').split(/[ @]/)[0]
  const firstName = firstRaw ? firstRaw[0].toUpperCase() + firstRaw.slice(1) : ''

  return (
    <Screen
      title={firstName ? `${firstName}'s permissions` : 'Permissions'}
      onBack={goBack}
      action={<HeaderButton onPress={handleSave} disabled={saving || !dirty}>{saving ? '…' : 'Save'}</HeaderButton>}
    >
      {loading ? <Loading /> : (
        <>
          <div className="dh-card">
            <div className="dh-row">
              <span className="dh-g">
                <span className="dh-t">{profile?.full_name || staffEmail}</span>
                <span className="dh-sub">{staffEmail}</span>
              </span>
              <Chip tone="blue">{enabledCount} of {ALL_PAGES.length}</Chip>
            </div>
          </div>

          <Sec>Start from a role</Sec>
          <Pills>
            <Pill onPress={() => applyPreset('Director')}>Director</Pill>
            <Pill onPress={() => applyPreset('DepartmentManager')}>Manager</Pill>
            <Pill onPress={() => applyPreset('Staff')}>Staff</Pill>
            <Pill onPress={() => applyPreset('ReadOnly')}>Read-only</Pill>
            <Pill tone="danger" onPress={clearAll}>Clear all</Pill>
          </Pills>

          {PERMISSION_GROUPS.map(group => {
            const items = ALL_PAGES.filter(p => p.group === group)
            const groupEnabled = items.filter(p => perms?.[p.key]).length
            return (
              <details key={group} className="dh-card">
                <summary className="dh-row">
                  <span className="dh-g"><span className="dh-t">{group}</span><span className="dh-sub">{items.map(i => i.label).slice(0, 4).join(', ')}{items.length > 4 ? '…' : ''}</span></span>
                  <Chip tone={groupEnabled === 0 ? 'neutral' : groupEnabled === items.length ? 'green' : 'blue'}>{groupEnabled} of {items.length}</Chip>
                  <span className="dh-chev"><Icon name="chevron-down" size={18} /></span>
                </summary>
                {items.map(page => (
                  <ToggleRow key={page.key} title={page.label} sub={page.desc} on={!!perms?.[page.key]} onChange={() => togglePermission(page.key)} />
                ))}
              </details>
            )
          })}
          <span className="dh-sub">Tap a group to switch each page on or off.</span>
          <Btn onPress={handleSave} disabled={saving || !dirty}>{saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}</Btn>
        </>
      )}
    </Screen>
  )
}
