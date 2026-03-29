import { useState, useEffect } from 'react'
import { Plus, Send, Clock, CheckCircle } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { logAction } from '../utils/audit'
import { sendEmail } from '../utils/email'
import { useMsal } from '@azure/msal-react'

const PRIORITY_BADGE = { Normal: 'grey', High: 'amber', Urgent: 'red' }
const EMPTY = { client_email: '', client_name: '', subject: '', message: '', priority: 'Normal' }

function Modal({ title, onClose, children, footer, size = 'md' }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: size === 'lg' ? 720 : 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export default function SupportTickets() {
  const { accounts } = useMsal()
  const user = accounts[0]
  const [tickets, setTickets] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open')
  const [selected, setSelected] = useState(null)
  const [reply, setReply] = useState('')
  const [replyModal, setReplyModal] = useState(false)
  const [newModal, setNewModal] = useState(false)
  const [newTicket, setNewTicket] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load(); loadClients() }, [])
  useEffect(() => {
    const channel = supabase.channel('support_tickets').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets' }, () => load()).subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false })
    setTickets(data || [])
    setLoading(false)
  }

  const loadClients = async () => {
    const { data } = await supabase.from('clients').select('id,name,email').order('name')
    setClients(data || [])
  }

  const filtered = tickets.filter(ticket => filter === 'all' || ticket.status === filter)
  const counts = { all: tickets.length, open: tickets.filter(ticket => ticket.status === 'open').length, resolved: tickets.filter(ticket => ticket.status === 'resolved').length }

  const openReply = ticket => { setSelected(ticket); setReply(''); setReplyModal(true) }

  const sendReply = async () => {
    if (!reply.trim()) return
    setSaving(true)
    await supabase.from('support_tickets').update({ staff_reply: reply, status: 'resolved', replied_by: user?.name || 'DH Team', replied_at: new Date().toISOString() }).eq('id', selected.id)
    await sendEmail('support_ticket_reply', { clientName: selected.client_name || selected.client_email, clientEmail: selected.client_email, subject: selected.subject, reply, staffName: user?.name || 'DH Team' })
    await supabase.from('notifications').insert([{ user_email: selected.client_email, title: `Reply: ${selected.subject}`, message: reply.substring(0, 100), type: 'info', link: '/support' }])
    await logAction(user?.username, user?.name, 'support_reply', selected.client_name || selected.client_email, selected.id, { subject: selected.subject })
    setSaving(false)
    setReplyModal(false)
    load()
  }

  const createTicket = async () => {
    if (!newTicket.client_email || !newTicket.subject || !newTicket.message) return
    setSaving(true)
    const client = clients.find(current => current.email === newTicket.client_email)
    await supabase.from('support_tickets').insert([{ ...newTicket, client_name: client?.name || newTicket.client_email, status: 'open', created_at: new Date().toISOString() }])
    await logAction(user?.username, user?.name, 'support_ticket_created', newTicket.subject, null, { priority: newTicket.priority })
    setSaving(false)
    setNewModal(false)
    setNewTicket({ ...EMPTY })
    load()
  }

  return (
    <div className="fade-in">
      <div className="card" style={{ padding: '22px 24px', marginBottom: 18, background: 'linear-gradient(135deg, var(--card-strong) 0%, rgba(178,71,54,0.08) 100%)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--red)', marginBottom: 8 }}>Clients Workspace</div>
        <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title">Support Tickets</h1>
            <p style={{ fontSize: 14, color: 'var(--sub)', lineHeight: 1.7, marginTop: 10, maxWidth: 620 }}>
              Track incoming issues, reply quickly, and close the loop with clients without leaving the portal.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'Open', value: counts.open },
              { label: 'Resolved', value: counts.resolved },
              { label: 'All', value: counts.all },
            ].map(stat => (
              <div key={stat.label} className="stat-card" style={{ minWidth: 120, padding: '16px 18px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: 1, letterSpacing: '-0.03em' }}>{stat.value}</div>
                <div className="stat-label" style={{ marginTop: 5 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="page-header">
        <div>
          <p className="page-sub">{counts.open} open · {counts.resolved} resolved</p>
        </div>
        <button onClick={() => setNewModal(true)} className="btn btn-primary"><Plus size={14} />New Ticket</button>
      </div>

      <div className="tabs">
        {[['open', 'Open'], ['resolved', 'Resolved'], ['all', 'All']].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} className={`tab${filter === key ? ' active' : ''}`}>
            {label}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginLeft: 4, color: 'var(--faint)' }}>{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div className="spin-center"><div className="spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty"><p>No {filter !== 'all' ? filter : ''} tickets</p></div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Client</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ticket => (
                <tr key={ticket.id}>
                  <td className="text-main">{ticket.subject}</td>
                  <td>{ticket.client_name || ticket.client_email}</td>
                  <td><span className={`badge badge-${PRIORITY_BADGE[ticket.priority] || 'grey'}`}>{ticket.priority}</span></td>
                  <td>
                    {ticket.status === 'open'
                      ? <span className="badge badge-amber"><Clock size={9} />Open</span>
                      : <span className="badge badge-green"><CheckCircle size={9} />Resolved</span>}
                  </td>
                  <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{new Date(ticket.created_at).toLocaleDateString('en-GB')}</span></td>
                  <td>
                    {ticket.status === 'open'
                      ? <button onClick={() => openReply(ticket)} className="btn btn-primary btn-sm"><Send size={12} />Reply</button>
                      : <button onClick={() => openReply(ticket)} className="btn btn-outline btn-sm">View</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {replyModal && selected && (
        <Modal title={selected.subject} onClose={() => setReplyModal(false)} size="lg" footer={selected.status === 'open' ? <><button onClick={() => setReplyModal(false)} className="btn btn-outline">Cancel</button><button onClick={sendReply} disabled={saving || !reply.trim()} className="btn btn-primary">{saving ? 'Sending...' : 'Send Reply'}</button></> : null}>
          <div style={{ padding: '12px 16px', background: 'var(--bg2)', borderRadius: 12, marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 6 }}>Original Message · {selected.client_name}</div>
            <p style={{ fontSize: 14, color: 'var(--sub)', lineHeight: 1.7 }}>{selected.message}</p>
          </div>
          {selected.staff_reply && (
            <div style={{ padding: '12px 16px', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 12, marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 6 }}>Staff Reply · {selected.replied_by}</div>
              <p style={{ fontSize: 14, lineHeight: 1.7 }}>{selected.staff_reply}</p>
            </div>
          )}
          {selected.status === 'open' && (
            <div>
              <label className="inp-label">Your Reply</label>
              <textarea className="inp" rows={5} value={reply} onChange={e => setReply(e.target.value)} placeholder="Type your reply..." style={{ resize: 'vertical' }} />
            </div>
          )}
        </Modal>
      )}

      {newModal && (
        <Modal title="Create Ticket" onClose={() => setNewModal(false)} footer={<><button onClick={() => setNewModal(false)} className="btn btn-outline">Cancel</button><button onClick={createTicket} disabled={saving} className="btn btn-primary">{saving ? 'Creating...' : 'Create'}</button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="inp-label">Client</label>
              <select className="inp" value={newTicket.client_email} onChange={e => { const client = clients.find(current => current.email === e.target.value); setNewTicket(prev => ({ ...prev, client_email: e.target.value, client_name: client?.name || '' })) }}>
                <option value="">Select client...</option>
                {clients.map(client => <option key={client.id} value={client.email}>{client.name}</option>)}
              </select>
            </div>
            <div><label className="inp-label">Subject</label><input className="inp" value={newTicket.subject} onChange={e => setNewTicket(prev => ({ ...prev, subject: e.target.value }))} /></div>
            <div>
              <label className="inp-label">Priority</label>
              <select className="inp" value={newTicket.priority} onChange={e => setNewTicket(prev => ({ ...prev, priority: e.target.value }))}>
                {['Normal', 'High', 'Urgent'].map(priority => <option key={priority}>{priority}</option>)}
              </select>
            </div>
            <div><label className="inp-label">Message</label><textarea className="inp" rows={4} value={newTicket.message} onChange={e => setNewTicket(prev => ({ ...prev, message: e.target.value }))} style={{ resize: 'vertical' }} /></div>
          </div>
        </Modal>
      )}
    </div>
  )
}
