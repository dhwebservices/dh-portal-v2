import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { Bell, BriefcaseBusiness, Building2, FolderPlus, ShieldCheck, Users } from 'lucide-react'
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
import { enrichTask } from '../utils/taskMetadata'
import { buildComplianceSettingKey, mergeComplianceRecord, resolveRightToWorkRecord } from '../utils/complianceRecords'
import { buildDepartmentAnnouncementKey, createDepartmentAnnouncement, createTrainingRecord } from '../utils/peopleOps'
import { listJobPosts } from '../utils/recruiting'

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

function parseOutreachDepartment(raw = '') {
  const text = String(raw || '')
  const prefix = '[dh-outreach-meta]'
  if (!text.startsWith(prefix)) return ''
  const newlineIndex = text.indexOf('\n')
  const metaLine = newlineIndex >= 0 ? text.slice(prefix.length, newlineIndex).trim() : text.slice(prefix.length).trim()
  try {
    const parsed = JSON.parse(metaLine || '{}')
    return String(parsed.creator_department || '').trim()
  } catch {
    return ''
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

function isDateInRange(today, startDate, endDate) {
  if (!startDate || !endDate) return false
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T23:59:59`)
  return start.getTime() <= today.getTime() && end.getTime() >= today.getTime()
}

const TASK_BOARD_COLUMNS = [
  ['todo', 'To Do', 'var(--faint)'],
  ['in_progress', 'In Progress', 'var(--accent)'],
  ['done', 'Done', 'var(--green)'],
]

export default function MyDepartment() {
  const navigate = useNavigate()
  const { user, org, isDirector, isDepartmentManager, managedDepartments, startPreviewAs, canPreviewStaffMember, isPreviewing, previewTarget } = useAuth()
  const { instance, accounts } = useMsal()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [catalog, setCatalog] = useState([])
  const [profiles, setProfiles] = useState([])
  const [requestRows, setRequestRows] = useState([])
  const [outreachRows, setOutreachRows] = useState([])
  const [emailLogRows, setEmailLogRows] = useState([])
  const [departmentTasks, setDepartmentTasks] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [activityRows, setActivityRows] = useState([])
  const [leaveRows, setLeaveRows] = useState([])
  const [docRows, setDocRows] = useState([])
  const [jobRows, setJobRows] = useState([])
  const [complianceMap, setComplianceMap] = useState({})
  const [contractRows, setContractRows] = useState([])
  const [trainingRecords, setTrainingRecords] = useState([])
  const [announcementForm, setAnnouncementForm] = useState({ title: '', message: '', important: false, email_team: true })
  const [selectedDepartment, setSelectedDepartment] = useState('')
  const [error, setError] = useState('')
  const [memberActions, setMemberActions] = useState({})

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

    const [{ data: hrd }, { data: onboarding }, { data: lifecycleSettings }, { data: orgSettings }, { data: catalogRow }, { data: requestSettings }, { data: outreachData }, { data: emailData }, { data: taskData }, { data: announcementSettings }, { data: auditRows }, { data: leaveData }, { data: docsData }, { data: complianceSettings }, { data: contractSettings }, { data: trainingSettings }, jobData] = await Promise.all([
      supabase.from('hr_profiles').select('*').order('full_name'),
      supabase.from('onboarding_submissions').select('*'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_lifecycle:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_org:%'),
      supabase.from('portal_settings').select('value').eq('key', buildDepartmentCatalogKey()).maybeSingle(),
      supabase.from('portal_settings').select('key,value').like('key', 'department_request:%'),
      supabase.from('outreach').select('id,created_at,notes,added_by'),
      supabase.from('email_log').select('id,sent_at,sent_by,sent_by_email'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('portal_settings').select('key,value').like('key', 'department_announcement:%'),
      supabase.from('audit_log').select('user_name,action,target,created_at').order('created_at', { ascending: false }).limit(120),
      supabase.from('hr_leave').select('id,user_email,user_name,leave_type,start_date,end_date,status').eq('status', 'approved').order('start_date', { ascending: true }),
      supabase.from('staff_documents').select('staff_email,name,type,file_url,file_path,created_at'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_compliance:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_contract:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'training_record:%'),
      listJobPosts().catch(() => []),
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

    const filteredProfiles = mergedProfiles.filter((row) => !isNonStaffAccount(row))
    const knownEmails = new Set(filteredProfiles.map((row) => row.user_email))
    const microsoftOnlyRows = microsoftUsers
      .filter((row) => row.user_email && !knownEmails.has(row.user_email))
      .filter((row) => !isNonStaffAccount(row))
      .map((row) => ({
        ...row,
        lifecycle: mergeLifecycleRecord(),
        org: orgMap[row.user_email] || mergeOrgRecord({}, { email: row.user_email }),
      }))

    const nextCatalog = mergeDepartmentCatalog(catalogRow?.value?.value ?? catalogRow?.value ?? [])
    const availableDepartments = nextCatalog.map((item) => item.name)
    const preferred = (isDirector ? availableDepartments[0] : managedDepartments.find((item) => item !== '*')) || filteredProfiles.find((row) => row.department)?.department || ''
    setCatalog(nextCatalog)
    setProfiles([...filteredProfiles, ...microsoftOnlyRows].sort((a, b) => String(a.full_name || a.user_email).localeCompare(String(b.full_name || b.user_email))))
    setOutreachRows(outreachData || [])
    setEmailLogRows(emailData || [])
    setDepartmentTasks((taskData || []).map(enrichTask))
    setAnnouncements((announcementSettings || [])
      .map((row) => createDepartmentAnnouncement({
        id: String(row.key || '').replace('department_announcement:', ''),
        ...(row.value?.value ?? row.value ?? {}),
      }))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()))
    setActivityRows(auditRows || [])
    setLeaveRows(leaveData || [])
    setDocRows(docsData || [])
    setJobRows(jobData || [])
    setComplianceMap(Object.fromEntries((complianceSettings || []).map((row) => [
      String(row.key || '').replace('staff_compliance:', '').toLowerCase(),
      mergeComplianceRecord(row.value?.value ?? row.value ?? {}),
    ])))
    setContractRows((contractSettings || []).map((row) => row.value?.value ?? row.value ?? {}))
    setTrainingRecords((trainingSettings || []).map((row) => createTrainingRecord({
      id: String(row.key || '').replace('training_record:', ''),
      ...(row.value?.value ?? row.value ?? {}),
    })))
    setSelectedDepartment((current) => current || preferred)
    setRequestRows((requestSettings || [])
      .map((row) => createDepartmentRequest({ id: String(row.key).replace('department_request:', ''), ...(row.value?.value ?? row.value ?? {}) }))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()))
    setLoading(false)
  }

  const visibleDepartments = useMemo(() => {
    if (isDirector) return catalog.filter((item) => item.active !== false)
    const allowed = new Set(getManagedDepartments(org).filter((item) => item !== '*'))
    const currentUserEmail = normalizePortalEmail(user?.email)
    catalog.forEach((item) => {
      if (normalizePortalEmail(item.manager_email) === currentUserEmail) {
        allowed.add(item.name)
      }
    })
    return catalog.filter((item) => item.active !== false && allowed.has(item.name))
  }, [catalog, isDirector, org, user?.email])

  useEffect(() => {
    if (!visibleDepartments.length) {
      setSelectedDepartment('')
      return
    }
    setSelectedDepartment((current) => {
      if (current && visibleDepartments.some((item) => item.name === current)) return current
      return visibleDepartments[0]?.name || ''
    })
  }, [visibleDepartments])

  const currentDepartment = selectedDepartment || visibleDepartments[0]?.name || ''
  const teamMembers = profiles.filter((row) => row.department === currentDepartment)
  const today = new Date()
  const unassigned = profiles.filter((row) => !String(row.department || '').trim())
  const departmentMeta = catalog.find((item) => item.name === currentDepartment)
  const visibleRequests = requestRows.filter((row) => row.requested_department === currentDepartment || row.current_department === currentDepartment)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const onboardingCount = teamMembers.filter((row) => row.lifecycle?.state === 'onboarding').length
  const activeCount = teamMembers.filter((row) => row.lifecycle?.state === 'active').length
  const activeStaffToday = teamMembers.filter((row) => {
    const lastSeen = row.last_seen ? new Date(row.last_seen) : null
    return !!lastSeen && !Number.isNaN(lastSeen.getTime()) && lastSeen >= todayStart
  }).length
  const needsReviewCount = visibleRequests.filter((row) => row.status === 'pending').length
  const teamEmailSet = new Set(teamMembers.map((row) => normalizePortalEmail(row.user_email)).filter(Boolean))
  const outreachAddedToday = outreachRows.filter((row) => {
    const createdAt = row.created_at ? new Date(row.created_at) : null
    if (!createdAt || createdAt < todayStart) return false
    const parsedDepartment = String(parseOutreachDepartment(row.notes) || '').trim()
    return parsedDepartment === currentDepartment
  }).length
  const outreachEmailsToday = emailLogRows.filter((row) => {
    const sentAt = row.sent_at ? new Date(row.sent_at) : null
    if (!sentAt || sentAt < todayStart) return false
    const senderEmail = normalizePortalEmail(row.sent_by_email)
    return senderEmail && teamEmailSet.has(senderEmail)
  }).length
  const currentDepartmentTasks = departmentTasks.filter((task) => String(task.assigned_department || '').trim() === currentDepartment)
  const openDepartmentTasks = currentDepartmentTasks.filter((task) => task.status !== 'done')
  const overdueDepartmentTasks = openDepartmentTasks.filter((task) => task.due_date && new Date(task.due_date) < new Date())
  const departmentTaskBoard = TASK_BOARD_COLUMNS.map(([key, label, tone]) => ({
    key,
    label,
    tone,
    items: currentDepartmentTasks.filter((task) => task.status === key),
  }))
  const docsByEmail = useMemo(() => docRows.reduce((acc, row) => {
    const safeEmail = normalizePortalEmail(row.staff_email)
    if (!safeEmail) return acc
    acc[safeEmail] = acc[safeEmail] || []
    acc[safeEmail].push(row)
    return acc
  }, {}), [docRows])
  const todayLeave = leaveRows.filter((row) => teamEmailSet.has(normalizePortalEmail(row.user_email)) && isDateInRange(today, row.start_date, row.end_date))
  const upcomingLeave = leaveRows.filter((row) => teamEmailSet.has(normalizePortalEmail(row.user_email)) && new Date(`${row.start_date}T00:00:00`).getTime() > todayStart.getTime()).slice(0, 6)
  const newStarters = teamMembers.filter((row) => {
    if (['onboarding', 'probation'].includes(row.lifecycle?.state)) return true
    if (!row.start_date) return false
    const days = Math.floor((today.getTime() - new Date(`${row.start_date}T00:00:00`).getTime()) / 86400000)
    return days >= 0 && days <= 30
  })
  const complianceSignals = teamMembers.map((row) => {
    const safeEmail = normalizePortalEmail(row.user_email)
    const rtw = resolveRightToWorkRecord(row, docsByEmail[safeEmail] || [], complianceMap[safeEmail] || {})
    const pendingContract = contractRows.some((contract) => normalizePortalEmail(contract.staff_email) === safeEmail && contract.status === 'awaiting_staff_signature')
    return {
      email: safeEmail,
      name: row.full_name || row.user_email,
      missingRtw: !rtw.hasDocument && !rtw.rtw_override,
      pendingContract,
      onboarding: row.lifecycle?.state === 'onboarding',
    }
  })
  const missingRtwCount = complianceSignals.filter((row) => row.missingRtw).length
  const pendingContractCount = complianceSignals.filter((row) => row.pendingContract).length
  const departmentTrainingDue = trainingRecords.filter((record) => teamEmailSet.has(normalizePortalEmail(record.staff_email)) && record.status !== 'completed' && record.due_date && new Date(`${record.due_date}T23:59:59`).getTime() <= Date.now()).length
  const teamActivity = activityRows.filter((row) => {
    const actor = String(row.user_name || '').toLowerCase()
    return teamMembers.some((member) => String(member.full_name || '').toLowerCase() === actor)
  }).slice(0, 8)
  const departmentAnnouncements = announcements.filter((item) => item.department === currentDepartment).slice(0, 6)
  const departmentJobs = jobRows.filter((job) => job.department === currentDepartment)
  const openDepartmentJobs = departmentJobs.filter((job) => job.status === 'published')

  async function postAnnouncement() {
    if (!currentDepartment || !announcementForm.title.trim() || !announcementForm.message.trim()) {
      setError('Add an announcement title and message first.')
      return
    }
    setSaving('announcement')
    setError('')
    try {
      const announcement = createDepartmentAnnouncement({
        department: currentDepartment,
        title: announcementForm.title,
        message: announcementForm.message,
        important: announcementForm.important,
        email_team: announcementForm.email_team,
        created_by_email: user?.email || '',
        created_by_name: user?.name || '',
      })
      const { error: saveError } = await supabase.from('portal_settings').upsert({
        key: buildDepartmentAnnouncementKey(announcement.id),
        value: { value: announcement },
      }, { onConflict: 'key' })
      if (saveError) throw saveError
      setAnnouncements((current) => [announcement, ...current].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()))
      if (announcement.email_team || announcement.important) {
        await Promise.allSettled(teamMembers.map((member) => sendManagedNotification({
          userEmail: member.user_email,
          userName: member.full_name || member.user_email,
          category: announcement.important ? 'urgent' : 'general',
          type: announcement.important ? 'warning' : 'info',
          title: `${currentDepartment} update: ${announcement.title}`,
          message: announcement.message,
          link: '/my-team',
          emailSubject: `${currentDepartment} update — ${announcement.title}`,
          sentBy: user?.name || user?.email || 'Department manager',
          fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
          forceImportant: announcement.important,
          forceDelivery: 'both',
        })))
      }
      setAnnouncementForm({ title: '', message: '', important: false, email_team: true })
    } catch (saveError) {
      setError(saveError?.message || 'Could not post the announcement.')
    } finally {
      setSaving('')
    }
  }

  async function updateDepartmentTask(taskId, patch = {}) {
    const { error: saveError } = await supabase
      .from('tasks')
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)
    if (saveError) throw saveError
    setDepartmentTasks((current) => current.map((task) => (
      task.id === taskId ? enrichTask({ ...task, ...patch }) : task
    )))
  }

  async function claimDepartmentTask(task) {
    try {
      await updateDepartmentTask(task.id, {
        assigned_to_email: normalizePortalEmail(user?.email),
        assigned_to_name: user?.name || user?.email || 'Department manager',
      })
    } catch (saveError) {
      setError(saveError?.message || 'Could not claim the department task.')
    }
  }

  async function releaseDepartmentTask(task) {
    try {
      await updateDepartmentTask(task.id, {
        assigned_to_email: null,
        assigned_to_name: null,
      })
    } catch (saveError) {
      setError(saveError?.message || 'Could not return the task to the department queue.')
    }
  }

  async function changeDepartmentTaskStatus(task, nextStatus) {
    try {
      await updateDepartmentTask(task.id, { status: nextStatus })
    } catch (saveError) {
      setError(saveError?.message || 'Could not update the task status.')
    }
  }

  async function impersonateStaffMember(staffRow) {
    try {
      await startPreviewAs({ email: staffRow.user_email, name: staffRow.full_name || staffRow.user_email })
      navigate('/dashboard')
    } catch (error) {
      setError(error?.message || 'Could not start impersonation.')
    }
  }

  async function persistDepartmentChange(staffRow, nextDepartment = '', roleScope = '', nextManager = null) {
    const safeDepartment = String(nextDepartment || '').trim()
    const existingManaged = new Set(Array.isArray(staffRow.org?.managed_departments) ? staffRow.org.managed_departments : [])
    if (staffRow.org?.department && existingManaged.has(staffRow.org.department) && staffRow.org.department !== safeDepartment) {
      existingManaged.delete(staffRow.org.department)
    }
    if (roleScope === 'department_manager' && safeDepartment) {
      existingManaged.add(safeDepartment)
    }

    const nextOrg = mergeOrgRecord({
      email: staffRow.user_email,
      department: safeDepartment,
      role_scope: roleScope || staffRow.org?.role_scope || 'staff',
      reports_to_email: normalizePortalEmail(nextManager?.manager_email),
      reports_to_name: String(nextManager?.manager_name || '').trim(),
      managed_departments: [...existingManaged],
    }, { email: staffRow.user_email, department: safeDepartment })

    const nextRole = nextOrg.role_scope === 'department_manager' && !safeDepartment ? 'staff' : nextOrg.role_scope
    const finalOrg = mergeOrgRecord({ ...nextOrg, role_scope: nextRole }, { email: staffRow.user_email, department: safeDepartment })

    await Promise.all([
      supabase.from('portal_settings').upsert({
        key: buildStaffOrgKey(staffRow.user_email),
        value: { value: finalOrg },
      }, { onConflict: 'key' }),
      supabase.from('hr_profiles').upsert(
        buildHrProfilePayload(staffRow, nextManager || {}, safeDepartment),
        { onConflict: 'user_email' },
      ),
    ])

    if (safeDepartment) {
      await notifyDepartmentPlacement({
        staffRow,
        departmentName: safeDepartment,
        departmentMeta: nextManager || {},
        roleScope: nextRole,
        sentBy: user?.name || user?.email || (isDirector ? 'Director' : 'Department manager'),
      })
    } else {
      await notifyDepartmentRemoval({
        staffRow,
        previousDepartment: staffRow.department || staffRow.org?.department || '',
        sentBy: user?.name || user?.email || (isDirector ? 'Director' : 'Department manager'),
      })
    }
  }

  async function assignDirectly(staffRow) {
    if (!isDirector || !currentDepartment) return
    setSaving(staffRow.user_email)
    try {
      const departmentManager = catalog.find((item) => item.name === currentDepartment)
      await persistDepartmentChange(staffRow, currentDepartment, 'staff', departmentManager)
      await load()
    } catch (saveError) {
      setError(saveError?.message || 'Could not save the department assignment.')
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

  async function moveDirectly(staffRow) {
    const action = memberActions[staffRow.user_email] || {}
    const nextDepartment = String(action.nextDepartment || '').trim()
    if (!nextDepartment || nextDepartment === currentDepartment) return
    setSaving(staffRow.user_email)
    setError('')
    try {
      const departmentManager = catalog.find((item) => item.name === nextDepartment)
      await persistDepartmentChange(staffRow, nextDepartment, staffRow.org?.role_scope || 'staff', departmentManager)
      setMemberActions((current) => ({ ...current, [staffRow.user_email]: { nextDepartment: '' } }))
      await load()
    } catch (saveError) {
      setError(saveError?.message || 'Could not move the staff member.')
    } finally {
      setSaving('')
    }
  }

  async function removeDirectly(staffRow) {
    setSaving(staffRow.user_email)
    setError('')
    try {
      await persistDepartmentChange(staffRow, '', 'staff', { manager_email: '', manager_name: '' })
      await load()
    } catch (saveError) {
      setError(saveError?.message || 'Could not remove the staff member from the department.')
    } finally {
      setSaving('')
    }
  }

  async function requestDepartmentChange(staffRow, type) {
    const action = memberActions[staffRow.user_email] || {}
    const nextDepartment = String(action.nextDepartment || '').trim()
    if (type === 'move_staff' && (!nextDepartment || nextDepartment === currentDepartment)) {
      setError('Choose a different department before requesting a transfer.')
      return
    }
    setSaving(staffRow.user_email)
    setError('')
    try {
      const request = createDepartmentRequest({
        type,
        target_email: staffRow.user_email,
        target_name: staffRow.full_name || staffRow.user_email,
        current_department: currentDepartment,
        requested_department: type === 'remove_staff' ? '' : nextDepartment,
        requested_role_scope: 'staff',
        requested_manager_email: user?.email || '',
        requested_manager_name: user?.name || '',
        requested_by_email: user?.email || '',
        requested_by_name: user?.name || '',
        notes: type === 'remove_staff'
          ? `Requested removal from ${currentDepartment}.`
          : `Requested move from ${currentDepartment} to ${nextDepartment}.`,
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
        title: type === 'remove_staff' ? 'Department removal request' : 'Department transfer request',
        message: type === 'remove_staff'
          ? `${user?.name || 'A manager'} wants to remove ${request.target_name} from ${currentDepartment}.`
          : `${user?.name || 'A manager'} wants to move ${request.target_name} from ${currentDepartment} to ${nextDepartment}.`,
        link: '/departments',
        emailSubject: type === 'remove_staff'
          ? `Department removal request — ${request.target_name}`
          : `Department transfer request — ${request.target_name}`,
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
          title: type === 'remove_staff' ? 'Removal request sent' : 'Transfer request sent',
          message: type === 'remove_staff'
            ? `${request.target_name} has been submitted for removal from ${currentDepartment}.`
            : `${request.target_name} has been submitted for transfer to ${nextDepartment}.`,
          link: '/my-department',
          emailSubject: type === 'remove_staff'
            ? `Removal request sent — ${request.target_name}`
            : `Transfer request sent — ${request.target_name}`,
          sentBy: 'DH Portal',
          fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        }).catch(() => {})
      }

      setMemberActions((current) => ({ ...current, [staffRow.user_email]: { nextDepartment: '' } }))
      await load()
    } catch (saveError) {
      setError(saveError?.message || 'Could not send the department request.')
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
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/recruiting/jobs')}>
            Department hiring
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/recruiting/jobs/new?department=${encodeURIComponent(currentDepartment || '')}`)}>
            Post job
          </button>
          {visibleDepartments.map((item) => (
            <button key={item.id} className={currentDepartment === item.name ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} onClick={() => setSelectedDepartment(item.name)}>
              {item.name}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 10, fontSize: 13, color: 'var(--amber)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard icon={Building2} label="Department" value={currentDepartment || 'None'} hint={departmentMeta?.manager_name ? `Managed by ${departmentMeta.manager_name}` : 'No department manager set'} />
        <StatCard icon={Users} label="Team members" value={teamMembers.length} hint={`${activeCount} active · ${onboardingCount} onboarding`} tone="var(--green)" />
        <StatCard icon={Users} label="My active staff today" value={activeStaffToday} hint="Team members with portal activity recorded today" tone="var(--accent)" />
        <StatCard icon={FolderPlus} label="Outreach added today" value={outreachAddedToday} hint="New client-contact records logged by this department today" tone="var(--blue)" />
        <StatCard icon={ShieldCheck} label="Outreach emails today" value={outreachEmailsToday} hint="Tracked outbound emails sent today by staff in this department" tone="var(--amber)" />
        <StatCard icon={ShieldCheck} label="Department tasks" value={openDepartmentTasks.length} hint={`${overdueDepartmentTasks.length} overdue for follow-up`} tone="var(--accent)" />
        <StatCard icon={ShieldCheck} label="Compliance watch" value={missingRtwCount + pendingContractCount + departmentTrainingDue} hint={`${missingRtwCount} missing RTW · ${pendingContractCount} unsigned contracts · ${departmentTrainingDue} training due`} tone="var(--red)" />
        <StatCard icon={ShieldCheck} label="Pending requests" value={needsReviewCount} hint="Director approvals tied to this department" tone="var(--red)" />
        <StatCard icon={FolderPlus} label="Unassigned" value={unassigned.length} hint="Microsoft users waiting to be placed into a team" tone="var(--amber)" />
        <StatCard icon={BriefcaseBusiness} label="Department jobs" value={departmentJobs.length} hint={`${openDepartmentJobs.length} published right now`} tone="var(--blue)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(320px,0.8fr)', gap: 18 }} className="staff-profile-main-grid">
        <div style={{ display:'grid', gap:16 }}>
          <div className="card card-pad">
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Department operating layer</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12, marginTop:14 }}>
              <div style={{ padding:'12px 13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg2)' }}>
                <div style={{ fontSize:12, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Leave today / who’s off</div>
                <div style={{ marginTop:8, display:'grid', gap:8 }}>
                  {todayLeave.slice(0, 4).map((row) => (
                    <div key={row.id} style={{ fontSize:12.5, color:'var(--sub)' }}>
                      <strong style={{ color:'var(--text)' }}>{row.user_name || row.user_email}</strong> · {row.leave_type}
                    </div>
                  ))}
                  {todayLeave.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>Nobody is off today.</div> : null}
                </div>
              </div>
              <div style={{ padding:'12px 13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg2)' }}>
                <div style={{ fontSize:12, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em' }}>New starters in team</div>
                <div style={{ marginTop:8, display:'grid', gap:8 }}>
                  {newStarters.slice(0, 4).map((row) => (
                    <div key={row.user_email} style={{ fontSize:12.5, color:'var(--sub)' }}>
                      <strong style={{ color:'var(--text)' }}>{row.full_name || row.user_email}</strong> · {getLifecycleLabel(row.lifecycle?.state)}
                    </div>
                  ))}
                  {newStarters.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No recent starters in this department.</div> : null}
                </div>
              </div>
              <div style={{ padding:'12px 13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg2)' }}>
                <div style={{ fontSize:12, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Department compliance</div>
                <div style={{ marginTop:8, fontSize:12.5, color:'var(--sub)', lineHeight:1.7 }}>
                  Missing RTW: <strong style={{ color:'var(--text)' }}>{missingRtwCount}</strong><br/>
                  Unsigned contracts: <strong style={{ color:'var(--text)' }}>{pendingContractCount}</strong><br/>
                  Training due: <strong style={{ color:'var(--text)' }}>{departmentTrainingDue}</strong><br/>
                  Onboarding staff: <strong style={{ color:'var(--text)' }}>{onboardingCount}</strong>
                </div>
              </div>
              <div style={{ padding:'12px 13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg2)' }}>
                <div style={{ fontSize:12, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Upcoming leave</div>
                <div style={{ marginTop:8, display:'grid', gap:8 }}>
                  {upcomingLeave.slice(0, 3).map((row) => (
                    <div key={row.id} style={{ fontSize:12.5, color:'var(--sub)' }}>
                      <strong style={{ color:'var(--text)' }}>{row.user_name || row.user_email}</strong> · {row.start_date}
                    </div>
                  ))}
                  {upcomingLeave.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No upcoming approved leave booked.</div> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Department hiring</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>Job posts for {currentDepartment || 'this department'}</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => navigate('/recruiting/jobs')}>Open jobs</button>
                <button className="btn btn-primary btn-sm" onClick={() => navigate(`/recruiting/jobs/new?department=${encodeURIComponent(currentDepartment || '')}`)}>Create role</button>
              </div>
            </div>
            <div style={{ display:'grid', gap:10 }}>
              {departmentJobs.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No job posts linked to this department yet.</div> : null}
              {departmentJobs.slice(0, 6).map((job) => (
                <button key={job.id} className="btn btn-outline" style={{ justifyContent:'space-between' }} onClick={() => navigate(`/recruiting/jobs/${job.id}`)}>
                  <span>{job.title}</span>
                  <span style={{ fontSize:11.5, color:'var(--sub)' }}>{job.status}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Department announcements</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>Post an update to the team</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={postAnnouncement} disabled={saving === 'announcement'}>
                {saving === 'announcement' ? 'Posting...' : 'Post announcement'}
              </button>
            </div>
            <div className="fg" style={{ marginTop:14 }}>
              <div><label className="lbl">Title</label><input className="inp" value={announcementForm.title} onChange={(e) => setAnnouncementForm((current) => ({ ...current, title: e.target.value }))} placeholder="Example: Team update for this week" /></div>
              <div className="fc"><label className="lbl">Message</label><textarea className="inp" rows={3} value={announcementForm.message} onChange={(e) => setAnnouncementForm((current) => ({ ...current, message: e.target.value }))} style={{ resize:'vertical' }} placeholder="Share the update, priority, or next steps..." /></div>
            </div>
            <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:12 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, color:'var(--sub)' }}>
                <input type="checkbox" checked={announcementForm.email_team} onChange={(e) => setAnnouncementForm((current) => ({ ...current, email_team: e.target.checked }))} />
                Email the team too
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, color:'var(--sub)' }}>
                <input type="checkbox" checked={announcementForm.important} onChange={(e) => setAnnouncementForm((current) => ({ ...current, important: e.target.checked }))} />
                Mark as important
              </label>
            </div>
            <div style={{ display:'grid', gap:10, marginTop:16 }}>
              {departmentAnnouncements.map((item) => (
                <div key={item.id} style={{ padding:'12px 13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg2)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{item.title}</div>
                    <span className={`badge badge-${item.important ? 'red' : 'blue'}`}>{item.important ? 'Important' : 'Team update'}</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--sub)', marginTop:6, lineHeight:1.6 }}>{item.message}</div>
                  <div style={{ fontSize:11, color:'var(--faint)', marginTop:6 }}>{item.created_by_name || item.created_by_email} · {new Date(item.created_at).toLocaleString('en-GB')}</div>
                </div>
              ))}
              {departmentAnnouncements.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No department announcements posted yet.</div> : null}
            </div>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Team members</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>{currentDepartment || 'No department selected'}</div>
            </div>
            {teamMembers.length === 0 ? (
              <div style={{ padding: '24px 18px', color: 'var(--faint)', fontSize: 13 }}>No staff currently assigned to this department.</div>
            ) : teamMembers.map((row) => (
              <div key={row.user_email} style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                <button onClick={() => navigate(`/my-staff/${encodeURIComponent(row.user_email)}`)} style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', gap: 8, marginTop: 12, alignItems: 'center' }}>
                  <select
                    className="inp"
                    value={memberActions[row.user_email]?.nextDepartment || ''}
                    onChange={(e) => setMemberActions((current) => ({
                      ...current,
                      [row.user_email]: { ...current[row.user_email], nextDepartment: e.target.value },
                    }))}
                  >
                    <option value="">Choose department</option>
                    {catalog.filter((item) => item.active !== false && item.name !== currentDepartment).map((item) => (
                      <option key={item.id} value={item.name}>{item.name}</option>
                    ))}
                  </select>
                  {canPreviewStaffMember(row, row.org) ? (
                    <button
                      className={isPreviewing && previewTarget?.email?.toLowerCase?.() === row.user_email?.toLowerCase() ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                      onClick={() => impersonateStaffMember(row)}
                    >
                      {isPreviewing && previewTarget?.email?.toLowerCase?.() === row.user_email?.toLowerCase() ? 'Impersonating' : 'Impersonate'}
                    </button>
                  ) : null}
                  <button className="btn btn-outline btn-sm" onClick={() => navigate(`/my-staff/${encodeURIComponent(row.user_email)}?tab=contracts`)}>
                    Contracts
                  </button>
                  {isDirector ? (
                    <>
                      <button className="btn btn-outline btn-sm" onClick={() => moveDirectly(row)} disabled={saving === row.user_email || !memberActions[row.user_email]?.nextDepartment}>
                        {saving === row.user_email ? 'Saving...' : 'Move now'}
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => removeDirectly(row)} disabled={saving === row.user_email} style={{ color: 'var(--red)', borderColor: 'rgba(229,77,46,0.25)' }}>
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-outline btn-sm" onClick={() => requestDepartmentChange(row, 'move_staff')} disabled={saving === row.user_email || !memberActions[row.user_email]?.nextDepartment}>
                        {saving === row.user_email ? 'Sending...' : 'Request move'}
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => requestDepartmentChange(row, 'remove_staff')} disabled={saving === row.user_email} style={{ color: 'var(--red)', borderColor: 'rgba(229,77,46,0.25)' }}>
                        Request removal
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card card-pad">
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Team activity feed</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>Latest department actions</div>
            <div style={{ display:'grid', gap:10, marginTop:14 }}>
              {teamActivity.map((row, index) => (
                <div key={`${row.user_name}-${row.created_at}-${index}`} style={{ padding:'12px 13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg2)' }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{row.user_name || 'Team member'}</div>
                  <div style={{ fontSize:12, color:'var(--sub)', marginTop:5, lineHeight:1.6 }}>{row.action}{row.target ? ` · ${row.target}` : ''}</div>
                  <div style={{ fontSize:11, color:'var(--faint)', marginTop:6 }}>{new Date(row.created_at).toLocaleString('en-GB')}</div>
                </div>
              ))}
              {teamActivity.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No recent team activity yet.</div> : null}
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Department tasks</div>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginTop: 4, flexWrap:'wrap' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Task board for {currentDepartment}</div>
              <button className="btn btn-outline btn-sm" onClick={() => navigate('/tasks')}>Open full task manager</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12, marginTop: 14 }}>
              {departmentTaskBoard.map((column) => (
                <div key={column.key} style={{ border:'1px solid var(--border)', borderRadius:14, background:'var(--bg2)', padding:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:10 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:column.tone, letterSpacing:'0.06em', textTransform:'uppercase' }}>{column.label}</div>
                    <span className="badge badge-grey">{column.items.length}</span>
                  </div>
                  <div style={{ display:'grid', gap:10 }}>
                    {column.items.map((task) => {
                      const isOwnedByCurrentUser = normalizePortalEmail(task.assigned_to_email) === normalizePortalEmail(user?.email)
                      return (
                        <div key={task.id} style={{ padding:'12px 13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--card)' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{task.title}</div>
                          <div style={{ fontSize:11.5, color:'var(--sub)', marginTop:5, lineHeight:1.6 }}>
                            {task.description_plain || 'No task description'}
                          </div>
                          <div style={{ fontSize:11.5, color:'var(--faint)', marginTop:6 }}>
                            {task.assigned_to_name ? `Owner ${task.assigned_to_name}` : 'Department queue'}
                            {task.due_date ? ` · Due ${new Date(task.due_date).toLocaleDateString('en-GB')}` : ' · No due date'}
                          </div>
                          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:10 }}>
                            {!task.assigned_to_email ? (
                              <button className="btn btn-outline btn-sm" onClick={() => claimDepartmentTask(task)}>Claim</button>
                            ) : isOwnedByCurrentUser ? (
                              <button className="btn btn-outline btn-sm" onClick={() => releaseDepartmentTask(task)}>Return to queue</button>
                            ) : null}
                            {task.status !== 'in_progress' ? (
                              <button className="btn btn-outline btn-sm" onClick={() => changeDepartmentTaskStatus(task, 'in_progress')}>Start</button>
                            ) : null}
                            {task.status !== 'done' ? (
                              <button className="btn btn-outline btn-sm" onClick={() => changeDepartmentTaskStatus(task, 'done')}>Mark done</button>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                    {column.items.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No tasks in this column.</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Unassigned Microsoft users</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>Ready to place into a team</div>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {unassigned.map((row) => (
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
