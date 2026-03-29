import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { setupMandate, createPayment, createSubscription, cancelSubscription, getPayments, getSubscriptions, mandateStatusColor, paymentStatusColor } from '../utils/gocardless'
import { sendEmail } from '../utils/email'
import { logAction } from '../utils/audit'

const PLANS    = ['Starter','Growth','Pro','Enterprise']
const STATUSES = ['active','inactive','pending']
const HOSTING  = [{ id:'h1',name:'Hosting Starter',price:35 },{ id:'h2',name:'Hosting Pro',price:65 },{ id:'h3',name:'Hosting Business',price:109 }]

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
  const [subs, setSubs]         = useState([])
  const [gcLoading, setGcLoading] = useState(false)
  const [settingUp, setSettingUp] = useState(false)
  const [payModal, setPayModal] = useState(null) // 'one_off' | 'subscription' | 'card'
  const [payForm, setPayForm]   = useState({ amount:'', description:'', name:'', day_of_month:1 })
  const [gcError, setGcError]   = useState('')
  const [gcSuccess, setGcSuccess] = useState('')

  // Activity + docs
  const [activity, setActivity] = useState([])
  const [tickets, setTickets]   = useState([])

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('clients').select('*').eq('id', id).maybeSingle(),
      fetch(`https://xtunnfdwltfesscmpove.supabase.co/rest/v1/client_invoices?client_id=eq.${id}&order=created_at.desc`, { headers: { apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM', Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM' } }).then(r => r.json()),
      supabase.from('gocardless_mandates').select('*').eq('client_id', id).maybeSingle(),
    ]).then(async ([{ data: c }, { data: inv }, { data: gc }]) => {
      if (!c) { navigate('/clients'); return }
      setClient(c)
      setForm({ ...c })
      setInvoices(Array.isArray(inv) ? inv : [])
      setGcStatus(gc)
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
      }
    })
  }, [id])

  // Also load tickets by email once we have the client
  useEffect(() => {
    if (!client?.email) return
    supabase.from('support_tickets').select('*').ilike('client_email', client.email).order('created_at', { ascending:false })
      .then(({ data }) => setTickets(data || []))
  }, [client?.email])

  const save = async () => {
    setSaving(true)
    await supabase.from('clients').update({ ...form, updated_at: new Date().toISOString() }).eq('id', id)
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
        client_id: id, client_email: client.email, client_name: client.name,
        customer_id: data.customer_id, billing_request_id: data.billing_request_id, status: 'pending',
      }, { onConflict: 'client_id' }).select().maybeSingle()
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
      await supabase.from('client_payments').insert([{
        client_id: id, client_email: client.email, client_name: client.name,
        amount: payForm.amount, payment_type: 'one_off',
        status: result.payment?.status || 'pending', gocardless_id: result.payment?.id,
        created_at: new Date().toISOString(),
      }])
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
    setInvoices(p => p.map(i => i.id === invId ? { ...i, status:'paid' } : i))
  }

  const totalCollected = payments.filter(p => p.status === 'paid_out').reduce((s, p) => s + (p.amount||0)/100, 0)

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (!client) return null

  const colour = ['#0071E3','#30A46C','#E54D2E','#8E4EC6','#C2500D','#0197C8','#D6409F'][(client.email||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0)%7]

  return (
    <div className="fade-in">
      {/* Back */}
      <button onClick={() => navigate('/clients')} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'1px solid var(--border)', borderRadius:100, padding:'6px 14px', cursor:'pointer', color:'var(--sub)', fontSize:13, marginBottom:24, transition:'all 0.15s' }}
        onMouseOver={e => e.currentTarget.style.borderColor='var(--text)'}
        onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}>
        ← Clients
      </button>

      {/* Hero */}
      <div style={{ display:'flex', alignItems:'center', gap:20, padding:'24px 28px', background:'var(--card)', borderRadius:16, border:'1px solid var(--border)', marginBottom:24 }}>
        <div style={{ width:64, height:64, borderRadius:14, background:colour+'18', border:`2px solid ${colour}33`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:700, fontFamily:'var(--font-display)', color:colour, flexShrink:0 }}>
          {(client.name||'?')[0].toUpperCase()}
        </div>
        <div style={{ flex:1 }}>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:400, letterSpacing:'-0.02em', lineHeight:1, color:'var(--text)' }}>{client.name}</h1>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:8 }}>
            {client.contact && <span style={{ fontSize:13, color:'var(--sub)' }}>{client.contact}</span>}
            <span style={{ color:'var(--border2)' }}>·</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--faint)' }}>{client.email}</span>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:10 }}>
            <span className="badge badge-blue">{client.plan}</span>
            <span className={`badge badge-${client.status==='active'?'green':client.status==='pending'?'amber':'grey'}`}>{client.status}</span>
            {client.value && <span className="badge badge-grey">£{Number(client.value).toLocaleString()}</span>}
            <span className={`badge badge-${client.invoice_paid?'green':'amber'}`}>{client.invoice_paid?'Invoice Paid':'Invoice Unpaid'}</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
          {saved && <span style={{ fontSize:13, color:'var(--green)', alignSelf:'center' }}>✓ Saved</span>}
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving...':'Save Changes'}</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[['overview','Overview'],['payments','Payments'],['invoices','Invoices'],['tickets','Tickets'],['activity','Activity']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={'tab'+(tab===k?' on':'')}>{l}</button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <div className="card card-pad">
            <div className="lbl" style={{ marginBottom:14 }}>Client Details</div>
            <div className="fg">
              <div><label className="lbl">Business Name</label><input className="inp" value={form.name||''} onChange={e=>pf('name',e.target.value)}/></div>
              <div><label className="lbl">Contact Person</label><input className="inp" value={form.contact||''} onChange={e=>pf('contact',e.target.value)}/></div>
              <div><label className="lbl">Email</label><input className="inp" type="email" value={form.email||''} onChange={e=>pf('email',e.target.value)}/></div>
              <div><label className="lbl">Phone</label><input className="inp" value={form.phone||''} onChange={e=>pf('phone',e.target.value)}/></div>
              <div><label className="lbl">Plan</label>
                <select className="inp" value={form.plan||''} onChange={e=>pf('plan',e.target.value)}>
                  {PLANS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div><label className="lbl">Status</label>
                <select className="inp" value={form.status||''} onChange={e=>pf('status',e.target.value)}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="lbl">Value (£)</label><input className="inp" type="number" value={form.value||''} onChange={e=>pf('value',e.target.value)}/></div>
              <div><label className="lbl">Website URL</label><input className="inp" value={form.website_url||''} onChange={e=>pf('website_url',e.target.value)} placeholder="https://"/></div>
              <div className="fc"><label className="lbl">Notes</label><textarea className="inp" rows={3} value={form.notes||''} onChange={e=>pf('notes',e.target.value)} style={{ resize:'vertical' }}/></div>
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, marginTop:14 }}>
              <input type="checkbox" checked={!!form.invoice_paid} onChange={e=>pf('invoice_paid',e.target.checked)} style={{ accentColor:'var(--accent)', width:16, height:16 }}/>
              Invoice Paid
            </label>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {/* Stats */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="stat-card"><div className="stat-val" style={{ color:'var(--accent)' }}>£{totalCollected.toLocaleString()}</div><div className="stat-lbl">Collected</div></div>
              <div className="stat-card"><div className="stat-val" style={{ color:'var(--green)' }}>{subs.filter(s=>s.status==='active').length}</div><div className="stat-lbl">Active Subs</div></div>
              <div className="stat-card"><div className="stat-val" style={{ color:'var(--amber)' }}>{invoices.filter(i=>i.status==='unpaid').length}</div><div className="stat-lbl">Unpaid Invoices</div></div>
              <div className="stat-card"><div className="stat-val" style={{ color:'var(--sub)' }}>{tickets.filter(t=>t.status==='open').length}</div><div className="stat-lbl">Open Tickets</div></div>
            </div>
            {/* Quick actions */}
            <div className="card card-pad">
              <div className="lbl" style={{ marginBottom:12 }}>Quick Actions</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <button className="btn btn-outline" style={{ justifyContent:'flex-start' }} onClick={() => { setTab('invoices'); setInvModal(true) }}>+ Create Invoice</button>
                <button className="btn btn-outline" style={{ justifyContent:'flex-start' }} onClick={() => setTab('payments')}>💳 Manage Payments</button>
                {client.website_url && <a href={client.website_url} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ justifyContent:'flex-start' }}>🌐 View Website</a>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payments tab */}
      {tab === 'payments' && (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {gcError && <div style={{ padding:'10px 14px', background:'var(--red-bg)', border:'1px solid var(--red)', borderRadius:8, fontSize:13, color:'var(--red)' }}>{gcError}</div>}
          {gcSuccess && <div style={{ padding:'10px 14px', background:'var(--green-bg)', border:'1px solid var(--green)', borderRadius:8, fontSize:13, color:'var(--green)' }}>✓ {gcSuccess}</div>}

          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
            <div className="stat-card">
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background: gcStatus?.status==='active'?'var(--green)': gcStatus?'var(--amber)':'var(--border)', flexShrink:0 }}/>
                <div className="stat-lbl" style={{ margin:0 }}>Direct Debit</div>
              </div>
              <div className="stat-val" style={{ fontSize:18, color: gcStatus?.status==='active'?'var(--green)':'var(--sub)' }}>
                {gcStatus?.status==='active' ? 'Active' : gcStatus ? 'Pending' : 'Not set up'}
              </div>
            </div>
            <div className="stat-card"><div className="stat-lbl">Total Collected</div><div className="stat-val" style={{ color:'var(--accent)' }}>£{totalCollected.toLocaleString()}</div></div>
            <div className="stat-card"><div className="stat-lbl">Subscriptions</div><div className="stat-val" style={{ color:'var(--green)' }}>{subs.filter(s=>s.status==='active').length}</div></div>
          </div>

          {/* Payment buttons */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {!gcStatus ? (
              <button className="btn btn-primary" onClick={doSetupMandate} disabled={settingUp} style={{ padding:'12px 24px' }}>
                {settingUp ? 'Opening GoCardless...' : '🏦 Set Up Direct Debit'}
              </button>
            ) : gcStatus.status === 'active' ? (
              <>
                <button className="btn btn-primary" onClick={() => { setPayForm({ amount:'', description:'', name:'', day_of_month:1 }); setGcError(''); setPayModal('one_off') }}>
                  💸 Collect One-off Payment
                </button>
                <button className="btn btn-outline" onClick={() => { setPayForm({ amount:'', description:'', name:'', day_of_month:1 }); setGcError(''); setPayModal('subscription') }}>
                  🔄 Set Up Subscription
                </button>
              </>
            ) : (
              <div style={{ padding:'12px 16px', background:'var(--amber-bg)', border:'1px solid var(--amber)', borderRadius:8, fontSize:13, color:'var(--amber)' }}>
                ⏳ Waiting for client to authorise the Direct Debit mandate
              </div>
            )}
          </div>

          {!gcStatus && (
            <div style={{ padding:'12px 16px', background:'var(--bg2)', borderRadius:8, fontSize:13, color:'var(--sub)', lineHeight:1.7 }}>
              <strong>About Direct Debit:</strong> Once set up, you can collect one-off payments and recurring subscriptions automatically from the client's bank account via GoCardless. The client will receive a secure link to authorise the mandate.
            </div>
          )}

          {/* Subscriptions */}
          {subs.length > 0 && (
            <div className="card" style={{ overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--faint)' }}>
                Subscriptions ({subs.length})
              </div>
              <table className="tbl">
                <thead><tr><th>Name</th><th>Amount</th><th>Day</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {subs.map(s => (
                    <tr key={s.id}>
                      <td className="t-main">{s.name}</td>
                      <td>£{(s.amount/100).toFixed(2)}/mo</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>Day {s.day_of_month}</td>
                      <td><span className={`badge badge-${s.status==='active'?'green':'grey'}`}>{s.status}</span></td>
                      <td>{s.status==='active' && <button className="btn btn-danger btn-sm" onClick={() => doCancel(s.id)}>Cancel</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Payment history */}
          {payments.length > 0 && (
            <div className="card" style={{ overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--faint)' }}>
                Payment History
              </div>
              <table className="tbl">
                <thead><tr><th>Date</th><th>Amount</th><th>Description</th><th>Status</th></tr></thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{p.charge_date || new Date(p.created_at||Date.now()).toLocaleDateString('en-GB')}</td>
                      <td>£{(p.amount/100).toFixed(2)}</td>
                      <td>{p.description || '—'}</td>
                      <td><span className={`badge badge-${paymentStatusColor(p.status)}`}>{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Invoices tab */}
      {tab === 'invoices' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            <button className="btn btn-primary" onClick={() => setInvModal(true)}>+ Create Invoice</button>
          </div>
          <div className="card" style={{ overflow:'hidden' }}>
            {invoices.length === 0 ? <div className="empty"><p>No invoices yet</p></div> : (
              <table className="tbl">
                <thead><tr><th>Invoice #</th><th>Description</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="t-main" style={{ fontFamily:'var(--font-mono)' }}>{inv.invoice_number}</td>
                      <td>{inv.description}</td>
                      <td>£{Number(inv.amount||0).toLocaleString()}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{inv.due_date || '—'}</td>
                      <td><span className={`badge badge-${inv.status==='paid'?'green':'amber'}`}>{inv.status}</span></td>
                      <td>{inv.status==='unpaid' && <button className="btn btn-ghost btn-sm" onClick={() => markPaid(inv.id)}>Mark Paid</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tickets tab */}
      {tab === 'tickets' && (
        <div className="card" style={{ overflow:'hidden' }}>
          {tickets.length === 0 ? <div className="empty"><p>No support tickets from this client</p></div> : (
            <table className="tbl">
              <thead><tr><th>Subject</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id}>
                    <td className="t-main">{t.subject}</td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
                    <td><span className={`badge badge-${t.status==='open'?'amber':'green'}`}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Activity tab */}
      {tab === 'activity' && (
        <div className="card" style={{ overflow:'hidden' }}>
          {activity.length === 0 ? <div className="empty"><p>No activity recorded</p></div> : (
            <table className="tbl">
              <thead><tr><th>Event</th><th>Description</th><th>Date</th></tr></thead>
              <tbody>
                {activity.map(a => (
                  <tr key={a.id}>
                    <td><span className="badge badge-blue">{a.event_type?.replace(/_/g,' ')}</span></td>
                    <td>{a.description}</td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(a.created_at).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Modals ── */}

      {/* Invoice modal */}
      {invModal && (
        <Modal title="Create Invoice" onClose={() => setInvModal(false)}
          footer={<><button className="btn btn-outline" onClick={() => setInvModal(false)}>Cancel</button><button className="btn btn-primary" onClick={createInvoice} disabled={saving}>{saving?'Creating...':'Create & Email'}</button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="fg">
              <div><label className="lbl">Invoice #</label><input className="inp" value={invForm.invoice_number} onChange={e=>setInvForm(p=>({...p,invoice_number:e.target.value}))} placeholder="INV-001"/></div>
              <div><label className="lbl">Amount (£)</label><input className="inp" type="number" value={invForm.amount} onChange={e=>setInvForm(p=>({...p,amount:e.target.value}))}/></div>
            </div>
            <div><label className="lbl">Description</label><input className="inp" value={invForm.description} onChange={e=>setInvForm(p=>({...p,description:e.target.value}))} placeholder="Web Design — March 2026"/></div>
            <div><label className="lbl">Due Date</label><input className="inp" type="date" value={invForm.due_date} onChange={e=>setInvForm(p=>({...p,due_date:e.target.value}))}/></div>
            <div>
              <label className="lbl" style={{ marginBottom:8 }}>Payment Type</label>
              <div style={{ display:'flex', gap:8 }}>
                {[['one_off','One-off'],['monthly','Monthly DD']].map(([v,l]) => (
                  <button key={v} onClick={() => setInvForm(p=>({...p,payment_type:v}))} style={{ flex:1, padding:'10px', borderRadius:8, border:`2px solid ${invForm.payment_type===v?'var(--accent)':'var(--border)'}`, background:invForm.payment_type===v?'var(--accent-soft)':'transparent', cursor:'pointer', fontSize:13, fontWeight:500, color:invForm.payment_type===v?'var(--accent)':'var(--sub)' }}>{l}</button>
                ))}
              </div>
            </div>
            {gcStatus?.status === 'active' && invForm.payment_type === 'one_off' && invForm.amount && (
              <div style={{ padding:'10px 14px', background:'var(--green-bg)', border:'1px solid var(--green)', borderRadius:7, fontSize:13, color:'var(--green)' }}>
                ✓ Direct Debit active — £{invForm.amount} will be collected automatically via GoCardless
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* One-off payment modal */}
      {payModal === 'one_off' && (
        <Modal title="Collect One-off Payment" onClose={() => setPayModal(null)}
          footer={<><button className="btn btn-outline" onClick={() => setPayModal(null)}>Cancel</button><button className="btn btn-primary" onClick={doPayment} disabled={saving||!payForm.amount}>{saving?'Processing...':'Collect Payment'}</button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {gcError && <div style={{ padding:'10px 14px', background:'var(--red-bg)', border:'1px solid var(--red)', borderRadius:7, fontSize:13, color:'var(--red)' }}>{gcError}</div>}
            <div><label className="lbl">Amount (£)</label><input className="inp" type="number" value={payForm.amount} onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))} placeholder="449"/></div>
            <div><label className="lbl">Description</label><input className="inp" value={payForm.description} onChange={e=>setPayForm(p=>({...p,description:e.target.value}))} placeholder="Website build — March 2026"/></div>
            <div style={{ padding:'10px 14px', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius:7, fontSize:13, color:'var(--accent)' }}>
              This will immediately charge the client's bank account via GoCardless Direct Debit. Funds arrive in 3–5 working days.
            </div>
          </div>
        </Modal>
      )}

      {/* Subscription modal */}
      {payModal === 'subscription' && (
        <Modal title="Set Up Monthly Subscription" onClose={() => setPayModal(null)}
          footer={<><button className="btn btn-outline" onClick={() => setPayModal(null)}>Cancel</button><button className="btn btn-primary" onClick={doSubscription} disabled={saving||!payForm.amount}>{saving?'Setting up...':'Create Subscription'}</button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {gcError && <div style={{ padding:'10px 14px', background:'var(--red-bg)', border:'1px solid var(--red)', borderRadius:7, fontSize:13, color:'var(--red)' }}>{gcError}</div>}
            <div><label className="lbl">Monthly Amount (£)</label><input className="inp" type="number" value={payForm.amount} onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))} placeholder="35"/></div>
            <div><label className="lbl">Subscription Name</label><input className="inp" value={payForm.name} onChange={e=>setPayForm(p=>({...p,name:e.target.value}))} placeholder="Hosting Pro Plan"/></div>
            <div><label className="lbl">Collection Day (1–28)</label><input className="inp" type="number" min="1" max="28" value={payForm.day_of_month} onChange={e=>setPayForm(p=>({...p,day_of_month:Number(e.target.value)}))}/></div>
            <div style={{ padding:'10px 14px', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius:7, fontSize:13, color:'var(--accent)' }}>
              Client will be charged £{payForm.amount||'X'}/month on day {payForm.day_of_month} of each month via Direct Debit.
            </div>
            {/* Quick plan buttons */}
            <div>
              <div className="lbl" style={{ marginBottom:8 }}>Quick Plans</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {HOSTING.map(h => (
                  <button key={h.id} onClick={() => setPayForm(p=>({...p,amount:h.price,name:h.name}))} style={{ padding:'6px 12px', borderRadius:7, border:`1px solid ${payForm.name===h.name?'var(--accent)':'var(--border)'}`, background:payForm.name===h.name?'var(--accent-soft)':'transparent', cursor:'pointer', fontSize:12, color:'var(--text)' }}>
                    {h.name} — £{h.price}/mo
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
