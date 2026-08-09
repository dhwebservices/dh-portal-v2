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
import { StatCard } from '../components/ui'
import { Button, FormField, FormLabel, FormInput, FormSelect, StatusBadge } from '../components/ds'

const DS_CARD = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)' }
const TONE_TO_VARIANT = { green: 'active', amber: 'warning', red: 'error', blue: 'info', grey: 'info' }

const EMPTY_EDITOR = {
  workflow_status: 'new',
  priority: 'medium',
  assignee_email: '',
  assignee_name: '',
  due_at: '',
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
    const [ticketResult, metaResult] = await Promise.all([
      supabase.from('support_tickets').delete().eq('id', id),
      supabase.from('portal_settings').delete().eq('key', buildSupportTicketMetaKey(id)),
    ])
    if (ticketResult.error) {
      alert(`Could not delete ticket: ${ticketResult.error.message}`)
      return
    }
    if (metaResult.error) {
      alert(`Ticket deleted, but support metadata could not be removed: ${metaResult.error.message}`)
      return
    }
    setTickets((prev) => prev.filter((ticket) => ticket.id !== id))
    if (selected?.id === id) closeTicket()
  }

  const saveTicket = async ({ sendReply = false } = {}) => {
    if (!selected) return

    setSaving(true)
    try {
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

      const [ticketResult, metaResult] = await Promise.all([
        supabase.from('support_tickets').update(ticketPayload).eq('id', selected.id),
        supabase.from('portal_settings').upsert({
          key: buildSupportTicketMetaKey(selected.id),
          value: { value: metaPayload },
        }, { onConflict: 'key' }),
      ])

      if (ticketResult.error) throw ticketResult.error
      if (metaResult.error) throw metaResult.error

      await load()
      closeTicket()
    } catch (error) {
      alert(`Could not save ticket: ${error.message}`)
    } finally {
      setSaving(false)
    }
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
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Support Desk</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>Ticket workflow, assignment, SLA watch, and internal notes for client support.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => navigate('/knowledge-base')}>Open knowledge base</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon={ShieldCheck} label="Active queue" value={counts.active} hint="Tickets still being worked or waiting on the client." tone="var(--color-blue-500)" />
        <StatCard icon={UserRound} label="Assigned to me" value={counts.mine} hint="Open tickets currently owned by your account." tone="var(--color-green-500)" />
        <StatCard icon={AlertTriangle} label="SLA breached" value={counts.breached} hint="Tickets that have passed their target handling window." tone="var(--color-red-500)" />
        <StatCard icon={Clock3} label="Awaiting client" value={counts.awaitingClient} hint="Tickets replied to internally and waiting on the client." tone="var(--color-amber-500)" />
      </div>

      <div style={{ ...DS_CARD, padding: 20, marginBottom: 20 }}>
        <div className="legacy-toolbar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
            <FormInput style={{ paddingLeft: 34, width: '100%' }} placeholder="Search tickets, clients, owners..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="legacy-toolbar-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              ['active', 'Active'],
              ['mine', 'Mine'],
              ['unassigned', 'Unassigned'],
              ['urgent', 'Urgent'],
              ['breached', 'Breached'],
              ['resolved', 'Resolved'],
            ].map(([key, label]) => (
              <Button key={key} onClick={() => setQueue(key)} variant={queue === key ? 'primary' : 'secondary'} style={{ height: 30, fontSize: 12, padding: '0 10px' }}>{label}</Button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...DS_CARD, overflow: 'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin" /></div> : (
          <>
            <div className="tbl-wrap hide-mob">
              <table className="ds-table">
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
                        <td>
                          <div>{ticket.subject}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{ticket.message?.slice(0, 90) || 'No message preview'}</div>
                        </td>
                        <td>{ticket.client_name || 'Unknown client'}</td>
                        <td><StatusBadge variant={TONE_TO_VARIANT[workflowTone] || 'info'}>{ticket.workflow_status.replaceAll('_', ' ')}</StatusBadge></td>
                        <td><StatusBadge variant={TONE_TO_VARIANT[priorityTone] || 'info'}>{ticket.priority}</StatusBadge></td>
                        <td>{ticket.assignee_name || 'Unassigned'}</td>
                        <td><StatusBadge variant={TONE_TO_VARIANT[slaTone] || 'info'}>{ticket.workflow_status === 'resolved' ? 'Closed' : formatSupportDuration(ticket.due_at)}</StatusBadge></td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{new Date(ticket.created_at).toLocaleDateString('en-GB')}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px' }} onClick={() => openTicket(ticket)}>Open</Button>
                            <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px', color: 'var(--color-red-500)' }} onClick={() => deleteTicket(ticket.id)}>Del</Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-tertiary)' }}>No tickets found for this queue.</td></tr> : null}
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
                      <div key={ticket.id} style={{ ...DS_CARD, padding: 14, display: 'grid', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{ticket.subject}</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{ticket.client_name || 'Unknown client'}</div>
                          </div>
                          <StatusBadge variant={TONE_TO_VARIANT[workflowTone] || 'info'}>{ticket.workflow_status.replaceAll('_', ' ')}</StatusBadge>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <StatusBadge variant={TONE_TO_VARIANT[priorityTone] || 'info'}>{ticket.priority}</StatusBadge>
                          <StatusBadge variant={TONE_TO_VARIANT[slaState === 'breached' ? 'red' : slaState === 'at_risk' ? 'amber' : 'grey'] || 'info'}>{ticket.workflow_status === 'resolved' ? 'Closed' : formatSupportDuration(ticket.due_at)}</StatusBadge>
                          <StatusBadge variant="info">{ticket.assignee_name || 'Unassigned'}</StatusBadge>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px' }} onClick={() => openTicket(ticket)}>Open</Button>
                          <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px', color: 'var(--color-red-500)' }} onClick={() => deleteTicket(ticket.id)}>Delete</Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-tertiary)' }}>No tickets found for this queue.</div>}
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
              <Button variant="secondary" onClick={closeTicket}>Cancel</Button>
              <Button variant="secondary" onClick={() => saveTicket()} disabled={saving}>{saving ? 'Saving...' : 'Save workflow'}</Button>
              <Button variant="primary" onClick={() => saveTicket({ sendReply: true })} disabled={saving || !reply.trim()}>{saving ? 'Sending...' : 'Send reply'}</Button>
            </>
          )}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)', gap: 16 }}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ padding: '12px 14px', background: 'var(--color-gray-50)', borderRadius: 10 }}>
                <div className="ds-form-label" style={{ marginBottom: 6 }}>Message from {selected.client_name || 'Client'}</div>
                <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>{selected.message}</p>
              </div>

              <FormField>
                <FormLabel>Staff Reply</FormLabel>
                <textarea className="ds-form-input" rows={5} value={reply} onChange={(e) => setReply(e.target.value)} style={{ resize: 'vertical', padding: '8px 12px' }} placeholder="Reply to the client and move the ticket forward." />
              </FormField>

              <FormField>
                <FormLabel>Internal note</FormLabel>
                <textarea className="ds-form-input" rows={3} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} style={{ resize: 'vertical', padding: '8px 12px' }} placeholder="Internal only: triage notes, root cause, next action." />
              </FormField>

              <div style={{ display: 'grid', gap: 8 }}>
                <div className="ds-form-label">Internal notes</div>
                {selected.internal_notes?.length ? selected.internal_notes.slice().reverse().map((note) => (
                  <div key={note.id} style={{ padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-bg-surface)' }}>
                    <div style={{ fontSize: 12, color: 'var(--color-text-primary)', lineHeight: 1.6 }}>{note.body}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
                      {note.author_name || note.author_email || 'Staff'} · {new Date(note.created_at).toLocaleString('en-GB')}
                    </div>
                  </div>
                )) : <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No internal notes on this ticket yet.</div>}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ ...DS_CARD, padding: 14, display: 'grid', gap: 12 }}>
                <div className="ds-form-label">Workflow</div>
                <FormSelect value={editor.workflow_status} onChange={(e) => setEditor((prev) => ({ ...prev, workflow_status: e.target.value }))}>
                  {SUPPORT_WORKFLOW_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </FormSelect>

                <div className="ds-form-label">Priority</div>
                <FormSelect
                  value={editor.priority}
                  onChange={(e) => setEditor((prev) => ({
                    ...prev,
                    priority: e.target.value,
                    due_at: prev.workflow_status === 'resolved' ? '' : buildSupportDueAt(selected.created_at, e.target.value),
                  }))}
                >
                  {SUPPORT_PRIORITY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </FormSelect>

                <div className="ds-form-label">Owner</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    variant="secondary"
                    style={{ height: 28, fontSize: 12, padding: '0 8px' }}
                    onClick={() => setEditor((prev) => ({ ...prev, assignee_email: user?.email || '', assignee_name: user?.name || '' }))}
                    type="button"
                  >
                    Assign to me
                  </Button>
                  <Button
                    variant="secondary"
                    style={{ height: 28, fontSize: 12, padding: '0 8px' }}
                    onClick={() => setEditor((prev) => ({ ...prev, assignee_email: '', assignee_name: '' }))}
                    type="button"
                  >
                    Clear
                  </Button>
                </div>
                <FormInput value={editor.assignee_name} onChange={(e) => setEditor((prev) => ({ ...prev, assignee_name: e.target.value }))} placeholder="Owner name" />

                <div className="ds-form-label">SLA target</div>
                <FormInput type="datetime-local" value={editor.due_at ? editor.due_at.slice(0, 16) : ''} onChange={(e) => setEditor((prev) => ({ ...prev, due_at: e.target.value ? new Date(e.target.value).toISOString() : '' }))} />
              </div>

              <div style={{ ...DS_CARD, padding: 14, display: 'grid', gap: 10 }}>
                <div className="ds-form-label">Ticket context</div>
                <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Client: <strong style={{ color: 'var(--color-text-primary)' }}>{selected.client_name || 'Unknown client'}</strong><br />
                  Email: <strong style={{ color: 'var(--color-text-primary)' }}>{selected.client_email || 'No email on ticket'}</strong><br />
                  Submitted: <strong style={{ color: 'var(--color-text-primary)' }}>{new Date(selected.created_at).toLocaleString('en-GB')}</strong><br />
                  Current SLA: <strong style={{ color: 'var(--color-text-primary)' }}>{selected.workflow_status === 'resolved' ? 'Closed' : formatSupportDuration(editor.due_at || selected.due_at)}</strong>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
