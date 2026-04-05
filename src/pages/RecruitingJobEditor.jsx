import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import JobPostForm from '../components/JobPostForm'
import { buildRequisitionPatch, getJobPost, getRequisitionStatusLabel, saveJobPost } from '../utils/recruiting'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../utils/supabase'
import { buildDepartmentCatalogKey, mergeDepartmentCatalog } from '../utils/orgStructure'

const EMPTY_JOB = {
  title: '',
  slug: '',
  department: '',
  hiring_manager_name: '',
  hiring_manager_email: '',
  location_type: 'remote',
  location_text: '',
  employment_type: 'full_time',
  compensation_model: 'commission_only',
  salary_text: '',
  commission_only: true,
  requisition_status: 'draft',
  headcount_requested: 1,
  vacancy_reason: '',
  requisition_priority: 'standard',
  planned_start_date: '',
  budget_owner: '',
  approval_notes: '',
  requested_by_email: '',
  requested_by_name: '',
  requested_at: '',
  decision_by_email: '',
  decision_by_name: '',
  decision_at: '',
  decision_notes: '',
  summary: '',
  description: '',
  responsibilities: '',
  requirements: '',
  benefits: '',
  screening_questions: [],
  status: 'draft',
  closing_at: '',
}

export default function RecruitingJobEditor() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const { user, isDirector } = useAuth()
  const [job, setJob] = useState(EMPTY_JOB)
  const [departmentOptions, setDepartmentOptions] = useState([])
  const [loading, setLoading] = useState(id !== 'new')
  const [saving, setSaving] = useState(false)
  const requestedDepartment = new URLSearchParams(location.search).get('department') || ''

  useEffect(() => {
    supabase
      .from('portal_settings')
      .select('value')
      .eq('key', buildDepartmentCatalogKey())
      .maybeSingle()
      .then(({ data }) => {
        const catalog = mergeDepartmentCatalog(data?.value?.value ?? data?.value ?? [])
        setDepartmentOptions(catalog.filter((item) => item.active !== false).map((item) => item.name))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!id || id === 'new') return
    getJobPost(id).then((row) => row && setJob({ ...EMPTY_JOB, ...row })).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (id !== 'new' || !requestedDepartment) return
    setJob((current) => current.department ? current : { ...current, department: requestedDepartment })
  }, [id, requestedDepartment])

  const actor = {
    email: user?.email || '',
    name: user?.name || user?.email || '',
  }

  const submit = async (patch = {}) => {
    setSaving(true)
    try {
      const saved = await saveJobPost({ ...job, ...patch }, actor.name || actor.email || '')
      setJob({ ...EMPTY_JOB, ...saved })
      navigate(`/recruiting/jobs/${saved.id}`)
    } finally {
      setSaving(false)
    }
  }

  const submitForApproval = async () => {
    await submit({
      ...buildRequisitionPatch('pending_approval', actor),
      status: job.status === 'published' ? 'draft' : (job.status || 'draft'),
    })
  }

  const approveRequisition = async () => {
    await submit(buildRequisitionPatch('approved', actor, job.decision_notes || 'Approved for publication.'))
  }

  const rejectRequisition = async () => {
    const notes = window.prompt('Add a reason for rejecting this requisition', job.decision_notes || '')
    if (notes === null) return
    await submit(buildRequisitionPatch('rejected', actor, notes))
  }

  const publishRole = async () => {
    if (!isDirector && job.requisition_status !== 'approved') return
    const requisitionPatch = isDirector && job.requisition_status !== 'approved'
      ? buildRequisitionPatch('approved', actor, 'Approved on publish')
      : {}
    await submit({ ...requisitionPatch, status: 'published' })
  }

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">{id === 'new' ? 'Create role' : 'Edit role'}</h1>
          <p className="page-sub">Build a full public job post and control how the careers site accepts applications.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={() => navigate('/recruiting/jobs')}>Back</button>
          <button className="btn btn-outline" disabled={saving} onClick={() => submit({ status: 'draft' })}>{saving ? 'Saving...' : 'Save draft'}</button>
          {job.requisition_status !== 'pending_approval' ? (
            <button className="btn btn-outline" disabled={saving} onClick={submitForApproval}>Submit for approval</button>
          ) : null}
          {isDirector && job.requisition_status === 'pending_approval' ? (
            <>
              <button className="btn btn-outline" disabled={saving} onClick={rejectRequisition}>Reject requisition</button>
              <button className="btn btn-outline" disabled={saving} onClick={approveRequisition}>Approve requisition</button>
            </>
          ) : null}
          <button className="btn btn-primary" disabled={saving || (!isDirector && job.requisition_status !== 'approved')} onClick={publishRole}>
            Publish role
          </button>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Approval workflow</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>{getRequisitionStatusLabel(job.requisition_status)}</div>
            <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 6, lineHeight: 1.6 }}>
              {job.requested_at ? `Requested ${new Date(job.requested_at).toLocaleString('en-GB')} by ${job.requested_by_name || job.requested_by_email || 'unknown user'}. ` : 'This role has not been submitted for approval yet. '}
              {job.decision_at ? `Decision made ${new Date(job.decision_at).toLocaleString('en-GB')} by ${job.decision_by_name || job.decision_by_email || 'unknown user'}.` : ''}
            </div>
          </div>
          {!isDirector && job.requisition_status !== 'approved' ? (
            <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--amber-bg)', border: '1px solid var(--amber)', color: 'var(--amber)', fontSize: 12.5, maxWidth: 320 }}>
              Director approval is required before this role can be published publicly.
            </div>
          ) : null}
        </div>
        {job.decision_notes ? (
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.65 }}>
            <strong style={{ color: 'var(--text)' }}>Decision notes:</strong> {job.decision_notes}
          </div>
        ) : null}
      </div>

      <div className="card card-pad">
        <JobPostForm value={{ ...job, department_options: departmentOptions }} onChange={setJob} />
      </div>
    </div>
  )
}
