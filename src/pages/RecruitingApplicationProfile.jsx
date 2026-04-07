import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, Mail, NotebookPen, ShieldCheck, Star, UserRound } from 'lucide-react'
import ApplicantCvViewer from '../components/ApplicantCvViewer'
import ApplicantTimeline from '../components/ApplicantTimeline'
import RecruitingStatusBadge from '../components/RecruitingStatusBadge'
import { addApplicationNote, createCandidatePortalInvite, getApplication, listApplicationHistory, listApplicationNotes, listHiringUsers, listInterviewSlots, replaceInterviewSlots, saveApplicationProfileMeta, updateApplicationStatus } from '../utils/recruiting'
import { sendEmail } from '../utils/email'
import { sendCandidateInterviewBookingEmail, sendCandidatePortalInviteEmail, sendInterviewScheduleEmail, sendRecruitingStatusEmail } from '../utils/recruitingEmails'
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

function buildAssignmentEmailHtml({ application, assignedUser, actor }) {
  return `
    <div style="margin:0;padding:28px 16px;background:#F4F7FB;font-family:Arial,sans-serif;color:#182033">
      <div style="max-width:640px;margin:0 auto;background:#FFFFFF;border:1px solid #DEE6F3;border-radius:24px;overflow:hidden;box-shadow:0 12px 34px rgba(19,35,79,0.08)">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#2F6FED 0%,#101827 100%);color:#FFFFFF">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;opacity:0.72">Recruiting assignment</div>
          <div style="font-size:28px;font-weight:700;line-height:1.12;letter-spacing:-0.03em;margin-top:10px">A job application has been assigned to you</div>
          <div style="font-size:14px;line-height:1.75;opacity:0.9;margin-top:12px">Please review this applicant in the recruiting workspace and follow up on the next action.</div>
        </div>
        <div style="padding:28px">
          <div style="padding:18px;border:1px solid #D9E1F2;border-radius:18px;background:#F7F9FC">
            <div style="padding-bottom:14px;border-bottom:1px solid #E7ECF5;margin-bottom:14px">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#7A8499;margin-bottom:6px">Applicant</div>
              <div style="font-size:14px;line-height:1.65;color:#182033">${application.full_name || application.email || 'Applicant'}</div>
            </div>
            <div style="padding-bottom:14px;border-bottom:1px solid #E7ECF5;margin-bottom:14px">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#7A8499;margin-bottom:6px">Role</div>
              <div style="font-size:14px;line-height:1.65;color:#182033">${application.job_posts?.title || 'Open role'}</div>
            </div>
            <div style="padding-bottom:14px;border-bottom:1px solid #E7ECF5;margin-bottom:14px">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#7A8499;margin-bottom:6px">Application reference</div>
              <div style="font-size:14px;line-height:1.65;color:#182033">${application.application_ref || '—'}</div>
            </div>
            <div>
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#7A8499;margin-bottom:6px">Assigned by</div>
              <div style="font-size:14px;line-height:1.65;color:#182033">${actor?.name || actor?.email || 'DH Website Services HR'}</div>
            </div>
          </div>
          <div style="margin-top:20px">
            <a href="https://staff.dhwebsiteservices.co.uk/recruiting/applications/${application.id}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#2F6FED;color:#FFFFFF;text-decoration:none;font-weight:700">Open application</a>
          </div>
          <div style="margin-top:24px;font-size:14px;line-height:1.75;color:#44506A">
            Regards,<br/><strong style="color:#182033">DH Website Services HR</strong>
          </div>
        </div>
      </div>
    </div>
  `
}

function MetaCard({ label, value }) {
  return (
    <div style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
      <div style={{ fontSize:11, color:'var(--faint)', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', lineHeight:1.45 }}>{value}</div>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'130px minmax(0,1fr)', gap:12, alignItems:'start', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
      <div style={{ fontSize:11.5, color:'var(--faint)' }}>{label}</div>
      <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6 }}>{value || '—'}</div>
    </div>
  )
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
  const [bookingSlots, setBookingSlots] = useState([])
  const [bookingSlotDate, setBookingSlotDate] = useState('')
  const [bookingSlotTime, setBookingSlotTime] = useState('')
  const [bookingSlotDuration, setBookingSlotDuration] = useState(45)
  const [bookingInviteFeedback, setBookingInviteFeedback] = useState('')
  const [bookingInviteBusy, setBookingInviteBusy] = useState(false)
  const [portalInviteBusy, setPortalInviteBusy] = useState(false)
  const [portalInviteFeedback, setPortalInviteFeedback] = useState('')
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
  const [activeTab, setActiveTab] = useState('overview')

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

  useEffect(() => {
    listInterviewSlots(id).then(setBookingSlots).catch(() => {})
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
        await Promise.allSettled([
          sendManagedNotification({
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
          }),
          sendEmail('custom_email', {
            to: assignmentEmail,
            subject: `Application assigned to you — ${application.job_posts?.title || 'Job application'}`,
            html: buildAssignmentEmailHtml({ application, assignedUser, actor: user }),
            from: 'DH Website Services HR <HR@dhwebsiteservices.co.uk>',
            reply_to: user?.email || undefined,
          }),
        ])
      }
      setNotes((current) => [note, ...current])
      setAssignmentFeedback('Assignment saved.')
    } catch (error) {
      setAssignmentFeedback(error.message || 'Could not save assignment.')
    } finally {
      setAssignmentBusy(false)
    }
  }

  const snapshotProfile = application.candidate_profile_snapshot?.profile || {}
  const snapshotSkills = Array.isArray(application.candidate_profile_snapshot?.skills) ? application.candidate_profile_snapshot.skills : []
  const snapshotExperience = Array.isArray(application.candidate_profile_snapshot?.experience) ? application.candidate_profile_snapshot.experience : []

  const sendCandidatePortalInvite = async () => {
    if (!application) return
    setPortalInviteBusy(true)
    setPortalInviteFeedback('')
    try {
      const invite = await createCandidatePortalInvite(application, user)
      const emailResult = await sendCandidatePortalInviteEmail(application, invite.inviteUrl)
      if (!emailResult?.ok) throw new Error(emailResult?.error || 'Portal invite email failed')

      await addApplicationNote(
        application.id,
        `Candidate portal invite sent${user?.email ? ` by ${user.email}` : ''}.`,
        user,
      )

      const [applicationRow, noteRows] = await Promise.all([
        getApplication(id),
        listApplicationNotes(id),
      ])

      setApplication(applicationRow)
      setNotes(noteRows)
      setPortalInviteFeedback('Candidate portal invite sent.')
    } catch (error) {
      setPortalInviteFeedback(error.message || 'Could not send the candidate portal invite.')
    } finally {
      setPortalInviteBusy(false)
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

  const addBookingSlot = () => {
    if (!bookingSlotDate || !bookingSlotTime) {
      setBookingInviteFeedback('Choose a date and time for the interview slot.')
      return
    }

    const start = new Date(`${bookingSlotDate}T${bookingSlotTime}`)
    if (Number.isNaN(start.getTime())) {
      setBookingInviteFeedback('Could not understand that slot time.')
      return
    }
    const end = new Date(start.getTime() + Number(bookingSlotDuration || 45) * 60 * 1000)

    setBookingSlots((current) => [
      ...current.filter((slot) => slot.status === 'booked'),
      ...current.filter((slot) => slot.status !== 'booked'),
      {
        id: `draft-${Date.now()}`,
        application_id: id,
        hiring_manager_email: assignmentEmail,
        hiring_manager_name: assignmentOptions.find((item) => item.email === assignmentEmail)?.name || '',
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        timezone: 'Europe/London',
        interview_mode: interviewMode,
        location: interviewLocation,
        notes: interviewNotesDraft,
        status: 'open',
      },
    ])
    setBookingInviteFeedback('')
    setBookingSlotTime('')
  }

  const removeBookingSlot = (slotId) => {
    setBookingSlots((current) => current.filter((slot) => slot.id !== slotId))
  }

  const sendInterviewBookingInvite = async () => {
    if (!application) return
    const openSlots = bookingSlots.filter((slot) => slot.status === 'open')
    if (!openSlots.length) {
      setBookingInviteFeedback('Add at least one open interview slot before sending.')
      return
    }

    setBookingInviteBusy(true)
    setBookingInviteFeedback('')
    try {
      const assignedUser = assignmentOptions.find((item) => item.email === assignmentEmail)
      const savedSlots = await replaceInterviewSlots(application.id, openSlots.map((slot) => ({
        ...slot,
        hiring_manager_email: assignmentEmail,
        hiring_manager_name: assignedUser?.name || '',
        interview_mode: interviewMode,
        location: interviewLocation,
        notes: interviewNotesDraft,
      })), user)

      let updatedApplication = application
      if (updatedApplication.status !== 'interview') {
        updatedApplication = await updateApplicationStatus(updatedApplication, 'interview', user, { reason: 'Interview booking opened' })
      }

      await saveApplicationProfileMeta(application.id, {
        assigned_recruiter_email: assignmentEmail,
        assigned_recruiter_name: assignedUser?.name || '',
        interview_mode: interviewMode,
        interview_location: interviewLocation,
        interview_notes: interviewNotesDraft,
        interview_contact_email: assignedUser?.email || '',
        interview_contact_name: assignedUser?.name || '',
      })

      const emailResult = await sendCandidateInterviewBookingEmail(updatedApplication, interviewNotesDraft)
      if (!emailResult?.ok) throw new Error(emailResult?.error || 'Booking invite email failed')

      const note = await addApplicationNote(
        id,
        `Interview booking invite sent with ${savedSlots.length} slot${savedSlots.length === 1 ? '' : 's'}${assignedUser?.name ? ` · Hiring manager: ${assignedUser.name}` : ''}`,
        user
      )

      const [historyRows, noteRows] = await Promise.all([listApplicationHistory(id), listApplicationNotes(id)])
      setApplication(updatedApplication)
      setHistory(historyRows)
      setNotes([note, ...noteRows.filter((row) => row.id !== note.id)])
      setBookingSlots(savedSlots)
      setBookingInviteFeedback('Interview booking email sent and slots published.')
    } catch (error) {
      setBookingInviteFeedback(error.message || 'Could not send the interview booking invite.')
    } finally {
      setBookingInviteBusy(false)
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

  const summaryMeta = [
    ['Role', application.job_posts?.title || 'General application'],
    ['Owner', application.assigned_recruiter_name || application.assigned_recruiter_email || 'Unassigned'],
    ['Interview', application.interview_at ? new Date(application.interview_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : 'Not scheduled'],
    ['Rating', application.overall_rating ? `${application.overall_rating}/5` : 'Not scored'],
  ]

  return (
    <div className="fade-in">
      <div style={{ border:'1px solid var(--border)', borderRadius:22, overflow:'hidden', background:'var(--card)', marginBottom:18 }}>
        <div style={{ padding:'18px 20px 16px', borderBottom:'1px solid var(--border)', background:'linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, var(--page-tint) 8%), var(--card))' }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:18, alignItems:'flex-start', flexWrap:'wrap' }}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12, color:'var(--sub)', marginBottom:8 }}>Recruitment / Candidate</div>
              <h1 style={{ fontSize:'clamp(28px,3vw,36px)', fontWeight:600, letterSpacing:'-0.03em', lineHeight:1, color:'var(--text)' }}>
                {application.full_name || application.email}
              </h1>
              <div style={{ fontSize:13, color:'var(--sub)', marginTop:8, lineHeight:1.6 }}>
                {application.job_posts?.title || 'General application'} · {application.application_ref || 'No reference'}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <RecruitingStatusBadge status={application.status} />
              <button className="btn btn-outline" onClick={() => navigate(application.job_post_id ? `/recruiting/jobs/${application.job_post_id}` : '/recruiting')}>
                Back
              </button>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:10, marginTop:18 }}>
            {summaryMeta.map(([label, value]) => <MetaCard key={label} label={label} value={value} />)}
            <MetaCard label="Source" value={application.source || 'Website'} />
          </div>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 18 }}>
        {[
          ['overview', 'Overview'],
          ['evaluation', 'Evaluation'],
          ['actions', 'Hiring Actions'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={'tab' + (activeTab === key ? ' on' : '')}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)', gap: 18 }}>
        <div style={{ display:'grid', gap:18 }}>
          {activeTab === 'overview' ? (
            <>
              <div className="card card-pad">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <UserRound size={16} color="var(--accent)" />
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>Candidate summary</div>
                </div>
                <div>
                  <DetailRow label="Email" value={application.email} />
                  <DetailRow label="Phone" value={application.phone} />
                  <DetailRow label="Location" value={application.location} />
                  <DetailRow label="Current role" value={application.current_job_title} />
                  <DetailRow label="Years experience" value={application.years_experience} />
                  <DetailRow label="Commission" value={application.commission_acknowledged ? 'Confirmed' : 'Missing'} />
                  <DetailRow label="Recommendation" value={application.recommendation || 'Not set'} />
                </div>
                <div style={{ display:'grid', gap:14, marginTop:16 }}>
                  <div>
                    <label className="lbl">Experience summary</label>
                    <div className="inp" style={{ whiteSpace:'pre-wrap', minHeight:110, alignItems:'flex-start', paddingTop:12 }}>{application.experience_summary || 'No experience summary provided.'}</div>
                  </div>
                  <div>
                    <label className="lbl">Cover note</label>
                    <div className="inp" style={{ whiteSpace:'pre-wrap', minHeight:110, alignItems:'flex-start', paddingTop:12 }}>{application.cover_note || 'No cover note provided.'}</div>
                  </div>
                </div>
              </div>

              <div className="card card-pad">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <ShieldCheck size={16} color="var(--accent)" />
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>Candidate portal</div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
                  <MetaCard label="Portal status" value={application.portal_status || 'unclaimed'} />
                  <MetaCard label="Linked account" value={application.candidate_user_id ? 'Linked' : 'Not linked'} />
                  <MetaCard label="Last invite" value={application.portal_invited_at ? new Date(application.portal_invited_at).toLocaleString('en-GB') : 'Not sent'} />
                  <MetaCard label="Last portal activity" value={application.portal_last_viewed_at ? new Date(application.portal_last_viewed_at).toLocaleString('en-GB') : 'No activity yet'} />
                </div>
                <div style={{ display:'grid', gap:14, marginTop:16 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
                    <DetailRow label="NI number" value={snapshotProfile.ni_number} />
                    <DetailRow label="DOB" value={snapshotProfile.date_of_birth} />
                    <DetailRow label="Right to work" value={snapshotProfile.right_to_work_uk} />
                    <DetailRow label="Address" value={[snapshotProfile.address_line_1, snapshotProfile.address_line_2, snapshotProfile.city, snapshotProfile.postcode, snapshotProfile.country].filter(Boolean).join(', ')} />
                    <DetailRow label="LinkedIn" value={snapshotProfile.linkedin_url} />
                    <DetailRow label="Portfolio" value={snapshotProfile.portfolio_url} />
                  </div>
                  <div>
                    <label className="lbl">Professional summary</label>
                    <div className="inp" style={{ whiteSpace:'pre-wrap', minHeight:90, alignItems:'flex-start', paddingTop:12 }}>
                      {snapshotProfile.summary || 'No candidate profile summary has been synced into this application yet.'}
                    </div>
                  </div>
                  <div>
                    <label className="lbl">Skills</label>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {snapshotSkills.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No skills synced yet.</div> : null}
                      {snapshotSkills.map((skill, index) => (
                        <div key={`${skill.name || 'skill'}-${index}`} style={{ padding:'10px 12px', border:'1px solid var(--border)', borderRadius:999, background:'var(--bg2)', fontSize:12.5, color:'var(--text)' }}>
                          {skill.name || 'Skill'}{skill.proficiency ? ` · ${skill.proficiency}` : ''}{skill.years_experience ? ` · ${skill.years_experience}` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="lbl">Experience history</label>
                    <div style={{ display:'grid', gap:10 }}>
                      {snapshotExperience.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No structured experience synced yet.</div> : null}
                      {snapshotExperience.map((row, index) => (
                        <div key={`${row.company_name || 'exp'}-${index}`} style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{row.job_title || 'Role'}{row.company_name ? ` · ${row.company_name}` : ''}</div>
                          <div style={{ fontSize:12, color:'var(--sub)', marginTop:4 }}>
                            {[row.start_date, row.is_current ? 'Present' : row.end_date].filter(Boolean).join(' to ')}
                          </div>
                          {row.summary ? <div style={{ fontSize:12.5, color:'var(--text)', marginTop:8, lineHeight:1.6 }}>{row.summary}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card card-pad">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <ShieldCheck size={16} color="var(--accent)" />
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>Screening answers</div>
                </div>
                <div style={{ display:'grid', gap:12 }}>
                  {Object.entries(application.screening_answers || {}).length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No screening answers saved.</div> : null}
                  {Object.entries(application.screening_answers || {}).map(([key, value]) => (
                    <div key={key} style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                      <div style={{ fontSize:12, color:'var(--faint)', marginBottom:8 }}>{key}</div>
                      <div style={{ fontSize:13.5, color:'var(--text)', whiteSpace:'pre-wrap', lineHeight:1.6 }}>{String(value || '—')}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card card-pad">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <NotebookPen size={16} color="var(--accent)" />
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>Notes</div>
                </div>
                <textarea className="inp" rows={4} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} style={{ resize:'vertical' }} placeholder="Add a hiring note, phone screen summary, or decision context..." />
                <div style={{ marginTop:10 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveNote}>Save note</button>
                </div>
                <div style={{ display:'grid', gap:10, marginTop:16 }}>
                  {notes.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No notes yet.</div> : null}
                  {notes.map((note) => (
                    <div key={note.id} style={{ padding:'12px 14px', borderRadius:12, background:'var(--bg2)', border:'1px solid var(--border)' }}>
                      <div style={{ fontSize:12.5, color:'var(--text)', whiteSpace:'pre-wrap', lineHeight:1.6 }}>{note.note}</div>
                      <div style={{ fontSize:11.5, color:'var(--faint)', marginTop:8 }}>{note.created_by_name || note.created_by_email || 'Unknown'} · {note.created_at ? new Date(note.created_at).toLocaleString('en-GB') : '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {activeTab === 'evaluation' ? (
            <div className="card card-pad">
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                <Star size={16} color="var(--accent)" />
                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>Scorecard</div>
              </div>
              <div style={{ display:'grid', gap:12 }}>
                <div>
                  <label className="lbl">Overall rating</label>
                  <select className="inp" value={overallRating} onChange={(e) => setOverallRating(Number(e.target.value))}>
                    {[0, 1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>{value === 0 ? 'Not scored' : `${value}/5`}</option>
                    ))}
                  </select>
                  <div style={{ fontSize:12, color:'var(--sub)', marginTop:8 }}>
                    {overallRating ? `${renderStars(overallRating)} (${overallRating}/5)` : 'No overall score yet'}
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:12 }}>
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
                  <textarea className="inp" rows={4} value={strengthsDraft} onChange={(e) => setStrengthsDraft(e.target.value)} style={{ resize:'vertical' }} placeholder="What stands out positively about this candidate?" />
                </div>
                <div>
                  <label className="lbl">Risks / concerns</label>
                  <textarea className="inp" rows={4} value={risksDraft} onChange={(e) => setRisksDraft(e.target.value)} style={{ resize:'vertical' }} placeholder="What needs caution, checking, or follow-up?" />
                </div>
                <div>
                  <label className="lbl">Tags</label>
                  <div style={{ display:'flex', gap:8 }}>
                    <input className="inp" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Add tag and save it" onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag()
                      }
                    }} />
                    <button className="btn btn-outline" onClick={addTag}>Add</button>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:10 }}>
                    {scoreTags.length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No tags yet.</div> : null}
                    {scoreTags.map((tag) => (
                      <button key={tag} className="btn btn-outline btn-sm" onClick={() => removeTag(tag)}>{tag} ×</button>
                    ))}
                  </div>
                </div>
                {scorecardFeedback ? <div style={{ fontSize:12.5, color: scorecardFeedback.includes('saved') ? '#1E8E5A' : '#C23B22' }}>{scorecardFeedback}</div> : null}
                <button className="btn btn-primary" disabled={scorecardBusy} onClick={saveScorecard}>
                  {scorecardBusy ? 'Saving...' : 'Save scorecard'}
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === 'actions' ? (
            <>
              <div className="card card-pad">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                  <ShieldCheck size={16} color="var(--accent)" />
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>Status actions</div>
                </div>
                <textarea className="inp" rows={3} value={emailNote} onChange={(e) => setEmailNote(e.target.value)} style={{ resize:'vertical', marginBottom:12 }} placeholder="Optional note to include in the applicant email..." />
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:8 }}>
                  {['reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected'].map((status) => (
                    <button key={status} className={status === 'rejected' ? 'btn btn-danger' : 'btn btn-outline'} disabled={statusBusy === status} onClick={() => changeStatus(status)}>
                      {statusBusy === status ? 'Updating...' : `Mark ${status}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card card-pad">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                  <UserRound size={16} color="var(--accent)" />
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>Candidate portal access</div>
                </div>
                <div style={{ display:'grid', gap:12 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
                    <MetaCard label="Current status" value={application.portal_status || 'unclaimed'} />
                    <MetaCard label="Invite sent" value={application.portal_invited_at ? new Date(application.portal_invited_at).toLocaleString('en-GB') : 'Not yet'} />
                    <MetaCard label="Last viewed" value={application.portal_last_viewed_at ? new Date(application.portal_last_viewed_at).toLocaleString('en-GB') : 'No portal activity'} />
                  </div>
                  <div style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.6 }}>
                    Invite existing applicants to set up their candidate portal using the email address already attached to this application. Historical applications stay intact and will be linked into the new portal account.
                  </div>
                  {portalInviteFeedback ? <div style={{ fontSize:12.5, color: portalInviteFeedback.includes('sent') ? '#1E8E5A' : '#C23B22' }}>{portalInviteFeedback}</div> : null}
                  <button className="btn btn-primary" disabled={portalInviteBusy} onClick={sendCandidatePortalInvite}>
                    {portalInviteBusy ? 'Sending...' : application.portal_invited_at ? 'Resend portal invite' : 'Send portal invite'}
                  </button>
                </div>
              </div>

              <div className="card card-pad">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                  <CalendarDays size={16} color="var(--accent)" />
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>Interview</div>
                </div>
                <div style={{ display:'grid', gap:12 }}>
                  <div style={{ padding:'14px 16px', border:'1px solid var(--border)', borderRadius:14, background:'var(--bg2)' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:8 }}>Candidate self-booking</div>
                    <div style={{ display:'grid', gap:12 }}>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8 }}>
                        <div>
                          <label className="lbl">Date</label>
                          <input className="inp" type="date" value={bookingSlotDate} onChange={(e) => setBookingSlotDate(e.target.value)} />
                        </div>
                        <div>
                          <label className="lbl">Time</label>
                          <input className="inp" type="time" value={bookingSlotTime} onChange={(e) => setBookingSlotTime(e.target.value)} />
                        </div>
                        <div>
                          <label className="lbl">Duration</label>
                          <select className="inp" value={bookingSlotDuration} onChange={(e) => setBookingSlotDuration(Number(e.target.value))}>
                            <option value={30}>30 min</option>
                            <option value={45}>45 min</option>
                            <option value={60}>60 min</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <button className="btn btn-outline" onClick={addBookingSlot}>Add slot</button>
                      </div>
                      <div style={{ display:'grid', gap:8 }}>
                        {bookingSlots.filter((slot) => slot.status === 'open' || slot.status === 'booked').length === 0 ? <div style={{ fontSize:12.5, color:'var(--faint)' }}>No interview slots added yet.</div> : null}
                        {bookingSlots.filter((slot) => slot.status === 'open' || slot.status === 'booked').map((slot) => (
                          <div key={slot.id} style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--card)', display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                            <div style={{ fontSize:13 }}>
                              <div style={{ fontWeight:600, color:'var(--text)' }}>{new Date(slot.start_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</div>
                              <div style={{ color:'var(--sub)', marginTop:4 }}>{slot.status === 'booked' ? 'Booked by candidate' : `${slot.interview_mode || interviewMode} · ${slot.location || interviewLocation || 'Details to follow'}`}</div>
                            </div>
                            {slot.status !== 'booked' ? <button className="btn btn-outline btn-sm" onClick={() => removeBookingSlot(slot.id)}>Remove</button> : <span className="badge badge-blue">Booked</span>}
                          </div>
                        ))}
                      </div>
                      {bookingInviteFeedback ? <div style={{ fontSize:12.5, color: bookingInviteFeedback.includes('sent') || bookingInviteFeedback.includes('published') ? '#1E8E5A' : '#C23B22' }}>{bookingInviteFeedback}</div> : null}
                      <button className="btn btn-primary" disabled={bookingInviteBusy} onClick={sendInterviewBookingInvite}>
                        {bookingInviteBusy ? 'Sending...' : 'Email candidate to book interview'}
                      </button>
                    </div>
                  </div>

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
                    <textarea className="inp" rows={4} value={interviewNotesDraft} onChange={(e) => setInterviewNotesDraft(e.target.value)} style={{ resize:'vertical' }} placeholder="Add prep notes, arrival instructions, or who they will meet..." />
                  </div>
                  <label style={{ display:'flex', gap:10, alignItems:'flex-start', fontSize:12.5, color:'var(--sub)' }}>
                    <input type="checkbox" checked={sendInterviewInvite} onChange={(e) => setSendInterviewInvite(e.target.checked)} style={{ marginTop:2 }} />
                    <span>Email the interview details to the applicant from HR when saving.</span>
                  </label>
                  {interviewFeedback ? <div style={{ fontSize:12.5, color: interviewFeedback.includes('saved') || interviewFeedback.includes('sent') ? '#1E8E5A' : '#C23B22' }}>{interviewFeedback}</div> : null}
                  <button className="btn btn-primary" disabled={interviewBusy} onClick={scheduleInterview}>
                    {interviewBusy ? 'Saving...' : 'Schedule interview'}
                  </button>
                </div>
              </div>

              <div className="card card-pad">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                  <Mail size={16} color="var(--accent)" />
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>Email applicant</div>
                </div>
                <div style={{ display:'grid', gap:12 }}>
                  <div>
                    <label className="lbl">To</label>
                    <div className="inp" style={{ display:'flex', alignItems:'center' }}>{application.email || '—'}</div>
                  </div>
                  <div>
                    <label className="lbl">From</label>
                    <div className="inp" style={{ display:'flex', alignItems:'center' }}>HR@dhwebsiteservices.co.uk</div>
                  </div>
                  <div>
                    <label className="lbl">Subject</label>
                    <input className="inp" value={manualEmailSubject} onChange={(e) => setManualEmailSubject(e.target.value)} placeholder="Email subject" />
                  </div>
                  <div>
                    <label className="lbl">Message</label>
                    <textarea className="inp" rows={8} value={manualEmailBody} onChange={(e) => setManualEmailBody(e.target.value)} style={{ resize:'vertical' }} placeholder="Write your email to the applicant..." />
                  </div>
                  {manualEmailFeedback ? <div style={{ fontSize:12.5, color: manualEmailFeedback.includes('successfully') ? '#1E8E5A' : '#C23B22' }}>{manualEmailFeedback}</div> : null}
                  <button className="btn btn-primary" disabled={manualEmailBusy} onClick={sendManualEmail}>
                    {manualEmailBusy ? 'Sending...' : 'Send email'}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div style={{ display:'grid', gap:18 }}>
          <div className="card card-pad">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>CV</div>
            <ApplicantCvViewer url={application.cv_file_url} />
          </div>

          <div className="card card-pad">
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>Hiring owner</div>
              <div>
                <label className="lbl">Recruiter owner</label>
                <select className="inp" value={assignmentEmail} onChange={(e) => setAssignmentEmail(e.target.value)}>
                  <option value="">Unassigned</option>
                  {assignmentOptions.map((item) => (
                    <option key={item.email} value={item.email}>{item.name} ({item.email})</option>
                  ))}
                </select>
              </div>
              {assignmentFeedback ? <div style={{ fontSize:12.5, color: assignmentFeedback.includes('saved') ? '#1E8E5A' : '#C23B22' }}>{assignmentFeedback}</div> : null}
              <button className="btn btn-outline" disabled={assignmentBusy} onClick={saveAssignment}>
                {assignmentBusy ? 'Saving...' : 'Save assignment'}
              </button>
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginBottom:12 }}>Timeline</div>
            <ApplicantTimeline history={history} />
          </div>
        </div>
      </div>
    </div>
  )
}
