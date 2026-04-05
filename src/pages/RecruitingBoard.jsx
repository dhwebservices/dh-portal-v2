import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RecruitingStatusBadge from '../components/RecruitingStatusBadge'
import { buildRecruitingBoard } from '../utils/recruitingPipeline'
import { listApplications } from '../utils/recruiting'

export default function RecruitingBoard() {
  const navigate = useNavigate()
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listApplications()
      .then((rows) => setColumns(buildRecruitingBoard(rows)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Recruiting board</h1>
          <p className="page-sub">Pipeline view across every stage from new applicant to hire.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(220px, 1fr))', gap: 14, alignItems: 'start', overflowX: 'auto', paddingBottom: 8 }}>
        {columns.map((column) => (
          <div key={column.status} className="card" style={{ padding: 14, minHeight: 260 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <RecruitingStatusBadge status={column.status} />
              <div style={{ fontSize: 11.5, color: 'var(--faint)' }}>{column.items.length}</div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {column.items.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No applicants</div> : null}
              {column.items.map((application) => (
                <button key={application.id} className="btn btn-outline" style={{ display: 'block', textAlign: 'left', whiteSpace: 'normal' }} onClick={() => navigate(`/recruiting/applications/${application.id}`)}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{application.full_name || application.email}</div>
                  <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 6 }}>{application.job_posts?.title || 'General application'}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
