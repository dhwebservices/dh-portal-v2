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
import { DIRECTOR_EMAILS } from '../../utils/staffLifecycle'
import { buildStaffOrgKey, getManagedDepartments, mergeOrgRecord } from '../../utils/orgStructure'
import {
  buildContractFileName,
  buildContractPdfBlob,
  buildStaffContractKey,
  createPortalSignature,
  createStaffContract,
  getContractStatusLabel,
  renderContractHtml,
} from '../../utils/contracts'
import { openSecureDocument } from '../../utils/fileAccess'

const STEPS = [
  { key:'personal',   label:'Personal Info'       },
  { key:'address',    label:'Address & Contact'   },
  { key:'employment', label:'Employment'          },
  { key:'emergency',  label:'Emergency Contact'   },
  { key:'bank',       label:'Bank Details'        },
  { key:'rtw',        label:'Right to Work'       },
  { key:'contract',   label:'Contract & Sign Off' },
]

const RTW_DOCS = ['UK Passport','British National (Overseas) Passport','EU/EEA Passport','BRP Card (Biometric Residence Permit)','UK Birth Certificate + NI evidence','Certificate of Naturalisation','Visa (specify type)','Other']

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
  if (!updated?.user_email) throw new Error(`Onboarding summary update failed for ${normalizedEmail}`)
  return updated
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
  const rtwRef = useRef()

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
    ] = await Promise.all([
      isReviewer ? supabase.from('onboarding_submissions').select('*').order('submitted_at', { ascending:false }) : Promise.resolve({ data:[] }),
      supabase.from('onboarding_submissions').select('*').ilike('user_email', currentEmail).maybeSingle(),
      supabase.from('hr_profiles').select('*').ilike('user_email', currentEmail),
      supabase.from('portal_settings').select('value').eq('key', buildStaffOrgKey(currentEmail)).maybeSingle(),
      supabase.from('portal_settings').select('key,value').like('key', 'onboarding_payload:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_contract:%'),
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
        await upsertEmailScopedRow('user_permissions', normalizedEmail, {
          onboarding: false,
          updated_at: new Date().toISOString(),
        })
      } else if (status === 'rejected') {
        await upsertEmailScopedRow('user_permissions', normalizedEmail, {
          onboarding: true,
          updated_at: new Date().toISOString(),
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

      {/* Welcome banner for onboarding users */}
      {isOnboarding && !mySubmission?.status?.match(/submitted|approved/) && (
        <div style={{ background:'linear-gradient(135deg, var(--accent-soft) 0%, var(--bg2) 100%)', border:'1px solid var(--accent-border)', borderRadius:14, padding:'24px 28px', marginBottom:24, display:'flex', gap:20, alignItems:'flex-start' }}>
          <div style={{ fontSize:36, flexShrink:0 }}>👋</div>
          <div>
            <div style={{ fontSize:20, fontWeight:600, color:'var(--text)', marginBottom:6 }}>Welcome to DH Website Services, {user?.name?.split(' ')[0]}!</div>
            <div style={{ fontSize:14, color:'var(--sub)', lineHeight:1.6 }}>
              Please complete your onboarding form below. Your assigned manager and department are shown for reference, and your submission will go to your department manager for approval.
              Install Microsoft Company Portal before submitting, then upload your right-to-work documents and final confirmations.
            </div>
          </div>
        </div>
      )}

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
        <div>
          {mySubmission?.status === 'rejected' && (
            <div style={{ padding:'12px 16px', background:'var(--red-bg)', border:'1px solid var(--red)', borderRadius:8, marginBottom:20, fontSize:13, color:'var(--red)' }}>
              Your previous submission was rejected. Please review and resubmit.
              {mySubmission.admin_notes && <div style={{ marginTop:6, fontWeight:500 }}>Notes: {mySubmission.admin_notes}</div>}
            </div>
          )}

          {/* Progress bar */}
          <div className="card card-pad" style={{ marginBottom:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:13, fontWeight:500 }}>Form completion</span>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color: pct===100?'var(--green)':'var(--accent)' }}>{pct}%</span>
            </div>
            <div style={{ height:6, background:'var(--bg3)', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', background: pct===100?'var(--green)':'var(--accent)', borderRadius:3, width:`${pct}%`, transition:'width 0.4s ease' }}/>
            </div>
          </div>

          {/* Step tabs */}
          <div style={{ display:'flex', gap:4, marginBottom:24, background:'var(--bg2)', borderRadius:10, padding:4, flexWrap:'wrap' }}>
            {STEPS.map((s,i) => (
              <button key={s.key} onClick={() => setStep(i)} style={{ flex:1, minWidth:90, padding:'7px 10px', borderRadius:7, border:'none', background: step===i ? 'var(--card)' : 'transparent', color: step===i ? 'var(--text)' : 'var(--faint)', fontSize:12, fontWeight: step===i ? 500 : 400, cursor:'pointer', transition:'all 0.15s', boxShadow: step===i ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', whiteSpace:'nowrap' }}>
                {s.label}
              </button>
            ))}
          </div>

          <div className="card card-pad" style={{ maxWidth:640, marginBottom:20 }}>
            {step === 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:4 }}>Personal Information</h3>
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
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:4 }}>Address & Contact Details</h3>
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
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:4 }}>Employment Details</h3>
                <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
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
                    <label style={{ display:'flex', alignItems:'flex-start', gap:12, cursor:'pointer', padding:'12px 14px', borderRadius:8, border:`1px solid ${form.company_portal_confirmed?'var(--green)':'var(--border)'}`, background:form.company_portal_confirmed?'var(--green-bg)':'transparent', transition:'all 0.15s' }}>
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
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:4 }}>Emergency Contact</h3>
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
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:4 }}>Bank Details</h3>
                <div style={{ padding:'10px 14px', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius:7, fontSize:13, color:'var(--accent)' }}>
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
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:4 }}>Right to Work</h3>
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
                <div style={{ padding:'12px 14px', background:'var(--bg2)', borderRadius:8, fontSize:12, color:'var(--sub)', lineHeight:1.7 }}>
                  <strong>Acceptable documents include:</strong> UK/EU passport, BRP card, UK birth certificate with NI evidence. Documents will be reviewed by HR within 2 working days. If you have any questions, contact your manager.
                </div>
              </div>
            )}

            {step === 6 && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:4 }}>Contract & Sign Off</h3>
                {staffContract ? (
                  <div style={{ padding:'16px 18px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', flexWrap:'wrap', marginBottom:10 }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>{staffContract.template_name || 'Employment contract'}</div>
                        <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:4 }}>
                          Issued by {staffContract.manager_signature?.name || staffContract.manager_name || 'Department manager'} · {staffContract.contract_type || 'Employment Contract'}
                        </div>
                      </div>
                      {contractStatusLabel ? <span className={`badge badge-${contractStatusLabel[1]}`}>{contractStatusLabel[0]}</span> : null}
                    </div>
                    <div style={{ padding:'16px 18px', border:'1px solid var(--border)', borderRadius:10, background:'var(--card)', color:'var(--text)', lineHeight:1.75, fontSize:14 }}>
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
                  <div style={{ padding:'16px 18px', border:'1px solid var(--amber)', borderRadius:12, background:'var(--amber-bg)' }}>
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
                    <label key={k} style={{ display:'flex', alignItems:'flex-start', gap:12, cursor:'pointer', padding:'12px 14px', borderRadius:8, border:`1px solid ${form[k]?'var(--green)':'var(--border)'}`, background:form[k]?'var(--green-bg)':'transparent', transition:'all 0.15s' }}>
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
            <div style={{ display:'flex', gap:8, marginTop:20, justifyContent:'space-between' }}>
              <div style={{ display:'flex', gap:8 }}>
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
    </div>
  )
}
