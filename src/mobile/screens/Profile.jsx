import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Icon from '../components/Icon'
import { Screen, Card, Sec, KV, Field, Btn, Btns, Loading } from '../components/UI'

export default function MobileProfile({ goBack, user, navigate }) {
  const { logout } = useAuth()
  const [profile, setProfile] = useState({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})

  useEffect(() => {
    loadProfile()
  }, [user?.email])

  const loadProfile = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('hr_profiles')
        .select('*')
        .eq('user_email', user.email)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      const profileData = data || {
        user_email: user.email,
        full_name: user.name,
        user_name: user.name,
      }

      setProfile(profileData)
      setForm(profileData)
    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    await Haptics.impact({ style: ImpactStyle.Medium })

    try {
      const { error } = await supabase
        .from('hr_profiles')
        .upsert({
          user_email: user.email,
          full_name: form.full_name,
          phone: form.phone,
          personal_email: form.personal_email,
          address: form.address,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_email'
        })

      if (error) throw error

      setProfile(form)
      setEditing(false)
      await Haptics.impact({ style: ImpactStyle.Heavy })
    } catch (error) {
      console.error('Failed to save profile:', error)
      alert('Failed to save profile')
    }
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

  if (editing) {
    return (
      <Screen title="Edit profile" onBack={() => setEditing(false)}>
        <div className="dh-card">
          <Field label="Full name" htmlFor="pf-name">
            <input id="pf-name" value={form.full_name || ''} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <Field label="Phone" htmlFor="pf-phone">
            <input id="pf-phone" type="tel" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07XXX XXXXXX" />
          </Field>
          <Field label="Personal email" htmlFor="pf-email">
            <input id="pf-email" type="email" value={form.personal_email || ''} onChange={(e) => setForm({ ...form, personal_email: e.target.value })} placeholder="personal@example.com" />
          </Field>
          <Field label="Address" htmlFor="pf-addr">
            <textarea id="pf-addr" rows={3} value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, town, postcode" />
          </Field>
        </div>
        <Btn onPress={handleSave}>Save changes</Btn>
      </Screen>
    )
  }

  const name = profile?.full_name || user.name
  const initials = (name || 'DH').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()
  return (
    <Screen title="My profile" onBack={goBack}>
      {loading ? <Loading /> : (
        <>
          <Card pad className="pf-head">
            <span className="pf-av">{initials}</span>
            <span className="dh-h2" style={{ fontSize: 20 }}>{name}</span>
            <span className="dh-sub">{[profile.role, 'DH Website Services'].filter(Boolean).join(' · ')}</span>
          </Card>

          <Sec>Work</Sec>
          <div className="dh-card">
            <KV k="Work email" v={user.email} />
            {profile.department && <KV k="Department" v={profile.department} />}
            {profile.manager_name && <KV k="Manager" v={profile.manager_name} />}
            {profile.start_date && <KV k="Start date" v={new Date(profile.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} />}
          </div>

          <Sec action="Edit" onAction={() => setEditing(true)}>Personal</Sec>
          <div className="dh-card">
            <KV k="Phone" v={profile.phone || 'Not set'} />
            <KV k="Personal email" v={profile.personal_email || 'Not set'} />
            <KV k="Address" v={profile.address || 'Not set'} />
          </div>

          <div className="dh-card">
            <button type="button" className="dh-row" onClick={() => navigate('settings')}>
              <span className="dh-ic"><Icon name="settings" size={18} /></span>
              <span className="dh-g"><span className="dh-t">Settings</span></span>
              <span className="dh-chev"><Icon name="chevron-right" size={18} /></span>
            </button>
          </div>

          <Btns>
            <Btn variant="outline" onPress={() => setEditing(true)}>Edit</Btn>
            <Btn variant="danger" onPress={handleLogout}>Sign out</Btn>
          </Btns>
        </>
      )}
      <style>{`
        .pf-head { align-items: center; text-align: center; }
        .pf-av { width: 80px; height: 80px; border-radius: 40px; background: var(--mobile-accent); color: #fff; font-family: Archivo, system-ui, sans-serif; font-weight: 700; font-size: 26px; display: flex; align-items: center; justify-content: center; }
      `}</style>
    </Screen>
  )
}
