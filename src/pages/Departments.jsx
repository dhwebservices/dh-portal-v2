import { useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { Building2, CheckCircle2, FolderPlus, Users } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { mergeHrProfileWithOnboarding } from '../utils/hrProfileSync'
import {
  buildDepartmentCatalogKey,
  buildDepartmentRequestKey,
  buildStaffOrgKey,
  createDepartmentRequest,
  createDepartmentSkeleton,
  mergeDepartmentCatalog,
  mergeOrgRecord,
} from '../utils/orgStructure'
import { sendManagedNotification } from '../utils/notificationPreferences'

function normalizePortalEmail(value = '') {
  return String(value || '').toLowerCase().trim()
}

function isNonStaffAccount(row = {}) {
  const email = normalizePortalEmail(row.user_email)
  const name = String(row.full_name || '').toLowerCase().trim()
  const blockedPrefixes = ['hr@', 'clients@', 'log@', 'legal@', 'noreply@', 'admin@', 'test@']
  if (!email) return true
  if (blockedPrefixes.some((prefix) => email.startsWith(prefix))) return true
  return name === 'admin' || name === 'legal' || name.includes('no reply') || name.includes('outreach log')
}

function buildHrProfilePayload(staffRow = {}, departmentMeta = {}, departmentName = '') {
  const userEmail = normalizePortalEmail(staffRow.user_email)
  const fullName = String(staffRow.full_name || staffRow.name || userEmail).trim()
  return {
    user_email: userEmail,
    full_name: fullName,
    role: String(staffRow.role || '').trim(),
    department: departmentName,
    manager_email: normalizePortalEmail(departmentMeta?.manager_email),
    manager_name: String(departmentMeta?.manager_name || '').trim(),
    phone: String(staffRow.phone || '').trim(),
    personal_email: String(staffRow.personal_email || '').trim(),
    address: String(staffRow.address || '').trim(),
    contract_type: String(staffRow.contract_type || '').trim(),
    start_date: staffRow.start_date || null,
    hr_notes: String(staffRow.hr_notes || '').trim(),
    bank_name: String(staffRow.bank_name || '').trim(),
    account_name: String(staffRow.account_name || '').trim(),
    sort_code: String(staffRow.sort_code || '').trim(),
    account_number: String(staffRow.account_number || '').trim(),
    updated_at: new Date().toISOString(),
  }
}

async function notifyDepartmentPlacement({ staffRow, departmentName, departmentMeta, roleScope = 'staff', sentBy }) {
  if (!staffRow?.user_email || !departmentName) return
  const managerName = String(departmentMeta?.manager_name || 'No department manager assigned').trim()
  const managerEmail = normalizePortalEmail(departmentMeta?.manager_email)
  const roleLabel = roleScope === 'department_manager' ? 'Department Manager' : roleScope === 'read_only' ? 'Read Only' : 'Staff'

  await sendManagedNotification({
    userEmail: staffRow.user_email,
    userName: staffRow.full_name || staffRow.user_email,
    category: 'urgent',
    type: 'success',
    title: 'Department assignment confirmed',
    message: managerEmail
      ? `You have been assigned to ${departmentName} as ${roleLabel}. Your department manager is ${managerName} (${managerEmail}).`
      : `You have been assigned to ${departmentName} as ${roleLabel}. A department manager has not been set yet.`,
    link: '/my-profile',
    emailSubject: `Department assignment — ${departmentName}`,
    sentBy,
    fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
    forceImportant: true,
  }).catch(() => {})
}

async function notifyDepartmentRemoval({ staffRow, previousDepartment, sentBy }) {
  if (!staffRow?.user_email) return
  await sendManagedNotification({
    userEmail: staffRow.user_email,
    userName: staffRow.full_name || staffRow.user_email,
    category: 'urgent',
    type: 'warning',
    title: 'Department assignment removed',
    message: previousDepartment
      ? `You have been removed from ${previousDepartment}. Your department assignment is now unassigned pending the next update.`
      : 'Your department assignment has been removed. Your profile is now unassigned pending the next update.',
    link: '/my-profile',
    emailSubject: previousDepartment ? `Department removed — ${previousDepartment}` : 'Department assignment removed',
    sentBy,
    fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
    forceImportant: true,
  }).catch(() => {})
}

function Metric({ icon: Icon, label, value, hint, accent = 'var(--accent)' }) {
  return (
    <div className="stat-card">
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Icon size={18} color={accent} />
      </div>
      <div className="stat-val">{value}</div>
      <div className="stat-lbl">{label}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--sub)', lineHeight: 1.5 }}>{hint}</div>
    </div>
  )
}

async function readOrgRecord(email = '', department = '') {
  const safeEmail = normalizePortalEmail(email)
  if (!safeEmail) return mergeOrgRecord({}, { email: safeEmail, department })
  const { data } = await supabase
    .from('portal_settings')
    .select('value')
    .eq('key', buildStaffOrgKey(safeEmail))
    .maybeSingle()

  return mergeOrgRecord(data?.value?.value ?? data?.value ?? {}, {
    email: safeEmail,
    department,
  })
}

async function writeOrgRecord(email = '', value = {}, department = '') {
  const safeEmail = normalizePortalEmail(email)
  if (!safeEmail) return
  await supabase.from('portal_settings').upsert({
    key: buildStaffOrgKey(safeEmail),
    value: {
      value: mergeOrgRecord(value, { email: safeEmail, department }),
    },
  }, { onConflict: 'key' })
}

export default function Departments() {
  const { isDirector, user } = useAuth()
  const { instance, accounts } = useMsal()
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [catalog, setCatalog] = useState([])
  const [profiles, setProfiles] = useState([])
  const [requests, setRequests] = useState([])
  const [newDepartment, setNewDepartment] = useState('')
  const [assignments, setAssignments] = useState({})
  const [error, setError] = useState('')
  const [renameMap, setRenameMap] = useState({})

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    let microsoftUsers = []
    try {
      const account = accounts[0]
      if (account) {
        const token = await instance.acquireTokenSilent({ scopes: ['https://graph.microsoft.com/User.Read.All'], account })
          .catch(() => instance.acquireTokenPopup({ scopes: ['https://graph.microsoft.com/User.Read.All'], account }))
        const res = await fetch('https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,jobTitle&$top=80', {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        })
        const data = await res.json()
        microsoftUsers = (data.value || []).map((row) => ({
          user_email: String(row.userPrincipalName || '').toLowerCase(),
          full_name: row.displayName || row.userPrincipalName,
          role: row.jobTitle || '',
          department: '',
        }))
      }
    } catch (_) {}

    const [{ data: hrd }, { data: onboarding }, { data: catalogRow }, { data: orgSettings }, { data: requestRows }] = await Promise.all([
      supabase.from('hr_profiles').select('*').order('full_name'),
      supabase.from('onboarding_submissions').select('*'),
      supabase.from('portal_settings').select('value').eq('key', buildDepartmentCatalogKey()).maybeSingle(),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_org:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'department_request:%'),
    ])

    const onboardingMap = Object.fromEntries((onboarding || []).map((row) => [String(row.user_email || '').toLowerCase(), row]))
    const orgMap = Object.fromEntries((orgSettings || []).map((row) => [
      String(row.key || '').replace('staff_org:', '').toLowerCase(),
      mergeOrgRecord(row.value?.value ?? row.value ?? {}),
    ]))

    const mergedProfiles = (hrd || []).map((row) => {
      const safeEmail = String(row.user_email || '').toLowerCase()
      const merged = mergeHrProfileWithOnboarding(row, onboardingMap[safeEmail])
      return {
        ...merged,
        org: orgMap[safeEmail] || mergeOrgRecord({}, { email: safeEmail, department: merged.department }),
      }
    })

    const filteredProfiles = mergedProfiles.filter((row) => !isNonStaffAccount(row))
    const knownEmails = new Set(filteredProfiles.map((row) => row.user_email))
    const microsoftOnlyRows = microsoftUsers
      .filter((row) => row.user_email && !knownEmails.has(row.user_email))
      .filter((row) => !isNonStaffAccount(row))
      .map((row) => ({
        ...row,
        org: orgMap[row.user_email] || mergeOrgRecord({}, { email: row.user_email }),
      }))

    setProfiles([...filteredProfiles, ...microsoftOnlyRows].sort((a, b) => String(a.full_name || a.user_email).localeCompare(String(b.full_name || b.user_email))))
    setCatalog(mergeDepartmentCatalog(catalogRow?.value?.value ?? catalogRow?.value ?? []))
    setRequests((requestRows || [])
      .map((row) => createDepartmentRequest({ id: String(row.key).replace('department_request:', ''), ...(row.value?.value ?? row.value ?? {}) }))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()))
    setLoading(false)
  }

  const departmentCounts = useMemo(() => {
    return catalog.map((department) => ({
      ...department,
      count: profiles.filter((row) => row.department === department.name).length,
    }))
  }, [catalog, profiles])

  const unassigned = profiles.filter((row) => !String(row.department || '').trim())
  const pendingRequests = requests.filter((row) => row.status === 'pending')

  async function persistDepartmentChange(row, requestedDepartment = '', requestedRole = 'staff') {
    const departmentMeta = catalog.find((item) => item.name === requestedDepartment)
    const safeDepartment = String(requestedDepartment || '').trim()
    const existingManaged = new Set(Array.isArray(row.org?.managed_departments) ? row.org.managed_departments : [])
    if (row.org?.department && existingManaged.has(row.org.department) && row.org.department !== safeDepartment) {
      existingManaged.delete(row.org.department)
    }
    if (requestedRole === 'department_manager' && safeDepartment) {
      existingManaged.add(safeDepartment)
    }

    const nextOrg = mergeOrgRecord({
      email: row.user_email,
      department: safeDepartment,
      role_scope: requestedRole,
      reports_to_email: departmentMeta?.manager_email || '',
      reports_to_name: departmentMeta?.manager_name || '',
      managed_departments: [...existingManaged],
    }, { email: row.user_email, department: safeDepartment })

    await Promise.all([
      supabase.from('portal_settings').upsert({
        key: buildStaffOrgKey(row.user_email),
        value: { value: nextOrg },
      }, { onConflict: 'key' }),
      supabase.from('hr_profiles').upsert(
        buildHrProfilePayload(row, departmentMeta, safeDepartment),
        { onConflict: 'user_email' },
      ),
    ])

    if (safeDepartment) {
      await notifyDepartmentPlacement({
        staffRow: row,
        departmentName: safeDepartment,
        departmentMeta,
        roleScope: requestedRole,
        sentBy: user?.name || user?.email || 'Director',
      })
    } else {
      await notifyDepartmentRemoval({
        staffRow: row,
        previousDepartment: row.department || row.org?.department || '',
        sentBy: user?.name || user?.email || 'Director',
      })
    }
  }

  async function saveCatalog(nextCatalog) {
    const { error } = await supabase.from('portal_settings').upsert({
      key: buildDepartmentCatalogKey(),
      value: { value: nextCatalog },
    }, { onConflict: 'key' })
    if (error) throw error
    setCatalog(nextCatalog)
  }

  async function addDepartment() {
    if (!newDepartment.trim()) return
    const nextCatalog = mergeDepartmentCatalog([...catalog, createDepartmentSkeleton(newDepartment)])
    setSavingKey('new-department')
    try {
      await saveCatalog(nextCatalog)
      setNewDepartment('')
    } finally {
      setSavingKey('')
    }
  }

  async function updateDepartment(id, patch) {
    const currentDepartment = catalog.find((item) => item.id === id)
    const previousManagerEmail = normalizePortalEmail(currentDepartment?.manager_email)
    const nextCatalog = catalog.map((item) => item.id === id ? { ...item, ...patch, updated_at: new Date().toISOString() } : item)
    setSavingKey(id)
    try {
      await saveCatalog(nextCatalog)
      const updatedDepartment = nextCatalog.find((item) => item.id === id)
      const nextManagerEmail = normalizePortalEmail(updatedDepartment?.manager_email)

      if (previousManagerEmail && previousManagerEmail !== nextManagerEmail) {
        const previousManagerRow = profiles.find((row) => row.user_email === previousManagerEmail)
        const previousOrg = await readOrgRecord(previousManagerEmail, previousManagerRow?.department || '')
        const nextManagedDepartments = (previousOrg.managed_departments || []).filter((item) => item !== updatedDepartment.name)
        await writeOrgRecord(previousManagerEmail, {
          ...previousOrg,
          managed_departments: nextManagedDepartments,
          role_scope: nextManagedDepartments.length > 0 || previousOrg.department ? previousOrg.role_scope : 'staff',
        }, previousManagerRow?.department || '')
      }

      if (nextManagerEmail) {
        const managerRow = profiles.find((row) => row.user_email === nextManagerEmail)
        const existingOrg = await readOrgRecord(nextManagerEmail, managerRow?.department || updatedDepartment.name)
        const nextManaged = new Set(existingOrg.managed_departments || [])
        nextManaged.add(updatedDepartment.name)
        await writeOrgRecord(nextManagerEmail, {
          ...existingOrg,
          email: nextManagerEmail,
          role_scope: 'department_manager',
          managed_departments: [...nextManaged],
          department: existingOrg.department || updatedDepartment.name,
        }, updatedDepartment.name)
        await sendManagedNotification({
          userEmail: nextManagerEmail,
          userName: updatedDepartment.manager_name || managerRow?.full_name || nextManagerEmail,
          category: 'urgent',
          type: 'success',
          title: 'Department manager assignment',
          message: `You have been assigned as Department Manager for ${updatedDepartment.name}.`,
          link: '/my-department',
          emailSubject: `Department manager assignment — ${updatedDepartment.name}`,
          sentBy: user?.name || user?.email || 'Director',
          fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
          forceImportant: true,
        }).catch(() => {})

        const teamMembersInDepartment = profiles.filter((row) => row.department === updatedDepartment.name && row.user_email !== nextManagerEmail)
        await Promise.allSettled(teamMembersInDepartment.map((staffRow) => sendManagedNotification({
          userEmail: staffRow.user_email,
          userName: staffRow.full_name || staffRow.user_email,
          category: 'urgent',
          type: 'info',
          title: 'Department manager updated',
          message: `Your department manager for ${updatedDepartment.name} is now ${updatedDepartment.manager_name || managerRow?.full_name || nextManagerEmail}${nextManagerEmail ? ` (${nextManagerEmail})` : ''}.`,
          link: '/my-profile',
          emailSubject: `Department manager updated — ${updatedDepartment.name}`,
          sentBy: user?.name || user?.email || 'Director',
          fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
          forceImportant: true,
        })))
      }
      await load()
    } finally {
      setSavingKey('')
    }
  }

  async function renameDepartment(department) {
    const nextName = String(renameMap[department.id] || '').trim()
    if (!nextName || nextName === department.name) return
    const duplicate = catalog.some((item) => item.id !== department.id && item.name.toLowerCase() === nextName.toLowerCase())
    if (duplicate) {
      setError(`A department named ${nextName} already exists.`)
      return
    }

    setSavingKey(`rename:${department.id}`)
    setError('')
    try {
      const nextCatalog = catalog.map((item) => item.id === department.id ? { ...item, name: nextName, updated_at: new Date().toISOString() } : item)
      await saveCatalog(nextCatalog)

      const impactedProfiles = profiles.filter((row) => row.department === department.name)
      await Promise.all(impactedProfiles.map((row) => persistDepartmentChange(row, nextName, row.org?.role_scope || 'staff')))

      const impactedManagers = profiles.filter((row) => (row.org?.managed_departments || []).includes(department.name))
      await Promise.all(impactedManagers.map(async (row) => {
        const existingOrg = await readOrgRecord(row.user_email, row.department || '')
        const nextManagedDepartments = (existingOrg.managed_departments || []).map((item) => item === department.name ? nextName : item)
        await writeOrgRecord(row.user_email, {
          ...existingOrg,
          managed_departments: nextManagedDepartments,
        }, row.department || '')
      }))

      const impactedRequests = requests.filter((row) => row.current_department === department.name || row.requested_department === department.name)
      await Promise.all(impactedRequests.map((request) => supabase.from('portal_settings').upsert({
        key: buildDepartmentRequestKey(request.id),
        value: {
          value: createDepartmentRequest({
            ...request,
            current_department: request.current_department === department.name ? nextName : request.current_department,
            requested_department: request.requested_department === department.name ? nextName : request.requested_department,
            updated_at: new Date().toISOString(),
          }),
        },
      }, { onConflict: 'key' })))

      setRenameMap((current) => ({ ...current, [department.id]: nextName }))
      await load()
    } catch (renameError) {
      setError(renameError?.message || 'Could not rename the department.')
    } finally {
      setSavingKey('')
    }
  }

  async function deleteDepartment(department) {
    if (!department?.id) return
    const assignedCount = profiles.filter((row) => row.department === department.name).length
    if (assignedCount > 0) {
      setError(`Move ${assignedCount} staff member${assignedCount === 1 ? '' : 's'} out of ${department.name} before deleting it.`)
      return
    }

    const hasPendingRequests = requests.some((row) =>
      row.status === 'pending' && (row.requested_department === department.name || row.current_department === department.name),
    )
    if (hasPendingRequests) {
      setError(`Resolve pending department requests for ${department.name} before deleting it.`)
      return
    }

    const confirmed = window.confirm(`Delete the department "${department.name}"? This removes it from the department list.`)
    if (!confirmed) return

    setSavingKey(`delete:${department.id}`)
    setError('')
    try {
      const nextCatalog = catalog.filter((item) => item.id !== department.id)
      await saveCatalog(nextCatalog)

      const managerEmail = normalizePortalEmail(department.manager_email)
      if (managerEmail) {
        const { data: orgSetting } = await supabase
          .from('portal_settings')
          .select('value')
          .eq('key', buildStaffOrgKey(managerEmail))
          .maybeSingle()

        const existingOrg = mergeOrgRecord(orgSetting?.value?.value ?? orgSetting?.value ?? {}, {
          email: managerEmail,
        })
        const nextManagedDepartments = (existingOrg.managed_departments || []).filter((item) => item !== department.name)
        const nextRoleScope = nextManagedDepartments.length > 0 || existingOrg.department
          ? existingOrg.role_scope
          : 'staff'

        await supabase.from('portal_settings').upsert({
          key: buildStaffOrgKey(managerEmail),
          value: {
            value: mergeOrgRecord({
              ...existingOrg,
              managed_departments: nextManagedDepartments,
              role_scope: nextRoleScope,
            }, {
              email: managerEmail,
              department: existingOrg.department,
            }),
          },
        }, { onConflict: 'key' })
      }

      await load()
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete the department.')
    } finally {
      setSavingKey('')
    }
  }

  async function applyAssignment(row, override = {}) {
    const current = assignments[row.user_email] || {}
    const requestedDepartment = override.department || current.department
    const requestedRole = override.role_scope || current.role_scope || 'staff'
    if (!requestedDepartment) return

    setSavingKey(row.user_email)
    try {
      const departmentMeta = catalog.find((item) => item.name === requestedDepartment)
      const nextOrg = mergeOrgRecord({
        email: row.user_email,
        department: requestedDepartment,
        role_scope: requestedRole,
        reports_to_email: departmentMeta?.manager_email || '',
        reports_to_name: departmentMeta?.manager_name || '',
        managed_departments: requestedRole === 'department_manager' ? [requestedDepartment] : [],
      }, { email: row.user_email, department: requestedDepartment })

      await Promise.all([
        persistDepartmentChange(row, requestedDepartment, requestedRole),
      ])

      if (requestedRole === 'department_manager') {
        await sendManagedNotification({
          userEmail: row.user_email,
          userName: row.full_name || row.user_email,
          category: 'urgent',
          type: 'success',
          title: 'Department manager assignment',
          message: `You have been assigned as Department Manager for ${requestedDepartment}.`,
          link: '/my-department',
          emailSubject: `Department manager assignment — ${requestedDepartment}`,
          sentBy: user?.name || user?.email || 'Director',
          fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
          forceImportant: true,
        }).catch(() => {})
      } else {
        await sendManagedNotification({
          userEmail: row.user_email,
          userName: row.full_name || row.user_email,
          category: 'general',
          type: 'success',
          title: 'Department assignment updated',
          message: `You have been placed into ${requestedDepartment} as ${requestedRole === 'read_only' ? 'Read Only' : 'Staff'}.`,
          link: '/my-profile',
          emailSubject: `Department updated — ${requestedDepartment}`,
          sentBy: user?.name || user?.email || 'Director',
          fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        }).catch(() => {})
      }

      setAssignments((currentMap) => {
        const next = { ...currentMap }
        delete next[row.user_email]
        return next
      })
      await load()
    } catch (saveError) {
      setError(saveError?.message || 'Could not save the department assignment.')
    } finally {
      setSavingKey('')
    }
  }

  async function decideRequest(request, decision) {
    setSavingKey(request.id)
    try {
      const approved = decision === 'approve'
      const nextRequest = createDepartmentRequest({
        ...request,
        status: approved ? 'approved' : 'rejected',
        approved_by_email: user?.email || '',
        approved_by_name: user?.name || '',
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      await supabase.from('portal_settings').upsert({
        key: buildDepartmentRequestKey(request.id),
        value: { value: nextRequest },
      }, { onConflict: 'key' })

      if (approved) {
        const targetRow = profiles.find((row) => row.user_email === request.target_email)
        if (targetRow) {
          if (request.type === 'remove_staff') {
            await persistDepartmentChange(targetRow, '', 'staff')
          } else {
            await applyAssignment(targetRow, {
              department: request.requested_department,
              role_scope: request.requested_role_scope,
            })
          }
        }
      }

      await load()
    } finally {
      setSavingKey('')
    }
  }

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  if (!isDirector) {
    return (
      <div className="card card-pad" style={{ maxWidth: 620 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text)' }}>Director-only departments</div>
        <div style={{ marginTop: 8, fontSize: 14, color: 'var(--sub)', lineHeight: 1.7 }}>
          Department creation, approval, and company-wide moves are restricted to the Director role.
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Departments</h1>
          <p className="page-sub">Director control centre for departments, manager assignments, and approval requests.</p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 10, fontSize: 13, color: 'var(--amber)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 20 }}>
        <Metric icon={Building2} label="Departments" value={catalog.filter((row) => row.active !== false).length} hint="Active company departments" />
        <Metric icon={Users} label="Assigned staff" value={profiles.filter((row) => row.department).length} hint="People already placed into a department" accent="var(--green)" />
        <Metric icon={FolderPlus} label="Unassigned users" value={unassigned.length} hint="Microsoft users waiting for org placement" accent="var(--amber)" />
        <Metric icon={CheckCircle2} label="Pending approvals" value={pendingRequests.length} hint="Department requests awaiting Director action" accent="var(--red)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(360px,0.9fr)', gap: 18 }} className="staff-profile-main-grid">
        <div style={{ display: 'grid', gap: 18 }}>
          <div className="card card-pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Department catalogue</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>Create and manage departments</div>
              </div>
              <div style={{ display: 'flex', gap: 8, width: 'min(420px,100%)' }}>
                <input className="inp" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} placeholder="New department name" />
                <button className="btn btn-primary" onClick={addDepartment} disabled={savingKey === 'new-department'}>{savingKey === 'new-department' ? 'Adding...' : 'Add'}</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
              {departmentCounts.map((department) => (
                <div key={department.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 14, background: 'var(--bg2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{department.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4 }}>{department.count} staff assigned</div>
                    </div>
                    <span className={`badge badge-${department.active !== false ? 'green' : 'grey'}`}>{department.active !== false ? 'Active' : 'Archived'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, marginTop: 14, alignItems: 'end' }}>
                    <div>
                      <label className="lbl">Department name</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          className="inp"
                          value={renameMap[department.id] ?? department.name}
                          onChange={(e) => setRenameMap((current) => ({ ...current, [department.id]: e.target.value }))}
                        />
                        <button className="btn btn-outline btn-sm" onClick={() => renameDepartment(department)} disabled={savingKey === `rename:${department.id}`}>
                          {savingKey === `rename:${department.id}` ? 'Saving...' : 'Rename'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="lbl">Department Manager</label>
                      <select
                        className="inp"
                        value={department.manager_email || ''}
                        onChange={(e) => {
                          const match = profiles.find((row) => row.user_email === e.target.value)
                          updateDepartment(department.id, {
                            manager_email: e.target.value,
                            manager_name: match?.full_name || match?.user_email || '',
                          })
                        }}
                      >
                        <option value="">— No department manager —</option>
                        {profiles.map((row) => <option key={row.user_email} value={row.user_email}>{row.full_name || row.user_email}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => updateDepartment(department.id, { active: !department.active })} disabled={savingKey === department.id}>
                      {department.active !== false ? 'Archive' : 'Restore'}
                    </button>
                    <div>
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => deleteDepartment(department)}
                      disabled={savingKey === `delete:${department.id}`}
                      style={{ color: 'var(--red)', borderColor: 'rgba(229,77,46,0.25)' }}
                    >
                      {savingKey === `delete:${department.id}` ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Pending requests</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>Manager requests awaiting approval</div>
            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              {pendingRequests.map((request) => (
                <div key={request.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 14, background: 'var(--bg2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{request.target_name || request.target_email}</div>
                      <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4 }}>{request.current_department || 'Unassigned'} → {request.requested_department || 'Unassigned'}</div>
                    </div>
                    <span className="badge badge-amber">Pending</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 8 }}>Requested by {request.requested_by_name || request.requested_by_email}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => decideRequest(request, 'approve')} disabled={savingKey === request.id}>Approve</button>
                    <button className="btn btn-outline btn-sm" onClick={() => decideRequest(request, 'reject')} disabled={savingKey === request.id}>Reject</button>
                  </div>
                </div>
              ))}
              {pendingRequests.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No pending department requests right now.</div>}
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Unassigned Microsoft users</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>Place new users into the org</div>
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            {unassigned.map((row) => {
              const value = assignments[row.user_email] || { department: '', role_scope: 'staff' }
              return (
                <div key={row.user_email} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 14, background: 'var(--bg2)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{row.full_name || row.user_email}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 4 }}>{row.user_email}</div>
                  <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                    <select className="inp" value={value.department} onChange={(e) => setAssignments((current) => ({ ...current, [row.user_email]: { ...value, department: e.target.value } }))}>
                      <option value="">Choose department</option>
                      {catalog.filter((item) => item.active !== false).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                    </select>
                    <select className="inp" value={value.role_scope} onChange={(e) => setAssignments((current) => ({ ...current, [row.user_email]: { ...value, role_scope: e.target.value } }))}>
                      <option value="staff">Staff</option>
                      <option value="department_manager">Department Manager</option>
                      <option value="read_only">Read Only</option>
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={() => applyAssignment(row)} disabled={savingKey === row.user_email || !value.department}>
                      {savingKey === row.user_email ? 'Assigning...' : 'Assign now'}
                    </button>
                  </div>
                </div>
              )
            })}
            {unassigned.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>Everyone already belongs to a department.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
