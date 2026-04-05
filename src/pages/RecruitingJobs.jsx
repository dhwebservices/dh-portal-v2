import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteJobPost, listJobPosts } from '../utils/recruiting'

export default function RecruitingJobs() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listJobPosts().then(setJobs).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => jobs.filter((job) => filter === 'all' ? true : job.status === filter), [jobs, filter])

  const remove = async (job) => {
    if (!confirm(`Delete "${job.title}"?`)) return
    await deleteJobPost(job.id)
    setJobs((current) => current.filter((item) => item.id !== job.id))
  }

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Job posts</h1>
          <p className="page-sub">{jobs.length} roles across draft, published, and archived states.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/recruiting/jobs/new')}>New role</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {['all', 'draft', 'published', 'archived'].map((item) => (
          <button key={item} className={filter === item ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} onClick={() => setFilter(item)}>
            {item === 'all' ? 'All roles' : item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty"><p>No job posts in this view yet.</p></div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Role</th><th>Department</th><th>Status</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {filtered.map((job) => (
                <tr key={job.id}>
                  <td className="t-main">{job.title}</td>
                  <td>{job.department || '—'}</td>
                  <td><span className={`badge badge-${job.status === 'published' ? 'green' : job.status === 'draft' ? 'amber' : 'grey'}`}>{job.status}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{job.updated_at ? new Date(job.updated_at).toLocaleDateString('en-GB') : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
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
