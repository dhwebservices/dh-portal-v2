import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, Users, Trophy, Clock3 } from 'lucide-react'
import { listApplications, listJobPosts } from '../utils/recruiting'
import RecruitingStatusBadge from '../components/RecruitingStatusBadge'

function StatCard({ icon: Icon, label, value, hint, tone = 'var(--accent)' }) {
  return (
    <div className="stat-card">
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `${tone}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={tone} />
      </div>
      <div style={{ marginTop: 20 }}>
        <div className="stat-val">{value}</div>
        <div className="stat-lbl">{label}</div>
        {hint ? <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 6 }}>{hint}</div> : null}
      </div>
    </div>
  )
}

export default function RecruitingDashboard() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listJobPosts(), listApplications()])
      .then(([jobRows, applicationRows]) => {
        setJobs(jobRows)
        setApplications(applicationRows)
      })
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => ({
    openJobs: jobs.filter((job) => job.status === 'published').length,
    newApplicants: applications.filter((item) => item.status === 'new').length,
    shortlisted: applications.filter((item) => item.status === 'shortlisted').length,
    hired: applications.filter((item) => item.status === 'hired').length,
    upcomingInterviews: applications.filter((item) => item.interview_at && new Date(item.interview_at) >= new Date()).length,
    scoredApplicants: applications.filter((item) => item.overall_rating > 0).length,
  }), [jobs, applications])

  const recentApplications = applications.slice(0, 8)
  const staleJobs = jobs.filter((job) => job.status === 'draft' || job.status === 'archived').slice(0, 6)
  const upcomingInterviews = applications
    .filter((item) => item.interview_at && new Date(item.interview_at) >= new Date())
    .sort((a, b) => new Date(a.interview_at) - new Date(b.interview_at))
    .slice(0, 5)
  const strongestCandidates = applications
    .filter((item) => item.overall_rating > 0)
    .sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0))
    .slice(0, 5)

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Recruiting</h1>
          <p className="page-sub">Live hiring overview across roles, applicants, and next-stage actions.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => navigate('/recruiting/jobs')}>Manage jobs</button>
          <button className="btn btn-primary" onClick={() => navigate('/recruiting/applications')}>View applications</button>
        </div>
      </div>

      <div className="dashboard-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 14, marginBottom: 22 }}>
        <StatCard icon={BriefcaseBusiness} label="Open roles" value={stats.openJobs} hint={`${jobs.length} total roles`} />
        <StatCard icon={Users} label="New applicants" value={stats.newApplicants} hint="Fresh applications waiting for first review" tone="var(--amber)" />
        <StatCard icon={Clock3} label="Shortlisted" value={stats.shortlisted} hint="Candidates in the active pipeline" tone="var(--accent)" />
        <StatCard icon={Clock3} label="Upcoming interviews" value={stats.upcomingInterviews} hint="Scheduled candidate interviews" tone="var(--blue)" />
        <StatCard icon={Users} label="Scored candidates" value={stats.scoredApplicants} hint="Applicants with hiring feedback logged" tone="var(--purple)" />
        <StatCard icon={Trophy} label="Hired" value={stats.hired} hint="Applications moved into hire status" tone="var(--green)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)', gap: 18 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Recent applications</div>
            <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 5 }}>Newest applicants coming in from the public careers site.</div>
          </div>
          {recentApplications.length === 0 ? (
            <div className="empty"><p>No applications yet.</p></div>
          ) : (
            <table className="tbl">
              <thead><tr><th>Applicant</th><th>Role</th><th>Status</th><th>Submitted</th></tr></thead>
              <tbody>
                {recentApplications.map((application) => (
                  <tr key={application.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/recruiting/applications/${application.id}`)}>
                    <td className="t-main">{application.full_name || application.email}</td>
                    <td>{application.job_posts?.title || 'General application'}</td>
                    <td><RecruitingStatusBadge status={application.status} /></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{application.submitted_at ? new Date(application.submitted_at).toLocaleDateString('en-GB') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card card-pad">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Roles needing attention</div>
            <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 5, marginBottom: 12 }}>Draft or archived roles that may need refreshing.</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {staleJobs.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>All roles are currently active or already published.</div> : null}
              {staleJobs.map((job) => (
                <button key={job.id} className="btn btn-outline" style={{ justifyContent: 'space-between' }} onClick={() => navigate(`/recruiting/jobs/${job.id}`)}>
                  <span>{job.title}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>{job.status}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Workflow</div>
            <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 5, lineHeight: 1.65 }}>
              The new Hiring workspace now separates pre-hire applicants from employee HR records. Marking someone as hired can be used later to push them into onboarding and then into the staff HCM record.
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Upcoming interviews</div>
            <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 5, marginBottom: 12 }}>The next scheduled candidate interviews across the hiring pipeline.</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {upcomingInterviews.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No interviews scheduled yet.</div> : null}
              {upcomingInterviews.map((application) => (
                <button key={application.id} className="btn btn-outline" style={{ justifyContent: 'space-between' }} onClick={() => navigate(`/recruiting/applications/${application.id}`)}>
                  <span>{application.full_name || application.email}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>{new Date(application.interview_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Top rated candidates</div>
            <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 5, marginBottom: 12 }}>Applicants with the strongest saved scorecards so far.</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {strongestCandidates.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No candidates have been scored yet.</div> : null}
              {strongestCandidates.map((application) => (
                <button key={application.id} className="btn btn-outline" style={{ justifyContent: 'space-between' }} onClick={() => navigate(`/recruiting/applications/${application.id}`)}>
                  <span>{application.full_name || application.email}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>{application.overall_rating}/5</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
