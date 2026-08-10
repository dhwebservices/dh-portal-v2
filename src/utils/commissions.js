import { supabase } from './supabase'
import { sendManagedNotification } from './notificationPreferences'
import { logAction } from './audit'

export const COMMISSION_STATUS_LABELS = {
  available: ['Available', 'blue'],
  requested: ['Requested', 'amber'],
  approved: ['Approved', 'green'],
  paid: ['Paid', 'green'],
  rejected: ['Rejected', 'red'],
  void: ['Void', 'grey'],
  pending: ['Available', 'blue'],
}

export function normalizeCommissionEmail(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function formatCommissionCurrency(value = 0) {
  return `£${Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function getCommissionStatusLabel(status = 'available') {
  return COMMISSION_STATUS_LABELS[status] || [status || 'Available', 'grey']
}

export function isCommissionPaidStatus(status = '') {
  return ['paid', 'paid_out', 'confirmed'].includes(String(status || '').toLowerCase())
}

export function calculateCommissionAmount(amount, rate) {
  const saleAmount = Number(amount || 0)
  const commissionRate = Number(rate || 0)
  if (!Number.isFinite(saleAmount) || !Number.isFinite(commissionRate)) return 0
  return Number(((saleAmount * commissionRate) / 100).toFixed(2))
}

export function legacyClientName(row = {}) {
  return row.client_name || row.client || 'Client'
}

export async function loadCommissionSettings(staffEmail) {
  const email = normalizeCommissionEmail(staffEmail)
  if (!email) return null
  const { data, error } = await supabase
    .from('commission_settings')
    .select('*')
    .ilike('staff_email', email)
    .maybeSingle()
  if (error) return null
  return data || null
}

export async function resolveCommissionStaff(staffEmail, fallbackName = '') {
  const email = normalizeCommissionEmail(staffEmail)
  if (!email) return null
  const [settingsRes, profileRes, legacyRes] = await Promise.all([
    supabase.from('commission_settings').select('*').ilike('staff_email', email).maybeSingle(),
    supabase.from('hr_profiles').select('user_email,full_name,manager_email,manager_name').ilike('user_email', email).maybeSingle(),
    supabase.from('staff').select('email,name,commission_rate').ilike('email', email).maybeSingle(),
  ])
  const settings = settingsRes.data || null
  const profile = profileRes.data || null
  const legacy = legacyRes.data || null
  const rate = Number(settings?.commission_rate ?? legacy?.commission_rate ?? 0)
  return {
    email,
    name: settings?.staff_name || profile?.full_name || legacy?.name || fallbackName || email,
    enabled: settings?.enabled !== false,
    commission_rate: Number.isFinite(rate) ? rate : 0,
    manager_email: normalizeCommissionEmail(settings?.manager_email || profile?.manager_email || ''),
    manager_name: settings?.manager_name || profile?.manager_name || '',
  }
}

export async function upsertCommissionSetting({ staffEmail, staffName, commissionRate, enabled = true, managerEmail = '', managerName = '', notes = '', user }) {
  const email = normalizeCommissionEmail(staffEmail)
  if (!email) throw new Error('Select a staff member before saving commission settings.')
  const payload = {
    staff_email: email,
    staff_name: staffName || email,
    commission_rate: Number(commissionRate || 0),
    enabled: enabled !== false,
    manager_email: normalizeCommissionEmail(managerEmail),
    manager_name: managerName || '',
    notes,
    updated_by_email: user?.email || '',
    updated_by_name: user?.name || user?.email || '',
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('commission_settings')
    .upsert(payload, { onConflict: 'staff_email' })
    .select()
    .maybeSingle()
  if (error) throw error
  await supabase.from('staff').upsert({
    email,
    name: payload.staff_name,
    commission_rate: payload.commission_rate,
    status: payload.enabled ? 'active' : 'inactive',
  }, { onConflict: 'email' }).catch(() => {})
  await logAction(user?.email, user?.name, 'commission_settings_updated', payload.staff_name, email, payload).catch(() => {})
  return data || payload
}

export async function createCommissionForPaidSale({
  sourceType,
  sourceId,
  clientId = null,
  clientName = '',
  clientEmail = '',
  saleAmount,
  description = '',
  staffEmail,
  staffName = '',
  date = new Date().toISOString().slice(0, 10),
  user,
}) {
  const amount = Number(saleAmount || 0)
  const ownerEmail = normalizeCommissionEmail(staffEmail || user?.email)
  if (!sourceType || !sourceId || !ownerEmail || !amount || amount <= 0) return null

  const existing = await supabase
    .from('commissions')
    .select('*')
    .eq('source_type', sourceType)
    .eq('source_id', String(sourceId))
    .maybeSingle()
  if (existing.data) return existing.data

  const staff = await resolveCommissionStaff(ownerEmail, staffName || user?.name)
  if (!staff?.enabled || !staff.commission_rate) return null
  const commissionAmount = calculateCommissionAmount(amount, staff.commission_rate)
  if (!commissionAmount) return null

  const payload = {
    staff_name: staff.name,
    staff_email: staff.email,
    client: clientName || clientEmail || 'Client',
    client_name: clientName || clientEmail || 'Client',
    client_id: clientId || null,
    sale_value: amount,
    commission_rate: staff.commission_rate,
    commission_amount: commissionAmount,
    date,
    status: 'available',
    source_type: sourceType,
    source_id: String(sourceId),
    description,
    metadata: {
      client_email: clientEmail,
      created_from: sourceType,
      created_by_email: user?.email || '',
      created_by_name: user?.name || '',
    },
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase.from('commissions').insert([payload]).select().maybeSingle()
  if (error) throw error

  await sendManagedNotification({
    userEmail: staff.email,
    userName: staff.name,
    title: 'Commission available',
    message: `${formatCommissionCurrency(commissionAmount)} commission is now available for ${payload.client_name}.`,
    type: 'success',
    category: 'finance',
    link: '/my-profile?tab=commissions',
    forceDelivery: 'portal',
  }).catch(() => {})

  await logAction(user?.email, user?.name, 'commission_created', payload.client_name, data?.id, payload).catch(() => {})
  return data || payload
}

export async function createManualCommission({ staffEmail, staffName, clientName, clientId, saleAmount, commissionRate, description, user }) {
  const staff = await resolveCommissionStaff(staffEmail, staffName)
  if (!staff?.email) throw new Error('Select a staff member.')
  const rate = Number(commissionRate || staff.commission_rate || 0)
  const amount = Number(saleAmount || 0)
  if (!amount || amount <= 0) throw new Error('Enter a sale amount.')
  const commissionAmount = calculateCommissionAmount(amount, rate)
  const payload = {
    staff_name: staff.name,
    staff_email: staff.email,
    client: clientName || 'Manual commission',
    client_name: clientName || 'Manual commission',
    client_id: clientId || null,
    sale_value: amount,
    commission_rate: rate,
    commission_amount: commissionAmount,
    date: new Date().toISOString().slice(0, 10),
    status: 'available',
    source_type: 'manual',
    source_id: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    description: description || 'Manual commission adjustment',
    metadata: {
      created_by_email: user?.email || '',
      created_by_name: user?.name || '',
      reason: description || '',
    },
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from('commissions').insert([payload]).select().maybeSingle()
  if (error) throw error
  await logAction(user?.email, user?.name, 'commission_manual_added', staff.name, data?.id, payload).catch(() => {})
  return data || payload
}

export async function createCommissionPayoutRequest({ commissions, requestedPayDate, notes = '', user }) {
  const selected = (commissions || []).filter((item) => ['available', 'pending'].includes(String(item.status || 'available')))
  if (!selected.length) throw new Error('Select at least one available commission.')
  const staffEmail = normalizeCommissionEmail(user?.email || selected[0]?.staff_email)
  const staffName = user?.name || selected[0]?.staff_name || staffEmail
  const staff = await resolveCommissionStaff(staffEmail, staffName)
  const amount = selected.reduce((sum, item) => sum + Number(item.commission_amount || 0), 0)
  const ids = selected.map((item) => item.id).filter(Boolean)
  const payload = {
    staff_email: staffEmail,
    staff_name: staffName,
    manager_email: staff?.manager_email || '',
    manager_name: staff?.manager_name || '',
    commission_ids: ids,
    requested_pay_date: requestedPayDate || null,
    requested_amount: amount,
    approved_amount: 0,
    status: 'requested',
    notes,
    requested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from('commission_payout_requests').insert([payload]).select().maybeSingle()
  if (error) throw error
  const request = data || payload
  await supabase.from('commissions').update({
    status: 'requested',
    payout_request_id: request.id,
    requested_pay_date: requestedPayDate || null,
    requested_at: payload.requested_at,
    requested_by_email: staffEmail,
    updated_at: payload.updated_at,
  }).in('id', ids)

  if (staff?.manager_email) {
    await sendManagedNotification({
      userEmail: staff.manager_email,
      userName: staff.manager_name,
      title: 'Commission payout requested',
      message: `${staffName} requested ${formatCommissionCurrency(amount)} commission for payment.`,
      type: 'warning',
      category: 'finance',
      link: '/staff',
      forceDelivery: 'portal',
    }).catch(() => {})
  }
  await logAction(user?.email, user?.name, 'commission_payout_requested', staffName, request.id, payload).catch(() => {})
  return request
}

async function buildCommissionStatementPdf({ request, commissions, actionUser }) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF('p', 'pt', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 48
  let y = 56
  const total = commissions.reduce((sum, item) => sum + Number(item.commission_amount || 0), 0)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(20)
  pdf.text('DH Website Services', margin, y)
  pdf.setFontSize(14)
  pdf.text('Commission Statement', margin, y + 28)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.text('David Hooper Home Limited', pageWidth - margin, y, { align: 'right' })
  pdf.text('mgmt@dhwebsiteservices.co.uk', pageWidth - margin, y + 14, { align: 'right' })
  pdf.text('029 2002 4218', pageWidth - margin, y + 28, { align: 'right' })

  y += 74
  pdf.setDrawColor(220)
  pdf.line(margin, y, pageWidth - margin, y)
  y += 28

  const info = [
    ['Staff member', request.staff_name || request.staff_email],
    ['Staff email', request.staff_email],
    ['Requested pay date', request.requested_pay_date || 'Not specified'],
    ['Marked paid', request.paid_at ? new Date(request.paid_at).toLocaleString('en-GB') : new Date().toLocaleString('en-GB')],
    ['Approved/paid by', request.paid_by_name || actionUser?.name || actionUser?.email || 'Manager'],
  ]
  info.forEach(([label, value]) => {
    pdf.setFont('helvetica', 'bold')
    pdf.text(label, margin, y)
    pdf.setFont('helvetica', 'normal')
    pdf.text(String(value || '—'), margin + 130, y)
    y += 18
  })

  y += 16
  pdf.setFont('helvetica', 'bold')
  pdf.text('Commission lines', margin, y)
  y += 24
  pdf.setFontSize(9)
  pdf.text('Client', margin, y)
  pdf.text('Sale', margin + 220, y, { align: 'right' })
  pdf.text('Rate', margin + 290, y, { align: 'right' })
  pdf.text('Commission', pageWidth - margin, y, { align: 'right' })
  y += 10
  pdf.line(margin, y, pageWidth - margin, y)
  y += 18

  commissions.forEach((item) => {
    if (y > 730) {
      pdf.addPage()
      y = 56
    }
    pdf.setFont('helvetica', 'normal')
    pdf.text(String(legacyClientName(item)).slice(0, 38), margin, y)
    pdf.text(formatCommissionCurrency(item.sale_value), margin + 220, y, { align: 'right' })
    pdf.text(`${Number(item.commission_rate || 0)}%`, margin + 290, y, { align: 'right' })
    pdf.text(formatCommissionCurrency(item.commission_amount), pageWidth - margin, y, { align: 'right' })
    y += 18
  })

  y += 10
  pdf.line(margin, y, pageWidth - margin, y)
  y += 24
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.text('Total paid', margin, y)
  pdf.text(formatCommissionCurrency(total), pageWidth - margin, y, { align: 'right' })

  y += 42
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text('This statement confirms commission marked as paid in the DH Website Services staff portal.', margin, y)

  return pdf.output('blob')
}

export async function decideCommissionPayoutRequest({ request, status, managerNotes = '', user }) {
  if (!request?.id) throw new Error('Missing payout request.')
  const nextStatus = String(status || '').toLowerCase()
  if (!['approved', 'rejected', 'paid'].includes(nextStatus)) throw new Error('Invalid payout status.')
  const commissionIds = Array.isArray(request.commission_ids) ? request.commission_ids : []
  const { data: lines } = commissionIds.length
    ? await supabase.from('commissions').select('*').in('id', commissionIds)
    : { data: [] }
  const selected = lines || []
  const total = selected.reduce((sum, item) => sum + Number(item.commission_amount || 0), 0)
  const now = new Date().toISOString()
  const patch = {
    status: nextStatus,
    manager_notes: managerNotes,
    decided_by_email: user?.email || '',
    decided_by_name: user?.name || user?.email || '',
    decided_at: now,
    approved_amount: nextStatus === 'rejected' ? 0 : total,
    updated_at: now,
  }
  const linePatch = {
    status: nextStatus,
    updated_at: now,
  }
  if (nextStatus === 'approved') {
    Object.assign(linePatch, { approved_by_email: user?.email || '', approved_by_name: user?.name || '', approved_at: now })
  }
  if (nextStatus === 'rejected') {
    Object.assign(linePatch, { rejected_by_email: user?.email || '', rejected_by_name: user?.name || '', rejected_at: now, rejection_reason: managerNotes })
  }
  if (nextStatus === 'paid') {
    Object.assign(patch, { paid_by_email: user?.email || '', paid_by_name: user?.name || user?.email || '', paid_at: now })
    Object.assign(linePatch, { paid_by_email: user?.email || '', paid_by_name: user?.name || user?.email || '', paid_at: now })
  }

  let statementUrl = ''
  let statementPath = ''
  if (nextStatus === 'paid' && selected.length) {
    const requestForPdf = { ...request, ...patch }
    const blob = await buildCommissionStatementPdf({ request: requestForPdf, commissions: selected, actionUser: user })
    statementPath = `commission-statements/${normalizeCommissionEmail(request.staff_email)}/${new Date().toISOString().slice(0, 10)}-${request.id}.pdf`
    const { error: uploadError } = await supabase.storage.from('hr-documents').upload(statementPath, blob, { contentType: 'application/pdf', upsert: true })
    if (!uploadError) {
      const { data: urlData } = supabase.storage.from('hr-documents').getPublicUrl(statementPath)
      statementUrl = urlData.publicUrl
      Object.assign(patch, { statement_file_url: statementUrl, statement_file_path: statementPath })
      Object.assign(linePatch, { statement_file_url: statementUrl, statement_file_path: statementPath })
      await supabase.from('payslips').insert([{
        user_email: request.staff_email,
        user_name: request.staff_name,
        period: `Commission statement ${new Date().toLocaleDateString('en-GB')}`,
        file_url: statementUrl,
        file_path: statementPath,
        uploaded_by: user?.name || user?.email || 'Portal',
        uploaded_at: now,
      }]).catch(() => {})
      await supabase.from('staff_documents').insert([{
        staff_email: request.staff_email,
        name: 'Commission statement.pdf',
        type: 'Commission Statement',
        file_url: statementUrl,
        file_path: statementPath,
        created_at: now,
      }]).catch(() => {})
    }
  }

  const { data, error } = await supabase.from('commission_payout_requests').update(patch).eq('id', request.id).select().maybeSingle()
  if (error) throw error
  if (commissionIds.length) {
    await supabase.from('commissions').update(linePatch).in('id', commissionIds)
  }

  const message = nextStatus === 'paid'
    ? `Your commission payout of ${formatCommissionCurrency(total)} has been marked as paid.`
    : nextStatus === 'approved'
      ? `Your commission payout request for ${formatCommissionCurrency(total)} has been approved.`
      : `Your commission payout request for ${formatCommissionCurrency(request.requested_amount || total)} was rejected.`
  await sendManagedNotification({
    userEmail: request.staff_email,
    userName: request.staff_name,
    title: nextStatus === 'paid' ? 'Commission paid' : nextStatus === 'approved' ? 'Commission approved' : 'Commission request rejected',
    message,
    type: nextStatus === 'rejected' ? 'warning' : 'success',
    category: 'finance',
    link: statementUrl || '/my-profile?tab=commissions',
    forceDelivery: nextStatus === 'paid' ? 'both' : 'portal',
  }).catch(() => {})

  await logAction(user?.email, user?.name, `commission_payout_${nextStatus}`, request.staff_name, request.id, { total, statementPath }).catch(() => {})
  return data || { ...request, ...patch }
}

export async function loadCommissionAdminData() {
  const [staffRes, profileRes, settingsRes, commissionRes, requestRes] = await Promise.all([
    supabase.from('staff').select('*').order('name'),
    supabase.from('hr_profiles').select('user_email,full_name,role,manager_email,manager_name').order('full_name'),
    supabase.from('commission_settings').select('*').order('staff_name'),
    supabase.from('commissions').select('*').order('date', { ascending: false }).limit(300),
    supabase.from('commission_payout_requests').select('*').order('requested_at', { ascending: false }).limit(100),
  ])
  return {
    staff: staffRes.data || [],
    profiles: profileRes.data || [],
    settings: settingsRes.data || [],
    commissions: commissionRes.data || [],
    requests: requestRes.data || [],
    errors: [staffRes.error, profileRes.error, settingsRes.error, commissionRes.error, requestRes.error].filter(Boolean),
  }
}
