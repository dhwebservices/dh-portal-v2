import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import MobileCard from '../components/MobileCard'
import MobileButton from '../components/MobileButton'
import { supabase } from '../../utils/supabase'

export default function MobileStaffProfile({ goBack, navigate, user, staffEmail }) {
  const [profile, setProfile] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
  }, [staffEmail])

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('hr_profiles')
        .select('*')
        .eq('user_email', staffEmail)
        .single()

      if (error) throw error
      setProfile(data)
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
          <EmploymentTab profile={profile} />
        )}
        {activeTab === 'documents' && (
          <DocumentsTab profile={profile} navigate={navigate} />
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

function EmploymentTab({ profile }) {
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
    </>
  )
}

function DocumentsTab({ profile, navigate }) {
  return (
    <>
      <MobileCard>
        <h3 className="mobile-section-title">Documents</h3>
        {profile.contract_url ? (
          <MobileButton
            variant="secondary"
            fullWidth
            onPress={() => window.open(profile.contract_url, '_blank')}
          >
            📄 View Contract
          </MobileButton>
        ) : (
          <p style={{ textAlign: 'center', color: 'var(--mobile-text-secondary)' }}>
            No contract uploaded
          </p>
        )}
      </MobileCard>
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
