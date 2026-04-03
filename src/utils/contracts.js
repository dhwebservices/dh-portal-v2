import { normalizeEmail } from './hrProfileSync'

export function buildContractTemplateKey(id = '') {
  return `contract_template:${id}`
}

export function buildStaffContractKey(id = '') {
  return `staff_contract:${id}`
}

export function createContractTemplate(raw = {}) {
  return {
    id: raw?.id || globalThis.crypto?.randomUUID?.() || `template-${Date.now()}`,
    name: String(raw?.name || 'Employment Contract').trim(),
    description: String(raw?.description || '').trim(),
    contract_type: String(raw?.contract_type || 'Employment Contract').trim(),
    subject: String(raw?.subject || 'Employment contract').trim(),
    manager_title_default: String(raw?.manager_title_default || 'Department Manager').trim(),
    content_html: String(raw?.content_html || '').trim(),
    reference_file_url: String(raw?.reference_file_url || '').trim(),
    reference_file_path: String(raw?.reference_file_path || '').trim(),
    reference_file_name: String(raw?.reference_file_name || '').trim(),
    active: raw?.active !== false,
    created_at: raw?.created_at || new Date().toISOString(),
    updated_at: raw?.updated_at || raw?.created_at || new Date().toISOString(),
  }
}

export function createStaffContract(raw = {}) {
  return {
    id: raw?.id || globalThis.crypto?.randomUUID?.() || `contract-${Date.now()}`,
    template_id: String(raw?.template_id || '').trim(),
    template_name: String(raw?.template_name || '').trim(),
    contract_type: String(raw?.contract_type || 'Employment Contract').trim(),
    subject: String(raw?.subject || 'Employment contract').trim(),
    staff_email: normalizeEmail(raw?.staff_email || ''),
    staff_name: String(raw?.staff_name || '').trim(),
    staff_role: String(raw?.staff_role || '').trim(),
    staff_department: String(raw?.staff_department || '').trim(),
    manager_email: normalizeEmail(raw?.manager_email || ''),
    manager_name: String(raw?.manager_name || '').trim(),
    manager_title: String(raw?.manager_title || '').trim(),
    status: String(raw?.status || 'draft').trim(),
    notes: String(raw?.notes || '').trim(),
    merge_fields: raw?.merge_fields || {},
    template_html: String(raw?.template_html || '').trim(),
    template_reference_file_url: String(raw?.template_reference_file_url || '').trim(),
    template_reference_file_path: String(raw?.template_reference_file_path || '').trim(),
    template_reference_file_name: String(raw?.template_reference_file_name || '').trim(),
    manager_signature: raw?.manager_signature || null,
    staff_signature: raw?.staff_signature || null,
    issued_at: raw?.issued_at || null,
    manager_signed_at: raw?.manager_signed_at || null,
    staff_signed_at: raw?.staff_signed_at || null,
    completed_at: raw?.completed_at || null,
    final_document_url: String(raw?.final_document_url || '').trim(),
    final_document_path: String(raw?.final_document_path || '').trim(),
    voided_at: raw?.voided_at || null,
    created_at: raw?.created_at || new Date().toISOString(),
    updated_at: raw?.updated_at || raw?.created_at || new Date().toISOString(),
  }
}

export const CONTRACT_PLACEHOLDERS = [
  ['staff_name', 'Staff full name'],
  ['staff_email', 'Staff work email'],
  ['staff_role', 'Job title'],
  ['staff_department', 'Department'],
  ['start_date', 'Start date'],
  ['contract_type', 'Contract type'],
  ['manager_name', 'Manager name'],
  ['manager_email', 'Manager email'],
  ['manager_title', 'Manager title'],
  ['issue_date', 'Issue date'],
]

export function buildContractMergeFields({ profile = {}, orgRecord = {}, template = {}, managerTitle = '', staffEmail = '' } = {}) {
  const today = new Date().toLocaleDateString('en-GB')
  return {
    staff_name: profile.full_name || staffEmail || '',
    staff_email: normalizeEmail(staffEmail || profile.user_email || ''),
    staff_role: profile.role || '',
    staff_department: profile.department || orgRecord.department || '',
    start_date: profile.start_date ? new Date(profile.start_date).toLocaleDateString('en-GB') : '',
    contract_type: profile.contract_type || template.contract_type || '',
    manager_name: profile.manager_name || orgRecord.reports_to_name || '',
    manager_email: normalizeEmail(profile.manager_email || orgRecord.reports_to_email || ''),
    manager_title: managerTitle || '',
    issue_date: today,
  }
}

export function renderContractHtml(templateHtml = '', fields = {}) {
  return String(templateHtml || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return String(fields?.[key] ?? '')
  })
}

export function buildContractFileName(contract = {}) {
  const base = `${contract.staff_name || contract.staff_email || 'staff'}-${contract.template_name || contract.contract_type || 'contract'}`
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .concat('.pdf')
}

export function createPortalSignature({ name = '', title = '', email = '' } = {}) {
  return {
    name: String(name || '').trim(),
    title: String(title || '').trim(),
    email: normalizeEmail(email || ''),
    signed_at: new Date().toISOString(),
  }
}

function signatureBlock(signature, label) {
  if (!signature) return ''
  return `
    <div style="margin-top:16px;padding:14px;border:1px solid #d8d8d8;border-radius:10px;background:#faf9f7;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#7a7a7a;margin-bottom:8px;">${label}</div>
      <div style="font-size:18px;font-weight:600;color:#111;">${signature.name || ''}</div>
      <div style="font-size:13px;color:#555;margin-top:4px;">${signature.title || ''}</div>
      <div style="font-size:12px;color:#777;margin-top:8px;">Signed ${signature.signed_at ? new Date(signature.signed_at).toLocaleString('en-GB') : ''}</div>
      <div style="font-size:11px;color:#8a8a8a;margin-top:4px;">Account: ${signature.email || 'Unknown'} · Method: portal sign-off</div>
    </div>
  `
}

export function buildSignedContractHtml(contract = {}) {
  const body = renderContractHtml(contract.template_html || '', contract.merge_fields || {})
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${contract.template_name || 'Contract'}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color:#111; margin:0; background:#f3f1ec; }
    .page { max-width:860px; margin:32px auto; background:#fff; border:1px solid #e7e1d8; border-radius:18px; overflow:hidden; }
    .head { padding:28px 34px; border-bottom:1px solid #ece6de; background:linear-gradient(180deg,#f9f7f3 0%,#fff 100%); }
    .title { font-size:30px; margin:0 0 8px; }
    .meta { font-size:13px; color:#666; line-height:1.7; }
    .body { padding:30px 34px; line-height:1.8; font-size:15px; }
    .signatures { padding:0 34px 34px; display:grid; gap:14px; }
    .audit { padding:18px 34px 30px; border-top:1px solid #ece6de; background:#faf8f4; }
    .audit h3 { margin:0 0 10px; font-size:16px; }
    .audit p { margin:4px 0; font-size:13px; color:#666; }
  </style>
</head>
<body>
  <div class="page">
    <div class="head">
      <h1 class="title">${contract.template_name || 'Contract'}</h1>
      <div class="meta">
        <div>${contract.contract_type || 'Employment Contract'}</div>
        <div>${contract.staff_name || ''} · ${contract.staff_role || ''}</div>
        <div>${contract.staff_department || ''}</div>
      </div>
    </div>
    <div class="body">${body}</div>
    <div class="signatures">
      ${signatureBlock(contract.manager_signature, 'Department manager signature')}
      ${signatureBlock(contract.staff_signature, 'Staff signature')}
    </div>
    <div class="audit">
      <h3>Audit trail</h3>
      <p>Contract status: ${contract.status || 'draft'}</p>
      <p>Issued: ${contract.issued_at ? new Date(contract.issued_at).toLocaleString('en-GB') : 'Not issued'}</p>
      <p>Manager signed: ${contract.manager_signed_at ? new Date(contract.manager_signed_at).toLocaleString('en-GB') : 'Pending'}</p>
      <p>Staff signed: ${contract.staff_signed_at ? new Date(contract.staff_signed_at).toLocaleString('en-GB') : 'Pending'}</p>
      <p>Completed: ${contract.completed_at ? new Date(contract.completed_at).toLocaleString('en-GB') : 'Pending'}</p>
    </div>
  </div>
</body>
</html>`
}

export function getContractStatusLabel(status = '') {
  const safe = String(status || '')
  if (safe === 'awaiting_staff_signature') return ['Awaiting staff signature', 'amber']
  if (safe === 'completed') return ['Completed', 'green']
  if (safe === 'voided') return ['Voided', 'red']
  return ['Draft', 'grey']
}

export async function buildContractPdfBlob(contract = {}) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])
  const html = buildSignedContractHtml(contract)
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-20000px'
  container.style.top = '0'
  container.style.width = '860px'
  container.style.background = '#f3f1ec'
  container.innerHTML = html
  document.body.appendChild(container)

  try {
    const target = container.querySelector('.page') || container
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#f3f1ec',
    })
    const pdf = new jsPDF('p', 'pt', 'a4')
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pdfWidth - 40
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    const pageHeight = pdfHeight - 40
    let remainingHeight = imgHeight
    let position = 20
    let sourceY = 0
    const pageCanvas = document.createElement('canvas')
    const ctx = pageCanvas.getContext('2d')

    while (remainingHeight > 0) {
      const sliceHeightPx = Math.min(canvas.height - sourceY, Math.floor((pageHeight * canvas.width) / imgWidth))
      pageCanvas.width = canvas.width
      pageCanvas.height = sliceHeightPx
      ctx.clearRect(0, 0, pageCanvas.width, pageCanvas.height)
      ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)
      const sliceData = pageCanvas.toDataURL('image/png')
      const renderedHeight = (sliceHeightPx * imgWidth) / canvas.width
      pdf.addImage(sliceData, 'PNG', 20, position, imgWidth, renderedHeight)
      sourceY += sliceHeightPx
      remainingHeight -= renderedHeight
      if (remainingHeight > 0) pdf.addPage()
    }

    return pdf.output('blob')
  } finally {
    document.body.removeChild(container)
  }
}
