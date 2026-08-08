import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Browser } from '@capacitor/browser'
import MobileCard from '../components/MobileCard'
import MobileButton from '../components/MobileButton'
import Icon from '../components/Icon'
import { supabase } from '../../utils/supabase'

export default function MobileStaffProfile({ goBack, navigate, user, isAdmin, staffEmail }) {
  const [profile, setProfile] = useState(null)
  const [payment, setPayment] = useState(null)
  const [onboarding, setOnboarding] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
  }, [staffEmail])

  const loadProfile = async () => {
    try {
      const [{ data, error }, { data: permRow }, { data: staffRow }] = await Promise.all([
        supabase.from('hr_profiles').select('*').eq('user_email', staffEmail).single(),
        supabase.from('user_permissions').select('onboarding').ilike('user_email', staffEmail).maybeSingle(),
        isAdmin
          ? supabase.from('staff').select('hourly_rate, payment_type, commission_rate').eq('email', staffEmail).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      if (error) throw error
      setProfile(data)
      setOnboarding(!!permRow?.onboarding)
      setPayment(staffRow)
    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTabChange = async (tab) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    setActiveTab(tab)
  }

  if (loading) {
    return <div className="mobile-loading">Loading...</div>
  }

  if (!profile) {
    return <div className="mobile-error">Profile not found</div>
  }

  return (
    <div className="mobile-staff-profile">
      {/* Header */}
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          ← Back
        </button>
        <h1>{profile.full_name}</h1>
        <button
          className="mobile-edit-btn"
          onClick={() => navigate('edit-staff', { staffEmail })}
        >
          Edit
        </button>
      </div>

      {/* Profile Header Card */}
      <div className="mobile-profile-header">
        <div className="mobile-profile-avatar">
          {profile.full_name?.charAt(0)}
        </div>
        <h2>{profile.full_name}</h2>
        <p>{profile.role || 'Staff Member'}</p>
        <p className="mobile-profile-dept">{profile.department}</p>
      </div>

      {/* Tabs */}
      <div className="mobile-tabs-scroll">
        <button
          className={`mobile-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => handleTabChange('overview')}
        >
          Overview
        </button>
        <button
          className={`mobile-tab ${activeTab === 'personal' ? 'active' : ''}`}
          onClick={() => handleTabChange('personal')}
        >
          Personal
        </button>
        <button
          className={`mobile-tab ${activeTab === 'employment' ? 'active' : ''}`}
          onClick={() => handleTabChange('employment')}
        >
          Employment
        </button>
        <button
          className={`mobile-tab ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => handleTabChange('documents')}
        >
          Documents
        </button>
        <button
          className={`mobile-tab ${activeTab === 'permissions' ? 'active' : ''}`}
          onClick={() => handleTabChange('permissions')}
        >
          Permissions
        </button>
      </div>

      {/* Tab Content */}
      <div className="mobile-tab-content">
        {activeTab === 'overview' && (
          <OverviewTab profile={profile} />
        )}
        {activeTab === 'personal' && (
          <PersonalTab profile={profile} />
        )}
        {activeTab === 'employment' && (
          <EmploymentTab profile={profile} payment={payment} onboarding={onboarding} isAdmin={isAdmin} navigate={navigate} staffEmail={staffEmail} />
        )}
        {activeTab === 'documents' && (
          <DocumentsTab profile={profile} isAdmin={isAdmin} staffEmail={staffEmail} adminUser={user} onUpdated={loadProfile} />
        )}
        {activeTab === 'permissions' && (
          <PermissionsTab profile={profile} navigate={navigate} />
        )}
      </div>

      <style>{`
        .mobile-staff-profile {
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
        .mobile-edit-btn {
          font-size: 16px;
          color: var(--mobile-accent);
          background: none;
          border: none;
          padding: 8px 0;
          cursor: pointer;
          font-weight: 600;
        }

        .mobile-screen-header h1 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          color: var(--mobile-text);
        }

        .mobile-profile-header {
          text-align: center;
          padding: 32px 20px;
          background: var(--mobile-card);
          border-bottom: 1px solid var(--mobile-border);
        }

        .mobile-profile-avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: var(--mobile-accent);
          color: white;
          font-size: 32px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
        }

        .mobile-profile-header h2 {
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 4px 0;
          color: var(--mobile-text);
        }

        .mobile-profile-header p {
          font-size: 16px;
          color: var(--mobile-text-secondary);
          margin: 0;
        }

        .mobile-profile-dept {
          font-size: 14px !important;
          font-weight: 600;
          color: var(--mobile-accent) !important;
          margin-top: 4px !important;
        }

        .mobile-tabs-scroll {
          display: flex;
          overflow-x: auto;
          background: var(--mobile-card);
          border-bottom: 1px solid var(--mobile-border);
          padding: 0 20px;
          -webkit-overflow-scrolling: touch;
        }

        .mobile-tabs-scroll::-webkit-scrollbar {
          display: none;
        }

        .mobile-tab {
          padding: 16px 20px;
          border: none;
          background: none;
          color: var(--mobile-text-secondary);
          font-size: 15px;
          font-weight: 500;
          white-space: nowrap;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
        }

        .mobile-tab.active {
          color: var(--mobile-accent);
          border-bottom-color: var(--mobile-accent);
          font-weight: 600;
        }

        .mobile-tab-content {
          padding: 20px;
        }

        .mobile-info-row {
          display: flex;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid var(--mobile-border);
        }

        .mobile-info-row:last-child {
          border-bottom: none;
        }

        .mobile-info-label {
          font-size: 14px;
          color: var(--mobile-text-secondary);
          font-weight: 500;
        }

        .mobile-info-value {
          font-size: 15px;
          color: var(--mobile-text);
          font-weight: 600;
          text-align: right;
        }

        .mobile-section-title {
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 16px 0;
          color: var(--mobile-text);
        }

        .mobile-loading,
        .mobile-error {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          font-size: 16px;
          color: var(--mobile-text-secondary);
        }
      `}</style>
    </div>
  )
}

function OverviewTab({ profile }) {
  return (
    <>
      <MobileCard>
        <h3 className="mobile-section-title">Quick Info</h3>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Email</span>
          <span className="mobile-info-value">{profile.user_email}</span>
        </div>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Department</span>
          <span className="mobile-info-value">{profile.department || '—'}</span>
        </div>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Role</span>
          <span className="mobile-info-value">{profile.role || '—'}</span>
        </div>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Contract</span>
          <span className="mobile-info-value">{profile.contract_type || '—'}</span>
        </div>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Start Date</span>
          <span className="mobile-info-value">
            {profile.start_date ? new Date(profile.start_date).toLocaleDateString() : '—'}
          </span>
        </div>
      </MobileCard>
    </>
  )
}

function PersonalTab({ profile }) {
  return (
    <>
      <MobileCard>
        <h3 className="mobile-section-title">Personal Details</h3>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Phone</span>
          <span className="mobile-info-value">{profile.phone || '—'}</span>
        </div>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Personal Email</span>
          <span className="mobile-info-value">{profile.personal_email || '—'}</span>
        </div>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Address</span>
          <span className="mobile-info-value">{profile.address || '—'}</span>
        </div>
      </MobileCard>

      <MobileCard style={{ marginTop: '16px' }}>
        <h3 className="mobile-section-title">Banking</h3>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Bank Name</span>
          <span className="mobile-info-value">{profile.bank_name || '—'}</span>
        </div>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Account Name</span>
          <span className="mobile-info-value">{profile.account_name || '—'}</span>
        </div>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Sort Code</span>
          <span className="mobile-info-value">{profile.sort_code || '—'}</span>
        </div>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Account Number</span>
          <span className="mobile-info-value">
            {profile.account_number ? '****' + profile.account_number.slice(-4) : '—'}
          </span>
        </div>
      </MobileCard>
    </>
  )
}

function EmploymentTab({ profile, payment, onboarding, isAdmin, navigate, staffEmail }) {
  const paymentTypeLabel = {
    commission_only: 'Commission Only',
    hourly: 'Hourly Pay',
    both: 'Hourly + Commission',
  }

  return (
    <>
      <MobileCard>
        <h3 className="mobile-section-title">Employment Details</h3>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Manager</span>
          <span className="mobile-info-value">{profile.manager_name || '—'}</span>
        </div>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Manager Email</span>
          <span className="mobile-info-value">{profile.manager_email || '—'}</span>
        </div>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Contract Type</span>
          <span className="mobile-info-value">{profile.contract_type || '—'}</span>
        </div>
        <div className="mobile-info-row">
          <span className="mobile-info-label">Start Date</span>
          <span className="mobile-info-value">
            {profile.start_date ? new Date(profile.start_date).toLocaleDateString() : '—'}
          </span>
        </div>
      </MobileCard>

      {isAdmin && payment && (
        <MobileCard style={{ marginTop: 16 }}>
          <h3 className="mobile-section-title">Payment Details</h3>
          <div className="mobile-info-row">
            <span className="mobile-info-label">Payment Type</span>
            <span className="mobile-info-value">{paymentTypeLabel[payment.payment_type] || '—'}</span>
          </div>
          {(payment.payment_type === 'hourly' || payment.payment_type === 'both') && (
            <div className="mobile-info-row">
              <span className="mobile-info-label">Hourly Rate</span>
              <span className="mobile-info-value">
                {payment.hourly_rate ? `£${Number(payment.hourly_rate).toFixed(2)}` : '—'}
              </span>
            </div>
          )}
          <div className="mobile-info-row">
            <span className="mobile-info-label">Commission Rate</span>
            <span className="mobile-info-value">
              {payment.commission_rate != null ? `${payment.commission_rate}%` : '—'}
            </span>
          </div>
          <p className="onboarding-hint">
            To change payment details, edit this staff member's profile.
          </p>
        </MobileCard>
      )}

      {isAdmin && (
        <MobileCard style={{ marginTop: 16 }}>
          <h3 className="mobile-section-title">Onboarding</h3>
          <div className="mobile-info-row">
            <span className="mobile-info-label">Status</span>
            <span
              className="onboarding-status-badge"
              style={{
                background: onboarding ? 'rgba(255,149,0,0.15)' : 'rgba(52,199,89,0.15)',
                color: onboarding ? '#ff9500' : '#34c759',
              }}
            >
              {onboarding ? 'Onboarding in progress' : 'Not in onboarding'}
            </span>
          </div>
          <p className="onboarding-hint">
            {onboarding
              ? 'This staff member currently only sees the onboarding form when they open the app.'
              : 'Turn on onboarding mode to have this staff member complete their details, right-to-work document, and contract sign-off in the app.'}
          </p>
          <MobileButton
            variant="secondary"
            fullWidth
            onPress={() => navigate('edit-staff', { staffEmail })}
          >
            {onboarding ? 'Manage Onboarding' : 'Start Onboarding'}
          </MobileButton>
        </MobileCard>
      )}

      <style>{`
        .onboarding-status-badge {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
        }

        .onboarding-hint {
          font-size: 13px;
          color: var(--mobile-text-secondary);
          margin: 12px 0 16px 0;
          line-height: 1.5;
        }
      `}</style>
    </>
  )
}

function DocumentsTab({ profile, isAdmin, staffEmail, adminUser, onUpdated }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError('')
    try {
      const path = `contracts/${staffEmail.toLowerCase()}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('hr-documents').upload(path, file)
      if (uploadError) throw uploadError

      const { data: publicData } = supabase.storage.from('hr-documents').getPublicUrl(path)

      const { error: updateError } = await supabase
        .from('hr_profiles')
        .update({
          contract_url: publicData.publicUrl,
          contract_path: path,
          updated_at: new Date().toISOString(),
        })
        .eq('user_email', staffEmail)

      if (updateError) throw updateError

      await Haptics.notification({ type: NotificationType.Success })
      onUpdated?.()
    } catch (err) {
      console.error('Failed to upload contract:', err)
      setError(err.message || 'Failed to upload contract. Please try again.')
      await Haptics.notification({ type: NotificationType.Error })
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <MobileCard>
        <h3 className="mobile-section-title">Contract</h3>
        {error && <div className="documents-error">{error}</div>}

        {profile.contract_url ? (
          <MobileButton
            variant="secondary"
            fullWidth
            icon={<Icon name="file" size={18} color="#0066cc" />}
            onPress={() => Browser.open({ url: profile.contract_url })}
          >
            View Contract
          </MobileButton>
        ) : (
          <p className="documents-empty">No contract uploaded</p>
        )}

        {isAdmin && (
          <label className="contract-upload">
            <input type="file" accept="application/pdf,image/*" onChange={handleFileChange} hidden disabled={uploading} />
            <Icon name="download" size={18} color="#0066cc" />
            <span>{uploading ? 'Uploading...' : profile.contract_url ? 'Replace Contract' : 'Issue Contract'}</span>
          </label>
        )}
      </MobileCard>

      <style>{`
        .documents-empty {
          text-align: center;
          color: var(--mobile-text-secondary);
          margin: 8px 0 16px 0;
        }

        .documents-error {
          margin-bottom: 12px;
          padding: 10px 14px;
          background: rgba(255,59,48,0.1);
          border: 1px solid #ff3b30;
          border-radius: 8px;
          color: #ff3b30;
          font-size: 13px;
        }

        .contract-upload {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 12px;
          padding: 14px;
          border: 1px dashed var(--mobile-border);
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          color: #0066cc;
          cursor: pointer;
        }
      `}</style>
    </>
  )
}

function PermissionsTab({ profile, navigate }) {
  return (
    <>
      <MobileCard>
        <h3 className="mobile-section-title">Permissions</h3>
        <MobileButton
          variant="secondary"
          fullWidth
          onPress={() => navigate('edit-permissions', { staffEmail: profile.user_email })}
        >
          ⚙️ Edit Permissions
        </MobileButton>
      </MobileCard>
    </>
  )
}
