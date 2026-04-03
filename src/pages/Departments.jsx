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

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
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

    const knownEmails = new Set(mergedProfiles.map((row) => row.user_email))
    const microsoftOnlyRows = microsoftUsers
      .filter((row) => row.user_email && !knownEmails.has(row.user_email))
      .map((row) => ({
        ...row,
        org: orgMap[row.user_email] || mergeOrgRecord({}, { email: row.user_email }),
      }))

    setProfiles([...mergedProfiles, ...microsoftOnlyRows].sort((a, b) => String(a.full_name || a.user_email).localeCompare(String(b.full_name || b.user_email))))
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
    const nextCatalog = catalog.map((item) => item.id === id ? { ...item, ...patch, updated_at: new Date().toISOString() } : item)
    setSavingKey(id)
    try {
      await saveCatalog(nextCatalog)
      const updatedDepartment = nextCatalog.find((item) => item.id === id)
      if (updatedDepartment?.manager_email) {
        const managerRow = profiles.find((row) => row.user_email === updatedDepartment.manager_email)
        const { data: orgSetting } = await supabase
          .from('portal_settings')
          .select('value')
          .eq('key', buildStaffOrgKey(updatedDepartment.manager_email))
          .maybeSingle()
        const existingOrg = mergeOrgRecord(orgSetting?.value?.value ?? orgSetting?.value ?? {}, {
          email: updatedDepartment.manager_email,
          department: managerRow?.department || updatedDepartment.name,
        })
        const nextManaged = new Set(existingOrg.managed_departments || [])
        nextManaged.add(updatedDepartment.name)
        await supabase.from('portal_settings').upsert({
          key: buildStaffOrgKey(updatedDepartment.manager_email),
          value: {
            value: mergeOrgRecord({
              ...existingOrg,
              email: updatedDepartment.manager_email,
              role_scope: 'department_manager',
              managed_departments: [...nextManaged],
              department: existingOrg.department || updatedDepartment.name,
            }, { email: updatedDepartment.manager_email, department: updatedDepartment.name }),
          },
        }, { onConflict: 'key' })
      }
      await load()
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
        supabase.from('portal_settings').upsert({
          key: buildStaffOrgKey(row.user_email),
          value: { value: nextOrg },
        }, { onConflict: 'key' }),
        supabase.from('hr_profiles').upsert({
          ...row,
          user_email: row.user_email,
          department: requestedDepartment,
          manager_email: departmentMeta?.manager_email || '',
          manager_name: departmentMeta?.manager_name || '',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_email' }),
      ])

      await sendManagedNotification({
        userEmail: row.user_email,
        userName: row.full_name || row.user_email,
        category: 'general',
        type: 'success',
        title: 'Department assignment updated',
        message: `You have been placed into ${requestedDepartment} as ${requestedRole === 'department_manager' ? 'Department Manager' : 'Staff'}.`,
        link: '/my-profile',
        emailSubject: `Department updated — ${requestedDepartment}`,
        sentBy: user?.name || user?.email || 'Director',
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
      }).catch(() => {})

      setAssignments((currentMap) => {
        const next = { ...currentMap }
        delete next[row.user_email]
        return next
      })
      await load()
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
          await applyAssignment(targetRow, {
            department: request.requested_department,
            role_scope: request.requested_role_scope,
          })
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 10, marginTop: 14, alignItems: 'end' }}>
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
                    <button className="btn btn-outline btn-sm" onClick={() => updateDepartment(department.id, { active: !department.active })} disabled={savingKey === department.id}>
                      {department.active !== false ? 'Archive' : 'Restore'}
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => updateDepartment(department.id, { name: `${department.name} (Updated)` })} disabled style={{ opacity: 0.45 }}>
                      Rename later
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
