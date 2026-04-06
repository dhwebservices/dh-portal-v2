import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ApplicantCvViewer from '../components/ApplicantCvViewer'
import ApplicantTimeline from '../components/ApplicantTimeline'
import RecruitingStatusBadge from '../components/RecruitingStatusBadge'
import { addApplicationNote, getApplication, listApplicationHistory, listApplicationNotes, listHiringUsers, saveApplicationProfileMeta, updateApplicationStatus } from '../utils/recruiting'
import { sendEmail } from '../utils/email'
import { sendInterviewScheduleEmail, sendRecruitingStatusEmail } from '../utils/recruitingEmails'
import { useAuth } from '../contexts/AuthContext'
import { sendManagedNotification } from '../utils/notificationPreferences'

function toDateTimeInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16)
}

const SCORECARD_FIELDS = [
  ['communication', 'Communication'],
  ['experience', 'Relevant experience'],
  ['culture', 'Culture fit'],
  ['sales', 'Commercial fit'],
]

function renderStars(value) {
  const safe = Math.max(0, Math.min(5, Number(value || 0)))
  return '★'.repeat(safe) + '☆'.repeat(5 - safe)
}

export default function RecruitingApplicationProfile() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { user } = useAuth()
  const [application, setApplication] = useState(null)
  const [history, setHistory] = useState([])
  const [notes, setNotes] = useState([])
  const [hiringUsers, setHiringUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusBusy, setStatusBusy] = useState('')
  const [emailNote, setEmailNote] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [assignmentEmail, setAssignmentEmail] = useState('')
  const [assignmentBusy, setAssignmentBusy] = useState(false)
  const [assignmentFeedback, setAssignmentFeedback] = useState('')
  const [interviewAt, setInterviewAt] = useState('')
  const [interviewMode, setInterviewMode] = useState('video')
  const [interviewLocation, setInterviewLocation] = useState('')
  const [interviewNotesDraft, setInterviewNotesDraft] = useState('')
  const [sendInterviewInvite, setSendInterviewInvite] = useState(true)
  const [interviewBusy, setInterviewBusy] = useState(false)
  const [interviewFeedback, setInterviewFeedback] = useState('')
  const [overallRating, setOverallRating] = useState(0)
  const [scorecardRatings, setScorecardRatings] = useState({})
  const [strengthsDraft, setStrengthsDraft] = useState('')
  const [risksDraft, setRisksDraft] = useState('')
  const [recommendation, setRecommendation] = useState('hold')
  const [tagInput, setTagInput] = useState('')
  const [scoreTags, setScoreTags] = useState([])
  const [scorecardBusy, setScorecardBusy] = useState(false)
  const [scorecardFeedback, setScorecardFeedback] = useState('')
  const [manualEmailSubject, setManualEmailSubject] = useState('')
  const [manualEmailBody, setManualEmailBody] = useState('')
  const [manualEmailBusy, setManualEmailBusy] = useState(false)
  const [manualEmailFeedback, setManualEmailFeedback] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    Promise.all([getApplication(id), listApplicationHistory(id), listApplicationNotes(id), listHiringUsers()])
      .then(([applicationRow, historyRows, noteRows, hiringUserRows]) => {
        setApplication(applicationRow)
        setHistory(historyRows)
        setNotes(noteRows)
        setHiringUsers(hiringUserRows)
      })
      .catch((error) => setLoadError(error?.message || 'Could not load the application profile.'))
      .finally(() => setLoading(false))
  }, [id])

  const assignmentOptions = useMemo(() => {
    const currentUserOption = user?.email
      ? [{
          email: String(user.email).trim().toLowerCase(),
          name: user.name || user.email,
        }]
      : []

    return [...hiringUsers, ...currentUserOption]
      .filter((item) => item?.email)
      .reduce((acc, item) => {
        const email = String(item.email).trim().toLowerCase()
        if (acc.some((existing) => existing.email === email)) return acc
        acc.push({
          email,
          name: item.name || email,
        })
        return acc
      }, [])
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))
  }, [hiringUsers, user?.email, user?.name])

  useEffect(() => {
    if (!application) return
    const firstName = (application.first_name || application.full_name || application.email || 'there').split(' ')[0]
    setManualEmailSubject(`Regarding your application for ${application.job_posts?.title || 'DH Website Services'}`)
    setManualEmailBody(`Hi ${firstName},

Thank you for your application for ${application.job_posts?.title || 'the role'}.

We wanted to get in touch regarding your application.

Kind regards,
DH Website Services HR`)
    setManualEmailFeedback('')
    setAssignmentEmail(application.assigned_recruiter_email || '')
    setInterviewAt(toDateTimeInputValue(application.interview_at))
    setInterviewMode(application.interview_mode || 'video')
    setInterviewLocation(application.interview_location || '')
    setInterviewNotesDraft(application.interview_notes || '')
    setAssignmentFeedback('')
    setInterviewFeedback('')
    setOverallRating(application.overall_rating || 0)
    setScorecardRatings(application.scorecard_ratings || {})
    setStrengthsDraft(application.strengths || '')
    setRisksDraft(application.risks || '')
    setRecommendation(application.recommendation || 'hold')
    setScoreTags(application.tags || [])
    setTagInput('')
    setScorecardFeedback('')
  }, [application?.id, application?.assigned_recruiter_email, application?.interview_at, application?.interview_mode, application?.interview_location, application?.interview_notes])

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

  const saveAssignment = async () => {
    if (!application) return
    setAssignmentBusy(true)
    setAssignmentFeedback('')
    try {
      const previousAssignmentEmail = String(application.assigned_recruiter_email || '').trim().toLowerCase()
      const assignedUser = assignmentOptions.find((item) => item.email === assignmentEmail)
      const meta = await saveApplicationProfileMeta(application.id, {
        assigned_recruiter_email: assignmentEmail,
        assigned_recruiter_name: assignedUser?.name || '',
      })
      setApplication((current) => current ? { ...current, ...meta } : current)
      const note = await addApplicationNote(
        id,
        assignmentEmail ? `Recruiter assigned: ${assignedUser?.name || assignmentEmail}` : 'Recruiter assignment cleared',
        user
      )
      if (assignmentEmail && assignmentEmail !== previousAssignmentEmail) {
        await sendManagedNotification({
          userEmail: assignmentEmail,
          userName: assignedUser?.name || assignmentEmail,
          category: 'urgent',
          type: 'info',
          title: 'New job application assigned to you',
          message: `${application.full_name || application.email || 'An applicant'} has been assigned to you for ${application.job_posts?.title || 'a live role'}. Please review and respond in the recruiting workspace.`,
          link: `/recruiting/applications/${application.id}`,
          emailSubject: `New recruiting assignment — ${application.job_posts?.title || 'Job application'}`,
          sentBy: user?.name || user?.email || 'DH Website Services HR',
          fromEmail: 'DH Website Services HR <HR@dhwebsiteservices.co.uk>',
          forceImportant: true,
        }).catch(() => {})
      }
      setNotes((current) => [note, ...current])
      setAssignmentFeedback('Assignment saved.')
    } catch (error) {
      setAssignmentFeedback(error.message || 'Could not save assignment.')
    } finally {
      setAssignmentBusy(false)
    }
  }

  const scheduleInterview = async () => {
    if (!application || !interviewAt) {
      setInterviewFeedback('Please choose an interview date and time.')
      return
    }

    setInterviewBusy(true)
    setInterviewFeedback('')
    try {
      const assignedUser = assignmentOptions.find((item) => item.email === assignmentEmail)
      const meta = await saveApplicationProfileMeta(application.id, {
        assigned_recruiter_email: assignmentEmail,
        assigned_recruiter_name: assignedUser?.name || '',
        interview_at: new Date(interviewAt).toISOString(),
        interview_mode: interviewMode,
        interview_location: interviewLocation,
        interview_notes: interviewNotesDraft,
        interview_contact_email: assignedUser?.email || '',
        interview_contact_name: assignedUser?.name || '',
        interview_last_emailed_at: sendInterviewInvite ? new Date().toISOString() : application.interview_last_emailed_at,
      })

      let updatedApplication = { ...application, ...meta }
      if (updatedApplication.status !== 'interview') {
        updatedApplication = await updateApplicationStatus(updatedApplication, 'interview', user, { reason: 'Interview scheduled' })
      }

      if (sendInterviewInvite) {
        const emailResult = await sendInterviewScheduleEmail(updatedApplication)
        if (!emailResult?.ok) throw new Error(emailResult?.error || 'Interview invite email failed')
      }

      const note = await addApplicationNote(
        id,
        `Interview scheduled for ${new Date(meta.interview_at).toLocaleString('en-GB')}${meta.interview_mode ? ` · ${meta.interview_mode}` : ''}${meta.assigned_recruiter_name ? ` · Owner: ${meta.assigned_recruiter_name}` : ''}${sendInterviewInvite ? ' · Invite emailed' : ''}`,
        user
      )
      const [historyRows, noteRows] = await Promise.all([listApplicationHistory(id), listApplicationNotes(id)])
      setApplication(updatedApplication)
      setHistory(historyRows)
      setNotes([note, ...noteRows.filter((row) => row.id !== note.id)])
      setInterviewFeedback(sendInterviewInvite ? 'Interview saved and invite sent.' : 'Interview saved.')
    } catch (error) {
      setInterviewFeedback(error.message || 'Could not schedule interview.')
    } finally {
      setInterviewBusy(false)
    }
  }

  const saveScorecard = async () => {
    if (!application) return
    setScorecardBusy(true)
    setScorecardFeedback('')
    try {
      const meta = await saveApplicationProfileMeta(application.id, {
        overall_rating: overallRating,
        scorecard_ratings: scorecardRatings,
        strengths: strengthsDraft,
        risks: risksDraft,
        recommendation,
        tags: scoreTags,
      })
      setApplication((current) => current ? { ...current, ...meta } : current)
      const note = await addApplicationNote(
        id,
        `Scorecard updated · ${overallRating}/5 overall · ${recommendation}${scoreTags.length ? ` · Tags: ${scoreTags.join(', ')}` : ''}`,
        user
      )
      setNotes((current) => [note, ...current])
      setScorecardFeedback('Scorecard saved.')
    } catch (error) {
      setScorecardFeedback(error.message || 'Could not save scorecard.')
    } finally {
      setScorecardBusy(false)
    }
  }

  const addTag = () => {
    const clean = tagInput.trim()
    if (!clean) return
    setScoreTags((current) => current.includes(clean) ? current : [...current, clean])
    setTagInput('')
  }

  const removeTag = (tag) => {
    setScoreTags((current) => current.filter((item) => item !== tag))
  }

  const sendManualEmail = async () => {
    if (!application?.email || !manualEmailSubject.trim() || !manualEmailBody.trim()) {
      setManualEmailFeedback('Please complete the subject and message before sending.')
      return
    }

    setManualEmailBusy(true)
    setManualEmailFeedback('')
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:620px;padding:32px;background:#ffffff;color:#1D1D1F">
        ${manualEmailBody
          .trim()
          .split('\n')
          .map((line) => `<p style="font-size:14px;line-height:1.7;margin:0 0 14px;color:#424245">${line || '&nbsp;'}</p>`)
          .join('')}
      </div>
    `

    try {
      const result = await sendEmail('custom_email', {
        to: application.email,
        subject: manualEmailSubject.trim(),
        html,
        from: 'DH Website Services HR <HR@dhwebsiteservices.co.uk>',
      })

      if (!result?.ok) {
        throw new Error(result?.error || 'Unable to send email')
      }

      const sentNote = await addApplicationNote(
        id,
        `Manual applicant email sent\nSubject: ${manualEmailSubject.trim()}\nTo: ${application.email}`,
        user
      )
      setNotes((current) => [sentNote, ...current])
      setManualEmailFeedback('Email sent successfully.')
    } catch (error) {
      setManualEmailFeedback(error.message || 'Failed to send email.')
    } finally {
      setManualEmailBusy(false)
    }
  }

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>
  if (loadError) return <div className="card card-pad" style={{ maxWidth: 720, color: 'var(--red)' }}>{loadError}</div>
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
              <div><label className="lbl">Assigned recruiter</label><div className="inp" style={{ display: 'flex', alignItems: 'center' }}>{application.assigned_recruiter_name || application.assigned_recruiter_email || 'Unassigned'}</div></div>
              <div><label className="lbl">Interview</label><div className="inp" style={{ display: 'flex', alignItems: 'center' }}>{application.interview_at ? new Date(application.interview_at).toLocaleString('en-GB') : 'Not scheduled'}</div></div>
              <div><label className="lbl">Overall rating</label><div className="inp" style={{ display: 'flex', alignItems: 'center' }}>{application.overall_rating ? `${renderStars(application.overall_rating)} (${application.overall_rating}/5)` : 'Not scored'}</div></div>
              <div><label className="lbl">Recommendation</label><div className="inp" style={{ display: 'flex', alignItems: 'center' }}>{application.recommendation || 'Not set'}</div></div>
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

          <div className="card card-pad">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Scorecard</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label className="lbl">Overall rating</label>
                <select className="inp" value={overallRating} onChange={(e) => setOverallRating(Number(e.target.value))}>
                  {[0, 1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>{value === 0 ? 'Not scored' : `${value}/5`}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                {SCORECARD_FIELDS.map(([key, label]) => (
                  <div key={key}>
                    <label className="lbl">{label}</label>
                    <select className="inp" value={scorecardRatings[key] || 0} onChange={(e) => setScorecardRatings((current) => ({ ...current, [key]: Number(e.target.value) }))}>
                      {[0, 1, 2, 3, 4, 5].map((value) => (
                        <option key={value} value={value}>{value === 0 ? 'Not scored' : `${value}/5`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div>
                <label className="lbl">Recommendation</label>
                <select className="inp" value={recommendation} onChange={(e) => setRecommendation(e.target.value)}>
                  <option value="strong_yes">Strong yes</option>
                  <option value="yes">Yes</option>
                  <option value="hold">Hold</option>
                  <option value="concern">Concern</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="lbl">Strengths</label>
                <textarea className="inp" rows={4} value={strengthsDraft} onChange={(e) => setStrengthsDraft(e.target.value)} style={{ resize: 'vertical' }} placeholder="What stands out positively about this candidate?" />
              </div>
              <div>
                <label className="lbl">Risks / concerns</label>
                <textarea className="inp" rows={4} value={risksDraft} onChange={(e) => setRisksDraft(e.target.value)} style={{ resize: 'vertical' }} placeholder="What needs caution, checking, or follow-up?" />
              </div>
              <div>
                <label className="lbl">Tags</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="inp" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Add tag and save it" onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag()
                    }
                  }} />
                  <button className="btn btn-outline" onClick={addTag}>Add</button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {scoreTags.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No tags yet.</div> : null}
                  {scoreTags.map((tag) => (
                    <button key={tag} className="btn btn-outline btn-sm" onClick={() => removeTag(tag)}>{tag} ×</button>
                  ))}
                </div>
              </div>
              {scorecardFeedback ? (
                <div style={{ fontSize: 12.5, color: scorecardFeedback.includes('saved') ? '#1E8E5A' : '#C23B22' }}>{scorecardFeedback}</div>
              ) : null}
              <button className="btn btn-primary" disabled={scorecardBusy} onClick={saveScorecard}>
                {scorecardBusy ? 'Saving...' : 'Save scorecard'}
              </button>
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
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Assignment</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label className="lbl">Recruiter owner</label>
                <select className="inp" value={assignmentEmail} onChange={(e) => setAssignmentEmail(e.target.value)}>
                  <option value="">Unassigned</option>
                  {assignmentOptions.map((item) => (
                    <option key={item.email} value={item.email}>{item.name} ({item.email})</option>
                  ))}
                </select>
              </div>
              {assignmentFeedback ? (
                <div style={{ fontSize: 12.5, color: assignmentFeedback.includes('saved') ? '#1E8E5A' : '#C23B22' }}>{assignmentFeedback}</div>
              ) : null}
              <button className="btn btn-outline" disabled={assignmentBusy} onClick={saveAssignment}>
                {assignmentBusy ? 'Saving...' : 'Save assignment'}
              </button>
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Interview schedule</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label className="lbl">Date and time</label>
                <input className="inp" type="datetime-local" value={interviewAt} onChange={(e) => setInterviewAt(e.target.value)} />
              </div>
              <div>
                <label className="lbl">Format</label>
                <select className="inp" value={interviewMode} onChange={(e) => setInterviewMode(e.target.value)}>
                  <option value="video">Video call</option>
                  <option value="phone">Phone call</option>
                  <option value="in_person">In person</option>
                </select>
              </div>
              <div>
                <label className="lbl">Meeting link / location</label>
                <input className="inp" value={interviewLocation} onChange={(e) => setInterviewLocation(e.target.value)} placeholder="Teams link, phone number, or office address" />
              </div>
              <div>
                <label className="lbl">Candidate note</label>
                <textarea className="inp" rows={4} value={interviewNotesDraft} onChange={(e) => setInterviewNotesDraft(e.target.value)} style={{ resize: 'vertical' }} placeholder="Add prep notes, arrival instructions, or who they will meet..." />
              </div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--sub)' }}>
                <input type="checkbox" checked={sendInterviewInvite} onChange={(e) => setSendInterviewInvite(e.target.checked)} style={{ marginTop: 2 }} />
                <span>Email the interview details to the applicant from HR when saving.</span>
              </label>
              {interviewFeedback ? (
                <div style={{ fontSize: 12.5, color: interviewFeedback.includes('saved') || interviewFeedback.includes('sent') ? '#1E8E5A' : '#C23B22' }}>{interviewFeedback}</div>
              ) : null}
              <button className="btn btn-primary" disabled={interviewBusy} onClick={scheduleInterview}>
                {interviewBusy ? 'Saving...' : 'Schedule interview'}
              </button>
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Email applicant</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label className="lbl">To</label>
                <div className="inp" style={{ display: 'flex', alignItems: 'center' }}>{application.email || '—'}</div>
              </div>
              <div>
                <label className="lbl">From</label>
                <div className="inp" style={{ display: 'flex', alignItems: 'center' }}>HR@dhwebsiteservices.co.uk</div>
              </div>
              <div>
                <label className="lbl">Subject</label>
                <input className="inp" value={manualEmailSubject} onChange={(e) => setManualEmailSubject(e.target.value)} placeholder="Email subject" />
              </div>
              <div>
                <label className="lbl">Message</label>
                <textarea className="inp" rows={8} value={manualEmailBody} onChange={(e) => setManualEmailBody(e.target.value)} style={{ resize: 'vertical' }} placeholder="Write your email to the applicant..." />
              </div>
              {manualEmailFeedback ? (
                <div style={{ fontSize: 12.5, color: manualEmailFeedback.includes('successfully') ? '#1E8E5A' : '#C23B22' }}>
                  {manualEmailFeedback}
                </div>
              ) : null}
              <button className="btn btn-primary" disabled={manualEmailBusy} onClick={sendManualEmail}>
                {manualEmailBusy ? 'Sending...' : 'Send email'}
              </button>
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
