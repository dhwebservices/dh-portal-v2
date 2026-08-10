import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { PaymentsHub } from '../components/PaymentsHub'
import { setupMandate, getBillingRequest, getMandates, createPayment, createSubscription, cancelSubscription, getPayments, getSubscriptions, mandateStatusColor, paymentStatusColor } from '../utils/gocardless'
import { sendEmail } from '../utils/email'
import { logAction } from '../utils/audit'
import { deleteClientAccountByEmail, logClientActivity, syncClientLinkedRecords, upsertClientAccount } from '../utils/clientAccounts'
import { createCommissionForPaidSale, isCommissionPaidStatus } from '../utils/commissions'
import {
  buildClientOnboardingKey,
  getOnboardingStatusLabel,
  getOnboardingStatusTone,
  getOrderedOnboardingSections,
  ONBOARDING_SECTION_ORDER,
  resolveClientOnboardingState,
} from '../utils/clientOnboarding'
import { Button, FormField, FormLabel, FormInput, FormSelect, StatusBadge } from '../components/ds'

const DS_CARD = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)' }
const TONE_TO_VARIANT = { green: 'active', amber: 'warning', red: 'error', blue: 'info', grey: 'neutral' }

const PLANS    = ['Starter','Growth','Pro','Enterprise']
const STATUSES = ['active','inactive','pending']
const HOSTING  = [{ id:'h1',name:'Hosting Starter',price:35 },{ id:'h2',name:'Hosting Pro',price:65 },{ id:'h3',name:'Hosting Business',price:109 }]
const GO_CARDLESS_TEMPLATES = [
  { id:'tpl-hr-maintenance', name:'HR: Monthly Maintenance', amount:49 },
  { id:'tpl-hosting-business', name:'Hosting: Business', amount:109 },
  { id:'tpl-hosting-professional', name:'Hosting: Professional', amount:65 },
  { id:'tpl-hosting-starter', name:'Hosting: Starter', amount:35 },
  { id:'tpl-enterprise-hr', name:'Enterprise & HR Build', amount:2499 },
  { id:'tpl-website-pro', name:'Website Build: Pro', amount:1499 },
  { id:'tpl-website-growth', name:'Website Build: Growth', amount:999 },
  { id:'tpl-website-starter', name:'Website Build: Starter', amount:499 },
]
const MANUAL_PAYMENT_OPTIONS = [
  ['manual:starter', 'Starter'],
  ['manual:growth', 'Growth'],
  ['manual:pro', 'Pro'],
  ['manual:enterprise', 'Enterprise'],
  ['manual:custom', 'Manual / Custom'],
]

function paymentAmountPounds(payment) {
  const amount = Number(payment?.amount || 0)
  return payment?.currency === 'GBP' ? amount / 100 : amount
}

function paymentTypeLabel(rawPaymentType) {
  // payment_type is nullable; a default param only catches undefined.
  const paymentType = String(rawPaymentType || '')
  if (paymentType === 'one_off') return 'One-off DD'
  if (paymentType === 'subscription') return 'Subscription'
  if (paymentType.startsWith('manual:')) {
    const key = paymentType.split(':')[1]
    return key === 'custom' ? 'Manual / Custom' : `Manual — ${key.charAt(0).toUpperCase()}${key.slice(1)}`
  }
  return paymentType || 'Payment'
}

export default function ClientProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [client, setClient]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('overview')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [form, setForm]         = useState({})
  const pf = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Invoices
  const [invoices, setInvoices] = useState([])
  const [invModal, setInvModal] = useState(false)
  const [invForm, setInvForm]   = useState({ invoice_number:'', description:'', amount:'', due_date:'', payment_type:'one_off' })

  // Payments / GoCardless
  const [gcStatus, setGcStatus] = useState(null)
  const [payments, setPayments] = useState([])
  const [manualPayments, setManualPayments] = useState([])
  const [subs, setSubs]         = useState([])
  const [gcLoading, setGcLoading] = useState(false)
  const [settingUp, setSettingUp] = useState(false)
  const [payModal, setPayModal] = useState(null) // 'one_off' | 'subscription' | 'manual'
  const [payForm, setPayForm]   = useState({ amount:'', description:'', name:'', day_of_month:1, manual_type:'manual:custom', manual_status:'paid' })
  const [linkGcModal, setLinkGcModal] = useState(false)
  const [linkGcForm, setLinkGcForm] = useState({ customer_id:'', mandate_id:'', status:'active' })
  const [gcError, setGcError]   = useState('')
  const [gcSuccess, setGcSuccess] = useState('')
  const [staffProfiles, setStaffProfiles] = useState([])
  const [commissionOwnerEmail, setCommissionOwnerEmail] = useState(user?.email || '')

  // Activity + docs
  const [activity, setActivity] = useState([])
  const [tickets, setTickets]   = useState([])
  const [onboardingSummary, setOnboardingSummary] = useState(null)
  const [onboardingSections, setOnboardingSections] = useState({})
  const [onboardingLoading, setOnboardingLoading] = useState(false)
  const [onboardingSaving, setOnboardingSaving] = useState(false)
  const [onboardingSource, setOnboardingSource] = useState({ summaryKey: '', resolvedEmail: '', linkedAccountId: '' })

  const refreshMandateStatus = async (status, clientRecord = client) => {
    if (!status || !clientRecord?.email) return false

    let customerId = status.customer_id || null

    if (!customerId && status.billing_request_id) {
      const billingRequest = await getBillingRequest(status.billing_request_id)
      customerId =
        billingRequest.billing_requests?.resources?.customer?.id ||
        billingRequest.billing_requests?.links?.customer ||
        billingRequest.customer?.id ||
        null
    }

    if (!customerId) return false

    const { mandates } = await getMandates(customerId)
    const active = mandates?.find(m => m.status === 'active') || mandates?.[0]
    if (!active) return false

    const patch = { customer_id: customerId, mandate_id: active.id, status: active.status, billing_request_id: status.billing_request_id || null }

    await supabase
      .from('gocardless_mandates')
      .upsert({ client_email: clientRecord.email, client_name: clientRecord.name, ...patch }, { onConflict: 'client_email' })

    setGcStatus(p => ({ ...p, ...patch, client_email: clientRecord.email }))
    return patch
  }

  const triggerMandateRefresh = async (status = gcStatus, clientRecord = client) => {
    if (!(status?.customer_id || status?.billing_request_id) || status?.mandate_id) return
    try {
      const patch = await refreshMandateStatus(status, clientRecord)
      if (patch?.mandate_id) {
        const [paymentResult, subscriptionResult] = await Promise.all([
          getPayments(patch.mandate_id).catch(() => ({ payments: [] })),
          getSubscriptions(patch.mandate_id).catch(() => ({ subscriptions: [] })),
        ])
        setPayments(paymentResult.payments || [])
        setSubs(subscriptionResult.subscriptions || [])
        setGcSuccess('Direct Debit mandate is now active')
      }
    } catch {}
  }

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('clients').select('*').eq('id', id).maybeSingle(),
      fetch(`https://xtunnfdwltfesscmpove.supabase.co/rest/v1/client_invoices?client_id=eq.${id}&order=created_at.desc`, { headers: { apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM', Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM' } }).then(r => r.json()),
    ]).then(async ([{ data: c }, { data: inv }]) => {
      if (!c) { navigate('/clients'); return }
      const [{ data: gc }, { data: localPayments }, { data: staffRows }] = await Promise.all([
        supabase.from('gocardless_mandates').select('*').eq('client_email', c.email).maybeSingle(),
        supabase.from('client_payments').select('*').eq('client_email', c.email).order('created_at', { ascending:false }),
        supabase.from('hr_profiles').select('user_email,full_name,role').not('user_email', 'is', null).order('full_name'),
      ])
      setClient(c)
      setForm({ ...c })
      setInvoices(Array.isArray(inv) ? inv : [])
      setGcStatus(gc)
      setStaffProfiles(staffRows || [])
      setCommissionOwnerEmail(c.salesperson_email || c.assigned_to_email || c.created_by_email || user?.email || '')
      setManualPayments((localPayments || []).filter(p => String(p.payment_type || '').startsWith('manual:')))
      setLoading(false)
      // Load activity by email
      if (c?.email) {
        supabase.from('client_activity').select('*').ilike('client_email', c.email).order('created_at', { ascending:false }).limit(20)
          .then(({ data: act }) => setActivity(act || []))
      }

      // Load GC payments if mandate exists
      if (gc?.mandate_id) {
        try {
          const [p, s] = await Promise.all([getPayments(gc.mandate_id), getSubscriptions(gc.mandate_id)])
          setPayments(p.payments || [])
          setSubs(s.subscriptions || [])
        } catch {}
      } else if ((gc?.customer_id || gc?.billing_request_id) && c?.email) {
        try {
          await refreshMandateStatus(gc, c)
        } catch {}
      }
    })
  }, [id])

  useEffect(() => {
    if (!client?.email || !gcStatus || gcStatus?.mandate_id) return

    const refresh = () => {
      triggerMandateRefresh(gcStatus, client)
    }

    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    refresh()

    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [client?.email, gcStatus?.billing_request_id, gcStatus?.customer_id, gcStatus?.mandate_id])

  // Also load tickets by email once we have the client
  useEffect(() => {
    if (!client?.email) return
    supabase.from('support_tickets').select('*').ilike('client_email', client.email).order('created_at', { ascending:false })
      .then(({ data }) => setTickets(data || []))
  }, [client?.email])

  const loadOnboarding = async (clientRecord = client) => {
    if (!clientRecord?.email) return
    setOnboardingLoading(true)
    const resolved = await resolveClientOnboardingState(supabase, clientRecord)
    setOnboardingSummary(resolved.summary)
    setOnboardingSections(resolved.sections)
    setOnboardingSource({
      summaryKey: resolved.summaryKey || buildClientOnboardingKey(clientRecord.email),
      resolvedEmail: resolved.resolvedEmail || clientRecord.email,
      linkedAccountId: resolved.linkedAccountId || '',
    })
    setOnboardingLoading(false)
  }

  useEffect(() => {
    if (!client?.email) return undefined

    loadOnboarding(client)

    const channel = supabase
      .channel(`staff-client-onboarding-${client.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_settings' }, (payload) => {
        const key = payload.new?.key || payload.old?.key || ''
        if (
          key.startsWith('client_onboarding:') ||
          key.startsWith('client_onboarding_section:') ||
          (onboardingSource.linkedAccountId && key === `client_lifecycle:${onboardingSource.linkedAccountId}`)
        ) {
          loadOnboarding(client)
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [client?.email, client?.id, onboardingSource.linkedAccountId])

  const approveOnboarding = async () => {
    if (!client?.email || !onboardingSummary) return
    setOnboardingSaving(true)

    const nextSummary = {
      ...onboardingSummary,
      client_email: onboardingSource.resolvedEmail || onboardingSummary.client_email || client.email,
      approved_at: new Date().toISOString(),
      approved_by: user?.email || user?.name || 'staff',
      updated_at: new Date().toISOString(),
      updated_by: user?.email || user?.name || 'staff',
    }

    await supabase.from('portal_settings').upsert({
      key: onboardingSource.summaryKey || buildClientOnboardingKey(onboardingSource.resolvedEmail || client.email),
      value: nextSummary,
    }, { onConflict: 'key' })

    await logClientActivity({
      clientEmail: client.email,
      eventType: 'onboarding_reviewed',
      title: 'Client onboarding reviewed',
      description: 'Staff marked the onboarding submission as reviewed in the staff portal.',
    })

    setOnboardingSummary(nextSummary)
    setOnboardingSaving(false)
  }

  const save = async () => {
    setSaving(true)
    const previousEmail = client?.email || ''
    const nextEmail = form.email || previousEmail
    const updatedClient = { ...client, ...form, updated_at: new Date().toISOString() }
    await supabase.from('clients').update(updatedClient).eq('id', id)
    await upsertClientAccount(updatedClient)
    await syncClientLinkedRecords({ oldEmail: previousEmail || nextEmail, newEmail: nextEmail, clientName: form.name || client?.name })
    if (previousEmail && previousEmail.toLowerCase() !== String(nextEmail || '').toLowerCase()) {
      await deleteClientAccountByEmail(previousEmail)
    }
    await logAction(user?.email, user?.name, 'client_updated', form.name, id, {})
    setClient(p => ({ ...p, ...form }))
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  // ── GoCardless ───────────────────────────────────────────────────────
  const doSetupMandate = async () => {
    setSettingUp(true); setGcError('')
    try {
      const data = await setupMandate(client.email, client.name)
      const { data: saved } = await supabase.from('gocardless_mandates').upsert({
        client_email: client.email, client_name: client.name,
        customer_id: data.customer_id, billing_request_id: data.billing_request_id, status: 'pending',
      }, { onConflict: 'client_email' }).select().maybeSingle()
      setGcStatus(saved)
      window.open(data.redirect_url, '_blank')
      setGcSuccess('GoCardless page opened in new tab. Ask the client to complete their bank details.')
    } catch (e) { setGcError(e.message) }
    setSettingUp(false)
  }

  const doPayment = async () => {
    if (!payForm.amount) return
    setSaving(true); setGcError('')
    try {
      const result = await createPayment(gcStatus.mandate_id, Number(payForm.amount), payForm.description || 'DH Website Services')
      const { data: insertedPayments } = await supabase.from('client_payments').insert([{
        client_id: id, client_email: client.email, client_name: client.name,
        amount: payForm.amount, payment_type: 'one_off',
        status: result.payment?.status || 'pending', gocardless_id: result.payment?.id,
        created_at: new Date().toISOString(),
      }]).select()
      const paymentRow = insertedPayments?.[0]
      if (isCommissionPaidStatus(paymentRow?.status || result.payment?.status)) {
        await createCommissionForPaidSale({
          sourceType: 'client_payment',
          sourceId: paymentRow?.id || result.payment?.id,
          clientId: id,
          clientName: client.name,
          clientEmail: client.email,
          saleAmount: payForm.amount,
          description: payForm.description || 'One-off Direct Debit payment',
          staffEmail: commissionOwnerEmail || user?.email,
          user,
        }).catch((error) => setGcError(`Payment saved but commission was not created: ${error.message}`))
      }
      setGcSuccess(`Payment of £${payForm.amount} created — ${result.payment?.status}`)
      setPayModal(null); setPayForm({ amount:'', description:'', name:'', day_of_month:1 })
      const p = await getPayments(gcStatus.mandate_id)
      setPayments(p.payments || [])
    } catch (e) { setGcError(e.message) }
    setSaving(false)
  }

  const doSubscription = async () => {
    if (!payForm.amount) return
    setSaving(true); setGcError('')
    try {
      const result = await createSubscription(gcStatus.mandate_id, Number(payForm.amount), payForm.name || 'DH Website Services', payForm.day_of_month)
      await supabase.from('client_payments').insert([{
        client_id: id, client_email: client.email, client_name: client.name,
        amount: payForm.amount, payment_type: 'subscription',
        status: result.subscription?.status || 'pending', gocardless_id: result.subscription?.id,
        created_at: new Date().toISOString(),
      }])
      setGcSuccess(`Subscription of £${payForm.amount}/mo set up`)
      setPayModal(null); setPayForm({ amount:'', description:'', name:'', day_of_month:1 })
      const s = await getSubscriptions(gcStatus.mandate_id)
      setSubs(s.subscriptions || [])
    } catch (e) { setGcError(e.message) }
    setSaving(false)
  }

  const doCancel = async (subId) => {
    if (!confirm('Cancel this subscription? Payments will stop.')) return
    try {
      await cancelSubscription(subId)
      setGcSuccess('Subscription cancelled')
      const s = await getSubscriptions(gcStatus.mandate_id)
      setSubs(s.subscriptions || [])
    } catch (e) { setGcError(e.message) }
  }

  const doManualPayment = async () => {
    if (!payForm.amount) return
    setSaving(true); setGcError('')
    try {
      const manualEntry = {
        client_id: id,
        client_email: client.email,
        client_name: client.name,
        amount: Number(payForm.amount),
        payment_type: payForm.manual_type || 'manual:custom',
        status: payForm.manual_status || 'paid',
        description: payForm.description || null,
        created_at: new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from('client_payments')
        .insert([manualEntry])
        .select()
      if (error) throw error
      const created = data?.[0] || manualEntry
      setManualPayments(prev => [created, ...prev])
      if (isCommissionPaidStatus(created.status)) {
        await createCommissionForPaidSale({
          sourceType: 'manual_payment',
          sourceId: created.id,
          clientId: id,
          clientName: client.name,
          clientEmail: client.email,
          saleAmount: created.amount,
          description: payForm.description || 'Manual payment',
          staffEmail: commissionOwnerEmail || user?.email,
          user,
        }).catch((error) => setGcError(`Payment saved but commission was not created: ${error.message}`))
      }
      setGcSuccess('Manual payment recorded')
      setPayModal(null)
      setPayForm({ amount:'', description:'', name:'', day_of_month:1, manual_type:'manual:custom', manual_status:'paid' })
    } catch (e) {
      setGcError(e.message)
    }
    setSaving(false)
  }

  const linkExistingMandate = async () => {
    if (!linkGcForm.customer_id?.trim()) return
    setSaving(true); setGcError('')
    try {
      const record = {
        client_email: client.email,
        client_name: client.name,
        customer_id: linkGcForm.customer_id.trim(),
        mandate_id: linkGcForm.mandate_id.trim() || null,
        status: linkGcForm.status || 'active',
        created_at: new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from('gocardless_mandates')
        .upsert([record], { onConflict: 'client_email' })
        .select()
        .maybeSingle()
      if (error) throw error
      setGcStatus(data || record)
      setGcSuccess('Existing GoCardless customer linked to this client')
      setLinkGcModal(false)
      setLinkGcForm({ customer_id:'', mandate_id:'', status:'active' })
      if (!record.mandate_id) {
        await triggerMandateRefresh(data || record, client)
      }
    } catch (e) {
      setGcError(e.message)
    }
    setSaving(false)
  }

  const SB_URL = 'https://xtunnfdwltfesscmpove.supabase.co'
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM'
  const sbHeaders = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }

  const createInvoice = async () => {
    if (!invForm.description?.trim() || !invForm.amount) { alert('Description and amount are required'); return }
    setSaving(true)
    try {
      const inv = {
        client_id:     id,
        client_email:  client.email,
        client_name:   client.name,
        invoice_number: invForm.invoice_number || null,
        description:   invForm.description,
        amount:        invForm.amount,
        due_date:      invForm.due_date || null,
        payment_type:  invForm.payment_type || 'one_off',
        status:        'unpaid',
        created_by:    user?.name || null,
        created_at:    new Date().toISOString(),
      }
      // Use raw REST to avoid supabase-js columns= bug
      const res = await fetch(`${SB_URL}/rest/v1/client_invoices`, {
        method: 'POST', headers: sbHeaders, body: JSON.stringify(inv)
      })
      if (!res.ok) { const e = await res.text(); throw new Error(e) }

      // Send invoice email
      try { await sendEmail('invoice_issued', { clientEmail: client.email, clientName: client.name, ...invForm }) } catch {}

      await logClientActivity({
        clientEmail: client.email,
        eventType: 'invoice_issued',
        title: invForm.description || 'Invoice issued',
        description: invForm.invoice_number ? `Invoice #${invForm.invoice_number} was issued.` : 'A new invoice was issued to your account.',
        amount: Number(invForm.amount || 0) || null,
      })

      // If DD mandate active + one_off, collect via GoCardless
      if (gcStatus?.mandate_id && invForm.payment_type === 'one_off' && invForm.amount) {
        try { await createPayment(gcStatus.mandate_id, Number(invForm.amount), invForm.description) } catch {}
      }

      // Reload invoices via raw REST
      const listRes = await fetch(`${SB_URL}/rest/v1/client_invoices?client_id=eq.${id}&order=created_at.desc`, {
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
      })
      setInvoices(listRes.ok ? await listRes.json() : [])

      setInvModal(false)
      setInvForm({ invoice_number:'', description:'', amount:'', due_date:'', payment_type:'one_off' })
    } catch (err) {
      console.error('Invoice error:', err)
      alert('Failed to create invoice: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const markPaid = async (invId) => {
    const SB_URL2 = 'https://xtunnfdwltfesscmpove.supabase.co'
    const SB_KEY2 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM'
    await fetch(`${SB_URL2}/rest/v1/client_invoices?id=eq.${invId}`, {
      method: 'PATCH',
      headers: { 'apikey': SB_KEY2, 'Authorization': 'Bearer ' + SB_KEY2, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString() })
    })
    const invoice = invoices.find((item) => item.id === invId)
    await logClientActivity({
      clientEmail: client.email,
      eventType: 'invoice_paid',
      title: invoice?.description || 'Invoice paid',
      description: invoice?.invoice_number ? `Invoice #${invoice.invoice_number} was marked as paid.` : 'A payment was recorded on your account.',
      amount: Number(invoice?.amount || 0) || null,
    })
    await createCommissionForPaidSale({
      sourceType: 'client_invoice',
      sourceId: invId,
      clientId: id,
      clientName: client.name,
      clientEmail: client.email,
      saleAmount: invoice?.amount,
      description: invoice?.description || 'Paid invoice',
      staffEmail: commissionOwnerEmail || user?.email,
      user,
    }).catch((error) => {
      console.warn('Commission creation failed:', error)
    })
    setInvoices(p => p.map(i => i.id === invId ? { ...i, status:'paid' } : i))
  }

  const allPayments = [...manualPayments, ...payments]
  const totalCollected = allPayments
    .filter(p => ['paid_out', 'confirmed', 'paid'].includes(String(p.status || '').toLowerCase()))
    .reduce((s, p) => s + paymentAmountPounds(p), 0)
  const activeSubs = subs.filter(s => s.status === 'active')
  const unpaidInvoices = invoices.filter(i => i.status === 'unpaid')
  const openTickets = tickets.filter(t => t.status === 'open')
  const recentInvoices = invoices.slice(0, 3)
  const recentTickets = tickets.slice(0, 3)
  const recentActivity = activity.slice(0, 4)
  const latestActivity = activity[0]
  const latestInvoice = invoices[0]
  const latestTicket = tickets[0]
  const accountHealth = gcStatus?.mandate_id
    ? 'Direct Debit active'
    : gcStatus?.billing_request_id
      ? 'Direct Debit pending'
      : 'No Direct Debit set up'

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (!client) return null

  const colour = ['#0071E3','#30A46C','#E54D2E','#8E4EC6','#C2500D','#0197C8','#D6409F'][(client.email||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0)%7]

  return (
    <div className="ds-content">
      {/* Back */}
      <button onClick={() => navigate('/clients')} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'1px solid var(--color-border)', borderRadius:100, padding:'6px 14px', cursor:'pointer', color:'var(--color-text-secondary)', fontSize:13, marginBottom:24, transition:'all 0.15s' }}
        onMouseOver={e => e.currentTarget.style.borderColor='var(--color-text-primary)'}
        onMouseOut={e => e.currentTarget.style.borderColor='var(--color-border)'}>
        ← Clients
      </button>

      {/* Hero */}
      <div className="client-profile-hero" style={{ display:'flex', alignItems:'center', gap:20, padding:'24px 28px', background:'var(--color-bg-surface)', borderRadius:16, border:'1px solid var(--color-border)', marginBottom:24 }}>
        <div style={{ width:64, height:64, borderRadius:14, background:colour+'18', border:`2px solid ${colour}33`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:700, color:colour, flexShrink:0 }}>
          {(client.name||'?')[0].toUpperCase()}
        </div>
        <div className="client-profile-hero-meta" style={{ flex:1 }}>
          <h1 style={{ fontSize:28, fontWeight:400, letterSpacing:'-0.02em', lineHeight:1, color:'var(--color-text-primary)' }}>{client.name}</h1>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:8 }}>
            {client.contact && <span style={{ fontSize:13, color:'var(--color-text-secondary)' }}>{client.contact}</span>}
            <span style={{ color:'var(--color-border)' }}>·</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--color-text-tertiary)' }}>{client.email}</span>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:10 }}>
            <StatusBadge variant="info">{client.plan}</StatusBadge>
            <StatusBadge variant={client.status==='active'?'active':client.status==='pending'?'warning':'info'}>{client.status}</StatusBadge>
            {client.value && <StatusBadge variant="info">£{Number(client.value).toLocaleString()}</StatusBadge>}
            <StatusBadge variant={client.invoice_paid?'active':'warning'}>{client.invoice_paid?'Invoice Paid':'Invoice Unpaid'}</StatusBadge>
          </div>
        </div>
        <div className="client-profile-hero-actions" style={{ display:'flex', gap:8, flexShrink:0 }}>
          {saved && <span style={{ fontSize:13, color:'var(--color-green-500)', alignSelf:'center' }}>✓ Saved</span>}
          <Button variant="primary" onClick={save} disabled={saving}>{saving?'Saving...':'Save Changes'}</Button>
        </div>
      </div>

      <div style={{ ...DS_CARD, padding:20, marginBottom:18, display:'grid', gridTemplateColumns:'minmax(220px, 1fr) minmax(220px, 1fr)', gap:12, alignItems:'end' }}>
        <FormField>
          <FormLabel>Commission owner</FormLabel>
          <FormSelect value={commissionOwnerEmail || ''} onChange={(event) => setCommissionOwnerEmail(event.target.value)}>
            <option value="">No commission owner</option>
            {staffProfiles.map((member) => (
              <option key={member.user_email} value={member.user_email}>{member.full_name || member.user_email}</option>
            ))}
          </FormSelect>
        </FormField>
        <div style={{ fontSize:12.5, color:'var(--color-text-secondary)', lineHeight:1.6 }}>
          Paid invoices and paid manual payments create commission for this staff member when their commission setting is enabled.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {[['overview','Overview'],['onboarding','Onboarding'],['payments','Payments'],['invoices','Invoices'],['tickets','Tickets'],['activity','Activity']].map(([k,l]) => (
          <Button key={k} onClick={() => setTab(k)} variant={tab===k ? 'primary' : 'secondary'} style={{ height:30, fontSize:12, padding:'0 10px' }}>{l}</Button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="client-profile-overview-grid" style={{ display:'grid', gridTemplateColumns:'minmax(0, 1.45fr) minmax(320px, 0.95fr)', gap:20 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <div className="client-profile-summary-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:12 }}>
              <div style={{ ...DS_CARD, padding:20 }}><div style={{ fontSize:24, fontWeight:600, color:'var(--color-primary)' }}>£{totalCollected.toLocaleString()}</div><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Collected</div></div>
              <div style={{ ...DS_CARD, padding:20 }}><div style={{ fontSize:24, fontWeight:600, color:'var(--color-green-500)' }}>{activeSubs.length}</div><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Active Subs</div></div>
              <div style={{ ...DS_CARD, padding:20 }}><div style={{ fontSize:24, fontWeight:600, color:'var(--color-amber-500)' }}>{unpaidInvoices.length}</div><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Unpaid Invoices</div></div>
              <div style={{ ...DS_CARD, padding:20 }}><div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-secondary)' }}>{openTickets.length}</div><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Open Tickets</div></div>
            </div>

            <div style={{ ...DS_CARD, padding:20 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:14 }}>Account Snapshot</div>
              <div className="client-profile-detail-list" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ padding:'14px 16px', border:'1px solid var(--color-border)', borderRadius:12, background:'var(--color-gray-50)' }}>
                  <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Payments</div>
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--color-text-primary)' }}>{accountHealth}</div>
                  <div style={{ fontSize:12, color:'var(--color-text-tertiary)', marginTop:6 }}>
                    {gcStatus?.mandate_id
                      ? `Mandate ${gcStatus.mandate_id}`
                      : gcStatus?.billing_request_id
                        ? 'Waiting for client authorisation'
                        : 'Client has not set up Direct Debit yet'}
                  </div>
                </div>
                <div style={{ padding:'14px 16px', border:'1px solid var(--color-border)', borderRadius:12, background:'var(--color-gray-50)' }}>
                  <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Latest activity</div>
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--color-text-primary)' }}>{latestActivity?.event_type?.replace(/_/g, ' ') || 'No recent activity'}</div>
                  <div style={{ fontSize:12, color:'var(--color-text-tertiary)', marginTop:6 }}>
                    {latestActivity ? new Date(latestActivity.created_at).toLocaleString('en-GB') : 'Activity will appear here once recorded'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ ...DS_CARD, padding:20 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:14 }}>Client Details</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16 }}>
                <FormField><FormLabel>Business Name</FormLabel><FormInput value={form.name||''} onChange={e=>pf('name',e.target.value)}/></FormField>
                <FormField><FormLabel>Contact Person</FormLabel><FormInput value={form.contact||''} onChange={e=>pf('contact',e.target.value)}/></FormField>
                <FormField><FormLabel>Email</FormLabel><FormInput type="email" value={form.email||''} onChange={e=>pf('email',e.target.value)}/></FormField>
                <FormField><FormLabel>Phone</FormLabel><FormInput value={form.phone||''} onChange={e=>pf('phone',e.target.value)}/></FormField>
                <FormField><FormLabel>Plan</FormLabel>
                  <FormSelect value={form.plan||''} onChange={e=>pf('plan',e.target.value)}>
                    {PLANS.map(p => <option key={p}>{p}</option>)}
                  </FormSelect>
                </FormField>
                <FormField><FormLabel>Status</FormLabel>
                  <FormSelect value={form.status||''} onChange={e=>pf('status',e.target.value)}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </FormSelect>
                </FormField>
                <FormField><FormLabel>Value (£)</FormLabel><FormInput type="number" value={form.value||''} onChange={e=>pf('value',e.target.value)}/></FormField>
                <FormField><FormLabel>Website URL</FormLabel><FormInput value={form.website_url||''} onChange={e=>pf('website_url',e.target.value)} placeholder="https://"/></FormField>
                <FormField className="staff-onboarding-fc"><FormLabel>Notes</FormLabel><textarea className="ds-form-input" rows={3} value={form.notes||''} onChange={e=>pf('notes',e.target.value)} style={{ resize:'vertical' }}/></FormField>
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, marginTop:14 }}>
                <input type="checkbox" checked={!!form.invoice_paid} onChange={e=>pf('invoice_paid',e.target.checked)} style={{ accentColor:'var(--color-primary)', width:16, height:16 }}/>
                Invoice Paid
              </label>
            </div>
          </div>

          <div className="client-profile-side-stack" style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ ...DS_CARD, padding:20 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:12 }}>Quick Actions</div>
              <div className="client-profile-actions-grid" style={{ display:'grid', gap:8 }}>
                <Button variant="secondary" style={{ justifyContent:'flex-start' }} onClick={() => { setTab('invoices'); setInvModal(true) }}>+ Create Invoice</Button>
                <Button variant="secondary" style={{ justifyContent:'flex-start' }} onClick={() => setTab('payments')}>Manage Payments</Button>
                <Button variant="secondary" style={{ justifyContent:'flex-start' }} onClick={() => setTab('tickets')}>Review Support</Button>
                {client.website_url && <Button variant="secondary" style={{ justifyContent:'flex-start' }} onClick={() => window.open(client.website_url,'_blank','noreferrer')}>View Website</Button>}
              </div>
            </div>

            <div style={{ ...DS_CARD, padding:20 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:12 }}>Recent client signal</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div className="client-profile-list-row" style={{ padding:'12px 14px', border:'1px solid var(--color-border)', borderRadius:12, background:'var(--color-gray-50)' }}>
                  <div className="ds-form-label" style={{ display:'block', marginBottom:6 }}>Latest invoice</div>
                  <div style={{ fontSize:14, fontWeight:500, color:'var(--color-text-primary)' }}>{latestInvoice?.description || 'No invoices yet'}</div>
                  <div style={{ fontSize:12, color:'var(--color-text-tertiary)', marginTop:6 }}>
                    {latestInvoice ? `£${Number(latestInvoice.amount || 0).toLocaleString()} · ${latestInvoice.status}` : 'Create the first invoice from this profile'}
                  </div>
                </div>
                <div className="client-profile-list-row" style={{ padding:'12px 14px', border:'1px solid var(--color-border)', borderRadius:12, background:'var(--color-gray-50)' }}>
                  <div className="ds-form-label" style={{ display:'block', marginBottom:6 }}>Latest support ticket</div>
                  <div style={{ fontSize:14, fontWeight:500, color:'var(--color-text-primary)' }}>{latestTicket?.subject || 'No support tickets'}</div>
                  <div style={{ fontSize:12, color:'var(--color-text-tertiary)', marginTop:6 }}>
                    {latestTicket ? `${latestTicket.status} · ${new Date(latestTicket.created_at).toLocaleDateString('en-GB')}` : 'Support history will appear here'}
                  </div>
                </div>
                <div className="client-profile-list-row" style={{ padding:'12px 14px', border:'1px solid var(--color-border)', borderRadius:12, background:'var(--color-gray-50)' }}>
                  <div className="ds-form-label" style={{ display:'block', marginBottom:6 }}>Recent invoices</div>
                  <div style={{ fontSize:12.5, color:'var(--color-text-secondary)', lineHeight:1.7 }}>
                    {recentInvoices.length
                      ? recentInvoices.map(inv => `${inv.invoice_number || 'Invoice'} · £${Number(inv.amount || 0).toLocaleString()}`).join(' / ')
                      : 'No invoice trail yet'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ ...DS_CARD, padding:20 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:12 }}>Recent activity</div>
              {recentActivity.length === 0 ? (
                <p style={{ fontSize:13, color:'var(--color-text-tertiary)', lineHeight:1.7 }}>No client activity has been recorded yet.</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {recentActivity.map(item => (
                    <div key={item.id} className="client-profile-list-row" style={{ paddingBottom:10, borderBottom:'1px solid var(--color-border)' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                        <div style={{ fontSize:13, fontWeight:500, color:'var(--color-text-primary)', textTransform:'capitalize' }}>{item.event_type?.replace(/_/g, ' ')}</div>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--color-text-tertiary)' }}>{new Date(item.created_at).toLocaleDateString('en-GB')}</div>
                      </div>
                      <div style={{ fontSize:12.5, color:'var(--color-text-secondary)', marginTop:4, lineHeight:1.6 }}>{item.description || 'No description'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'onboarding' && (
        <div className="client-profile-overview-grid" style={{ display:'grid', gridTemplateColumns:'minmax(0, 1.45fr) minmax(320px, 0.95fr)', gap:20 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <div style={{ ...DS_CARD, padding:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-start', flexWrap:'wrap', marginBottom:18 }}>
                <div>
                  <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Client onboarding sync</div>
                  <div style={{ fontSize:14, color:'var(--color-text-secondary)', lineHeight:1.7, maxWidth:620 }}>
                    This tab reads the same shared onboarding records the client portal writes into <span style={{ fontFamily:'var(--font-mono)' }}>portal_settings</span>, so staff can review progress without a separate sync process.
                  </div>
                  {onboardingSource.resolvedEmail && client?.email && onboardingSource.resolvedEmail !== client.email ? (
                    <div style={{ fontSize:12.5, color:'var(--color-text-tertiary)', marginTop:8, lineHeight:1.6 }}>
                      Synced from client portal email <span style={{ fontFamily:'var(--font-mono)' }}>{onboardingSource.resolvedEmail}</span>.
                    </div>
                  ) : null}
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  {onboardingSummary ? (
                    <StatusBadge variant={TONE_TO_VARIANT[getOnboardingStatusTone(onboardingSummary.status)] || 'info'}>
                      {getOnboardingStatusLabel(onboardingSummary.status)}
                    </StatusBadge>
                  ) : (
                    <StatusBadge variant="info">Not started</StatusBadge>
                  )}
                  <Button variant="ghost" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => loadOnboarding(client)} disabled={onboardingLoading}>
                    {onboardingLoading ? 'Refreshing...' : 'Refresh'}
                  </Button>
                  {onboardingSummary?.status === 'submitted' && !onboardingSummary?.approved_at && (
                    <Button variant="primary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={approveOnboarding} disabled={onboardingSaving}>
                      {onboardingSaving ? 'Approving...' : 'Mark reviewed'}
                    </Button>
                  )}
                </div>
              </div>

              <div className="client-profile-summary-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:12 }}>
                <div style={{ padding:'14px 16px', border:'1px solid var(--color-border)', borderRadius:12, background:'var(--color-gray-50)' }}>
                  <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Completion</div>
                  <div style={{ fontSize:22, fontWeight:600, color:'var(--color-text-primary)' }}>{onboardingSummary?.progress?.percent || 0}%</div>
                  <div style={{ fontSize:12, color:'var(--color-text-tertiary)', marginTop:6 }}>
                    {(onboardingSummary?.progress?.completeCount || 0)}/{onboardingSummary?.progress?.total || ONBOARDING_SECTION_ORDER.length} sections submitted
                  </div>
                </div>
                <div style={{ padding:'14px 16px', border:'1px solid var(--color-border)', borderRadius:12, background:'var(--color-gray-50)' }}>
                  <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Submitted</div>
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--color-text-primary)' }}>
                    {onboardingSummary?.submitted_at ? new Date(onboardingSummary.submitted_at).toLocaleString('en-GB') : 'Not submitted yet'}
                  </div>
                  <div style={{ fontSize:12, color:'var(--color-text-tertiary)', marginTop:6 }}>
                    Source: {onboardingSummary?.source || 'client_portal'}
                  </div>
                </div>
                <div style={{ padding:'14px 16px', border:'1px solid var(--color-border)', borderRadius:12, background:'var(--color-gray-50)' }}>
                  <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Reviewed by staff</div>
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--color-text-primary)' }}>
                    {onboardingSummary?.approved_by || 'Pending'}
                  </div>
                  <div style={{ fontSize:12, color:'var(--color-text-tertiary)', marginTop:6 }}>
                    {onboardingSummary?.approved_at ? new Date(onboardingSummary.approved_at).toLocaleString('en-GB') : 'No review recorded yet'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ ...DS_CARD, overflow:'hidden' }}>
              <div style={{ padding:'16px 18px', borderBottom:'1px solid var(--color-border)', background:'var(--color-gray-50)' }}>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--color-text-primary)' }}>Section detail</div>
              </div>
              {getOrderedOnboardingSections(onboardingSections).map((section, index) => (
                <div key={section.key} style={{ padding:'16px 18px', borderTop:index === 0 ? 'none' : '1px solid var(--color-border)', display:'grid', gap:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--color-text-primary)' }}>{section.label}</div>
                    <StatusBadge variant={TONE_TO_VARIANT[getOnboardingStatusTone(section.status)] || 'info'}>{getOnboardingStatusLabel(section.status)}</StatusBadge>
                  </div>
                  <div style={{ fontSize:12.5, color:'var(--color-text-tertiary)' }}>
                    {section.updated_at ? `Last updated ${new Date(section.updated_at).toLocaleString('en-GB')}` : 'No update yet'}
                  </div>
                  <div style={{ display:'grid', gap:8 }}>
                    {Object.entries(section.data || {}).map(([field, value]) => (
                      <div key={field} style={{ padding:'10px 12px', border:'1px solid var(--color-border)', borderRadius:10, background:'var(--color-bg-surface)' }}>
                        <div style={{ fontSize:11, color:'var(--color-text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>
                          {field.replace(/_/g, ' ')}
                        </div>
                        <div style={{ fontSize:13, color:'var(--color-text-primary)', lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                          {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (String(value || '').trim() || '—')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <div style={{ ...DS_CARD, padding:20 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:12 }}>Operational note</div>
              <p style={{ fontSize:13.5, color:'var(--color-text-secondary)', lineHeight:1.7 }}>
                The client portal writes onboarding to shared keys, and the client pipeline already supports onboarding lifecycle stages. This tab is the staff-side review surface for that same data.
              </p>
            </div>

            <div style={{ ...DS_CARD, padding:20 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:12 }}>Recommended next action</div>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--color-text-primary)', marginBottom:8 }}>
                {onboardingSummary?.status === 'submitted'
                  ? 'Review the submitted content and move the project into internal planning.'
                  : onboardingSummary?.status === 'in_progress'
                    ? 'Wait for the client to finish the remaining onboarding sections.'
                    : 'Ask the client to start the onboarding flow from their portal.'}
              </div>
              <div style={{ fontSize:12.5, color:'var(--color-text-tertiary)', lineHeight:1.6 }}>
                This gives staff a clear place to check whether the brief is complete before build work starts.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payments tab */}
      {tab === 'payments' && (
        <PaymentsHub client={client} gcStatus={gcStatus} setGcStatus={setGcStatus} />
      )}

      {/* Invoices tab */}
      {tab === 'invoices' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            <Button variant="primary" onClick={() => setInvModal(true)}>+ Create Invoice</Button>
          </div>
          <div style={{ ...DS_CARD, overflow:'hidden' }}>
            {invoices.length === 0 ? <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No invoices yet</div> : (
              <div className="tbl-wrap">
                <table className="ds-table">
                  <thead><tr><th>Invoice #</th><th>Description</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={inv.id}>
                        <td style={{ fontFamily:'var(--font-mono)' }}>{inv.invoice_number}</td>
                        <td>{inv.description}</td>
                        <td>£{Number(inv.amount||0).toLocaleString()}</td>
                        <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{inv.due_date || '—'}</td>
                        <td><StatusBadge variant={inv.status==='paid'?'active':'warning'}>{inv.status}</StatusBadge></td>
                        <td>{inv.status==='unpaid' && <Button variant="ghost" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => markPaid(inv.id)}>Mark Paid</Button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tickets tab */}
      {tab === 'tickets' && (
        <div style={{ ...DS_CARD, overflow:'hidden' }}>
          {tickets.length === 0 ? <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No support tickets from this client</div> : (
            <div className="tbl-wrap">
              <table className="ds-table">
                <thead><tr><th>Subject</th><th>Date</th><th>Status</th></tr></thead>
                <tbody>
                  {tickets.map(t => (
                    <tr key={t.id}>
                      <td>{t.subject}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
                      <td><StatusBadge variant={t.status==='open'?'warning':'active'}>{t.status}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Activity tab */}
      {tab === 'activity' && (
        <div style={{ ...DS_CARD, overflow:'hidden' }}>
          {activity.length === 0 ? <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No activity recorded</div> : (
            <div className="tbl-wrap">
              <table className="ds-table">
                <thead><tr><th>Event</th><th>Description</th><th>Date</th></tr></thead>
                <tbody>
                  {activity.map(a => (
                    <tr key={a.id}>
                      <td><StatusBadge variant="info">{a.event_type?.replace(/_/g,' ')}</StatusBadge></td>
                      <td>{a.description}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(a.created_at).toLocaleDateString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}

      {/* Invoice modal */}
      {invModal && (
        <Modal title="Create Invoice" onClose={() => setInvModal(false)}
          footer={<><Button variant="secondary" onClick={() => setInvModal(false)}>Cancel</Button><Button variant="primary" onClick={createInvoice} disabled={saving}>{saving?'Creating...':'Create & Email'}</Button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16 }}>
              <FormField><FormLabel>Invoice #</FormLabel><FormInput value={invForm.invoice_number} onChange={e=>setInvForm(p=>({...p,invoice_number:e.target.value}))} placeholder="INV-001"/></FormField>
              <FormField><FormLabel>Amount (£)</FormLabel><FormInput type="number" value={invForm.amount} onChange={e=>setInvForm(p=>({...p,amount:e.target.value}))}/></FormField>
            </div>
            <FormField><FormLabel>Description</FormLabel><FormInput value={invForm.description} onChange={e=>setInvForm(p=>({...p,description:e.target.value}))} placeholder="Web Design — March 2026"/></FormField>
            <FormField><FormLabel>Due Date</FormLabel><FormInput type="date" value={invForm.due_date} onChange={e=>setInvForm(p=>({...p,due_date:e.target.value}))}/></FormField>
            <div>
              <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Payment Type</div>
              <div style={{ display:'flex', gap:8 }}>
                {[['one_off','One-off'],['monthly','Monthly DD']].map(([v,l]) => (
                  <button key={v} onClick={() => setInvForm(p=>({...p,payment_type:v}))} style={{ flex:1, padding:'10px', borderRadius:8, border:`2px solid ${invForm.payment_type===v?'var(--color-primary)':'var(--color-border)'}`, background:invForm.payment_type===v?'var(--color-blue-50)':'transparent', cursor:'pointer', fontSize:13, fontWeight:500, color:invForm.payment_type===v?'var(--color-primary)':'var(--color-text-secondary)' }}>{l}</button>
                ))}
              </div>
            </div>
            {gcStatus?.status === 'active' && invForm.payment_type === 'one_off' && invForm.amount && (
              <div style={{ padding:'10px 14px', background:'var(--color-green-50)', border:'1px solid var(--color-green-500)', borderRadius:7, fontSize:13, color:'var(--color-green-500)' }}>
                ✓ Direct Debit active — £{invForm.amount} will be collected automatically via GoCardless
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* One-off payment modal */}
      {payModal === 'one_off' && (
        <Modal title="Collect One-off Payment" onClose={() => setPayModal(null)}
          footer={<><Button variant="secondary" onClick={() => setPayModal(null)}>Cancel</Button><Button variant="primary" onClick={doPayment} disabled={saving||!payForm.amount}>{saving?'Processing...':'Collect Payment'}</Button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {gcError && <div style={{ padding:'10px 14px', background:'var(--color-red-50)', border:'1px solid var(--color-red-500)', borderRadius:7, fontSize:13, color:'var(--color-red-500)' }}>{gcError}</div>}
            <FormField><FormLabel>Amount (£)</FormLabel><FormInput type="number" value={payForm.amount} onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))} placeholder="449"/></FormField>
            <FormField><FormLabel>Description</FormLabel><FormInput value={payForm.description} onChange={e=>setPayForm(p=>({...p,description:e.target.value}))} placeholder="Website build — March 2026"/></FormField>
            <div style={{ padding:'10px 14px', background:'var(--color-blue-50)', border:'1px solid var(--color-border)', borderRadius:7, fontSize:13, color:'var(--color-primary)' }}>
              This will immediately charge the client's bank account via GoCardless Direct Debit. Funds arrive in 3–5 working days.
            </div>
          </div>
        </Modal>
      )}

      {/* Subscription modal */}
      {payModal === 'subscription' && (
        <Modal title="Set Up Monthly Subscription" onClose={() => setPayModal(null)}
          footer={<><Button variant="secondary" onClick={() => setPayModal(null)}>Cancel</Button><Button variant="primary" onClick={doSubscription} disabled={saving||!payForm.amount}>{saving?'Setting up...':'Create Subscription'}</Button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {gcError && <div style={{ padding:'10px 14px', background:'var(--color-red-50)', border:'1px solid var(--color-red-500)', borderRadius:7, fontSize:13, color:'var(--color-red-500)' }}>{gcError}</div>}
            <FormField><FormLabel>Monthly Amount (£)</FormLabel><FormInput type="number" value={payForm.amount} onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))} placeholder="35"/></FormField>
            <FormField><FormLabel>Subscription Name</FormLabel><FormInput value={payForm.name} onChange={e=>setPayForm(p=>({...p,name:e.target.value}))} placeholder="Hosting Pro Plan"/></FormField>
            <FormField><FormLabel>Collection Day (1–28)</FormLabel><FormInput type="number" min="1" max="28" value={payForm.day_of_month} onChange={e=>setPayForm(p=>({...p,day_of_month:Number(e.target.value)}))}/></FormField>
            <div style={{ padding:'10px 14px', background:'var(--color-blue-50)', border:'1px solid var(--color-border)', borderRadius:7, fontSize:13, color:'var(--color-primary)' }}>
              Client will be charged £{payForm.amount||'X'}/month on day {payForm.day_of_month} of each month via Direct Debit.
            </div>
            {/* Quick plan buttons */}
            <div>
              <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Template Presets</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {GO_CARDLESS_TEMPLATES.map(template => (
                  <button key={template.id} onClick={() => setPayForm(p=>({...p,amount:template.amount,name:template.name}))} style={{ padding:'6px 12px', borderRadius:7, border:`1px solid ${payForm.name===template.name?'var(--color-primary)':'var(--color-border)'}`, background:payForm.name===template.name?'var(--color-blue-50)':'transparent', cursor:'pointer', fontSize:12, color:'var(--color-text-primary)' }}>
                    {template.name} — £{template.amount}/mo
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {payModal === 'manual' && (
        <Modal title="Record Manual Payment" onClose={() => setPayModal(null)}
          footer={<><Button variant="secondary" onClick={() => setPayModal(null)}>Cancel</Button><Button variant="primary" onClick={doManualPayment} disabled={saving||!payForm.amount}>{saving?'Saving...':'Record Payment'}</Button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {gcError && <div style={{ padding:'10px 14px', background:'var(--color-red-50)', border:'1px solid var(--color-red-500)', borderRadius:7, fontSize:13, color:'var(--color-red-500)' }}>{gcError}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16 }}>
              <FormField><FormLabel>Amount (£)</FormLabel><FormInput type="number" value={payForm.amount} onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))} placeholder="449"/></FormField>
              <FormField><FormLabel>Status</FormLabel>
                <FormSelect value={payForm.manual_status} onChange={e=>setPayForm(p=>({...p,manual_status:e.target.value}))}>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                </FormSelect>
              </FormField>
            </div>
            <FormField><FormLabel>Assign To</FormLabel>
              <FormSelect value={payForm.manual_type} onChange={e=>setPayForm(p=>({...p,manual_type:e.target.value}))}>
                {MANUAL_PAYMENT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </FormSelect>
            </FormField>
            <FormField><FormLabel>Commission Owner</FormLabel>
              <FormSelect value={commissionOwnerEmail || ''} onChange={event => setCommissionOwnerEmail(event.target.value)}>
                <option value="">No commission owner</option>
                {staffProfiles.map((member) => <option key={member.user_email} value={member.user_email}>{member.full_name || member.user_email}</option>)}
              </FormSelect>
            </FormField>
            <FormField><FormLabel>Description</FormLabel><FormInput value={payForm.description} onChange={e=>setPayForm(p=>({...p,description:e.target.value}))} placeholder="Bank transfer for Growth package"/></FormField>
            <div>
              <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Quick Assign</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {[
                  { name:'Starter', amount:499, type:'manual:starter' },
                  { name:'Growth', amount:999, type:'manual:growth' },
                  { name:'Pro', amount:1499, type:'manual:pro' },
                  { name:'Enterprise & HR Build', amount:2499, type:'manual:enterprise' },
                ].map(template => (
                  <button key={template.type} onClick={() => setPayForm(p=>({...p,amount:String(template.amount),manual_type:template.type,description:`Manual payment for ${template.name}`}))} style={{ padding:'6px 12px', borderRadius:7, border:'1px solid var(--color-border)', background:'transparent', cursor:'pointer', fontSize:12, color:'var(--color-text-primary)' }}>
                    {template.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {linkGcModal && (
        <Modal title="Link Existing GoCardless Customer" onClose={() => setLinkGcModal(false)}
          footer={<><Button variant="secondary" onClick={() => setLinkGcModal(false)}>Cancel</Button><Button variant="primary" onClick={linkExistingMandate} disabled={saving || !linkGcForm.customer_id}>{saving?'Saving...':'Link Direct Debit'}</Button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {gcError && <div style={{ padding:'10px 14px', background:'var(--color-red-50)', border:'1px solid var(--color-red-500)', borderRadius:7, fontSize:13, color:'var(--color-red-500)' }}>{gcError}</div>}
            <FormField><FormLabel>GoCardless Customer ID</FormLabel><FormInput value={linkGcForm.customer_id} onChange={e=>setLinkGcForm(p=>({...p,customer_id:e.target.value}))} placeholder="CU..." autoFocus/></FormField>
            <FormField><FormLabel>Mandate ID (optional)</FormLabel><FormInput value={linkGcForm.mandate_id} onChange={e=>setLinkGcForm(p=>({...p,mandate_id:e.target.value}))} placeholder="MD..."/></FormField>
            <FormField><FormLabel>Status</FormLabel>
              <FormSelect value={linkGcForm.status} onChange={e=>setLinkGcForm(p=>({...p,status:e.target.value}))}>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
              </FormSelect>
            </FormField>
            <div style={{ padding:'10px 14px', background:'var(--color-gray-50)', borderRadius:7, fontSize:13, color:'var(--color-text-secondary)' }}>
              Use this if the customer or mandate already exists in GoCardless but the portal failed to link it. If you only know the customer ID, leave mandate blank and the portal will try to refresh it.
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
