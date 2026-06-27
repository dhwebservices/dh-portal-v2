import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  buildAddressFromOnboarding,
  buildOnboardingPayloadKey,
  normalizeEmail,
  syncOnboardingSubmissionToHrProfile,
  upsertEmailScopedRow,
} from '../../utils/hrProfileSync'
import { sendManagedNotification } from '../../utils/notificationPreferences'
import { buildLifecycleSettingKey, DIRECTOR_EMAILS, mergeLifecycleRecord } from '../../utils/staffLifecycle'
import { buildStaffOrgKey, getManagedDepartments, mergeOrgRecord } from '../../utils/orgStructure'
import {
  buildContractMergeFields,
  buildContractTemplateKey,
  buildContractFileName,
  buildContractPdfBlob,
  buildStaffContractKey,
  createContractTemplate,
  createPortalSignature,
  createStaffContract,
  getContractStatusLabel,
  renderContractHtml,
} from '../../utils/contracts'
import { openSecureDocument } from '../../utils/fileAccess'
import { sendEmail } from '../../utils/email'

function assertSupabaseOk(result, label) {
  if (result?.error) {
    throw new Error(`${label}: ${result.error.message}`)
  }
  return result
}

const STEPS = [
  { key:'personal',   label:'Personal Info'       },
  { key:'address',    label:'Address & Contact'   },
  { key:'employment', label:'Employment'          },
  { key:'emergency',  label:'Emergency Contact'   },
  { key:'bank',       label:'Bank Details'        },
  { key:'rtw',        label:'Right to Work'       },
  { key:'contract',   label:'Contract & Sign Off' },
]
const STEP_INTRO = {
  personal: {
    title: 'Personal information',
    description: 'Use the name shown on your passport or official ID so payroll and right-to-work checks match first time.',
  },
  address: {
    title: 'Address and contact details',
    description: 'Add the personal contact details HR should use for onboarding and employment records.',
  },
  employment: {
    title: 'Employment details',
    description: 'These role details are set by DH Website Services. Check them before you continue.',
  },
  emergency: {
    title: 'Emergency contact',
    description: 'This information is only used if HR or your manager needs to reach someone urgently.',
  },
  bank: {
    title: 'Bank details',
    description: 'Your payroll details are stored securely and only used for salary payments.',
  },
  rtw: {
    title: 'Right to work',
    description: 'Upload the document HR needs to confirm your right to work in the UK before your start date.',
  },
  contract: {
    title: 'Contract and sign-off',
    description: 'Review your contract, complete the final declarations, and submit the form once everything is in place.',
  },
}

const RTW_DOCS = ['UK Passport','British National (Overseas) Passport','EU/EEA Passport','BRP Card (Biometric Residence Permit)','UK Birth Certificate + NI evidence','Certificate of Naturalisation','Visa (specify type)','Other']
const STARTER_PERMISSION_DEFAULTS = {
  dashboard: true,
  notifications: true,
  my_profile: true,
  search: true,
  my_team: true,
  mytasks: true,
  schedule: true,
  hr_leave: true,
  hr_payslips: true,
  hr_policies: true,
  hr_onboarding: true,
}
const STARTER_GUIDE_PUBLIC_URL = 'https://staff.dhwebsiteservices.co.uk/starter-guides/dh-sales-onboarding.pdf'
const MICROSOFT_ACCOUNT_API_PATH = '/api/microsoft-account'

function fileToBase64(arrayBuffer) {
  let binary = ''
  const bytes = new Uint8Array(arrayBuffer)
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function suggestWorkEmail(fullName = '') {
  const safe = String(fullName || '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!safe.length) return ''
  if (safe.length === 1) return `${safe[0]}@dhwebsiteservices.co.uk`
  return `${safe[0]}.${safe[safe.length - 1]}@dhwebsiteservices.co.uk`
}

function buildStarterEmailContent(starter = {}) {
  const portalUrl = 'https://staff.dhwebsiteservices.co.uk'
  const firstName = String(starter.full_name || '').trim().split(' ')[0] || 'there'
  const managerName = starter.manager_name || 'Your manager'
  const managerEmail = starter.manager_email || ''
  const managerPhone = starter.manager_phone || ''
  const subject = `Your DH Website Services login details`
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0f172a;line-height:1.7">
      <p>Hi ${firstName},</p>
      <p>Please see attached our Sales Guide for Outreach Staff.</p>
      <p>Your DH Website Services account has now been created successfully.</p>
      <p><strong>Login Details</strong><br/>
      Username: ${starter.work_email}<br/>
      Password: ${starter.temp_password}<br/>
      <em>(Please ensure you copy the password exactly as shown.)</em></p>
      <p>To access company systems, you will first need to install Microsoft Company Portal on your device. This allows secure access to company applications and services.</p>
      <p>Please note that enrolling your device as a “company device” does not mean the company owns or has full control over your personal device. This setup only allows us to manage access to business applications and company data for security purposes.</p>
      <p><strong>Setup Instructions</strong></p>
      <ol>
        <li>Download Microsoft Company Portal
          <ul>
            <li>iPhone/iPad: App Store</li>
            <li>Android: Google Play Store</li>
            <li>Windows/Mac: <a href="https://portal.manage.microsoft.com" style="color:#1f6feb;text-decoration:none">https://portal.manage.microsoft.com</a></li>
          </ul>
        </li>
        <li>Open the Company Portal application</li>
        <li>Sign in using your DH Website Services email address</li>
        <li>Complete device registration. Follow the on-screen instructions fully to complete the enrolment process. Access to company systems will not be granted until setup has been completed successfully.</li>
      </ol>
      <p>Once Company Portal has been installed, please also download:</p>
      <ul>
        <li>Microsoft Authenticator</li>
        <li>Microsoft Outlook</li>
      </ul>
      <p>You can then sign into Outlook using the login details above.</p>
      <p>I will also CC this email to your work email address. If you could reply from your work account once logged in, just to confirm access is working correctly, that would be appreciated.</p>
      <p><strong>Staff Portal Access:</strong></p>
      <p>Once logged in successfully, please visit:<br/>
      <a href="${portalUrl}" style="color:#1f6feb;text-decoration:none">${portalUrl}</a></p>
      <p>Select “Microsoft Login” and sign in using your work email address.</p>
      <p>Please complete the onboarding form as soon as possible. You will be required to upload:</p>
      <ul>
        <li>Your passport or valid ID document</li>
        <li>Bank details matching your legal name</li>
      </ul>
      <p>Please ensure all submitted information matches exactly, otherwise approval may be delayed.</p>
      <p>Your company email signature should already be active and will automatically appear when creating new emails.</p>
      <p>You will also shortly receive a separate email providing access to our company phone line system through bOnline.</p>
      <p><strong>Your manager will be:</strong></p>
      <p>${managerName}<br/>
      Email: ${managerEmail || 'To be confirmed'}${managerPhone ? `<br/>Phone: ${managerPhone}` : ''}</p>
      <p>You can reach out to ${managerName.split(' ')[0] || 'them'} with any questions about getting started or anything in general.</p>
      <p>If you experience any issues during setup or onboarding, please let me know.</p>
      <p>Kind Regards,<br/>David<br/><br/>Director</p>
      <p style="font-size:13px;color:#64748b">If the PDF attachment does not appear in your email client, use this guide link instead: <a href="${STARTER_GUIDE_PUBLIC_URL}" style="color:#1f6feb;text-decoration:none">${STARTER_GUIDE_PUBLIC_URL}</a></p>
    </div>
  `.trim()

  const text = [
    `Hi ${firstName},`,
    '',
    'Please see attached our Sales Guide for Outreach Staff.',
    '',
    'Your DH Website Services account has now been created successfully.',
    '',
    'Login Details',
    `Username: ${starter.work_email}`,
    `Password: ${starter.temp_password}`,
    '(Please ensure you copy the password exactly as shown.)',
    '',
    'To access company systems, you will first need to install Microsoft Company Portal on your device. This allows secure access to company applications and services.',
    '',
    'Please note that enrolling your device as a "company device" does not mean the company owns or has full control over your personal device. This setup only allows us to manage access to business applications and company data for security purposes.',
    '',
    'Setup Instructions',
    '1. Download Microsoft Company Portal',
    '- iPhone/iPad: App Store',
    '- Android: Google Play Store',
    '- Windows/Mac: https://portal.manage.microsoft.com',
    '2. Open the Company Portal application',
    '3. Sign in using your DH Website Services email address',
    '4. Complete device registration. Follow the on-screen instructions fully to complete the enrolment process. Access to company systems will not be granted until setup has been completed successfully.',
    '',
    'Once Company Portal has been installed, please also download:',
    '- Microsoft Authenticator',
    '- Microsoft Outlook',
    '',
    'You can then sign into Outlook using the login details above.',
    'I will also CC this email to your work email address. If you could reply from your work account once logged in, just to confirm access is working correctly, that would be appreciated.',
    '',
    'Staff Portal Access:',
    portalUrl,
    '',
    'Select “Microsoft Login” and sign in using your work email address.',
    'Please complete the onboarding form as soon as possible. You will be required to upload:',
    '- Your passport or valid ID document',
    '- Bank details matching your legal name',
    '',
    'Please ensure all submitted information matches exactly, otherwise approval may be delayed.',
    'Your company email signature should already be active and will automatically appear when creating new emails.',
    'You will also shortly receive a separate email providing access to our company phone line system through bOnline.',
    '',
    'Your manager will be:',
    managerName,
    `Email: ${managerEmail || 'To be confirmed'}`,
    ...(managerPhone ? [`Phone: ${managerPhone}`] : []),
    '',
    `You can reach out to ${managerName.split(' ')[0] || 'them'} with any questions about getting started or anything in general.`,
    'If you experience any issues during setup or onboarding, please let me know.',
    '',
    'Kind Regards,',
    'David',
    '',
    'Director',
    '',
    `Guide link: ${STARTER_GUIDE_PUBLIC_URL}`,
  ].join('\n')

  return { subject, html, text }
}

function completionForSubmission(submission = {}) {
  const required = ['full_name','dob','ni_number','address_line1','city','postcode','personal_email','personal_phone','emergency_name','emergency_phone','bank_name','sort_code','account_number','rtw_type','company_portal_confirmed']
  const filled = required.filter((key) => submission[key] && submission[key].toString().trim() !== '').length
  return Math.round((filled / required.length) * 100)
}

function daysUntil(dateString) {
  if (!dateString) return null
  const diff = new Date(dateString).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

function buildSubmissionPayload({ user, form, employmentContext, status }) {
  return {
    user_email: normalizeEmail(user?.email || ''),
    user_name: form.full_name || user?.name || user?.email || '',
    preferred_name: form.preferred_name || '',
    dob: form.dob || null,
    gender: form.gender || '',
    nationality: form.nationality || '',
    ni_number: form.ni_number || '',
    address_line1: form.address_line1 || '',
    address_line2: form.address_line2 || '',
    city: form.city || '',
    postcode: form.postcode || '',
    personal_email: form.personal_email || '',
    personal_phone: form.personal_phone || '',
    job_title: form.job_title || employmentContext.job_title || '',
    department: form.department || employmentContext.department || '',
    start_date: form.start_date || employmentContext.start_date || '',
    contract_type: form.contract_type || employmentContext.contract_type || '',
    hours_per_week: form.hours_per_week || '',
    manager_name: form.manager_name || employmentContext.manager_name || '',
    manager_email: form.manager_email || employmentContext.manager_email || '',
    work_location: form.work_location || '',
    company_portal_confirmed: !!form.company_portal_confirmed,
    emergency_name: form.emergency_name || '',
    emergency_relationship: form.emergency_relationship || '',
    emergency_phone: form.emergency_phone || '',
    emergency_email: form.emergency_email || '',
    bank_name: form.bank_name || '',
    account_name: form.account_name || '',
    sort_code: form.sort_code || '',
    account_number: form.account_number || '',
    payment_frequency: form.payment_frequency || 'Monthly',
    rtw_type: form.rtw_type || '',
    rtw_document_url: form.rtw_document_url || '',
    rtw_expiry: form.rtw_expiry || null,
    rtw_notes: form.rtw_notes || '',
    contract_signed: !!form.contract_signed,
    handbook_read: !!form.handbook_read,
    data_consent: !!form.data_consent,
    photo_url: form.photo_url || '',
    additional_notes: form.additional_notes || '',
    status,
    submitted_at: status === 'submitted' ? new Date().toISOString() : null,
  }
}

function buildSubmissionRow(payload = {}) {
  return {
    user_email: normalizeEmail(payload.user_email || ''),
    user_name: payload.user_name || '',
    dob: payload.dob || null,
    address: buildAddressFromOnboarding(payload),
    personal_email: payload.personal_email || '',
    manager_name: payload.manager_name || '',
    manager_email: payload.manager_email || '',
    emergency_phone: payload.emergency_phone || '',
    bank_name: payload.bank_name || '',
    account_name: payload.account_name || '',
    sort_code: payload.sort_code || '',
    account_number: payload.account_number || '',
    rtw_type: payload.rtw_type || '',
    rtw_expiry: payload.rtw_expiry || null,
    status: payload.status || 'draft',
    submitted_at: payload.status === 'submitted' ? (payload.submitted_at || new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  }
}

async function ensureSubmissionSummary(payload = {}) {
  const summaryRow = buildSubmissionRow(payload)
  const normalizedEmail = normalizeEmail(summaryRow.user_email)
  if (!normalizedEmail) throw new Error('Missing onboarding email')

  const { data: existingRows, error: existingError } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .ilike('user_email', normalizedEmail)

  if (existingError) throw existingError

  const sortedRows = (existingRows || []).slice().sort((a, b) =>
    new Date(b.updated_at || b.submitted_at || b.created_at || 0).getTime() -
    new Date(a.updated_at || a.submitted_at || a.created_at || 0).getTime()
  )

  if (!sortedRows.length) {
    const { data: insertedRows, error: insertError } = await supabase
      .from('onboarding_submissions')
      .insert(summaryRow)
      .select('*')
    if (insertError) throw insertError
    const inserted = Array.isArray(insertedRows) ? insertedRows[0] : insertedRows
    if (!inserted?.user_email) throw new Error(`Onboarding summary insert failed for ${normalizedEmail}`)
    return inserted
  }

  const primaryRow = sortedRows[0]
  let updatedRows = null
  let updateError = null

  if (primaryRow?.id) {
    const result = await supabase
      .from('onboarding_submissions')
      .update(summaryRow)
      .eq('id', primaryRow.id)
      .select('*')
    updatedRows = result.data
    updateError = result.error
  } else {
    const result = await supabase
      .from('onboarding_submissions')
      .update(summaryRow)
      .ilike('user_email', normalizedEmail)
      .select('*')
    updatedRows = result.data
    updateError = result.error
  }

  if (updateError) throw updateError
  const updated = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows
  if (updated?.user_email) return updated

  const { data: refreshedRows, error: refreshError } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .ilike('user_email', normalizedEmail)

  if (refreshError) throw refreshError

  const refreshed = (refreshedRows || [])
    .slice()
    .sort((a, b) =>
      new Date(b.updated_at || b.submitted_at || b.created_at || 0).getTime() -
      new Date(a.updated_at || a.submitted_at || a.created_at || 0).getTime()
    )[0]

  if (refreshed?.user_email) return refreshed

  const { data: fallbackRows, error: fallbackInsertError } = await supabase
    .from('onboarding_submissions')
    .insert(summaryRow)
    .select('*')

  if (fallbackInsertError) throw fallbackInsertError
  const fallbackInserted = Array.isArray(fallbackRows) ? fallbackRows[0] : fallbackRows
  if (!fallbackInserted?.user_email) throw new Error(`Onboarding summary update failed for ${normalizedEmail}`)
  return fallbackInserted
}

function mergeSubmissionWithPayload(summary = {}, payload = {}) {
  return {
    ...summary,
    ...payload,
    user_email: normalizeEmail(payload.user_email || summary.user_email || ''),
    user_name: payload.user_name || summary.user_name || '',
    status: payload.status || summary.status || 'draft',
    submitted_at: payload.submitted_at || summary.submitted_at || null,
    manager_email: payload.manager_email || summary.manager_email || '',
    manager_name: payload.manager_name || summary.manager_name || '',
    personal_email: payload.personal_email || summary.personal_email || '',
    rtw_type: payload.rtw_type || summary.rtw_type || '',
    rtw_expiry: payload.rtw_expiry || summary.rtw_expiry || null,
  }
}

function dedupeSubmissions(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    const email = normalizeEmail(row?.user_email || '')
    if (!email) return
    const existing = map.get(email)
    const currentDate = new Date(row?.submitted_at || row?.updated_at || row?.created_at || 0).getTime()
    const existingDate = existing ? new Date(existing?.submitted_at || existing?.updated_at || existing?.created_at || 0).getTime() : 0
    if (!existing || currentDate >= existingDate) {
      map.set(email, row)
    }
  })
  return [...map.values()]
}

function getOnboardingDisplayName(submission = {}) {
  return submission.full_name || submission.user_name || submission.personal_email || submission.user_email || 'This staff member'
}

function formatReviewValue(value, fallback = '—') {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  const stringValue = String(value).trim()
  return stringValue || fallback
}

function formatReviewDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
}

function buildReviewSections(submission = {}) {
  const addressParts = [
    submission.address_line1,
    submission.address_line2,
    submission.city,
    submission.postcode,
  ].filter((item) => String(item || '').trim())

  const employmentParts = [
    submission.job_title,
    submission.department,
    submission.contract_type,
  ].filter((item) => String(item || '').trim())

  return [
    {
      title: 'Personal details',
      fields: [
        ['Full name', submission.full_name || submission.user_name],
        ['Preferred name', submission.preferred_name],
        ['Date of birth', formatReviewDate(submission.dob)],
        ['Gender', submission.gender],
        ['Nationality', submission.nationality],
        ['National Insurance number', submission.ni_number],
      ],
    },
    {
      title: 'Address and contact',
      fields: [
        ['Address', addressParts.join(', ')],
        ['Personal email', submission.personal_email],
        ['Personal phone', submission.personal_phone],
        ['Work email', submission.user_email],
      ],
    },
    {
      title: 'Employment',
      fields: [
        ['Role summary', employmentParts.join(' · ')],
        ['Job title', submission.job_title],
        ['Department', submission.department],
        ['Start date', formatReviewDate(submission.start_date)],
        ['Contract type', submission.contract_type],
        ['Hours per week', submission.hours_per_week],
        ['Work location', submission.work_location],
        ['Company portal confirmed', submission.company_portal_confirmed],
      ],
    },
    {
      title: 'Manager and emergency contact',
      fields: [
        ['Manager name', submission.manager_name],
        ['Manager email', submission.manager_email],
        ['Emergency contact', submission.emergency_name],
        ['Relationship', submission.emergency_relationship],
        ['Emergency phone', submission.emergency_phone],
        ['Emergency email', submission.emergency_email],
      ],
    },
    {
      title: 'Bank details',
      fields: [
        ['Bank name', submission.bank_name],
        ['Account name', submission.account_name],
        ['Sort code', submission.sort_code],
        ['Account number', submission.account_number],
        ['Payment frequency', submission.payment_frequency],
      ],
    },
    {
      title: 'Right to work and declarations',
      fields: [
        ['Right to work document', submission.rtw_type],
        ['Right to work expiry', formatReviewDate(submission.rtw_expiry)],
        ['Right to work notes', submission.rtw_notes],
        ['Contract signed', submission.contract_signed],
        ['Handbook read', submission.handbook_read],
        ['Data consent', submission.data_consent],
      ],
    },
    {
      title: 'Additional information',
      fields: [
        ['Status', submission.status || 'submitted'],
        ['Submitted', formatReviewDate(submission.submitted_at)],
        ['Photo URL', submission.photo_url],
        ['Additional notes', submission.additional_notes],
      ],
    },
  ]
}

export default function HROnboarding() {
  const { user, isAdmin, isDirector, isDepartmentManager, managedDepartments, isOnboarding } = useAuth()
  const isReviewer = (isAdmin || isDepartmentManager) && !isOnboarding
  const canSeeAllSubmissions = isDirector || isAdmin
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading]         = useState(true)
  const [mySubmission, setMy]         = useState(null)
  const [employmentContext, setEmploymentContext] = useState({ department:'', manager_name:'', manager_email:'', role_scope:'', job_title:'', contract_type:'', start_date:'' })
  const [step, setStep]               = useState(0)
  const [saving, setSaving]           = useState(false)
  const [rtwUploading, setRtwUploading] = useState(false)
  const [rtwUploadError, setRtwUploadError] = useState('')
  const [rtwUploadName, setRtwUploadName] = useState('')
  const [staffContract, setStaffContract] = useState(null)
  const [contractSigning, setContractSigning] = useState(false)
  const [contractMessage, setContractMessage] = useState('')
  const [viewSub, setViewSub]         = useState(null)
  const [adminBusyEmail, setAdminBusyEmail] = useState('')
  const [adminMessage, setAdminMessage] = useState('')
  const [starterBusy, setStarterBusy] = useState(false)
  const [starterMessage, setStarterMessage] = useState('')
  const [starterPreview, setStarterPreview] = useState(null)
  const [starterProvisioningEnabled, setStarterProvisioningEnabled] = useState(true)
  const [starterManagers, setStarterManagers] = useState([])
  const [starterDepartments, setStarterDepartments] = useState([])
  const [starterRoles, setStarterRoles] = useState([])
  const [starterContractTemplates, setStarterContractTemplates] = useState([])
  const [starterProvisioningResult, setStarterProvisioningResult] = useState(null)
  const rtwRef = useRef()
  const [starterForm, setStarterForm] = useState({
    full_name: '',
    personal_email: '',
    work_email: '',
    temp_password: '',
    job_title: '',
    department: '',
    start_date: '',
    contract_type: 'Permanent',
    contract_template_id: '',
    manager_name: '',
    manager_email: '',
    manager_phone: '',
    notes: '',
  })

  const [form, setForm] = useState({
    // Personal
    full_name:'', preferred_name:'', dob:'', gender:'', nationality:'', ni_number:'',
    // Address
    address_line1:'', address_line2:'', city:'', postcode:'', personal_email:'', personal_phone:'',
    // Employment
    job_title:'', department:'', start_date:'', contract_type:'', hours_per_week:'', manager_name:'', manager_email:'', work_location:'', company_portal_confirmed:false,
    // Emergency
    emergency_name:'', emergency_relationship:'', emergency_phone:'', emergency_email:'',
    // Bank
    bank_name:'', account_name:'', sort_code:'', account_number:'', payment_frequency:'Monthly',
    // RTW
    rtw_type:'', rtw_document_url:'', rtw_expiry:'', rtw_notes:'',
    // Contract
    contract_signed:false, handbook_read:false, data_consent:false, photo_url:'', additional_notes:'',
  })

  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const ssf = (k, v) => setStarterForm((current) => {
    const next = { ...current, [k]: v }
    if (k === 'full_name') {
      const suggested = suggestWorkEmail(v)
      if (!current.work_email || current.work_email === suggestWorkEmail(current.full_name)) {
        next.work_email = suggested
      }
    }
    if (k === 'manager_email') {
      const selectedManager = starterManagers.find((item) => item.email === normalizeEmail(v))
      next.manager_name = selectedManager?.name || ''
      next.manager_phone = selectedManager?.phone || ''
    }
    if (k === 'department') {
      const selectedDepartment = starterDepartments.find((item) => item.name === v)
      if (selectedDepartment?.manager_email) {
        const selectedManager = starterManagers.find((item) => item.email === normalizeEmail(selectedDepartment.manager_email))
        next.manager_email = selectedDepartment.manager_email
        next.manager_name = selectedManager?.name || selectedDepartment.manager_name || ''
        next.manager_phone = selectedManager?.phone || ''
      }
    }
    if (k === 'job_title') {
      const roleMatch = starterRoles.find((role) => role.title === v)
      if (roleMatch?.contractType) next.contract_type = roleMatch.contractType
      const nextContractType = roleMatch?.contractType || current.contract_type || next.contract_type
      const matchedTemplate = starterContractTemplates.find((template) => {
        const templateName = String(template.name || '').trim().toLowerCase()
        const templateType = String(template.contract_type || '').trim().toLowerCase()
        const roleTitle = String(v || '').trim().toLowerCase()
        const roleType = String(nextContractType || '').trim().toLowerCase()
        return (templateName && templateName === roleTitle) || (templateType && templateType === roleType)
      }) || starterContractTemplates.find((template) => String(template.contract_type || '').trim().toLowerCase() === String(nextContractType || '').trim().toLowerCase()) || null
      next.contract_template_id = matchedTemplate?.id || ''
    }
    if (k === 'contract_template_id') {
      const template = starterContractTemplates.find((item) => item.id === v)
      if (template?.contract_type) next.contract_type = template.contract_type
    }
    return next
  })

  const managedDepartmentKeys = managedDepartments.map((department) => String(department || '').trim().toLowerCase()).filter(Boolean)

  useEffect(() => { load() }, [user?.email, isReviewer, canSeeAllSubmissions, managedDepartmentKeys.join('|')])

  useEffect(() => {
    if (!user?.email) return undefined

    const channel = supabase
      .channel(`hr-onboarding-${normalizeEmail(user.email)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'onboarding_submissions' }, () => {
        load()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_settings' }, (payload) => {
        const key = payload.new?.key || payload.old?.key || ''
        if (key.startsWith('onboarding_payload:') || key.startsWith('staff_org:') || key.startsWith('staff_contract:')) {
          load()
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.email, isReviewer, canSeeAllSubmissions, managedDepartmentKeys.join('|')])

  useEffect(() => {
    if (!viewSub) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [viewSub])

  const load = async () => {
    setLoading(true)
    const currentEmail = normalizeEmail(user?.email || '')
    const [
      { data: all },
      { data: mine },
      { data: profileRows },
      { data: orgSetting },
      { data: payloadSettings },
      { data: contractSettings },
      { data: reviewerProfiles },
      { data: departmentCatalogSetting },
      { data: permissionRows },
      { data: contractTemplateSettings },
    ] = await Promise.all([
      isReviewer ? supabase.from('onboarding_submissions').select('*').order('submitted_at', { ascending:false }) : Promise.resolve({ data:[] }),
      supabase.from('onboarding_submissions').select('*').ilike('user_email', currentEmail).maybeSingle(),
      supabase.from('hr_profiles').select('*').ilike('user_email', currentEmail),
      supabase.from('portal_settings').select('value').eq('key', buildStaffOrgKey(currentEmail)).maybeSingle(),
      supabase.from('portal_settings').select('key,value').like('key', 'onboarding_payload:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_contract:%'),
      isReviewer ? supabase.from('hr_profiles').select('user_email,full_name,phone,role,department,contract_type,manager_name,manager_email').order('full_name') : Promise.resolve({ data:[] }),
      isReviewer ? supabase.from('portal_settings').select('value').eq('key', 'department_catalog').maybeSingle() : Promise.resolve({ data:null }),
      isReviewer ? supabase.from('user_permissions').select('user_email,permissions,onboarding') : Promise.resolve({ data:[] }),
      isReviewer ? supabase.from('portal_settings').select('key,value').like('key', 'contract_template:%') : Promise.resolve({ data:[] }),
    ])
    const profile = Array.isArray(profileRows) ? profileRows[0] || {} : (profileRows || {})
    const orgRecord = mergeOrgRecord(orgSetting?.value?.value ?? orgSetting?.value ?? {}, {
      email: currentEmail,
      department: profile?.department,
    })
    setEmploymentContext({
      department: profile?.department || orgRecord.department || '',
      manager_name: profile?.manager_name || orgRecord.reports_to_name || '',
      manager_email: profile?.manager_email || orgRecord.reports_to_email || '',
      role_scope: orgRecord.role_scope || 'staff',
      job_title: profile?.role || '',
      contract_type: profile?.contract_type || '',
      start_date: profile?.start_date || '',
    })

    const payloadMap = Object.fromEntries((payloadSettings || []).map((row) => [
      String(row.key || '').replace('onboarding_payload:', '').toLowerCase(),
      row.value?.value ?? row.value ?? {},
    ]))
    if (isReviewer) {
      const permissionMap = {}
      ;(permissionRows || []).forEach((row) => {
        permissionMap[normalizeEmail(row.user_email)] = row
      })
      const managerList = (reviewerProfiles || [])
        .map((row) => {
          const safeEmail = normalizeEmail(row.user_email)
          return {
            email: safeEmail,
            name: row.full_name || safeEmail,
            phone: row.phone || '',
            department: row.department || '',
            isManager: !!row.manager_name || !!row.manager_email || permissionMap[safeEmail]?.permissions?.my_team === true || permissionMap[safeEmail]?.permissions?.my_department === true || permissionMap[safeEmail]?.permissions?.staff === true,
          }
        })
        .filter((row) => row.email)
      setStarterManagers(managerList.filter((row) => row.isManager).sort((a, b) => a.name.localeCompare(b.name)))

      const departmentCatalog = Array.isArray(departmentCatalogSetting?.value?.value ?? departmentCatalogSetting?.value ?? null)
        ? (departmentCatalogSetting?.value?.value ?? departmentCatalogSetting?.value ?? [])
        : []
      const departmentOptions = departmentCatalog
        .filter((item) => item?.active !== false && item?.name)
        .map((item) => ({
          name: item.name,
          manager_email: normalizeEmail(item.manager_email || ''),
          manager_name: item.manager_name || '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
      setStarterDepartments(departmentOptions)

      const roleOptions = [...new Map(
        (reviewerProfiles || [])
          .filter((row) => String(row.role || '').trim())
          .map((row) => {
            const title = String(row.role || '').trim()
            return [title.toLowerCase(), {
              title,
              contractType: String(row.contract_type || '').trim(),
              department: String(row.department || '').trim(),
            }]
          })
      ).values()].sort((a, b) => a.title.localeCompare(b.title))
      setStarterRoles(roleOptions)

      const templates = (contractTemplateSettings || [])
        .map((row) => createContractTemplate({
          id: String(row.key || '').replace('contract_template:', ''),
          ...(row.value?.value ?? row.value ?? {}),
        }))
        .filter((item) => item.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name))
      setStarterContractTemplates(templates)
    }
    const summaryEmailSet = new Set((all || []).map((submission) => normalizeEmail(submission.user_email)))
    const orphanPayloads = Object.entries(payloadMap)
      .filter(([email, payload]) => email && !summaryEmailSet.has(email) && payload?.status && payload.status !== 'draft')
      .map(([, payload]) => buildSubmissionRow(payload))
    const currentContract = (contractSettings || [])
      .map((row) => createStaffContract({
        id: String(row.key || '').replace('staff_contract:', ''),
        ...(row.value?.value ?? row.value ?? {}),
      }))
      .filter((item) => item.staff_email === currentEmail)
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())[0] || null
    setStaffContract(currentContract)
    setContractMessage('')
    if (orphanPayloads.length) {
      Promise.allSettled(orphanPayloads.map((payloadRow) => ensureSubmissionSummary(payloadRow)))
        .then(() => {})
        .catch((error) => console.error('Onboarding repair sync failed:', error))
    }

    const mergedAll = dedupeSubmissions([...(all || []), ...orphanPayloads])
      .map((submission) => mergeSubmissionWithPayload(submission, payloadMap[normalizeEmail(submission.user_email)] || {}))
    const currentReviewerEmail = normalizeEmail(user?.email || '')
    const managedDepartmentSet = new Set(managedDepartmentKeys)
    const visibleSubmissions = mergedAll.filter((submission) => {
      if (canSeeAllSubmissions) return true
      const submissionDepartment = String(submission.department || '').trim().toLowerCase()
      const submissionManagerEmail = normalizeEmail(submission.manager_email || '')
      const inManagedDepartment = !!submissionDepartment && managedDepartmentSet.has(submissionDepartment)
      const assignedToCurrentManager = !!submissionManagerEmail && submissionManagerEmail === currentReviewerEmail
      return inManagedDepartment || assignedToCurrentManager
    })
    setSubmissions(visibleSubmissions)
    const mergedMine = mine ? mergeSubmissionWithPayload(mine, payloadMap[currentEmail] || {}) : null
    const recoveredMine = !mergedMine && payloadMap[currentEmail]?.status && payloadMap[currentEmail]?.status !== 'draft'
      ? mergeSubmissionWithPayload(buildSubmissionRow(payloadMap[currentEmail]), payloadMap[currentEmail])
      : null
    if (mergedMine || recoveredMine) {
      const activeSubmission = mergedMine || recoveredMine
      setMy(activeSubmission)
      // Pre-fill form from existing submission
      const saved = { ...form }
      Object.keys(saved).forEach(k => { if (activeSubmission[k] !== undefined && activeSubmission[k] !== null) saved[k] = activeSubmission[k] })
      if (currentContract?.status === 'completed') saved.contract_signed = true
      setForm(saved)
    }
    else {
      setForm((current) => ({
        ...current,
        job_title: profile?.role || current.job_title,
        department: profile?.department || orgRecord.department || current.department,
        start_date: profile?.start_date || current.start_date,
        contract_type: profile?.contract_type || current.contract_type,
        manager_name: profile?.manager_name || orgRecord.reports_to_name || current.manager_name,
        manager_email: profile?.manager_email || orgRecord.reports_to_email || current.manager_email,
        contract_signed: currentContract?.status === 'completed' ? true : current.contract_signed,
      }))
    }
    setLoading(false)
  }

  const resetStarterForm = () => {
    setStarterForm({
      full_name: '',
      personal_email: '',
      work_email: '',
      temp_password: '',
      job_title: '',
      department: '',
      start_date: '',
      contract_type: 'Permanent',
      contract_template_id: '',
      manager_name: '',
      manager_email: '',
      manager_phone: '',
      notes: '',
    })
    setStarterPreview(null)
    setStarterProvisioningResult(null)
  }

  const validateStarterForm = () => {
    const required = [
      ['full_name', 'Full name'],
      ['personal_email', 'Personal email'],
      ['work_email', 'Work email'],
      ['temp_password', 'Temporary password'],
      ['job_title', 'Job title'],
      ['department', 'Department'],
      ['start_date', 'Start date'],
      ['manager_email', 'Manager'],
    ]
    const missing = required.find(([key]) => !String(starterForm[key] || '').trim())
    if (missing) throw new Error(`${missing[1]} is required.`)
    if (!String(starterForm.personal_email).includes('@')) throw new Error('Personal email looks invalid.')
    if (!String(starterForm.work_email).includes('@')) throw new Error('Work email looks invalid.')
  }

  const buildStarterPayload = () => {
    const safeWorkEmail = normalizeEmail(starterForm.work_email)
    const safeManagerEmail = normalizeEmail(starterForm.manager_email)
    return {
      user_email: safeWorkEmail,
      user_name: starterForm.full_name.trim(),
      full_name: starterForm.full_name.trim(),
      preferred_name: '',
      personal_email: starterForm.personal_email.trim(),
      personal_phone: '',
      job_title: starterForm.job_title.trim(),
      department: starterForm.department.trim(),
      start_date: starterForm.start_date,
      contract_type: starterForm.contract_type.trim(),
      hours_per_week: '',
      manager_name: starterForm.manager_name.trim(),
      manager_email: safeManagerEmail,
      manager_phone: starterForm.manager_phone.trim(),
      work_location: '',
      company_portal_confirmed: false,
      emergency_name: '',
      emergency_relationship: '',
      emergency_phone: '',
      emergency_email: '',
      bank_name: '',
      account_name: '',
      sort_code: '',
      account_number: '',
      payment_frequency: 'Monthly',
      rtw_type: '',
      rtw_document_url: '',
      rtw_expiry: null,
      rtw_notes: '',
      contract_signed: false,
      handbook_read: false,
      data_consent: false,
      photo_url: '',
      additional_notes: starterForm.notes.trim(),
      status: 'draft',
      submitted_at: null,
    }
  }

  const createStarterRecords = async () => {
    validateStarterForm()

    const now = new Date().toISOString()
    const starterPayload = buildStarterPayload()
    const safeWorkEmail = normalizeEmail(starterForm.work_email)
    const orgRecord = mergeOrgRecord({
      email: safeWorkEmail,
      role_scope: 'staff',
      department: starterForm.department.trim(),
      reports_to_name: starterForm.manager_name.trim(),
      reports_to_email: normalizeEmail(starterForm.manager_email),
      notes: starterForm.notes.trim(),
    }, {
      email: safeWorkEmail,
      department: starterForm.department.trim(),
    })

    const lifecycleRecord = {
      state: 'onboarding',
      contract_type: starterForm.contract_type.trim(),
      notes: starterForm.notes.trim(),
      updated_at: now,
      updated_by_email: normalizeEmail(user?.email || ''),
      updated_by_name: user?.name || user?.email || 'DH Portal',
    }

    const starterResults = await Promise.all([
      ensureSubmissionSummary(starterPayload),
      supabase.from('portal_settings').upsert({
        key: buildOnboardingPayloadKey(safeWorkEmail),
        value: { value: starterPayload },
      }, { onConflict: 'key' }),
      supabase.from('portal_settings').upsert({
        key: buildStaffOrgKey(safeWorkEmail),
        value: { value: orgRecord },
      }, { onConflict: 'key' }),
      supabase.from('portal_settings').upsert({
        key: buildLifecycleSettingKey(safeWorkEmail),
        value: { value: lifecycleRecord },
      }, { onConflict: 'key' }),
      upsertEmailScopedRow('hr_profiles', safeWorkEmail, {
        user_email: safeWorkEmail,
        full_name: starterForm.full_name.trim(),
        role: starterForm.job_title.trim(),
        department: starterForm.department.trim(),
        contract_type: starterForm.contract_type.trim(),
        start_date: starterForm.start_date,
        personal_email: starterForm.personal_email.trim(),
        manager_name: starterForm.manager_name.trim(),
        manager_email: normalizeEmail(starterForm.manager_email),
        hr_notes: starterForm.notes.trim(),
        updated_at: now,
      }),
      upsertEmailScopedRow('user_permissions', safeWorkEmail, {
        permissions: { ...STARTER_PERMISSION_DEFAULTS },
        onboarding: true,
        bookable_staff: false,
        updated_at: now,
      }),
    ])
    starterResults.forEach((result, index) => {
      assertSupabaseOk(result, [
        'Onboarding summary save failed',
        'Onboarding payload save failed',
        'Staff org save failed',
        'Lifecycle save failed',
        'HR profile save failed',
        'Permission save failed',
      ][index] || 'New starter save failed')
    })

    const activeTemplate = starterContractTemplates.find((item) => item.id === starterForm.contract_template_id)
    if (activeTemplate) {
      const contractProfile = {
        full_name: starterForm.full_name.trim(),
        role: starterForm.job_title.trim(),
        department: starterForm.department.trim(),
        contract_type: starterForm.contract_type.trim(),
        start_date: starterForm.start_date,
        manager_name: starterForm.manager_name.trim(),
        manager_email: normalizeEmail(starterForm.manager_email),
      }
      const contractOrg = mergeOrgRecord({
        email: safeWorkEmail,
        role_scope: 'staff',
        department: starterForm.department.trim(),
        reports_to_name: starterForm.manager_name.trim(),
        reports_to_email: normalizeEmail(starterForm.manager_email),
      }, { email: safeWorkEmail, department: starterForm.department.trim() })
      const managerSignature = createPortalSignature({
        name: user?.name || normalizeEmail(user?.email || ''),
        title: activeTemplate.manager_title_default || 'Director',
        email: normalizeEmail(user?.email || ''),
      })
      const contract = createStaffContract({
        template_id: activeTemplate.id,
        template_name: activeTemplate.name,
        contract_type: activeTemplate.contract_type || starterForm.contract_type.trim(),
        subject: activeTemplate.subject || 'Employment contract',
        staff_email: safeWorkEmail,
        staff_name: starterForm.full_name.trim(),
        staff_role: starterForm.job_title.trim(),
        staff_department: starterForm.department.trim(),
        manager_email: normalizeEmail(starterForm.manager_email),
        manager_name: starterForm.manager_name.trim(),
        manager_title: activeTemplate.manager_title_default || 'Director',
        status: 'awaiting_staff_signature',
        notes: starterForm.notes.trim(),
        merge_fields: buildContractMergeFields({
          profile: contractProfile,
          orgRecord: contractOrg,
          template: activeTemplate,
          managerTitle: activeTemplate.manager_title_default || 'Director',
          staffEmail: safeWorkEmail,
        }),
        template_html: activeTemplate.content_html,
        template_reference_file_url: activeTemplate.reference_file_url,
        template_reference_file_path: activeTemplate.reference_file_path,
        template_reference_file_name: activeTemplate.reference_file_name,
        manager_signature: managerSignature,
        issued_at: managerSignature.signed_at,
        manager_signed_at: managerSignature.signed_at,
        updated_at: now,
        created_at: now,
      })
      await supabase.from('portal_settings').upsert({
        key: buildStaffContractKey(contract.id),
        value: { value: contract },
      }, { onConflict: 'key' })
    }

    return starterPayload
  }

  const previewStarterEmail = async () => {
    try {
      validateStarterForm()
      const emailContent = buildStarterEmailContent(starterForm)
      setStarterPreview(emailContent)
      setStarterMessage('')
    } catch (error) {
      setStarterMessage(error.message || 'Could not build the welcome email preview.')
    }
  }

  const loadStarterGuideAttachment = async () => {
    const response = await fetch('/starter-guides/dh-sales-onboarding.pdf')
    if (!response.ok) {
      throw new Error('Could not load the onboarding guide attachment.')
    }
    const arrayBuffer = await response.arrayBuffer()
    return {
      filename: 'DH Sales Onboarding.pdf',
      content: fileToBase64(arrayBuffer),
      type: 'application/pdf',
      disposition: 'attachment',
    }
  }

  const createMicrosoftStarterAccount = async () => {
    const response = await fetch(MICROSOFT_ACCOUNT_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: starterForm.full_name.trim(),
        userPrincipalName: normalizeEmail(starterForm.work_email),
        password: starterForm.temp_password,
        department: starterForm.department.trim(),
        jobTitle: starterForm.job_title.trim(),
        managerEmail: normalizeEmail(starterForm.manager_email),
      }),
    })

    const result = await response.json().catch(() => null)
    if (!response.ok || result?.error) {
      throw new Error(result?.error || 'Microsoft account creation failed.')
    }
    setStarterProvisioningResult(result)
    return result
  }

  const createStarter = async ({ sendWelcomeEmail = false } = {}) => {
    setStarterBusy(true)
    setStarterMessage('')
    try {
      if (starterProvisioningEnabled) {
        await createMicrosoftStarterAccount()
      }
      await createStarterRecords()

      if (sendWelcomeEmail) {
        const emailContent = buildStarterEmailContent(starterForm)
        const guideAttachment = await loadStarterGuideAttachment()
        const result = await sendEmail('custom_email', {
          to: starterForm.personal_email.trim(),
          cc: [normalizeEmail(starterForm.work_email)],
          to_name: starterForm.full_name.trim(),
          from_email: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          attachments: [guideAttachment],
          sent_by: user?.name || user?.email || 'DH Portal',
          sent_by_email: normalizeEmail(user?.email || ''),
          log_email: true,
          log_body: emailContent.text,
        })
        if (!result?.ok) {
          throw new Error(result?.error || 'Welcome email failed to send.')
        }
      }

      await load()
      setStarterPreview(null)
      setStarterMessage(
        sendWelcomeEmail
          ? `New starter created${starterProvisioningEnabled ? ', Microsoft 365 account provisioned,' : ''} and welcome email sent.`
          : `New starter created${starterProvisioningEnabled ? ' and Microsoft 365 account provisioned' : ''}. Welcome email has not been sent yet.`
      )
      resetStarterForm()
    } catch (error) {
      console.error('Starter setup failed:', error)
      setStarterMessage(error.message || 'Could not create the starter record.')
    } finally {
      setStarterBusy(false)
    }
  }

  const uploadRTW = async (file) => {
    if (!file) return
    setRtwUploading(true)
    setRtwUploadError('')
    setRtwUploadName(file.name)
    const path = `rtw/${normalizeEmail(user.email)}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('hr-documents').upload(path, file)
    if (!error) {
      const { data } = supabase.storage.from('hr-documents').getPublicUrl(path)
      sf('rtw_document_url', data.publicUrl)
    } else {
      setRtwUploadError(error.message || 'Could not upload the right-to-work document.')
      setRtwUploadName('')
    }
    setRtwUploading(false)
  }

  const openContractReferenceFile = async () => {
    try {
      await openSecureDocument({
        bucket: 'hr-documents',
        filePath: staffContract?.template_reference_file_path,
        fallbackUrl: staffContract?.template_reference_file_url,
        userEmail: user?.email || '',
        userName: user?.name || '',
        action: 'onboarding_contract_reference_opened',
        entity: 'staff_contract',
        entityId: staffContract?.id || '',
        details: {
          template_name: staffContract?.template_name || '',
          staff_email: normalizeEmail(user?.email || ''),
        },
      })
    } catch (error) {
      setContractMessage(error.message || 'Could not open the attached template file.')
    }
  }

  const openSignedContractFile = async () => {
    try {
      await openSecureDocument({
        bucket: 'hr-documents',
        filePath: staffContract?.final_document_path,
        fallbackUrl: staffContract?.final_document_url,
        userEmail: user?.email || '',
        userName: user?.name || '',
        action: 'onboarding_signed_contract_opened',
        entity: 'staff_contract',
        entityId: staffContract?.id || '',
        details: {
          template_name: staffContract?.template_name || '',
          staff_email: normalizeEmail(user?.email || ''),
        },
      })
    } catch (error) {
      setContractMessage(error.message || 'Could not open the signed contract PDF.')
    }
  }

  const signContract = async () => {
    if (!staffContract || staffContract.status !== 'awaiting_staff_signature') return
    setContractSigning(true)
    setContractMessage('')
    try {
      const normalizedEmail = normalizeEmail(user?.email || '')
      const staffSignature = createPortalSignature({
        name: form.full_name || user?.name || normalizedEmail,
        title: 'Staff member',
        email: normalizedEmail,
      })
      const now = new Date().toISOString()
      const completedContract = createStaffContract({
        ...staffContract,
        staff_name: form.full_name || staffContract.staff_name || user?.name || normalizedEmail,
        staff_role: form.job_title || employmentContext.job_title || staffContract.staff_role,
        staff_department: form.department || employmentContext.department || staffContract.staff_department,
        merge_fields: {
          ...(staffContract.merge_fields || {}),
          staff_name: form.full_name || staffContract.staff_name || user?.name || normalizedEmail,
          staff_role: form.job_title || employmentContext.job_title || staffContract.staff_role,
          staff_department: form.department || employmentContext.department || staffContract.staff_department,
        },
        staff_signature: staffSignature,
        staff_signed_at: staffSignature.signed_at,
        status: 'completed',
        completed_at: now,
        updated_at: now,
      })

      const pdfBlob = await buildContractPdfBlob(completedContract)
      const fileName = buildContractFileName(completedContract)
      const filePath = `contracts/${normalizedEmail}/${Date.now()}-${fileName}`
      const { error: uploadError } = await supabase.storage.from('hr-documents').upload(filePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: false,
      })
      if (uploadError) throw uploadError
      const { data: publicUrlData } = supabase.storage.from('hr-documents').getPublicUrl(filePath)

      const finalizedContract = createStaffContract({
        ...completedContract,
        final_document_path: filePath,
        final_document_url: publicUrlData.publicUrl,
      })

      const [{ error: contractError }, { error: docError }, { error: payloadError }] = await Promise.all([
        supabase
          .from('portal_settings')
          .upsert({
            key: buildStaffContractKey(finalizedContract.id),
            value: { value: finalizedContract },
          }, { onConflict: 'key' }),
        supabase
          .from('staff_documents')
          .insert([{
            staff_email: normalizedEmail,
            name: `${finalizedContract.template_name || finalizedContract.contract_type || 'Employment Contract'}.pdf`,
            type: 'Contract',
            file_url: publicUrlData.publicUrl,
            file_path: filePath,
            uploaded_by: 'Onboarding signature',
            created_at: now,
          }]),
        supabase
          .from('portal_settings')
          .upsert({
            key: buildOnboardingPayloadKey(normalizedEmail),
            value: {
              value: {
                ...(mySubmission || {}),
                ...form,
                contract_signed: true,
              },
            },
          }, { onConflict: 'key' }),
      ])
      if (contractError) throw contractError
      if (docError) throw docError
      if (payloadError) throw payloadError

      await sendManagedNotification({
        userEmail: normalizedEmail,
        userName: form.full_name || user?.name || normalizedEmail,
        category: 'hr',
        type: 'success',
        title: 'Signed contract complete',
        message: `Your ${finalizedContract.template_name || 'contract'} has been signed and stored in DH Portal.`,
        link: finalizedContract.final_document_url || '/my-profile',
        emailSubject: `${finalizedContract.template_name || 'Employment contract'} — signed copy`,
        emailHtml: `
          <p>Hi ${(form.full_name || user?.name || normalizedEmail).split(' ')[0] || 'there'},</p>
          <p>Your contract has now been fully signed.</p>
          <p><a href="${finalizedContract.final_document_url}" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open signed PDF</a></p>
        `,
        sentBy: user?.name || user?.email || 'DH Portal',
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        forceImportant: true,
      }).catch(() => {})

      const issuingManagerEmail = normalizeEmail(finalizedContract.manager_signature?.email || finalizedContract.manager_email || '')
      const issuingManagerName = finalizedContract.manager_signature?.name || finalizedContract.manager_name || issuingManagerEmail
      if (issuingManagerEmail) {
        await sendManagedNotification({
          userEmail: issuingManagerEmail,
          userName: issuingManagerName,
          category: 'hr',
          type: 'success',
          title: 'Staff contract signed',
          message: `${finalizedContract.staff_name || normalizedEmail} has signed their contract. The final PDF is ready in DH Portal.`,
          link: finalizedContract.final_document_url || '/my-staff',
          emailSubject: `${finalizedContract.staff_name || normalizedEmail} — contract signed`,
          emailHtml: `
            <p>Hi ${(issuingManagerName).split(' ')[0] || 'there'},</p>
            <p>${finalizedContract.staff_name || normalizedEmail} has signed their contract.</p>
            <p><a href="${finalizedContract.final_document_url}" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open signed PDF</a></p>
          `,
          sentBy: user?.name || user?.email || 'DH Portal',
          fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
          forceImportant: true,
        }).catch(() => {})
      }

      setStaffContract(finalizedContract)
      setForm((current) => ({ ...current, contract_signed: true }))
      setContractMessage('Contract signed successfully. The final PDF has been stored and emailed.')
    } catch (error) {
      console.error('Contract sign failed:', error)
      setContractMessage(error.message || 'Could not sign the contract right now.')
    } finally {
      setContractSigning(false)
    }
  }

  const submit = async () => {
    setSaving(true)
    try {
      const normalizedEmail = normalizeEmail(user?.email || '')
      const payload = buildSubmissionPayload({ user, form, employmentContext, status: 'submitted' })
      const [, payloadResult] = await Promise.all([
        ensureSubmissionSummary(payload),
        supabase.from('portal_settings').upsert({
          key: buildOnboardingPayloadKey(normalizedEmail),
          value: { value: payload },
        }, { onConflict: 'key' }),
      ])
      if (payloadResult?.error) throw payloadResult.error

      await syncOnboardingSubmissionToHrProfile({
        ...payload,
        user_email: normalizedEmail,
        full_name: form.full_name || payload.user_name,
      })

      const reviewerTargets = payload.manager_email
        ? [{ email: normalizeEmail(payload.manager_email), name: payload.manager_name || payload.manager_email }]
        : [...DIRECTOR_EMAILS].map((directorEmail) => ({ email: directorEmail, name: directorEmail }))
      await Promise.allSettled(reviewerTargets.map((target) => sendManagedNotification({
        userEmail: target.email,
        userName: target.name,
        category: 'hr',
        type: 'warning',
        title: 'Onboarding approval required',
        message: `${form.full_name || payload.user_name || payload.user_email} has submitted onboarding for ${payload.department || 'their department'}.`,
        link: '/hr/onboarding',
        emailSubject: `Onboarding approval required — ${form.full_name || payload.user_name || payload.user_email}`,
        sentBy: user?.name || user?.email || 'DH Portal',
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        forceDelivery: 'both',
      })))
      await Promise.allSettled([...DIRECTOR_EMAILS].map((directorEmail) => sendManagedNotification({
        userEmail: directorEmail,
        userName: directorEmail,
        category: 'urgent',
        type: 'info',
        title: 'Onboarding submitted',
        message: `${form.full_name || payload.user_name || payload.user_email} has submitted onboarding and is waiting for department review.`,
        link: '/hr/onboarding',
        emailSubject: `Onboarding submitted — ${form.full_name || payload.user_name || payload.user_email}`,
        sentBy: user?.name || user?.email || 'DH Portal',
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        forceDelivery: 'both',
      })))
      await load()
    } catch (error) {
      console.error('Onboarding submit failed:', error)
      alert('Could not submit onboarding: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const saveDraft = async () => {
    setSaving(true)
    try {
      const payload = buildSubmissionPayload({ user, form, employmentContext, status: 'draft' })
      const [, payloadResult] = await Promise.all([
        ensureSubmissionSummary(payload),
        supabase.from('portal_settings').upsert({
          key: buildOnboardingPayloadKey(normalizeEmail(user?.email || '')),
          value: { value: payload },
        }, { onConflict: 'key' }),
      ])
      if (payloadResult?.error) throw payloadResult.error
      await load()
    } catch (error) {
      console.error('Onboarding draft save failed:', error)
      alert('Could not save onboarding draft: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const decide = async (email, status, notes='') => {
    const normalizedEmail = normalizeEmail(email)
    const targetSubmission = submissions.find((item) => normalizeEmail(item.user_email) === normalizedEmail)
    if (!targetSubmission) {
      alert('You do not have access to review this onboarding submission.')
      return
    }
    setAdminBusyEmail(normalizedEmail)
    setAdminMessage('')
    try {
      const updatedPayload = mergeSubmissionWithPayload(targetSubmission, {
        ...(submissions.find((item) => normalizeEmail(item.user_email) === normalizedEmail) || {}),
        status,
        admin_notes: notes,
        decided_by: user?.name || user?.email || '',
        decided_at: new Date().toISOString(),
      })
      const submission = await ensureSubmissionSummary(updatedPayload)
      if (!submission?.user_email) throw new Error('No onboarding submission was updated for this staff member.')
      const staffDisplayName = getOnboardingDisplayName(updatedPayload)
      const managerEmail = normalizeEmail(updatedPayload.manager_email || targetSubmission.manager_email || '')
      const managerName = updatedPayload.manager_name || targetSubmission.manager_name || managerEmail || 'Manager'
      const reopenedAfterApproval = targetSubmission.status === 'approved' && status === 'rejected'

      const { error: payloadError } = await supabase
        .from('portal_settings')
        .upsert({
          key: buildOnboardingPayloadKey(normalizedEmail),
          value: { value: updatedPayload },
        }, { onConflict: 'key' })
      if (payloadError) throw payloadError

      if (status === 'approved') {
        await syncOnboardingSubmissionToHrProfile({
          ...updatedPayload,
          full_name: updatedPayload.full_name || updatedPayload.user_name,
        }, { overwrite: true })
        const approvalResults = await Promise.all([
          upsertEmailScopedRow('user_permissions', normalizedEmail, {
            onboarding: false,
            updated_at: new Date().toISOString(),
          }),
          supabase.from('portal_settings').upsert({
            key: buildLifecycleSettingKey(normalizedEmail),
            value: {
              value: mergeLifecycleRecord({
                state: 'active',
                contract_type: updatedPayload.contract_type || targetSubmission.contract_type || '',
                notes: updatedPayload.admin_notes || '',
                updated_at: new Date().toISOString(),
                updated_by_email: normalizeEmail(user?.email || ''),
                updated_by_name: user?.name || user?.email || 'DH Portal',
              }),
            },
          }, { onConflict: 'key' }),
        ])
        approvalResults.forEach((result, index) => {
          assertSupabaseOk(result, index === 0 ? 'Permission update failed' : 'Lifecycle update failed')
        })
      } else if (status === 'rejected') {
        const rejectionResults = await Promise.all([
          upsertEmailScopedRow('user_permissions', normalizedEmail, {
            onboarding: true,
            updated_at: new Date().toISOString(),
          }),
          supabase.from('portal_settings').upsert({
            key: buildLifecycleSettingKey(normalizedEmail),
            value: {
              value: mergeLifecycleRecord({
                state: 'onboarding',
                contract_type: updatedPayload.contract_type || targetSubmission.contract_type || '',
                notes: notes || updatedPayload.admin_notes || '',
                updated_at: new Date().toISOString(),
                updated_by_email: normalizeEmail(user?.email || ''),
                updated_by_name: user?.name || user?.email || 'DH Portal',
              }, { onboarding: true }),
            },
          }, { onConflict: 'key' }),
        ])
        rejectionResults.forEach((result, index) => {
          assertSupabaseOk(result, index === 0 ? 'Permission update failed' : 'Lifecycle update failed')
        })
      }

      await Promise.allSettled([
        sendManagedNotification({
          userEmail: normalizedEmail,
          userName: staffDisplayName,
          category: 'hr',
          type: status === 'approved' ? 'success' : 'warning',
          title: status === 'approved'
            ? 'Onboarding approved'
            : reopenedAfterApproval
              ? 'Onboarding reopened'
              : 'Onboarding update',
          message: status === 'approved'
            ? 'Your onboarding has been approved. You can now continue into the portal.'
            : reopenedAfterApproval
              ? `Your onboarding has been sent back for changes${notes ? `. Notes: ${notes}` : '.'}`
              : `Your onboarding has been declined${notes ? `. Notes: ${notes}` : '.'}`,
          link: '/hr/onboarding',
          emailSubject: status === 'approved'
            ? 'Onboarding approved — DH Website Services'
            : reopenedAfterApproval
              ? 'Onboarding reopened — action required'
              : 'Onboarding update — DH Website Services',
          sentBy: user?.name || user?.email || 'DH Portal',
          fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
          forceDelivery: 'both',
        }),
        managerEmail
          ? sendManagedNotification({
            userEmail: managerEmail,
            userName: managerName,
            category: 'hr',
            type: status === 'approved' ? 'info' : 'warning',
            title: status === 'approved'
              ? 'Onboarding approved'
              : reopenedAfterApproval
                ? 'Approved onboarding reopened'
                : 'Onboarding declined',
            message: status === 'approved'
              ? `${staffDisplayName}'s onboarding has been approved.`
              : reopenedAfterApproval
                ? `${staffDisplayName}'s approved onboarding has been sent back for changes${notes ? `. Notes: ${notes}` : '.'}`
                : `${staffDisplayName}'s onboarding has been declined${notes ? `. Notes: ${notes}` : '.'}`,
            link: '/hr/onboarding',
            emailSubject: status === 'approved'
              ? `Onboarding approved — ${staffDisplayName}`
              : reopenedAfterApproval
                ? `Onboarding reopened — ${staffDisplayName}`
                : `Onboarding declined — ${staffDisplayName}`,
            sentBy: user?.name || user?.email || 'DH Portal',
            fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
            forceDelivery: 'both',
          })
          : Promise.resolve(),
      ])

      setSubmissions((current) =>
        current.map((item) =>
          normalizeEmail(item.user_email) === normalizedEmail
            ? mergeSubmissionWithPayload(item, updatedPayload)
            : item
        )
      )
      if (viewSub && normalizeEmail(viewSub.user_email) === normalizedEmail) {
        setViewSub(mergeSubmissionWithPayload(viewSub, updatedPayload))
      } else {
        setViewSub(null)
      }
      setAdminMessage(
        status === 'approved'
          ? 'Onboarding approved successfully.'
          : reopenedAfterApproval
            ? 'Approved onboarding sent back for changes.'
            : 'Onboarding marked as rejected.'
      )
    } catch (err) {
      console.error('Onboarding decision failed:', err)
      alert('Onboarding update failed: ' + (err.message || 'Unknown error'))
    } finally {
      setAdminBusyEmail('')
    }
  }

  const removeSubmission = async (email) => {
    const normalizedEmail = normalizeEmail(email)
    const confirmed = confirm(`Remove the onboarding record for ${normalizedEmail}? This only clears the onboarding submission from the queue.`)
    if (!confirmed) return

    setAdminBusyEmail(normalizedEmail)
    setAdminMessage('')
    try {
      const [{ error }, { error: payloadError }] = await Promise.all([
        supabase
          .from('onboarding_submissions')
          .delete()
          .ilike('user_email', normalizedEmail),
        supabase
          .from('portal_settings')
          .delete()
          .eq('key', buildOnboardingPayloadKey(normalizedEmail)),
      ])

      if (error) throw error
      if (payloadError) throw payloadError

      setSubmissions((current) => current.filter((item) => normalizeEmail(item.user_email) !== normalizedEmail))
      if (viewSub && normalizeEmail(viewSub.user_email) === normalizedEmail) {
        setViewSub(null)
      }
      setAdminMessage('Onboarding record removed from the queue.')
    } catch (err) {
      console.error('Onboarding removal failed:', err)
      alert('Could not remove onboarding record: ' + (err.message || 'Unknown error'))
    } finally {
      setAdminBusyEmail('')
    }
  }

  const completionPct = () => {
    return completionForSubmission(form)
  }

  const pct = completionPct()
  const contractRequirementMet = !!staffContract && (staffContract.status === 'completed' || !!form.contract_signed)
  const contractStatusLabel = staffContract ? getContractStatusLabel(staffContract.status) : null
  const adminSummary = isReviewer
    ? (() => {
        const submitted = submissions.filter((item) => item.status === 'submitted').length
        const drafts = submissions.filter((item) => item.status === 'draft').length
        const approved = submissions.filter((item) => item.status === 'approved').length
        const rejected = submissions.filter((item) => item.status === 'rejected').length
        const stale = submissions.filter((item) => ['draft', 'submitted', 'in_progress'].includes(item.status)).filter((item) => {
          const sourceDate = item.submitted_at || item.updated_at || item.created_at
          if (!sourceDate) return false
          return (Date.now() - new Date(sourceDate).getTime()) / 86400000 >= 7
        }).length
        const expiringDocs = submissions.filter((item) => {
          const remaining = daysUntil(item.rtw_expiry)
          return remaining !== null && remaining >= 0 && remaining <= 45
        }).length
        return { submitted, drafts, approved, rejected, stale, expiringDocs }
      })()
    : null

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Onboarding</h1><p className="page-sub">Staff onboarding forms and submissions</p></div>
      </div>

      {/* Admin panel */}
      {isReviewer && (
        <div className="dashboard-stat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(6, minmax(0,1fr))', gap:14, marginBottom:20 }}>
          <div className="stat-card"><div className="stat-val">{submissions.length}</div><div className="stat-lbl">Total submissions</div></div>
          <div className="stat-card"><div className="stat-val">{adminSummary.submitted}</div><div className="stat-lbl">Awaiting review</div></div>
          <div className="stat-card"><div className="stat-val">{adminSummary.drafts}</div><div className="stat-lbl">Drafts</div></div>
          <div className="stat-card"><div className="stat-val">{adminSummary.approved}</div><div className="stat-lbl">Approved</div></div>
          <div className="stat-card"><div className="stat-val">{adminSummary.stale}</div><div className="stat-lbl">Stale 7+ days</div></div>
          <div className="stat-card"><div className="stat-val">{adminSummary.expiringDocs}</div><div className="stat-lbl">RTW expiring soon</div></div>
        </div>
      )}

      {isReviewer && (
        <div className="card card-pad" style={{ marginBottom:24 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-start', marginBottom:18, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--faint)', marginBottom:8 }}>
                New starter
              </div>
              <div style={{ fontSize:24, fontWeight:600, color:'var(--text)' }}>Create portal onboarding and preview the welcome email</div>
              <div style={{ marginTop:8, fontSize:14, color:'var(--sub)', lineHeight:1.7, maxWidth:760 }}>
                This sets up the HR profile, onboarding draft, role defaults, and lifecycle state for a new starter. Microsoft 365 account creation still needs to be completed separately in admin before they can sign in.
              </div>
            </div>
            <div style={{ padding:'10px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)', minWidth:220 }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>Technical contact</div>
              <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6 }}>
                David Hooper<br />
                <a href="mailto:mgmt@dhwebsiteservices.co.uk">mgmt@dhwebsiteservices.co.uk</a><br />
                07359587007
              </div>
            </div>
          </div>
          {starterMessage ? (
            <div style={{ marginBottom:16, padding:'11px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)', color:'var(--text)', fontSize:13.5 }}>
              {starterMessage}
            </div>
          ) : null}
          <label style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, fontSize:13.5, color:'var(--text)' }}>
            <input
              type="checkbox"
              checked={starterProvisioningEnabled}
              onChange={(e) => setStarterProvisioningEnabled(e.target.checked)}
              style={{ width:18, height:18, accentColor:'var(--accent)' }}
            />
            Create the Microsoft 365 account first using the work email and temporary password above.
          </label>
          {starterProvisioningResult?.user?.userPrincipalName ? (
            <div style={{ marginBottom:16, padding:'11px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--green-bg)', color:'var(--text)', fontSize:13.5 }}>
              Microsoft account ready: <strong>{starterProvisioningResult.user.userPrincipalName}</strong>
              {starterProvisioningResult.licenseAssigned ? ' · default licence assigned' : ''}
            </div>
          ) : null}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:14 }}>
            <div>
              <label className="lbl">Full name *</label>
              <input className="inp" value={starterForm.full_name} onChange={(e) => ssf('full_name', e.target.value)} placeholder="New starter full name" />
            </div>
            <div>
              <label className="lbl">Personal email *</label>
              <input className="inp" type="email" value={starterForm.personal_email} onChange={(e) => ssf('personal_email', e.target.value)} placeholder="Where the welcome email should go" />
            </div>
            <div>
              <label className="lbl">Work email *</label>
              <input className="inp" type="email" value={starterForm.work_email} onChange={(e) => ssf('work_email', e.target.value)} placeholder="staff.name@dhwebsiteservices.co.uk" />
            </div>
            <div>
              <label className="lbl">Temporary password *</label>
              <input className="inp" value={starterForm.temp_password} onChange={(e) => ssf('temp_password', e.target.value)} placeholder="Sent in the welcome email" />
            </div>
            <div>
              <label className="lbl">Job title *</label>
              <select className="inp" value={starterForm.job_title} onChange={(e) => ssf('job_title', e.target.value)}>
                <option value="">Select role title</option>
                {starterRoles.map((role) => <option key={role.title} value={role.title}>{role.title}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Department *</label>
              <select className="inp" value={starterForm.department} onChange={(e) => ssf('department', e.target.value)}>
                <option value="">Select department</option>
                {starterDepartments.map((department) => <option key={department.name} value={department.name}>{department.name}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Start date *</label>
              <input className="inp" type="date" value={starterForm.start_date} onChange={(e) => ssf('start_date', e.target.value)} />
            </div>
            <div>
              <label className="lbl">Contract type</label>
              <input className="inp" value={starterForm.contract_type} readOnly />
            </div>
            <div>
              <label className="lbl">Manager *</label>
              <select className="inp" value={starterForm.manager_email} onChange={(e) => ssf('manager_email', e.target.value)}>
                <option value="">Select manager</option>
                {starterManagers.map((manager) => <option key={manager.email} value={manager.email}>{manager.name}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Manager email</label>
              <input className="inp" type="email" value={starterForm.manager_email} readOnly />
            </div>
            <div>
              <label className="lbl">Manager phone</label>
              <input className="inp" value={starterForm.manager_phone} readOnly />
            </div>
            <div>
              <label className="lbl">Contract template</label>
              <select className="inp" value={starterForm.contract_template_id} onChange={(e) => ssf('contract_template_id', e.target.value)}>
                <option value="">No template matched</option>
                {starterContractTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </div>
            <div style={{ gridColumn:'1 / -1' }}>
              <label className="lbl">Internal notes</label>
              <textarea className="inp" rows={3} value={starterForm.notes} onChange={(e) => ssf('notes', e.target.value)} style={{ resize:'vertical' }} placeholder="Optional onboarding context, licence notes, or setup reminders." />
            </div>
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:18 }}>
            <button className="btn btn-outline" onClick={previewStarterEmail} disabled={starterBusy}>Preview welcome email</button>
            <button className="btn btn-ghost" onClick={() => createStarter({ sendWelcomeEmail: false })} disabled={starterBusy}>
              {starterBusy ? 'Saving...' : 'Create starter record'}
            </button>
            <button className="btn btn-primary" onClick={() => createStarter({ sendWelcomeEmail: true })} disabled={starterBusy}>
              {starterBusy ? 'Working...' : 'Create and send'}
            </button>
          </div>
        </div>
      )}

      {isReviewer && submissions.length > 0 && (
        <div className="card" style={{ overflow:'hidden', marginBottom:24 }}>
          <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--faint)' }}>
            Submissions ({submissions.length})
          </div>
          {adminMessage && (
            <div style={{ padding:'10px 18px', borderBottom:'1px solid var(--border)', fontSize:12.5, color:'var(--green)', background:'var(--green-bg)' }}>
              {adminMessage}
            </div>
          )}
          <table className="tbl">
            <thead><tr><th>Staff Member</th><th>Email</th><th>Submitted</th><th>Status</th><th>Completion</th><th></th></tr></thead>
            <tbody>
              {submissions.map(s => (
                <tr key={s.user_email}>
                  <td className="t-main">{s.user_name||s.full_name||'—'}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{s.user_email}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('en-GB') : 'Draft'}</td>
                  <td><span className={'badge badge-'+(s.status==='approved'?'green':s.status==='rejected'?'red':s.status==='submitted'?'amber':'grey')}>{s.status}</span></td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ flex:1, height:4, background:'var(--bg3)', borderRadius:2, overflow:'hidden', minWidth:60 }}>
                        <div style={{ height:'100%', background:'var(--accent)', borderRadius:2, width: `${completionForSubmission(s)}%` }}/>
                      </div>
                      {s.rtw_expiry ? (
                        <span className={`badge badge-${(() => {
                          const remaining = daysUntil(s.rtw_expiry)
                          if (remaining === null) return 'grey'
                          if (remaining <= 14) return 'red'
                          if (remaining <= 45) return 'amber'
                          return 'green'
                        })()}`}>
                          {(() => {
                            const remaining = daysUntil(s.rtw_expiry)
                            if (remaining === null) return 'RTW'
                            if (remaining < 0) return 'expired'
                            return `${remaining}d left`
                          })()}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setViewSub(s)}>Review</button>
                      {s.status==='submitted' && <>
                        <button className="btn btn-sm" style={{ background:'var(--green)', color:'#fff' }} disabled={adminBusyEmail === normalizeEmail(s.user_email)} onClick={() => decide(s.user_email,'approved')}>✓</button>
                        <button className="btn btn-danger btn-sm" disabled={adminBusyEmail === normalizeEmail(s.user_email)} onClick={() => decide(s.user_email,'rejected')}>✗</button>
                      </>}
                      <button className="btn btn-outline btn-sm" disabled={adminBusyEmail === normalizeEmail(s.user_email)} onClick={() => removeSubmission(s.user_email)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Staff form */}
      {!isReviewer && (!mySubmission || mySubmission.status === 'draft' || mySubmission.status === 'rejected') ? (
        <div className="staff-onboarding-shell">
          {mySubmission?.status === 'rejected' && (
            <div className="staff-onboarding-alert staff-onboarding-alert-error">
              <div>Your previous submission was rejected. Review the notes below, make the changes, and resubmit.</div>
              {mySubmission.admin_notes && <div><strong>Notes:</strong> {mySubmission.admin_notes}</div>}
            </div>
          )}

          <div className="staff-onboarding-layout">
            <aside className="staff-onboarding-hero">
              <div className="staff-onboarding-hero-copy">
                <span className="staff-onboarding-kicker">New starter setup</span>
                <h2>Welcome to DH Website Services, {user?.name?.split(' ')[0] || 'there'}.</h2>
                <p>
                  Complete your onboarding details, upload your right-to-work document, and sign your contract once it has been issued.
                </p>
              </div>
              <div className="staff-onboarding-hero-meta">
                <div>
                  <span>Account</span>
                  <strong>{user?.email || 'Work account'}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{mySubmission?.status === 'rejected' ? 'Needs revision' : 'In progress'}</strong>
                </div>
                <div>
                  <span>Approval flow</span>
                  <strong>Submitted to your assigned manager</strong>
                </div>
              </div>
            </aside>

            <div className="staff-onboarding-main">
              <div className="staff-onboarding-progress">
                <div className="staff-onboarding-progress-head">
                  <div>
                    <span>Form completion</span>
                    <strong>Step {step + 1} of {STEPS.length}</strong>
                  </div>
                  <strong className={pct === 100 ? 'is-complete' : ''}>{pct}%</strong>
                </div>
                <div className="staff-onboarding-progress-rail">
                  <div style={{ width:`${pct}%` }}/>
                </div>
              </div>

              <div className="staff-onboarding-step-nav" role="tablist" aria-label="Onboarding steps">
                {STEPS.map((s,i) => (
                  <button
                    key={s.key}
                    onClick={() => setStep(i)}
                    className={`staff-onboarding-step-chip ${step===i ? 'is-active' : ''}`}
                    type="button"
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="staff-onboarding-panel">
                <div className="staff-onboarding-panel-head">
                  <div>
                    <span>{STEPS[step].label}</span>
                    <h3>{STEP_INTRO[STEPS[step].key]?.title || STEPS[step].label}</h3>
                  </div>
                  <p>{STEP_INTRO[STEPS[step].key]?.description}</p>
                </div>
            {step === 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div className="fg">
                  <div><label className="lbl">Legal Full Name *</label><input className="inp" value={form.full_name} onChange={e=>sf('full_name',e.target.value)} placeholder="As on passport/ID"/></div>
                  <div><label className="lbl">Preferred Name</label><input className="inp" value={form.preferred_name} onChange={e=>sf('preferred_name',e.target.value)} placeholder="What you like to be called"/></div>
                  <div><label className="lbl">Date of Birth *</label><input className="inp" type="date" value={form.dob} onChange={e=>sf('dob',e.target.value)}/></div>
                  <div><label className="lbl">Gender</label>
                    <select className="inp" value={form.gender} onChange={e=>sf('gender',e.target.value)}>
                      <option value="">Prefer not to say</option>
                      {['Male','Female','Non-binary','Prefer to self-describe','Prefer not to say'].map(g=><option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div><label className="lbl">Nationality</label><input className="inp" value={form.nationality} onChange={e=>sf('nationality',e.target.value)} placeholder="e.g. British"/></div>
                  <div><label className="lbl">National Insurance Number *</label><input className="inp" value={form.ni_number} onChange={e=>sf('ni_number',e.target.value)} placeholder="AB 12 34 56 C" style={{ fontFamily:'var(--font-mono)' }}/></div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div className="fg">
                  <div className="fc"><label className="lbl">Address Line 1 *</label><input className="inp" value={form.address_line1} onChange={e=>sf('address_line1',e.target.value)} placeholder="House number and street"/></div>
                  <div className="fc"><label className="lbl">Address Line 2</label><input className="inp" value={form.address_line2} onChange={e=>sf('address_line2',e.target.value)} placeholder="Apartment, flat, etc."/></div>
                  <div><label className="lbl">City / Town *</label><input className="inp" value={form.city} onChange={e=>sf('city',e.target.value)}/></div>
                  <div><label className="lbl">Postcode *</label><input className="inp" value={form.postcode} onChange={e=>sf('postcode',e.target.value)} style={{ fontFamily:'var(--font-mono)' }}/></div>
                  <div><label className="lbl">Personal Email *</label><input className="inp" type="email" value={form.personal_email} onChange={e=>sf('personal_email',e.target.value)}/></div>
                  <div><label className="lbl">Personal Phone *</label><input className="inp" value={form.personal_phone} onChange={e=>sf('personal_phone',e.target.value)} placeholder="07700 000000"/></div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div className="staff-onboarding-note">
                  <div style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.7 }}>
                    These employment details are set by DH Website Services. If anything looks wrong, contact your department manager before submitting.
                  </div>
                </div>
                <div className="fg">
                  <div><label className="lbl">Job Title</label><input className="inp" value={form.job_title || employmentContext.job_title} readOnly /></div>
                  <div><label className="lbl">Department</label><input className="inp" value={form.department || employmentContext.department} readOnly /></div>
                  <div><label className="lbl">Start Date</label><input className="inp" type="date" value={form.start_date || employmentContext.start_date} readOnly /></div>
                  <div><label className="lbl">Contract Type</label><input className="inp" value={form.contract_type || employmentContext.contract_type} readOnly /></div>
                  <div><label className="lbl">Hours per Week</label><input className="inp" type="number" value={form.hours_per_week} onChange={e=>sf('hours_per_week',e.target.value)} placeholder="e.g. 37.5"/></div>
                  <div><label className="lbl">Work Location</label>
                    <select className="inp" value={form.work_location} onChange={e=>sf('work_location',e.target.value)}>
                      <option value="">Select...</option>
                      {['Remote','Office','Hybrid','On-site (client)'].map(l=><option key={l}>{l}</option>)}
                    </select>
                  </div>
                  <div><label className="lbl">Manager Name</label><input className="inp" value={form.manager_name || employmentContext.manager_name} readOnly /></div>
                  <div><label className="lbl">Manager Email</label><input className="inp" value={form.manager_email || employmentContext.manager_email} readOnly /></div>
                  <div className="fc" style={{ marginTop:8 }}>
                    <label className={`staff-onboarding-check ${form.company_portal_confirmed ? 'is-checked' : ''}`}>
                      <input type="checkbox" checked={form.company_portal_confirmed} onChange={e=>sf('company_portal_confirmed',e.target.checked)} style={{ width:18,height:18,accentColor:'var(--green)',flexShrink:0,marginTop:1 }}/>
                      <span style={{ fontSize:13, lineHeight:1.6, color:'var(--text)' }}>
                        I have installed <strong>Microsoft Company Portal</strong> on my work device and confirmed I can access it.
                      </span>
                    </label>
                    <div style={{ fontSize:11.5, color:'var(--sub)', marginTop:8, lineHeight:1.6 }}>
                      Install Company Portal before submitting onboarding so device access and company policies can be applied correctly.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <p style={{ fontSize:13, color:'var(--sub)' }}>Who should we contact in an emergency? This information is kept confidential.</p>
                <div className="fg">
                  <div><label className="lbl">Full Name *</label><input className="inp" value={form.emergency_name} onChange={e=>sf('emergency_name',e.target.value)}/></div>
                  <div><label className="lbl">Relationship</label><input className="inp" value={form.emergency_relationship} onChange={e=>sf('emergency_relationship',e.target.value)} placeholder="e.g. Partner, Parent, Sibling"/></div>
                  <div><label className="lbl">Phone Number *</label><input className="inp" value={form.emergency_phone} onChange={e=>sf('emergency_phone',e.target.value)} placeholder="07700 000000"/></div>
                  <div><label className="lbl">Email Address</label><input className="inp" type="email" value={form.emergency_email} onChange={e=>sf('emergency_email',e.target.value)}/></div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div className="staff-onboarding-note is-blue">
                  Your bank details are stored securely and only accessible by HR/admin. They are used solely for payroll purposes.
                </div>
                <div className="fg">
                  <div><label className="lbl">Bank Name *</label><input className="inp" value={form.bank_name} onChange={e=>sf('bank_name',e.target.value)} placeholder="e.g. Barclays, HSBC"/></div>
                  <div><label className="lbl">Account Name *</label><input className="inp" value={form.account_name} onChange={e=>sf('account_name',e.target.value)} placeholder="Name on account"/></div>
                  <div><label className="lbl">Sort Code *</label><input className="inp" value={form.sort_code} onChange={e=>sf('sort_code',e.target.value)} placeholder="12-34-56" style={{ fontFamily:'var(--font-mono)' }}/></div>
                  <div><label className="lbl">Account Number *</label><input className="inp" value={form.account_number} onChange={e=>sf('account_number',e.target.value)} placeholder="12345678" style={{ fontFamily:'var(--font-mono)' }}/></div>
                  <div><label className="lbl">Payment Frequency</label>
                    <select className="inp" value={form.payment_frequency} onChange={e=>sf('payment_frequency',e.target.value)}>
                      {['Monthly','Weekly','Fortnightly'].map(f=><option key={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <p style={{ fontSize:13, color:'var(--sub)', lineHeight:1.6 }}>Under UK law, we are required to check your right to work before employment begins. Please provide one of the documents below.</p>
                <div className="fg">
                  <div className="fc"><label className="lbl">Document Type *</label>
                    <select className="inp" value={form.rtw_type} onChange={e=>sf('rtw_type',e.target.value)}>
                      <option value="">Select document type...</option>
                      {RTW_DOCS.map(d=><option key={d}>{d}</option>)}
                    </select>
                  </div>
                  {form.rtw_type === 'Visa (specify type)' && (
                    <div className="fc"><label className="lbl">Visa Type / Notes</label><input className="inp" value={form.rtw_notes} onChange={e=>sf('rtw_notes',e.target.value)} placeholder="e.g. Skilled Worker visa, expiry date..."/></div>
                  )}
                  <div><label className="lbl">Document Expiry Date</label><input className="inp" type="date" value={form.rtw_expiry} onChange={e=>sf('rtw_expiry',e.target.value)}/><div style={{ fontSize:11, color:'var(--faint)', marginTop:4 }}>Leave blank if document does not expire (e.g. British passport)</div></div>
                  <div>
                    <label className="lbl">Upload Document *</label>
                    <input type="file" ref={rtwRef} style={{ display:'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={e=>{ if(e.target.files[0]) uploadRTW(e.target.files[0]) }}/>
                    {form.rtw_document_url ? (
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span className="badge badge-green">✓ Uploaded</span>
                        {rtwUploadName ? <span style={{ fontSize:12, color:'var(--sub)' }}>{rtwUploadName}</span> : null}
                        <a href={form.rtw_document_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'var(--accent)' }}>View document</a>
                        <button onClick={() => rtwRef.current?.click()} className="btn btn-outline btn-sm" disabled={rtwUploading}>{rtwUploading ? 'Uploading...' : 'Replace'}</button>
                      </div>
                    ) : (
                      <div style={{ display:'grid', gap:8 }}>
                        <button onClick={() => rtwRef.current?.click()} className="btn btn-outline" style={{ marginTop:4 }} disabled={rtwUploading}>
                          {rtwUploading ? 'Uploading...' : '📎 Upload Document (PDF, JPG, PNG)'}
                        </button>
                        <div style={{ fontSize:12, color:rtwUploadName ? 'var(--text)' : 'var(--sub)' }}>
                          {rtwUploadName ? `Selected: ${rtwUploadName}` : 'No document uploaded yet.'}
                        </div>
                      </div>
                    )}
                    {rtwUploadError ? (
                      <div style={{ fontSize:12, color:'var(--red)', marginTop:8 }}>
                        {rtwUploadError}
                      </div>
                    ) : null}
                    {!form.rtw_document_url && !rtwUploadError && rtwUploadName && !rtwUploading ? (
                      <div style={{ fontSize:12, color:'var(--green)', marginTop:8 }}>
                        Document ready and uploaded successfully.
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="staff-onboarding-note">
                  <strong>Acceptable documents include:</strong> UK/EU passport, BRP card, UK birth certificate with NI evidence. Documents will be reviewed by HR within 2 working days. If you have any questions, contact your manager.
                </div>
              </div>
            )}

            {step === 6 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {staffContract ? (
                  <div className="staff-onboarding-contract-shell">
                    <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', flexWrap:'wrap', marginBottom:10 }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>{staffContract.template_name || 'Employment contract'}</div>
                        <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:4 }}>
                          Issued by {staffContract.manager_signature?.name || staffContract.manager_name || 'Department manager'} · {staffContract.contract_type || 'Employment Contract'}
                        </div>
                      </div>
                      {contractStatusLabel ? <span className={`badge badge-${contractStatusLabel[1]}`}>{contractStatusLabel[0]}</span> : null}
                    </div>
                    <div className="staff-onboarding-contract-preview">
                      <div dangerouslySetInnerHTML={{ __html: renderContractHtml(staffContract.template_html || '', staffContract.merge_fields || {}) }} />
                    </div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:12 }}>
                      {staffContract.template_reference_file_path || staffContract.template_reference_file_url ? <button className="btn btn-outline btn-sm" onClick={openContractReferenceFile}>Open attached template file</button> : null}
                      {staffContract.final_document_path || staffContract.final_document_url ? <button className="btn btn-outline btn-sm" onClick={openSignedContractFile}>Open signed PDF</button> : null}
                      {staffContract.status === 'awaiting_staff_signature' ? (
                        <button className="btn btn-primary btn-sm" onClick={signContract} disabled={contractSigning}>
                          {contractSigning ? 'Signing contract...' : `Sign as ${form.full_name || user?.name || user?.email || 'staff member'}`}
                        </button>
                      ) : null}
                    </div>
                    {contractMessage ? (
                      <div style={{ fontSize:12.5, color:contractRequirementMet ? 'var(--green)' : 'var(--amber)', marginTop:10 }}>
                        {contractMessage}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="staff-onboarding-alert staff-onboarding-alert-warn">
                    <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>No contract issued yet</div>
                        <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:6, lineHeight:1.7, maxWidth:620 }}>
                          Your manager needs to issue your contract before onboarding can be submitted. Once it has been issued, it will appear here for you to review and sign digitally.
                        </div>
                      </div>
                      <span className="badge badge-amber">Waiting for manager</span>
                    </div>
                  </div>
                )}
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {[
                    ['handbook_read', 'I have read and understood the DH Website Services staff handbook and policies'],
                    ['data_consent', 'I consent to DH Website Services storing and processing my personal data in accordance with GDPR and the company Privacy Policy'],
                  ].map(([k, label]) => (
                    <label key={k} className={`staff-onboarding-check ${form[k] ? 'is-checked' : ''}`}>
                      <input type="checkbox" checked={form[k]} onChange={e=>sf(k,e.target.checked)} style={{ width:18,height:18,accentColor:'var(--green)',flexShrink:0,marginTop:1 }}/>
                      <span style={{ fontSize:13, lineHeight:1.6, color:'var(--text)' }}>{label}</span>
                    </label>
                  ))}
                </div>
                <div>
                  <label className="lbl">Additional Notes / Questions for HR</label>
                  <textarea className="inp" rows={4} value={form.additional_notes} onChange={e=>sf('additional_notes',e.target.value)} style={{ resize:'vertical' }} placeholder="Anything you'd like HR to know, or any questions you have..."/>
                </div>
                {!staffContract && (
                  <div style={{ fontSize:12, color:'var(--amber)' }}>
                    ⚠ A manager-issued contract must appear here before onboarding can be submitted.
                  </div>
                )}
                {staffContract && (!contractRequirementMet || !form.handbook_read || !form.data_consent) && (
                  <div style={{ fontSize:12, color:'var(--amber)' }}>
                    ⚠ Please sign the contract and complete the sign-off section before submitting
                  </div>
                )}
                {!form.company_portal_confirmed && (
                  <div style={{ fontSize:12, color:'var(--amber)' }}>⚠ Please confirm Microsoft Company Portal has been installed before submitting</div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="staff-onboarding-actions">
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {step > 0 && <button className="btn btn-outline" onClick={() => setStep(s=>s-1)}>← Back</button>}
                <button className="btn btn-ghost" onClick={saveDraft} disabled={saving}>Save Draft</button>
              </div>
              <div>
                {step < STEPS.length-1
                  ? <button className="btn btn-primary" onClick={() => setStep(s=>s+1)}>Next →</button>
                  : <button className="btn btn-primary" onClick={submit} disabled={saving||!contractRequirementMet||!form.handbook_read||!form.data_consent||!form.company_portal_confirmed}>
                      {saving ? 'Submitting...' : '✓ Submit Onboarding'}
                    </button>
                }
              </div>
            </div>
              </div>
            </div>
          </div>
        </div>
      ) : !isReviewer ? (
        <div className="card card-pad" style={{ maxWidth:480, textAlign:'center' }}>
          <div style={{ fontSize:52, marginBottom:16 }}>
            {mySubmission.status==='approved' ? '✅' : mySubmission.status==='submitted' ? '⏳' : '🔄'}
          </div>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:400, marginBottom:8 }}>
            {mySubmission.status==='approved' ? 'Onboarding Complete' : 'Submission Under Review'}
          </h2>
          <p style={{ fontSize:14, color:'var(--sub)', lineHeight:1.7, marginBottom:20 }}>
            {mySubmission.status==='approved'
              ? 'Your onboarding has been approved by HR. Welcome to the team!'
              : 'Your onboarding form has been submitted and is being reviewed by HR. You\'ll be notified once approved.'}
          </p>
          {mySubmission.status === 'submitted' && (
            <div style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>
              Submitted {new Date(mySubmission.submitted_at).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}
            </div>
          )}
        </div>
      ) : submissions.length === 0 ? (
        <div className="card card-pad" style={{ maxWidth:560 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:24, color:'var(--text)' }}>No onboarding submissions yet</div>
          <div style={{ marginTop:8, fontSize:14, color:'var(--sub)', lineHeight:1.7 }}>
            Submitted onboarding forms will appear here for review once they have been saved successfully.
          </div>
        </div>
      ) : null}

      {/* Admin review modal */}
      {viewSub && createPortal((
        <div className="hr-onboarding-review-bg"
          onClick={() => setViewSub(null)}>
          <div className="hr-onboarding-review-shell" onClick={e=>e.stopPropagation()}>
            <div className="hr-onboarding-review-head">
              <div>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>Staff Onboarding Review</div>
                <div style={{ fontSize:22, fontWeight:600, color:'var(--text)' }}>{viewSub.full_name||viewSub.user_name}</div>
                <div style={{ fontSize:13, color:'var(--sub)', marginTop:4 }}>
                  {viewSub.user_email} · {viewSub.status || 'submitted'}
                </div>
              </div>
              <button className="modal-close" onClick={() => setViewSub(null)}>×</button>
            </div>
            <div className="hr-onboarding-review-body">
              <div className="hr-onboarding-review-main">
                {buildReviewSections(viewSub).map((section) => (
                  <section key={section.title} className="hr-onboarding-review-section-block">
                    <div className="hr-onboarding-review-section-head">
                      <div className="hr-onboarding-review-section-title">{section.title}</div>
                    </div>
                    <div className="hr-onboarding-review-grid">
                      {section.fields.map(([label, value]) => (
                        <div key={`${section.title}-${label}`} className="hr-onboarding-review-card">
                          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5 }}>{label}</div>
                          <div style={{ fontSize:14, fontWeight:500, color:'var(--text)', lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                            {formatReviewValue(value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <aside className="hr-onboarding-review-aside">
                <div className="hr-onboarding-review-panel">
                  <div className="hr-onboarding-review-panel-title">Submission summary</div>
                  <div className="hr-onboarding-review-meta-list">
                    <div><span>Name</span><strong>{formatReviewValue(getOnboardingDisplayName(viewSub))}</strong></div>
                    <div><span>Status</span><strong>{formatReviewValue(viewSub.status || 'submitted')}</strong></div>
                    <div><span>Department</span><strong>{formatReviewValue(viewSub.department)}</strong></div>
                    <div><span>Manager</span><strong>{formatReviewValue(viewSub.manager_name || viewSub.manager_email)}</strong></div>
                    <div><span>Submitted</span><strong>{formatReviewValue(formatReviewDate(viewSub.submitted_at))}</strong></div>
                    <div><span>Completion</span><strong>{completionForSubmission(viewSub)}%</strong></div>
                  </div>
                </div>
                {viewSub.rtw_document_url && (
                  <div className="hr-onboarding-review-panel">
                    <div className="hr-onboarding-review-panel-title">Right to work document</div>
                    <a href={viewSub.rtw_document_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">View document ↗</a>
                  </div>
                )}
                {viewSub.additional_notes && (
                  <div className="hr-onboarding-review-panel" style={{ fontSize:13, color:'var(--sub)' }}>
                    <div className="hr-onboarding-review-panel-title">Notes from staff</div>
                    <div style={{ lineHeight:1.7, whiteSpace:'pre-wrap' }}>{viewSub.additional_notes}</div>
                  </div>
                )}
                <div className="hr-onboarding-review-panel">
                  <div className="hr-onboarding-review-panel-title">Actions</div>
                  {viewSub.status === 'submitted' && (
                    <div className="hr-onboarding-review-actions">
                      <button className="btn btn-primary" disabled={adminBusyEmail === normalizeEmail(viewSub.user_email)} onClick={() => decide(viewSub.user_email,'approved')}>✓ Approve</button>
                      <button className="btn btn-danger" disabled={adminBusyEmail === normalizeEmail(viewSub.user_email)} onClick={() => { const notes=prompt('Reason for rejection (optional):'); decide(viewSub.user_email,'rejected',notes||'') }}>✗ Reject</button>
                      <button className="btn btn-outline" disabled={adminBusyEmail === normalizeEmail(viewSub.user_email)} onClick={() => removeSubmission(viewSub.user_email)}>Remove record</button>
                    </div>
                  )}
                  {viewSub.status === 'approved' && (
                    <div className="hr-onboarding-review-actions">
                      <button
                        className="btn btn-danger"
                        disabled={adminBusyEmail === normalizeEmail(viewSub.user_email)}
                        onClick={() => {
                          const notes = prompt('Why are you sending this approved onboarding back for changes?')
                          if (notes === null) return
                          if (!String(notes || '').trim()) {
                            alert('A reason is required when reopening an approved onboarding.')
                            return
                          }
                          decide(viewSub.user_email,'rejected',String(notes).trim())
                        }}
                      >
                        Reopen onboarding
                      </button>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </div>
      ), document.body)}

      {starterPreview && createPortal((
        <div className="modal-bg" onClick={() => setStarterPreview(null)}>
          <div className="modal-box" style={{ maxWidth:780 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="modal-title">Welcome email preview</div>
                <div style={{ marginTop:6, fontSize:13, color:'var(--sub)' }}>
                  This is the email that will be sent to {starterForm.personal_email || 'the starter'}.
                </div>
              </div>
              <button className="modal-close" onClick={() => setStarterPreview(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display:'grid', gap:16 }}>
              <div style={{ border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', background:'var(--bg2)' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)', marginBottom:8 }}>Email subject</div>
                <div style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>{starterPreview.subject}</div>
              </div>
              <div style={{ border:'1px solid var(--border)', borderRadius:18, padding:'20px 22px', background:'#fff' }}>
                <div dangerouslySetInnerHTML={{ __html: starterPreview.html }} />
              </div>
              <div style={{ border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', background:'var(--bg2)' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)', marginBottom:8 }}>Plain text fallback</div>
                <pre style={{ margin:0, whiteSpace:'pre-wrap', fontFamily:'var(--font-mono)', fontSize:12, color:'var(--sub)' }}>{starterPreview.text}</pre>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-outline" onClick={() => setStarterPreview(null)} disabled={starterBusy}>Close</button>
              <button className="btn btn-primary" onClick={() => createStarter({ sendWelcomeEmail: true })} disabled={starterBusy}>
                {starterBusy ? 'Sending...' : 'Create and send'}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  )
}
