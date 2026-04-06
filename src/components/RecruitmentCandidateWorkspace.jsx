import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BriefcaseBusiness,
  Download,
  Filter,
  LayoutGrid,
  MapPin,
  Search,
  Settings2,
  SlidersHorizontal,
  Users,
  XCircle,
} from 'lucide-react'
import RecruitingStatusBadge from './RecruitingStatusBadge'
import { listApplications, listJobPosts } from '../utils/recruiting'

const STATUS_ORDER = ['new', 'reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn']
const VIEW_TABS = [
  ['candidates', 'Candidates'],
  ['disqualified', 'Disqualified'],
  ['updates', 'Updates'],
  ['job_details', 'Job Details'],
]

function scoreTone(score) {
  if (score >= 85) return 'green'
  if (score >= 70) return 'blue'
  if (score > 0) return 'amber'
  return 'grey'
}

function formatDate(value) {
  if (!value) return 'Unknown date'
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatLocation(application) {
  return application.location || application.job_posts?.location_text || 'Remote'
}

function getCandidateType(application) {
  if (application.current_job_title) {
    return {
      title: 'Experienced applicant',
      note: application.assigned_recruiter_name ? 'Assigned by recruiter' : 'Candidate applied',
    }
  }

  return {
    title: 'External candidate',
    note: application.assigned_recruiter_name ? 'Assigned by recruiter' : 'Candidate applied',
  }
}

function buildExportCsv(rows = []) {
  const header = ['Candidate', 'Email', 'Status', 'Match', 'Source', 'Location', 'Current role', 'Submitted']
  const body = rows.map((application) => [
    application.full_name || '',
    application.email || '',
    application.status || '',
    application.overall_rating ? `${Number(application.overall_rating) * 20}%` : '',
    application.source || 'website',
    formatLocation(application),
    application.current_job_title || '',
    formatDate(application.submitted_at),
  ])

  return [header, ...body]
    .map((row) => row.map((value) => `"${String(value || '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

function StageChip({ active, label, value, tone, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 10,
        border: active ? `1px solid var(--${tone})` : '1px solid var(--border)',
        background: active ? `var(--${tone}-bg)` : 'var(--bg2)',
        color: 'var(--text)',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      <span>{label}</span>
      <span style={{ color: active ? `var(--${tone})` : 'var(--sub)' }}>{value}</span>
    </button>
  )
}

export default function RecruitmentCandidateWorkspace({
  initialJobId = 'all',
  embedded = false,
  showHeader = true,
}) {
  const navigate = useNavigate()
  const [applications, setApplications] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ query: '', status: 'all', jobId: initialJobId || 'all' })
  const [viewTab, setViewTab] = useState('candidates')

  useEffect(() => {
    setFilters((current) => ({ ...current, jobId: initialJobId || 'all' }))
  }, [initialJobId])

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

  const scopedApplications = useMemo(() => {
    return applications.filter((application) => {
      if (filters.jobId === 'all') return true
      return application.job_post_id === filters.jobId
    })
  }, [applications, filters.jobId])

  const stageCounts = useMemo(() => {
    return STATUS_ORDER.reduce((acc, status) => {
      acc[status] = scopedApplications.filter((application) => application.status === status).length
      return acc
    }, { all: scopedApplications.length })
  }, [scopedApplications])

  const candidateRows = useMemo(() => {
    return scopedApplications.filter((application) => !['rejected', 'withdrawn'].includes(application.status))
  }, [scopedApplications])

  const disqualifiedRows = useMemo(() => {
    return scopedApplications.filter((application) => ['rejected', 'withdrawn'].includes(application.status))
  }, [scopedApplications])

  const filtered = useMemo(() => {
    const query = filters.query.toLowerCase()
    const source = viewTab === 'disqualified' ? disqualifiedRows : candidateRows

    return source.filter((application) => {
      if (viewTab !== 'disqualified' && filters.status !== 'all' && application.status !== filters.status) return false
      if (!query) return true
      return [
        application.full_name,
        application.email,
        application.application_ref,
        application.job_posts?.title,
        application.current_job_title,
        application.location,
        application.source,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
    })
  }, [candidateRows, disqualifiedRows, filters.query, filters.status, viewTab])

  const activeStageChips = useMemo(() => ([
    { key: 'all', label: `All candidates ${candidateRows.length}`, tone: 'blue' },
    { key: 'new', label: 'To review', value: stageCounts.new || 0, tone: 'blue' },
    { key: 'reviewing', label: 'Reviewing', value: stageCounts.reviewing || 0, tone: 'amber' },
    { key: 'shortlisted', label: 'Shortlisted', value: stageCounts.shortlisted || 0, tone: 'green' },
    { key: 'interview', label: 'Interview', value: stageCounts.interview || 0, tone: 'blue' },
    { key: 'offered', label: 'Offered', value: stageCounts.offered || 0, tone: 'green' },
    { key: 'hired', label: 'Hired', value: stageCounts.hired || 0, tone: 'green' },
  ]), [candidateRows.length, stageCounts])

  const updates = useMemo(() => {
    return scopedApplications
      .filter((application) => application.updated_at || application.submitted_at)
      .sort((a, b) => new Date(b.updated_at || b.submitted_at || 0) - new Date(a.updated_at || a.submitted_at || 0))
      .slice(0, 8)
  }, [scopedApplications])

  const exportRows = viewTab === 'disqualified' ? disqualifiedRows : filtered

  const exportCandidates = () => {
    const csv = buildExportCsv(exportRows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const roleSlug = String(activeJob?.title || 'candidates').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    link.href = url
    link.download = `${roleSlug}-candidates.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 20, overflow: 'hidden', background: 'var(--card)' }}>
      {showHeader ? (
        <div style={{ padding: '20px 22px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, var(--page-tint) 8%), var(--card))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 10 }}>
                Recruiting / Job requisitions / {activeJob?.title || 'All roles'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 'clamp(26px,3vw,34px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--text)', margin: 0 }}>
                  {activeJob?.title || 'Applications'}
                </h1>
                {activeJob?.status ? <span className={`badge badge-${activeJob.status === 'published' ? 'green' : activeJob.status === 'draft' ? 'amber' : 'grey'}`}>{activeJob.status}</span> : null}
              </div>
              <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 10, lineHeight: 1.6, maxWidth: 760 }}>
                {activeJob
                  ? `${candidateRows.length} active candidates and ${disqualifiedRows.length} disqualified applicants for this role.`
                  : `${applications.length} applicants captured from the public careers flow.`}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-outline" onClick={exportCandidates}>
                <Download size={14} />
                Export candidates
              </button>
              {activeJob ? (
                <button className="btn btn-primary" onClick={() => navigate(`/recruiting/jobs/${activeJob.id}`)}>
                  Role settings
                </button>
              ) : null}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginTop: 18 }}>
            <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--sub)', marginBottom: 8 }}>Role</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{activeJob?.department || 'Open requisition'}</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--sub)', marginBottom: 8 }}>Hiring plan</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{activeJob?.headcount_requested || 1} opening{Number(activeJob?.headcount_requested || 1) === 1 ? '' : 's'}</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--sub)', marginBottom: 8 }}>Workplace</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{activeJob?.location_text || activeJob?.location_type || 'Remote'}</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--sub)', marginBottom: 8 }}>Employment</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{String(activeJob?.employment_type || 'full_time').replace(/_/g, ' ')}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ padding: embedded ? '18px 22px 22px' : '0 22px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: embedded ? 18 : 0, marginTop: embedded ? 0 : 18 }}>
          {activeStageChips.map((chip) => (
            <StageChip
              key={chip.key}
              active={viewTab !== 'disqualified' && filters.status === chip.key}
              label={chip.label}
              value={chip.value}
              tone={chip.tone}
              onClick={() => {
                setViewTab('candidates')
                setFilters((current) => ({ ...current, status: chip.key }))
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 22, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          {VIEW_TABS.map(([key, label]) => {
            const count = key === 'candidates'
              ? candidateRows.length
              : key === 'disqualified'
                ? disqualifiedRows.length
                : key === 'updates'
                  ? updates.length
                  : 0

            return (
              <button
                key={key}
                onClick={() => setViewTab(key)}
                style={{
                  padding: '14px 0 12px',
                  border: 'none',
                  borderBottom: viewTab === key ? '2px solid var(--accent)' : '2px solid transparent',
                  background: 'transparent',
                  color: viewTab === key ? 'var(--text)' : 'var(--sub)',
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
                {key !== 'job_details' ? <span style={{ color: 'var(--faint)', marginLeft: 6 }}>{count}</span> : null}
              </button>
            )
          })}
        </div>

        <div style={{ padding: embedded ? '18px 0 0' : '18px 0 22px' }}>
          {viewTab === 'candidates' || viewTab === 'disqualified' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,1.4fr) auto auto auto minmax(180px,0.7fr)', gap: 10, alignItems: 'center', marginBottom: 14 }} className="recruiting-table-toolbar">
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)' }} />
                  <input
                    className="inp"
                    value={filters.query}
                    onChange={(e) => setFilters((current) => ({ ...current, query: e.target.value }))}
                    placeholder="Search by candidate, source, location, or title"
                    style={{ paddingLeft: 36 }}
                  />
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => setFilters((current) => ({ ...current, query: '', status: 'all' }))}>
                  <Filter size={14} />
                  Reset
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => navigate('/recruiting/board')}>
                  <LayoutGrid size={14} />
                  Board
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => activeJob && navigate(`/recruiting/jobs/${activeJob.id}${embedded ? '?mode=edit' : ''}`)}>
                  <Settings2 size={14} />
                  Job view
                </button>
                <select className="inp" value={filters.jobId} onChange={(e) => setFilters((current) => ({ ...current, jobId: e.target.value, status: 'all' }))}>
                  <option value="all">All roles</option>
                  {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: 'var(--sub)' }}>
                  Showing {filtered.length} of {viewTab === 'disqualified' ? disqualifiedRows.length : candidateRows.length} {viewTab === 'disqualified' ? 'disqualified applicants' : 'candidates'}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--sub)', fontSize: 12 }}>
                  <SlidersHorizontal size={14} />
                  Compact ATS view
                </div>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                {filtered.length === 0 ? (
                  <div className="empty"><p>No applications match this view.</p></div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="tbl" style={{ minWidth: 1080 }}>
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
                          const candidateType = getCandidateType(application)
                          const matchScore = rating ? rating * 20 : 0
                          return (
                            <tr key={application.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/recruiting/applications/${application.id}`)}>
                              <td className="t-main">
                                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{application.full_name || application.email}</div>
                                <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 4 }}>{formatDate(application.submitted_at)}</div>
                              </td>
                              <td><RecruitingStatusBadge status={application.status} /></td>
                              <td>
                                {matchScore ? (
                                  <span
                                    style={{
                                      width: 38,
                                      height: 38,
                                      borderRadius: '50%',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      border: `2px solid var(--${scoreTone(matchScore)})`,
                                      color: `var(--${scoreTone(matchScore)})`,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      background: `var(--${scoreTone(matchScore)}-bg)`,
                                    }}
                                  >
                                    {matchScore}%
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--faint)' }}>—</span>
                                )}
                              </td>
                              <td style={{ fontSize: 12.5 }}>
                                <div style={{ color: 'var(--text)', fontWeight: 500 }}>{candidateType.title}</div>
                                <div style={{ color: 'var(--sub)', marginTop: 4 }}>{candidateType.note}</div>
                              </td>
                              <td style={{ fontSize: 12.5 }}>
                                <div style={{ color: 'var(--text)' }}>{application.source || 'Website'}</div>
                                <div style={{ color: 'var(--sub)', marginTop: 4 }}>{application.application_ref || 'Direct application'}</div>
                              </td>
                              <td style={{ fontSize: 12.5 }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}>
                                  <MapPin size={13} />
                                  {formatLocation(application)}
                                </div>
                              </td>
                              <td style={{ fontSize: 12.5 }}>
                                <div style={{ color: 'var(--text)' }}>{application.current_job_title || 'Not provided'}</div>
                                <div style={{ color: 'var(--sub)', marginTop: 4 }}>{application.job_posts?.department || application.job_posts?.title || 'Current role not set'}</div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : null}

          {viewTab === 'updates' ? (
            <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              {updates.length === 0 ? (
                <div className="empty"><p>No updates for this role yet.</p></div>
              ) : (
                <div style={{ display: 'grid' }}>
                  {updates.map((application, index) => (
                    <button
                      key={application.id}
                      onClick={() => navigate(`/recruiting/applications/${application.id}`)}
                      style={{
                        border: 'none',
                        borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                        background: 'transparent',
                        textAlign: 'left',
                        padding: '14px 16px',
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0,1fr) auto',
                        gap: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{application.full_name || application.email}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 4, lineHeight: 1.6 }}>
                          Status is {application.status.replace(/_/g, ' ')}. Recruiter: {application.assigned_recruiter_name || 'Unassigned'}.
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--faint)', whiteSpace: 'nowrap' }}>
                        {formatDate(application.updated_at || application.submitted_at)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {viewTab === 'job_details' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
              <div className="card card-pad" style={{ background: 'var(--bg2)' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--sub)', marginBottom: 10 }}>
                  <BriefcaseBusiness size={14} />
                  Requisition
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{activeJob?.title || 'Selected role'}</div>
                <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 8, lineHeight: 1.6 }}>
                  {activeJob?.summary || 'Open the role editor to manage requisition settings, screening questions, publishing, and hiring manager details.'}
                </div>
              </div>

              <div className="card card-pad" style={{ background: 'var(--bg2)' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--sub)', marginBottom: 10 }}>
                  <Users size={14} />
                  Hiring manager
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{activeJob?.hiring_manager_name || 'Not set'}</div>
                <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 8, lineHeight: 1.6 }}>
                  {activeJob?.hiring_manager_email || 'Add a hiring manager in the role editor.'}
                </div>
              </div>

              <div className="card card-pad" style={{ background: 'var(--bg2)' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--sub)', marginBottom: 10 }}>
                  <XCircle size={14} />
                  Requisition notes
                </div>
                <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.7 }}>
                  {activeJob?.decision_notes || activeJob?.approval_notes || 'No requisition notes added yet.'}
                </div>
                <div style={{ marginTop: 14 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => activeJob && navigate(`/recruiting/jobs/${activeJob.id}${embedded ? '?mode=edit' : ''}`)}>
                    Open role
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
