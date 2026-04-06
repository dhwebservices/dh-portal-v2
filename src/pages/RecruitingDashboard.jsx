import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, Clock3, Trophy, Users } from 'lucide-react'
import { listApplications, listJobPosts } from '../utils/recruiting'
import RecruitingStatusBadge from '../components/RecruitingStatusBadge'

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
    <div className="fade-in">
      <div style={{ border:'1px solid var(--border)', borderRadius:22, overflow:'hidden', background:'var(--card)', marginBottom:18 }}>
        <div style={{ padding:'18px 20px 16px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:18, alignItems:'flex-start', flexWrap:'wrap' }}>
            <div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:10 }}>
                Recruiting / Home
              </div>
              <h1 style={{ fontSize:'clamp(28px,3vw,36px)', fontWeight:600, letterSpacing:'-0.03em', lineHeight:1, color:'var(--text)' }}>
                Hiring workspace
              </h1>
              <div style={{ fontSize:13, color:'var(--sub)', marginTop:8, lineHeight:1.6 }}>
                Requisition activity, candidate flow, and interview momentum across the recruiting pipeline.
              </div>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button className="btn btn-outline" onClick={() => navigate('/recruiting/jobs')}>Manage jobs</button>
              <button className="btn btn-primary" onClick={() => navigate('/recruiting/applications')}>Open candidates</button>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,minmax(0,1fr))', gap:10, marginTop:18 }}>
            {[
              { label: 'Open roles', value: stats.openJobs, icon: BriefcaseBusiness, tone: 'var(--accent)' },
              { label: 'Pending approvals', value: stats.pendingApprovals, icon: Clock3, tone: 'var(--amber)' },
              { label: 'New', value: stats.newApplicants, icon: Users, tone: 'var(--blue)' },
              { label: 'Shortlisted', value: stats.shortlisted, icon: Users, tone: 'var(--green)' },
              { label: 'Interview', value: stats.interviews, icon: Clock3, tone: 'var(--accent)' },
              { label: 'Offered', value: stats.offered, icon: Trophy, tone: 'var(--amber)' },
              { label: 'Hired', value: stats.hired, icon: Trophy, tone: 'var(--green)' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} style={{ padding:'12px 14px', borderRadius:16, border:'1px solid var(--border)', background:'var(--bg2)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}>
                    <div style={{ fontSize:11, color:'var(--sub)' }}>{item.label}</div>
                    <Icon size={15} color={item.tone} />
                  </div>
                  <div style={{ fontSize:24, fontWeight:600, color:'var(--text)', marginTop:10, lineHeight:1 }}>{item.value}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.08fr) minmax(320px,0.92fr)', gap:16, padding:'16px 20px 20px' }}>
          <div style={{ border:'1px solid var(--border)', borderRadius:18, overflow:'hidden' }}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
              <div style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>Latest candidates</div>
              <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:5 }}>Newest applications coming in from the live careers site.</div>
            </div>
            {recentApplications.length === 0 ? (
              <div className="empty"><p>No applications yet.</p></div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Candidate</th><th>Role</th><th>Status</th><th>Submitted</th></tr></thead>
                <tbody>
                  {recentApplications.map((application) => (
                    <tr key={application.id} style={{ cursor:'pointer' }} onClick={() => navigate(`/recruiting/applications/${application.id}`)}>
                      <td className="t-main">{application.full_name || application.email}</td>
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
            <div className="card card-pad">
              <div style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>Upcoming interviews</div>
              <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:5, marginBottom:12 }}>The next scheduled candidate interviews across the live pipeline.</div>
              <div style={{ display:'grid', gap:10 }}>
                {upcomingInterviews.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No interviews scheduled yet.</div> : null}
                {upcomingInterviews.map((application) => (
                  <button key={application.id} className="btn btn-outline" style={{ justifyContent:'space-between' }} onClick={() => navigate(`/recruiting/applications/${application.id}`)}>
                    <span>{application.full_name || application.email}</span>
                    <span style={{ fontSize:11.5, color:'var(--sub)' }}>{new Date(application.interview_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="card card-pad">
              <div style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>Role actions</div>
              <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:5, lineHeight:1.6 }}>
                Use the requisitions workspace to approve roles, publish live vacancies, and move directly into candidate review.
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:12 }}>
                <button className="btn btn-outline btn-sm" onClick={() => navigate('/recruiting/jobs')}>Open requisitions</button>
                <button className="btn btn-outline btn-sm" onClick={() => navigate('/recruiting/board')}>Open board</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
