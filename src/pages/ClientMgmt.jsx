import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { sendEmail } from '../utils/email'
import { logClientActivity, upsertClientAccount } from '../utils/clientAccounts'

const STAGES = [{key:'accepted',label:'Order Accepted'},{key:'building',label:'Being Built'},{key:'nearly_there',label:'Nearly There'},{key:'ready',label:'Ready to Launch'}]
const EMPTY_INV = { invoice_number:'', description:'', amount:'', due_date:'', status:'unpaid' }
const EMPTY_DOC = { name:'', type:'Contract', file_url:'' }
const EMPTY_UPD = { title:'', message:'' }

const STAGE_TONES = {
  accepted: 'grey',
  building: 'blue',
  nearly_there: 'amber',
  ready: 'green',
}

function timeAgo(dateString) {
  if (!dateString) return 'No recent activity'
  const diff = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function ClientMgmt() {
  const { user } = useAuth()
  const [clients, setClients]         = useState([])
  const [invoiceRows, setInvoiceRows] = useState([])
  const [updateRows, setUpdateRows]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filter, setFilter]           = useState('all')
  const [expanded, setExpanded]       = useState(null)
  const [modal, setModal]             = useState(null)
  const [activeClient, setActiveClient] = useState(null)
  const [tickets, setTickets]         = useState([])
  const [saving, setSaving]           = useState(false)
  const [invoiceForm, setInvForm]     = useState(EMPTY_INV)
  const [docForm, setDocForm]         = useState(EMPTY_DOC)
  const [updateForm, setUpdForm]      = useState(EMPTY_UPD)
  const [replyForm, setReplyForm]     = useState('')
  const [activeTicket, setActiveTicket] = useState(null)

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    const [{ data: clientRows }, { data: invRows }, { data: depRows }] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('client_invoices').select('id,client_email,status,amount,created_at,due_date').order('created_at', { ascending: false }),
      supabase.from('deployment_updates').select('id,client_email,title,created_at').order('created_at', { ascending: false }),
    ])
    setClients(clientRows || [])
    if (clientRows?.length) {
      Promise.all(clientRows.filter((row) => row.email).map((row) => upsertClientAccount(row))).catch(() => {})
    }
    setInvoiceRows(invRows || [])
    setUpdateRows(depRows || [])
    setLoading(false)
  }

  const updateStage = async (client, stage) => {
    const label = STAGES.find((s) => s.key === stage)?.label || 'Status updated'
    await Promise.all([
      supabase.from('clients').update({ deployment_status: stage }).eq('id', client.id),
      upsertClientAccount(client, { deployment_status: stage }),
      logClientActivity({
        clientEmail: client.email,
        eventType: 'status_updated',
        title: 'Website status updated',
        description: `Status changed to ${label}`,
      }),
    ])
    setClients(prev => prev.map(c => c.id===client.id ? {...c, deployment_status: stage} : c))
  }

  const toggleExpand = async (id, email) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    const current = clients.find((client) => client.id === id) || null
    setActiveClient(current)
    const { data } = await supabase.from('support_tickets').select('*').eq('client_email', email).order('created_at',{ascending:false})
    setTickets(data||[])
  }

  const openModal = (type, client) => { setActiveClient(client); setModal(type) }
  const close = () => { setModal(null); setActiveClient(null); setActiveTicket(null) }

  const addInvoice = async () => {
    setSaving(true)
    await supabase.from('client_invoices').insert([{ ...invoiceForm, client_email: activeClient.email, client_name: activeClient.name, created_at: new Date().toISOString() }])
    await sendEmail('invoice_issued', { clientEmail: activeClient.email, clientName: activeClient.name, ...invoiceForm })
    await logClientActivity({
      clientEmail: activeClient.email,
      eventType: 'invoice_issued',
      title: invoiceForm.description || 'Invoice issued',
      description: invoiceForm.invoice_number ? `Invoice #${invoiceForm.invoice_number} was issued.` : 'A new invoice was issued to your account.',
      amount: Number(invoiceForm.amount || 0) || null,
    })
    setSaving(false); setInvForm(EMPTY_INV); close(); load()
  }

  const addDocument = async () => {
    setSaving(true)
    await supabase.from('client_documents').insert([{ ...docForm, client_email: activeClient.email }])
    await logClientActivity({
      clientEmail: activeClient.email,
      eventType: 'document_uploaded',
      title: docForm.name || 'Document uploaded',
      description: `${docForm.type || 'Document'} added to your client portal.`,
    })
    setSaving(false); setDocForm(EMPTY_DOC); close()
  }

  const addUpdate = async () => {
    setSaving(true)
    await supabase.from('deployment_updates').insert([{ ...updateForm, client_email: activeClient.email, staff_name: user?.name }])
    await supabase.from('notifications').insert([{ user_email: activeClient.email, title: updateForm.title, message: updateForm.message, type:'info', link:'/website' }])
    await logClientActivity({
      clientEmail: activeClient.email,
      eventType: 'update_posted',
      title: updateForm.title || 'Project update',
      description: updateForm.message || 'A new delivery update was posted to your portal.',
    })
    setSaving(false); setUpdForm(EMPTY_UPD); close()
  }

  const replyTicket = async () => {
    setSaving(true)
    await supabase.from('support_tickets').update({ staff_reply: replyForm, status:'resolved', replied_by: user?.name, replied_at: new Date().toISOString() }).eq('id', activeTicket.id)
    await Promise.all([
      supabase.from('notifications').insert([{ user_email: activeClient.email, title: `Reply to: ${activeTicket.subject}`, message: 'Your support query has been updated by the team.', type:'info', link:'/support' }]),
      logClientActivity({
        clientEmail: activeClient.email,
        eventType: 'support_replied',
        title: activeTicket.subject || 'Support reply',
        description: 'The team has replied to your support query.',
      }),
    ])
    setSaving(false); setReplyForm(''); close()
    if (activeClient) { const { data } = await supabase.from('support_tickets').select('*').eq('client_email', activeClient.email).order('created_at',{ascending:false}); setTickets(data||[]) }
  }

  const clientSignals = useMemo(() => {
    const invoiceMap = invoiceRows.reduce((acc, row) => {
      const key = row.client_email
      acc[key] = acc[key] || { total: 0, unpaid: 0, overdue: 0, latestAt: null }
      acc[key].total += 1
      if (row.status !== 'paid') acc[key].unpaid += 1
      if (row.status !== 'paid' && row.due_date && new Date(row.due_date) < new Date()) acc[key].overdue += 1
      const stamp = row.created_at || row.due_date
      if (!acc[key].latestAt || new Date(stamp) > new Date(acc[key].latestAt)) acc[key].latestAt = stamp
      return acc
    }, {})

    const updateMap = updateRows.reduce((acc, row) => {
      const key = row.client_email
      acc[key] = acc[key] || { total: 0, latestTitle: '', latestAt: null }
      acc[key].total += 1
      if (!acc[key].latestAt || new Date(row.created_at) > new Date(acc[key].latestAt)) {
        acc[key].latestAt = row.created_at
        acc[key].latestTitle = row.title
      }
      return acc
    }, {})

    const ticketMap = tickets.reduce((acc, row) => {
      const key = row.client_email
      acc[key] = acc[key] || { open: 0, total: 0, latestAt: null }
      acc[key].total += 1
      if (row.status === 'open') acc[key].open += 1
      if (!acc[key].latestAt || new Date(row.created_at) > new Date(acc[key].latestAt)) acc[key].latestAt = row.created_at
      return acc
    }, {})

    return { invoiceMap, updateMap, ticketMap }
  }, [invoiceRows, updateRows, tickets])

  const stats = useMemo(() => {
    const active = clients.filter((c) => c.status === 'active').length
    const openTickets = Object.values(clientSignals.ticketMap).reduce((sum, row) => sum + row.open, 0)
    const unpaidInvoices = Object.values(clientSignals.invoiceMap).reduce((sum, row) => sum + row.unpaid, 0)
    const ready = clients.filter((c) => c.deployment_status === 'ready').length
    return { active, openTickets, unpaidInvoices, ready }
  }, [clients, clientSignals])

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    const signals = {
      invoices: clientSignals.invoiceMap[c.email] || { unpaid: 0, overdue: 0 },
      tickets: clientSignals.ticketMap[c.email] || { open: 0 },
    }
    const matchF =
      filter === 'all' ||
      (filter === 'attention' && (signals.tickets.open > 0 || signals.invoices.unpaid > 0)) ||
      (filter === 'ready' && c.deployment_status === 'ready') ||
      (filter === 'building' && ['accepted', 'building', 'nearly_there'].includes(c.deployment_status || 'accepted'))
    return matchQ && matchF
  })

  const activeSignals = activeClient ? {
    invoices: clientSignals.invoiceMap[activeClient.email] || { unpaid: 0, total: 0, overdue: 0, latestAt: null },
    updates: clientSignals.updateMap[activeClient.email] || { total: 0, latestTitle: '', latestAt: null },
    tickets: {
      total: tickets.length,
      open: tickets.filter((ticket) => ticket.status === 'open').length,
      latestAt: tickets[0]?.created_at || null,
    },
  } : null

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Client Portal Management</h1><p className="page-sub">Live delivery, billing, and support view across {clients.length} client accounts.</p></div>
      </div>
      <div className="dashboard-stat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0,1fr))', gap:14, marginBottom:20 }}>
        <div className="stat-card"><div className="stat-val">{stats.active}</div><div className="stat-lbl">Active clients</div></div>
        <div className="stat-card"><div className="stat-val">{stats.openTickets}</div><div className="stat-lbl">Open tickets</div></div>
        <div className="stat-card"><div className="stat-val">{stats.unpaidInvoices}</div><div className="stat-lbl">Unpaid invoices</div></div>
        <div className="stat-card"><div className="stat-val">{stats.ready}</div><div className="stat-lbl">Ready to launch</div></div>
      </div>

      <div className="card card-pad" style={{ marginBottom:20 }}>
        <div className="legacy-toolbar" style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ position:'relative', flex:1, minWidth:220 }}>
            <input className="inp" style={{ paddingLeft:34 }} placeholder="Search clients..." value={search} onChange={e=>setSearch(e.target.value)}/>
            <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--faint)', pointerEvents:'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <div className="legacy-toolbar-actions" style={{ display:'flex', gap:6 }}>
            {[
              ['all', 'All clients'],
              ['attention', 'Need attention'],
              ['building', 'In delivery'],
              ['ready', 'Ready to launch'],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)} className={'pill'+(filter===key?' on':'')}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gap:16 }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : filtered.map((client) => {
          const invoiceSignal = clientSignals.invoiceMap[client.email] || { total: 0, unpaid: 0, overdue: 0, latestAt: null }
          const updateSignal = clientSignals.updateMap[client.email] || { total: 0, latestTitle: '', latestAt: null }
          const active = expanded === client.id
          return (
            <div key={client.id} className="card" style={{ overflow:'hidden' }}>
              <div style={{ padding:'18px 20px', display:'grid', gridTemplateColumns:'minmax(0,1.25fr) minmax(260px,0.9fr)', gap:18, alignItems:'start' }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:14, flexWrap:'wrap' }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                        <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>{client.name}</div>
                        <span className="badge badge-blue">{client.plan}</span>
                        <span className={`badge badge-${STAGE_TONES[client.deployment_status || 'accepted'] || 'grey'}`}>{STAGES.find((stage) => stage.key === (client.deployment_status || 'accepted'))?.label || 'Order Accepted'}</span>
                        <span className={`badge badge-${client.status === 'active' ? 'green' : client.status === 'pending' ? 'amber' : 'grey'}`}>{client.status}</span>
                      </div>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--faint)', marginTop:6 }}>{client.email}</div>
                      <div style={{ fontSize:13, color:'var(--sub)', marginTop:8, lineHeight:1.6 }}>
                        {client.contact || 'No contact name'}{client.website_url ? ` · ${client.website_url}` : ''}
                      </div>
                    </div>
                    <select className="inp" style={{ padding:'6px 10px', fontSize:12, width:'auto', minWidth:180 }} value={client.deployment_status||'accepted'} onChange={e=>updateStage(client,e.target.value)}>
                      {STAGES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:10, marginTop:16 }}>
                    <div style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                      <div style={{ fontSize:22, fontWeight:600, color:'var(--text)' }}>{invoiceSignal.unpaid}</div>
                      <div style={{ fontSize:11, color:'var(--faint)', marginTop:4, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Unpaid invoices</div>
                    </div>
                    <div style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                      <div style={{ fontSize:22, fontWeight:600, color:'var(--text)' }}>{invoiceSignal.overdue}</div>
                      <div style={{ fontSize:11, color:'var(--faint)', marginTop:4, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Overdue</div>
                    </div>
                    <div style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                      <div style={{ fontSize:22, fontWeight:600, color:'var(--text)' }}>{updateSignal.total}</div>
                      <div style={{ fontSize:11, color:'var(--faint)', marginTop:4, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Updates posted</div>
                    </div>
                    <div style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                      <div style={{ fontSize:22, fontWeight:600, color:'var(--text)' }}>{Number(client.value || 0) ? `£${Number(client.value).toLocaleString()}` : '—'}</div>
                      <div style={{ fontSize:11, color:'var(--faint)', marginTop:4, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Account value</div>
                    </div>
                  </div>
                </div>

                <div style={{ minWidth:0, display:'grid', gap:12 }}>
                  <div style={{ padding:'14px 16px', border:'1px solid var(--border)', borderRadius:14, background:'linear-gradient(180deg, var(--card), var(--bg2))' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)' }}>Latest signal</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginTop:8 }}>{updateSignal.latestTitle || 'No deployment update yet'}</div>
                    <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:6, lineHeight:1.6 }}>
                      Last client movement was {timeAgo(updateSignal.latestAt || invoiceSignal.latestAt || client.updated_at || client.created_at)}.
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => navigate(`/clients/${client.id}`)}>Open profile</button>
                    <button className="btn btn-outline btn-sm" onClick={()=>openModal('invoice',client)}>Invoice</button>
                    <button className="btn btn-outline btn-sm" onClick={()=>openModal('update',client)}>Update</button>
                    <button className="btn btn-outline btn-sm" onClick={()=>openModal('doc',client)}>Doc</button>
                    <button className="btn btn-ghost btn-sm" onClick={()=>toggleExpand(client.id, client.email)}>{active ? 'Hide details' : 'Show details'}</button>
                  </div>
                </div>
              </div>

              {active && (
                <div style={{ padding:'18px 20px', background:'var(--bg2)', borderTop:'1px solid var(--border)' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:12, marginBottom:16 }}>
                    <div className="card" style={{ padding:'14px 16px' }}>
                      <div className="lbl" style={{ marginBottom:8 }}>Support</div>
                      <div style={{ fontSize:24, fontWeight:600, color:'var(--text)' }}>{activeClient?.id === client.id ? activeSignals?.tickets.open : 0}</div>
                      <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:4 }}>Open tickets for this client right now.</div>
                    </div>
                    <div className="card" style={{ padding:'14px 16px' }}>
                      <div className="lbl" style={{ marginBottom:8 }}>Invoices</div>
                      <div style={{ fontSize:24, fontWeight:600, color:'var(--text)' }}>{invoiceSignal.total}</div>
                      <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:4 }}>{invoiceSignal.unpaid} still unpaid.</div>
                    </div>
                    <div className="card" style={{ padding:'14px 16px' }}>
                      <div className="lbl" style={{ marginBottom:8 }}>Account notes</div>
                      <div style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.6 }}>{client.notes || 'No client notes added yet.'}</div>
                    </div>
                  </div>

                  <div className="lbl" style={{ padding:'0 0 8px' }}>Support Tickets</div>
                  {tickets.length === 0 ? <p style={{ fontSize:13, color:'var(--faint)', fontStyle:'italic' }}>No tickets</p> : tickets.map(t => (
                    <div key={t.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border)', gap:12, flexWrap:'wrap' }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:500 }}>{t.subject}</div>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)', marginTop:4 }}>{new Date(t.created_at).toLocaleDateString('en-GB')}</div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span className={'badge badge-'+(t.status==='open'?'amber':'green')}>{t.status}</span>
                        {t.status==='open' && <button className="btn btn-primary btn-sm" onClick={()=>{ setActiveClient(client); setActiveTicket(t); setModal('reply') }}>Reply</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {!loading && filtered.length===0 && <div className="empty"><p>No clients match this view</p></div>}
      </div>

      {modal==='invoice' && <Modal title={`Invoice — ${activeClient?.name}`} onClose={close} footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={addInvoice} disabled={saving}>{saving?'Saving...':'Send Invoice'}</button></>}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="fg">
            <div><label className="lbl">Invoice #</label><input className="inp" value={invoiceForm.invoice_number} onChange={e=>setInvForm(p=>({...p,invoice_number:e.target.value}))} placeholder="INV-001"/></div>
            <div><label className="lbl">Amount (£)</label><input className="inp" type="number" value={invoiceForm.amount} onChange={e=>setInvForm(p=>({...p,amount:e.target.value}))}/></div>
          </div>
          <div><label className="lbl">Description</label><input className="inp" value={invoiceForm.description} onChange={e=>setInvForm(p=>({...p,description:e.target.value}))} placeholder="Monthly Pro Plan — March 2026"/></div>
          <div><label className="lbl">Due Date</label><input className="inp" type="date" value={invoiceForm.due_date} onChange={e=>setInvForm(p=>({...p,due_date:e.target.value}))}/></div>
        </div>
      </Modal>}

      {modal==='doc' && <Modal title={`Add Document — ${activeClient?.name}`} onClose={close} footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={addDocument} disabled={saving}>{saving?'Saving...':'Add'}</button></>}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div><label className="lbl">Document Name</label><input className="inp" value={docForm.name} onChange={e=>setDocForm(p=>({...p,name:e.target.value}))}/></div>
          <div><label className="lbl">Type</label><select className="inp" value={docForm.type} onChange={e=>setDocForm(p=>({...p,type:e.target.value}))}>{['Contract','NDA','Invoice','Proposal','Other'].map(t=><option key={t}>{t}</option>)}</select></div>
          <div><label className="lbl">File URL</label><input className="inp" value={docForm.file_url} onChange={e=>setDocForm(p=>({...p,file_url:e.target.value}))} placeholder="https://drive.google.com/..."/></div>
        </div>
      </Modal>}

      {modal==='update' && <Modal title={`Post Update — ${activeClient?.name}`} onClose={close} footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={addUpdate} disabled={saving}>{saving?'Saving...':'Post'}</button></>}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div><label className="lbl">Title</label><input className="inp" value={updateForm.title} onChange={e=>setUpdForm(p=>({...p,title:e.target.value}))} placeholder="Homepage design complete"/></div>
          <div><label className="lbl">Message</label><textarea className="inp" rows={4} value={updateForm.message} onChange={e=>setUpdForm(p=>({...p,message:e.target.value}))} style={{ resize:'vertical' }}/></div>
        </div>
      </Modal>}

      {modal==='reply' && activeTicket && <Modal title={`Reply — ${activeTicket.subject}`} onClose={close} footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={replyTicket} disabled={saving||!replyForm.trim()}>{saving?'Sending...':'Send Reply'}</button></>}>
        <div style={{ padding:'12px 14px', background:'var(--bg2)', borderRadius:8, marginBottom:12 }}>
          <div className="lbl" style={{ marginBottom:6 }}>Original message</div>
          <p style={{ fontSize:13.5, color:'var(--sub)', lineHeight:1.7 }}>{activeTicket.message}</p>
        </div>
        <div><label className="lbl">Your Reply</label><textarea className="inp" rows={5} value={replyForm} onChange={e=>setReplyForm(e.target.value)} style={{ resize:'vertical' }}/></div>
      </Modal>}
    </div>
  )
}
