export default function ApplicationFilters({ jobs = [], filters, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
      <div>
        <label className="lbl">Search</label>
        <input className="inp" value={filters.query || ''} onChange={(e) => onChange({ ...filters, query: e.target.value })} placeholder="Name, email, or ref" />
      </div>
      <div>
        <label className="lbl">Status</label>
        <select className="inp" value={filters.status || 'all'} onChange={(e) => onChange({ ...filters, status: e.target.value })}>
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="reviewing">Reviewing</option>
          <option value="shortlisted">Shortlisted</option>
          <option value="interview">Interview</option>
          <option value="offered">Offered</option>
          <option value="hired">Hired</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>
      <div>
        <label className="lbl">Role</label>
        <select className="inp" value={filters.jobId || 'all'} onChange={(e) => onChange({ ...filters, jobId: e.target.value })}>
          <option value="all">All roles</option>
          {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
        </select>
      </div>
    </div>
  )
}
