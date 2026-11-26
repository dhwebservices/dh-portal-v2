import { useState } from 'react'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { normalizeEmail } from '../../utils/hrProfileSync'
import Icon from '../components/Icon'
import { Screen, Field, Btn, Note } from '../components/UI'

export default function MobileAddStaff({ goBack, navigate }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('')
  const [role, setRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    if (!fullName.trim()) {
      setError('Please enter a full name.')
      return
    }

    setSaving(true)
    setError('')
    await Haptics.impact({ style: ImpactStyle.Medium })

    try {
      const { data: existing } = await supabase
        .from('hr_profiles')
        .select('user_email')
        .ilike('user_email', normalizedEmail)
        .maybeSingle()

      if (existing) {
        setError('A staff profile with this email already exists.')
        setSaving(false)
        return
      }

      const { error: insertError } = await supabase
        .from('hr_profiles')
        .insert([{
          user_email: normalizedEmail,
          full_name: fullName.trim(),
          department: department.trim() || null,
          role: role.trim() || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }])

      if (insertError) throw insertError

      await Haptics.notification({ type: NotificationType.Success })
      navigate('edit-staff', { staffEmail: normalizedEmail })
    } catch (err) {
      console.error('Failed to create staff record:', err)
      setError(err.message || 'Failed to create staff record. Please try again.')
      await Haptics.notification({ type: NotificationType.Error })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen title="Add staff" onBack={goBack}>
      <Note tone="error">{error}</Note>
      <div className="dh-card">
        <Field label="Work email">
            <input
              type="email"
              autoCapitalize="none"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@dhwebsiteservices.co.uk"
            />
          </Field>

          <Field label="Full name">
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Jane Smith"
            />
          </Field>

          <Field label="Department">
            <input
              value={department}
              onChange={e => setDepartment(e.target.value)}
              placeholder="Optional"
            />
          </Field>

          <Field label="Role">
            <input
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="Optional"
            />
          </Field>
      </div>

      <span className="dh-sub">
        They sign in with their Microsoft work account. You'll be able to add contact details, contract type, manager, payment settings, and onboarding mode on the next screen.
      </span>

      <Btn disabled={saving} onPress={handleCreate}>{saving ? 'Creating…' : 'Add staff'}</Btn>
    </Screen>
  )
}
