import { sendEmail } from './email'
import { getRecruitingStatusLabel } from './recruiting'

const FROM_EMAIL = 'DH Website Services HR <HR@dhwebsiteservices.co.uk>'

export function buildRecruitingEmailSubject(status, application) {
  const role = application?.job_posts?.title || 'your application'
  if (status === 'shortlisted') return `You have been shortlisted for ${role}`
  if (status === 'interview') return `Interview update for ${role}`
  if (status === 'offered') return `Application update for ${role}`
  if (status === 'hired') return `Next steps for ${role}`
  if (status === 'rejected') return `Update on your ${role} application`
  return `${getRecruitingStatusLabel(status)} — ${role}`
}

export function buildRecruitingEmailHtml(status, application, note = '') {
  const firstName = (application?.first_name || application?.full_name || application?.email || 'there').split(' ')[0]
  const role = application?.job_posts?.title || 'the role'
  const intro = {
    shortlisted: `You have been shortlisted for ${role}.`,
    interview: `We would like to progress your application for ${role}.`,
    offered: `Your application for ${role} has moved to the offer stage.`,
    hired: `We are pleased to confirm the next step for ${role}.`,
    rejected: `Thank you for your interest in ${role}. After review, we will not be progressing your application further.`,
  }[status] || `There has been an update on your application for ${role}.`

  return `
    <p>Hi ${firstName},</p>
    <p>${intro}</p>
    ${note ? `<p>${String(note).replace(/\n/g, '<br/>')}</p>` : ''}
    <p>Regards,<br/>DH Website Services HR</p>
  `
}

export async function sendRecruitingStatusEmail(status, application, note = '') {
  if (!application?.email) throw new Error('Application email is required')
  return sendEmail('send_email', {
    to: application.email,
    to_name: application.full_name || application.email,
    subject: buildRecruitingEmailSubject(status, application),
    html: buildRecruitingEmailHtml(status, application, note),
    sent_by: 'Recruiting',
    from_email: FROM_EMAIL,
    log_outreach: false,
  })
}

export function buildInterviewScheduleEmailSubject(application) {
  const role = application?.job_posts?.title || 'your application'
  const when = application?.interview_at
    ? new Date(application.interview_at).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : ''
  return when ? `Interview details: ${role} — ${when}` : `Interview details for ${role}`
}

export function buildInterviewScheduleEmailHtml(application) {
  const firstName = (application?.first_name || application?.full_name || application?.email || 'there').split(' ')[0]
  const role = application?.job_posts?.title || 'the role'
  const when = application?.interview_at
    ? new Date(application.interview_at).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : 'to be confirmed'
  const contactLine = application?.interview_contact_name || application?.interview_contact_email
    ? `<p><strong>Contact:</strong> ${application.interview_contact_name || application.interview_contact_email}${application.interview_contact_email ? ` (${application.interview_contact_email})` : ''}</p>`
    : ''

  return `
    <div style="font-family:Arial,sans-serif;color:#1d1d1f;max-width:620px;margin:0 auto;padding:24px 20px;line-height:1.6">
      <p>Hi ${firstName},</p>
      <p>Your interview has been scheduled for <strong>${role}</strong>.</p>
      <p><strong>Date and time:</strong> ${when}</p>
      ${application?.interview_mode ? `<p><strong>Format:</strong> ${application.interview_mode}</p>` : ''}
      ${application?.interview_location ? `<p><strong>Meeting details:</strong> ${application.interview_location}</p>` : ''}
      ${contactLine}
      ${application?.interview_notes ? `<p><strong>Notes:</strong><br/>${String(application.interview_notes).replace(/\n/g, '<br/>')}</p>` : ''}
      <p>Please reply to this email if you need to confirm or rearrange.</p>
      <p>Regards,<br/>DH Website Services HR</p>
    </div>
  `
}

export function buildInterviewScheduleEmailText(application) {
  const role = application?.job_posts?.title || 'the role'
  const when = application?.interview_at
    ? new Date(application.interview_at).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : 'to be confirmed'
  const lines = [
    `Your interview has been scheduled for ${role}.`,
    '',
    `Date and time: ${when}`,
  ]
  if (application?.interview_mode) lines.push(`Format: ${application.interview_mode}`)
  if (application?.interview_location) lines.push(`Meeting details: ${application.interview_location}`)
  if (application?.interview_contact_name || application?.interview_contact_email) {
    lines.push(`Contact: ${application.interview_contact_name || application.interview_contact_email}${application?.interview_contact_email ? ` (${application.interview_contact_email})` : ''}`)
  }
  if (application?.interview_notes) {
    lines.push('', `Notes: ${application.interview_notes}`)
  }
  lines.push('', 'Please reply to this email if you need to confirm or rearrange.', '', 'DH Website Services HR')
  return lines.join('\n')
}

export async function sendInterviewScheduleEmail(application) {
  if (!application?.email) throw new Error('Application email is required')
  return sendEmail('custom_email', {
    to: application.email,
    subject: buildInterviewScheduleEmailSubject(application),
    html: buildInterviewScheduleEmailHtml(application),
    text: buildInterviewScheduleEmailText(application),
    from: FROM_EMAIL,
    reply_to: application?.interview_contact_email || undefined,
  })
}
