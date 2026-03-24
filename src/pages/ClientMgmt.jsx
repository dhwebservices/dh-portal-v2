import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { sendEmail } from '../utils/email'

const STAGES = [{key:'accepted',label:'Order Accepted'},{key:'building',label:'Being Built'},{key:'nearly_there',label:'Nearly There'},{key:'ready',label:'Ready to Launch'}]
const EMPTY_INV = { invoice_number:'', description:'', amount:'', due_date:'', status:'unpaid' }
const EMPTY_DOC = { name:'', type:'Contract', file_url:'' }
const EMPTY_UPD = { title:'', message:'' }

export default function ClientMgmt() {
  const { user } = useAuth()
  const [clients, setClients]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
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
    const { data } = await supabase.from('clients').select('*').order('name')
    setClients(data||[])
    setLoading(false)
  }

  const updateStage = async (client, stage) => {
    await supabase.from('clients').update({ deployment_status: stage }).eq('id', client.id)
    await supabase.from('client_activity').insert([{ client_email: client.email, event_type:'status_updated', description:`Status: ${STAGES.find(s=>s.key===stage)?.label}` }])
    setClients(prev => prev.map(c => c.id===client.id ? {...c, deployment_status: stage} : c))
  }

  const toggleExpand = async (id, email) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    const { data } = await supabase.from('support_tickets').select('*').eq('client_email', email).order('created_at',{ascending:false})
    setTickets(data||[])
  }

  const openModal = (type, client) => { setActiveClient(client); setModal(type) }
  const close = () => { setModal(null); setActiveClient(null); setActiveTicket(null) }

  const addInvoice = async () => {
    setSaving(true)
    await supabase.from('client_invoices').insert([{ ...invoiceForm, client_email: activeClient.email, client_name: activeClient.name, created_at: new Date().toISOString() }])
    await sendEmail('invoice_issued', { clientEmail: activeClient.email, clientName: activeClient.name, ...invoiceForm })
    setSaving(false); setInvForm(EMPTY_INV); close(); load()
  }

  const addDocument = async () => {
    setSaving(true)
    await supabase.from('client_documents').insert([{ ...docForm, client_email: activeClient.email }])
    setSaving(false); setDocForm(EMPTY_DOC); close()
  }

  const addUpdate = async () => {
    setSaving(true)
    await supabase.from('deployment_updates').insert([{ ...updateForm, client_email: activeClient.email, staff_name: user?.name }])
    await supabase.from('notifications').insert([{ user_email: activeClient.email, title: updateForm.title, message: updateForm.message, type:'info', link:'/website' }])
    setSaving(false); setUpdForm(EMPTY_UPD); close()
  }

  const replyTicket = async () => {
    setSaving(true)
    await supabase.from('support_tickets').update({ staff_reply: replyForm, status:'resolved', replied_by: user?.name, replied_at: new Date().toISOString() }).eq('id', activeTicket.id)
    setSaving(false); setReplyForm(''); close()
    if (activeClient) { const { data } = await supabase.from('support_tickets').select('*').eq('client_email', activeClient.email).order('created_at',{ascending:false}); setTickets(data||[]) }
  }

  const filtered = clients.filter(c => { const q=search.toLowerCase(); return !q||c.name?.toLowerCase().includes(q)||c.email?.toLowerCase().includes(q) })

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Client Portal Management</h1><p className="page-sub">{clients.length} clients</p></div>
      </div>
      <div style={{ position:'relative', marginBottom:20 }}>
        <input className="inp" style={{ paddingLeft:34, maxWidth:400 }} placeholder="Search clients..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--faint)', pointerEvents:'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>
      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : filtered.map((client,i) => (
          <div key={client.id} style={{ borderBottom: i<filtered.length-1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ padding:'14px 20px', display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:12, alignItems:'center' }}>
              <div>
                <div style={{ fontSize:14, fontWeight:600 }}>{client.name}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)', marginTop:2 }}>{client.email}</div>
              </div>
              <select className="inp" style={{ padding:'5px 10px', fontSize:12, width:'auto' }} value={client.deployment_status||'accepted'} onChange={e=>updateStage(client,e.target.value)}>
                {STAGES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <div style={{ display:'flex', gap:4 }}>
                <button className="btn btn-outline btn-sm" onClick={()=>openModal('invoice',client)}>Invoice</button>
                <button className="btn btn-outline btn-sm" onClick={()=>openModal('update',client)}>Update</button>
                <button className="btn btn-outline btn-sm" onClick={()=>openModal('doc',client)}>Doc</button>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>toggleExpand(client.id, client.email)}>
                {expanded===client.id ? '▲' : '▼'}
              </button>
            </div>
            {expanded===client.id && (
              <div style={{ padding:'0 20px 16px', background:'var(--bg2)', borderTop:'1px solid var(--border)' }}>
                <div className="lbl" style={{ padding:'10px 0 8px' }}>Support Tickets</div>
                {tickets.length === 0 ? <p style={{ fontSize:13, color:'var(--faint)', fontStyle:'italic' }}>No tickets</p> : tickets.map(t => (
                  <div key={t.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500 }}>{t.subject}</div>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)' }}>{new Date(t.created_at).toLocaleDateString('en-GB')}</div>
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
        ))}
        {!loading && filtered.length===0 && <div className="empty"><p>No clients found</p></div>}
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
