import { useState } from 'react'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { normalizeEmail } from '../../utils/hrProfileSync'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'

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
    <div className="mobile-screen">
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          <Icon name="chevronLeft" size={24} color="#0066cc" />
        </button>
        <h1>Add Staff</h1>
        <div style={{ width: 60 }} />
      </div>

      <div style={{ padding: 20 }}>
        {error && <div className="add-staff-error">{error}</div>}

        <MobileCard>
          <label className="add-staff-label">Email</label>
          <input
            className="add-staff-input"
            type="email"
            autoCapitalize="none"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="name@dhwebsiteservices.co.uk"
          />

          <label className="add-staff-label">Full Name</label>
          <input
            className="add-staff-input"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Jane Smith"
          />

          <label className="add-staff-label">Department</label>
          <input
            className="add-staff-input"
            value={department}
            onChange={e => setDepartment(e.target.value)}
            placeholder="Optional"
          />

          <label className="add-staff-label">Role</label>
          <input
            className="add-staff-input"
            value={role}
            onChange={e => setRole(e.target.value)}
            placeholder="Optional"
          />
        </MobileCard>

        <p className="add-staff-hint">
          You'll be able to add contact details, contract type, manager, payment settings, and onboarding mode on the next screen.
        </p>

        <button className="add-staff-submit" disabled={saving} onClick={handleCreate}>
          {saving ? 'Creating...' : 'Create Staff Record'}
        </button>
      </div>

      <style>{`
        .add-staff-error {
          margin-bottom: 16px;
          padding: 12px 16px;
          background: rgba(255,59,48,0.1);
          border: 1px solid #ff3b30;
          border-radius: 8px;
          color: #ff3b30;
          font-size: 14px;
        }

        .add-staff-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--mobile-text);
          margin: 14px 0 6px 0;
        }

        .add-staff-label:first-of-type {
          margin-top: 0;
        }

        .add-staff-input {
          width: 100%;
          min-height: 44px;
          padding: 10px 14px;
          font-size: 16px;
          border: 1px solid var(--mobile-border);
          border-radius: 8px;
          background: var(--mobile-bg);
          color: var(--mobile-text);
          font-family: inherit;
        }

        .add-staff-hint {
          font-size: 13px;
          color: var(--mobile-text-secondary);
          margin: 16px 4px;
          line-height: 1.5;
        }

        .add-staff-submit {
          width: 100%;
          padding: 14px;
          background: #0066cc;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        }

        .add-staff-submit:disabled {
          opacity: 0.6;
        }
      `}</style>
    </div>
  )
}
