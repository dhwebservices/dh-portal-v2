import { useState, useEffect, useRef } from 'react'
import SiteEditorPage from './SiteEditor'
import { setupMandate, getMandates, createPayment, createSubscription, cancelSubscription, getPayments, getSubscriptions, paymentStatusColor, mandateStatusColor } from '../utils/gocardless'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'

const GCLESS_BASE = 'https://api.gocardless.com'
const PLANS = [
  { id:'starter',  name:'Starter',     price:449,  monthly:null  },
  { id:'growth',   name:'Growth',      price:999,  monthly:83    },
  { id:'pro',      name:'Pro',         price:1499, monthly:125   },
  { id:'hosting1', name:'Hosting S',   price:null, monthly:35    },
  { id:'hosting2', name:'Hosting Pro', price:null, monthly:65    },
  { id:'hosting3', name:'Hosting Biz', price:null, monthly:109   },
]

// ── Sections ──────────────────────────────────────────────────────────
function NavTab({ label, active, onClick, badge }) {
  return (
    <button onClick={onClick} style={{ padding:'10px 18px', background: active ? 'var(--card)' : 'transparent', border:'none', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent', fontFamily:'var(--font-body)', fontSize:13, fontWeight: active ? 600 : 400, color: active ? 'var(--text)' : 'var(--sub)', cursor:'pointer', display:'flex', alignItems:'center', gap:6, marginBottom:-1, transition:'all 0.15s', whiteSpace:'nowrap' }}>
      {label}
      {badge > 0 && <span style={{ background:'var(--red)', color:'#fff', fontSize:9, fontWeight:700, minWidth:16, height:16, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>{badge}</span>}
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
  const [payments, setPayments]   = useState([])
  const [subs, setSubs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [settingUp, setSettingUp] = useState(false)
  const [paying, setPaying]       = useState(false)
  const [payModal, setPayModal]   = useState(false)
  const [subModal, setSubModal]   = useState(false)
  const [payForm, setPayForm]     = useState({ amount:'', description:'' })
  const [subForm, setSubForm]     = useState({ amount:'', name:'', day_of_month:1 })
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')

  useEffect(() => {
    if (gcStatus?.mandate_id) {
      Promise.all([getPayments(gcStatus.mandate_id), getSubscriptions(gcStatus.mandate_id)])
        .then(([p, s]) => { setPayments(p.payments||[]); setSubs(s.subscriptions||[]); setLoading(false) })
        .catch(() => setLoading(false))
    } else if (gcStatus?.customer_id && !gcStatus?.mandate_id) {
      getMandates(gcStatus.customer_id).then(({ mandates }) => {
        const active = mandates?.find(m => m.status==='active') || mandates?.[0]
        if (active) {
          supabase.from('gocardless_mandates').update({ mandate_id: active.id, status: active.status }).eq('client_email', gcStatus.client_email||'')
          setGcStatus(p => ({ ...p, mandate_id: active.id, status: active.status }))
        }
        setLoading(false)
      }).catch(() => setLoading(false))
    } else { setLoading(false) }
  }, [gcStatus?.mandate_id, gcStatus?.customer_id])

  const doSetup = async () => {
    setSettingUp(true); setError('')
    try {
      const data = await setupMandate(client.email, client.name)
      const { data: saved } = await supabase.from('gocardless_mandates').upsert({
        client_email: client.email, client_name: client.name,
        customer_id: data.customer_id, billing_request_id: data.billing_request_id, status: 'pending',
      }, { onConflict: 'client_email' }).select().maybeSingle()
      setGcStatus(saved)
      window.open(data.redirect_url, '_blank')
      setSuccess('GoCardless page opened. Ask the client to complete their bank details.')
    } catch(e) { setError(e.message) }
    setSettingUp(false)
  }

  const doPayment = async () => {
    if (!payForm.amount || !gcStatus?.mandate_id) return
    setPaying(true); setError('')
    try {
      const result = await createPayment(gcStatus.mandate_id, Number(payForm.amount), payForm.description)
      await supabase.from('client_payments').insert([{ client_email: client.email, client_name: client.name, amount: payForm.amount, payment_type:'one_off', status: result.payment?.status||'pending', gocardless_id: result.payment?.id, created_at: new Date().toISOString() }])
      setSuccess(`Payment of £${payForm.amount} created — ${result.payment?.status}`)
      setPayModal(false); setPayForm({ amount:'', description:'' })
      const p = await getPayments(gcStatus.mandate_id); setPayments(p.payments||[])
    } catch(e) { setError(e.message) }
    setPaying(false)
  }

  const doSubscription = async () => {
    if (!subForm.amount || !gcStatus?.mandate_id) return
    setPaying(true); setError('')
    try {
      const result = await createSubscription(gcStatus.mandate_id, Number(subForm.amount), subForm.name||'DH Website Services', subForm.day_of_month)
      await supabase.from('client_payments').insert([{ client_email: client.email, client_name: client.name, amount: subForm.amount, payment_type:'subscription', status: result.subscription?.status||'pending', gocardless_id: result.subscription?.id, created_at: new Date().toISOString() }])
      setSuccess(`Subscription of £${subForm.amount}/mo created`)
      setSubModal(false); setSubForm({ amount:'', name:'', day_of_month:1 })
      const s = await getSubscriptions(gcStatus.mandate_id); setSubs(s.subscriptions||[])
    } catch(e) { setError(e.message) }
    setPaying(false)
  }

  const doCancel = async (subId) => {
    if (!confirm('Cancel this subscription?')) return
    try {
      await cancelSubscription(subId)
      setSuccess('Subscription cancelled')
      const s = await getSubscriptions(gcStatus.mandate_id); setSubs(s.subscriptions||[])
    } catch(e) { setError(e.message) }
  }

  const totalCollected = payments.filter(p=>p.status==='paid_out').reduce((s,p)=>s+(p.amount||0)/100,0)

  return (
    <div style={{ padding:'0 20px 20px' }}>
      {error && <div style={{ padding:'10px 14px', background:'var(--red-bg)', border:'1px solid var(--red)', borderRadius:8, fontSize:13, color:'var(--red)', marginBottom:16 }}>{error}</div>}
      {success && <div style={{ padding:'10px 14px', background:'var(--green-bg)', border:'1px solid var(--green)', borderRadius:8, fontSize:13, color:'var(--green)', marginBottom:16 }}>✓ {success}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:24 }}>
        <div className="stat-card">
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ width:8,height:8,borderRadius:'50%',background:gcStatus?.status==='active'?'var(--green)':gcStatus?'var(--amber)':'var(--border)',flexShrink:0 }}/>
            <div className="stat-lbl" style={{ margin:0 }}>Direct Debit</div>
          </div>
          <div className="stat-val" style={{ fontSize:18, color:gcStatus?.status==='active'?'var(--green)':'var(--sub)' }}>
            {gcStatus?.status==='active'?'Active':gcStatus?'Pending':'Not set up'}
          </div>
        </div>
        <div className="stat-card"><div className="stat-lbl">Collected</div><div className="stat-val" style={{ color:'var(--accent)' }}>£{totalCollected.toLocaleString()}</div></div>
        <div className="stat-card"><div className="stat-lbl">Subscriptions</div><div className="stat-val" style={{ color:'var(--green)' }}>{subs.filter(s=>s.status==='active').length}</div></div>
      </div>

      {!gcStatus ? (
        <div className="card card-pad" style={{ textAlign:'center', padding:'40px 32px' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🏦</div>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:400, marginBottom:8 }}>Set Up Direct Debit</h3>
          <p style={{ fontSize:13, color:'var(--sub)', maxWidth:340, margin:'0 auto 20px', lineHeight:1.7 }}>Collect payments automatically from {client.name} via GoCardless Direct Debit.</p>
          <button className="btn btn-primary" onClick={doSetup} disabled={settingUp} style={{ padding:'10px 24px' }}>{settingUp?'Opening GoCardless...':'+ Set Up Direct Debit'}</button>
          <div style={{ fontSize:11, color:'var(--faint)', marginTop:10 }}>Client will be sent to a secure GoCardless page to authorise</div>
        </div>
      ) : gcStatus.status === 'active' ? (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-primary" onClick={() => { setPayForm({amount:'',description:''}); setError(''); setPayModal(true) }}>💸 Collect Payment</button>
            <button className="btn btn-outline" onClick={() => { setSubForm({amount:'',name:'',day_of_month:1}); setError(''); setSubModal(true) }}>🔄 Set Up Subscription</button>
          </div>
          {subs.length > 0 && (
            <div className="card" style={{ overflow:'hidden' }}>
              <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--faint)' }}>Subscriptions</div>
              <table className="tbl">
                <thead><tr><th>Name</th><th>Amount</th><th>Day</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {subs.map(s => (
                    <tr key={s.id}>
                      <td className="t-main">{s.name}</td>
                      <td>£{(s.amount/100).toFixed(2)}/mo</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>Day {s.day_of_month}</td>
                      <td><span className={`badge badge-${s.status==='active'?'green':'grey'}`}>{s.status}</span></td>
                      <td>{s.status==='active'&&<button className="btn btn-danger btn-sm" onClick={()=>doCancel(s.id)}>Cancel</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {payments.length > 0 && (
            <div className="card" style={{ overflow:'hidden' }}>
              <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--faint)' }}>Payment History</div>
              <table className="tbl">
                <thead><tr><th>Date</th><th>Amount</th><th>Description</th><th>Status</th></tr></thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{p.charge_date||'—'}</td>
                      <td>£{(p.amount/100).toFixed(2)}</td>
                      <td>{p.description||'—'}</td>
                      <td><span className={`badge badge-${paymentStatusColor(p.status)}`}>{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding:'16px', background:'var(--amber-bg)', border:'1px solid var(--amber)', borderRadius:8, fontSize:13, color:'var(--amber)' }}>
          ⏳ Waiting for {client.name} to authorise the Direct Debit mandate. Once they complete the GoCardless page, the mandate will become active.
        </div>
      )}

      {payModal && (
        <Modal title="Collect Payment" onClose={()=>setPayModal(false)} footer={<><button className="btn btn-outline" onClick={()=>setPayModal(false)}>Cancel</button><button className="btn btn-primary" onClick={doPayment} disabled={paying||!payForm.amount}>{paying?'Processing...':'Collect £'+(payForm.amount||'0')}</button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {error && <div style={{ padding:'8px 12px', background:'var(--red-bg)', border:'1px solid var(--red)', borderRadius:7, fontSize:13, color:'var(--red)' }}>{error}</div>}
            <div><label className="lbl">Amount (£)</label><input className="inp" type="number" value={payForm.amount} onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))} placeholder="449" autoFocus/></div>
            <div><label className="lbl">Description</label><input className="inp" value={payForm.description} onChange={e=>setPayForm(p=>({...p,description:e.target.value}))} placeholder="Website build payment"/></div>
          </div>
        </Modal>
      )}

      {subModal && (
        <Modal title="Set Up Subscription" onClose={()=>setSubModal(false)} footer={<><button className="btn btn-outline" onClick={()=>setSubModal(false)}>Cancel</button><button className="btn btn-primary" onClick={doSubscription} disabled={paying||!subForm.amount}>{paying?'Setting up...':'Create Subscription'}</button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {error && <div style={{ padding:'8px 12px', background:'var(--red-bg)', border:'1px solid var(--red)', borderRadius:7, fontSize:13, color:'var(--red)' }}>{error}</div>}
            <div><label className="lbl">Monthly Amount (£)</label><input className="inp" type="number" value={subForm.amount} onChange={e=>setSubForm(p=>({...p,amount:e.target.value}))} placeholder="35" autoFocus/></div>
            <div><label className="lbl">Subscription Name</label><input className="inp" value={subForm.name} onChange={e=>setSubForm(p=>({...p,name:e.target.value}))} placeholder="Hosting Pro Plan"/></div>
            <div><label className="lbl">Collection Day (1–28)</label><input className="inp" type="number" min="1" max="28" value={subForm.day_of_month} onChange={e=>setSubForm(p=>({...p,day_of_month:Number(e.target.value)}))}/></div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {[['Hosting Starter',35],['Hosting Pro',65],['Hosting Business',109]].map(([name,price]) => (
                <button key={name} onClick={()=>setSubForm(p=>({...p,amount:price,name}))} style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${subForm.name===name?'var(--accent)':'var(--border)'}`, background:subForm.name===name?'var(--accent-soft)':'transparent', cursor:'pointer', fontSize:11, color:'var(--text)' }}>{name} — £{price}/mo</button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
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
      supabase.from('client_invoices').select('*').eq('client_email', client.email).order('created_at',{ascending:false}),
      supabase.from('client_payments').select('*').eq('client_email', client.email).order('created_at',{ascending:false}),
    ]).then(([{ data: inv }, { data: pay }]) => {
      setInvoices(inv||[])
      setPayments(pay||[])
      setLoadInv(false)
    })
    // Check GoCardless mandate status
    supabase.from('gocardless_mandates').select('*').eq('client_email', client.email).maybeSingle().then(({ data }) => setGcStatus(data))
  }, [client.email])

  const createInvoice = async () => {
    setSaving(true)
    // Save invoice to Supabase
    const { data: invData } = await supabase.from('client_invoices').insert([{
      ...invForm,
      client_email: client.email,
      client_name: client.name,
      created_by: user?.name,
      created_at: new Date().toISOString(),
      status: 'unpaid',
    }]).select().maybeSingle()

    // If mandate exists and payment requested, collect via GoCardless
    if (gcStatus?.mandate_id && invForm.amount) {
      try {
        if (invForm.payment_type === 'monthly') {
          const subResult = await createSubscription(
            gcStatus.mandate_id,
            Number(invForm.amount),
            invForm.description || 'DH Website Services Monthly'
          )
          await supabase.from('client_payments').insert([{
            client_email: client.email, client_name: client.name,
            amount: invForm.amount, payment_type: 'subscription',
            status: subResult.subscription?.status || 'pending',
            gocardless_id: subResult.subscription?.id,
            created_at: new Date().toISOString(),
          }])
        } else {
          const payResult = await createPayment(
            gcStatus.mandate_id,
            Number(invForm.amount),
            invForm.description || 'DH Website Services',
            'DH-INV-' + (invData?.id || Date.now())
          )
          await supabase.from('client_payments').insert([{
            client_email: client.email, client_name: client.name,
            amount: invForm.amount, payment_type: 'one_off',
            status: payResult.payment?.status || 'pending',
            gocardless_id: payResult.payment?.id,
            created_at: new Date().toISOString(),
          }])
        }
      } catch(e) {
        console.warn('GoCardless payment error:', e.message)
      }
    }

    const { data } = await supabase.from('client_invoices').select('*').eq('client_email', client.email).order('created_at',{ascending:false})
    setInvoices(data||[])
    setSaving(false); setModal(null); setInvForm({ invoice_number:'', description:'', amount:'', due_date:'', payment_type:'one_off', plan_id:'' })
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
      setGcStatus({ client_email: client.email, status: 'pending', customer_id: data.customer_id })
      window.open(data.redirect_url, '_blank')
      setGcSuccess('GoCardless page opened — ask the client to complete their bank details.')
    } catch(e) {
      setGcError('Could not connect to GoCardless: ' + e.message)
    }
    setSaving(false)
  }

  const markPaid = async (id) => {
    await supabase.from('client_invoices').update({ status:'paid', paid_at: new Date().toISOString() }).eq('id',id)
    const { data } = await supabase.from('client_invoices').select('*').eq('client_email', client.email).order('created_at',{ascending:false})
    setInvoices(data||[])
  }

  return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
        <button onClick={onBack} style={{ background:'none', border:'1px solid var(--border)', borderRadius:7, padding:'7px 14px', cursor:'pointer', color:'var(--sub)', fontSize:13, display:'flex', alignItems:'center', gap:6 }}>← Clients</button>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:600, letterSpacing:'-0.02em', lineHeight:1 }}>{client.name}</h1>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)', marginTop:4, letterSpacing:'0.08em' }}>{client.email} · {client.plan}</div>
        </div>
        <div style={{ marginLeft:'auto' }}>
          <span className={'badge badge-'+(client.status==='active'?'green':'grey')}>{client.status}</span>
        </div>
      </div>

      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:24 }}>
        {[['overview','Overview'],['editor','Edit Website'],['invoices','Invoices'],['payments','Payments']].map(([k,l]) => (
          <NavTab key={k} label={l} active={tab===k} onClick={()=>setTab(k)} badge={k==='invoices' ? invoices.filter(i=>i.status==='unpaid').length : 0}/>
        ))}
      </div>

      {tab==='overview' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <div className="card card-pad">
            <div className="lbl" style={{ marginBottom:14 }}>Client Details</div>
            {[['Name',client.name],['Email',client.email],['Phone',client.phone||'—'],['Plan',client.plan],['Status',client.status],['Value',client.value?'£'+Number(client.value).toLocaleString():'—']].map(([k,v]) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ color:'var(--faint)', fontFamily:'var(--font-mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em' }}>{k}</span>
                <span style={{ fontWeight:500 }}>{v}</span>
              </div>
            ))}
          </div>
          <div className="card card-pad">
            <div className="lbl" style={{ marginBottom:14 }}>GoCardless</div>
            {gcStatus ? (
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                  <span style={{ width:8,height:8,borderRadius:'50%',background:'var(--green)',display:'inline-block' }}/>
                  <span style={{ fontSize:13, fontWeight:500, color:'var(--green)' }}>Mandate Active</span>
                </div>
                <div style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{gcStatus.mandate_id}</div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize:13, color:'var(--sub)', marginBottom:14, lineHeight:1.6 }}>Set up Direct Debit mandate for automated monthly payments via GoCardless.</p>
                {gcError && <div style={{ fontSize:12, color:'var(--red)', marginBottom:8 }}>{gcError}</div>}
                {gcSuccess && <div style={{ fontSize:12, color:'var(--green)', marginBottom:8 }}>✓ {gcSuccess}</div>}
                <button className="btn btn-primary btn-sm" onClick={setupGoCardless} disabled={saving}>{saving?'Opening...':'Set Up Direct Debit'}</button>
              </div>
            )}
            <div className="lbl" style={{ marginTop:20, marginBottom:10 }}>Quick Actions</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <button className="btn btn-outline" style={{ justifyContent:'flex-start' }} onClick={()=>{ setTab('invoices'); setModal('invoice') }}>+ Create Invoice</button>
              <button className="btn btn-outline" style={{ justifyContent:'flex-start' }} onClick={()=>setTab('editor')}>✎ Edit Their Website</button>
            </div>
          </div>
        </div>
      )}

      {tab==='editor' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontWeight:600, fontSize:14 }}>Website Editor — {client.name}</div>
              <div style={{ fontSize:12, color:'var(--faint)', marginTop:2 }}>Visual editor for client's site</div>
            </div>
            {client.website_url && <a href={client.website_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Preview Site ↗</a>}
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
            <button className="btn btn-primary" onClick={()=>setModal('invoice')}>+ Create Invoice</button>
          </div>
          <div className="card" style={{ overflow:'hidden' }}>
            {loadingInv ? <div className="spin-wrap"><div className="spin"/></div> : invoices.length===0 ? <div className="empty"><p>No invoices yet</p></div> : (
              <table className="tbl">
                <thead><tr><th>Invoice #</th><th>Description</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="t-main" style={{ fontFamily:'var(--font-mono)' }}>{inv.invoice_number}</td>
                      <td>{inv.description}</td>
                      <td>£{Number(inv.amount||0).toLocaleString()}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{inv.due_date||'—'}</td>
                      <td><span className={'badge badge-'+(inv.status==='paid'?'green':'amber')}>{inv.status}</span></td>
                      <td>{inv.status==='unpaid' && <button className="btn btn-ghost btn-sm" onClick={()=>markPaid(inv.id)}>Mark Paid</button>}</td>
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
        <Modal title="Create Invoice" onClose={()=>setModal(null)} footer={<><button className="btn btn-outline" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={createInvoice} disabled={saving}>{saving?'Saving...':'Create Invoice'}</button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="fg">
              <div><label className="lbl">Invoice #</label><input className="inp" value={invForm.invoice_number} onChange={e=>sf('invoice_number',e.target.value)} placeholder="INV-001"/></div>
              <div><label className="lbl">Amount (£)</label><input className="inp" type="number" value={invForm.amount} onChange={e=>sf('amount',e.target.value)}/></div>
            </div>
            <div><label className="lbl">Description</label><input className="inp" value={invForm.description} onChange={e=>sf('description',e.target.value)} placeholder="Web Design — March 2026"/></div>
            <div><label className="lbl">Payment Type</label>
              <div style={{ display:'flex', gap:8, marginTop:6 }}>
                {[['one_off','One-off Payment'],['monthly','Monthly Plan']].map(([v,l]) => (
                  <button key={v} onClick={()=>sf('payment_type',v)} style={{ flex:1, padding:'10px', borderRadius:7, border:`2px solid ${invForm.payment_type===v?'var(--accent)':'var(--border)'}`, background: invForm.payment_type===v ? 'var(--accent-soft)' : 'transparent', cursor:'pointer', fontSize:13, fontWeight:500, color: invForm.payment_type===v ? 'var(--accent)' : 'var(--sub)', transition:'all 0.15s' }}>{l}</button>
                ))}
              </div>
            </div>
            {invForm.payment_type==='monthly' && (
              <div>
                <label className="lbl">Select Plan</label>
                <select className="inp" value={invForm.plan_id} onChange={e=>{ const plan=PLANS.find(p=>p.id===e.target.value); sf('plan_id',e.target.value); if(plan?.monthly) sf('amount',plan.monthly) }}>
                  <option value="">— Select plan —</option>
                  {PLANS.filter(p=>p.monthly).map(p=><option key={p.id} value={p.id}>{p.name} — £{p.monthly}/mo</option>)}
                </select>
              </div>
            )}
            <div><label className="lbl">Due Date</label><input className="inp" type="date" value={invForm.due_date} onChange={e=>sf('due_date',e.target.value)}/></div>
            {invForm.payment_type==='monthly' && <div style={{ padding:'10px 14px', background:'var(--blue-bg)', border:'1px solid var(--blue)', borderRadius:7, fontSize:13, color:'var(--blue)' }}>Monthly payments will be collected automatically via GoCardless Direct Debit once a mandate is active for this client.</div>}
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
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:600, marginBottom:8 }}>Access Restricted</h2>
        <p style={{ color:'var(--sub)', marginBottom:20 }}>You need permission to access Web Manager.</p>
        <button onClick={() => navigate('/')} className="btn btn-outline">← Go Back</button>
      </div>
    </div>
  )

  if (selected) return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>
      <div style={{ background:'var(--card)', borderBottom:'1px solid var(--border)', padding:'0 32px', display:'flex', alignItems:'center', gap:0 }}>
        <button onClick={() => navigate('/')} style={{ padding:'16px 16px 16px 0', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, color:'var(--text)' }}>DH <span style={{ color:'var(--accent)' }}>Web</span></button>
        <div style={{ width:1, height:24, background:'var(--border)', margin:'0 16px' }}/>
        <div style={{ display:'flex', borderBottom:'none' }}>
          {[['clients','Clients'],['publicsite','Our Public Site']].map(([k,l]) => canEditPublicSite || k!=='publicsite' ? <NavTab key={k} label={l} active={section===k} onClick={()=>{ setSelected(null); setSection(k) }}/> : null)}
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
      <div style={{ background:'var(--card)', borderBottom:'1px solid var(--border)', padding:'0 32px', display:'flex', alignItems:'center' }}>
        <button onClick={() => navigate('/')} style={{ padding:'16px 16px 16px 0', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, color:'var(--text)', flexShrink:0 }}>DH <span style={{ color:'var(--accent)' }}>Web</span></button>
        <div style={{ width:1, height:24, background:'var(--border)', margin:'0 16px', flexShrink:0 }}/>
        <div style={{ display:'flex', flex:1 }}>
          <NavTab label="Client Sites" active={section==='clients'} onClick={()=>setSection('clients')}/>
          {canEditPublicSite && <NavTab label="Our Public Site" active={section==='publicsite'} onClick={()=>setSection('publicsite')}/>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0' }}>
          <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, fontFamily:'var(--font-display)', color:'var(--accent)' }}>
            {user?.initials}
          </div>
          <span style={{ fontSize:12, color:'var(--sub)' }}>{user?.name}</span>
        </div>
      </div>

      <div style={{ padding:'28px 32px' }}>
        {section==='publicsite' && canEditPublicSite ? <PublicSiteEditor/> : (
          <div className="fade-in">
            <div style={{ marginBottom:24 }}>
              <h1 style={{ fontFamily:'var(--font-display)', fontSize:34, fontWeight:600, letterSpacing:'-0.02em' }}>Client Sites</h1>
              <p style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)', marginTop:6, letterSpacing:'0.1em', textTransform:'uppercase' }}>{clients.length} active clients</p>
            </div>

            <div style={{ position:'relative', maxWidth:400, marginBottom:24 }}>
              <input className="inp" style={{ paddingLeft:34 }} placeholder="Search clients..." value={search} onChange={e=>setSearch(e.target.value)}/>
              <svg style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--faint)',pointerEvents:'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>

            {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
                {clients.filter(c=>{ const q=search.toLowerCase(); return !q||c.name?.toLowerCase().includes(q)||c.email?.toLowerCase().includes(q) }).map(client => (
                  <button key={client.id} onClick={()=>setSelected(client)} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'20px', textAlign:'left', cursor:'pointer', transition:'all 0.18s' }}
                    onMouseOver={e=>{ e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(184,150,12,0.1)' }}
                    onMouseOut={e=>{ e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}
                  >
                    <div style={{ width:44, height:44, borderRadius:10, background:'var(--blue-bg)', border:'1px solid rgba(26,86,219,0.15)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14, fontSize:18, fontWeight:700, fontFamily:'var(--font-display)', color:'var(--blue)' }}>
                      {client.name?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>{client.name}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)', marginBottom:10 }}>{client.email}</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      <span className="badge badge-blue">{client.plan}</span>
                      <span className={'badge badge-'+(client.status==='active'?'green':'grey')}>{client.status}</span>
                      {client.deployment_status && <span className="badge badge-amber">{client.deployment_status?.replace('_',' ')}</span>}
                    </div>
                  </button>
                ))}
                {clients.length===0 && <div className="empty"><p>No active clients yet.<br/>Add clients in the HR Portal first.</p></div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
