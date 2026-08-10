import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import JobPostForm from '../components/JobPostForm'
import { buildRequisitionPatch, getJobPost, getRequisitionStatusLabel, saveJobPost } from '../utils/recruiting'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../utils/supabase'
import { buildDepartmentCatalogKey, mergeDepartmentCatalog } from '../utils/orgStructure'
import RecruitmentCandidateWorkspace from '../components/RecruitmentCandidateWorkspace'
import { Button, StatusBadge } from '../components/ds'

const DS_CARD = { background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)' }
const TONE_TO_VARIANT = { green:'active', amber:'warning', red:'error', blue:'info', grey: 'neutral' }

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
  const mode = new URLSearchParams(location.search).get('mode') || 'overview'
  const isNew = id === 'new'
  const isEditMode = isNew || mode === 'edit'

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
    if (!id || isNew) return
    getJobPost(id).then((row) => row && setJob({ ...EMPTY_JOB, ...row })).finally(() => setLoading(false))
  }, [id, isNew])

  useEffect(() => {
    if (!isNew || !requestedDepartment) return
    setJob((current) => current.department ? current : { ...current, department: requestedDepartment })
  }, [isNew, requestedDepartment])

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

  const publishedApplicationsLink = job?.id ? `/recruiting/applications?job=${job.id}` : '/recruiting/applications'

  if (!isEditMode) {
    return (
      <div className="ds-content">
        <div className="ds-page-header">
          <div>
            <h1>{job.title || 'Role overview'}</h1>
            <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Role overview and candidates</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => navigate('/recruiting')}>Back</Button>
            <Button variant="secondary" onClick={() => navigate(publishedApplicationsLink)}>Open standalone applications</Button>
            <Button variant="primary" onClick={() => navigate(`/recruiting/jobs/${id}?mode=edit`)}>Edit role</Button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 18 }}>
          <div style={{ ...DS_CARD, padding: 20 }}>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Status</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <StatusBadge variant={TONE_TO_VARIANT[job.status === 'published' ? 'green' : job.status === 'draft' ? 'amber' : 'grey'] || 'info'}>{job.status || 'draft'}</StatusBadge>
              <StatusBadge variant={TONE_TO_VARIANT[job.requisition_status === 'approved' ? 'green' : job.requisition_status === 'pending_approval' ? 'amber' : job.requisition_status === 'rejected' ? 'red' : 'grey'] || 'info'}>
                {getRequisitionStatusLabel(job.requisition_status)}
              </StatusBadge>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginTop: 10 }}>
              {job.requested_at ? `Requested ${new Date(job.requested_at).toLocaleString('en-GB')}.` : 'Not yet submitted for approval.'}
            </div>
          </div>

          <div style={{ ...DS_CARD, padding: 20 }}>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Hiring manager</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>{job.hiring_manager_name || 'Not set'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginTop: 10 }}>
              {job.hiring_manager_email || 'Add an owner in edit mode.'}
            </div>
          </div>

          <div style={{ ...DS_CARD, padding: 20 }}>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Role setup</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>{job.department || 'No department'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginTop: 10 }}>
              {job.headcount_requested || 1} opening{Number(job.headcount_requested || 1) === 1 ? '' : 's'} · {String(job.employment_type || 'full_time').replace(/_/g, ' ')}
            </div>
          </div>

          <div style={{ ...DS_CARD, padding: 20 }}>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Notes</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
              {job.decision_notes || job.approval_notes || job.summary || 'No notes added yet.'}
            </div>
          </div>
        </div>

        {!isDirector && job.requisition_status !== 'approved' ? (
          <div style={{ ...DS_CARD, padding: 20, marginBottom: 18, borderColor: 'var(--color-amber-500)', background: 'var(--color-amber-50)', color: 'var(--color-amber-500)' }}>
            Director approval is still required before this role can be published publicly.
          </div>
        ) : null}

        <RecruitmentCandidateWorkspace initialJobId={id} embedded showHeader={false} />
      </div>
    )
  }

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>{isNew ? 'Create role' : 'Edit role'}</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Job post and application settings</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={() => navigate(isNew ? '/recruiting' : `/recruiting/jobs/${id}`)}>Back</Button>
          <Button variant="secondary" disabled={saving} onClick={() => submit({ status: 'draft' })}>{saving ? 'Saving...' : 'Save draft'}</Button>
          {job.requisition_status !== 'pending_approval' ? (
            <Button variant="secondary" disabled={saving} onClick={submitForApproval}>Submit for approval</Button>
          ) : null}
          {isDirector && job.requisition_status === 'pending_approval' ? (
            <>
              <Button variant="secondary" disabled={saving} onClick={rejectRequisition}>Reject requisition</Button>
              <Button variant="secondary" disabled={saving} onClick={approveRequisition}>Approve requisition</Button>
            </>
          ) : null}
          <Button variant="primary" disabled={saving || (!isDirector && job.requisition_status !== 'approved')} onClick={publishRole}>
            Publish role
          </Button>
        </div>
      </div>

      <div style={{ ...DS_CARD, padding: 20, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Approval workflow</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4 }}>{getRequisitionStatusLabel(job.requisition_status)}</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
              {job.requested_at ? `Requested ${new Date(job.requested_at).toLocaleString('en-GB')} by ${job.requested_by_name || job.requested_by_email || 'unknown user'}. ` : 'This role has not been submitted for approval yet. '}
              {job.decision_at ? `Decision made ${new Date(job.decision_at).toLocaleString('en-GB')} by ${job.decision_by_name || job.decision_by_email || 'unknown user'}.` : ''}
            </div>
          </div>
          {!isDirector && job.requisition_status !== 'approved' ? (
            <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--color-amber-50)', border: '1px solid var(--color-amber-500)', color: 'var(--color-amber-500)', fontSize: 12.5, maxWidth: 320 }}>
              Director approval is required before this role can be published publicly.
            </div>
          ) : null}
        </div>
        {job.decision_notes ? (
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'var(--color-gray-50)', border: '1px solid var(--color-border)', fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
            <strong style={{ color: 'var(--color-text-primary)' }}>Decision notes:</strong> {job.decision_notes}
          </div>
        ) : null}
      </div>

      <div style={{ ...DS_CARD, padding: 20 }}>
        <JobPostForm value={{ ...job, department_options: departmentOptions }} onChange={setJob} />
      </div>
    </div>
  )
}
