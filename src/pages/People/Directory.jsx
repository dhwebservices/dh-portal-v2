import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  Button,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  StatusBadge,
  FormInput,
  FormSelect
} from '../../components/ds'

export default function PeopleDirectory() {
  const navigate = useNavigate()
  const { isDirector, isDepartmentManager, startPreviewAs } = useAuth()
  const canImpersonate = isDirector || isDepartmentManager
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState([])
  const [search, setSearch] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // Load REAL staff data from database (no fake data!)
  useEffect(() => {
    loadStaffData()
  }, [])

  async function loadStaffData() {
    try {
      setLoading(true)

      // Query REAL staff data from multiple tables
      const [profilesRes, permissionsRes, lifecycleSettingsRes, onboardingRes] = await Promise.all([
        supabase.from('hr_profiles').select('*'),
        supabase.from('user_permissions').select('*'),
        supabase.from('portal_settings').select('key,value').like('key', 'staff_lifecycle:%'),
        supabase.from('onboarding_submissions').select('user_email,status')
      ])

      if (profilesRes.error) throw profilesRes.error
      if (permissionsRes.error) throw permissionsRes.error

      // Parse lifecycle settings
      const lifecycleMap = {}
      if (lifecycleSettingsRes.data) {
        lifecycleSettingsRes.data.forEach(setting => {
          const email = setting.key.replace('staff_lifecycle:', '')
          lifecycleMap[email.toLowerCase()] = setting.value?.state || null
        })
      }

      // Parse onboarding status
      const onboardingMap = {}
      if (onboardingRes.data) {
        onboardingRes.data.forEach(sub => {
          onboardingMap[sub.user_email.toLowerCase()] = sub.status
        })
      }

      // Merge profiles with all data
      const merged = (profilesRes.data || []).map(profile => {
        const email = profile.user_email.toLowerCase()
        const perms = permissionsRes.data?.find(p => p.user_email.toLowerCase() === email)
        const lifecycleState = lifecycleMap[email]
        const onboardingStatus = onboardingMap[email]

        return {
          ...profile,
          role: perms?.role || 'Staff',
          status: determineStatus(lifecycleState, onboardingStatus, profile),
          department: profile.department || 'Unassigned'
        }
      })

      // Sort by name
      merged.sort((a, b) => {
        const nameA = a.full_name || a.user_email
        const nameB = b.full_name || b.user_email
        return nameA.localeCompare(nameB)
      })

      setStaff(merged)
    } catch (error) {
      console.error('Failed to load staff:', error)
    } finally {
      setLoading(false)
    }
  }

  function determineStatus(lifecycleState, onboardingStatus, profile) {
    // Check lifecycle state first (most authoritative)
    if (lifecycleState === 'terminated' || lifecycleState === 'resigned' || lifecycleState === 'dismissed') {
      return 'terminated'
    }

    if (lifecycleState === 'on_leave' || lifecycleState === 'sabbatical') {
      return 'leave'
    }

    // Check if in onboarding flow
    if (onboardingStatus && onboardingStatus !== 'completed') {
      return 'onboarding'
    }

    // Check if start date is in future
    const startDate = profile.start_date ? new Date(profile.start_date) : null
    const today = new Date()
    if (startDate && startDate > today) {
      return 'onboarding'
    }

    // Default to active
    return 'active'
  }

  // Filter staff based on search and filters
  const filteredStaff = staff.filter(person => {
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      const nameMatch = person.full_name?.toLowerCase().includes(searchLower)
      const emailMatch = person.user_email?.toLowerCase().includes(searchLower)
      if (!nameMatch && !emailMatch) return false
    }

    // Department filter
    if (filterDepartment !== 'all' && person.department !== filterDepartment) {
      return false
    }

    // Status filter
    if (filterStatus !== 'all' && person.status !== filterStatus) {
      return false
    }

    return true
  })

  // Get unique departments for filter dropdown
  const departments = [...new Set(staff.map(s => s.department))].sort()

  function handleRowClick(person) {
    navigate(`/staff-profile/${encodeURIComponent(person.user_email)}`)
  }

  async function impersonate(person) {
    if (!confirm(`Log in as ${person.full_name || person.user_email}? You will see the portal exactly as they do.`)) return
    try {
      await startPreviewAs({
        email: person.user_email?.toLowerCase(),
        name: person.full_name || person.user_email,
      })
      navigate('/dashboard')
    } catch (error) {
      alert(error?.message || 'Could not start impersonation.')
    }
  }

  function formatDate(dateString) {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px'
      }}>
        <div>Loading staff directory...</div>
      </div>
    )
  }

  return (
    <div className="ds-content">
      {/* Page Header */}
      <div className="ds-page-header">
        <div>
          <h1>People</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Auto-synced from Microsoft Entra · {staff.length} {staff.length === 1 ? 'person' : 'people'}
          </p>
        </div>
      </div>

      {/* Sub Navigation */}
      <div style={{
        marginBottom: 'var(--space-lg)',
        display: 'flex',
        gap: 'var(--space-lg)',
        borderBottom: '1px solid var(--color-border)'
      }}>
        <div style={{
          padding: 'var(--space-sm) 0',
          fontSize: 'var(--font-size-body)',
          color: 'var(--color-text-primary)',
          borderBottom: '2px solid var(--color-text-primary)',
          marginBottom: '-1px'
        }}>
          Directory
        </div>
        <div style={{
          padding: 'var(--space-sm) 0',
          fontSize: 'var(--font-size-body)',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer'
        }}
        onClick={() => navigate('/people/onboarding')}
        >
          Onboarding
        </div>
        <div style={{
          padding: 'var(--space-sm) 0',
          fontSize: 'var(--font-size-body)',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer'
        }}>
          Leave
        </div>
        <div style={{
          padding: 'var(--space-sm) 0',
          fontSize: 'var(--font-size-body)',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer'
        }}>
          Documents
        </div>
        <div style={{
          padding: 'var(--space-sm) 0',
          fontSize: 'var(--font-size-body)',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer'
        }}>
          Settings
        </div>
      </div>

      {/* Table with Filters */}
      <div style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg)',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
      }}>
        {/* Table Controls */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          background: '#FAFAFA'
        }}>
          <FormInput
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              maxWidth: '400px',
              fontSize: '14px',
              height: '36px'
            }}
          />
          <FormSelect
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            style={{ minWidth: '160px', height: '36px' }}
          >
            <option value="all">All Departments</option>
            {departments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </FormSelect>
          <FormSelect
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ minWidth: '140px', height: '36px' }}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="onboarding">Onboarding</option>
            <option value="leave">On Leave</option>
          </FormSelect>
          <div style={{
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
            marginLeft: 'auto',
            whiteSpace: 'nowrap'
          }}>
            {filteredStaff.length} {filteredStaff.length === 1 ? 'person' : 'people'}
          </div>
        </div>

        {/* Table */}
        <table className="ds-table">
          <TableHeader>
            <TableRow>
              <TableHead style={{ width: '30%' }}>Person</TableHead>
              <TableHead style={{ width: '18%' }}>Role</TableHead>
              <TableHead style={{ width: '18%' }}>Department</TableHead>
              <TableHead style={{ width: '14%' }}>Status</TableHead>
              <TableHead style={{ width: '12%' }}>Start Date</TableHead>
              <TableHead style={{ width: '8%' }}></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStaff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
                  No staff found
                </TableCell>
              </TableRow>
            ) : (
              filteredStaff.map(person => {
                const initials = person.full_name
                  ? person.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                  : person.user_email[0].toUpperCase()

                return (
                  <TableRow
                    key={person.user_email}
                    onClick={() => handleRowClick(person)}
                    style={{
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <TableCell>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #0066CC 0%, #0052A3 100%)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 600,
                          flexShrink: 0
                        }}>
                          {initials}
                        </div>
                        <div>
                          <div style={{
                            fontWeight: 500,
                            fontSize: '14px',
                            color: 'var(--color-text-primary)',
                            marginBottom: '2px'
                          }}>
                            {person.full_name || 'No Name'}
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: 'var(--color-text-secondary)'
                          }}>
                            {person.user_email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        {person.role}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                        {person.department}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge variant={
                        person.status === 'active' ? 'active' :
                        person.status === 'onboarding' ? 'info' :
                        person.status === 'leave' ? 'warning' :
                        person.status === 'terminated' ? 'error' :
                        'info'
                      }>
                        {person.status === 'active' ? 'Active' :
                         person.status === 'onboarding' ? 'Onboarding' :
                         person.status === 'leave' ? 'On Leave' :
                         person.status === 'terminated' ? 'Terminated' :
                         'Active'}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                        {formatDate(person.start_date)}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {canImpersonate && (
                      <button
                        onClick={() => impersonate(person)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: 'var(--color-primary)',
                          background: 'transparent',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--border-radius-sm)',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--color-bg-hover)'
                          e.currentTarget.style.borderColor = 'var(--color-primary)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.borderColor = 'var(--color-border)'
                        }}
                      >
                        Impersonate
                      </button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </table>
      </div>
    </div>
  )
}
