import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import SubNav from '../../components/SubNav'
import {
  Button,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  StatusBadge,
  FormInput,
  FormSelect,
  Alert
} from '../../components/ds'
import { mergeHrProfileWithOnboarding, normalizeEmail, pickBestProfileRow } from '../../utils/hrProfileSync'
import { getLifecycleLabel, mergeLifecycleRecord, TERMINATED_STATES } from '../../utils/staffLifecycle'
import { mergeOrgRecord } from '../../utils/orgStructure'
import {
  buildAccountLockRecord,
  buildAccountSecurityKey,
  buildSessionRevokeRecord,
  createDefaultAccountSecurityRecord,
  mergeAccountSecurityRecord,
} from '../../utils/accountSecurity'
import { ROLE_DEFAULTS } from '../../utils/permissionCatalog'

const TONE_TO_VARIANT = { green: 'active', amber: 'warning', red: 'error', blue: 'info', grey: 'info' }

// System mailboxes that legitimately have no Entra user behind them.
const SYSTEM_MAILBOX_PREFIXES = ['hr@', 'clients@', 'log@', 'legal@', 'noreply@', 'admin@', 'test@', 'contact@', 'jobs@', 'mgmt@']

// The reconciliation step below deletes hr_profiles/user_permissions rows for
// people who are no longer in Entra. That is only safe if we actually got a
// trustworthy user list back - a failed token, a throttled request, or the old
// hard $top=50 cap would otherwise look identical to "everyone was offboarded"
// and wipe the directory. We page the Graph call and refuse to delete anything
// unless the fetch fully succeeded and returned a plausible number of users.
const MIN_TRUSTWORTHY_GRAPH_USERS = 20

function isRecentlyActive(value) {
  if (!value) return false
  return Date.now() - new Date(value).getTime() <= 5 * 60 * 1000
}

function formatPresenceLabel(value) {
  if (!value) return 'No recent activity'
  const diffMs = Date.now() - new Date(value).getTime()
  const diffMins = Math.max(0, Math.round(diffMs / 60000))
  if (diffMins <= 1) return 'Active now'
  return `Seen ${diffMins} mins ago`
}

// mergeLifecycleRecord doesn't carry a tone, so derive it the same way the old
// My Staff page did (ported verbatim so badge colours don't change).
function lifecycleTone(state = '') {
  if (['terminated', 'termination_approved', 'left', 'archived'].includes(state)) return 'red'
  if (state === 'probation') return 'blue'
  if (state === 'onboarding') return 'amber'
  if (state.includes('termination')) return 'amber'
  return 'green'
}

const STATUS_FILTERS = [
  ['all', 'All staff'],
  ['active', 'Active'],
  ['onboarding', 'Onboarding'],
  ['attention', 'Needs attention'],
  ['terminated', 'Terminated'],
  ['active_now', 'Active now'],
]

export default function PeopleDirectory() {
  const navigate = useNavigate()
  const { instance, accounts } = useMsal()
  const {
    user, isDirector, isDepartmentManager, canViewScopedStaff, canPreviewStaffMember,
    managedDepartments, startPreviewAs, isPreviewing, previewTarget, can,
  } = useAuth()

  // Bulk permission rewrites and account suspension are director-only. Department
  // managers keep read access and impersonation for their own people.
  const canUseBulkTools = isDirector

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msUsers, setMsUsers] = useState([])
  const [profiles, setProfiles] = useState({})
  const [permsMap, setPermsMap] = useState({})
  const [lifecycleMap, setLifecycleMap] = useState({})
  const [orgMap, setOrgMap] = useState({})
  const [accountSecurityMap, setAccountSecurityMap] = useState({})
  const [search, setSearch] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkPermissionRole, setBulkPermissionRole] = useState('Staff')

  useEffect(() => { load() }, [])

  async function fetchAllGraphUsers(accessToken) {
    // Page through Graph rather than taking the first 50 - a truncated list
    // previously looked the same as "these people left" to the purge below.
    const collected = []
    let url = 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,jobTitle&$top=999'
    while (url) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!res.ok) throw new Error(`Graph request failed (${res.status})`)
      const data = await res.json()
      collected.push(...(data.value || []))
      url = data['@odata.nextLink'] || null
    }
    return collected.map((u) => ({ id: u.id, name: u.displayName, email: u.userPrincipalName, jobTitle: u.jobTitle }))
  }

  const load = async () => {
    setLoading(true)
    let graphTrustworthy = false
    let activeUsers = []

    try {
      const account = accounts[0]
      const token = await instance.acquireTokenSilent({ scopes: ['https://graph.microsoft.com/User.Read.All'], account })
        .catch(() => instance.acquireTokenPopup({ scopes: ['https://graph.microsoft.com/User.Read.All'], account }))
      activeUsers = await fetchAllGraphUsers(token.accessToken)
      setMsUsers(activeUsers)
      graphTrustworthy = activeUsers.length >= MIN_TRUSTWORTHY_GRAPH_USERS
      setError(graphTrustworthy
        ? ''
        : `Entra returned only ${activeUsers.length} users, which is fewer than expected — directory cleanup was skipped this load to avoid removing records incorrectly.`)
    } catch (err) {
      console.warn('Entra user sync failed:', err)
      setMsUsers([])
      setError('Could not reach Microsoft Entra. Showing stored records only; directory cleanup was skipped.')
    }

    try {
      // Reconciliation: collapse case-variant duplicate profiles, and remove
      // records for people who have genuinely left Entra. Skipped entirely
      // unless the Graph list above is trustworthy.
      if (graphTrustworthy) {
        const activeEmails = new Set(activeUsers.map((u) => normalizeEmail(u.email)))
        const [{ data: allProfiles }, { data: lifecycleSettings }] = await Promise.all([
          supabase.from('hr_profiles').select('id,user_email'),
          supabase.from('portal_settings').select('key,value').like('key', 'staff_lifecycle:%'),
        ])

        const lifecycleStateMap = {}
        for (const row of lifecycleSettings || []) {
          const email = normalizeEmail(String(row.key || '').replace('staff_lifecycle:', ''))
          const record = mergeLifecycleRecord(row.value?.value ?? row.value ?? {})
          if (email) lifecycleStateMap[email] = record.state || ''
        }

        const duplicateGroups = {}
        for (const row of allProfiles || []) {
          const email = normalizeEmail(row.user_email)
          if (!email) continue
          duplicateGroups[email] = duplicateGroups[email] || []
          duplicateGroups[email].push(row)
        }

        const duplicateDeletes = []
        for (const rows of Object.values(duplicateGroups)) {
          if (rows.length < 2) continue
          const keep = pickBestProfileRow(rows)
          duplicateDeletes.push(...rows.filter((row) => row.id !== keep.id).map((row) => row.id))
        }

        const staleProfiles = (allProfiles || []).filter((row) => {
          const email = normalizeEmail(row.user_email)
          if (!email) return false
          if (activeEmails.has(email)) return false
          if (SYSTEM_MAILBOX_PREFIXES.some((prefix) => email.startsWith(prefix))) return false
          if (TERMINATED_STATES.has(lifecycleStateMap[email] || '')) return false
          return true
        })

        const staleIds = staleProfiles.map((row) => row.id)
        const staleEmails = staleProfiles.map((row) => normalizeEmail(row.user_email))
        const idsToDelete = [...new Set([...duplicateDeletes, ...staleIds])]

        if (idsToDelete.length) await supabase.from('hr_profiles').delete().in('id', idsToDelete)
        for (const email of staleEmails) {
          await supabase.from('user_permissions').delete().ilike('user_email', email)
        }
      }

      const [permsRes, profilesRes, onboardingRes, lifecycleRes, orgRes, securityRes] = await Promise.all([
        supabase.from('user_permissions').select('*'),
        supabase.from('hr_profiles').select('*'),
        supabase.from('onboarding_submissions').select('*'),
        supabase.from('portal_settings').select('key,value').like('key', 'staff_lifecycle:%'),
        supabase.from('portal_settings').select('key,value').like('key', 'staff_org:%'),
        supabase.from('portal_settings').select('key,value').like('key', 'account_security:%'),
      ])

      const nextPerms = {}
      for (const row of permsRes.data || []) {
        nextPerms[normalizeEmail(row.user_email)] = {
          perms: row.permissions,
          onboarding: row.onboarding,
          bookable_staff: row.bookable_staff,
        }
      }
      setPermsMap(nextPerms)

      const nextProfiles = {}
      for (const row of profilesRes.data || []) {
        nextProfiles[normalizeEmail(row.user_email)] = row
      }
      for (const submission of onboardingRes.data || []) {
        const email = normalizeEmail(submission.user_email)
        if (!email) continue
        nextProfiles[email] = mergeHrProfileWithOnboarding(nextProfiles[email] || { user_email: email }, submission)
      }
      setProfiles(nextProfiles)

      const nextLifecycle = {}
      for (const row of lifecycleRes.data || []) {
        const email = normalizeEmail(String(row.key || '').replace('staff_lifecycle:', ''))
        if (email) nextLifecycle[email] = mergeLifecycleRecord(row.value?.value ?? row.value ?? {})
      }
      setLifecycleMap(nextLifecycle)

      const nextOrg = {}
      for (const row of orgRes.data || []) {
        const email = normalizeEmail(String(row.key || '').replace('staff_org:', ''))
        if (email) nextOrg[email] = mergeOrgRecord(row.value?.value ?? row.value ?? {}, { email })
      }
      setOrgMap(nextOrg)

      const nextSecurity = {}
      for (const row of securityRes.data || []) {
        const email = normalizeEmail(String(row.key || '').replace('account_security:', ''))
        if (email) nextSecurity[email] = mergeAccountSecurityRecord(row.value?.value ?? row.value ?? {})
      }
      setAccountSecurityMap(nextSecurity)
    } catch (err) {
      console.error('Failed to load staff directory:', err)
      setError((current) => current || (err?.message || 'Could not load the staff directory.'))
    } finally {
      setLoading(false)
    }
  }

  // ── Derived rows ────────────────────────────────────────────────────────
  const staffRecords = [...new Set([
    ...msUsers.map((u) => normalizeEmail(u.email)),
    ...Object.keys(profiles),
    ...Object.keys(lifecycleMap),
  ])]
    .filter(Boolean)
    .map((safeEmail) => {
      const azureUser = msUsers.find((u) => normalizeEmail(u.email) === safeEmail)
      const profile = profiles[safeEmail] || {}
      const userPm = permsMap[safeEmail]
      const isOnboarding = userPm?.onboarding || false
      const lifecycle = lifecycleMap[safeEmail] || mergeLifecycleRecord({}, {
        onboarding: isOnboarding,
        startDate: profile.start_date,
        contractType: profile.contract_type,
      })
      const targetOrg = orgMap[safeEmail] || mergeOrgRecord({}, { email: safeEmail, department: profile.department })
      return {
        id: azureUser?.id || safeEmail,
        name: profile.full_name || azureUser?.name || safeEmail,
        email: safeEmail,
        jobTitle: azureUser?.jobTitle || '',
        profile,
        targetOrg,
        lifecycle,
        isOnboarding,
        isFromAzure: !!azureUser,
        security: accountSecurityMap[safeEmail] || createDefaultAccountSecurityRecord(),
      }
    })
    // Keep terminated records visible for the audit trail, otherwise only show
    // people who still exist in Entra. When Entra is unreachable msUsers is
    // empty, so fall back to showing every stored profile rather than nothing.
    .filter((record) => {
      if (!msUsers.length) return true
      if (TERMINATED_STATES.has(record.lifecycle.state || '')) return true
      return record.isFromAzure
    })
    // Row-level scoping: directors see everyone, department managers only see
    // the departments they manage.
    .filter((record) => isDirector || canViewScopedStaff(record.profile, record.targetOrg))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const filtered = staffRecords.filter((staff) => {
    const q = search.toLowerCase()
    const profile = staff.profile || {}
    const lifecycleState = staff.lifecycle.state || (staff.isOnboarding ? 'onboarding' : 'active')
    const department = staff.targetOrg?.department || profile.department || 'Unassigned'

    const statusMatches =
      filterStatus === 'all' ||
      (filterStatus === 'active' && ['active', 'probation'].includes(lifecycleState)) ||
      (filterStatus === 'onboarding' && lifecycleState === 'onboarding') ||
      (filterStatus === 'attention' && ['termination_requested', 'termination_pending', 'termination_approved', 'terminated', 'left', 'archived'].includes(lifecycleState)) ||
      (filterStatus === 'terminated' && TERMINATED_STATES.has(lifecycleState)) ||
      (filterStatus === 'active_now' && isRecentlyActive(profile.last_seen))

    const departmentMatches = filterDepartment === 'all' || department === filterDepartment

    const searchMatches = !q
      || staff.name?.toLowerCase().includes(q)
      || staff.email?.toLowerCase().includes(q)
      || profile.department?.toLowerCase().includes(q)
      || profile.role?.toLowerCase().includes(q)

    return statusMatches && departmentMatches && searchMatches
  })

  const activeStaff = filtered.filter((s) => !TERMINATED_STATES.has(s.lifecycle?.state || ''))
  const terminatedStaff = filtered.filter((s) => TERMINATED_STATES.has(s.lifecycle?.state || ''))
  const activeCount = activeStaff.filter((s) => isRecentlyActive(s.profile?.last_seen)).length
  const onboardingCount = activeStaff.filter((s) => (s.lifecycle?.state || '') === 'onboarding').length
  const unassignedUsers = activeStaff.filter((s) => !String(s.targetOrg?.department || s.profile?.department || '').trim())

  const departments = [...new Set(staffRecords
    .map((s) => s.targetOrg?.department || s.profile?.department || 'Unassigned'))].sort()

  // ── Actions ─────────────────────────────────────────────────────────────
  const toggleSelectedUser = (email) => {
    const safeEmail = normalizeEmail(email)
    setSelectedUsers((current) => current.includes(safeEmail)
      ? current.filter((item) => item !== safeEmail)
      : [...current, safeEmail])
  }

  const clearSelectedUsers = () => setSelectedUsers([])

  const impersonate = async (staff) => {
    if (!confirm(`Log in as ${staff.name}? You will see the portal exactly as they do.`)) return
    try {
      await startPreviewAs({ email: staff.email, name: staff.name })
      navigate('/dashboard')
    } catch (err) {
      alert(err?.message || 'Could not start impersonation.')
    }
  }

  const applyBulkPermissions = async () => {
    if (!canUseBulkTools || !selectedUsers.length) return
    const preset = ROLE_DEFAULTS[bulkPermissionRole]
    if (!preset) return
    if (!confirm(`Overwrite portal permissions for ${selectedUsers.length} ${selectedUsers.length === 1 ? 'person' : 'people'} with the ${bulkPermissionRole} preset?`)) return
    setBulkSaving(true)
    try {
      const rows = selectedUsers.map((safeEmail) => {
        const existing = permsMap[safeEmail] || {}
        return {
          user_email: safeEmail,
          permissions: { ...preset },
          onboarding: existing.onboarding === true,
          bookable_staff: existing.bookable_staff === true,
          updated_at: new Date().toISOString(),
        }
      })
      const { error: upsertError } = await supabase.from('user_permissions').upsert(rows, { onConflict: 'user_email' })
      if (upsertError) throw upsertError
      await load()
      clearSelectedUsers()
    } catch (err) {
      alert(err?.message || 'Could not update permissions.')
    } finally {
      setBulkSaving(false)
    }
  }

  const applyBulkSecurity = async (mode) => {
    if (!canUseBulkTools || !selectedUsers.length) return
    const confirmCopy = {
      relogin: `Force ${selectedUsers.length} ${selectedUsers.length === 1 ? 'person' : 'people'} to sign in again?`,
      suspend: `Suspend portal access for ${selectedUsers.length} ${selectedUsers.length === 1 ? 'person' : 'people'}? They will be signed out immediately.`,
      restore: `Restore portal access for ${selectedUsers.length} ${selectedUsers.length === 1 ? 'person' : 'people'}?`,
    }[mode]
    if (confirmCopy && !confirm(confirmCopy)) return

    setBulkSaving(true)
    try {
      const actor = { actorEmail: user?.email || '', actorName: user?.name || '' }
      const rows = selectedUsers.map((safeEmail) => {
        const current = accountSecurityMap[safeEmail] || createDefaultAccountSecurityRecord()
        if (mode === 'relogin') {
          return { key: buildAccountSecurityKey(safeEmail), value: { value: buildSessionRevokeRecord(current, actor) } }
        }
        if (mode === 'suspend') {
          const lockedRecord = buildAccountLockRecord(current, {
            locked: true,
            reason: current.lock_reason || 'Portal access suspended by admin.',
            ...actor,
          })
          return { key: buildAccountSecurityKey(safeEmail), value: { value: buildSessionRevokeRecord(lockedRecord, actor) } }
        }
        return {
          key: buildAccountSecurityKey(safeEmail),
          value: { value: buildAccountLockRecord(current, { locked: false, reason: '', ...actor }) },
        }
      })
      const { error: upsertError } = await supabase.from('portal_settings').upsert(rows, { onConflict: 'key' })
      if (upsertError) throw upsertError
      await load()
      clearSelectedUsers()
    } catch (err) {
      alert(err?.message || 'Could not update account access.')
    } finally {
      setBulkSaving(false)
    }
  }

  function formatDate(dateString) {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const getInitials = (name) => (name || '?').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  const DS_CARD = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)' }

  if (loading) {
    return (
      <div className="ds-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
          <div>Loading staff directory...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>People</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {activeStaff.length} active staff · {terminatedStaff.length} terminated records · {activeCount} active now
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <SubNav items={[
        { label: 'Directory', active: filterStatus !== 'onboarding', onClick: () => setFilterStatus('all') },
        { label: 'New Starters', active: filterStatus === 'onboarding', onClick: () => setFilterStatus('onboarding') },
        can('hr_profiles') && { label: 'HR Profiles', onClick: () => navigate('/hr/profiles') },
        can('hr_onboarding') && { label: 'HR Onboarding', onClick: () => navigate('/hr/onboarding') },
        can('hr_policies') && { label: 'HR Policies', onClick: () => navigate('/hr/policies') },
        can('hr_leave') && { label: 'Leave', onClick: () => navigate('/hr/leave') },
        can('hr_timesheet') && { label: 'Timesheets', onClick: () => navigate('/hr/timesheets') },
        can('hr_documents') && { label: 'Documents', onClick: () => navigate('/hr/documents') },
        can('contract_queue') && { label: 'Contract Queue', onClick: () => navigate('/contract-queue') },
        can('contract_templates') && { label: 'Contract Templates', onClick: () => navigate('/contract-templates') },
        can('org_chart') && { label: 'Org Chart', onClick: () => navigate('/org-chart') },
        can('my_team') && { label: 'My Team', onClick: () => navigate('/my-team') },
        can('my_department') && { label: 'My Department', onClick: () => navigate('/my-department') },
      ]} />

      {error ? <div style={{ marginBottom: 16 }}><Alert variant="warning">{error}</Alert></div> : null}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 20 }}>
        {[
          [isDirector ? 'Active staff' : 'Visible staff', activeStaff.length, 'var(--color-text-primary)'],
          ['Active now', activeCount, 'var(--color-green-500)'],
          ['Onboarding', onboardingCount, 'var(--color-amber-500)'],
          ['Terminated', terminatedStaff.length, 'var(--color-red-500)'],
          ['Unassigned', unassignedUsers.length, 'var(--color-text-primary)'],
        ].map(([label, value, colour]) => (
          <div key={label} style={{ ...DS_CARD, padding: 20 }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: colour }}>{value}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {!isDirector && managedDepartments.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Alert variant="info">
            Scoped view — you are seeing staff in {managedDepartments.filter((d) => d !== '*').join(', ') || 'your departments'}.
          </Alert>
        </div>
      )}

      {/* Bulk action bar (directors only) */}
      {canUseBulkTools && selectedUsers.length > 0 && (
        <div style={{ ...DS_CARD, padding: 16, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
            {selectedUsers.length} selected
          </strong>
          <FormSelect
            value={bulkPermissionRole}
            onChange={(e) => setBulkPermissionRole(e.target.value)}
            style={{ minWidth: 180 }}
            disabled={bulkSaving}
          >
            {Object.keys(ROLE_DEFAULTS).map((role) => <option key={role} value={role}>{role}</option>)}
          </FormSelect>
          <Button variant="primary" onClick={applyBulkPermissions} disabled={bulkSaving}>Apply permissions</Button>
          <Button variant="secondary" onClick={() => applyBulkSecurity('relogin')} disabled={bulkSaving}>Force re-login</Button>
          <Button variant="secondary" style={{ color: 'var(--color-red-500)' }} onClick={() => applyBulkSecurity('suspend')} disabled={bulkSaving}>Suspend access</Button>
          <Button variant="secondary" onClick={() => applyBulkSecurity('restore')} disabled={bulkSaving}>Restore access</Button>
          <Button variant="ghost" onClick={clearSelectedUsers} disabled={bulkSaving}>Clear</Button>
        </div>
      )}

      {/* Status filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map(([key, label]) => (
          <Button
            key={key}
            variant={filterStatus === key ? 'primary' : 'secondary'}
            style={{ height: 30, fontSize: 12, padding: '0 10px' }}
            onClick={() => setFilterStatus(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div style={{ ...DS_CARD, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '12px', alignItems: 'center', background: 'var(--color-gray-50)' }}>
          <FormInput
            placeholder="Search by name, email, department or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, maxWidth: '400px', fontSize: '14px', height: '36px' }}
          />
          <FormSelect
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            style={{ minWidth: '160px', height: '36px' }}
          >
            <option value="all">All Departments</option>
            {departments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
          </FormSelect>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {filtered.length} {filtered.length === 1 ? 'person' : 'people'}
          </div>
        </div>

        <table className="ds-table">
          <TableHeader>
            <TableRow>
              {canUseBulkTools && <TableHead style={{ width: '4%' }}></TableHead>}
              <TableHead style={{ width: '26%' }}>Person</TableHead>
              <TableHead style={{ width: '16%' }}>Role</TableHead>
              <TableHead style={{ width: '16%' }}>Department</TableHead>
              <TableHead style={{ width: '10%' }}>Manager</TableHead>
              <TableHead style={{ width: '12%' }}>Status</TableHead>
              <TableHead style={{ width: '10%' }}>Start Date</TableHead>
              <TableHead style={{ width: '6%' }}></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canUseBulkTools ? 8 : 7} style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
                  No staff found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((staff) => {
                const profile = staff.profile || {}
                const lifecycleState = staff.lifecycle.state || (staff.isOnboarding ? 'onboarding' : 'active')
                const tone = lifecycleTone(lifecycleState)
                const isSuspended = staff.security?.portal_access_locked === true
                const isCurrentImpersonation = isPreviewing && normalizeEmail(previewTarget?.email) === staff.email
                const canImpersonate = (isDirector || isDepartmentManager)
                  && canPreviewStaffMember(profile, staff.targetOrg)
                  && !TERMINATED_STATES.has(lifecycleState)

                return (
                  <TableRow
                    key={staff.email}
                    onClick={() => navigate(`/staff-profile/${encodeURIComponent(staff.email)}`)}
                    style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                  >
                    {canUseBulkTools && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(staff.email)}
                          onChange={() => toggleSelectedUser(staff.email)}
                          style={{ width: 16, height: 16, accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%',
                          background: 'linear-gradient(135deg, #0066CC 0%, #0052A3 100%)',
                          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: 600, flexShrink: 0,
                        }}>
                          {getInitials(staff.name)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '14px', color: 'var(--color-text-primary)', marginBottom: '2px' }}>
                            {staff.name}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{staff.email}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                            {formatPresenceLabel(profile.last_seen)}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        {profile.role || staff.jobTitle || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                        {staff.targetOrg?.department || profile.department || 'Unassigned'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        {staff.targetOrg?.manager_name || profile.manager_name || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <StatusBadge variant={TONE_TO_VARIANT[tone] || 'info'}>
                          {getLifecycleLabel(lifecycleState)}
                        </StatusBadge>
                        {isSuspended && <StatusBadge variant="error">Suspended</StatusBadge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                        {formatDate(profile.start_date)}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {canImpersonate && (
                        <Button
                          variant={isCurrentImpersonation ? 'primary' : 'secondary'}
                          style={{ height: 28, fontSize: 12, padding: '0 8px' }}
                          onClick={() => impersonate(staff)}
                        >
                          {isCurrentImpersonation ? 'Impersonating' : 'Impersonate'}
                        </Button>
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
