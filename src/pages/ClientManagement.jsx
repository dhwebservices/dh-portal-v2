import { useState, useEffect } from 'react'
import { Search, Globe, FileText, Send, Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { logAction } from '../utils/audit'
import { sendEmail } from '../utils/email'
import { useMsal } from '@azure/msal-react'

const STAGES = [
  { key:'accepted',     label:'Order Accepted'  },
  { key:'building',     label:'Being Built'      },
  { key:'nearly_there', label:'Nearly There'     },
  { key:'ready',        label:'Ready to Launch'  },
]
const STAGE_BADGE = { accepted:'grey', building:'blue', nearly_there:'amber', ready:'green' }
const EMPTY_INV  = { invoice_number:'', description:'', amount:'', stripe_link:'', due_date:'', status:'unpaid' }
const EMPTY_DOC  = { name:'', type:'Contract', file_url:'' }
const EMPTY_UPD  = { title:'', message:'' }

function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--faint)',cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
  )
}

export default function ClientManagement() {
  const { accounts } = useMsal()
  const user = accounts[0]
  const [clients, setClients]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [expanded, setExpanded]   = useState(null)
  const [modal, setModal]         = useState(null)
  const [activeClient, setActiveClient] = useState(null)
  const [invoiceForm, setInvoiceForm]   = useState(EMPTY_INV)
  const [docForm, setDocForm]           = useState(EMPTY_DOC)
  const [updateForm, setUpdateForm]     = useState(EMPTY_UPD)
  const [replyForm, setReplyForm]       = useState('')
  const [activeTicket, setActiveTicket] = useState(null)
  const [tickets, setTickets]           = useState([])
  const [saving, setSaving]             = useState(false)
  const [editForm, setEditForm]         = useState({ name:'', email:'', plan:'' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: c1 }, { data: c2 }] = await Promise.all([
      supabase.from('clients').select('*').order('created_at',{ascending:false}),
      supabase.from('client_accounts').select('*').order('created_at',{ascending:false}),
    ])
    const map = {}
    ;(c1||[]).forEach(c => { map[c.email] = {...c, _source:'clients', deployment_status:c.deployment_status||'accepted'} })
    ;(c2||[]).forEach(c => { map[c.email] = map[c.email] ? {...map[c.email],...c,_source:'both'} : {...c,_source:'client_accounts'} })
    setClients(Object.values(map))
    setLoading(false)
  }

  const fetchTickets = async email => {
    const { data } = await supabase.from('support_tickets').select('*').eq('client_email',email).order('created_at',{ascending:false})
    setTickets(data||[])
  }

  const toggleExpand = async (id, email) => {
    if (expanded===id) { setExpanded(null); return }
    setExpanded(id); await fetchTickets(email)
  }

  const updateStatus = async (client, status) => {
    if (client._source==='clients'||client._source==='both') await supabase.from('clients').update({deployment_status:status}).eq('id',client.id)
    const { data: ex } = await supabase.from('client_accounts').select('id').eq('email',client.email).single()
    if (ex) await supabase.from('client_accounts').update({deployment_status:status}).eq('email',client.email)
    else await supabase.from('client_accounts').insert({email:client.email,name:client.name,plan:client.plan,deployment_status:status})
    await supabase.from('client_activity').insert([{client_email:client.email,event_type:'status_updated',description:`Status updated to "${STAGES.find(s=>s.key===status)?.label}"`}])
    await supabase.from('notifications').insert([{user_email:client.email,title:'Website status updated',message:`Your project is now: ${STAGES.find(s=>s.key===status)?.label}`,type:'info',link:'/website'}])
    await logAction(user?.username,user?.name,'status_updated',client.name,client.id,{status})
    load()
  }

  const addInvoice = async () => {
    setSaving(true)
    await supabase.from('client_invoices').insert([{...invoiceForm,client_email:activeClient.email,client_name:activeClient.name}])
    await supabase.from('client_activity').insert([{client_email:activeClient.email,event_type:'invoice_issued',description:`Invoice: ${invoiceForm.description||invoiceForm.invoice_number} — £${invoiceForm.amount}`}])
    await sendEmail('invoice_issued',{clientName:activeClient.name,clientEmail:activeClient.email,invoiceNumber:invoiceForm.invoice_number,description:invoiceForm.description,amount:invoiceForm.amount,stripeLink:invoiceForm.stripe_link,dueDate:invoiceForm.due_date})
    await logAction(user?.username,user?.name,'invoice_added',activeClient.name,null,{amount:invoiceForm.amount})
    setSaving(false); setModal(null); setInvoiceForm(EMPTY_INV)
  }

  const addDocument = async () => {
    setSaving(true)
    await supabase.from('client_documents').insert([{...docForm,client_email:activeClient.email}])
    await supabase.from('client_activity').insert([{client_email:activeClient.email,type:'document_added',title:`Document: ${docForm.name}`}])
    await logAction(user?.username,user?.name,'document_added',activeClient.name,null,{file:docForm.name})
    setSaving(false); setModal(null); setDocForm(EMPTY_DOC)
  }

  const addUpdate = async () => {
    setSaving(true)
    await supabase.from('deployment_updates').insert([{...updateForm,client_email:activeClient.email,staff_name:user?.name||'DH Team'}])
    await supabase.from('client_activity').insert([{client_email:activeClient.email,event_type:'website_update',description:`${updateForm.title}${updateForm.message?': '+updateForm.message:''}`}])
    await supabase.from('notifications').insert([{user_email:activeClient.email,title:`Website update: ${updateForm.title}`,message:updateForm.message||'',type:'info',link:'/website'}])
    await logAction(user?.username,user?.name,'update_posted',activeClient.name,null,{title:updateForm.title})
    setSaving(false); setModal(null); setUpdateForm(EMPTY_UPD)
  }

  const replyTicket = async () => {
    setSaving(true)
    await supabase.from('support_tickets').update({staff_reply:replyForm,status:'resolved',replied_by:user?.name||'DH Team',replied_at:new Date().toISOString()}).eq('id',activeTicket.id)
    await supabase.from('client_activity').insert([{client_email:activeTicket.client_email,type:'support_reply',title:`Reply: ${activeTicket.subject}`}])
    await logAction(user?.username,user?.name,'support_reply',activeClient.name,activeTicket.id,{subject:activeTicket.subject})
    await fetchTickets(activeClient.email)
    setSaving(false); setModal(null); setReplyForm('')
  }

  const openEdit = c => { setActiveClient(c); setEditForm({name:c.name||'',email:c.email||'',plan:c.plan||''}); setModal('editclient') }

  const saveEdit = async () => {
    setSaving(true)
    if (activeClient._source==='clients'||activeClient._source==='both') await supabase.from('clients').update({name:editForm.name,email:editForm.email,plan:editForm.plan}).eq('id',activeClient.id)
    await supabase.from('client_accounts').update({name:editForm.name,plan:editForm.plan}).ilike('email',activeClient.email)
    await logAction(user?.username,user?.name,'client_updated',editForm.name,activeClient.id,{name:editForm.name,plan:editForm.plan})
    await load(); setSaving(false); setModal(null)
  }

  const deleteClient = async c => {
    if (!confirm(`Delete ${c.name}?`)) return
    if (c._source==='clients'||c._source==='both') await supabase.from('clients').delete().eq('id',c.id)
    await supabase.from('client_accounts').delete().ilike('email',c.email)
    await logAction(user?.username,user?.name,'client_deleted',c.name,c.id,{})
    load()
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    return !q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
  })

  const INP = { className:'inp' }
  const PLANS = ['Monthly Starter','Monthly Professional','Monthly Business','Monthly HR Maintenance']

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Client Portal Management</h1>
          <p className="page-sub">{clients.length} clients</p>
        </div>
      </div>

      <div className="search-wrap" style={{maxWidth:400,marginBottom:20}}>
        <Search size={13} className="search-icon" />
        <input {...INP} style={{paddingLeft:36}} placeholder="Search clients..." value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        {loading ? <div className="spin-center"><div className="spin"/></div> : filtered.length===0 ? (
          <div className="empty"><p>No clients found</p></div>
        ) : (
          <div>
            {filtered.map(client => (
              <div key={client.id||client.email} style={{borderBottom:'1px solid var(--border)'}}>
                {/* Client row */}
                <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:16,padding:'14px 20px',alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:600}}>{client.name}</div>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--faint)',marginTop:2}}>{client.email}</div>
                  </div>

                  {/* Stage selector */}
                  <select value={client.deployment_status||'accepted'} onChange={e=>updateStatus(client,e.target.value)}
                    className="inp" style={{padding:'5px 10px',fontSize:12,width:'auto'}}>
                    {STAGES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>

                  {/* Action buttons */}
                  <div style={{display:'flex',gap:4}}>
                    <button onClick={()=>{setActiveClient(client);setModal('invoice')}} className="btn btn-outline btn-sm">
                      <FileText size={11}/>Invoice
                    </button>
                    <button onClick={()=>{setActiveClient(client);setModal('update')}} className="btn btn-outline btn-sm">
                      <Globe size={11}/>Update
                    </button>
                    <button onClick={()=>{setActiveClient(client);setModal('document')}} className="btn btn-outline btn-sm">
                      <FileText size={11}/>Doc
                    </button>
                    <button onClick={()=>openEdit(client)} className="btn btn-ghost btn-sm btn-icon">
                      <Edit2 size={12}/>
                    </button>
                    <button onClick={()=>deleteClient(client)} className="btn btn-ghost btn-sm btn-icon" style={{color:'var(--red)'}}>
                      <Trash2 size={12}/>
                    </button>
                  </div>

                  {/* Expand */}
                  <button onClick={()=>toggleExpand(client.id||client.email,client.email)} className="btn btn-ghost btn-sm btn-icon">
                    {expanded===client.id||expanded===client.email ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                  </button>
                </div>

                {/* Expanded tickets */}
                {(expanded===client.id||expanded===client.email) && (
                  <div style={{padding:'0 20px 16px',background:'var(--bg2)',borderTop:'1px solid var(--border)'}}>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--faint)',padding:'12px 0 8px'}}>
                      Support Tickets
                    </div>
                    {tickets.length===0 ? (
                      <p style={{fontSize:13,color:'var(--faint)',fontStyle:'italic'}}>No support tickets</p>
                    ) : tickets.map(t=>(
                      <div key={t.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:500}}>{t.subject}</div>
                          <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--faint)',marginTop:2}}>{new Date(t.created_at).toLocaleDateString('en-GB')}</div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span className={`badge badge-${t.status==='open'?'amber':'green'}`} style={{textTransform:'capitalize'}}>{t.status}</span>
                          {t.status==='open' && (
                            <button onClick={()=>{setActiveClient(client);setActiveTicket(t);setModal('reply')}} className="btn btn-primary btn-sm">
                              <Send size={11}/>Reply
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invoice modal */}
      {modal==='invoice' && (
        <Modal title={`Invoice — ${activeClient?.name}`} onClose={()=>setModal(null)} footer={<><button onClick={()=>setModal(null)} className="btn btn-outline">Cancel</button><button onClick={addInvoice} disabled={saving} className="btn btn-primary">{saving?'Saving...':'Send Invoice'}</button></>}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div className="form-grid">
              <div><label className="inp-label">Invoice Number</label><input {...INP} value={invoiceForm.invoice_number} onChange={e=>setInvoiceForm(p=>({...p,invoice_number:e.target.value}))} placeholder="INV-001" /></div>
              <div><label className="inp-label">Amount (£)</label><input {...INP} type="number" value={invoiceForm.amount} onChange={e=>setInvoiceForm(p=>({...p,amount:e.target.value}))} placeholder="149" /></div>
            </div>
            <div><label className="inp-label">Description</label><input {...INP} value={invoiceForm.description} onChange={e=>setInvoiceForm(p=>({...p,description:e.target.value}))} placeholder="Monthly Pro Plan — March 2026" /></div>
            <div><label className="inp-label">Payment Link</label><input {...INP} value={invoiceForm.stripe_link} onChange={e=>setInvoiceForm(p=>({...p,stripe_link:e.target.value}))} placeholder="https://buy.stripe.com/..." /></div>
            <div><label className="inp-label">Due Date</label><input {...INP} type="date" value={invoiceForm.due_date} onChange={e=>setInvoiceForm(p=>({...p,due_date:e.target.value}))} /></div>
          </div>
        </Modal>
      )}

      {/* Document modal */}
      {modal==='document' && (
        <Modal title={`Add Document — ${activeClient?.name}`} onClose={()=>setModal(null)} footer={<><button onClick={()=>setModal(null)} className="btn btn-outline">Cancel</button><button onClick={addDocument} disabled={saving} className="btn btn-primary">{saving?'Saving...':'Add Document'}</button></>}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div><label className="inp-label">Document Name</label><input {...INP} value={docForm.name} onChange={e=>setDocForm(p=>({...p,name:e.target.value}))} placeholder="Client NDA — March 2026" /></div>
            <div><label className="inp-label">Type</label>
              <select {...INP} value={docForm.type} onChange={e=>setDocForm(p=>({...p,type:e.target.value}))}>
                {['Contract','NDA','Invoice','Proposal','Other'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="inp-label">File URL</label><input {...INP} value={docForm.file_url} onChange={e=>setDocForm(p=>({...p,file_url:e.target.value}))} placeholder="https://drive.google.com/..." /></div>
          </div>
        )}
      )}

      {/* Update modal */}
      {modal==='update' && (
        <Modal title={`Post Update — ${activeClient?.name}`} onClose={()=>setModal(null)} footer={<><button onClick={()=>setModal(null)} className="btn btn-outline">Cancel</button><button onClick={addUpdate} disabled={saving} className="btn btn-primary">{saving?'Saving...':'Post Update'}</button></>}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div><label className="inp-label">Update Title</label><input {...INP} value={updateForm.title} onChange={e=>setUpdateForm(p=>({...p,title:e.target.value}))} placeholder="Homepage design complete" /></div>
            <div><label className="inp-label">Message</label><textarea {...INP} rows={4} value={updateForm.message} onChange={e=>setUpdateForm(p=>({...p,message:e.target.value}))} style={{resize:'vertical'}} /></div>
          </div>
        )}
      )}

      {/* Reply modal */}
      {modal==='reply' && activeTicket && (
        <Modal title={`Reply — ${activeTicket.subject}`} onClose={()=>setModal(null)} footer={<><button onClick={()=>setModal(null)} className="btn btn-outline">Cancel</button><button onClick={replyTicket} disabled={saving||!replyForm.trim()} className="btn btn-primary">{saving?'Sending...':'Send Reply'}</button></>}>
          <div style={{padding:'12px 14px',background:'var(--bg2)',borderRadius:8,marginBottom:12}}>
            <div style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--faint)',marginBottom:6}}>Original</div>
            <p style={{fontSize:13.5,color:'var(--sub)',lineHeight:1.7}}>{activeTicket.message}</p>
          </div>
          <div><label className="inp-label">Your Reply</label><textarea {...INP} rows={4} value={replyForm} onChange={e=>setReplyForm(e.target.value)} style={{resize:'vertical'}} /></div>
        )}
      )}

      {/* Edit client modal */}
      {modal==='editclient' && (
        <Modal title={`Edit — ${activeClient?.name}`} onClose={()=>setModal(null)} footer={<><button onClick={()=>setModal(null)} className="btn btn-outline">Cancel</button><button onClick={saveEdit} disabled={saving} className="btn btn-primary">{saving?'Saving...':'Save'}</button></>}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div><label className="inp-label">Client Name</label><input {...INP} value={editForm.name} onChange={e=>setEditForm(p=>({...p,name:e.target.value}))} /></div>
            <div><label className="inp-label">Email Address</label><input {...INP} value={editForm.email} onChange={e=>setEditForm(p=>({...p,email:e.target.value}))} /></div>
            <div><label className="inp-label">Plan</label>
              <select {...INP} value={editForm.plan} onChange={e=>setEditForm(p=>({...p,plan:e.target.value}))}>
                {PLANS.map(p=><option key={p}>{p}</option>)}
              </select>
            
          
        )}
      )}
    
  )
}
