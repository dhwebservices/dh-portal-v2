import { normalizeEmail } from './hrProfileSync'

export function buildStaffSignDocumentKey(id = '') {
  return `staff_sign_document:${id}`
}

export function createStaffSignDocument(raw = {}) {
  return {
    id: raw?.id || globalThis.crypto?.randomUUID?.() || `staff-sign-document-${Date.now()}`,
    title: String(raw?.title || 'Staff document').trim(),
    subject: String(raw?.subject || 'Staff document ready to sign').trim(),
    document_type: String(raw?.document_type || 'Staff Document').trim(),
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
    document_html: String(raw?.document_html || '').trim(),
    reference_file_url: String(raw?.reference_file_url || '').trim(),
    reference_file_path: String(raw?.reference_file_path || '').trim(),
    reference_file_name: String(raw?.reference_file_name || '').trim(),
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

export const STAFF_SIGN_DOCUMENT_PLACEHOLDERS = [
  ['staff_name', 'Staff full name'],
  ['staff_email', 'Staff work email'],
  ['staff_role', 'Job title'],
  ['staff_department', 'Department'],
  ['staff_signature_name', 'Staff signature name'],
  ['staff_signed_date', 'Staff signed date'],
  ['manager_name', 'Manager name'],
  ['manager_email', 'Manager email'],
  ['manager_title', 'Manager title'],
  ['manager_signature_name', 'Manager signature name'],
  ['manager_signed_date', 'Manager signed date'],
  ['issue_date', 'Issue date'],
  ['document_title', 'Document title'],
  ['document_type', 'Document type'],
]

export function buildStaffSignDocumentMergeFields({
  profile = {},
  orgRecord = {},
  title = '',
  documentType = '',
  managerName = '',
  managerEmail = '',
  managerTitle = '',
  staffEmail = '',
} = {}) {
  const today = new Date().toLocaleDateString('en-GB')
  return {
    staff_name: profile.full_name || staffEmail || '',
    staff_email: normalizeEmail(staffEmail || profile.user_email || ''),
    staff_role: profile.role || '',
    staff_department: profile.department || orgRecord.department || '',
    staff_signature_name: profile.full_name || staffEmail || '',
    staff_signed_date: '',
    manager_name: managerName || profile.manager_name || orgRecord.reports_to_name || '',
    manager_email: normalizeEmail(managerEmail || profile.manager_email || orgRecord.reports_to_email || ''),
    manager_title: managerTitle || '',
    manager_signature_name: managerName || profile.manager_name || orgRecord.reports_to_name || '',
    manager_signed_date: today,
    issue_date: today,
    document_title: title || '',
    document_type: documentType || '',
  }
}

export function renderStaffSignDocumentHtml(templateHtml = '', fields = {}) {
  return String(templateHtml || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return String(fields?.[key] ?? '')
  })
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildStaffSignDocumentFileName(document = {}) {
  const base = `${document.staff_name || document.staff_email || 'staff'}-${document.title || document.document_type || 'document'}`
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .concat('.pdf')
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

export function buildStaffSignDocumentBodyHtml(document = {}) {
  const body = renderStaffSignDocumentHtml(document.document_html || '', document.merge_fields || {})
  const managerName = document.manager_signature?.name || document.manager_name || document.merge_fields?.manager_name || ''
  const managerTitle = document.manager_signature?.title || document.manager_title || document.merge_fields?.manager_title || ''
  const managerEmail = document.manager_signature?.email || document.manager_email || document.merge_fields?.manager_email || ''
  const managerSignedAt = document.manager_signature?.signed_at || document.manager_signed_at || document.issued_at || ''
  const staffName = document.staff_signature?.name || document.staff_name || document.merge_fields?.staff_name || ''
  const staffSignedAt = document.staff_signature?.signed_at || document.staff_signed_at || ''

  const signatureSection = `
    <section style="margin-top:32px;padding-top:20px;border-top:1px solid #d8d8d8;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#7a7a7a;margin-bottom:14px;">Digital Sign-off</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;">
        <div>
          <div style="font-size:12px;font-weight:700;color:#111;margin-bottom:10px;">Issued by manager</div>
          <div style="min-height:18px;border-bottom:1px solid #111;margin-bottom:10px;"></div>
          <div style="font-size:16px;font-weight:600;color:#111;">${escapeHtml(managerName)}</div>
          <div style="font-size:13px;color:#555;margin-top:4px;">${escapeHtml(managerTitle)}</div>
          <div style="font-size:12px;color:#777;margin-top:8px;">${managerSignedAt ? `Signed ${escapeHtml(new Date(managerSignedAt).toLocaleString('en-GB'))}` : 'Awaiting manager sign-off'}</div>
          <div style="font-size:11px;color:#8a8a8a;margin-top:4px;">${escapeHtml(managerEmail)}</div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;color:#111;margin-bottom:10px;">Staff agreement</div>
          <div style="min-height:18px;border-bottom:1px solid #111;margin-bottom:10px;"></div>
          <div style="font-size:16px;font-weight:600;color:#111;">${escapeHtml(staffName)}</div>
          <div style="font-size:13px;color:#555;margin-top:4px;">Staff member</div>
          <div style="font-size:12px;color:#777;margin-top:8px;">${staffSignedAt ? `Signed ${escapeHtml(new Date(staffSignedAt).toLocaleString('en-GB'))}` : 'Pending staff agreement'}</div>
          <div style="font-size:11px;color:#8a8a8a;margin-top:4px;">Digital portal sign-off</div>
        </div>
      </div>
    </section>
  `

  return `${body}${signatureSection}`
}

export function buildSignedStaffSignDocumentHtml(document = {}) {
  const body = buildStaffSignDocumentBodyHtml(document)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${document.title || 'Staff document'}</title>
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
      <h1 class="title">${document.title || 'Staff document'}</h1>
      <div class="meta">
        <div>${document.document_type || 'Staff document'}</div>
        <div>${document.staff_name || ''} · ${document.staff_role || ''}</div>
        <div>${document.staff_department || ''}</div>
      </div>
    </div>
    <div class="body">${body}</div>
    <div class="audit">
      <h3>Audit trail</h3>
      <p>Document status: ${document.status || 'draft'}</p>
      <p>Issued: ${document.issued_at ? new Date(document.issued_at).toLocaleString('en-GB') : 'Not issued'}</p>
      <p>Manager signed: ${document.manager_signed_at ? new Date(document.manager_signed_at).toLocaleString('en-GB') : 'Pending'}</p>
      <p>Staff signed: ${document.staff_signed_at ? new Date(document.staff_signed_at).toLocaleString('en-GB') : 'Pending'}</p>
      <p>Completed: ${document.completed_at ? new Date(document.completed_at).toLocaleString('en-GB') : 'Pending'}</p>
    </div>
  </div>
</body>
</html>`
}

export function getStaffSignDocumentStatusLabel(status = '') {
  const safe = String(status || '')
  if (safe === 'awaiting_staff_signature') return ['Awaiting staff signature', 'amber']
  if (safe === 'completed') return ['Completed', 'green']
  if (safe === 'voided') return ['Voided', 'red']
  return ['Draft', 'grey']
}

export async function buildStaffSignDocumentPdfBlob(doc = {}) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])
  const html = buildSignedStaffSignDocumentHtml(doc)
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-20000px'
  container.style.top = '0'
  container.style.width = '860px'
  container.style.background = '#f3f1ec'
  container.innerHTML = html
  globalThis.document.body.appendChild(container)

  try {
    const target = container.querySelector('.page') || container
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#f3f1ec',
    })
    if (!canvas?.width || !canvas?.height) {
      throw new Error('Could not render the document into a signed PDF.')
    }
    const pdf = new jsPDF('p', 'pt', 'a4')
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pdfWidth - 40
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    if (!Number.isFinite(imgHeight) || imgHeight <= 0) {
      throw new Error('Could not calculate the signed PDF page size.')
    }
    const pageHeight = pdfHeight - 40
    let remainingHeight = imgHeight
    let sourceY = 0
    const pageCanvas = globalThis.document.createElement('canvas')
    const ctx = pageCanvas.getContext('2d')
    if (!ctx) {
      throw new Error('Could not prepare the signed PDF canvas.')
    }
    const sliceHeightPxBase = Math.max(1, Math.floor((pageHeight * canvas.width) / imgWidth))
    let pageIndex = 0

    while (remainingHeight > 0 && sourceY < canvas.height) {
      const sliceHeightPx = Math.max(1, Math.min(canvas.height - sourceY, sliceHeightPxBase))
      pageCanvas.width = canvas.width
      pageCanvas.height = sliceHeightPx
      ctx.clearRect(0, 0, pageCanvas.width, pageCanvas.height)
      ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)
      const sliceData = pageCanvas.toDataURL('image/jpeg', 0.98)
      const renderedHeight = (sliceHeightPx * imgWidth) / canvas.width
      if (!Number.isFinite(renderedHeight) || renderedHeight <= 0) {
        throw new Error('Could not render a page of the signed PDF.')
      }
      if (pageIndex > 0) pdf.addPage()
      pdf.addImage(sliceData, 'JPEG', 20, 20, imgWidth, renderedHeight)
      sourceY += sliceHeightPx
      remainingHeight -= renderedHeight
      pageIndex += 1
    }

    return pdf.output('blob')
  } finally {
    globalThis.document.body.removeChild(container)
  }
}
