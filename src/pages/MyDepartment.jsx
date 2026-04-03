import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { Building2, FolderPlus, ShieldCheck, Users } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { mergeHrProfileWithOnboarding } from '../utils/hrProfileSync'
import { DIRECTOR_EMAILS, getLifecycleLabel, mergeLifecycleRecord } from '../utils/staffLifecycle'
import {
  buildDepartmentCatalogKey,
  buildDepartmentRequestKey,
  buildStaffOrgKey,
  createDepartmentRequest,
  getManagedDepartments,
  getRoleScopeLabel,
  mergeDepartmentCatalog,
  mergeOrgRecord,
} from '../utils/orgStructure'
import { sendManagedNotification } from '../utils/notificationPreferences'

function StatCard({ icon: Icon, label, value, hint, tone = 'var(--accent)' }) {
  return (
    <div className="stat-card">
      <div style={{ width: 40, height: 40, borderRadius: 12, background: `${tone}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Icon size={18} color={tone} />
      </div>
      <div className="stat-val">{value}</div>
      <div className="stat-lbl">{label}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--sub)', lineHeight: 1.5 }}>{hint}</div>
    </div>
  )
}

export default function MyDepartment() {
  const navigate = useNavigate()
  const { user, org, isDirector, isDepartmentManager, managedDepartments } = useAuth()
  const { instance, accounts } = useMsal()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [catalog, setCatalog] = useState([])
  const [profiles, setProfiles] = useState([])
  const [requestRows, setRequestRows] = useState([])
  const [selectedDepartment, setSelectedDepartment] = useState('')

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

    const [{ data: hrd }, { data: onboarding }, { data: lifecycleSettings }, { data: orgSettings }, { data: catalogRow }, { data: requestSettings }] = await Promise.all([
      supabase.from('hr_profiles').select('*').order('full_name'),
      supabase.from('onboarding_submissions').select('*'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_lifecycle:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_org:%'),
      supabase.from('portal_settings').select('value').eq('key', buildDepartmentCatalogKey()).maybeSingle(),
      supabase.from('portal_settings').select('key,value').like('key', 'department_request:%'),
    ])

    const onboardingMap = Object.fromEntries((onboarding || []).map((row) => [String(row.user_email || '').toLowerCase(), row]))
    const lifecycleMap = Object.fromEntries((lifecycleSettings || []).map((row) => [
      String(row.key || '').replace('staff_lifecycle:', '').toLowerCase(),
      mergeLifecycleRecord(row.value?.value ?? row.value ?? {}),
    ]))
    const orgMap = Object.fromEntries((orgSettings || []).map((row) => [
      String(row.key || '').replace('staff_org:', '').toLowerCase(),
      mergeOrgRecord(row.value?.value ?? row.value ?? {}),
    ]))

    const mergedProfiles = (hrd || []).map((row) => {
      const safeEmail = String(row.user_email || '').toLowerCase()
      const merged = mergeHrProfileWithOnboarding(row, onboardingMap[safeEmail])
      return {
        ...merged,
        lifecycle: lifecycleMap[safeEmail] || mergeLifecycleRecord(),
        org: orgMap[safeEmail] || mergeOrgRecord({}, { email: safeEmail, department: merged.department }),
      }
    })

    const knownEmails = new Set(mergedProfiles.map((row) => row.user_email))
    const microsoftOnlyRows = microsoftUsers
      .filter((row) => row.user_email && !knownEmails.has(row.user_email))
      .map((row) => ({
        ...row,
        lifecycle: mergeLifecycleRecord(),
        org: orgMap[row.user_email] || mergeOrgRecord({}, { email: row.user_email }),
      }))

    const nextCatalog = mergeDepartmentCatalog(catalogRow?.value?.value ?? catalogRow?.value ?? [])
    const availableDepartments = nextCatalog.map((item) => item.name)
    const preferred = (isDirector ? availableDepartments[0] : managedDepartments.find((item) => item !== '*')) || mergedProfiles.find((row) => row.department)?.department || ''
    setCatalog(nextCatalog)
    setProfiles([...mergedProfiles, ...microsoftOnlyRows].sort((a, b) => String(a.full_name || a.user_email).localeCompare(String(b.full_name || b.user_email))))
    setSelectedDepartment((current) => current || preferred)
    setRequestRows((requestSettings || [])
      .map((row) => createDepartmentRequest({ id: String(row.key).replace('department_request:', ''), ...(row.value?.value ?? row.value ?? {}) }))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()))
    setLoading(false)
  }

  const visibleDepartments = useMemo(() => {
    if (isDirector) return catalog.filter((item) => item.active !== false)
    const allowed = new Set(getManagedDepartments(org).filter((item) => item !== '*'))
    return catalog.filter((item) => item.active !== false && allowed.has(item.name))
  }, [catalog, isDirector, org])

  const currentDepartment = selectedDepartment || visibleDepartments[0]?.name || ''
  const teamMembers = profiles.filter((row) => row.department === currentDepartment)
  const unassigned = profiles.filter((row) => !String(row.department || '').trim())
  const departmentMeta = catalog.find((item) => item.name === currentDepartment)
  const visibleRequests = requestRows.filter((row) => row.requested_department === currentDepartment || row.current_department === currentDepartment)

  async function assignDirectly(staffRow) {
    if (!isDirector || !currentDepartment) return
    setSaving(staffRow.user_email)
    try {
      const departmentManager = catalog.find((item) => item.name === currentDepartment)
      const nextOrg = mergeOrgRecord({
        email: staffRow.user_email,
        department: currentDepartment,
        role_scope: 'staff',
        reports_to_email: departmentManager?.manager_email || '',
        reports_to_name: departmentManager?.manager_name || '',
      }, { email: staffRow.user_email, department: currentDepartment })

      await Promise.all([
        supabase.from('portal_settings').upsert({
          key: buildStaffOrgKey(staffRow.user_email),
          value: { value: nextOrg },
        }, { onConflict: 'key' }),
        supabase.from('hr_profiles').upsert({
          ...staffRow,
          user_email: staffRow.user_email,
          department: currentDepartment,
          manager_email: departmentManager?.manager_email || '',
          manager_name: departmentManager?.manager_name || '',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_email' }),
      ])
      await load()
    } finally {
      setSaving('')
    }
  }

  async function requestAssignment(staffRow) {
    if (!currentDepartment) return
    setSaving(staffRow.user_email)
    try {
      const request = createDepartmentRequest({
        type: 'assign_staff',
        target_email: staffRow.user_email,
        target_name: staffRow.full_name || staffRow.user_email,
        current_department: '',
        requested_department: currentDepartment,
        requested_role_scope: 'staff',
        requested_manager_email: user?.email || '',
        requested_manager_name: user?.name || '',
        requested_by_email: user?.email || '',
        requested_by_name: user?.name || '',
        notes: `Requested from My Department for ${currentDepartment}.`,
      })

      const { error } = await supabase.from('portal_settings').upsert({
        key: buildDepartmentRequestKey(request.id),
        value: { value: request },
      }, { onConflict: 'key' })
      if (error) throw error

      await Promise.allSettled([...DIRECTOR_EMAILS].map((directorEmail) => sendManagedNotification({
        userEmail: directorEmail,
        userName: directorEmail,
        category: 'urgent',
        type: 'warning',
        title: 'Department staff request',
        message: `${user?.name || 'A manager'} wants to assign ${request.target_name} to ${currentDepartment}.`,
        link: '/departments',
        emailSubject: `Department assignment request — ${request.target_name}`,
        sentBy: user?.name || user?.email || 'Department manager',
        forceImportant: true,
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
      })))

      if (user?.email) {
        await sendManagedNotification({
          userEmail: user.email,
          userName: user.name || user.email,
          category: 'general',
          type: 'info',
          title: 'Department request sent',
          message: `${request.target_name} has been submitted for placement into ${currentDepartment}. The Director has been asked to approve it.`,
          link: '/my-department',
          emailSubject: `Department request sent — ${request.target_name}`,
          sentBy: 'DH Portal',
          fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        }).catch(() => {})
      }

      await load()
    } finally {
      setSaving('')
    }
  }

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  if (!isDirector && !isDepartmentManager) {
    return (
      <div className="card card-pad" style={{ maxWidth: 620 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text)' }}>Department access only</div>
        <div style={{ marginTop: 8, fontSize: 14, color: 'var(--sub)', lineHeight: 1.7 }}>
          This page is for Directors and Department Managers. Staff without team scope can still use their own profile and day-to-day tools.
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">My Department</h1>
          <p className="page-sub">Team workspace for scoped managers and Director oversight.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {visibleDepartments.map((item) => (
            <button key={item.id} className={currentDepartment === item.name ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} onClick={() => setSelectedDepartment(item.name)}>
              {item.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard icon={Building2} label="Department" value={currentDepartment || 'None'} hint={departmentMeta?.manager_name ? `Managed by ${departmentMeta.manager_name}` : 'No department manager set'} />
        <StatCard icon={Users} label="Team members" value={teamMembers.length} hint="Staff currently assigned to this department" tone="var(--green)" />
        <StatCard icon={FolderPlus} label="Unassigned" value={unassigned.length} hint="Microsoft users waiting to be placed into a team" tone="var(--amber)" />
        <StatCard icon={ShieldCheck} label="Pending requests" value={visibleRequests.filter((row) => row.status === 'pending').length} hint="Director approvals tied to this department" tone="var(--red)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(320px,0.8fr)', gap: 18 }} className="staff-profile-main-grid">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Team members</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>{currentDepartment || 'No department selected'}</div>
          </div>
          {teamMembers.length === 0 ? (
            <div style={{ padding: '24px 18px', color: 'var(--faint)', fontSize: 13 }}>No staff currently assigned to this department.</div>
          ) : teamMembers.map((row) => (
            <button key={row.user_email} onClick={() => navigate(`/my-staff/${encodeURIComponent(row.user_email)}`)} style={{ width: '100%', textAlign: 'left', padding: '14px 18px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{row.full_name || row.user_email}</div>
                  <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4 }}>{row.role || getRoleScopeLabel(row.org?.role_scope)} · {row.manager_name || 'No manager'}</div>
                </div>
                <span className={`badge badge-${row.lifecycle?.state === 'onboarding' ? 'amber' : row.lifecycle?.state === 'active' ? 'green' : 'blue'}`}>
                  {getLifecycleLabel(row.lifecycle?.state)}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card card-pad">
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Unassigned Microsoft users</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>Ready to place into a team</div>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {unassigned.slice(0, 6).map((row) => (
                <div key={row.user_email} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{row.full_name || row.user_email}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 4 }}>{row.user_email}</div>
                  <div style={{ marginTop: 10 }}>
                    {isDirector ? (
                      <button className="btn btn-primary btn-sm" onClick={() => assignDirectly(row)} disabled={saving === row.user_email || !currentDepartment}>
                        {saving === row.user_email ? 'Assigning...' : `Assign to ${currentDepartment || 'department'}`}
                      </button>
                    ) : (
                      <button className="btn btn-outline btn-sm" onClick={() => requestAssignment(row)} disabled={saving === row.user_email || !currentDepartment}>
                        {saving === row.user_email ? 'Sending...' : `Request into ${currentDepartment || 'department'}`}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {unassigned.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No unassigned Microsoft users right now.</div>}
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Department requests</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>Requests affecting this team</div>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {visibleRequests.slice(0, 6).map((row) => (
                <div key={row.id} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{row.target_name || row.target_email}</div>
                    <span className={`badge badge-${row.status === 'approved' ? 'green' : row.status === 'rejected' ? 'red' : 'amber'}`}>{row.status}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 5 }}>
                    {row.current_department || 'Unassigned'} → {row.requested_department || 'Unassigned'}
                  </div>
                </div>
              ))}
              {visibleRequests.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No department requests for this team yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
