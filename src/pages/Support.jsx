import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Clock3, Search, ShieldCheck, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import {
  buildSupportDueAt,
  buildSupportTicketMetaKey,
  formatSupportDuration,
  getSupportBaseStatus,
  getSupportPriorityTone,
  getSupportSlaState,
  getSupportWorkflowTone,
  mergeSupportTicket,
  normalizeSupportTicketMeta,
  SUPPORT_PRIORITY_OPTIONS,
  SUPPORT_WORKFLOW_OPTIONS,
} from '../utils/supportDesk'

const EMPTY_EDITOR = {
  workflow_status: 'new',
  priority: 'medium',
  assignee_email: '',
  assignee_name: '',
  due_at: '',
}

function StatCard({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="stat-card" style={{ minHeight: 118 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div className="stat-lbl">{label}</div>
        <div style={{ width: 34, height: 34, borderRadius: 12, background: `${tone}22`, color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} />
        </div>
      </div>
      <div className="stat-val">{value}</div>
      <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 8, lineHeight: 1.5 }}>{hint}</div>
    </div>
  )
}

export default function Support() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [queue, setQueue] = useState('active')
  const [selected, setSelected] = useState(null)
  const [reply, setReply] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [editor, setEditor] = useState(EMPTY_EDITOR)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data: ticketRows }, { data: metaRows }] = await Promise.all([
      supabase.from('support_tickets').select('*').order('created_at', { ascending: false }),
      supabase.from('portal_settings').select('key,value').like('key', 'support_ticket_meta:%'),
    ])

    const metaMap = Object.fromEntries(
      (metaRows || []).map((row) => {
        const raw = row?.value?.value ?? row?.value ?? {}
        const id = String(row.key || '').replace('support_ticket_meta:', '')
        return [id, normalizeSupportTicketMeta(raw)]
      })
    )

    setTickets((ticketRows || []).map((ticket) => mergeSupportTicket(ticket, metaMap[String(ticket.id)] || {})))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const openTicket = (ticket) => {
    setSelected(ticket)
    setReply(ticket.staff_reply || '')
    setInternalNote('')
    setEditor({
      workflow_status: ticket.workflow_status || (ticket.status === 'resolved' ? 'resolved' : 'new'),
      priority: ticket.priority || 'medium',
      assignee_email: ticket.assignee_email || '',
      assignee_name: ticket.assignee_name || '',
      due_at: ticket.due_at || buildSupportDueAt(ticket.created_at, ticket.priority || 'medium'),
    })
  }

  const closeTicket = () => {
    setSelected(null)
    setReply('')
    setInternalNote('')
    setEditor(EMPTY_EDITOR)
  }

  const deleteTicket = async (id) => {
    if (!confirm('Delete this ticket?')) return
    await Promise.all([
      supabase.from('support_tickets').delete().eq('id', id),
      supabase.from('portal_settings').delete().eq('key', buildSupportTicketMetaKey(id)),
    ])
    setTickets((prev) => prev.filter((ticket) => ticket.id !== id))
    if (selected?.id === id) closeTicket()
  }

  const saveTicket = async ({ sendReply = false } = {}) => {
    if (!selected) return

    setSaving(true)

    const nextWorkflowStatus = sendReply
      ? (editor.workflow_status === 'resolved' ? 'resolved' : 'awaiting_client')
      : editor.workflow_status

    const notes = [
      ...(selected.internal_notes || []),
      ...(internalNote.trim() ? [{
        id: `note-${Date.now()}`,
        body: internalNote.trim(),
        author_name: user?.name || 'Staff user',
        author_email: user?.email || '',
        created_at: new Date().toISOString(),
      }] : []),
    ]

    const dueAt = nextWorkflowStatus === 'resolved'
      ? ''
      : editor.due_at || buildSupportDueAt(selected.created_at, editor.priority)

    const metaPayload = {
      workflow_status: nextWorkflowStatus,
      priority: editor.priority,
      assignee_email: editor.assignee_email,
      assignee_name: editor.assignee_name,
      due_at: dueAt,
      internal_notes: notes,
      last_updated_at: new Date().toISOString(),
    }

    const ticketPayload = {
      status: getSupportBaseStatus(nextWorkflowStatus),
      priority: editor.priority,
      ...(sendReply
        ? {
            staff_reply: reply,
            replied_by: user?.name || '',
            replied_at: new Date().toISOString(),
          }
        : {}),
    }

    await Promise.all([
      supabase.from('support_tickets').update(ticketPayload).eq('id', selected.id),
      supabase.from('portal_settings').upsert({
        key: buildSupportTicketMetaKey(selected.id),
        value: { value: metaPayload },
      }, { onConflict: 'key' }),
    ])

    await load()
    setSaving(false)
    closeTicket()
  }

  const counts = useMemo(() => {
    const active = tickets.filter((ticket) => ticket.workflow_status !== 'resolved')
    return {
      active: active.length,
      mine: active.filter((ticket) => String(ticket.assignee_email || '').toLowerCase() === String(user?.email || '').toLowerCase()).length,
      breached: active.filter((ticket) => getSupportSlaState(ticket) === 'breached').length,
      awaitingClient: active.filter((ticket) => ticket.workflow_status === 'awaiting_client').length,
    }
  }, [tickets, user?.email])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tickets.filter((ticket) => {
      const haystack = [
        ticket.subject,
        ticket.client_name,
        ticket.client_email,
        ticket.message,
        ticket.assignee_name,
        ticket.assignee_email,
      ].filter(Boolean).join(' ').toLowerCase()
      if (q && !haystack.includes(q)) return false

      if (queue === 'active') return ticket.workflow_status !== 'resolved'
      if (queue === 'mine') return ticket.workflow_status !== 'resolved' && String(ticket.assignee_email || '').toLowerCase() === String(user?.email || '').toLowerCase()
      if (queue === 'unassigned') return ticket.workflow_status !== 'resolved' && !ticket.assignee_email
      if (queue === 'breached') return ticket.workflow_status !== 'resolved' && getSupportSlaState(ticket) === 'breached'
      if (queue === 'urgent') return ticket.workflow_status !== 'resolved' && ticket.priority === 'urgent'
      if (queue === 'resolved') return ticket.workflow_status === 'resolved'
      return true
    })
  }, [queue, search, tickets, user?.email])

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Support Desk</h1>
          <p className="page-sub">Ticket workflow, assignment, SLA watch, and internal notes for client support.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => navigate('/knowledge-base')}>Open knowledge base</button>
        </div>
      </div>

      <div className="dashboard-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon={ShieldCheck} label="Active queue" value={counts.active} hint="Tickets still being worked or waiting on the client." tone="var(--blue)" />
        <StatCard icon={UserRound} label="Assigned to me" value={counts.mine} hint="Open tickets currently owned by your account." tone="var(--green)" />
        <StatCard icon={AlertTriangle} label="SLA breached" value={counts.breached} hint="Tickets that have passed their target handling window." tone="var(--red)" />
        <StatCard icon={Clock3} label="Awaiting client" value={counts.awaitingClient} hint="Tickets replied to internally and waiting on the client." tone="var(--amber)" />
      </div>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="legacy-toolbar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-wrap" style={{ flex: 1, minWidth: 220 }}>
            <Search size={13} className="search-icon" />
            <input className="inp" style={{ paddingLeft: 34 }} placeholder="Search tickets, clients, owners..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="legacy-toolbar-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              ['active', 'Active'],
              ['mine', 'Mine'],
              ['unassigned', 'Unassigned'],
              ['urgent', 'Urgent'],
              ['breached', 'Breached'],
              ['resolved', 'Resolved'],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setQueue(key)} className={`pill${queue === key ? ' on' : ''}`}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin" /></div> : (
          <>
            <div className="tbl-wrap hide-mob">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Client</th>
                    <th>Workflow</th>
                    <th>Priority</th>
                    <th>Owner</th>
                    <th>SLA</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ticket) => {
                    const slaState = getSupportSlaState(ticket)
                    const workflowTone = getSupportWorkflowTone(ticket.workflow_status)
                    const priorityTone = getSupportPriorityTone(ticket.priority)
                    const slaTone = slaState === 'breached' ? 'red' : slaState === 'at_risk' ? 'amber' : 'grey'
                    return (
                      <tr key={ticket.id}>
                        <td className="t-main">
                          <div>{ticket.subject}</div>
                          <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>{ticket.message?.slice(0, 90) || 'No message preview'}</div>
                        </td>
                        <td>{ticket.client_name || 'Unknown client'}</td>
                        <td><span className={`badge badge-${workflowTone}`}>{ticket.workflow_status.replaceAll('_', ' ')}</span></td>
                        <td><span className={`badge badge-${priorityTone}`}>{ticket.priority}</span></td>
                        <td>{ticket.assignee_name || 'Unassigned'}</td>
                        <td><span className={`badge badge-${slaTone}`}>{ticket.workflow_status === 'resolved' ? 'Closed' : formatSupportDuration(ticket.due_at)}</span></td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{new Date(ticket.created_at).toLocaleDateString('en-GB')}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-outline btn-sm" onClick={() => openTicket(ticket)}>Open</button>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteTicket(ticket.id)}>Del</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--faint)' }}>No tickets found for this queue.</td></tr> : null}
                </tbody>
              </table>
            </div>

            <div className="mobile-only" style={{ display: 'none' }}>
              {filtered.length ? (
                <div style={{ display: 'grid', gap: 10, padding: 12 }}>
                  {filtered.map((ticket) => {
                    const slaState = getSupportSlaState(ticket)
                    const workflowTone = getSupportWorkflowTone(ticket.workflow_status)
                    const priorityTone = getSupportPriorityTone(ticket.priority)
                    return (
                      <div key={ticket.id} className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{ticket.subject}</div>
                            <div style={{ fontSize: 12, color: 'var(--sub)' }}>{ticket.client_name || 'Unknown client'}</div>
                          </div>
                          <span className={`badge badge-${workflowTone}`}>{ticket.workflow_status.replaceAll('_', ' ')}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span className={`badge badge-${priorityTone}`}>{ticket.priority}</span>
                          <span className={`badge badge-${slaState === 'breached' ? 'red' : slaState === 'at_risk' ? 'amber' : 'grey'}`}>{ticket.workflow_status === 'resolved' ? 'Closed' : formatSupportDuration(ticket.due_at)}</span>
                          <span className="badge badge-grey">{ticket.assignee_name || 'Unassigned'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => openTicket(ticket)}>Open</button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteTicket(ticket.id)}>Delete</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : <div style={{ textAlign: 'center', padding: 40, color: 'var(--faint)' }}>No tickets found for this queue.</div>}
            </div>
          </>
        )}
      </div>

      {selected ? (
        <Modal
          title={selected.subject}
          onClose={closeTicket}
          width={860}
          footer={(
            <>
              <button className="btn btn-outline" onClick={closeTicket}>Cancel</button>
              <button className="btn btn-outline" onClick={() => saveTicket()} disabled={saving}>{saving ? 'Saving...' : 'Save workflow'}</button>
              <button className="btn btn-primary" onClick={() => saveTicket({ sendReply: true })} disabled={saving || !reply.trim()}>{saving ? 'Sending...' : 'Send reply'}</button>
            </>
          )}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)', gap: 16 }}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ padding: '12px 14px', background: 'var(--bg2)', borderRadius: 10 }}>
                <div className="lbl" style={{ marginBottom: 6 }}>Message from {selected.client_name || 'Client'}</div>
                <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--sub)' }}>{selected.message}</p>
              </div>

              <div>
                <label className="lbl">Staff Reply</label>
                <textarea className="inp" rows={5} value={reply} onChange={(e) => setReply(e.target.value)} style={{ resize: 'vertical' }} placeholder="Reply to the client and move the ticket forward." />
              </div>

              <div>
                <label className="lbl">Internal note</label>
                <textarea className="inp" rows={3} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} style={{ resize: 'vertical' }} placeholder="Internal only: triage notes, root cause, next action." />
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <div className="lbl">Internal notes</div>
                {selected.internal_notes?.length ? selected.internal_notes.slice().reverse().map((note) => (
                  <div key={note.id} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{note.body}</div>
                    <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 6 }}>
                      {note.author_name || note.author_email || 'Staff'} · {new Date(note.created_at).toLocaleString('en-GB')}
                    </div>
                  </div>
                )) : <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No internal notes on this ticket yet.</div>}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div className="card" style={{ padding: 14, display: 'grid', gap: 12 }}>
                <div className="lbl">Workflow</div>
                <select className="inp" value={editor.workflow_status} onChange={(e) => setEditor((prev) => ({ ...prev, workflow_status: e.target.value }))}>
                  {SUPPORT_WORKFLOW_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>

                <div className="lbl">Priority</div>
                <select
                  className="inp"
                  value={editor.priority}
                  onChange={(e) => setEditor((prev) => ({
                    ...prev,
                    priority: e.target.value,
                    due_at: prev.workflow_status === 'resolved' ? '' : buildSupportDueAt(selected.created_at, e.target.value),
                  }))}
                >
                  {SUPPORT_PRIORITY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>

                <div className="lbl">Owner</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setEditor((prev) => ({ ...prev, assignee_email: user?.email || '', assignee_name: user?.name || '' }))}
                    type="button"
                  >
                    Assign to me
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setEditor((prev) => ({ ...prev, assignee_email: '', assignee_name: '' }))}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
                <input className="inp" value={editor.assignee_name} onChange={(e) => setEditor((prev) => ({ ...prev, assignee_name: e.target.value }))} placeholder="Owner name" />

                <div className="lbl">SLA target</div>
                <input className="inp" type="datetime-local" value={editor.due_at ? editor.due_at.slice(0, 16) : ''} onChange={(e) => setEditor((prev) => ({ ...prev, due_at: e.target.value ? new Date(e.target.value).toISOString() : '' }))} />
              </div>

              <div className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
                <div className="lbl">Ticket context</div>
                <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.6 }}>
                  Client: <strong style={{ color: 'var(--text)' }}>{selected.client_name || 'Unknown client'}</strong><br />
                  Email: <strong style={{ color: 'var(--text)' }}>{selected.client_email || 'No email on ticket'}</strong><br />
                  Submitted: <strong style={{ color: 'var(--text)' }}>{new Date(selected.created_at).toLocaleString('en-GB')}</strong><br />
                  Current SLA: <strong style={{ color: 'var(--text)' }}>{selected.workflow_status === 'resolved' ? 'Closed' : formatSupportDuration(editor.due_at || selected.due_at)}</strong>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
