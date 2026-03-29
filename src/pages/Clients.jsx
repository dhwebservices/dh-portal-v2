import { useState, useEffect, useRef } from 'react'
import { Plus, Search, Upload, Edit2, Trash2, Mail, Check } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { logAction } from '../utils/audit'
import { sendEmail } from '../utils/email'
import { useMsal } from '@azure/msal-react'

const EMPTY = { name: '', contact: '', email: '', phone: '', plan: 'Monthly Starter', status: 'pending', value: 79, invoice_paid: false }
const PLANS = ['Monthly Starter', 'Monthly Professional', 'Monthly Business', 'Monthly HR Maintenance']
const STATUSES = ['pending', 'active', 'paused', 'cancelled']
const STATUS_BADGE = { pending: 'amber', active: 'green', paused: 'grey', cancelled: 'red' }
const CHECKLIST = [
  { key: 'nda_signed', label: 'NDA Signed' },
  { key: 'contract_sent', label: 'Contract Sent' },
  { key: 'first_invoice_paid', label: 'First Invoice Paid' },
  { key: 'website_started', label: 'Website Started' },
  { key: 'website_complete', label: 'Website Complete' },
  { key: 'access_sent', label: 'Client Portal Access Sent' },
]

function Modal({ title, onClose, size = 'md', children, footer }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: size === 'lg' ? 800 : 560 }} onClick={e => e.stopPropagation()}>
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

export default function Clients() {
  const { accounts } = useMsal()
  const user = accounts[0]
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [checklist, setChecklist] = useState({})
  const [tab, setTab] = useState('details')
  const fileRef = useRef()

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  const fetchNotes = async id => {
    const { data } = await supabase.from('client_notes').select('*').eq('client_id', id).order('created_at', { ascending: false })
    setNotes(data || [])
  }

  const fetchChecklist = async id => {
    const { data } = await supabase.from('client_checklist').select('*').eq('client_id', id).single()
    setChecklist(data || {})
  }

  const filtered = clients.filter(client => {
    const query = search.toLowerCase()
    return (!query || client.name?.toLowerCase().includes(query) || client.contact?.toLowerCase().includes(query) || client.email?.toLowerCase().includes(query))
      && (filter === 'all' || client.status === filter)
  })

  const openAdd = () => { setForm(EMPTY); setSelected(null); setModal('form'); setTab('details') }
  const openEdit = client => { setSelected(client); setForm({ ...client }); setModal('form'); setTab('details'); fetchNotes(client.id); fetchChecklist(client.id) }
  const close = () => { setModal(null); setSelected(null); setNotes([]); setChecklist({}); setNewNote('') }
  const updateField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const save = async () => {
    setSaving(true)
    if (selected) {
      await supabase.from('clients').update(form).eq('id', selected.id)
      if (form.email) await supabase.from('client_accounts').upsert({ email: form.email, name: form.name, plan: form.plan }, { onConflict: 'email' })
      await logAction(user?.username, user?.name, 'client_updated', form.name, selected.id, { status: form.status })
    } else {
      const { data } = await supabase.from('clients').insert([form]).select().single()
      await supabase.from('client_accounts').upsert({ email: form.email, name: form.name, plan: form.plan, deployment_status: 'accepted' }, { onConflict: 'email' })
      await logAction(user?.username, user?.name, 'client_added', form.name, data?.id, { plan: form.plan })
    }
    setSaving(false)
    close()
    load()
  }

  const del = async client => {
    if (!confirm(`Delete ${client.name}?`)) return
    await supabase.from('clients').delete().eq('id', client.id)
    await logAction(user?.username, user?.name, 'client_deleted', client.name, client.id, {})
    load()
  }

  const addNote = async () => {
    if (!newNote.trim() || !selected) return
    await supabase.from('client_notes').insert([{ client_id: selected.id, note: newNote, author: user?.name || 'Staff', created_at: new Date().toISOString() }])
    setNewNote('')
    fetchNotes(selected.id)
  }

  const toggleChecklist = async key => {
    if (!selected) return
    const value = !checklist[key]
    const updated = { ...checklist, [key]: value, client_id: selected.id }
    await supabase.from('client_checklist').upsert(updated, { onConflict: 'client_id' })
    setChecklist(updated)
  }

  const sendPortalAccess = async client => {
    await sendEmail('client_portal_access', { clientName: client.name, clientEmail: client.email })
    alert(`Portal access email sent to ${client.email}`)
  }

  return (
    <div className="fade-in">
      <div className="card" style={{ padding: '22px 24px', marginBottom: 18, background: 'linear-gradient(135deg, var(--card-strong) 0%, rgba(183,143,37,0.08) 100%)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8 }}>Clients Workspace</div>
        <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title">Onboarded Clients</h1>
            <p style={{ fontSize: 14, color: 'var(--sub)', lineHeight: 1.7, marginTop: 10, maxWidth: 620 }}>
              Manage account status, notes, onboarding checklist, invoice state, and client access from one place.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'Visible', value: filtered.length },
              { label: 'Total', value: clients.length },
              { label: 'Active', value: clients.filter(client => client.status === 'active').length },
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
          <p className="page-sub">{clients.length} total clients</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => fileRef.current?.click()} className="btn btn-outline btn-sm"><Upload size={13} />Import</button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} />
          <button onClick={openAdd} className="btn btn-primary"><Plus size={14} />Add Client</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-wrap" style={{ flex: 1, minWidth: 200 }}>
          <Search size={13} className="search-icon" />
          <input className="inp" style={{ paddingLeft: 36 }} placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['all', ...STATUSES].map(status => (
            <button key={status} onClick={() => setFilter(status)} className={`filter-pill${filter === status ? ' active' : ''}`} style={{ textTransform: 'capitalize' }}>
              {status === 'all' ? 'All' : status}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div className="spin-center"><div className="spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty"><p>No clients found</p></div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Plan</th>
                <th>Value</th>
                <th>Status</th>
                <th>Invoice</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(client => (
                <tr key={client.id}>
                  <td className="text-main">{client.name}</td>
                  <td>{client.contact}</td>
                  <td>{client.email && <a href={`mailto:${client.email}`} style={{ color: 'var(--blue)' }}>{client.email}</a>}</td>
                  <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sub)' }}>{client.plan}</span></td>
                  <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>£{client.value}</span></td>
                  <td><span className={`badge badge-${STATUS_BADGE[client.status] || 'grey'}`} style={{ textTransform: 'capitalize' }}>{client.status}</span></td>
                  <td>{client.invoice_paid ? <span className="badge badge-green">Paid</span> : <span className="badge badge-red">Unpaid</span>}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => sendPortalAccess(client)} className="btn btn-ghost btn-sm btn-icon" title="Send portal access"><Mail size={12} /></button>
                      <button onClick={() => openEdit(client)} className="btn btn-ghost btn-sm btn-icon"><Edit2 size={12} /></button>
                      <button onClick={() => del(client)} className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--red)' }}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal === 'form' && (
        <Modal title={selected ? `Edit — ${selected.name}` : 'Add Client'} onClose={close} size="lg" footer={<><button onClick={close} className="btn btn-outline">Cancel</button><button onClick={save} disabled={saving} className="btn btn-primary">{saving ? 'Saving...' : 'Save'}</button></>}>
          <div className="tabs">
            {['details', 'notes', 'checklist'].map(currentTab => (
              <button key={currentTab} onClick={() => setTab(currentTab)} className={`tab${tab === currentTab ? ' active' : ''}`} style={{ textTransform: 'capitalize' }}>{currentTab}</button>
            ))}
          </div>

          {tab === 'details' && (
            <div className="form-grid">
              <div><label className="inp-label">Business Name *</label><input className="inp" value={form.name} onChange={e => updateField('name', e.target.value)} /></div>
              <div><label className="inp-label">Contact Name</label><input className="inp" value={form.contact} onChange={e => updateField('contact', e.target.value)} /></div>
              <div><label className="inp-label">Email</label><input className="inp" type="email" value={form.email} onChange={e => updateField('email', e.target.value)} /></div>
              <div><label className="inp-label">Phone</label><input className="inp" value={form.phone} onChange={e => updateField('phone', e.target.value)} /></div>
              <div>
                <label className="inp-label">Plan</label>
                <select className="inp" value={form.plan} onChange={e => updateField('plan', e.target.value)}>
                  {PLANS.map(plan => <option key={plan}>{plan}</option>)}
                </select>
              </div>
              <div><label className="inp-label">Monthly Value (£)</label><input className="inp" type="number" value={form.value} onChange={e => updateField('value', parseFloat(e.target.value) || 0)} /></div>
              <div>
                <label className="inp-label">Status</label>
                <select className="inp" value={form.status} onChange={e => updateField('status', e.target.value)}>
                  {STATUSES.map(status => <option key={status} style={{ textTransform: 'capitalize' }}>{status}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 20 }}>
                <input type="checkbox" id="inv_paid" checked={!!form.invoice_paid} onChange={e => updateField('invoice_paid', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--gold)' }} />
                <label htmlFor="inv_paid" style={{ fontSize: 13, cursor: 'pointer' }}>Invoice Paid</label>
              </div>
            </div>
          )}

          {tab === 'notes' && selected && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input className="inp" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..." onKeyDown={e => e.key === 'Enter' && addNote()} style={{ flex: 1 }} />
                <button onClick={addNote} className="btn btn-primary btn-sm">Add</button>
              </div>
              {notes.length === 0 ? (
                <div className="empty" style={{ padding: '24px 0' }}><p>No notes yet</p></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notes.map(note => (
                    <div key={note.id} style={{ padding: '10px 14px', background: 'var(--bg2)', borderRadius: 12, borderLeft: '2px solid var(--border2)' }}>
                      <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>{note.note}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)' }}>{note.author} · {new Date(note.created_at).toLocaleDateString('en-GB')}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'checklist' && selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CHECKLIST.map(item => (
                <div key={item.key} onClick={() => toggleChecklist(item.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg2)', borderRadius: 12, cursor: 'pointer', border: `1px solid ${checklist[item.key] ? 'var(--green-bg)' : 'var(--border)'}`, transition: 'all 0.15s' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${checklist[item.key] ? 'var(--green)' : 'var(--border2)'}`, background: checklist[item.key] ? 'var(--green-bg)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {checklist[item.key] && <Check size={11} color="var(--green)" />}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: checklist[item.key] ? 600 : 400, color: checklist[item.key] ? 'var(--text)' : 'var(--sub)' }}>{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
