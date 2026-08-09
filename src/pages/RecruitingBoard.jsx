import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import SubNav from '../components/SubNav'
import RecruitingStatusBadge from '../components/RecruitingStatusBadge'
import { Button } from '../components/ds'
import { buildRecruitingBoard } from '../utils/recruitingPipeline'
import { listApplications } from '../utils/recruiting'

export default function RecruitingBoard() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listApplications()
      .then((rows) => setColumns(buildRecruitingBoard(rows)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Recruiting board</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Pipeline view across every stage from new applicant to hire.</p>
        </div>
      </div>

      <SubNav items={[
        { label: 'Dashboard', onClick: () => navigate('/recruiting/dashboard') },
        can('recruiting_jobs') && { label: 'Jobs', onClick: () => navigate('/recruiting') },
        can('recruiting_applications') && { label: 'Applications', onClick: () => navigate('/recruiting/applications') },
        { label: 'Board', active: true, onClick: () => {} },
        can('recruiting_settings') && { label: 'Settings', onClick: () => navigate('/recruiting/settings') },
      ]} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(220px, 1fr))', gap: 14, alignItems: 'start', overflowX: 'auto', paddingBottom: 8 }}>
        {columns.map((column) => (
          <div key={column.status} style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding: 14, minHeight: 260 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <RecruitingStatusBadge status={column.status} />
              <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{column.items.length}</div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {column.items.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No applicants</div> : null}
              {column.items.map((application) => (
                <Button key={application.id} variant="secondary" style={{ display: 'block', height:'auto', textAlign: 'left', whiteSpace: 'normal' }} onClick={() => navigate(`/recruiting/applications/${application.id}`)}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{application.full_name || application.email}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>{application.job_posts?.title || 'General application'}</div>
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
