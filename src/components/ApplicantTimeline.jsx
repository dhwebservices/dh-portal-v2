import RecruitingStatusBadge from './RecruitingStatusBadge'

function formatDate(value) {
  if (!value) return 'Unknown time'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ApplicantTimeline({ history = [] }) {
  if (!history.length) {
    return <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No status history yet.</div>
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {history.map((item) => (
        <div key={item.id} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RecruitingStatusBadge status={item.to_status} />
              <div style={{ fontSize: 12.5, color: 'var(--sub)' }}>
                {item.from_status ? `from ${item.from_status}` : 'Initial status'}
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>{formatDate(item.created_at)}</div>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 8 }}>
            {item.changed_by_name || item.changed_by_email || 'Unknown user'}
          </div>
          {item.reason ? <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 6, lineHeight: 1.55 }}>{item.reason}</div> : null}
        </div>
      ))}
    </div>
  )
}
