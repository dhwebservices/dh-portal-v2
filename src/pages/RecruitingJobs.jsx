import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, CircleCheck, Clock3, FileText } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import SubNav from '../components/SubNav'
import { Button, StatusBadge } from '../components/ds'
import { buildRequisitionPatch, deleteJobPost, getRequisitionStatusTone, listJobPosts, saveJobPost } from '../utils/recruiting'

const TONE_TO_VARIANT = { green: 'active', amber: 'warning', red: 'error', blue: 'info', grey: 'neutral' }

export default function RecruitingJobs() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isDirector, can } = useAuth()
  const [jobs, setJobs] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const departmentFilter = new URLSearchParams(location.search).get('department') || ''

  useEffect(() => {
    listJobPosts().then(setJobs).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return jobs.filter((job) => {
      const matchesStatus = filter === 'all'
        ? true
        : filter === 'pending_approval'
          ? job.requisition_status === 'pending_approval'
          : job.status === filter
      const matchesDepartment = departmentFilter ? job.department === departmentFilter : true
      return matchesStatus && matchesDepartment
    })
  }, [departmentFilter, jobs, filter])

  const stats = useMemo(() => ({
    total: jobs.length,
    published: jobs.filter((job) => job.status === 'published').length,
    approvals: jobs.filter((job) => job.requisition_status === 'pending_approval').length,
    drafts: jobs.filter((job) => job.status === 'draft').length,
  }), [jobs])

  const remove = async (job) => {
    if (!confirm(`Delete "${job.title}"?`)) return
    await deleteJobPost(job.id)
    setJobs((current) => current.filter((item) => item.id !== job.id))
  }

  const actor = {
    email: user?.email || '',
    name: user?.name || user?.email || '',
  }

  const decideRequisition = async (job, nextStatus) => {
    if (!isDirector) return
    const notes = nextStatus === 'rejected'
      ? window.prompt('Add a reason for rejecting this requisition', job.decision_notes || '')
      : (job.decision_notes || 'Approved for publication.')
    if (notes === null) return
    setSavingId(job.id)
    try {
      const saved = await saveJobPost({
        ...job,
        ...buildRequisitionPatch(nextStatus, actor, notes),
      }, actor.name || actor.email || '')
      setJobs((current) => current.map((item) => item.id === saved.id ? saved : item))
    } finally {
      setSavingId('')
    }
  }

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Recruitment</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>
            {departmentFilter ? `${filtered.length} roles linked to ${departmentFilter}.` : `${jobs.length} roles across draft, approval, and live publishing states. Open any role to view its overview and applications.`}
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate(`/recruiting/jobs/new${departmentFilter ? `?department=${encodeURIComponent(departmentFilter)}` : ''}`)}>
          New role
        </Button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:10, marginBottom:20 }}>
        {[
          { label: 'All roles', value: stats.total, icon: FileText },
          { label: 'Published', value: stats.published, icon: CircleCheck },
          { label: 'Pending approval', value: stats.approvals, icon: Clock3 },
          { label: 'Drafts', value: stats.drafts, icon: BriefcaseBusiness },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} style={{ padding:'12px 14px', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', background:'var(--color-bg-surface)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                <div style={{ fontSize:11, color:'var(--color-text-secondary)' }}>{item.label}</div>
                <Icon size={15} color="var(--color-text-tertiary)" />
              </div>
              <div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)', marginTop:10, lineHeight:1 }}>{item.value}</div>
            </div>
          )
        })}
      </div>

      <SubNav items={[
        { label: 'Dashboard', onClick: () => navigate('/recruiting/dashboard') },
        { label: 'Jobs', active: true, onClick: () => {} },
        can('recruiting_applications') && { label: 'Applications', onClick: () => navigate('/recruiting/applications') },
        can('recruiting_board') && { label: 'Board', onClick: () => navigate('/recruiting/board') },
        can('recruiting_settings') && { label: 'Settings', onClick: () => navigate('/recruiting/settings') },
      ]} />

      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {['all', 'pending_approval', 'draft', 'published', 'archived'].map((item) => (
          <Button key={item} variant={filter === item ? 'primary' : 'secondary'} style={{ height:30, fontSize:12, padding:'0 10px' }} onClick={() => setFilter(item)}>
            {item === 'all' ? 'All roles' : item === 'pending_approval' ? 'Pending approval' : item.charAt(0).toUpperCase() + item.slice(1)}
          </Button>
        ))}
        {departmentFilter ? (
          <Button variant="secondary" style={{ height:30, fontSize:12, padding:'0 10px' }} onClick={() => navigate('/recruiting')}>
            Clear department
          </Button>
        ) : null}
      </div>

      <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', overflow:'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No job posts in this view yet.</div>
        ) : (
          <table className="ds-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Department</th>
                <th>Requisition</th>
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => (
                <tr key={job.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/recruiting/jobs/${job.id}`)}>
                  <td>
                    <div>{job.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                      {job.headcount_requested || 1} hire{Number(job.headcount_requested || 1) === 1 ? '' : 's'} · {job.requisition_priority || 'standard'} priority
                    </div>
                  </td>
                  <td>{job.department || '—'}</td>
                  <td><StatusBadge variant={TONE_TO_VARIANT[getRequisitionStatusTone(job.requisition_status)] || 'info'}>{(job.requisition_status || 'draft').replace(/_/g, ' ')}</StatusBadge></td>
                  <td><StatusBadge variant={job.status === 'published' ? 'active' : job.status === 'draft' ? 'warning' : 'info'}>{job.status}</StatusBadge></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{job.updated_at ? new Date(job.updated_at).toLocaleDateString('en-GB') : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }} onClick={(event) => event.stopPropagation()}>
                      {isDirector && job.requisition_status === 'pending_approval' ? (
                        <>
                          <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} disabled={savingId === job.id} onClick={() => decideRequisition(job, 'rejected')}>Reject</Button>
                          <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} disabled={savingId === job.id} onClick={() => decideRequisition(job, 'approved')}>Approve</Button>
                        </>
                      ) : null}
                      <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => navigate(`/recruiting/jobs/${job.id}`)}>Open</Button>
                      <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => navigate(`/recruiting/jobs/${job.id}?mode=edit`)}>Edit</Button>
                      <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px', color:'var(--color-red-500)' }} onClick={() => remove(job)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
