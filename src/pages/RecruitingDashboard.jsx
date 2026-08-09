import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, Clock3, Trophy, Users } from 'lucide-react'
import { listApplications, listJobPosts } from '../utils/recruiting'
import RecruitingStatusBadge from '../components/RecruitingStatusBadge'
import SubNav from '../components/SubNav'
import { Button } from '../components/ds'
import { useAuth } from '../contexts/AuthContext'

export default function RecruitingDashboard() {
  const navigate = useNavigate()
  const { can } = useAuth()
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
    pendingApprovals: jobs.filter((job) => job.requisition_status === 'pending_approval').length,
    newApplicants: applications.filter((item) => item.status === 'new').length,
    shortlisted: applications.filter((item) => item.status === 'shortlisted').length,
    interviews: applications.filter((item) => item.status === 'interview').length,
    offered: applications.filter((item) => item.status === 'offered').length,
    hired: applications.filter((item) => item.status === 'hired').length,
  }), [jobs, applications])

  const recentApplications = applications.slice(0, 8)
  const upcomingInterviews = applications
    .filter((item) => item.interview_at && new Date(item.interview_at) >= new Date())
    .sort((a, b) => new Date(a.interview_at) - new Date(b.interview_at))
    .slice(0, 5)

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Hiring workspace</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>
            Requisition activity, candidate flow, and interview momentum across the recruiting pipeline.
          </p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <Button variant="secondary" onClick={() => navigate('/recruiting/jobs')}>Manage jobs</Button>
          <Button variant="primary" onClick={() => navigate('/recruiting/applications')}>Open candidates</Button>
        </div>
      </div>

      <SubNav items={[
        { label: 'Dashboard', active: true, onClick: () => {} },
        can('recruiting_jobs') && { label: 'Jobs', onClick: () => navigate('/recruiting') },
        can('recruiting_applications') && { label: 'Applications', onClick: () => navigate('/recruiting/applications') },
        can('recruiting_board') && { label: 'Board', onClick: () => navigate('/recruiting/board') },
        can('recruiting_settings') && { label: 'Settings', onClick: () => navigate('/recruiting/settings') },
      ]} />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,minmax(0,1fr))', gap:10, marginBottom:20 }}>
        {[
          { label: 'Open roles', value: stats.openJobs, icon: BriefcaseBusiness },
          { label: 'Pending approvals', value: stats.pendingApprovals, icon: Clock3 },
          { label: 'New', value: stats.newApplicants, icon: Users },
          { label: 'Shortlisted', value: stats.shortlisted, icon: Users },
          { label: 'Interview', value: stats.interviews, icon: Clock3 },
          { label: 'Offered', value: stats.offered, icon: Trophy },
          { label: 'Hired', value: stats.hired, icon: Trophy },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} style={{ padding:'12px 14px', borderRadius:'var(--border-radius-lg)', border:'1px solid var(--color-border)', background:'var(--color-bg-surface)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}>
                <div style={{ fontSize:11, color:'var(--color-text-secondary)' }}>{item.label}</div>
                <Icon size={15} color="var(--color-text-tertiary)" />
              </div>
              <div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)', marginTop:10, lineHeight:1 }}>{item.value}</div>
            </div>
          )
        })}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.08fr) minmax(320px,0.92fr)', gap:16 }}>
        <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', overflow:'hidden' }}>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--color-border)' }}>
            <div style={{ fontSize:15, fontWeight:600, color:'var(--color-text-primary)' }}>Latest candidates</div>
            <div style={{ fontSize:12.5, color:'var(--color-text-secondary)', marginTop:5 }}>Newest applications coming in from the live careers site.</div>
          </div>
          {recentApplications.length === 0 ? (
            <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No applications yet.</div>
          ) : (
            <table className="ds-table">
              <thead><tr><th>Candidate</th><th>Role</th><th>Status</th><th>Submitted</th></tr></thead>
              <tbody>
                {recentApplications.map((application) => (
                  <tr key={application.id} style={{ cursor:'pointer' }} onClick={() => navigate(`/recruiting/applications/${application.id}`)}>
                    <td>{application.full_name || application.email}</td>
                    <td>{application.job_posts?.title || 'General application'}</td>
                    <td><RecruitingStatusBadge status={application.status} /></td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{application.submitted_at ? new Date(application.submitted_at).toLocaleDateString('en-GB') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display:'grid', gap:14 }}>
          <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20 }}>
            <div style={{ fontSize:15, fontWeight:600, color:'var(--color-text-primary)' }}>Upcoming interviews</div>
            <div style={{ fontSize:12.5, color:'var(--color-text-secondary)', marginTop:5, marginBottom:12 }}>The next scheduled candidate interviews across the live pipeline.</div>
            <div style={{ display:'grid', gap:10 }}>
              {upcomingInterviews.length === 0 ? <div style={{ fontSize:12.5, color:'var(--color-text-tertiary)' }}>No interviews scheduled yet.</div> : null}
              {upcomingInterviews.map((application) => (
                <Button key={application.id} variant="secondary" style={{ justifyContent:'space-between', height:'auto', padding:'8px 12px' }} onClick={() => navigate(`/recruiting/applications/${application.id}`)}>
                  <span>{application.full_name || application.email}</span>
                  <span style={{ fontSize:11.5, color:'var(--color-text-secondary)' }}>{new Date(application.interview_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                </Button>
              ))}
            </div>
          </div>

          <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20 }}>
            <div style={{ fontSize:15, fontWeight:600, color:'var(--color-text-primary)' }}>Role actions</div>
            <div style={{ fontSize:12.5, color:'var(--color-text-secondary)', marginTop:5, lineHeight:1.6 }}>
              Use the requisitions workspace to approve roles, publish live vacancies, and move directly into candidate review.
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:12 }}>
              <Button variant="secondary" style={{ height:30, fontSize:12, padding:'0 10px' }} onClick={() => navigate('/recruiting/jobs')}>Open requisitions</Button>
              <Button variant="secondary" style={{ height:30, fontSize:12, padding:'0 10px' }} onClick={() => navigate('/recruiting/board')}>Open board</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
