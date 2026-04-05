import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import JobPostForm from '../components/JobPostForm'
import { getJobPost, saveJobPost } from '../utils/recruiting'
import { useAuth } from '../contexts/AuthContext'

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
  const { id } = useParams()
  const { user } = useAuth()
  const [job, setJob] = useState(EMPTY_JOB)
  const [loading, setLoading] = useState(id !== 'new')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id || id === 'new') return
    getJobPost(id).then((row) => row && setJob({ ...EMPTY_JOB, ...row })).finally(() => setLoading(false))
  }, [id])

  const submit = async (nextStatus = job.status || 'draft') => {
    setSaving(true)
    try {
      const saved = await saveJobPost({ ...job, status: nextStatus }, user?.name || user?.email || '')
      navigate(`/recruiting/jobs/${saved.id}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">{id === 'new' ? 'Create role' : 'Edit role'}</h1>
          <p className="page-sub">Build a full public job post and control how the careers site accepts applications.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => navigate('/recruiting/jobs')}>Back</button>
          <button className="btn btn-outline" disabled={saving} onClick={() => submit('draft')}>{saving ? 'Saving...' : 'Save draft'}</button>
          <button className="btn btn-primary" disabled={saving} onClick={() => submit('published')}>Publish role</button>
        </div>
      </div>

      <div className="card card-pad">
        <JobPostForm value={job} onChange={setJob} />
      </div>
    </div>
  )
}
