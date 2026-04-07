import { sendEmail } from './email'
import { getRecruitingStatusLabel } from './recruiting'

const FROM_EMAIL = 'DH Website Services HR <HR@dhwebsiteservices.co.uk>'
const CANDIDATE_PORTAL_URL = 'https://careers.dhwebsiteservices.co.uk'

function formatDateTime(value) {
  if (!value) return 'To be confirmed'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'To be confirmed'
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function escapeHtml(value = '') {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function nl2br(value = '') {
  return escapeHtml(value).replace(/\n/g, '<br/>')
}

function buildEmailShell({
  eyebrow = 'Recruitment',
  title = '',
  intro = '',
  accent = '#2F6FED',
  detailRows = [],
  note = '',
  closing = 'DH Website Services HR',
}) {
  const detailMarkup = detailRows.length
    ? `
      <div style="margin:24px 0;padding:18px;border:1px solid #D9E1F2;border-radius:18px;background:#F7F9FC">
        ${detailRows.map((row) => `
          <div style="padding:${row.compact ? '0' : '0 0 14px'};${row.compact ? '' : 'border-bottom:1px solid #E7ECF5;margin-bottom:14px;'}">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#7A8499;margin-bottom:6px">${escapeHtml(row.label)}</div>
            <div style="font-size:14px;line-height:1.65;color:#182033">${row.html ? row.value : escapeHtml(row.value)}</div>
          </div>
        `).join('')}
      </div>
    `
    : ''

  const noteMarkup = note
    ? `
      <div style="margin:20px 0 0;padding:16px 18px;border-radius:16px;background:#EEF4FF;border:1px solid #D6E4FF">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#5170A6;margin-bottom:8px">Message</div>
        <div style="font-size:14px;line-height:1.7;color:#20304D">${nl2br(note)}</div>
      </div>
    `
    : ''

  return `
    <div style="margin:0;padding:28px 16px;background:#F4F7FB;font-family:Arial,sans-serif;color:#182033">
      <div style="max-width:640px;margin:0 auto;background:#FFFFFF;border:1px solid #DEE6F3;border-radius:24px;overflow:hidden;box-shadow:0 12px 34px rgba(19,35,79,0.08)">
        <div style="padding:24px 28px;background:linear-gradient(135deg, ${accent} 0%, #101827 100%);color:#FFFFFF">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;opacity:0.72">${escapeHtml(eyebrow)}</div>
          <div style="font-size:28px;font-weight:700;line-height:1.15;letter-spacing:-0.03em;margin-top:10px">${escapeHtml(title)}</div>
          <div style="font-size:14px;line-height:1.75;opacity:0.9;margin-top:12px">${escapeHtml(intro)}</div>
        </div>
        <div style="padding:28px">
          ${detailMarkup}
          ${noteMarkup}
          <div style="margin-top:24px;font-size:14px;line-height:1.75;color:#44506A">
            Regards,<br/><strong style="color:#182033">${escapeHtml(closing)}</strong>
          </div>
        </div>
      </div>
    </div>
  `
}

function buildEmailText({ title = '', intro = '', detailRows = [], note = '', closing = 'DH Website Services HR' }) {
  const lines = [title, '', intro]
  if (detailRows.length) {
    lines.push('')
    detailRows.forEach((row) => {
      lines.push(`${row.label}: ${row.text || row.value || ''}`)
    })
  }
  if (note) {
    lines.push('', note)
  }
  lines.push('', `Regards,`, closing)
  return lines.join('\n')
}

export function buildRecruitingEmailSubject(status, application) {
  const role = application?.job_posts?.title || 'your application'
  if (status === 'shortlisted') return `Shortlisted: ${role}`
  if (status === 'interview') return `Interview update: ${role}`
  if (status === 'offered') return `Offer stage update: ${role}`
  if (status === 'hired') return `Next steps: ${role}`
  if (status === 'rejected') return `Application update: ${role}`
  return `${getRecruitingStatusLabel(status)} — ${role}`
}

function buildStatusConfig(status, role) {
  return {
    shortlisted: {
      title: `You have been shortlisted for ${role}`,
      intro: 'Your application has passed the first review stage and is now in the active shortlist.',
      accent: '#1F6FEB',
    },
    interview: {
      title: `Interview update for ${role}`,
      intro: 'Your application is moving into interview stage. Full scheduling details will follow if they have not already been sent.',
      accent: '#2F6FED',
    },
    offered: {
      title: `Your application has moved to offer stage`,
      intro: `We are progressing your application for ${role} and the hiring team is preparing the next steps.`,
      accent: '#0F9D7A',
    },
    hired: {
      title: `Next steps for ${role}`,
      intro: 'We are pleased to confirm that your application has reached the hire stage and the team will be in touch with onboarding details.',
      accent: '#0E8A5F',
    },
    rejected: {
      title: `Update on your ${role} application`,
      intro: 'Thank you for your time and interest. After review, we will not be progressing this application further.',
      accent: '#A64747',
    },
  }[status] || {
    title: `Update on your application for ${role}`,
    intro: `There has been an update on your application for ${role}.`,
    accent: '#2F6FED',
  }
}

export function buildRecruitingEmailHtml(status, application, note = '') {
  const role = application?.job_posts?.title || 'the role'
  const config = buildStatusConfig(status, role)
  return buildEmailShell({
    eyebrow: getRecruitingStatusLabel(status),
    title: config.title,
    intro: config.intro,
    accent: config.accent,
    detailRows: [
      { label: 'Role', value: role },
      { label: 'Applicant', value: application?.full_name || application?.email || 'Applicant' },
      { label: 'Current status', value: getRecruitingStatusLabel(status) },
    ],
    note,
  })
}

export function buildRecruitingEmailText(status, application, note = '') {
  const role = application?.job_posts?.title || 'the role'
  const config = buildStatusConfig(status, role)
  return buildEmailText({
    title: config.title,
    intro: config.intro,
    detailRows: [
      { label: 'Role', value: role },
      { label: 'Applicant', value: application?.full_name || application?.email || 'Applicant' },
      { label: 'Current status', value: getRecruitingStatusLabel(status) },
    ],
    note,
  })
}

export async function sendRecruitingStatusEmail(status, application, note = '') {
  if (!application?.email) throw new Error('Application email is required')
  return sendEmail('send_email', {
    to: application.email,
    to_name: application.full_name || application.email,
    subject: buildRecruitingEmailSubject(status, application),
    html: buildRecruitingEmailHtml(status, application, note),
    text: buildRecruitingEmailText(status, application, note),
    sent_by: 'Recruiting',
    from_email: FROM_EMAIL,
    log_outreach: false,
  })
}

export function buildInterviewScheduleEmailSubject(application) {
  const role = application?.job_posts?.title || 'your application'
  const when = formatDateTime(application?.interview_at)
  return `Interview details: ${role} — ${when}`
}

export function buildInterviewScheduleEmailHtml(application) {
  const role = application?.job_posts?.title || 'the role'
  const contactName = application?.interview_contact_name || application?.interview_contact_email || 'DH Website Services HR'
  const contactValue = application?.interview_contact_email
    ? `${contactName} (${application.interview_contact_email})`
    : contactName

  return buildEmailShell({
    eyebrow: 'Interview scheduled',
    title: `Your interview is booked for ${role}`,
    intro: 'Please keep these details handy and reply to this email if you need to confirm or rearrange.',
    accent: '#2F6FED',
    detailRows: [
      { label: 'Role', value: role },
      { label: 'Date and time', value: formatDateTime(application?.interview_at) },
      { label: 'Format', value: application?.interview_mode || 'To be confirmed' },
      { label: 'Meeting details', value: application?.interview_location || 'We will send location details shortly.' },
      { label: 'Contact', value: contactValue },
    ],
    note: application?.interview_notes || '',
  })
}

export function buildInterviewScheduleEmailText(application) {
  const role = application?.job_posts?.title || 'the role'
  const contactName = application?.interview_contact_name || application?.interview_contact_email || 'DH Website Services HR'
  const contactValue = application?.interview_contact_email
    ? `${contactName} (${application.interview_contact_email})`
    : contactName
  return buildEmailText({
    title: `Your interview is booked for ${role}`,
    intro: 'Please keep these details handy and reply to this email if you need to confirm or rearrange.',
    detailRows: [
      { label: 'Role', value: role },
      { label: 'Date and time', value: formatDateTime(application?.interview_at) },
      { label: 'Format', value: application?.interview_mode || 'To be confirmed' },
      { label: 'Meeting details', value: application?.interview_location || 'We will send location details shortly.' },
      { label: 'Contact', value: contactValue },
    ],
    note: application?.interview_notes || '',
  })
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

export function buildCandidateInterviewBookingEmailSubject(application) {
  const role = application?.job_posts?.title || 'your application'
  return `Book your interview: ${role}`
}

export function buildCandidateInterviewBookingEmailHtml(application, bookingUrl, note = '') {
  const role = application?.job_posts?.title || 'the role'
  return buildEmailShell({
    eyebrow: 'Interview booking',
    title: `Choose your interview time for ${role}`,
    intro: 'The hiring team has opened interview slots for you. Use the button below to sign in to the candidate portal and book the time that suits you.',
    accent: '#2F6FED',
    detailRows: [
      { label: 'Role', value: role },
      { label: 'Applicant', value: application?.full_name || application?.email || 'Applicant' },
      { label: 'Booking link', value: `<a href="${bookingUrl}" style="color:#2F6FED;text-decoration:none;font-weight:700">Open candidate portal</a>`, html: true },
    ],
    note,
  })
}

export async function sendCandidateInterviewBookingEmail(application, note = '', bookingUrl = `${CANDIDATE_PORTAL_URL}/interviews/${application?.id}`) {
  if (!application?.email) throw new Error('Application email is required')
  return sendEmail('custom_email', {
    to: application.email,
    subject: buildCandidateInterviewBookingEmailSubject(application),
    html: buildCandidateInterviewBookingEmailHtml(application, bookingUrl, note),
    from: FROM_EMAIL,
  })
}

export function buildCandidatePortalInviteEmailSubject(application) {
  const role = application?.job_posts?.title || 'your application'
  return `Set up your candidate portal: ${role}`
}

export function buildCandidatePortalInviteEmailHtml(application, inviteUrl, note = '') {
  const role = application?.job_posts?.title || 'the role'
  return buildEmailShell({
    eyebrow: 'Candidate portal',
    title: `Set up your portal access for ${role}`,
    intro: 'Create your DH Careers account with the same email address you applied with, then manage your profile, applications, and interview updates in one place.',
    accent: '#0F9D7A',
    detailRows: [
      { label: 'Role', value: role },
      { label: 'Applicant', value: application?.full_name || application?.email || 'Applicant' },
      { label: 'Portal link', value: `<a href="${inviteUrl}" style="color:#0F9D7A;text-decoration:none;font-weight:700">Activate candidate portal</a>`, html: true },
    ],
    note,
  })
}

export async function sendCandidatePortalInviteEmail(application, inviteUrl, note = '') {
  if (!application?.email) throw new Error('Application email is required')
  return sendEmail('custom_email', {
    to: application.email,
    subject: buildCandidatePortalInviteEmailSubject(application),
    html: buildCandidatePortalInviteEmailHtml(application, inviteUrl, note),
    from: FROM_EMAIL,
  })
}
