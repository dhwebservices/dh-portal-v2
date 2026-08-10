import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, ShieldCheck, FolderPlus, Building2 } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { mergeHrProfileWithOnboarding } from '../utils/hrProfileSync'
import { getLifecycleLabel, mergeLifecycleRecord } from '../utils/staffLifecycle'
import { mergeOrgRecord } from '../utils/orgStructure'
import { enrichTask } from '../utils/taskMetadata'
import { mergeComplianceRecord, resolveRightToWorkRecord } from '../utils/complianceRecords'
import { createDepartmentAnnouncement, createTrainingRecord } from '../utils/peopleOps'
import { fetchAuditLogs } from '../utils/auditApi'
import { fetchEmailLogs } from '../utils/emailLogs'
import { StatCard } from '../components/ui'
import { Button, StatusBadge } from '../components/ds'

const DS_CARD = { background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)' }

const TONE_TO_VARIANT = { green:'active', amber:'warning', red:'error', blue:'info', grey: 'neutral' }

function normalizePortalEmail(value = '') {
  return String(value || '').toLowerCase().trim()
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

function isDateInRange(today, startDate, endDate) {
  if (!startDate || !endDate) return false
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T23:59:59`)
  return start.getTime() <= today.getTime() && end.getTime() >= today.getTime()
}

const TASK_BOARD_COLUMNS = [
  ['todo', 'To Do', 'var(--color-text-tertiary)'],
  ['in_progress', 'In Progress', 'var(--color-primary)'],
  ['done', 'Done', 'var(--color-green-500)'],
]

export default function MyTeam() {
  const navigate = useNavigate()
  const { org, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState([])
  const [outreachRows, setOutreachRows] = useState([])
  const [emailLogRows, setEmailLogRows] = useState([])
  const [tasks, setTasks] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [activityRows, setActivityRows] = useState([])
  const [leaveRows, setLeaveRows] = useState([])
  const [docRows, setDocRows] = useState([])
  const [complianceMap, setComplianceMap] = useState({})
  const [contracts, setContracts] = useState([])
  const [trainingRecords, setTrainingRecords] = useState([])

  const currentDepartment = String(org?.department || '').trim()

  useEffect(() => {
    load()
  }, [currentDepartment])

  async function load() {
    if (!currentDepartment) {
      setProfiles([])
      setOutreachRows([])
      setEmailLogRows([])
      setTasks([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data: hrd }, { data: onboarding }, { data: lifecycleSettings }, { data: orgSettings }, { data: outreachData }, emailData, { data: taskData }, { data: announcementSettings }, auditRows, { data: leaveData }, { data: docsData }, { data: complianceSettings }, { data: contractSettings }, { data: trainingSettings }] = await Promise.all([
      supabase.from('hr_profiles').select('*').order('full_name'),
      supabase.from('onboarding_submissions').select('*'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_lifecycle:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_org:%'),
      supabase.from('outreach').select('id,created_at,notes,added_by'),
      fetchEmailLogs({ select: 'id,sent_at,sent_by,sent_by_email', limit: 250 }),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('portal_settings').select('key,value').like('key', 'department_announcement:%'),
      fetchAuditLogs({ select: 'user_name,action,target,created_at', limit: 120 }),
      supabase.from('hr_leave').select('id,user_email,user_name,leave_type,start_date,end_date,status').eq('status', 'approved').order('start_date', { ascending: true }),
      supabase.from('staff_documents').select('staff_email,name,type,file_url,file_path,created_at'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_compliance:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_contract:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'training_record:%'),
    ])

    const onboardingMap = Object.fromEntries((onboarding || []).map((row) => [normalizePortalEmail(row.user_email), row]))
    const lifecycleMap = Object.fromEntries((lifecycleSettings || []).map((row) => [
      String(row.key || '').replace('staff_lifecycle:', '').toLowerCase(),
      mergeLifecycleRecord(row.value?.value ?? row.value ?? {}),
    ]))
    const orgMap = Object.fromEntries((orgSettings || []).map((row) => [
      String(row.key || '').replace('staff_org:', '').toLowerCase(),
      mergeOrgRecord(row.value?.value ?? row.value ?? {}),
    ]))

    const mergedProfiles = (hrd || [])
      .map((row) => {
        const safeEmail = normalizePortalEmail(row.user_email)
        const merged = mergeHrProfileWithOnboarding(row, onboardingMap[safeEmail])
        return {
          ...merged,
          lifecycle: lifecycleMap[safeEmail] || mergeLifecycleRecord(),
          org: orgMap[safeEmail] || mergeOrgRecord({}, { email: safeEmail, department: merged.department }),
        }
      })
      .filter((row) => String(row.department || row.org?.department || '').trim() === currentDepartment)
      .sort((a, b) => String(a.full_name || a.user_email).localeCompare(String(b.full_name || b.user_email)))

    setProfiles(mergedProfiles)
    setOutreachRows(outreachData || [])
    setEmailLogRows(emailData || [])
    setTasks((taskData || []).map(enrichTask).filter((task) => String(task.assigned_department || '').trim() === currentDepartment))
    setAnnouncements((announcementSettings || [])
      .map((row) => createDepartmentAnnouncement({
        id: String(row.key || '').replace('department_announcement:', ''),
        ...(row.value?.value ?? row.value ?? {}),
      }))
      .filter((item) => item.department === currentDepartment)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()))
    setActivityRows(auditRows || [])
    setLeaveRows(leaveData || [])
    setDocRows(docsData || [])
    setComplianceMap(Object.fromEntries((complianceSettings || []).map((row) => [
      String(row.key || '').replace('staff_compliance:', '').toLowerCase(),
      mergeComplianceRecord(row.value?.value ?? row.value ?? {}),
    ])))
    setContracts((contractSettings || []).map((row) => row.value?.value ?? row.value ?? {}))
    setTrainingRecords((trainingSettings || []).map((row) => createTrainingRecord({
      id: String(row.key || '').replace('training_record:', ''),
      ...(row.value?.value ?? row.value ?? {}),
    })))
    setLoading(false)
  }

  const manager = useMemo(() => profiles.find((row) => row.org?.role_scope === 'department_manager') || profiles.find((row) => normalizePortalEmail(row.user_email) === normalizePortalEmail(org?.reports_to_email)), [profiles, org?.reports_to_email])
  const todayStart = useMemo(() => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    return date
  }, [])
  const teamEmailSet = useMemo(() => new Set(profiles.map((row) => normalizePortalEmail(row.user_email)).filter(Boolean)), [profiles])
  const outreachAddedToday = outreachRows.filter((row) => {
    const createdAt = row.created_at ? new Date(row.created_at) : null
    if (!createdAt || createdAt < todayStart) return false
    return parseOutreachDepartment(row.notes) === currentDepartment
  }).length
  const outreachEmailsToday = emailLogRows.filter((row) => {
    const sentAt = row.sent_at ? new Date(row.sent_at) : null
    if (!sentAt || sentAt < todayStart) return false
    return teamEmailSet.has(normalizePortalEmail(row.sent_by_email))
  }).length
  const openTasks = tasks.filter((task) => task.status !== 'done')
  const overdueTasks = openTasks.filter((task) => task.due_date && new Date(task.due_date) < new Date())
  const today = new Date()
  const docsByEmail = useMemo(() => docRows.reduce((acc, row) => {
    const safeEmail = normalizePortalEmail(row.staff_email)
    if (!safeEmail) return acc
    acc[safeEmail] = acc[safeEmail] || []
    acc[safeEmail].push(row)
    return acc
  }, {}), [docRows])
  const todayLeave = leaveRows.filter((row) => teamEmailSet.has(normalizePortalEmail(row.user_email)) && isDateInRange(today, row.start_date, row.end_date))
  const newStarters = profiles.filter((row) => {
    if (['onboarding', 'probation'].includes(row.lifecycle?.state)) return true
    if (!row.start_date) return false
    const days = Math.floor((today.getTime() - new Date(`${row.start_date}T00:00:00`).getTime()) / 86400000)
    return days >= 0 && days <= 30
  })
  const missingRtwCount = profiles.filter((row) => {
    const safeEmail = normalizePortalEmail(row.user_email)
    const rtw = resolveRightToWorkRecord(row, docsByEmail[safeEmail] || [], complianceMap[safeEmail] || {})
    return !rtw.hasDocument && !rtw.rtw_override
  }).length
  const pendingContractCount = profiles.filter((row) => contracts.some((contract) => normalizePortalEmail(contract.staff_email) === normalizePortalEmail(row.user_email) && contract.status === 'awaiting_staff_signature')).length
  const trainingDueCount = trainingRecords.filter((record) => teamEmailSet.has(normalizePortalEmail(record.staff_email)) && record.status !== 'completed' && record.due_date && new Date(`${record.due_date}T23:59:59`).getTime() <= Date.now()).length
  const teamActivity = activityRows.filter((row) => {
    const actor = String(row.user_name || '').toLowerCase()
    return profiles.some((member) => String(member.full_name || '').toLowerCase() === actor)
  }).slice(0, 6)
  const taskBoard = TASK_BOARD_COLUMNS.map(([key, label, tone]) => ({
    key,
    label,
    tone,
    items: tasks.filter((task) => task.status === key),
  }))

  if (!currentDepartment) {
    return (
      <div style={{ ...DS_CARD, padding: 20, maxWidth: 620 }}>
        <div style={{ fontSize: 24, color: 'var(--color-text-primary)' }}>No team assigned</div>
        <div style={{ marginTop: 8, fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
          Your staff profile is not currently assigned to a department yet, so there is no team view available.
        </div>
      </div>
    )
  }

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>View My Team</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Read-only team view for {currentDepartment}.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard icon={Building2} label="Department" value={currentDepartment} hint={manager ? `Managed by ${manager.full_name || manager.user_email}` : 'No department manager set'} />
        <StatCard icon={Users} label="Team members" value={profiles.length} hint="People currently assigned to this department" tone="var(--color-green-500)" />
        <StatCard icon={FolderPlus} label="Outreach added today" value={outreachAddedToday} hint="New client-contact records logged today" tone="var(--color-blue-500)" />
        <StatCard icon={ShieldCheck} label="Open team tasks" value={openTasks.length} hint={`${overdueTasks.length} overdue`} tone="var(--color-amber-500)" />
        <StatCard icon={ShieldCheck} label="Compliance watch" value={missingRtwCount + pendingContractCount + trainingDueCount} hint={`${missingRtwCount} missing RTW · ${pendingContractCount} unsigned contracts · ${trainingDueCount} training due`} tone="var(--color-red-500)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(320px,0.85fr)', gap: 18 }} className="staff-profile-main-grid">
        <div style={{ ...DS_CARD, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Team members</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4 }}>{currentDepartment}</div>
          </div>
          {profiles.length === 0 ? (
            <div style={{ padding: '24px 18px', color: 'var(--color-text-tertiary)', fontSize: 13 }}>No staff are currently assigned to this department.</div>
          ) : profiles.map((row) => (
            <div key={row.user_email} style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{row.full_name || row.user_email}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{row.role || 'Staff'} · {row.org?.role_scope === 'department_manager' ? 'Department Manager' : 'Team member'}</div>
                </div>
                <StatusBadge variant={TONE_TO_VARIANT[row.lifecycle?.state === 'onboarding' ? 'amber' : row.lifecycle?.state === 'active' ? 'green' : 'blue'] || 'info'}>
                  {getLifecycleLabel(row.lifecycle?.state)}
                </StatusBadge>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ ...DS_CARD, padding: 20 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Department announcements</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4 }}>Team updates</div>
            <div style={{ display:'grid', gap:10, marginTop:14 }}>
              {announcements.slice(0, 4).map((item) => (
                <div key={item.id} style={{ padding:'12px 13px', borderRadius:12, border:'1px solid var(--color-border)', background:'var(--color-gray-50)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{item.title}</div>
                    <StatusBadge variant={TONE_TO_VARIANT[item.important ? 'red' : 'blue'] || 'info'}>{item.important ? 'Important' : 'Update'}</StatusBadge>
                  </div>
                  <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:6, lineHeight:1.6 }}>{item.message}</div>
                </div>
              ))}
              {announcements.length === 0 ? <div style={{ fontSize:12.5, color:'var(--color-text-tertiary)' }}>No team announcements yet.</div> : null}
            </div>
          </div>

          <div style={{ ...DS_CARD, padding: 20 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Team overview</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4 }}>Manager and team activity</div>
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              <div style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-gray-50)' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Manager</div>
                <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{manager?.full_name || org?.reports_to_name || 'No manager set'}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{manager?.user_email || org?.reports_to_email || 'Director assignment pending'}</div>
              </div>
              <div style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-gray-50)' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Department activity today</div>
                <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                  Outreach added: <strong style={{ color: 'var(--color-text-primary)' }}>{outreachAddedToday}</strong><br />
                  Emails sent: <strong style={{ color: 'var(--color-text-primary)' }}>{outreachEmailsToday}</strong><br />
                  Open team tasks: <strong style={{ color: 'var(--color-text-primary)' }}>{openTasks.length}</strong><br />
                  Staff off today: <strong style={{ color: 'var(--color-text-primary)' }}>{todayLeave.length}</strong><br />
                  New starters: <strong style={{ color: 'var(--color-text-primary)' }}>{newStarters.length}</strong>
                </div>
              </div>
              <div style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-gray-50)' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Team activity feed</div>
                <div style={{ marginTop: 8, display:'grid', gap:8 }}>
                  {teamActivity.map((row, index) => (
                    <div key={`${row.user_name}-${row.created_at}-${index}`} style={{ fontSize:12.5, color:'var(--color-text-secondary)', lineHeight:1.6 }}>
                      <strong style={{ color:'var(--color-text-primary)' }}>{row.user_name || 'Team member'}</strong> · {row.action}
                    </div>
                  ))}
                  {teamActivity.length === 0 ? <div style={{ fontSize:12.5, color:'var(--color-text-tertiary)' }}>No recent team activity yet.</div> : null}
                </div>
              </div>
              <div style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-gray-50)' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Leave and compliance</div>
                <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                  Missing RTW: <strong style={{ color: 'var(--color-text-primary)' }}>{missingRtwCount}</strong><br />
                  Unsigned contracts: <strong style={{ color: 'var(--color-text-primary)' }}>{pendingContractCount}</strong><br />
                  Training due: <strong style={{ color: 'var(--color-text-primary)' }}>{trainingDueCount}</strong><br />
                  Off today: <strong style={{ color: 'var(--color-text-primary)' }}>{todayLeave.length}</strong>
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...DS_CARD, padding: 20 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Department tasks</div>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginTop: 4, flexWrap:'wrap' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>Team task board</div>
              <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => navigate('/tasks')}>Open full task manager</Button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12, marginTop:14 }}>
              {taskBoard.map((column) => (
                <div key={column.key} style={{ border:'1px solid var(--color-border)', borderRadius:14, background:'var(--color-gray-50)', padding:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:10 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:column.tone, letterSpacing:'0.06em', textTransform:'uppercase' }}>{column.label}</div>
                    <StatusBadge variant="info">{column.items.length}</StatusBadge>
                  </div>
                  <div style={{ display:'grid', gap:10 }}>
                    {column.items.map((task) => (
                      <div key={task.id} style={{ padding:'12px 13px', borderRadius:12, border:'1px solid var(--color-border)', background:'var(--color-bg-surface)' }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{task.title}</div>
                        <div style={{ fontSize:11.5, color:'var(--color-text-secondary)', marginTop:5, lineHeight:1.6 }}>
                          {task.description_plain || 'No description'}
                        </div>
                        <div style={{ fontSize:11.5, color:'var(--color-text-tertiary)', marginTop:6 }}>
                          {task.assigned_to_name ? `Owner ${task.assigned_to_name}` : 'Department queue'}
                          {task.due_date ? ` · Due ${new Date(task.due_date).toLocaleDateString('en-GB')}` : ' · No due date'}
                        </div>
                      </div>
                    ))}
                    {column.items.length === 0 ? <div style={{ fontSize:12.5, color:'var(--color-text-tertiary)' }}>No tasks in this column.</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
