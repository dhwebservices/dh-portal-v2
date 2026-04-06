import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Filter, Search, Settings2 } from 'lucide-react'
import RecruitingStatusBadge from '../components/RecruitingStatusBadge'
import { listApplications, listJobPosts } from '../utils/recruiting'

const STATUS_ORDER = ['new', 'reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn']
const VIEW_TABS = [
  ['candidates', 'Candidates'],
  ['updates', 'Updates'],
  ['job_details', 'Job Details'],
]

function scoreTone(score) {
  if (score >= 85) return 'green'
  if (score >= 70) return 'blue'
  if (score > 0) return 'amber'
  return 'grey'
}

export default function RecruitingApplications() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialJob = new URLSearchParams(location.search).get('job') || 'all'
  const [applications, setApplications] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ query: '', status: 'all', jobId: initialJob })
  const [viewTab, setViewTab] = useState('candidates')

  useEffect(() => {
    Promise.all([listApplications(), listJobPosts()])
      .then(([applicationRows, jobRows]) => {
        setApplications(applicationRows)
        setJobs(jobRows)
      })
      .finally(() => setLoading(false))
  }, [])

  const activeJob = useMemo(() => {
    if (filters.jobId !== 'all') return jobs.find((job) => job.id === filters.jobId) || null
    return jobs.find((job) => job.status === 'published') || jobs[0] || null
  }, [filters.jobId, jobs])

  const stageCounts = useMemo(() => {
    const source = applications.filter((application) => filters.jobId === 'all' || application.job_post_id === filters.jobId)
    return STATUS_ORDER.reduce((acc, status) => {
      acc[status] = source.filter((application) => application.status === status).length
      return acc
    }, { all: source.length })
  }, [applications, filters.jobId])

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
        application.current_job_title,
        application.location,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
    })
  }, [applications, filters])

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="fade-in">
      <div style={{ border:'1px solid var(--border)', borderRadius:22, overflow:'hidden', background:'var(--card)', marginBottom:18 }}>
        <div style={{ padding:'18px 20px 14px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:10 }}>
            Recruiting / Applications / {activeJob?.title || 'All roles'}
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', gap:18, alignItems:'flex-start', flexWrap:'wrap' }}>
            <div>
              <h1 style={{ fontSize:'clamp(28px,3vw,36px)', fontWeight:600, letterSpacing:'-0.03em', lineHeight:1, color:'var(--text)' }}>
                {activeJob?.title || 'Applications'}
              </h1>
              <div style={{ fontSize:13, color:'var(--sub)', marginTop:8, lineHeight:1.6 }}>
                {activeJob
                  ? `${stageCounts.all} candidates across the live pipeline for this role.`
                  : `${applications.length} applicants captured from the public careers flow.`}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button className="btn btn-outline" onClick={() => navigate('/recruiting/jobs')}>
                Export candidates
              </button>
              <button className="btn btn-primary" onClick={() => navigate('/recruiting/jobs')}>
                Find candidates
              </button>
            </div>
          </div>

          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:18 }}>
            <button
              className={filters.status === 'all' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
              onClick={() => setFilters((current) => ({ ...current, status: 'all' }))}
            >
              All candidates {stageCounts.all}
            </button>
            {STATUS_ORDER.map((status) => (
              <button
                key={status}
                className={filters.status === status ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                onClick={() => setFilters((current) => ({ ...current, status }))}
              >
                {status.replace(/_/g, ' ')} {stageCounts[status] || 0}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding:'0 20px' }}>
          <div style={{ display:'flex', gap:20, borderBottom:'1px solid var(--border)', overflowX:'auto' }}>
            {VIEW_TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setViewTab(key)}
                style={{
                  padding:'14px 0 12px',
                  border:'none',
                  borderBottom: viewTab === key ? '2px solid var(--accent)' : '2px solid transparent',
                  background:'transparent',
                  color: viewTab === key ? 'var(--text)' : 'var(--sub)',
                  fontSize:13,
                  fontWeight:600,
                  whiteSpace:'nowrap',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding:'16px 20px 18px' }}>
          {viewTab === 'candidates' ? (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'minmax(240px,1.3fr) auto auto auto auto', gap:10, alignItems:'center', marginBottom:14 }}>
                <div style={{ position:'relative' }}>
                  <Search size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--faint)' }} />
                  <input
                    className="inp"
                    value={filters.query}
                    onChange={(e) => setFilters((current) => ({ ...current, query: e.target.value }))}
                    placeholder="Search by location, skills, title, or applicant"
                    style={{ paddingLeft:36 }}
                  />
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => setFilters((current) => ({ ...current, status: 'all' }))}>
                  <Filter size={14} />
                  Filters
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => {}}>
                  Group by
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => {}}>
                  <Settings2 size={14} />
                  Custom view
                </button>
                <select className="inp" value={filters.jobId} onChange={(e) => setFilters((current) => ({ ...current, jobId: e.target.value }))}>
                  <option value="all">All roles</option>
                  {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                </select>
              </div>

              <div style={{ border:'1px solid var(--border)', borderRadius:16, overflow:'hidden' }}>
                {filtered.length === 0 ? (
                  <div className="empty"><p>No applications match these filters.</p></div>
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Status</th>
                        <th>Match</th>
                        <th>Candidate type</th>
                        <th>Source</th>
                        <th>Location</th>
                        <th>Current role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((application) => {
                        const rating = Number(application.overall_rating || 0)
                        return (
                          <tr key={application.id} style={{ cursor:'pointer' }} onClick={() => navigate(`/recruiting/applications/${application.id}`)}>
                            <td className="t-main">
                              <div style={{ fontWeight:600 }}>{application.full_name || application.email}</div>
                              <div style={{ fontSize:11.5, color:'var(--sub)', marginTop:4 }}>
                                {application.submitted_at ? new Date(application.submitted_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : 'Unknown date'}
                              </div>
                            </td>
                            <td><RecruitingStatusBadge status={application.status} /></td>
                            <td>
                              {rating ? <span className={`badge badge-${scoreTone(rating * 20)}`}>{rating * 20}%</span> : <span style={{ color:'var(--faint)' }}>—</span>}
                            </td>
                            <td style={{ fontSize:12.5 }}>
                              <div>{application.current_job_title ? 'Current employee background' : 'External candidate'}</div>
                              <div style={{ color:'var(--sub)', marginTop:4 }}>{application.assigned_recruiter_name ? `Assigned by recruiter` : 'Candidate applied'}</div>
                            </td>
                            <td style={{ fontSize:12.5 }}>{application.source || 'Website'}</td>
                            <td style={{ fontSize:12.5 }}>{application.location || '—'}</td>
                            <td style={{ fontSize:12.5 }}>{application.current_job_title || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : null}

          {viewTab === 'updates' ? (
            <div className="card card-pad" style={{ background:'var(--bg2)' }}>
              <div style={{ fontSize:15, fontWeight:600, color:'var(--text)', marginBottom:8 }}>Recruiting updates</div>
              <div style={{ fontSize:13, color:'var(--sub)', lineHeight:1.6 }}>
                Status changes, assignment activity, and interview updates remain available in each applicant profile. This tab is reserved for a denser ATS activity stream next.
              </div>
            </div>
          ) : null}

          {viewTab === 'job_details' ? (
            <div className="card card-pad" style={{ background:'var(--bg2)' }}>
              <div style={{ fontSize:15, fontWeight:600, color:'var(--text)', marginBottom:8 }}>Job details</div>
              <div style={{ fontSize:13, color:'var(--sub)', lineHeight:1.6 }}>
                Open the role editor to manage requisition settings, screening questions, publishing, and hiring manager details for this vacancy.
              </div>
              <div style={{ marginTop:14 }}>
                <button className="btn btn-primary btn-sm" onClick={() => activeJob && navigate(`/recruiting/jobs/${activeJob.id}`)}>Open role</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
