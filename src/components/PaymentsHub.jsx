import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { supabase } from '../utils/supabase'
import {
  setupMandate,
  getBillingRequest,
  getMandates,
  createPayment,
  createSubscription,
  createPaymentLink,
  createInstalmentSchedule,
  cancelSubscription,
  getPayments,
  getSubscriptions,
  listBillingRequestTemplates,
  paymentStatusColor,
  mandateStatusColor,
} from '../utils/gocardless'

const PAYMENT_MODES = [
  ['customer', 'Customer only'],
  ['one_off', 'One-off'],
  ['subscription', 'Subscription'],
  ['instalments', 'Instalments'],
  ['manual', 'Manual'],
]

const ONE_OFF_TEMPLATES = [
  { id: 'website-starter', name: 'Website Build Starter', amount: 499, description: 'Website Build Starter' },
  { id: 'website-growth', name: 'Website Build Growth', amount: 999, description: 'Website Build Growth' },
  { id: 'website-pro', name: 'Website Build Pro', amount: 1499, description: 'Website Build Pro' },
  { id: 'enterprise-hr', name: 'Enterprise & HR Build', amount: 2499, description: 'Enterprise & HR Build' },
]

const SUBSCRIPTION_TEMPLATES = [
  { id: 'hr-monthly', name: 'HR Monthly Maintenance', amount: 49, description: 'HR Monthly Maintenance' },
  { id: 'hosting-starter', name: 'Hosting Starter', amount: 35, description: 'Hosting Starter' },
  { id: 'hosting-professional', name: 'Hosting Professional', amount: 65, description: 'Hosting Professional' },
  { id: 'hosting-business', name: 'Hosting Business', amount: 109, description: 'Hosting Business' },
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

function paymentTypeLabel(paymentType = '') {
  if (paymentType === 'one_off') return 'One-off DD'
  if (paymentType === 'subscription') return 'Subscription'
  if (paymentType === 'instalments') return 'Instalments'
  if (paymentType.startsWith('manual:')) {
    const key = paymentType.split(':')[1]
    return key === 'custom' ? 'Manual / Custom' : `Manual — ${key.charAt(0).toUpperCase()}${key.slice(1)}`
  }
  return paymentType || 'Payment'
}

function formatMoney(value) {
  return `£${Number(value || 0).toLocaleString()}`
}

function InfoCard({ title, value, hint, tone }) {
  return (
    <div className="stat-card" style={{ minHeight: 118, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div className="stat-lbl" style={{ marginBottom: 10 }}>{title}</div>
      <div className="stat-val" style={{ color: tone || 'var(--text)', fontSize: 28 }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.5 }}>{hint}</div> : null}
    </div>
  )
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 14px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent-soft)' : 'var(--card)',
        color: active ? 'var(--accent)' : 'var(--sub)',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  )
}

function TemplateChip({ active, label, amount, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: 'var(--text)',
        cursor: 'pointer',
        textAlign: 'left',
        minWidth: 172,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: active ? 'var(--accent)' : 'var(--sub)' }}>{formatMoney(amount)}</div>
    </button>
  )
}

export function PaymentsHub({ client, gcStatus, setGcStatus }) {
  const [payments, setPayments] = useState([])
  const [manualPayments, setManualPayments] = useState([])
  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [settingUp, setSettingUp] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState('customer')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [setupUrl, setSetupUrl] = useState('')
  const [hostedLink, setHostedLink] = useState('')
  const [linkKind, setLinkKind] = useState('')
  const [linkGcModal, setLinkGcModal] = useState(false)
  const [linkGcForm, setLinkGcForm] = useState({ customer_id: '', mandate_id: '', status: 'active' })
  const [editingSub, setEditingSub] = useState(null)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [billingTemplates, setBillingTemplates] = useState([])
  const [oneOffForm, setOneOffForm] = useState({ template_id: '', amount: '', description: '', reference: 'DH-PAY' })
  const [subscriptionForm, setSubscriptionForm] = useState({ template_id: '', amount: '', name: '', day_of_month: 1 })
  const [instalmentForm, setInstalmentForm] = useState({
    name: '',
    amounts: '',
    interval: 1,
    interval_unit: 'monthly',
    start_date: '',
    payment_reference: 'DH-INST',
  })
  const [manualForm, setManualForm] = useState({ amount: '', description: '', payment_type: 'manual:custom', status: 'paid' })

  const activeMandate = gcStatus?.status === 'active' && !!gcStatus?.mandate_id
  const pendingMandate = !!gcStatus && !activeMandate
  const requiresMandate = mode === 'one_off' || mode === 'subscription' || mode === 'instalments'
  const allPayments = [...manualPayments, ...payments].sort((a, b) => new Date(b.created_at || b.charge_date || 0) - new Date(a.created_at || a.charge_date || 0))
  const totalCollected = allPayments
    .filter((payment) => ['paid_out', 'confirmed', 'paid'].includes(String(payment.status || '').toLowerCase()))
    .reduce((sum, payment) => sum + paymentAmountPounds(payment), 0)

  const refreshMandateStatus = async (status = gcStatus) => {
    if (!status || !client?.email) return false

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
    const active = mandates?.find((mandate) => mandate.status === 'active') || mandates?.[0]
    if (!active) return false

    const patch = {
      client_email: client.email,
      client_name: client.name,
      customer_id: customerId,
      mandate_id: active.id,
      status: active.status,
      billing_request_id: status.billing_request_id || null,
    }

    await supabase
      .from('gocardless_mandates')
      .upsert([patch], { onConflict: 'client_email' })

    setGcStatus((prev) => ({ ...prev, ...patch }))
    return patch
  }

  const loadState = async (status = gcStatus) => {
    setLoading(true)
    try {
      const manualPromise = supabase
        .from('client_payments')
        .select('*')
        .eq('client_email', client.email)
        .order('created_at', { ascending: false })

      let effectiveStatus = status
      if ((status?.customer_id || status?.billing_request_id) && !status?.mandate_id) {
        try {
          const refreshed = await refreshMandateStatus(status)
          if (refreshed) effectiveStatus = { ...status, ...refreshed }
        } catch {}
      }

      const manualResult = await manualPromise
      setManualPayments((manualResult.data || []).filter((payment) => String(payment.payment_type || '').startsWith('manual:')))

      if (effectiveStatus?.mandate_id) {
        const [paymentResult, subscriptionResult] = await Promise.all([
          getPayments(effectiveStatus.mandate_id).catch(() => ({ payments: [] })),
          getSubscriptions(effectiveStatus.mandate_id).catch(() => ({ subscriptions: [] })),
        ])
        setPayments(paymentResult.payments || [])
        setSubs(subscriptionResult.subscriptions || [])
      } else {
        setPayments([])
        setSubs([])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!client?.email) return
    loadState(gcStatus)
  }, [client?.email, gcStatus?.mandate_id, gcStatus?.customer_id, gcStatus?.billing_request_id])

  useEffect(() => {
    if (mode !== 'subscription' || billingTemplates.length) return
    setTemplateLoading(true)
    listBillingRequestTemplates()
      .then((result) => {
        const templates = result.billing_request_templates || result.templates || []
        setBillingTemplates(templates)
      })
      .catch(() => {})
      .finally(() => setTemplateLoading(false))
  }, [mode, billingTemplates.length])

  useEffect(() => {
    if (!pendingMandate) return
    const refresh = () => {
      triggerMandateRefresh(gcStatus)
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    refresh()
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [pendingMandate, gcStatus?.billing_request_id, gcStatus?.customer_id, gcStatus?.mandate_id])

  const triggerMandateRefresh = async (status = gcStatus) => {
    if (!(status?.customer_id || status?.billing_request_id)) return
    try {
      const patch = await refreshMandateStatus(status)
      if (patch?.mandate_id) {
        await loadState({ ...status, ...patch })
        setSuccess('Direct Debit mandate is now active')
      }
    } catch (refreshError) {
      setError(refreshError.message)
    }
  }

  const doSetup = async () => {
    setSettingUp(true)
    setError('')
    try {
      const data = await setupMandate(client.email, client.name)
      const record = {
        client_email: client.email,
        client_name: client.name,
        customer_id: data.customer_id,
        billing_request_id: data.billing_request_id,
        status: 'pending',
      }
      const { data: saved } = await supabase
        .from('gocardless_mandates')
        .upsert([record], { onConflict: 'client_email' })
        .select()
        .maybeSingle()
      setGcStatus(saved || record)
      setSetupUrl(data.redirect_url)
      setSuccess('GoCardless setup link is ready')
      window.open(data.redirect_url, '_blank', 'noopener,noreferrer')
    } catch (setupError) {
      setError(setupError.message)
    } finally {
      setSettingUp(false)
    }
  }

  const copySetupLink = async () => {
    const url = hostedLink || setupUrl
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setSuccess('Setup link copied')
    } catch {
      setError('Could not copy the setup link')
    }
  }

  const doPayment = async () => {
    if (!activeMandate || !oneOffForm.amount) return
    setSaving(true)
    setError('')
    try {
      const result = await createPayment(
        gcStatus.mandate_id,
        Number(oneOffForm.amount),
        oneOffForm.description || 'DH Website Services',
        oneOffForm.reference || 'DH-PAY'
      )
      await supabase.from('client_payments').insert([{
        client_email: client.email,
        client_name: client.name,
        amount: Number(oneOffForm.amount),
        payment_type: 'one_off',
        status: result.payment?.status || 'pending',
        gocardless_id: result.payment?.id,
        description: oneOffForm.description || null,
        created_at: new Date().toISOString(),
      }])
      setSuccess(`One-off payment created for ${formatMoney(oneOffForm.amount)}`)
      setOneOffForm({ template_id: '', amount: '', description: '', reference: 'DH-PAY' })
      await loadState(gcStatus)
    } catch (paymentError) {
      setError(paymentError.message)
    } finally {
      setSaving(false)
    }
  }

  const doSubscription = async () => {
    if (!activeMandate || !subscriptionForm.amount) return
    setSaving(true)
    setError('')
    try {
      const result = await createSubscription(
        gcStatus.mandate_id,
        Number(subscriptionForm.amount),
        subscriptionForm.name || 'DH Website Services',
        Number(subscriptionForm.day_of_month || 1)
      )
      await supabase.from('client_payments').insert([{
        client_email: client.email,
        client_name: client.name,
        amount: Number(subscriptionForm.amount),
        payment_type: 'subscription',
        status: result.subscription?.status || 'pending',
        gocardless_id: result.subscription?.id,
        description: subscriptionForm.name || null,
        created_at: new Date().toISOString(),
      }])
      setSuccess(
        editingSub
          ? 'Updated subscription created. Cancel the previous one below once you are happy with the change.'
          : `Subscription created for ${formatMoney(subscriptionForm.amount)}/month`
      )
      setEditingSub(null)
      setSubscriptionForm({ template_id: '', amount: '', name: '', day_of_month: 1 })
      await loadState(gcStatus)
    } catch (subscriptionError) {
      setError(subscriptionError.message)
    } finally {
      setSaving(false)
    }
  }

  const generatePaymentLink = async () => {
    if (!oneOffForm.amount) return
    setSaving(true)
    setError('')
    try {
      const result = await createPaymentLink(
        client.email,
        client.name,
        Number(oneOffForm.amount),
        oneOffForm.description || 'DH Website Services'
      )
      const url =
        result.billing_request_flows?.authorisation_url ||
        result.authorisation_url ||
        result.redirect_url ||
        ''
      setHostedLink(url)
      setLinkKind('One-off payment link')
      setSuccess('Customer payment link created')
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (paymentLinkError) {
      setError(paymentLinkError.message)
    } finally {
      setSaving(false)
    }
  }

  const doCancel = async (subId) => {
    if (!confirm('Cancel this subscription?')) return
    setError('')
    try {
      await cancelSubscription(subId)
      setSuccess('Subscription cancelled')
      await loadState(gcStatus)
    } catch (cancelError) {
      setError(cancelError.message)
    }
  }

  const doManualPayment = async () => {
    if (!manualForm.amount) return
    setSaving(true)
    setError('')
    try {
      const entry = {
        client_email: client.email,
        client_name: client.name,
        amount: Number(manualForm.amount),
        payment_type: manualForm.payment_type || 'manual:custom',
        status: manualForm.status || 'paid',
        description: manualForm.description || null,
        created_at: new Date().toISOString(),
      }
      await supabase.from('client_payments').insert([entry])
      setSuccess('Manual payment recorded')
      setManualForm({ amount: '', description: '', payment_type: 'manual:custom', status: 'paid' })
      await loadState(gcStatus)
    } catch (manualError) {
      setError(manualError.message)
    } finally {
      setSaving(false)
    }
  }

  const linkExistingMandate = async () => {
    if (!linkGcForm.customer_id?.trim()) return
    setSaving(true)
    setError('')
    try {
      const record = {
        client_email: client.email,
        client_name: client.name,
        customer_id: linkGcForm.customer_id.trim(),
        mandate_id: linkGcForm.mandate_id.trim() || null,
        status: linkGcForm.status || 'active',
      }
      const { data } = await supabase
        .from('gocardless_mandates')
        .upsert([record], { onConflict: 'client_email' })
        .select()
        .maybeSingle()
      setGcStatus(data || record)
      setLinkGcModal(false)
      setLinkGcForm({ customer_id: '', mandate_id: '', status: 'active' })
      setSuccess('Existing GoCardless customer linked to this client')
      await loadState(data || record)
      if (!(data || record).mandate_id) {
        await triggerMandateRefresh(data || record)
      }
    } catch (linkError) {
      setError(linkError.message)
    } finally {
      setSaving(false)
    }
  }

  const doInstalmentSchedule = async () => {
    if (!activeMandate || !instalmentForm.amounts.trim()) return
    const amounts = instalmentForm.amounts
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => !Number.isNaN(value) && value > 0)

    if (!amounts.length) {
      setError('Enter instalment amounts separated by commas')
      return
    }

    setSaving(true)
    setError('')
    try {
      const schedule = await createInstalmentSchedule(gcStatus.mandate_id, {
        name: instalmentForm.name || 'Instalment schedule',
        amounts_pence: amounts.map((amount) => Math.round(amount * 100)),
        total_amount_pence: amounts.reduce((sum, amount) => sum + Math.round(amount * 100), 0),
        interval: Number(instalmentForm.interval || 1),
        interval_unit: instalmentForm.interval_unit,
        start_date: instalmentForm.start_date || null,
        payment_reference: instalmentForm.payment_reference || 'DH-INST',
      })

      await supabase.from('client_payments').insert([{
        client_email: client.email,
        client_name: client.name,
        amount: amounts.reduce((sum, amount) => sum + amount, 0),
        payment_type: 'instalments',
        status: schedule.instalment_schedules?.status || schedule.status || 'pending',
        gocardless_id: schedule.instalment_schedules?.id || schedule.id || null,
        description: instalmentForm.name || 'Instalment schedule',
        created_at: new Date().toISOString(),
      }])

      setSuccess('Instalment schedule created')
      setInstalmentForm({
        name: '',
        amounts: '',
        interval: 1,
        interval_unit: 'monthly',
        start_date: '',
        payment_reference: 'DH-INST',
      })
      await loadState(gcStatus)
    } catch (instalmentError) {
      setError(instalmentError.message)
    } finally {
      setSaving(false)
    }
  }

  const applyOneOffTemplate = (template) => {
    setOneOffForm({
      template_id: template.id,
      amount: String(template.amount),
      description: template.description,
      reference: 'DH-PAY',
    })
  }

  const applySubscriptionTemplate = (template) => {
    setEditingSub(null)
    setSubscriptionForm({
      template_id: template.id,
      amount: String(template.amount),
      name: template.name,
      day_of_month: 1,
    })
  }

  const startEditingSubscription = (subscription) => {
    setMode('subscription')
    setEditingSub(subscription)
    setSubscriptionForm({
      template_id: '',
      amount: String((subscription.amount || 0) / 100),
      name: subscription.name || '',
      day_of_month: subscription.day_of_month || 1,
    })
  }

  const guardCard = requiresMandate && !activeMandate ? (
    <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--amber)', background: 'var(--amber-bg)', color: 'var(--amber)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
      {pendingMandate
        ? 'This client still needs to finish the Direct Debit setup. Refresh the mandate once they have completed the GoCardless page.'
        : 'This payment type needs an active Direct Debit mandate first. Use the customer setup flow to create or link one.'}
    </div>
  ) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error ? <div style={{ padding: '10px 14px', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 8, fontSize: 13, color: 'var(--red)' }}>{error}</div> : null}
      {success ? <div style={{ padding: '10px 14px', background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 8, fontSize: 13, color: 'var(--green)' }}>✓ {success}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
        <InfoCard title="Direct Debit" value={activeMandate ? 'Active' : pendingMandate ? 'Pending' : 'Not set'} hint={activeMandate ? 'Ready for collections and subscriptions' : pendingMandate ? 'Awaiting client completion' : 'Create or link a mandate first'} tone={activeMandate ? 'var(--green)' : pendingMandate ? 'var(--amber)' : 'var(--sub)'} />
        <InfoCard title="Collected" value={formatMoney(totalCollected)} hint="GoCardless and manual payments combined" tone="var(--accent)" />
        <InfoCard title="Subscriptions" value={subs.filter((sub) => sub.status === 'active').length} hint={subs.length ? 'Active recurring arrangements' : 'No subscriptions live yet'} tone="var(--green)" />
        <InfoCard title="Recent payments" value={allPayments.length} hint="Visible in the payment history panel" tone="var(--text)" />
      </div>

      <div className="card card-pad" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Payments Hub</div>
            <div style={{ fontSize: 13, color: 'var(--sub)' }}>Choose how you want to collect or log payment for {client.name}.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PAYMENT_MODES.map(([key, label]) => (
              <ModeButton key={key} active={mode === key} onClick={() => setMode(key)}>{label}</ModeButton>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)', gap: 0 }}>
          <div style={{ padding: 20, borderRight: '1px solid var(--border)' }}>
            {guardCard}

            {mode === 'customer' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ padding: 18, borderRadius: 14, border: '1px solid var(--border)', background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.01))' }}>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Customer setup</div>
                  <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.7, marginBottom: 16 }}>
                    Use this when the client has not given bank details yet. The client completes a secure GoCardless page, then Direct Debit becomes available for one-off charges and subscriptions.
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={doSetup} disabled={settingUp}>{settingUp ? 'Opening GoCardless...' : 'Create setup link'}</button>
                    <button className="btn btn-outline" onClick={() => setLinkGcModal(true)}>Link existing Direct Debit</button>
                    {pendingMandate ? <button className="btn btn-outline" onClick={() => triggerMandateRefresh(gcStatus)}>Refresh mandate</button> : null}
                  </div>
                </div>

                {(setupUrl || pendingMandate) ? (
                  <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Setup link</div>
                    <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.6, marginBottom: 12 }}>
                      Open the secure authorisation page or copy it to send directly to the client if you are not walking them through it live.
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--font-mono)', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', marginBottom: 12, wordBreak: 'break-all' }}>
                      {setupUrl || 'The latest setup link will appear here after you create it.'}
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {setupUrl ? <button className="btn btn-primary" onClick={() => window.open(setupUrl, '_blank', 'noopener,noreferrer')}>Open link</button> : null}
                      {setupUrl ? <button className="btn btn-outline" onClick={copySetupLink}>Copy link</button> : null}
                    </div>
                  </div>
                ) : null}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>When to use this</div>
                    <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.6 }}>
                      New client, changed bank details, or when you want a customer-first setup before charging anything.
                    </div>
                  </div>
                  <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>What happens next</div>
                    <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.6 }}>
                      Once the mandate goes active, switch to one-off or subscription and collect directly from the saved bank details.
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {mode === 'one_off' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Create a one-off collection</div>
                  <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.6 }}>Pick a pricing template or enter a custom amount, then collect directly against the client’s active mandate.</div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {ONE_OFF_TEMPLATES.map((template) => (
                    <TemplateChip key={template.id} active={oneOffForm.template_id === template.id} label={template.name} amount={template.amount} onClick={() => applyOneOffTemplate(template)} />
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label className="lbl">Amount (£)</label>
                    <input className="inp" type="number" value={oneOffForm.amount} onChange={(e) => setOneOffForm((prev) => ({ ...prev, amount: e.target.value, template_id: '' }))} placeholder="449" />
                  </div>
                  <div>
                    <label className="lbl">Reference</label>
                    <input className="inp" value={oneOffForm.reference} onChange={(e) => setOneOffForm((prev) => ({ ...prev, reference: e.target.value }))} placeholder="DH-PAY" />
                  </div>
                </div>
                <div>
                  <label className="lbl">Description</label>
                  <input className="inp" value={oneOffForm.description} onChange={(e) => setOneOffForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Website build payment" />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={doPayment} disabled={saving || !activeMandate || !oneOffForm.amount}>{saving ? 'Creating payment...' : 'Collect one-off payment'}</button>
                  {!activeMandate ? <button className="btn btn-outline" onClick={generatePaymentLink} disabled={saving || !oneOffForm.amount}>{saving ? 'Generating link...' : 'Create customer payment link'}</button> : null}
                  {!activeMandate ? <button className="btn btn-outline" onClick={() => setMode('customer')}>Set up Direct Debit first</button> : null}
                </div>
              </div>
            ) : null}

            {mode === 'subscription' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>{editingSub ? 'Create updated subscription' : 'Create a recurring subscription'}</div>
                  <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.6 }}>
                    Use a monthly template or set your own amount. Existing subscriptions can be loaded into this editor to handle price changes from inside the portal.
                  </div>
                </div>
                {editingSub ? (
                  <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--accent-border)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 13, lineHeight: 1.6 }}>
                    You are preparing an updated subscription for <strong>{editingSub.name}</strong>. After creating the new subscription, cancel the previous one from the list on the right when you are ready to switch the client over.
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {SUBSCRIPTION_TEMPLATES.map((template) => (
                    <TemplateChip key={template.id} active={subscriptionForm.template_id === template.id} label={template.name} amount={template.amount} onClick={() => applySubscriptionTemplate(template)} />
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label className="lbl">Monthly amount (£)</label>
                    <input className="inp" type="number" value={subscriptionForm.amount} onChange={(e) => setSubscriptionForm((prev) => ({ ...prev, amount: e.target.value, template_id: '' }))} placeholder="49" />
                  </div>
                  <div>
                    <label className="lbl">Collection day</label>
                    <input className="inp" type="number" min="1" max="28" value={subscriptionForm.day_of_month} onChange={(e) => setSubscriptionForm((prev) => ({ ...prev, day_of_month: Number(e.target.value || 1) }))} />
                  </div>
                </div>
                <div>
                  <label className="lbl">Subscription name</label>
                  <input className="inp" value={subscriptionForm.name} onChange={(e) => setSubscriptionForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Hosting Professional" />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={doSubscription} disabled={saving || !activeMandate || !subscriptionForm.amount}>{saving ? 'Creating subscription...' : editingSub ? 'Create updated subscription' : 'Create subscription'}</button>
                  {editingSub ? <button className="btn btn-outline" onClick={() => { setEditingSub(null); setSubscriptionForm({ template_id: '', amount: '', name: '', day_of_month: 1 }) }}>Clear change</button> : null}
                  {!activeMandate ? <button className="btn btn-outline" onClick={() => setMode('customer')}>Set up Direct Debit first</button> : null}
                </div>
                {!activeMandate ? (
                  <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>GoCardless template links</div>
                    <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.6, marginBottom: 12 }}>
                      These templates come from your live GoCardless account. Use them when you want to send a ready-made recurring setup link without creating the mandate first inside the portal.
                    </div>
                    {templateLoading ? (
                      <div style={{ fontSize: 12, color: 'var(--sub)' }}>Loading templates...</div>
                    ) : billingTemplates.length ? (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {billingTemplates.map((template) => {
                          const url = template.authorisation_url || template.billing_request_templates?.authorisation_url || ''
                          const name = template.name || template.billing_request_templates?.name || template.id
                          return (
                            <div key={template.id || name} style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
                                <div style={{ fontSize: 11, color: 'var(--sub)' }}>{url || 'Template link unavailable in worker response'}</div>
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-outline btn-sm" onClick={() => { if (!url) return; setHostedLink(url); setLinkKind('Subscription template'); window.open(url, '_blank', 'noopener,noreferrer') }}>Open</button>
                                <button className="btn btn-outline btn-sm" onClick={async () => { if (!url) return; setHostedLink(url); setLinkKind('Subscription template'); try { await navigator.clipboard.writeText(url); setSuccess('Template link copied') } catch { setError('Could not copy the template link') } }}>Copy</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--sub)' }}>No billing request templates were returned by the worker yet.</div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {mode === 'instalments' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Create an instalment schedule</div>
                  <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.6 }}>
                    Use this for staged collections after a mandate is already active. Enter the instalment amounts in order, separated by commas.
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label className="lbl">Schedule name</label>
                    <input className="inp" value={instalmentForm.name} onChange={(e) => setInstalmentForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Website build split plan" />
                  </div>
                  <div>
                    <label className="lbl">Start date</label>
                    <input className="inp" type="date" value={instalmentForm.start_date} onChange={(e) => setInstalmentForm((prev) => ({ ...prev, start_date: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label className="lbl">Amounts (£)</label>
                    <input className="inp" value={instalmentForm.amounts} onChange={(e) => setInstalmentForm((prev) => ({ ...prev, amounts: e.target.value }))} placeholder="500, 500, 500" />
                  </div>
                  <div>
                    <label className="lbl">Payment reference</label>
                    <input className="inp" value={instalmentForm.payment_reference} onChange={(e) => setInstalmentForm((prev) => ({ ...prev, payment_reference: e.target.value }))} placeholder="DH-INST" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label className="lbl">Interval</label>
                    <input className="inp" type="number" min="1" value={instalmentForm.interval} onChange={(e) => setInstalmentForm((prev) => ({ ...prev, interval: Number(e.target.value || 1) }))} />
                  </div>
                  <div>
                    <label className="lbl">Interval unit</label>
                    <select className="inp" value={instalmentForm.interval_unit} onChange={(e) => setInstalmentForm((prev) => ({ ...prev, interval_unit: e.target.value }))}>
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={doInstalmentSchedule} disabled={saving || !activeMandate || !instalmentForm.amounts.trim()}>{saving ? 'Creating instalments...' : 'Create instalment schedule'}</button>
                  {!activeMandate ? <button className="btn btn-outline" onClick={() => setMode('customer')}>Set up Direct Debit first</button> : null}
                </div>
                {!activeMandate ? (
                  <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 12, color: 'var(--sub)', lineHeight: 1.6 }}>
                    Instalments need an active mandate first in the current portal flow. Once the client has completed the customer setup, you can create the staged schedule here.
                  </div>
                ) : null}
              </div>
            ) : null}

            {mode === 'manual' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Record a manual payment</div>
                  <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.6 }}>Log bank transfers, cash, card, or any payment collected outside the GoCardless mandate flow.</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label className="lbl">Amount (£)</label>
                    <input className="inp" type="number" value={manualForm.amount} onChange={(e) => setManualForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="449" />
                  </div>
                  <div>
                    <label className="lbl">Status</label>
                    <select className="inp" value={manualForm.status} onChange={(e) => setManualForm((prev) => ({ ...prev, status: e.target.value }))}>
                      <option value="paid">Paid</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="lbl">Assign to</label>
                  <select className="inp" value={manualForm.payment_type} onChange={(e) => setManualForm((prev) => ({ ...prev, payment_type: e.target.value }))}>
                    {MANUAL_PAYMENT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Description</label>
                  <input className="inp" value={manualForm.description} onChange={(e) => setManualForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Bank transfer for Growth package" />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {[...ONE_OFF_TEMPLATES].map((template) => (
                    <button
                      key={template.id}
                      className="btn btn-outline"
                      onClick={() => setManualForm((prev) => ({
                        ...prev,
                        amount: String(template.amount),
                        payment_type: template.name.toLowerCase().includes('starter')
                          ? 'manual:starter'
                          : template.name.toLowerCase().includes('growth')
                            ? 'manual:growth'
                            : template.name.toLowerCase().includes('pro')
                              ? 'manual:pro'
                              : 'manual:enterprise',
                        description: `Manual payment for ${template.name}`,
                      }))}
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
                <div>
                  <button className="btn btn-primary" onClick={doManualPayment} disabled={saving || !manualForm.amount}>{saving ? 'Saving payment...' : 'Record manual payment'}</button>
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ padding: 20, background: 'var(--bg2)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: 16, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Mandate status</div>
                  <span className={`badge badge-${mandateStatusColor(gcStatus?.status)}`}>{gcStatus?.status || 'not set'}</span>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.6 }}>
                    {activeMandate
                      ? 'This client can now be charged for one-off and recurring collections through the portal.'
                      : pendingMandate
                        ? 'The client still needs to complete the GoCardless authorisation page or the local mandate link needs refreshing.'
                        : 'No mandate is linked yet. Start in Customer only to create a setup link or attach an existing customer.'}
                  </div>
                  {gcStatus?.customer_id ? <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>Customer: {gcStatus.customer_id}</div> : null}
                  {gcStatus?.mandate_id ? <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>Mandate: {gcStatus.mandate_id}</div> : null}
                  {gcStatus?.billing_request_id ? <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>Billing request: {gcStatus.billing_request_id}</div> : null}
                </div>
              </div>

              {(hostedLink || setupUrl) ? (
                <div className="card card-pad" style={{ display: 'grid', gap: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{linkKind || 'Hosted customer link'}</div>
                  <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.6 }}>
                    Use this link when the client needs to complete a hosted bank setup or payment journey outside the portal.
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--font-mono)', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg2)', wordBreak: 'break-all' }}>
                    {hostedLink || setupUrl}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => window.open(hostedLink || setupUrl, '_blank', 'noopener,noreferrer')}>Open link</button>
                    <button className="btn btn-outline btn-sm" onClick={copySetupLink}>Copy link</button>
                  </div>
                </div>
              ) : null}

              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600 }}>Live subscriptions</div>
                {loading ? (
                  <div className="spin-wrap" style={{ minHeight: 140 }}><div className="spin" /></div>
                ) : subs.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {subs.map((subscription) => (
                      <div key={subscription.id} style={{ padding: 14, borderBottom: '1px solid var(--border)', display: 'grid', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{subscription.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--sub)' }}>{formatMoney((subscription.amount || 0) / 100)}/month on day {subscription.day_of_month}</div>
                          </div>
                          <span className={`badge badge-${subscription.status === 'active' ? 'green' : 'grey'}`}>{subscription.status}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => startEditingSubscription(subscription)}>Load to change price</button>
                          {subscription.status === 'active' ? <button className="btn btn-danger btn-sm" onClick={() => doCancel(subscription.id)}>Cancel</button> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: 16, fontSize: 13, color: 'var(--sub)' }}>No subscriptions live yet.</div>
                )}
              </div>

              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600 }}>Payment history</div>
                {loading ? (
                  <div className="spin-wrap" style={{ minHeight: 180 }}><div className="spin" /></div>
                ) : allPayments.length ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="tbl">
                      <thead>
                        <tr><th>Date</th><th>Amount</th><th>Type</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {allPayments.slice(0, 12).map((payment) => (
                          <tr key={payment.id || payment.gocardless_id || `${payment.created_at}-${payment.amount}`}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{payment.charge_date || new Date(payment.created_at || Date.now()).toLocaleDateString('en-GB')}</td>
                            <td>{formatMoney(paymentAmountPounds(payment))}</td>
                            <td>{paymentTypeLabel(payment.payment_type)}</td>
                            <td><span className={`badge badge-${paymentStatusColor(payment.status)}`}>{payment.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: 16, fontSize: 13, color: 'var(--sub)' }}>No payments recorded yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {linkGcModal ? (
        <Modal
          title="Link Existing GoCardless Customer"
          onClose={() => setLinkGcModal(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setLinkGcModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={linkExistingMandate} disabled={saving || !linkGcForm.customer_id}>{saving ? 'Saving...' : 'Link Direct Debit'}</button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="lbl">GoCardless Customer ID</label>
              <input className="inp" value={linkGcForm.customer_id} onChange={(e) => setLinkGcForm((prev) => ({ ...prev, customer_id: e.target.value }))} placeholder="CU..." autoFocus />
            </div>
            <div>
              <label className="lbl">Mandate ID (optional)</label>
              <input className="inp" value={linkGcForm.mandate_id} onChange={(e) => setLinkGcForm((prev) => ({ ...prev, mandate_id: e.target.value }))} placeholder="MD..." />
            </div>
            <div>
              <label className="lbl">Status</label>
              <select className="inp" value={linkGcForm.status} onChange={(e) => setLinkGcForm((prev) => ({ ...prev, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
