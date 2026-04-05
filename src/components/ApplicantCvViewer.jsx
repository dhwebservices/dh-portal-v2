export default function ApplicantCvViewer({ url }) {
  if (!url) {
    return <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No CV uploaded yet.</div>
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ height: 520, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <iframe title="Applicant CV" src={url} style={{ width: '100%', height: '100%', border: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <a className="btn btn-outline btn-sm" href={url} target="_blank" rel="noreferrer">Open full screen</a>
        <a className="btn btn-primary btn-sm" href={url} target="_blank" rel="noreferrer">Download CV</a>
      </div>
    </div>
  )
}
