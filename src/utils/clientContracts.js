import { normalizeClientEmail } from './clientAccounts'

export function buildClientContractTemplateKey(id = '') {
  return `client_contract_template:${id}`
}

export function buildClientContractKey(id = '') {
  return `client_contract:${id}`
}

export function createClientContractTemplate(raw = {}) {
  return {
    id: raw?.id || globalThis.crypto?.randomUUID?.() || `client-template-${Date.now()}`,
    name: String(raw?.name || 'Client Services Agreement').trim(),
    description: String(raw?.description || '').trim(),
    contract_type: String(raw?.contract_type || 'Service Agreement').trim(),
    subject: String(raw?.subject || 'Your agreement with DH Website Services').trim(),
    content_html: String(raw?.content_html || '').trim(),
    reference_file_url: String(raw?.reference_file_url || '').trim(),
    reference_file_path: String(raw?.reference_file_path || '').trim(),
    reference_file_name: String(raw?.reference_file_name || '').trim(),
    active: raw?.active !== false,
    created_at: raw?.created_at || new Date().toISOString(),
    updated_at: raw?.updated_at || raw?.created_at || new Date().toISOString(),
  }
}

export function createClientContract(raw = {}) {
  return {
    id: raw?.id || globalThis.crypto?.randomUUID?.() || `client-contract-${Date.now()}`,
    client_account_id: raw?.client_account_id || null,
    client_email: normalizeClientEmail(raw?.client_email || ''),
    client_name: String(raw?.client_name || '').trim(),
    company_name: String(raw?.company_name || '').trim(),
    service_name: String(raw?.service_name || '').trim(),
    template_id: String(raw?.template_id || '').trim(),
    template_name: String(raw?.template_name || '').trim(),
    contract_type: String(raw?.contract_type || 'Service Agreement').trim(),
    subject: String(raw?.subject || 'Your agreement with DH Website Services').trim(),
    status: String(raw?.status || 'draft').trim(),
    notes: String(raw?.notes || '').trim(),
    merge_fields: raw?.merge_fields || {},
    template_html: String(raw?.template_html || '').trim(),
    template_reference_file_url: String(raw?.template_reference_file_url || '').trim(),
    template_reference_file_path: String(raw?.template_reference_file_path || '').trim(),
    template_reference_file_name: String(raw?.template_reference_file_name || '').trim(),
    price_amount: raw?.price_amount ?? '',
    currency: String(raw?.currency || 'GBP').trim(),
    payment_terms: String(raw?.payment_terms || '').trim(),
    payment_status: String(raw?.payment_status || '').trim(),
    deposit_amount: raw?.deposit_amount ?? '',
    paid_in_full: Boolean(raw?.paid_in_full),
    issued_by_email: normalizeClientEmail(raw?.issued_by_email || ''),
    issued_by_name: String(raw?.issued_by_name || '').trim(),
    account_manager_name: String(raw?.account_manager_name || '').trim(),
    account_manager_email: normalizeClientEmail(raw?.account_manager_email || ''),
    staff_signature: raw?.staff_signature || null,
    client_signature: raw?.client_signature || null,
    issued_at: raw?.issued_at || null,
    staff_signed_at: raw?.staff_signed_at || null,
    client_signed_at: raw?.client_signed_at || null,
    completed_at: raw?.completed_at || null,
    final_document_url: String(raw?.final_document_url || '').trim(),
    final_document_path: String(raw?.final_document_path || '').trim(),
    voided_at: raw?.voided_at || null,
    created_at: raw?.created_at || new Date().toISOString(),
    updated_at: raw?.updated_at || raw?.created_at || new Date().toISOString(),
  }
}

export const CLIENT_CONTRACT_PLACEHOLDERS = [
  ['client_name', 'Client contact name'],
  ['client_email', 'Client email'],
  ['company_name', 'Company name'],
  ['service_name', 'Service name'],
  ['price_amount', 'Price amount'],
  ['currency', 'Currency'],
  ['payment_terms', 'Payment terms'],
  ['payment_status', 'Payment status'],
  ['deposit_amount', 'Deposit amount'],
  ['issue_date', 'Issue date'],
  ['account_manager_name', 'Account manager name'],
  ['account_manager_email', 'Account manager email'],
]

export function formatCurrencyAmount(amount, currency = 'GBP') {
  const numeric = Number(amount || 0)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency || 'GBP',
    maximumFractionDigits: 2,
  }).format(numeric)
}

export function buildClientContractMergeFields({
  client = {},
  template = {},
  serviceName = '',
  priceAmount = '',
  currency = 'GBP',
  paymentTerms = '',
  paymentStatus = '',
  depositAmount = '',
  paidInFull = false,
  accountManagerName = '',
  accountManagerEmail = '',
} = {}) {
  const today = new Date().toLocaleDateString('en-GB')
  const priceLabel = formatCurrencyAmount(priceAmount, currency)
  const depositLabel = formatCurrencyAmount(depositAmount, currency)
  return {
    client_name: client.contact || client.name || '',
    client_email: normalizeClientEmail(client.email || ''),
    company_name: client.name || '',
    service_name: serviceName || template.contract_type || '',
    price_amount: priceLabel || String(priceAmount || ''),
    currency: currency || 'GBP',
    payment_terms: paidInFull ? 'Paid in full' : paymentTerms,
    payment_status: paidInFull ? 'Paid in full' : (paymentStatus || 'Due on agreed terms'),
    deposit_amount: depositLabel || String(depositAmount || ''),
    issue_date: today,
    account_manager_name: accountManagerName || '',
    account_manager_email: normalizeClientEmail(accountManagerEmail || ''),
  }
}

export function renderClientContractHtml(templateHtml = '', fields = {}) {
  return String(templateHtml || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return String(fields?.[key] ?? '')
  })
}

export function buildClientContractFileName(contract = {}) {
  const base = `${contract.company_name || contract.client_name || contract.client_email || 'client'}-${contract.service_name || contract.template_name || 'contract'}`
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
    email: normalizeClientEmail(email || ''),
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

export function buildSignedClientContractHtml(contract = {}) {
  const body = renderClientContractHtml(contract.template_html || '', contract.merge_fields || {})
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${contract.template_name || 'Client contract'}</title>
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
      <h1 class="title">${contract.template_name || 'Client contract'}</h1>
      <div class="meta">
        <div>${contract.contract_type || 'Service Agreement'}</div>
        <div>${contract.company_name || contract.client_name || ''}</div>
        <div>${contract.service_name || ''}</div>
      </div>
    </div>
    <div class="body">${body}</div>
    <div class="signatures">
      ${signatureBlock(contract.staff_signature, 'Issued by DH Website Services')}
      ${signatureBlock(contract.client_signature, 'Client signature')}
    </div>
    <div class="audit">
      <h3>Audit trail</h3>
      <p>Contract status: ${contract.status || 'draft'}</p>
      <p>Issued: ${contract.issued_at ? new Date(contract.issued_at).toLocaleString('en-GB') : 'Not issued'}</p>
      <p>DH signed: ${contract.staff_signed_at ? new Date(contract.staff_signed_at).toLocaleString('en-GB') : 'Pending'}</p>
      <p>Client signed: ${contract.client_signed_at ? new Date(contract.client_signed_at).toLocaleString('en-GB') : 'Pending'}</p>
      <p>Completed: ${contract.completed_at ? new Date(contract.completed_at).toLocaleString('en-GB') : 'Pending'}</p>
    </div>
  </div>
</body>
</html>`
}

export function getClientContractStatusLabel(status = '') {
  const safe = String(status || '')
  if (safe === 'awaiting_client_signature') return ['Awaiting client signature', 'amber']
  if (safe === 'completed') return ['Completed', 'green']
  if (safe === 'voided') return ['Voided', 'red']
  return ['Draft', 'grey']
}

export async function buildClientContractPdfBlob(contract = {}) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])
  const html = buildSignedClientContractHtml(contract)
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
