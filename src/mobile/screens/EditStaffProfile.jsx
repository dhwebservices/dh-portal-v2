import { useState, useEffect } from 'react'
import { Haptics, NotificationType } from '@capacitor/haptics'
import MobileButton from '../components/MobileButton'
import MobileCard from '../components/MobileCard'
import { supabase } from '../../utils/supabase'

export default function MobileEditStaffProfile({ goBack, navigate, staffEmail }) {
  const [profile, setProfile] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [departments, setDepartments] = useState([])
  const [managers, setManagers] = useState([])

  useEffect(() => {
    loadProfile()
    loadDepartments()
    loadManagers()
  }, [staffEmail])

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('hr_profiles')
        .select('*')
        .eq('user_email', staffEmail)
        .single()

      if (error) throw error
      setProfile(data || {})
    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadDepartments = async () => {
    try {
      const { data } = await supabase
        .from('hr_profiles')
        .select('department')

      const depts = [...new Set(data.map(d => d.department).filter(Boolean))]
      setDepartments(depts.sort())
    } catch (error) {
      console.error('Failed to load departments:', error)
    }
  }

  const loadManagers = async () => {
    try {
      const { data } = await supabase
        .from('hr_profiles')
        .select('user_email, full_name')
        .order('full_name')

      setManagers(data || [])
    } catch (error) {
      console.error('Failed to load managers:', error)
    }
  }

  const handleSave = async () => {
    setSaving(true)

    try {
      // Update HR profile
      const { error: hrError } = await supabase
        .from('hr_profiles')
        .upsert({
          ...profile,
          updated_at: new Date().toISOString(),
        })

      if (hrError) throw hrError

      // Update staff table with payment settings
      const { error: staffError } = await supabase
        .from('staff')
        .upsert({
          email: profile.user_email,
          name: profile.full_name || profile.user_name,
          role: profile.role,
          hourly_rate: profile.hourly_rate || 0,
          payment_type: profile.payment_type || 'commission_only',
          commission_rate: profile.commission_rate || 10,
        }, {
          onConflict: 'email'
        })

      if (staffError) throw staffError

      await Haptics.notification({ type: NotificationType.Success })
      goBack()

    } catch (error) {
      console.error('Failed to save profile:', error)
      await Haptics.notification({ type: NotificationType.Error })
      alert('Failed to save profile: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const updateField = (field, value) => {
    setProfile({ ...profile, [field]: value })
  }

  if (loading) {
    return <div className="mobile-loading">Loading...</div>
  }

  return (
    <div className="mobile-edit-profile">
      {/* Header */}
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          Cancel
        </button>
        <h1>Edit Profile</h1>
        <button
          className="mobile-save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Form */}
      <div className="mobile-form">
        {/* Personal Info */}
        <MobileCard>
          <h3 className="mobile-form-section">Personal Info</h3>

          <label className="mobile-label">Full Name</label>
          <input
            className="mobile-input"
            value={profile.full_name || ''}
            onChange={(e) => updateField('full_name', e.target.value)}
          />

          <label className="mobile-label">Email</label>
          <input
            className="mobile-input"
            type="email"
            value={profile.user_email || ''}
            onChange={(e) => updateField('user_email', e.target.value)}
          />

          <label className="mobile-label">Phone</label>
          <input
            className="mobile-input"
            type="tel"
            value={profile.phone || ''}
            onChange={(e) => updateField('phone', e.target.value)}
          />

          <label className="mobile-label">Personal Email</label>
          <input
            className="mobile-input"
            type="email"
            value={profile.personal_email || ''}
            onChange={(e) => updateField('personal_email', e.target.value)}
          />

          <label className="mobile-label">Address</label>
          <textarea
            className="mobile-textarea"
            rows={3}
            value={profile.address || ''}
            onChange={(e) => updateField('address', e.target.value)}
          />
        </MobileCard>

        {/* Employment */}
        <MobileCard>
          <h3 className="mobile-form-section">Employment</h3>

          <label className="mobile-label">Department</label>
          <select
            className="mobile-select"
            value={profile.department || ''}
            onChange={(e) => updateField('department', e.target.value)}
          >
            <option value="">Select department...</option>
            {departments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
            <option value="__new__">+ Add New Department</option>
          </select>

          <label className="mobile-label">Role</label>
          <input
            className="mobile-input"
            value={profile.role || ''}
            onChange={(e) => updateField('role', e.target.value)}
          />

          <label className="mobile-label">Contract Type</label>
          <select
            className="mobile-select"
            value={profile.contract_type || ''}
            onChange={(e) => updateField('contract_type', e.target.value)}
          >
            <option value="">Select...</option>
            <option value="Full-time">Full-time</option>
            <option value="Part-time">Part-time</option>
            <option value="Contract">Contract</option>
            <option value="Freelance">Freelance</option>
          </select>

          <label className="mobile-label">Start Date</label>
          <input
            className="mobile-input"
            type="date"
            value={profile.start_date || ''}
            onChange={(e) => updateField('start_date', e.target.value)}
          />

          <label className="mobile-label">Manager</label>
          <select
            className="mobile-select"
            value={profile.manager_email || ''}
            onChange={(e) => {
              const manager = managers.find(m => m.user_email === e.target.value)
              updateField('manager_email', e.target.value)
              updateField('manager_name', manager?.full_name || '')
            }}
          >
            <option value="">Select manager...</option>
            {managers.map(mgr => (
              <option key={mgr.user_email} value={mgr.user_email}>
                {mgr.full_name}
              </option>
            ))}
          </select>
        </MobileCard>

        {/* Payment Settings */}
        <MobileCard>
          <h2 className="mobile-card-title">💰 Payment Settings</h2>

          <label className="mobile-label">Payment Type</label>
          <select
            className="mobile-select"
            value={profile.payment_type || 'commission_only'}
            onChange={(e) => updateField('payment_type', e.target.value)}
          >
            <option value="commission_only">Commission Only</option>
            <option value="hourly">Hourly Pay</option>
            <option value="both">Hourly + Commission</option>
          </select>

          {(profile.payment_type === 'hourly' || profile.payment_type === 'both') && (
            <>
              <label className="mobile-label">Hourly Rate (£/hour)</label>
              <input
                className="mobile-input"
                type="number"
                step="0.01"
                min="0"
                value={profile.hourly_rate || ''}
                onChange={(e) => updateField('hourly_rate', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </>
          )}

          <label className="mobile-label">Commission Rate (%)</label>
          <input
            className="mobile-input"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={profile.commission_rate || 10}
            onChange={(e) => updateField('commission_rate', parseFloat(e.target.value) || 10)}
          />
        </MobileCard>

        {/* Banking */}
        <MobileCard>
          <h3 className="mobile-form-section">Banking</h3>

          <label className="mobile-label">Bank Name</label>
          <input
            className="mobile-input"
            value={profile.bank_name || ''}
            onChange={(e) => updateField('bank_name', e.target.value)}
          />

          <label className="mobile-label">Account Name</label>
          <input
            className="mobile-input"
            value={profile.account_name || ''}
            onChange={(e) => updateField('account_name', e.target.value)}
          />

          <label className="mobile-label">Sort Code</label>
          <input
            className="mobile-input"
            value={profile.sort_code || ''}
            onChange={(e) => updateField('sort_code', e.target.value)}
            placeholder="12-34-56"
          />

          <label className="mobile-label">Account Number</label>
          <input
            className="mobile-input"
            value={profile.account_number || ''}
            onChange={(e) => updateField('account_number', e.target.value)}
            placeholder="12345678"
          />
        </MobileCard>

        {/* Save Button */}
        <MobileButton
          variant="primary"
          fullWidth
          loading={saving}
          onPress={handleSave}
        >
          Save Changes
        </MobileButton>
      </div>

      <style>{`
        .mobile-edit-profile {
          min-height: 100vh;
          background: var(--mobile-bg);
          padding-bottom: 80px;
        }

        .mobile-screen-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: var(--mobile-card);
          border-bottom: 1px solid var(--mobile-border);
        }

        .mobile-back-btn,
        .mobile-save-btn {
          font-size: 16px;
          color: var(--mobile-accent);
          background: none;
          border: none;
          padding: 8px 0;
          cursor: pointer;
          font-weight: 600;
        }

        .mobile-save-btn:disabled {
          opacity: 0.5;
        }

        .mobile-screen-header h1 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          color: var(--mobile-text);
        }

        .mobile-form {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .mobile-form-section {
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 16px 0;
          color: var(--mobile-text);
        }

        .mobile-label {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: var(--mobile-text);
          margin: 16px 0 8px 0;
        }

        .mobile-label:first-of-type {
          margin-top: 0;
        }

        .mobile-input,
        .mobile-select,
        .mobile-textarea {
          width: 100%;
          min-height: 44px;
          padding: 12px 16px;
          font-size: 16px;
          border: 1px solid var(--mobile-border);
          border-radius: 10px;
          background: var(--mobile-bg);
          color: var(--mobile-text);
          font-family: inherit;
        }

        .mobile-input:focus,
        .mobile-select:focus,
        .mobile-textarea:focus {
          outline: none;
          border-color: var(--mobile-accent);
        }

        .mobile-textarea {
          resize: vertical;
          padding-top: 12px;
        }

        .mobile-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          color: var(--mobile-text-secondary);
        }
      `}</style>
    </div>
  )
}
