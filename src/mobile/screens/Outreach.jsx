import { useState, useEffect, useMemo } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'
import { logAction } from '../../utils/audit'

const STATUSES = ['new', 'contacted', 'interested', 'not_interested', 'follow_up', 'converted']
const CALL_OUTCOMES = [
  ['none', 'No outcome set'],
  ['no_answer', 'No answer'],
  ['follow_up_later', 'Follow up later'],
  ['interested', 'Interested'],
  ['send_info', 'Send info'],
  ['booked_call', 'Booked call'],
  ['proposal_requested', 'Proposal requested'],
  ['not_interested', 'Not interested'],
  ['converted', 'Converted'],
]

const NOTES_META_PREFIX = '[dh-outreach-meta]'
const EMPTY_FORM = {
  business_name: '',
  contact_name: '',
  phone: '',
  email: '',
  website: '',
  status: 'new',
  notes: '',
  outcome: 'none',
  follow_up_date: '',
}

function parseOutreachNotes(raw = '') {
  const text = String(raw || '')
  if (!text.startsWith(NOTES_META_PREFIX)) {
    return {
      plainNotes: text,
      meta: { outcome: 'none', follow_up_date: '', history: [] },
    }
  }

  const newlineIndex = text.indexOf('\n')
  const metaLine = newlineIndex >= 0 ? text.slice(NOTES_META_PREFIX.length, newlineIndex).trim() : text.slice(NOTES_META_PREFIX.length).trim()
  const remaining = newlineIndex >= 0 ? text.slice(newlineIndex + 1).trim() : ''

  try {
    const parsed = JSON.parse(metaLine || '{}')
    return {
      plainNotes: remaining,
      meta: {
        outcome: parsed.outcome || 'none',
        follow_up_date: parsed.follow_up_date || '',
        history: Array.isArray(parsed.history) ? parsed.history : [],
        assigned_to_email: parsed.assigned_to_email || '',
        assigned_to_name: parsed.assigned_to_name || '',
        creator_email: parsed.creator_email || '',
        creator_department: parsed.creator_department || '',
      },
    }
  } catch {
    return {
      plainNotes: remaining || text,
      meta: { outcome: 'none', follow_up_date: '', history: [] },
    }
  }
}

function buildOutreachNotes(plainNotes, meta = {}) {
  const safeMeta = {
    outcome: meta.outcome || 'none',
    follow_up_date: meta.follow_up_date || '',
    history: Array.isArray(meta.history) ? meta.history.slice(0, 12) : [],
    assigned_to_email: meta.assigned_to_email || '',
    assigned_to_name: meta.assigned_to_name || '',
    creator_email: meta.creator_email || '',
    creator_department: meta.creator_department || '',
  }
  const metaBlock = `${NOTES_META_PREFIX} ${JSON.stringify(safeMeta)}`
  const body = String(plainNotes || '').trim()
  return body ? `${metaBlock}\n${body}` : metaBlock
}

function buildHistoryEntry({ action, value, actor }) {
  return {
    action,
    value,
    actor,
    at: new Date().toISOString(),
  }
}

function labelize(value = '') {
  return String(value || '').replace(/_/g, ' ')
}

function normalizeStatus(value = '') {
  const safe = String(value || '').toLowerCase().replace(/\s+/g, '_')
  return STATUSES.includes(safe) ? safe : 'new'
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const statusColor = {
  new: '#86868b',
  contacted: '#0066cc',
  interested: '#34c759',
  not_interested: '#ff3b30',
  follow_up: '#ff9500',
  converted: '#34c759',
}

export default function MobileOutreach({ navigate }) {
  const { user } = useAuth()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    loadContacts()
  }, [])

  const loadContacts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('outreach')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      const enriched = data.map(row => {
        const parsed = parseOutreachNotes(row.notes)
        return {
          ...row,
          status: normalizeStatus(row.status),
          plainNotes: parsed.plainNotes,
          outcome: parsed.meta.outcome,
          follow_up_date: parsed.meta.follow_up_date,
          history: parsed.meta.history,
          assigned_to_email: parsed.meta.assigned_to_email,
          assigned_to_name: parsed.meta.assigned_to_name,
        }
      })
      setContacts(enriched)
    }
    setLoading(false)
  }

  const openAdd = async () => {
    await Haptics.impact({ style: ImpactStyle.Light })
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = async (contact) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    setEditing(contact)
    setForm({
      business_name: contact.business_name || '',
      contact_name: contact.contact_name || '',
      phone: contact.phone || '',
      email: contact.email || '',
      website: contact.website || '',
      status: contact.status || 'new',
      notes: contact.plainNotes || '',
      outcome: contact.outcome || 'none',
      follow_up_date: contact.follow_up_date || '',
    })
    setShowDetail(null)
    setShowForm(true)
  }

  const closeForm = async () => {
    await Haptics.impact({ style: ImpactStyle.Light })
    setShowForm(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  const saveContact = async () => {
    if (!form.business_name.trim()) {
      alert('Business name is required')
      return
    }

    await Haptics.impact({ style: ImpactStyle.Medium })

    const noteMeta = {
      outcome: form.outcome || 'none',
      follow_up_date: form.follow_up_date || '',
      assigned_to_email: editing?.assigned_to_email || '',
      assigned_to_name: editing?.assigned_to_name || '',
      creator_email: editing?.creator_email || user?.email || '',
      creator_department: editing?.creator_department || '',
      history: [
        buildHistoryEntry({
          action: editing ? 'updated' : 'created',
          value: editing ? 'Lead updated' : 'Lead added',
          actor: user?.name || user?.email || 'Mobile user',
        }),
        ...(editing?.history || []),
      ].slice(0, 12),
    }

    const payload = {
      business_name: form.business_name,
      contact_name: form.contact_name,
      phone: form.phone,
      email: form.email,
      website: form.website,
      status: normalizeStatus(form.status),
      notes: buildOutreachNotes(form.notes, noteMeta),
      updated_at: new Date().toISOString(),
    }

    if (editing) {
      const { error } = await supabase
        .from('outreach')
        .update(payload)
        .eq('id', editing.id)

      if (!error) {
        await logAction(user?.email, user?.name, 'outreach_updated', form.business_name, editing.id, {})
        await Haptics.impact({ style: ImpactStyle.Heavy })
      }
    } else {
      const { error } = await supabase
        .from('outreach')
        .insert([{
          ...payload,
          added_by: user?.name,
          created_at: new Date().toISOString(),
        }])

      if (!error) {
        await logAction(user?.email, user?.name, 'outreach_added', form.business_name, null, {})
        await Haptics.impact({ style: ImpactStyle.Heavy })
      }
    }

    closeForm()
    loadContacts()
  }

  const quickStatus = async (contact, newStatus) => {
    await Haptics.impact({ style: ImpactStyle.Light })

    const nextStatus = normalizeStatus(newStatus)
    const meta = {
      outcome: contact.outcome || 'none',
      follow_up_date: contact.follow_up_date || '',
      assigned_to_email: contact.assigned_to_email || '',
      assigned_to_name: contact.assigned_to_name || '',
      creator_email: contact.creator_email || '',
      creator_department: contact.creator_department || '',
      history: [
        buildHistoryEntry({
          action: 'status',
          value: labelize(nextStatus),
          actor: user?.name || user?.email || 'Mobile user',
        }),
        ...(contact.history || []),
      ].slice(0, 12),
    }

    const { error } = await supabase
      .from('outreach')
      .update({
        status: nextStatus,
        notes: buildOutreachNotes(contact.plainNotes || '', meta),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id)

    if (!error) {
      await Haptics.impact({ style: ImpactStyle.Medium })
      loadContacts()
    }
  }

  const quickOutcome = async (contact, outcome) => {
    await Haptics.impact({ style: ImpactStyle.Light })

    const statusFromOutcome = outcome === 'converted'
      ? 'converted'
      : outcome === 'not_interested'
        ? 'not_interested'
        : outcome === 'interested' || outcome === 'booked_call' || outcome === 'proposal_requested'
          ? 'interested'
          : outcome === 'follow_up_later' || outcome === 'send_info' || outcome === 'no_answer'
            ? 'follow_up'
            : normalizeStatus(contact.status)

    const meta = {
      outcome,
      follow_up_date: contact.follow_up_date || '',
      assigned_to_email: contact.assigned_to_email || '',
      assigned_to_name: contact.assigned_to_name || '',
      creator_email: contact.creator_email || '',
      creator_department: contact.creator_department || '',
      history: [
        buildHistoryEntry({
          action: 'outcome',
          value: labelize(outcome),
          actor: user?.name || user?.email || 'Mobile user',
        }),
        ...(contact.history || []),
      ].slice(0, 12),
    }

    const { error } = await supabase
      .from('outreach')
      .update({
        status: statusFromOutcome,
        notes: buildOutreachNotes(contact.plainNotes || '', meta),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id)

    if (!error) {
      await Haptics.impact({ style: ImpactStyle.Medium })
      loadContacts()
    }
  }

  const deleteContact = async (contact) => {
    if (!confirm(`Delete ${contact.business_name}?`)) return

    await Haptics.impact({ style: ImpactStyle.Heavy })

    const { error } = await supabase
      .from('outreach')
      .delete()
      .eq('id', contact.id)

    if (!error) {
      await logAction(user?.email, user?.name, 'outreach_deleted', contact.business_name, contact.id, {})
      setShowDetail(null)
      loadContacts()
    }
  }

  const addNote = async (contact, noteText) => {
    if (!noteText.trim()) return

    const existingPlainNotes = String(contact.plainNotes || '').trim()
    const nextPlainNotes = existingPlainNotes ? `${noteText}\n\n${existingPlainNotes}` : noteText

    const meta = {
      outcome: contact.outcome || 'none',
      follow_up_date: contact.follow_up_date || '',
      assigned_to_email: contact.assigned_to_email || '',
      assigned_to_name: contact.assigned_to_name || '',
      creator_email: contact.creator_email || '',
      creator_department: contact.creator_department || '',
      history: [
        buildHistoryEntry({
          action: 'note',
          value: noteText,
          actor: user?.name || user?.email || 'Mobile user',
        }),
        ...(contact.history || []),
      ].slice(0, 12),
    }

    const { error } = await supabase
      .from('outreach')
      .update({
        notes: buildOutreachNotes(nextPlainNotes, meta),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id)

    if (!error) {
      await Haptics.impact({ style: ImpactStyle.Medium })
      loadContacts()
    }
  }

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      const q = search.toLowerCase()
      const matchQ = !q
        || c.business_name?.toLowerCase().includes(q)
        || c.contact_name?.toLowerCase().includes(q)
        || c.email?.toLowerCase().includes(q)
        || c.phone?.toLowerCase().includes(q)

      const matchF = filter === 'all'
        || (filter === 'follow_up' && c.status === 'follow_up')
        || (filter === 'hot' && c.status === 'interested')
        || (filter === 'new' && c.status === 'new')
        || (filter === 'converted' && c.status === 'converted')

      return matchQ && matchF
    })
  }, [contacts, search, filter])

  return (
    <div className="professional-screen">
      {/* Header */}
      <div className="professional-screen-header">
        <h1>Clients Contacted</h1>
        <p>Outreach & lead management</p>
      </div>

      {/* Stats */}
      <div className="professional-section" style={{ paddingTop: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <div style={{ background: '#f5f5f7', padding: 16, borderRadius: 12 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#0066cc' }}>{contacts.length}</div>
            <div style={{ fontSize: 13, color: '#86868b', marginTop: 4 }}>Total Leads</div>
          </div>
          <div style={{ background: '#f5f5f7', padding: 16, borderRadius: 12 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#34c759' }}>{contacts.filter(c => c.status === 'interested').length}</div>
            <div style={{ fontSize: 13, color: '#86868b', marginTop: 4 }}>Hot Leads</div>
          </div>
          <div style={{ background: '#f5f5f7', padding: 16, borderRadius: 12 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#ff9500' }}>{contacts.filter(c => c.status === 'follow_up').length}</div>
            <div style={{ fontSize: 13, color: '#86868b', marginTop: 4 }}>Follow-ups</div>
          </div>
          <div style={{ background: '#f5f5f7', padding: 16, borderRadius: 12 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#5856d6' }}>{contacts.filter(c => c.status === 'converted').length}</div>
            <div style={{ fontSize: 13, color: '#86868b', marginTop: 4 }}>Converted</div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="professional-section">
        <input
          type="search"
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 10,
            border: '1px solid #d2d2d7',
            fontSize: 15,
            marginBottom: 12,
          }}
        />

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            ['all', 'All'],
            ['new', 'New'],
            ['follow_up', 'Follow-up'],
            ['hot', 'Hot'],
            ['converted', 'Converted'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              style={{
                padding: '8px 16px',
                borderRadius: 20,
                border: 'none',
                background: filter === value ? '#0066cc' : '#f5f5f7',
                color: filter === value ? 'white' : '#1a1a1a',
                fontSize: 14,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Contact List */}
      <div className="professional-section">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#86868b' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#86868b' }}>
            {search ? 'No contacts found' : 'No contacts yet. Add your first contact!'}
          </div>
        ) : (
          filtered.map(contact => (
            <MobileCard key={contact.id} onPress={() => setShowDetail(contact)} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
                    {contact.business_name}
                  </h3>
                  <p style={{ fontSize: 14, color: '#86868b' }}>
                    {contact.contact_name || 'No contact name'}
                  </p>
                </div>
                <div style={{
                  padding: '4px 10px',
                  borderRadius: 12,
                  background: `${statusColor[contact.status]}15`,
                  border: `1px solid ${statusColor[contact.status]}`,
                  fontSize: 12,
                  fontWeight: 600,
                  color: statusColor[contact.status],
                  whiteSpace: 'nowrap',
                }}>
                  {labelize(contact.status)}
                </div>
              </div>

              {contact.email && (
                <div style={{ fontSize: 13, color: '#86868b', marginBottom: 4 }}>
                  <Icon name="user" size={14} /> {contact.email}
                </div>
              )}

              {contact.phone && (
                <div style={{ fontSize: 13, color: '#86868b', marginBottom: 8 }}>
                  <Icon name="user" size={14} /> {contact.phone}
                </div>
              )}

              {contact.outcome && contact.outcome !== 'none' && (
                <div style={{ fontSize: 12, color: '#0066cc', marginTop: 8 }}>
                  Last outcome: {labelize(contact.outcome)}
                </div>
              )}
            </MobileCard>
          ))
        )}
      </div>

      {/* Add Button */}
      <button
        onClick={openAdd}
        style={{
          position: 'fixed',
          bottom: 100,
          right: 20,
          width: 60,
          height: 60,
          borderRadius: 30,
          background: '#0066cc',
          border: 'none',
          boxShadow: '0 4px 12px rgba(0, 102, 204, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          color: 'white',
          fontWeight: 300,
        }}
      >
        +
      </button>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'white',
          zIndex: 1000,
          overflowY: 'auto',
          paddingBottom: 100,
        }}>
          <div className="professional-screen-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', padding: 0 }}>
                <Icon name="chevronLeft" size={24} color="#0066cc" />
              </button>
              <div>
                <h1>{editing ? 'Edit Contact' : 'Add Contact'}</h1>
                <p>{editing ? 'Update contact details' : 'Create new contact'}</p>
              </div>
            </div>
          </div>

          <div className="professional-section">
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#1a1a1a' }}>
                Business Name *
              </label>
              <input
                type="text"
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                placeholder="ABC Company Ltd"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #d2d2d7',
                  fontSize: 15,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#1a1a1a' }}>
                Contact Name
              </label>
              <input
                type="text"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                placeholder="John Smith"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #d2d2d7',
                  fontSize: 15,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#1a1a1a' }}>
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="contact@company.com"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #d2d2d7',
                  fontSize: 15,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#1a1a1a' }}>
                Phone
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="07123456789"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #d2d2d7',
                  fontSize: 15,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#1a1a1a' }}>
                Website
              </label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder="https://company.com"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #d2d2d7',
                  fontSize: 15,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#1a1a1a' }}>
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #d2d2d7',
                  fontSize: 15,
                  background: 'white',
                }}
              >
                {STATUSES.map(s => (
                  <option key={s} value={s}>{labelize(s)}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#1a1a1a' }}>
                Outcome
              </label>
              <select
                value={form.outcome}
                onChange={(e) => setForm({ ...form, outcome: e.target.value })}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #d2d2d7',
                  fontSize: 15,
                  background: 'white',
                }}
              >
                {CALL_OUTCOMES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#1a1a1a' }}>
                Follow-up Date
              </label>
              <input
                type="date"
                value={form.follow_up_date}
                onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #d2d2d7',
                  fontSize: 15,
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#1a1a1a' }}>
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Add notes about this contact..."
                rows={6}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #d2d2d7',
                  fontSize: 15,
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  resize: 'vertical',
                }}
              />
            </div>

            <button
              onClick={saveContact}
              style={{
                width: '100%',
                padding: 16,
                borderRadius: 12,
                border: 'none',
                background: '#0066cc',
                color: 'white',
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              {editing ? 'Update Contact' : 'Add Contact'}
            </button>

            <button
              onClick={closeForm}
              style={{
                width: '100%',
                padding: 16,
                borderRadius: 12,
                border: '1px solid #d2d2d7',
                background: 'white',
                color: '#1a1a1a',
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Detail View Modal */}
      {showDetail && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'white',
          zIndex: 1000,
          overflowY: 'auto',
          paddingBottom: 100,
        }}>
          <div className="professional-screen-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setShowDetail(null)} style={{ background: 'none', border: 'none', padding: 0 }}>
                <Icon name="chevronLeft" size={24} color="#0066cc" />
              </button>
              <div>
                <h1>{showDetail.business_name}</h1>
                <p>{showDetail.contact_name || 'No contact name'}</p>
              </div>
            </div>
          </div>

          <div className="professional-section">
            {/* Status Badge */}
            <div style={{
              padding: '8px 16px',
              borderRadius: 12,
              background: `${statusColor[showDetail.status]}15`,
              border: `1px solid ${statusColor[showDetail.status]}`,
              fontSize: 14,
              fontWeight: 600,
              color: statusColor[showDetail.status],
              display: 'inline-block',
              marginBottom: 20,
            }}>
              {labelize(showDetail.status)}
            </div>

            {/* Contact Info */}
            {showDetail.email && (
              <div style={{ marginBottom: 12, fontSize: 15 }}>
                <strong>Email:</strong>{' '}
                <a href={`mailto:${showDetail.email}`} style={{ color: '#0066cc' }}>
                  {showDetail.email}
                </a>
              </div>
            )}

            {showDetail.phone && (
              <div style={{ marginBottom: 12, fontSize: 15 }}>
                <strong>Phone:</strong>{' '}
                <a href={`tel:${showDetail.phone}`} style={{ color: '#0066cc' }}>
                  {showDetail.phone}
                </a>
              </div>
            )}

            {showDetail.website && (
              <div style={{ marginBottom: 12, fontSize: 15 }}>
                <strong>Website:</strong>{' '}
                <a href={showDetail.website} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>
                  {showDetail.website}
                </a>
              </div>
            )}

            {showDetail.outcome && showDetail.outcome !== 'none' && (
              <div style={{ marginBottom: 12, fontSize: 15 }}>
                <strong>Last Outcome:</strong> {labelize(showDetail.outcome)}
              </div>
            )}

            {showDetail.follow_up_date && (
              <div style={{ marginBottom: 12, fontSize: 15 }}>
                <strong>Follow-up Date:</strong> {showDetail.follow_up_date}
              </div>
            )}

            {showDetail.plainNotes && (
              <div style={{ marginTop: 20, marginBottom: 20 }}>
                <strong style={{ display: 'block', marginBottom: 8 }}>Notes:</strong>
                <div style={{
                  background: '#f5f5f7',
                  padding: 12,
                  borderRadius: 10,
                  fontSize: 14,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}>
                  {showDetail.plainNotes}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 24, marginBottom: 24 }}>
              {showDetail.phone && (
                <a
                  href={`tel:${showDetail.phone}`}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: '#34c759',
                    color: 'white',
                    textAlign: 'center',
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Icon name="user" size={16} color="white" /> Call
                </a>
              )}

              {showDetail.email && (
                <a
                  href={`mailto:${showDetail.email}`}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: '#0066cc',
                    color: 'white',
                    textAlign: 'center',
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Icon name="user" size={16} color="white" /> Email
                </a>
              )}
            </div>

            {/* Status Quick Actions */}
            <div style={{ marginBottom: 20 }}>
              <strong style={{ display: 'block', marginBottom: 12 }}>Change Status:</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {STATUSES.filter(s => s !== showDetail.status).map(status => (
                  <button
                    key={status}
                    onClick={() => {
                      quickStatus(showDetail, status)
                      setShowDetail(null)
                    }}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: '1px solid #d2d2d7',
                      background: 'white',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#1a1a1a',
                    }}
                  >
                    {labelize(status)}
                  </button>
                ))}
              </div>
            </div>

            {/* Outcome Quick Actions */}
            <div style={{ marginBottom: 20 }}>
              <strong style={{ display: 'block', marginBottom: 12 }}>Log Outcome:</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {CALL_OUTCOMES.filter(([value]) => value !== 'none' && value !== showDetail.outcome).slice(0, 6).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => {
                      quickOutcome(showDetail, value)
                      setShowDetail(null)
                    }}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: '1px solid #d2d2d7',
                      background: 'white',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#1a1a1a',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Actions */}
            <button
              onClick={() => openEdit(showDetail)}
              style={{
                width: '100%',
                padding: 16,
                borderRadius: 12,
                border: 'none',
                background: '#0066cc',
                color: 'white',
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              Edit Contact
            </button>

            <button
              onClick={() => deleteContact(showDetail)}
              style={{
                width: '100%',
                padding: 16,
                borderRadius: 12,
                border: '1px solid #ff3b30',
                background: 'white',
                color: '#ff3b30',
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Delete Contact
            </button>
          </div>
        </div>
      )}

      <style>{`
        .professional-screen {
          background: #f5f5f7;
          min-height: 100vh;
          padding-bottom: 100px;
        }

        .professional-screen-header {
          background: white;
          padding: 60px 20px 24px;
          border-bottom: 1px solid #d2d2d7;
          margin-bottom: 20px;
        }

        .professional-screen-header h1 {
          font-size: 28px;
          font-weight: 700;
          color: #1a1a1a;
          margin: 0 0 4px 0;
        }

        .professional-screen-header p {
          font-size: 16px;
          color: #86868b;
          margin: 0;
        }

        .professional-section {
          padding: 0 20px 20px;
        }

        @supports (padding: max(0px)) {
          .professional-screen-header {
            padding-top: max(60px, env(safe-area-inset-top));
          }
        }
      `}</style>
    </div>
  )
}
