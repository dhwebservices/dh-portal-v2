import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Briefcase, Building2, Eye, FileText, Search, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useMsal } from '@azure/msal-react'
import { mergeHrProfileWithOnboarding, normalizeEmail, pickBestProfileRow } from '../utils/hrProfileSync'
import { getLifecycleLabel, mergeLifecycleRecord, TERMINATED_STATES } from '../utils/staffLifecycle'
import { mergeOrgRecord } from '../utils/orgStructure'
import {
  buildAccountLockRecord,
  buildAccountSecurityKey,
  buildSessionRevokeRecord,
  createDefaultAccountSecurityRecord,
  mergeAccountSecurityRecord,
} from '../utils/accountSecurity'

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

// Keep this matrix in sync with App routes, Sidebar items, and any new staff tabs/pages.
// If we add, rename, or remove a tab/route, the permissions model must be updated too.
const ALL_PAGES = [
  {key:'dashboard',label:'Dashboard'},{key:'notifications',label:'Notifications'},
  {key:'my_profile',label:'My Profile'},{key:'search',label:'Search'},
  {key:'my_team',label:'View My Team'},
  {key:'outreach',label:'Clients Contacted'},
  {key:'clients',label:'Onboarded Clients'},{key:'clientmgmt',label:'Client Portal'},
  {key:'support',label:'Support'},{key:'competitor',label:'Competitor Lookup'},
  {key:'domains',label:'Domain Checker'},{key:'proposals',label:'Proposal Builder'},
  {key:'sendemail',label:'Send Email'},{key:'sms_manager',label:'SMS Manager'},{key:'appointments',label:'Appointments'},
  {key:'tasks',label:'Manage Tasks'},
  {key:'mytasks',label:'My Tasks'},{key:'schedule',label:'Schedule'},
  {key:'my_department',label:'My Department'},
  {key:'reports',label:'Reports'},{key:'staff',label:'My Staff'},
  {key:'manager_board',label:'Manager Board'},
  {key:'departments',label:'Departments'},
  {key:'org_chart',label:'Org Chart'},{key:'mailinglist',label:'Mailing List'},
  {key:'banners',label:'Banners'},{key:'emailtemplates',label:'Email Templates'},
  {key:'safeguards',label:'Admin Safeguards'},
  {key:'audit',label:'Audit Log'},{key:'maintenance',label:'Maintenance'},
  {key:'admin',label:'Admin'},{key:'settings',label:'Settings'},
  {key:'hr_leave',label:'HR Leave'},{key:'hr_payslips',label:'HR Payslips'},
  {key:'hr_profiles',label:'HR Profiles'},{key:'hr_policies',label:'HR Policies'},
  {key:'hr_documents',label:'HR Documents'},{key:'hr_timesheet',label:'HR Timesheets'},{key:'hr_onboarding',label:'HR Onboarding'},
  {key:'contract_queue',label:'Contract Queue'},
  {key:'contract_templates',label:'Contract Templates'},
  {key:'recruiting_dashboard',label:'Recruiting Dashboard'},
  {key:'recruiting_jobs',label:'Recruiting Jobs'},
  {key:'recruiting_applications',label:'Recruiting Applications'},
  {key:'recruiting_board',label:'Recruiting Board'},
  {key:'recruiting_settings',label:'Recruiting Settings'},
  {key:'shop_orders_view',label:'Shop Orders'},
  {key:'shop_orders_edit',label:'Shop Orders Edit'},
  {key:'shop_products_view',label:'Shop Products'},
  {key:'shop_products_edit',label:'Shop Products Edit'},
  {key:'shop_customers_view',label:'Shop Customers'},
  {key:'shop_customers_edit',label:'Shop Customers Edit'},
  {key:'website_editor',label:'Web Manager'},
]

const ROLE_DEFAULTS = {
  Admin:    Object.fromEntries(ALL_PAGES.map(p => [p.key, true])),
  DepartmentManager: Object.fromEntries(ALL_PAGES.filter(p => !['admin','audit','departments','banners','emailtemplates','website_editor','mailinglist','safeguards','maintenance','settings','recruiting_settings'].includes(p.key)).map(p => [p.key, true])),
  Staff:    Object.fromEntries(ALL_PAGES.filter(p => !['admin','audit','reports','staff','manager_board','departments','my_department','banners','emailtemplates','website_editor','mailinglist','safeguards','hr_documents','contract_queue','recruiting_dashboard','recruiting_jobs','recruiting_applications','recruiting_board','recruiting_settings','shop_orders_view','shop_orders_edit','shop_products_view','shop_products_edit','shop_customers_view','shop_customers_edit'].includes(p.key)).map(p => [p.key, true])),
  ReadOnly: Object.fromEntries(ALL_PAGES.filter(p => ['dashboard','notifications','my_profile','search','my_team','mytasks','schedule','hr_leave','hr_payslips','hr_policies'].includes(p.key)).map(p => [p.key, true])),
}

const EMPTY_PROFILE = { full_name:'', role:'', department:'', contract_type:'', start_date:'', phone:'', personal_email:'', address:'', manager_name:'', hr_notes:'', bank_name:'', account_name:'', sort_code:'', account_number:'' }

// ── Staff grid (list view) ─────────────────────────────────────────────
export default function MyStaff() {
  const navigate = useNavigate()
  const { instance, accounts } = useMsal()
  const { user, isDirector, isDepartmentManager, canViewScopedStaff, canPreviewStaffMember, managedDepartments, startPreviewAs, isPreviewing, previewTarget } = useAuth()
  const [msUsers, setMsUsers]   = useState([])
  const [profiles, setProfiles] = useState({})
  const [permsMap, setPermsMap] = useState({})
  const [accountSecurityMap, setAccountSecurityMap] = useState({})
  const [lifecycleMap, setLifecycleMap] = useState({})
  const [orgMap, setOrgMap] = useState({})
  const [selectedUsers, setSelectedUsers] = useState([])
  const [bulkSaving, setBulkSaving] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const account = accounts[0]
      const token = await instance.acquireTokenSilent({ scopes:['https://graph.microsoft.com/User.Read.All'], account })
        .catch(() => instance.acquireTokenPopup({ scopes:['https://graph.microsoft.com/User.Read.All'], account }))
      const res = await fetch('https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,jobTitle&$top=50', { headers:{ Authorization:`Bearer ${token.accessToken}` }})
      const data = await res.json()
      const activeUsers = (data.value||[]).map(u => ({ id:u.id, name:u.displayName, email:u.userPrincipalName, jobTitle:u.jobTitle }))
      setMsUsers(activeUsers)

      // Sync: remove hr_profiles rows for users no longer in Microsoft AD
      // and collapse case-variant duplicates down to one canonical row.
      const activeEmails = new Set(activeUsers.map(u => u.email.toLowerCase()))
      const [{ data: allProfiles }, { data: lifecycleSettings }] = await Promise.all([
        supabase.from('hr_profiles').select('id,user_email'),
        supabase.from('portal_settings').select('key,value').like('key', 'staff_lifecycle:%'),
      ])
      const lifecycleStateMap = {}
      ;(lifecycleSettings || []).forEach((row) => {
        const key = String(row.key || '').replace('staff_lifecycle:', '').toLowerCase().trim()
        if (!key) return
        lifecycleStateMap[key] = mergeLifecycleRecord(row.value?.value ?? row.value ?? {}).state
      })
      const duplicateGroups = {}
      ;(allProfiles || []).forEach((profile) => {
        const key = normalizeEmail(profile.user_email)
        if (!key) return
        duplicateGroups[key] = duplicateGroups[key] || []
        duplicateGroups[key].push(profile)
      })

      const duplicateDeletes = Object.values(duplicateGroups).flatMap((rows) => {
        if (rows.length <= 1) return []
        const keep = pickBestProfileRow(rows)
        return rows.filter((row) => row.id !== keep?.id)
      })

      const staleDeletes = (allProfiles||[]).filter(p => {
        const em = normalizeEmail(p.user_email)
        const isSystem = ['hr@','clients@','log@','legal@','noreply@','admin@','test@'].some(s => em.startsWith(s))
        const isTerminated = TERMINATED_STATES.has(lifecycleStateMap[em] || '')
        return !isSystem && !activeEmails.has(em) && !isTerminated
      })

      const deleteMap = new Map()
      ;[...duplicateDeletes, ...staleDeletes].forEach((row) => {
        if (row?.id) deleteMap.set(row.id, row)
      })
      const toDelete = [...deleteMap.values()]

      if (toDelete.length > 0) {
        await Promise.all(toDelete.map(p => supabase.from('hr_profiles').delete().eq('id', p.id)))
        await Promise.all(
          staleDeletes.map((p) => supabase.from('user_permissions').delete().ilike('user_email', p.user_email))
        )
      }
    } catch(e) { setError('Could not load Azure users: ' + e.message) }

    const [{ data: pd }, { data: hrd }, { data: onboard }, { data: lifecycleSettings }, { data: orgSettings }, { data: accountSecuritySettings }] = await Promise.all([
      supabase.from('user_permissions').select('*'),
      supabase.from('hr_profiles').select('*'),
      supabase.from('onboarding_submissions').select('*'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_lifecycle:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_org:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'account_security:%'),
    ])
    const pm = {}; (pd||[]).forEach(p => { pm[p.user_email?.toLowerCase()] = { perms: p.permissions, onboarding: p.onboarding } })
    setPermsMap(pm)
    const hm = {}; (hrd||[]).forEach(p => { hm[p.user_email?.toLowerCase()] = p })
    ;(onboard || []).forEach((submission) => {
      const key = submission.user_email?.toLowerCase()
      if (!key) return
      hm[key] = mergeHrProfileWithOnboarding(hm[key] || {}, submission)
    })
    setProfiles(hm)
    const lm = {}
    ;(lifecycleSettings || []).forEach((row) => {
      const key = String(row.key || '').replace('staff_lifecycle:', '').toLowerCase().trim()
      if (!key) return
      lm[key] = mergeLifecycleRecord(row.value?.value ?? row.value ?? {}, {
        onboarding: !!pm[key]?.onboarding,
        startDate: hm[key]?.start_date,
        contractType: hm[key]?.contract_type,
      })
    })
    setLifecycleMap(lm)
    const om = {}
    ;(orgSettings || []).forEach((row) => {
      const key = String(row.key || '').replace('staff_org:', '').toLowerCase().trim()
      if (!key) return
      om[key] = mergeOrgRecord(row.value?.value ?? row.value ?? {}, {
        email: key,
        department: hm[key]?.department,
      })
    })
    setOrgMap(om)
    const sm = {}
    ;(accountSecuritySettings || []).forEach((row) => {
      const key = String(row.key || '').replace('account_security:', '').toLowerCase().trim()
      if (!key) return
      sm[key] = mergeAccountSecurityRecord(row.value?.value ?? row.value ?? {})
    })
    setAccountSecurityMap(sm)
    setLoading(false)
  }

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
      }
    })
    .filter((record) => {
      if (TERMINATED_STATES.has(record.lifecycle.state || '')) return true
      return record.isFromAzure
    })
    .filter((record) => isDirector || canViewScopedStaff(record.profile, record.targetOrg))

  const filtered = staffRecords.filter((staff) => {
    const q = search.toLowerCase()
    const safeEmail = staff.email?.toLowerCase()
    const profile = staff.profile || {}
    const userPm = permsMap[safeEmail]
    const isOnboarding = userPm?.onboarding || false
    const lifecycle = staff.lifecycle || mergeLifecycleRecord({}, {
      onboarding: isOnboarding,
      startDate: profile.start_date,
      contractType: profile.contract_type,
    })
    const lifecycleState = lifecycle.state || (isOnboarding ? 'onboarding' : 'active')
    const statusMatches =
      statusFilter === 'all' ||
      (statusFilter === 'active' && ['active', 'probation'].includes(lifecycleState)) ||
      (statusFilter === 'onboarding' && lifecycleState === 'onboarding') ||
      (statusFilter === 'attention' && ['termination_requested', 'termination_pending', 'termination_approved', 'terminated', 'left', 'archived'].includes(lifecycleState)) ||
      (statusFilter === 'terminated' && TERMINATED_STATES.has(lifecycleState)) ||
      (statusFilter === 'active_now' && isRecentlyActive(profile.last_seen))
    return statusMatches && (!q || staff.name?.toLowerCase().includes(q) || staff.email?.toLowerCase().includes(q) || profile.department?.toLowerCase().includes(q) || profile.role?.toLowerCase().includes(q))
  })

  const activeStaff = filtered.filter((staff) => !TERMINATED_STATES.has(staff.lifecycle?.state || ''))
  const terminatedStaff = filtered.filter((staff) => TERMINATED_STATES.has(staff.lifecycle?.state || ''))

  const unassignedUsers = activeStaff.filter((staff) => {
    const targetProfile = staff.profile || {}
    const targetOrg = staff.targetOrg || {}
    return !String(targetOrg.department || targetProfile.department || '').trim()
  })

  const activeCount = activeStaff.filter((staff) => isRecentlyActive(staff.profile?.last_seen)).length

  const getInitials = (name) => (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  const COLOURS = ['#0071E3','#30A46C','#E54D2E','#8E4EC6','#C2500D','#0197C8','#D6409F']
  const colourFor = (email) => COLOURS[(email||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0) % COLOURS.length]
  const filterOptions = [
    ['all', 'All staff'],
    ['active', 'Active'],
    ['onboarding', 'Onboarding'],
    ['attention', 'Needs attention'],
    ['terminated', 'Terminated staff'],
    ['active_now', 'Active now'],
  ]

  const impersonate = async (u, profile = {}, targetOrg = {}) => {
    try {
      await startPreviewAs({ email: u.email?.toLowerCase(), name: profile.full_name || u.name })
      navigate('/dashboard')
    } catch (error) {
      alert(error?.message || 'Could not start impersonation.')
    }
  }

  const toggleSelectedUser = (email) => {
    const safeEmail = normalizeEmail(email)
    setSelectedUsers((current) => current.includes(safeEmail)
      ? current.filter((item) => item !== safeEmail)
      : [...current, safeEmail])
  }

  const clearSelectedUsers = () => setSelectedUsers([])

  const applyBulkSecurity = async (mode) => {
    if (!selectedUsers.length) return
    setBulkSaving(true)
    try {
      const rows = selectedUsers.map((safeEmail) => {
        const current = accountSecurityMap[safeEmail] || createDefaultAccountSecurityRecord()
        if (mode === 'relogin') {
          return {
            key: buildAccountSecurityKey(safeEmail),
            value: { value: buildSessionRevokeRecord(current, {
              actorEmail: user?.email || '',
              actorName: user?.name || '',
            }) },
          }
        }
        if (mode === 'suspend') {
          return {
            key: buildAccountSecurityKey(safeEmail),
            value: { value: buildAccountLockRecord(current, {
              locked: true,
              reason: current.lock_reason || 'Portal access suspended by admin.',
              actorEmail: user?.email || '',
              actorName: user?.name || '',
            }) },
          }
        }
        return {
          key: buildAccountSecurityKey(safeEmail),
          value: { value: buildAccountLockRecord(current, {
            locked: false,
            reason: '',
            actorEmail: user?.email || '',
            actorName: user?.name || '',
          }) },
        }
      })

      const { error } = await supabase.from('portal_settings').upsert(rows, { onConflict: 'key' })
      if (error) throw error
      await load()
      clearSelectedUsers()
    } catch (error) {
      alert(error?.message || 'Could not update account access.')
    } finally {
      setBulkSaving(false)
    }
  }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">My Staff</h1><p className="page-sub">{activeStaff.length} active staff · {terminatedStaff.length} terminated records · {activeCount} active now</p></div>
        <button className="btn btn-outline" onClick={load} disabled={loading} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div style={{ marginBottom:20, border:'1px solid var(--border)', borderRadius:20, background:'linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, var(--page-tint) 8%), var(--card))', padding:'20px 22px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-start', flexWrap:'wrap', marginBottom:16 }}>
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)', marginBottom:8 }}>People board</div>
            <div style={{ fontSize:24, fontWeight:600, color:'var(--text)', letterSpacing:'-0.03em', lineHeight:1 }}>Staff workspace</div>
            <div style={{ fontSize:13, color:'var(--sub)', marginTop:8, lineHeight:1.6, maxWidth:560 }}>
              A cleaner view of your people, with lifecycle, presence, and quick actions visible on each staff card.
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(120px,1fr))', gap:10, minWidth:'min(100%, 320px)' }}>
            {[
              { label: isDirector ? 'Active staff' : 'Visible staff', value: activeStaff.length, tone: 'var(--text)' },
              { label: 'Active now', value: activeCount, tone: 'var(--green)' },
              { label: 'Onboarding', value: activeStaff.filter((u) => permsMap[u.email?.toLowerCase()]?.onboarding).length, tone: 'var(--amber)' },
              { label: 'Terminated', value: terminatedStaff.length, tone: 'var(--red)' },
              { label: 'Unassigned', value: unassignedUsers.length, tone: 'var(--accent)' },
            ].map((item) => (
              <div key={item.label} style={{ padding:'12px 14px', borderRadius:14, border:'1px solid var(--border)', background:'var(--card)' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>{item.label}</div>
                <div style={{ fontSize:24, fontWeight:600, color:item.tone, lineHeight:1 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {filterOptions.map(([key, label]) => (
              <button
                key={key}
                className={`btn ${statusFilter === key ? 'btn-primary' : 'btn-outline'} btn-sm`}
                onClick={() => setStatusFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ position:'relative', width:'min(100%, 360px)' }}>
            <Search style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--faint)' }} size={14} />
            <input className="inp" style={{ paddingLeft:36, borderRadius:999 }} placeholder="Search by name, role, department..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
        </div>
      </div>

      {!isDirector && managedDepartments.length > 0 && (
        <div className="card" style={{ padding:'14px 16px', marginBottom:18 }}>
          <div style={{ fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', fontWeight:700 }}>Scoped view</div>
          <div style={{ marginTop:6, fontSize:13, color:'var(--sub)', lineHeight:1.6 }}>
            You are viewing staff inside your department scope only: <strong style={{ color:'var(--text)' }}>{managedDepartments.filter((item) => item !== '*').join(', ') || 'Your department'}</strong>.
          </div>
        </div>
      )}

      {selectedUsers.length > 0 && (
        <div className="card" style={{ padding:'14px 16px', marginBottom:18, display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', fontWeight:700 }}>Bulk access control</div>
            <div style={{ marginTop:6, fontSize:13, color:'var(--sub)', lineHeight:1.6 }}>
              {selectedUsers.length} staff account{selectedUsers.length === 1 ? '' : 's'} selected.
            </div>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={() => applyBulkSecurity('relogin')} disabled={bulkSaving}>{bulkSaving ? 'Saving...' : 'Force re-login'}</button>
            <button className="btn btn-outline btn-sm" onClick={() => applyBulkSecurity('suspend')} disabled={bulkSaving}>{bulkSaving ? 'Saving...' : 'Suspend access'}</button>
            <button className="btn btn-outline btn-sm" onClick={() => applyBulkSecurity('restore')} disabled={bulkSaving}>{bulkSaving ? 'Saving...' : 'Restore access'}</button>
            <button className="btn btn-outline btn-sm" onClick={clearSelectedUsers} disabled={bulkSaving}>Clear</button>
          </div>
        </div>
      )}

      {error && <div style={{ padding:'10px 14px', background:'var(--amber-bg)', border:'1px solid var(--amber)', borderRadius:8, fontSize:13, color:'var(--amber)', marginBottom:16 }}>{error}</div>}

      {loading ? (
        <div className="compact-card-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="card" style={{ padding:22, borderRadius:18 }}>
              <div className="skel" style={{ width:64, height:64, borderRadius:18, marginBottom:14 }}/>
              <div className="skel" style={{ width:'68%', height:14, marginBottom:8 }}/>
              <div className="skel" style={{ width:'44%', height:12, marginBottom:16 }}/>
              <div className="skel" style={{ width:'100%', height:80, borderRadius:14 }}/>
            </div>
          ))}
        </div>
      ) : (
        <div className="compact-card-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
          {filtered.map(u => {
            const userEmail = u.email?.toLowerCase()
            const profile = u.profile || {}
            const userPm = permsMap[userEmail]
            const isOnboarding = userPm?.onboarding || false
            const lifecycle = u.lifecycle || mergeLifecycleRecord({}, {
              onboarding: isOnboarding,
              startDate: profile.start_date,
              contractType: profile.contract_type,
            })
            const targetOrg = u.targetOrg || mergeOrgRecord({}, { email: userEmail, department: profile.department })
            const isActiveNow = isRecentlyActive(profile.last_seen)
            const colour = colourFor(userEmail)
            const canImpersonate = (isDirector || isDepartmentManager) && canPreviewStaffMember(profile, targetOrg)
            const isCurrentImpersonation = isPreviewing && previewTarget?.email?.toLowerCase?.() === userEmail
            const securityRecord = accountSecurityMap[userEmail] || createDefaultAccountSecurityRecord()
            const portalAccessLocked = securityRecord.portal_access_locked === true
            const lifecycleState = lifecycle.state || (isOnboarding ? 'onboarding' : 'active')
            const lifecycleTone = lifecycleState === 'terminated' || lifecycleState === 'termination_approved' || lifecycleState === 'left' || lifecycleState === 'archived'
              ? 'red'
              : lifecycleState === 'probation'
                ? 'blue'
                : lifecycleState === 'onboarding'
                  ? 'amber'
                  : lifecycleState.includes('termination')
                    ? 'amber'
                    : 'green'
            return (
              <div
                key={u.id}
                style={{ background:'linear-gradient(180deg, color-mix(in srgb, var(--card) 94%, var(--page-tint) 6%), var(--card))', border:'1px solid var(--border)', borderRadius:18, padding:'18px', transition:'all 0.2s cubic-bezier(0.16,1,0.3,1)', display:'grid', gap:14, position:'relative', minHeight: 330 }}
                onMouseOver={e => { e.currentTarget.style.borderColor=colour; e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow=`0 8px 24px ${colour}22` }}
                onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}
              >
                <label style={{ position:'absolute', top:14, left:14, zIndex:2, display:'flex', alignItems:'center', justifyContent:'center', width:24, height:24, borderRadius:999, background:'var(--card)', border:'1px solid var(--border)', cursor:'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(userEmail)}
                    onChange={() => toggleSelectedUser(userEmail)}
                    style={{ width:14, height:14 }}
                  />
                </label>
                <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
                  <div style={{ width:64, height:64, borderRadius:18, background:colour+'18', border:`1px solid ${colour}33`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:600, color:colour, fontFamily:'var(--font-display)', flexShrink:0 }}>
                    {getInitials(u.name)}
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
                    <span className={`badge badge-${lifecycleTone}`}>{getLifecycleLabel(lifecycleState)}</span>
                    {portalAccessLocked ? <span className="badge badge-red">Suspended</span> : null}
                    <span className={`badge badge-${isActiveNow ? 'green' : 'grey'}`}>{formatPresenceLabel(profile.last_seen)}</span>
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/my-staff/${encodeURIComponent(u.email.toLowerCase())}`)}
                  style={{ width:'100%', border:'none', background:'transparent', padding:0, cursor:'pointer', display:'grid', gap:12, textAlign:'left' }}
                >
                  <div>
                    <div style={{ fontSize:18, fontWeight:600, color:'var(--text)', lineHeight:1.1 }}>{profile.full_name || u.name}</div>
                    <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:6, lineHeight:1.55 }}>{profile.role || u.jobTitle || 'No role assigned yet'}</div>
                  </div>

                  <div style={{ display:'grid', gap:10, padding:'12px 14px', border:'1px solid var(--border)', borderRadius:14, background:'var(--bg2)' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'18px minmax(0,1fr)', gap:10, alignItems:'start' }}>
                      <Building2 size={15} style={{ color:'var(--faint)', marginTop:1 }} />
                      <div style={{ fontSize:12.5, color:'var(--text)' }}>{profile.department || 'No department assigned'}</div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'18px minmax(0,1fr)', gap:10, alignItems:'start' }}>
                      <Briefcase size={15} style={{ color:'var(--faint)', marginTop:1 }} />
                      <div style={{ fontSize:12, color:'var(--sub)', lineHeight:1.5 }}>{profile.contract_type || 'Contract type not set'}</div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'18px minmax(0,1fr)', gap:10, alignItems:'start' }}>
                      <ShieldCheck size={15} style={{ color:'var(--faint)', marginTop:1 }} />
                      <div style={{ fontSize:12, color:'var(--sub)', lineHeight:1.5 }}>{targetOrg.manager_name || profile.manager_name || 'No manager assigned'}</div>
                    </div>
                  </div>
                </button>

                <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center', marginTop:'auto' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => navigate(`/my-staff/${encodeURIComponent(u.email.toLowerCase())}`)}
                    style={{ justifyContent:'center' }}
                  >
                    <Eye size={14} />
                    Open profile
                  </button>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => navigate(`/my-staff/${encodeURIComponent(u.email.toLowerCase())}?tab=contracts`)}
                    >
                      <FileText size={14} />
                      Contracts
                    </button>
                  </div>
                </div>

                <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:180 }}>{userEmail}</span>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <button
                      className="btn btn-outline btn-sm"
                      onClick={() => navigate(`/my-staff/${encodeURIComponent(u.email.toLowerCase())}?tab=notify`)}
                    >
                      <Sparkles size={14} />
                      Notify
                    </button>
                  {canImpersonate && !TERMINATED_STATES.has(lifecycleState) ? (
                    <button
                      className={isCurrentImpersonation ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                      onClick={() => impersonate(u, profile, targetOrg)}
                    >
                      {isCurrentImpersonation ? 'Impersonating' : 'Impersonate'}
                    </button>
                  ) : null}
                  </div>
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && !loading && (
            <div style={{ gridColumn:'1/-1' }}>
              <div className="empty"><p>No staff found</p></div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
