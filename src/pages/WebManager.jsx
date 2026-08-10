import { useState, useEffect, useRef } from 'react'
import SiteEditorPage from './SiteEditor'
import { setupMandate, getBillingRequest, getMandates, createPayment, createSubscription, cancelSubscription, getPayments, getSubscriptions, paymentStatusColor, mandateStatusColor } from '../utils/gocardless'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { PaymentsHub } from '../components/PaymentsHub'
import { sendEmail } from '../utils/email'
import { Button, FormField, FormLabel, FormInput, FormSelect, StatusBadge } from '../components/ds'

const DS_CARD = { background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)' }
const TONE_TO_VARIANT = { green:'active', amber:'warning', red:'error', blue:'info', grey: 'neutral' }

const GCLESS_BASE = 'https://api.gocardless.com'
const PLANS = [
  { id:'starter',  name:'Starter',     price:449,  monthly:null  },
  { id:'growth',   name:'Growth',      price:999,  monthly:83    },
  { id:'pro',      name:'Pro',         price:1499, monthly:125   },
  { id:'hosting1', name:'Hosting S',   price:null, monthly:35    },
  { id:'hosting2', name:'Hosting Pro', price:null, monthly:65    },
  { id:'hosting3', name:'Hosting Biz', price:null, monthly:109   },
]
const MANUAL_PAYMENT_OPTIONS = [
  ['manual:starter', 'Starter'],
  ['manual:growth', 'Growth'],
  ['manual:pro', 'Pro'],
  ['manual:enterprise', 'Enterprise'],
  ['manual:custom', 'Manual / Custom'],
]
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

// ── Sections ──────────────────────────────────────────────────────────
function NavTab({ label, active, onClick, badge }) {
  return (
    <button onClick={onClick} style={{ padding:'10px 18px', background: active ? 'var(--color-bg-surface)' : 'transparent', border:'none', borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent', fontFamily:'var(--font-body)', fontSize:13, fontWeight: active ? 600 : 400, color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', gap:6, marginBottom:-1, transition:'all 0.15s', whiteSpace:'nowrap' }}>
      {label}
      {badge > 0 && <span style={{ background:'var(--color-red-500)', color:'#fff', fontSize:9, fontWeight:700, minWidth:16, height:16, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>{badge}</span>}
    </button>
  )
}


// ── Site Editor Component ──────────────────────────────────────────────
function SiteEditor({ url, title }) {
  const [device, setDevice] = useState('desktop')
  const [loading, setLoading] = useState(true)
  const iframeRef = useRef()

  const deviceWidths = { desktop:'100%', tablet:'768px', mobile:'390px' }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'70vh' }}>
      <div style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)', padding:'8px 16px', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ display:'flex', gap:0, background:'var(--card)', borderRadius:8, border:'1px solid var(--border)', overflow:'hidden' }}>
          {[['desktop','🖥','Desktop'],['tablet','📱','Tablet'],['mobile','📲','Mobile']].map(([key,icon,label]) => (
            <button key={key} onClick={() => setDevice(key)} style={{ padding:'5px 12px', border:'none', background: device===key ? 'var(--accent)' : 'transparent', color: device===key ? '#fff' : 'var(--sub)', cursor:'pointer', fontSize:12, fontWeight:500, transition:'all 0.15s' }}>
              {icon} {label}
            </button>
          ))}
        </div>
        <div style={{ flex:1, background:'var(--card)', border:'1px solid var(--border)', borderRadius:7, padding:'5px 12px', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--sub)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{url}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setLoading(true); if(iframeRef.current) iframeRef.current.src = iframeRef.current.src }}>↺ Reload</button>
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">↗ Open</a>
      </div>
      <div style={{ flex:1, background:'var(--bg3)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding: device==='desktop' ? '0' : '16px', overflow:'hidden', position:'relative' }}>
        {loading && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg3)', zIndex:1 }}>
            <div style={{ textAlign:'center' }}>
              <div className="spin" style={{ width:24, height:24, margin:'0 auto 12px' }}/>
              <div style={{ fontSize:13, color:'var(--faint)' }}>Loading {title}...</div>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={url}
          style={{ width: deviceWidths[device], maxWidth:'100%', height:'100%', border:'none', display:'block', borderRadius: device!=='desktop' ? 12 : 0, boxShadow: device!=='desktop' ? '0 8px 32px rgba(0,0,0,0.15)' : 'none', transition:'width 0.3s ease' }}
          title={`${title} website`}
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  )
}



// ── GoCardless Payments Panel ─────────────────────────────────────────
function GoCardlessPanel({ client, gcStatus, setGcStatus }) {
  return <PaymentsHub client={client} gcStatus={gcStatus} setGcStatus={setGcStatus} />
}

// ── Client Profile ─────────────────────────────────────────────────────
function ClientProfile({ client, onBack }) {
  const { user } = useAuth()
  const [tab, setTab]           = useState('overview')
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [loadingInv, setLoadInv] = useState(false)
  const [modal, setModal]       = useState(null)
  const [invForm, setInvForm]   = useState({ invoice_number:'', description:'', amount:'', due_date:'', payment_type:'one_off', plan_id:'' })
  const [saving, setSaving]     = useState(false)
  const [gcStatus, setGcStatus] = useState(null)
  const [gcError, setGcError]   = useState('')
  const [gcSuccess, setGcSuccess] = useState('')
  const sf = (k,v) => setInvForm(p=>({...p,[k]:v}))

  useEffect(() => {
    setLoadInv(true)
    Promise.all([
      fetch(`https://xtunnfdwltfesscmpove.supabase.co/rest/v1/client_invoices?client_email=eq.${encodeURIComponent(client.email)}&order=created_at.desc`, { headers: { apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM', Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM' } }).then(r => r.json()),
      supabase.from('client_payments').select('*').eq('client_email', client.email).order('created_at',{ascending:false}),
    ]).then(([{ data: inv }, { data: pay }]) => {
      setInvoices(Array.isArray(inv) ? inv : [])
      setPayments(pay||[])
      setLoadInv(false)
    })
    // Check GoCardless mandate status
    supabase.from('gocardless_mandates').select('*').eq('client_email', client.email).maybeSingle().then(({ data }) => setGcStatus(data))
  }, [client.email])

  // SECURITY: Use centralized Supabase client (supabase) instead of hardcoded URL/keys

  const createInvoice = async () => {
    if (!invForm.description?.trim() || !invForm.amount) { alert('Description and amount are required'); return }
    setSaving(true)
    try {
      const inv = {
        invoice_number: invForm.invoice_number || null,
        description:    invForm.description,
        amount:         invForm.amount,
        due_date:       invForm.due_date || null,
        payment_type:   invForm.payment_type || 'one_off',
        plan_id:        invForm.plan_id || null,
        client_email:   client.email,
        client_name:    client.name,
        created_by:     user?.name || null,
        created_at:     new Date().toISOString(),
        status:         'unpaid',
      }

      // Raw REST insert to avoid supabase-js columns= bug
      const insertRes = await fetch(`${WM_SB_URL}/rest/v1/client_invoices`, {
        method: 'POST', headers: wmHeaders, body: JSON.stringify(inv)
      })
      if (!insertRes.ok) { const e = await insertRes.text(); throw new Error(e) }

      // Send invoice email
      try {
        await sendEmail('invoice_issued', {
          to_email: client.email,
          client_name: client.name,
          invoice_number: invForm.invoice_number || 'N/A',
          description: invForm.description,
          amount: invForm.amount,
          due_date: invForm.due_date || 'N/A',
        })
      } catch(e) { console.warn('Email send failed:', e) }

      // If mandate exists and payment requested, collect via GoCardless
      if (gcStatus?.mandate_id && invForm.amount) {
        try {
          if (invForm.payment_type === 'monthly') {
            const subResult = await createSubscription(gcStatus.mandate_id, Number(invForm.amount), invForm.description || 'DH Website Services Monthly')
            await fetch(`${WM_SB_URL}/rest/v1/client_payments`, {
              method: 'POST', headers: wmHeaders,
              body: JSON.stringify({ client_email: client.email, client_name: client.name, amount: invForm.amount, payment_type: 'subscription', status: subResult.subscription?.status || 'pending', gocardless_id: subResult.subscription?.id, created_at: new Date().toISOString() })
            })
          } else {
            const payResult = await createPayment(gcStatus.mandate_id, Number(invForm.amount), invForm.description || 'DH Website Services')
            await fetch(`${WM_SB_URL}/rest/v1/client_payments`, {
              method: 'POST', headers: wmHeaders,
              body: JSON.stringify({ client_email: client.email, client_name: client.name, amount: invForm.amount, payment_type: 'one_off', status: payResult.payment?.status || 'pending', gocardless_id: payResult.payment?.id, created_at: new Date().toISOString() })
            })
          }
        } catch(e) { console.warn('GoCardless payment error:', e.message) }
      }

      // Reload invoices via raw REST
      const listRes = await fetch(`${WM_SB_URL}/rest/v1/client_invoices?client_email=eq.${encodeURIComponent(client.email)}&order=created_at.desc`, {
        headers: { 'apikey': WM_SB_KEY, 'Authorization': 'Bearer ' + WM_SB_KEY }
      })
      setInvoices(listRes.ok ? await listRes.json() : [])

      setModal(null)
      setInvForm({ invoice_number:'', description:'', amount:'', due_date:'', payment_type:'one_off', plan_id:'' })
    } catch(err) {
      console.error('Invoice error:', err)
      alert('Failed to create invoice: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const setupGoCardless = async () => {
    setSaving(true); setGcError(''); setGcSuccess('')
    try {
      const data = await setupMandate(client.email, client.name)
      if (data.error) { setGcError('GoCardless error: ' + data.error); setSaving(false); return }
      await supabase.from('gocardless_mandates').upsert({
        client_email: client.email, client_name: client.name,
        customer_id: data.customer_id,
        billing_request_id: data.billing_request_id,
        status: 'pending',
      }, { onConflict: 'client_email' })
      setGcStatus({ client_email: client.email, status: 'pending', customer_id: data.customer_id, billing_request_id: data.billing_request_id })
      window.open(data.redirect_url, '_blank')
      setGcSuccess('GoCardless page opened — ask the client to complete their bank details.')
    } catch(e) {
      setGcError('Could not connect to GoCardless: ' + e.message)
    }
    setSaving(false)
  }

  const markPaid = async (id) => {
    const WM_KEY2 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM'
    await fetch(`https://xtunnfdwltfesscmpove.supabase.co/rest/v1/client_invoices?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'apikey': WM_KEY2, 'Authorization': 'Bearer ' + WM_KEY2, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString() })
    })
    const listRes2 = await fetch(`https://xtunnfdwltfesscmpove.supabase.co/rest/v1/client_invoices?client_email=eq.${encodeURIComponent(client.email)}&order=created_at.desc`, {
      headers: { 'apikey': WM_KEY2, 'Authorization': 'Bearer ' + WM_KEY2 }
    })
    setInvoices(listRes2.ok ? await listRes2.json() : [])
  }

  return (
    <div className="ds-content">
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
        <button onClick={onBack} style={{ background:'none', border:'1px solid var(--color-border)', borderRadius:7, padding:'7px 14px', cursor:'pointer', color:'var(--color-text-secondary)', fontSize:13, display:'flex', alignItems:'center', gap:6 }}>← Clients</button>
        <div>
          <h1 style={{ fontSize:28, fontWeight:600, letterSpacing:'-0.02em', lineHeight:1 }}>{client.name}</h1>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--color-text-tertiary)', marginTop:4, letterSpacing:'0.08em' }}>{client.email} · {client.plan}</div>
        </div>
        <div style={{ marginLeft:'auto' }}>
          <StatusBadge variant={TONE_TO_VARIANT[client.status==='active'?'green':'grey'] || 'info'}>{client.status}</StatusBadge>
        </div>
      </div>

      <div style={{ display:'flex', borderBottom:'1px solid var(--color-border)', marginBottom:24 }}>
        {[['overview','Overview'],['editor','Edit Website'],['invoices','Invoices'],['payments','Payments']].map(([k,l]) => (
          <NavTab key={k} label={l} active={tab===k} onClick={()=>setTab(k)} badge={k==='invoices' ? invoices.filter(i=>i.status==='unpaid').length : 0}/>
        ))}
      </div>

      {tab==='overview' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <div style={{ ...DS_CARD, padding:20 }}>
            <div className="ds-form-label" style={{ display:'block', marginBottom:14 }}>Client Details</div>
            {[['Name',client.name],['Email',client.email],['Phone',client.phone||'—'],['Plan',client.plan],['Status',client.status],['Value',client.value?'£'+Number(client.value).toLocaleString():'—']].map(([k,v]) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'7px 0', borderBottom:'1px solid var(--color-border)' }}>
                <span style={{ color:'var(--color-text-tertiary)', fontFamily:'var(--font-mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em' }}>{k}</span>
                <span style={{ fontWeight:500 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ ...DS_CARD, padding:20 }}>
            <div className="ds-form-label" style={{ display:'block', marginBottom:14 }}>GoCardless</div>
            {gcStatus?.status === 'active' ? (
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                  <span style={{ width:8,height:8,borderRadius:'50%',background:'var(--color-green-500)',display:'inline-block' }}/>
                  <span style={{ fontSize:13, fontWeight:500, color:'var(--color-green-500)' }}>Mandate Active</span>
                </div>
                <div style={{ fontSize:12, color:'var(--color-text-tertiary)', fontFamily:'var(--font-mono)' }}>{gcStatus.mandate_id}</div>
              </div>
            ) : gcStatus ? (
              <div>
                <p style={{ fontSize:13, color:'var(--color-text-secondary)', marginBottom:14, lineHeight:1.6 }}>The client still needs to complete the secure GoCardless authorisation page before the mandate becomes active.</p>
                {gcError && <div style={{ fontSize:12, color:'var(--color-red-500)', marginBottom:8 }}>{gcError}</div>}
                {gcSuccess && <div style={{ fontSize:12, color:'var(--color-green-500)', marginBottom:8 }}>✓ {gcSuccess}</div>}
                <div style={{ fontSize:12, color:'var(--color-amber-500)' }}>Pending authorisation</div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize:13, color:'var(--color-text-secondary)', marginBottom:14, lineHeight:1.6 }}>Set up Direct Debit mandate for automated monthly payments via GoCardless.</p>
                {gcError && <div style={{ fontSize:12, color:'var(--color-red-500)', marginBottom:8 }}>{gcError}</div>}
                {gcSuccess && <div style={{ fontSize:12, color:'var(--color-green-500)', marginBottom:8 }}>✓ {gcSuccess}</div>}
                <Button variant="primary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={setupGoCardless} disabled={saving}>{saving?'Opening...':'Set Up Direct Debit'}</Button>
              </div>
            )}
            <div className="ds-form-label" style={{ display:'block', marginTop:20, marginBottom:10 }}>Quick Actions</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <Button variant="secondary" style={{ justifyContent:'flex-start' }} onClick={()=>{ setTab('invoices'); setModal('invoice') }}>+ Create Invoice</Button>
              <Button variant="secondary" style={{ justifyContent:'flex-start' }} onClick={()=>setTab('editor')}>✎ Edit Their Website</Button>
            </div>
          </div>
        </div>
      )}

      {tab==='editor' && (
        <div style={{ ...DS_CARD, overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--color-border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontWeight:600, fontSize:14 }}>Website Editor — {client.name}</div>
              <div style={{ fontSize:12, color:'var(--color-text-tertiary)', marginTop:2 }}>Visual editor for client's site</div>
            </div>
            {client.website_url && <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => window.open(client.website_url, '_blank', 'noreferrer')}>Preview Site ↗</Button>}
          </div>
          {client.website_url ? (
            <SiteEditor url={client.website_url} title={client.name}/>
          ) : (
            <ConnectSitePrompt clientId={client.id} onSave={(url) => {
              // Update local state
              setSelected(s => ({ ...s, website_url: url }))
            }}/>
          )}
        </div>
      )}

      {tab==='invoices' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            <Button variant="primary" onClick={()=>setModal('invoice')}>+ Create Invoice</Button>
          </div>
          <div style={{ ...DS_CARD, overflow:'hidden' }}>
            {loadingInv ? <div className="spin-wrap"><div className="spin"/></div> : invoices.length===0 ? <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No invoices yet</div> : (
              <table className="ds-table">
                <thead><tr><th>Invoice #</th><th>Description</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ fontFamily:'var(--font-mono)' }}>{inv.invoice_number}</td>
                      <td>{inv.description}</td>
                      <td>£{Number(inv.amount||0).toLocaleString()}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{inv.due_date||'—'}</td>
                      <td><StatusBadge variant={TONE_TO_VARIANT[inv.status==='paid'?'green':'amber'] || 'info'}>{inv.status}</StatusBadge></td>
                      <td>{inv.status==='unpaid' && <Button variant="ghost" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={()=>markPaid(inv.id)}>Mark Paid</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab==='payments' && (
        <GoCardlessPanel client={client} gcStatus={gcStatus} setGcStatus={setGcStatus}/>
      )}

      {modal==='invoice' && (
        <Modal title="Create Invoice" onClose={()=>setModal(null)} footer={<><Button variant="secondary" onClick={()=>setModal(null)}>Cancel</Button><Button variant="primary" onClick={createInvoice} disabled={saving}>{saving?'Saving...':'Create Invoice'}</Button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16 }}>
              <FormField><FormLabel>Invoice #</FormLabel><FormInput value={invForm.invoice_number} onChange={e=>sf('invoice_number',e.target.value)} placeholder="INV-001"/></FormField>
              <FormField><FormLabel>Amount (£)</FormLabel><FormInput type="number" value={invForm.amount} onChange={e=>sf('amount',e.target.value)}/></FormField>
            </div>
            <FormField><FormLabel>Description</FormLabel><FormInput value={invForm.description} onChange={e=>sf('description',e.target.value)} placeholder="Web Design — March 2026"/></FormField>
            <FormField><FormLabel>Payment Type</FormLabel>
              <div style={{ display:'flex', gap:8, marginTop:6 }}>
                {[['one_off','One-off Payment'],['monthly','Monthly Plan']].map(([v,l]) => (
                  <button key={v} onClick={()=>sf('payment_type',v)} style={{ flex:1, padding:'10px', borderRadius:7, border:`2px solid ${invForm.payment_type===v?'var(--color-primary)':'var(--color-border)'}`, background: invForm.payment_type===v ? 'var(--color-blue-50)' : 'transparent', cursor:'pointer', fontSize:13, fontWeight:500, color: invForm.payment_type===v ? 'var(--color-primary)' : 'var(--color-text-secondary)', transition:'all 0.15s' }}>{l}</button>
                ))}
              </div>
            </FormField>
            {invForm.payment_type==='monthly' && (
              <FormField>
                <FormLabel>Select Plan</FormLabel>
                <FormSelect value={invForm.plan_id} onChange={e=>{ const plan=PLANS.find(p=>p.id===e.target.value); sf('plan_id',e.target.value); if(plan?.monthly) sf('amount',plan.monthly) }}>
                  <option value="">— Select plan —</option>
                  {PLANS.filter(p=>p.monthly).map(p=><option key={p.id} value={p.id}>{p.name} — £{p.monthly}/mo</option>)}
                </FormSelect>
              </FormField>
            )}
            <FormField><FormLabel>Due Date</FormLabel><FormInput type="date" value={invForm.due_date} onChange={e=>sf('due_date',e.target.value)}/></FormField>
            {invForm.payment_type==='monthly' && <div style={{ padding:'10px 14px', background:'var(--color-blue-50)', border:'1px solid var(--color-blue-500)', borderRadius:7, fontSize:13, color:'var(--color-blue-500)' }}>Monthly payments will be collected automatically via GoCardless Direct Debit once a mandate is active for this client.</div>}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Public Site Editor ─────────────────────────────────────────────────
function PublicSiteEditor() {
  return (
    <div style={{ padding:'0 4px 20px' }}>
      <SiteEditorPage />
    </div>
  )
}
// ── Main Web Manager ───────────────────────────────────────────────────
export default function WebManager() {
  const { user, can, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [section, setSection]   = useState('clients')
  const [clients, setClients]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const [search, setSearch]     = useState('')

  // Permission check
  const hasAccess = isAdmin || can('clientmgmt') || can('website_editor')
  const canEditPublicSite = isAdmin || can('website_editor')

  useEffect(() => {
    if (!hasAccess) return
    supabase.from('clients').select('*').eq('status','active').order('name').then(({ data }) => { setClients(data||[]); setLoading(false) })
  }, [hasAccess])

  if (!hasAccess) return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🔒</div>
        <h2 style={{ fontSize:26, fontWeight:600, marginBottom:8 }}>Access Restricted</h2>
        <p style={{ color:'var(--color-text-secondary)', marginBottom:20 }}>You need permission to access Web Manager.</p>
        <Button onClick={() => navigate('/')} variant="secondary">← Go Back</Button>
      </div>
    </div>
  )

  if (selected) return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>
      <div style={{ background:'var(--color-bg-surface)', borderBottom:'1px solid var(--color-border)', padding:'0 32px', display:'flex', alignItems:'center', gap:0 }}>
        <button onClick={() => navigate('/')} style={{ padding:'16px 16px 16px 0', background:'none', border:'none', cursor:'pointer', fontSize:20, fontWeight:700, color:'var(--color-text-primary)' }}>DH <span style={{ color:'var(--color-primary)' }}>Web</span></button>
        <div style={{ width:1, height:24, background:'var(--color-border)', margin:'0 16px' }}/>
        <div style={{ display:'flex', borderBottom:'none' }}>
          {[['clients','Clients'],['publicsite','Our Public Site']].map(([k,l]) => canEditPublicSite || k!=='publicsite' ? <NavTab key={k} label={l} active={section===k} onClick={()=>{ setSelected(null); setSection(k) }}/> : null)}
          {canEditPublicSite && <NavTab label="Website Editor" onClick={()=>{ window.location.href = '/website' }}/>}
        </div>
      </div>
      <div style={{ padding:'28px 32px' }}>
        <ClientProfile client={selected} onBack={() => setSelected(null)}/>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>
      {/* Web Manager header nav */}
      <div style={{ background:'var(--color-bg-surface)', borderBottom:'1px solid var(--color-border)', padding:'0 32px', display:'flex', alignItems:'center' }}>
        <button onClick={() => navigate('/')} style={{ padding:'16px 16px 16px 0', background:'none', border:'none', cursor:'pointer', fontSize:20, fontWeight:700, color:'var(--color-text-primary)', flexShrink:0 }}>DH <span style={{ color:'var(--color-primary)' }}>Web</span></button>
        <div style={{ width:1, height:24, background:'var(--color-border)', margin:'0 16px', flexShrink:0 }}/>
        <div style={{ display:'flex', flex:1 }}>
          <NavTab label="Client Sites" active={section==='clients'} onClick={()=>setSection('clients')}/>
          {canEditPublicSite && <NavTab label="Our Public Site" active={section==='publicsite'} onClick={()=>setSection('publicsite')}/>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0' }}>
          <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--color-blue-50)', border:'1px solid var(--color-border)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
            <img src="/dh-logo-icon.png" alt="DH avatar" style={{ width:18, height:18, objectFit:'contain' }} />
          </div>
          <span style={{ fontSize:12, color:'var(--color-text-secondary)' }}>{user?.name}</span>
        </div>
      </div>

      <div style={{ padding:'28px 32px' }}>
        {section==='publicsite' && canEditPublicSite ? <PublicSiteEditor/> : (
          <div className="ds-content">
            <div style={{ marginBottom:24 }}>
              <h1 style={{ fontSize:34, fontWeight:600, letterSpacing:'-0.02em' }}>Client Sites</h1>
              <p style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--color-text-tertiary)', marginTop:6, letterSpacing:'0.1em', textTransform:'uppercase' }}>{clients.length} active clients</p>
            </div>

            <div style={{ position:'relative', maxWidth:400, marginBottom:24 }}>
              <FormInput style={{ paddingLeft:34, width:'100%' }} placeholder="Search clients..." value={search} onChange={e=>setSearch(e.target.value)}/>
              <svg style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--color-text-tertiary)',pointerEvents:'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>

            {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
                {clients.filter(c=>{ const q=search.toLowerCase(); return !q||c.name?.toLowerCase().includes(q)||c.email?.toLowerCase().includes(q) }).map(client => (
                  <button key={client.id} onClick={()=>setSelected(client)} style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:12, padding:'20px', textAlign:'left', cursor:'pointer', transition:'all 0.18s' }}
                    onMouseOver={e=>{ e.currentTarget.style.borderColor='var(--color-primary)'; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(184,150,12,0.1)' }}
                    onMouseOut={e=>{ e.currentTarget.style.borderColor='var(--color-border)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}
                  >
                    <div style={{ width:44, height:44, borderRadius:10, background:'var(--color-blue-50)', border:'1px solid rgba(26,86,219,0.15)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14, fontSize:18, fontWeight:700, color:'var(--color-blue-500)' }}>
                      {client.name?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>{client.name}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--color-text-tertiary)', marginBottom:10 }}>{client.email}</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      <StatusBadge variant="info">{client.plan}</StatusBadge>
                      <StatusBadge variant={TONE_TO_VARIANT[client.status==='active'?'green':'grey'] || 'info'}>{client.status}</StatusBadge>
                      {client.deployment_status && <StatusBadge variant="warning">{client.deployment_status?.replace('_',' ')}</StatusBadge>}
                    </div>
                  </button>
                ))}
                {clients.length===0 && <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No active clients yet.<br/>Add clients in the HR Portal first.</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
