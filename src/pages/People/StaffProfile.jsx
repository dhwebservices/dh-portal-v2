import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../utils/supabase'
import {
  Button,
  FormField,
  FormLabel,
  FormInput,
  FormSelect,
  FormHint,
  Alert,
  Toggle,
  StatusBadge
} from '../../components/ds'

export default function StaffProfile() {
  const { email } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [profile, setProfile] = useState(null)
  const [permissions, setPermissions] = useState(null)
  const [onboardingData, setOnboardingData] = useState(null)
  const [contracts, setContracts] = useState([])
  const [onboardingEnabled, setOnboardingEnabled] = useState(false)

  // Load REAL staff data
  useEffect(() => {
    if (email) {
      loadProfileData()
    }
  }, [email])

  async function loadProfileData() {
    try {
      setLoading(true)

      // Query REAL data from multiple tables
      const [profileRes, permissionsRes, onboardingRes, contractsRes] = await Promise.all([
        supabase.from('hr_profiles').select('*').ilike('user_email', email).maybeSingle(),
        supabase.from('user_permissions').select('*').ilike('user_email', email).maybeSingle(),
        supabase.from('onboarding_submissions').select('*').ilike('user_email', email).maybeSingle(),
        supabase.from('staff_contracts').select('*').eq('staff_email', email)
      ])

      if (profileRes.error && profileRes.error.code !== 'PGRST116') throw profileRes.error

      setProfile(profileRes.data || { user_email: email })
      setPermissions(permissionsRes.data)
      setOnboardingData(onboardingRes.data)
      setContracts(contractsRes.data || [])

      // Check if onboarding mode is enabled
      setOnboardingEnabled(!!onboardingRes.data && onboardingRes.data.status !== 'completed')

    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    try {
      setSaving(true)

      // Update hr_profiles table with current profile data
      const { error } = await supabase
        .from('hr_profiles')
        .upsert({
          ...profile,
          updated_at: new Date().toISOString()
        })

      if (error) throw error

      alert('Profile saved successfully')
    } catch (error) {
      console.error('Save failed:', error)
      alert('Failed to save: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleOnboardingToggle(enabled) {
    setOnboardingEnabled(enabled)

    if (enabled) {
      // Create or update onboarding submission
      const { error } = await supabase
        .from('onboarding_submissions')
        .upsert({
          user_email: email,
          status: 'pending',
          created_at: new Date().toISOString()
        })

      if (error) {
        console.error('Failed to enable onboarding:', error)
        setOnboardingEnabled(false)
      }
    }
  }

  function formatDate(dateString) {
    if (!dateString) return ''
    return new Date(dateString).toISOString().split('T')[0]
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px'
      }}>
        Loading profile...
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="ds-content">
        <h1>Profile not found</h1>
        <Button variant="ghost" onClick={() => navigate('/people')}>
          ← Back to Directory
        </Button>
      </div>
    )
  }

  const initials = profile.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : email[0].toUpperCase()

  return (
    <div className="ds-content">
      {/* Page Header */}
      <div className="ds-page-header">
        <h1>{profile.full_name || email}</h1>
        <div className="flex gap-sm">
          <Button variant="ghost" onClick={() => navigate('/people')}>
            ← Back to Directory
          </Button>
          <Button variant="secondary">Export Profile</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Profile Layout: Sidebar + Main */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        gap: 'var(--space-lg)'
      }}>

        {/* Sidebar */}
        <div style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--border-radius-lg)',
          padding: 'var(--space-lg)'
        }}>
          {/* Avatar */}
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'var(--color-primary)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            fontWeight: 600,
            margin: '0 auto var(--space-md)'
          }}>
            {initials}
          </div>

          {/* Name & Role */}
          <div style={{
            fontSize: 'var(--font-size-h2)',
            fontWeight: 'var(--font-weight-semibold)',
            textAlign: 'center',
            marginBottom: '4px'
          }}>
            {profile.full_name || 'No Name'}
          </div>
          <div style={{
            fontSize: 'var(--font-size-body)',
            color: 'var(--color-text-secondary)',
            textAlign: 'center',
            marginBottom: 'var(--space-md)'
          }}>
            {permissions?.role || 'Staff'}
          </div>

          {/* Entra Sync Indicator */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-xs)',
            padding: '4px var(--space-sm)',
            background: 'var(--color-blue-100)',
            borderRadius: 'var(--border-radius-sm)',
            fontSize: 'var(--font-size-small)',
            color: 'var(--color-blue-700)',
            margin: '0 auto var(--space-md)',
            display: 'block',
            textAlign: 'center'
          }}>
            <span style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              background: 'var(--color-primary)',
              borderRadius: '50%',
              marginRight: '6px'
            }} />
            Synced with Entra
          </div>

          {/* Meta Info */}
          <div style={{
            paddingTop: 'var(--space-md)',
            borderTop: '1px solid var(--color-border)'
          }}>
            <div style={{ marginBottom: '12px' }}>
              <div style={{
                fontSize: 'var(--font-size-small)',
                color: 'var(--color-text-secondary)',
                marginBottom: '2px'
              }}>
                Department
              </div>
              <div style={{ fontSize: 'var(--font-size-body)' }}>
                {profile.department || 'Unassigned'}
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{
                fontSize: 'var(--font-size-small)',
                color: 'var(--color-text-secondary)',
                marginBottom: '2px'
              }}>
                Start Date
              </div>
              <div style={{ fontSize: 'var(--font-size-body)' }}>
                {profile.start_date ? new Date(profile.start_date).toLocaleDateString('en-GB') : '-'}
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{
                fontSize: 'var(--font-size-small)',
                color: 'var(--color-text-secondary)',
                marginBottom: '2px'
              }}>
                Employment Type
              </div>
              <div style={{ fontSize: 'var(--font-size-body)' }}>
                {profile.contract_type || 'Full-time'}
              </div>
            </div>

            <div>
              <div style={{
                fontSize: 'var(--font-size-small)',
                color: 'var(--color-text-secondary)',
                marginBottom: '2px'
              }}>
                Status
              </div>
              <StatusBadge variant={onboardingEnabled ? 'info' : 'active'}>
                {onboardingEnabled ? 'Onboarding' : 'Active'}
              </StatusBadge>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--border-radius-lg)'
        }}>

          {/* Tabs */}
          <div style={{
            display: 'flex',
            gap: 'var(--space-lg)',
            padding: 'var(--space-md) var(--space-lg)',
            borderBottom: '1px solid var(--color-border)'
          }}>
            {['overview', 'onboarding', 'documents', 'leave', 'performance', 'access'].map(tab => (
              <div
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: 'var(--space-sm) 0',
                  fontSize: 'var(--font-size-body)',
                  color: activeTab === tab ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  borderBottom: activeTab === tab ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                  marginBottom: '-1px',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {tab}
              </div>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ padding: 'var(--space-lg)' }}>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <>
                <div style={{ marginBottom: 'var(--space-xl)' }}>
                  <h3 style={{ marginBottom: 'var(--space-md)' }}>Personal Information</h3>

                  <Alert variant="info" style={{ marginBottom: 'var(--space-md)' }}>
                    <div>
                      <strong>Auto-synced from Microsoft Entra</strong><br />
                      Name and email are managed in Microsoft 365 and updated automatically.
                    </div>
                  </Alert>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 'var(--space-md)'
                  }}>
                    <FormField>
                      <FormLabel>First Name</FormLabel>
                      <FormInput
                        value={profile.full_name?.split(' ')[0] || ''}
                        disabled
                      />
                      <FormHint>Synced from Entra</FormHint>
                    </FormField>

                    <FormField>
                      <FormLabel>Last Name</FormLabel>
                      <FormInput
                        value={profile.full_name?.split(' ').slice(1).join(' ') || ''}
                        disabled
                      />
                      <FormHint>Synced from Entra</FormHint>
                    </FormField>

                    <FormField>
                      <FormLabel>Email</FormLabel>
                      <FormInput
                        value={profile.user_email}
                        disabled
                      />
                      <FormHint>Synced from Entra</FormHint>
                    </FormField>

                    <FormField>
                      <FormLabel>Phone</FormLabel>
                      <FormInput
                        value={profile.phone || ''}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      />
                    </FormField>
                  </div>
                </div>

                <div>
                  <h3 style={{ marginBottom: 'var(--space-md)' }}>Employment Details</h3>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 'var(--space-md)'
                  }}>
                    <FormField>
                      <FormLabel>Job Title</FormLabel>
                      <FormInput
                        value={profile.role || ''}
                        onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                      />
                    </FormField>

                    <FormField>
                      <FormLabel>Department</FormLabel>
                      <FormSelect
                        value={profile.department || ''}
                        onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                      >
                        <option value="">Select Department</option>
                        <option value="Engineering">Engineering</option>
                        <option value="Sales">Sales</option>
                        <option value="Operations">Operations</option>
                        <option value="Marketing">Marketing</option>
                        <option value="Finance">Finance</option>
                      </FormSelect>
                    </FormField>

                    <FormField>
                      <FormLabel>Start Date</FormLabel>
                      <FormInput
                        type="date"
                        value={formatDate(profile.start_date)}
                        onChange={(e) => setProfile({ ...profile, start_date: e.target.value })}
                      />
                    </FormField>

                    <FormField>
                      <FormLabel>Employment Type</FormLabel>
                      <FormSelect
                        value={profile.contract_type || ''}
                        onChange={(e) => setProfile({ ...profile, contract_type: e.target.value })}
                      >
                        <option value="">Select Type</option>
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Contract">Contract</option>
                      </FormSelect>
                    </FormField>
                  </div>
                </div>
              </>
            )}

            {/* Onboarding Tab */}
            {activeTab === 'onboarding' && (
              <>
                <div style={{ marginBottom: 'var(--space-xl)' }}>
                  <h3 style={{ marginBottom: 'var(--space-md)' }}>Onboarding Setup</h3>

                  <Toggle
                    enabled={onboardingEnabled}
                    onChange={handleOnboardingToggle}
                    label="Onboarding Mode Enabled"
                    description="Employee will see onboarding flow on first login"
                  />

                  {profile.start_date && (
                    <Alert variant="warning" style={{ marginTop: 'var(--space-md)' }}>
                      <div>
                        <strong>Start Date: {new Date(profile.start_date).toLocaleDateString('en-GB')}</strong><br />
                        Onboarding contracts will be available for signing from their first login.
                      </div>
                    </Alert>
                  )}
                </div>

                <div>
                  <h3 style={{ marginBottom: 'var(--space-md)' }}>Assigned Contracts</h3>
                  <p style={{
                    fontSize: 'var(--font-size-body)',
                    color: 'var(--color-text-secondary)',
                    marginBottom: 'var(--space-md)'
                  }}>
                    These contracts will be presented during onboarding. Employee must sign before accessing the portal.
                  </p>

                  {contracts.length === 0 ? (
                    <div style={{
                      padding: 'var(--space-xl)',
                      textAlign: 'center',
                      color: 'var(--color-text-secondary)',
                      background: 'var(--color-gray-50)',
                      borderRadius: 'var(--border-radius-md)'
                    }}>
                      No contracts assigned yet
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-sm)'
                    }}>
                      {contracts.map(contract => (
                        <div
                          key={contract.id}
                          style={{
                            padding: '12px var(--space-md)',
                            background: 'var(--color-gray-50)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--border-radius-md)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{
                              fontSize: 'var(--font-size-body)',
                              fontWeight: 'var(--font-weight-medium)',
                              marginBottom: '2px'
                            }}>
                              {contract.template_name || 'Contract'}
                            </div>
                            <div style={{
                              fontSize: 'var(--font-size-small)',
                              color: 'var(--color-text-secondary)'
                            }}>
                              Assigned: {new Date(contract.created_at).toLocaleDateString('en-GB')}
                            </div>
                          </div>
                          <div style={{
                            fontSize: 'var(--font-size-small)',
                            fontWeight: 'var(--font-weight-medium)',
                            color: contract.signed_at ? 'var(--color-green-500)' : 'var(--color-primary)'
                          }}>
                            {contract.signed_at ? 'Signed' : 'Awaiting Signature'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button variant="secondary" style={{ marginTop: 'var(--space-md)' }}>
                    + Assign Contract Template
                  </Button>
                </div>
              </>
            )}

            {/* Other Tabs */}
            {activeTab !== 'overview' && activeTab !== 'onboarding' && (
              <div style={{
                padding: 'var(--space-xl)',
                textAlign: 'center',
                color: 'var(--color-text-secondary)'
              }}>
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} tab - Coming soon
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  )
}
