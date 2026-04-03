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
import { createDepartmentAnnouncement } from '../utils/peopleOps'

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
    const [{ data: hrd }, { data: onboarding }, { data: lifecycleSettings }, { data: orgSettings }, { data: outreachData }, { data: emailData }, { data: taskData }, { data: announcementSettings }, { data: auditRows }, { data: leaveData }, { data: docsData }, { data: complianceSettings }, { data: contractSettings }] = await Promise.all([
      supabase.from('hr_profiles').select('*').order('full_name'),
      supabase.from('onboarding_submissions').select('*'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_lifecycle:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_org:%'),
      supabase.from('outreach').select('id,created_at,notes,added_by'),
      supabase.from('email_log').select('id,sent_at,sent_by,sent_by_email'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('portal_settings').select('key,value').like('key', 'department_announcement:%'),
      supabase.from('audit_log').select('user_name,action,target,created_at').order('created_at', { ascending: false }).limit(120),
      supabase.from('hr_leave').select('id,user_email,user_name,leave_type,start_date,end_date,status').eq('status', 'approved').order('start_date', { ascending: true }),
      supabase.from('staff_documents').select('staff_email,name,type,file_url,file_path,created_at'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_compliance:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_contract:%'),
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
      <div className="card card-pad" style={{ maxWidth: 620 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text)' }}>No team assigned</div>
        <div style={{ marginTop: 8, fontSize: 14, color: 'var(--sub)', lineHeight: 1.7 }}>
          Your staff profile is not currently assigned to a department yet, so there is no team view available.
        </div>
      </div>
    )
  }

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">View My Team</h1>
          <p className="page-sub">Read-only team view for {currentDepartment}.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard icon={Building2} label="Department" value={currentDepartment} hint={manager ? `Managed by ${manager.full_name || manager.user_email}` : 'No department manager set'} />
        <StatCard icon={Users} label="Team members" value={profiles.length} hint="People currently assigned to this department" tone="var(--green)" />
        <StatCard icon={FolderPlus} label="Outreach added today" value={outreachAddedToday} hint="New client-contact records logged today" tone="var(--blue)" />
        <StatCard icon={ShieldCheck} label="Open team tasks" value={openTasks.length} hint={`${overdueTasks.length} overdue`} tone="var(--amber)" />
        <StatCard icon={ShieldCheck} label="Compliance watch" value={missingRtwCount + pendingContractCount} hint={`${missingRtwCount} missing RTW · ${pendingContractCount} unsigned contracts`} tone="var(--red)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(320px,0.85fr)', gap: 18 }} className="staff-profile-main-grid">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Team members</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>{currentDepartment}</div>
          </div>
          {profiles.length === 0 ? (
            <div style={{ padding: '24px 18px', color: 'var(--faint)', fontSize: 13 }}>No staff are currently assigned to this department.</div>
          ) : profiles.map((row) => (
            <div key={row.user_email} style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{row.full_name || row.user_email}</div>
                  <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4 }}>{row.role || 'Staff'} · {row.org?.role_scope === 'department_manager' ? 'Department Manager' : 'Team member'}</div>
                </div>
                <span className={`badge badge-${row.lifecycle?.state === 'onboarding' ? 'amber' : row.lifecycle?.state === 'active' ? 'green' : 'blue'}`}>
                  {getLifecycleLabel(row.lifecycle?.state)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card card-pad">
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Department announcements</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>Team updates</div>
            <div style={{ display:'grid', gap:10, marginTop:14 }}>
              {announcements.slice(0, 4).map((item) => (
                <div key={item.id} style={{ padding:'12px 13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg2)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{item.title}</div>
                    <span className={`badge badge-${item.important ? 'red' : 'blue'}`}>{item.important ? 'Important' : 'Update'}</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--sub)', marginTop:6, lineHeight:1.6 }}>{item.message}</div>
                </div>
              ))}
              {announcements.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No team announcements yet.</div> : null}
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Team overview</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>Manager and team activity</div>
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              <div style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
                <div style={{ fontSize: 12, color: 'var(--faint)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Manager</div>
                <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{manager?.full_name || org?.reports_to_name || 'No manager set'}</div>
                <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4 }}>{manager?.user_email || org?.reports_to_email || 'Director assignment pending'}</div>
              </div>
              <div style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
                <div style={{ fontSize: 12, color: 'var(--faint)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Department activity today</div>
                <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.7 }}>
                  Outreach added: <strong style={{ color: 'var(--text)' }}>{outreachAddedToday}</strong><br />
                  Emails sent: <strong style={{ color: 'var(--text)' }}>{outreachEmailsToday}</strong><br />
                  Open team tasks: <strong style={{ color: 'var(--text)' }}>{openTasks.length}</strong><br />
                  Staff off today: <strong style={{ color: 'var(--text)' }}>{todayLeave.length}</strong><br />
                  New starters: <strong style={{ color: 'var(--text)' }}>{newStarters.length}</strong>
                </div>
              </div>
              <div style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
                <div style={{ fontSize: 12, color: 'var(--faint)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Team activity feed</div>
                <div style={{ marginTop: 8, display:'grid', gap:8 }}>
                  {teamActivity.map((row, index) => (
                    <div key={`${row.user_name}-${row.created_at}-${index}`} style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.6 }}>
                      <strong style={{ color:'var(--text)' }}>{row.user_name || 'Team member'}</strong> · {row.action}
                    </div>
                  ))}
                  {teamActivity.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No recent team activity yet.</div> : null}
                </div>
              </div>
              <div style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
                <div style={{ fontSize: 12, color: 'var(--faint)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Leave and compliance</div>
                <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.7 }}>
                  Missing RTW: <strong style={{ color: 'var(--text)' }}>{missingRtwCount}</strong><br />
                  Unsigned contracts: <strong style={{ color: 'var(--text)' }}>{pendingContractCount}</strong><br />
                  Off today: <strong style={{ color: 'var(--text)' }}>{todayLeave.length}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Department tasks</div>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginTop: 4, flexWrap:'wrap' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Team task board</div>
              <button className="btn btn-outline btn-sm" onClick={() => navigate('/tasks')}>Open full task manager</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12, marginTop:14 }}>
              {taskBoard.map((column) => (
                <div key={column.key} style={{ border:'1px solid var(--border)', borderRadius:14, background:'var(--bg2)', padding:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:10 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:column.tone, letterSpacing:'0.06em', textTransform:'uppercase' }}>{column.label}</div>
                    <span className="badge badge-grey">{column.items.length}</span>
                  </div>
                  <div style={{ display:'grid', gap:10 }}>
                    {column.items.map((task) => (
                      <div key={task.id} style={{ padding:'12px 13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--card)' }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{task.title}</div>
                        <div style={{ fontSize:11.5, color:'var(--sub)', marginTop:5, lineHeight:1.6 }}>
                          {task.description_plain || 'No description'}
                        </div>
                        <div style={{ fontSize:11.5, color:'var(--faint)', marginTop:6 }}>
                          {task.assigned_to_name ? `Owner ${task.assigned_to_name}` : 'Department queue'}
                          {task.due_date ? ` · Due ${new Date(task.due_date).toLocaleDateString('en-GB')}` : ' · No due date'}
                        </div>
                      </div>
                    ))}
                    {column.items.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No tasks in this column.</div> : null}
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
