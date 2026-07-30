export default function MobileTasks({ goBack, user }) {
  return (
    <div className="mobile-screen">
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>← Back</button>
        <h1>My Tasks</h1>
        <div style={{ width: 60 }} />
      </div>
      <div style={{ padding: '20px' }}>
        <p>Tasks screen - coming soon</p>
      </div>
    </div>
  )
}
