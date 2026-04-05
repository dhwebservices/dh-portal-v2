import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ApplicationFilters from '../components/ApplicationFilters'
import RecruitingStatusBadge from '../components/RecruitingStatusBadge'
import { listApplications, listJobPosts } from '../utils/recruiting'

export default function RecruitingApplications() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialJob = new URLSearchParams(location.search).get('job') || 'all'
  const [applications, setApplications] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ query: '', status: 'all', jobId: initialJob })

  useEffect(() => {
    Promise.all([listApplications(), listJobPosts()])
      .then(([applicationRows, jobRows]) => {
        setApplications(applicationRows)
        setJobs(jobRows)
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const query = filters.query.toLowerCase()
    return applications.filter((application) => {
      if (filters.status !== 'all' && application.status !== filters.status) return false
      if (filters.jobId !== 'all' && application.job_post_id !== filters.jobId) return false
      if (!query) return true
      return [
        application.full_name,
        application.email,
        application.application_ref,
        application.job_posts?.title,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
    })
  }, [applications, filters])

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Applications</h1>
          <p className="page-sub">{applications.length} applicants captured from the public careers flow.</p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <ApplicationFilters jobs={jobs} filters={filters} onChange={setFilters} />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty"><p>No applications match these filters.</p></div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Applicant</th><th>Role</th><th>Status</th><th>Reference</th><th>Submitted</th></tr></thead>
            <tbody>
              {filtered.map((application) => (
                <tr key={application.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/recruiting/applications/${application.id}`)}>
                  <td className="t-main">{application.full_name || application.email}</td>
                  <td>{application.job_posts?.title || 'General application'}</td>
                  <td><RecruitingStatusBadge status={application.status} /></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{application.application_ref || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{application.submitted_at ? new Date(application.submitted_at).toLocaleDateString('en-GB') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
