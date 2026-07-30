export default function MobileTeam({ goBack, user, navigate }) {
  return (
    <div className="mobile-screen">
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>← Back</button>
        <h1>Team</h1>
        <div style={{ width: 60 }} />
      </div>
      <div style={{ padding: '20px' }}>
        <p>Team screen - coming soon</p>
      </div>
    </div>
  )
}
