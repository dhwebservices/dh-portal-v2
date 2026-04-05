import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { buildRequisitionPatch, deleteJobPost, getRequisitionStatusTone, listJobPosts, saveJobPost } from '../utils/recruiting'

export default function RecruitingJobs() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isDirector } = useAuth()
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
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Job posts</h1>
          <p className="page-sub">
            {departmentFilter
              ? `${filtered.length} roles linked to ${departmentFilter}.`
              : `${jobs.length} roles across draft, published, and archived states.`}
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate(`/recruiting/jobs/new${departmentFilter ? `?department=${encodeURIComponent(departmentFilter)}` : ''}`)}
        >
          New role
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {['all', 'pending_approval', 'draft', 'published', 'archived'].map((item) => (
          <button key={item} className={filter === item ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} onClick={() => setFilter(item)}>
            {item === 'all' ? 'All roles' : item === 'pending_approval' ? 'Pending approval' : item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
        {departmentFilter ? (
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/recruiting/jobs')}>
            Clear department
          </button>
        ) : null}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty"><p>No job posts in this view yet.</p></div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Role</th><th>Department</th><th>Requisition</th><th>Status</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {filtered.map((job) => (
                <tr key={job.id}>
                  <td className="t-main">
                    <div>{job.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 4 }}>
                      {job.headcount_requested || 1} hire{Number(job.headcount_requested || 1) === 1 ? '' : 's'} • {job.requisition_priority || 'standard'} priority
                    </div>
                  </td>
                  <td>{job.department || '—'}</td>
                  <td><span className={`badge badge-${getRequisitionStatusTone(job.requisition_status)}`}>{(job.requisition_status || 'draft').replace(/_/g, ' ')}</span></td>
                  <td><span className={`badge badge-${job.status === 'published' ? 'green' : job.status === 'draft' ? 'amber' : 'grey'}`}>{job.status}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{job.updated_at ? new Date(job.updated_at).toLocaleDateString('en-GB') : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {isDirector && job.requisition_status === 'pending_approval' ? (
                        <>
                          <button className="btn btn-outline btn-sm" disabled={savingId === job.id} onClick={() => decideRequisition(job, 'rejected')}>Reject</button>
                          <button className="btn btn-outline btn-sm" disabled={savingId === job.id} onClick={() => decideRequisition(job, 'approved')}>Approve</button>
                        </>
                      ) : null}
                      <button className="btn btn-outline btn-sm" onClick={() => navigate(`/recruiting/jobs/${job.id}`)}>Edit</button>
                      <button className="btn btn-outline btn-sm" onClick={() => navigate(`/recruiting/applications?job=${job.id}`)}>Applications</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(job)}>Delete</button>
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
