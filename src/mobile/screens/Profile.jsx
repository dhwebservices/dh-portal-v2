import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'

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
      <div className="mobile-screen">
        <div className="mobile-screen-header">
          <button className="mobile-back-btn" onClick={() => setEditing(false)}>
            <Icon name="chevronLeft" size={24} color="#0066cc" />
          </button>
          <h1>Edit Profile</h1>
          <div style={{ width: 60 }} />
        </div>

        <div style={{ padding: '20px', paddingBottom: '100px' }}>
          <MobileCard>
            <div style={{ padding: '8px' }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  className="form-input"
                  value={form.full_name || ''}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Phone</label>
                <input
                  className="form-input"
                  type="tel"
                  value={form.phone || ''}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="07XXX XXXXXX"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Personal Email</label>
                <input
                  className="form-input"
                  type="email"
                  value={form.personal_email || ''}
                  onChange={(e) => setForm({ ...form, personal_email: e.target.value })}
                  placeholder="personal@example.com"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={form.address || ''}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Street, City, Postcode"
                />
              </div>

              <button className="save-button" onClick={handleSave}>
                <Icon name="check" size={18} color="white" />
                Save Changes
              </button>
            </div>
          </MobileCard>
        </div>

        <style>{`
          .form-group {
            margin-bottom: 20px;
          }

          .form-label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: #86868b;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .form-input {
            width: 100%;
            padding: 12px;
            font-size: 16px;
            border: 1px solid #d2d2d7;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          }

          .form-input:focus {
            outline: none;
            border-color: #0066cc;
          }

          .save-button {
            width: 100%;
            padding: 14px;
            background: #0066cc;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            cursor: pointer;
          }

          .save-button:active {
            opacity: 0.8;
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="mobile-screen">
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          <Icon name="chevronLeft" size={24} color="#0066cc" />
        </button>
        <h1>My Profile</h1>
        <div style={{ width: 60 }} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div className="spinner" />
        </div>
      ) : (
        <div style={{ padding: '20px', paddingBottom: '100px' }}>
          {/* Personal Info */}
          <MobileCard>
            <div style={{ padding: '8px' }}>
              <div className="profile-section-header">
                <h3>Personal Information</h3>
                <button className="edit-button" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={18} color="#0066cc" />
                </button>
              </div>

              <div className="profile-field">
                <div className="field-label">Name</div>
                <div className="field-value">{profile.full_name || user.name}</div>
              </div>

              <div className="profile-field">
                <div className="field-label">Work Email</div>
                <div className="field-value">{user.email}</div>
              </div>

              <div className="profile-field">
                <div className="field-label">Phone</div>
                <div className="field-value">{profile.phone || 'Not set'}</div>
              </div>

              <div className="profile-field">
                <div className="field-label">Personal Email</div>
                <div className="field-value">{profile.personal_email || 'Not set'}</div>
              </div>

              <div className="profile-field">
                <div className="field-label">Address</div>
                <div className="field-value">{profile.address || 'Not set'}</div>
              </div>
            </div>
          </MobileCard>

          {/* Work Info */}
          {(profile.role || profile.department) && (
            <MobileCard style={{ marginTop: '16px' }}>
              <div style={{ padding: '8px' }}>
                <h3 className="section-title">Work Information</h3>

                {profile.role && (
                  <div className="profile-field">
                    <div className="field-label">Role</div>
                    <div className="field-value">{profile.role}</div>
                  </div>
                )}

                {profile.department && (
                  <div className="profile-field">
                    <div className="field-label">Department</div>
                    <div className="field-value">{profile.department}</div>
                  </div>
                )}

                {profile.manager_name && (
                  <div className="profile-field">
                    <div className="field-label">Manager</div>
                    <div className="field-value">{profile.manager_name}</div>
                  </div>
                )}

                {profile.start_date && (
                  <div className="profile-field">
                    <div className="field-label">Start Date</div>
                    <div className="field-value">
                      {new Date(profile.start_date).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                )}
              </div>
            </MobileCard>
          )}

          {/* App Info */}
          <MobileCard style={{ marginTop: '16px' }}>
            <div style={{ padding: '8px' }}>
              <h3 className="section-title">App Information</h3>

              <div className="profile-field">
                <div className="field-label">Version</div>
                <div className="field-value">1.0.0</div>
              </div>

              <div className="profile-field">
                <div className="field-label">Build</div>
                <div className="field-value">{new Date().toISOString().split('T')[0]}</div>
              </div>
            </div>
          </MobileCard>

          {/* Actions */}
          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button className="action-button" onClick={() => navigate('settings')}>
              <Icon name="settings" size={20} color="#0066cc" />
              Settings
            </button>

            <button className="action-button danger" onClick={handleLogout}>
              <Icon name="logOut" size={20} color="#ff3b30" />
              Logout
            </button>
          </div>
        </div>
      )}

      <style>{`
        .profile-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .profile-section-header h3 {
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
          margin: 0;
        }

        .edit-button {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #e3f2fd;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .edit-button:active {
          opacity: 0.7;
        }

        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
          margin: 0 0 16px 0;
        }

        .profile-field {
          padding: 12px 0;
          border-bottom: 1px solid #f5f5f7;
        }

        .profile-field:last-child {
          border-bottom: none;
        }

        .field-label {
          font-size: 12px;
          font-weight: 600;
          color: #86868b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }

        .field-value {
          font-size: 15px;
          color: #1a1a1a;
        }

        .action-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 14px;
          background: white;
          border: 1px solid #d2d2d7;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          color: #0066cc;
          cursor: pointer;
        }

        .action-button.danger {
          color: #ff3b30;
          border-color: #ff3b30;
        }

        .action-button:active {
          opacity: 0.7;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #d2d2d7;
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
