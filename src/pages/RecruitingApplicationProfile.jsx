import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ApplicantCvViewer from '../components/ApplicantCvViewer'
import ApplicantTimeline from '../components/ApplicantTimeline'
import RecruitingStatusBadge from '../components/RecruitingStatusBadge'
import { addApplicationNote, getApplication, listApplicationHistory, listApplicationNotes, updateApplicationStatus } from '../utils/recruiting'
import { sendRecruitingStatusEmail } from '../utils/recruitingEmails'
import { useAuth } from '../contexts/AuthContext'

export default function RecruitingApplicationProfile() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { user } = useAuth()
  const [application, setApplication] = useState(null)
  const [history, setHistory] = useState([])
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusBusy, setStatusBusy] = useState('')
  const [emailNote, setEmailNote] = useState('')
  const [noteDraft, setNoteDraft] = useState('')

  useEffect(() => {
    Promise.all([getApplication(id), listApplicationHistory(id), listApplicationNotes(id)])
      .then(([applicationRow, historyRows, noteRows]) => {
        setApplication(applicationRow)
        setHistory(historyRows)
        setNotes(noteRows)
      })
      .finally(() => setLoading(false))
  }, [id])

  const changeStatus = async (nextStatus) => {
    if (!application) return
    setStatusBusy(nextStatus)
    try {
      const updated = await updateApplicationStatus(application, nextStatus, user, { reason: emailNote })
      await sendRecruitingStatusEmail(nextStatus, updated, emailNote).catch(() => {})
      const [historyRows, noteRows] = await Promise.all([listApplicationHistory(id), listApplicationNotes(id)])
      setApplication(updated)
      setHistory(historyRows)
      setNotes(noteRows)
      setEmailNote('')
    } finally {
      setStatusBusy('')
    }
  }

  const saveNote = async () => {
    if (!noteDraft.trim()) return
    const saved = await addApplicationNote(id, noteDraft, user)
    setNotes((current) => [saved, ...current])
    setNoteDraft('')
  }

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>
  if (!application) return <div className="empty"><p>Application not found.</p></div>

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">{application.full_name || application.email}</h1>
          <p className="page-sub">{application.job_posts?.title || 'General application'} · {application.application_ref || 'No reference'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <RecruitingStatusBadge status={application.status} />
          <button className="btn btn-outline" onClick={() => navigate('/recruiting/applications')}>Back</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(340px, 0.9fr)', gap: 18 }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <div className="card card-pad">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Applicant profile</div>
            <div className="fg">
              <div><label className="lbl">Email</label><div className="inp" style={{ display: 'flex', alignItems: 'center' }}>{application.email || '—'}</div></div>
              <div><label className="lbl">Phone</label><div className="inp" style={{ display: 'flex', alignItems: 'center' }}>{application.phone || '—'}</div></div>
              <div><label className="lbl">Location</label><div className="inp" style={{ display: 'flex', alignItems: 'center' }}>{application.location || '—'}</div></div>
              <div><label className="lbl">Current role</label><div className="inp" style={{ display: 'flex', alignItems: 'center' }}>{application.current_job_title || '—'}</div></div>
              <div><label className="lbl">Years experience</label><div className="inp" style={{ display: 'flex', alignItems: 'center' }}>{application.years_experience || '—'}</div></div>
              <div><label className="lbl">Commission acknowledgement</label><div className="inp" style={{ display: 'flex', alignItems: 'center' }}>{application.commission_acknowledged ? 'Confirmed' : 'Missing'}</div></div>
            </div>
            <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
              <div>
                <label className="lbl">Relevant experience</label>
                <div className="inp" style={{ whiteSpace: 'pre-wrap', minHeight: 120, alignItems: 'flex-start', paddingTop: 12 }}>{application.experience_summary || 'No experience summary provided.'}</div>
              </div>
              <div>
                <label className="lbl">Cover note</label>
                <div className="inp" style={{ whiteSpace: 'pre-wrap', minHeight: 120, alignItems: 'flex-start', paddingTop: 12 }}>{application.cover_note || 'No cover note provided.'}</div>
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Screening answers</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {Object.entries(application.screening_answers || {}).length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No screening answers saved.</div> : null}
              {Object.entries(application.screening_answers || {}).map(([key, value]) => (
                <div key={key} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg2)' }}>
                  <div style={{ fontSize: 12, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{key}</div>
                  <div style={{ fontSize: 13.5, color: 'var(--text)', marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{String(value || '—')}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Internal notes</div>
            <textarea className="inp" rows={4} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} style={{ resize: 'vertical' }} placeholder="Add a hiring note, phone screen summary, or decision context..." />
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={saveNote}>Save note</button>
            </div>
            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              {notes.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No notes yet.</div> : null}
              {notes.map((note) => (
                <div key={note.id} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{note.note}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 8 }}>{note.created_by_name || note.created_by_email || 'Unknown'} · {note.created_at ? new Date(note.created_at).toLocaleString('en-GB') : '—'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <div className="card card-pad">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>CV</div>
            <ApplicantCvViewer url={application.cv_file_url} />
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Status actions</div>
            <textarea className="inp" rows={3} value={emailNote} onChange={(e) => setEmailNote(e.target.value)} style={{ resize: 'vertical', marginBottom: 12 }} placeholder="Optional note to include in the applicant email..." />
            <div style={{ display: 'grid', gap: 8 }}>
              {['reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected'].map((status) => (
                <button key={status} className={status === 'rejected' ? 'btn btn-danger' : 'btn btn-outline'} disabled={statusBusy === status} onClick={() => changeStatus(status)}>
                  {statusBusy === status ? 'Updating...' : `Mark ${status}`}
                </button>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Timeline</div>
            <ApplicantTimeline history={history} />
          </div>
        </div>
      </div>
    </div>
  )
}
