import { useState, useEffect, useMemo } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Icon from '../components/Icon'
import { PageTitle, Tile, Chip } from '../components/DH'
import { Screen, HeaderButton, Card, Sec, KV, Field, Pills, Pill, Btn, Btns, Empty, Loading } from '../components/UI'
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
  new: 'var(--mobile-text-secondary)',
  contacted: 'var(--mobile-accent)',
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

  const capLabel = (v) => { const t = labelize(v); return t ? t[0].toUpperCase() + t.slice(1) : t }
  const STATUS_TONE = { new: 'neutral', contacted: 'blue', interested: 'green', not_interested: 'red', follow_up: 'amber', converted: 'green' }
  const shortDate = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '')

  if (showForm) {
    return (
      <Screen title={editing ? 'Edit lead' : 'Add lead'} onBack={closeForm}>
        <div className="dh-card">
          <Field label="Business name" htmlFor="ld-biz">
            <input id="ld-biz" type="text" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="ABC Company Ltd" />
          </Field>
          <Field label="Contact name" htmlFor="ld-name">
            <input id="ld-name" type="text" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="John Smith" />
          </Field>
          <Field label="Email" htmlFor="ld-email">
            <input id="ld-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contact@company.com" />
          </Field>
          <Field label="Phone" htmlFor="ld-phone">
            <input id="ld-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07123 456789" />
          </Field>
          <Field label="Website" htmlFor="ld-web">
            <input id="ld-web" type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://company.com" />
          </Field>
        </div>

        <Sec>Status</Sec>
        <Pills>
          {STATUSES.map(s => <Pill key={s} on={form.status === s} onPress={() => setForm({ ...form, status: s })}>{capLabel(s)}</Pill>)}
        </Pills>

        <div className="dh-card">
          <Field label="Outcome" htmlFor="ld-outcome">
            <select id="ld-outcome" value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}>
              {CALL_OUTCOMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Follow-up date" htmlFor="ld-fu">
            <input id="ld-fu" type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
          </Field>
          <Field label="Notes" htmlFor="ld-notes">
            <textarea id="ld-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Add notes about this contact..." rows={6} />
          </Field>
        </div>

        <Btns>
          <Btn variant="outline" onPress={closeForm}>Cancel</Btn>
          <Btn onPress={saveContact}>{editing ? 'Save' : 'Add lead'}</Btn>
        </Btns>
      </Screen>
    )
  }

  if (showDetail) {
    const d = showDetail
    const site = d.website && (/^https?:\/\//.test(d.website) ? d.website : `https://${d.website}`)
    const actions = [
      d.phone && <a key="call" className="dh-btn2 outline small ld-act" href={`tel:${d.phone}`}>Call</a>,
      d.email && <a key="email" className="dh-btn2 outline small ld-act" href={`mailto:${d.email}`}>Email</a>,
      site && <a key="web" className="dh-btn2 outline small ld-act" href={site} target="_blank" rel="noopener noreferrer">Website</a>,
    ].filter(Boolean)
    return (
      <Screen title="Lead" onBack={() => setShowDetail(null)} action={<HeaderButton onPress={() => openEdit(d)}>Edit</HeaderButton>}>
        <Card pad>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span className="dh-h2">{d.business_name}</span>
            <Chip tone={STATUS_TONE[d.status] || 'neutral'}>{capLabel(d.status)}</Chip>
          </div>
          <span className="dh-sub">{[d.contact_name || 'No contact name', d.website && d.website.replace(/^https?:\/\//, '').replace(/\/$/, '')].filter(Boolean).join(' · ')}</span>
          {actions.length > 0 && <div className="ld-acts" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>{actions}</div>}
        </Card>

        <div className="dh-card">
          {d.email && <KV k="Email" v={d.email} />}
          {d.phone && <KV k="Phone" v={d.phone} />}
          {d.outcome && d.outcome !== 'none' && <KV k="Last outcome" v={capLabel(d.outcome)} />}
          {d.follow_up_date && <KV k="Follow-up date" v={d.follow_up_date} />}
        </div>

        <Sec>Status</Sec>
        <Pills>
          {STATUSES.map(status => (
            <Pill
              key={status}
              on={d.status === status}
              onPress={() => {
                if (status === d.status) return
                quickStatus(d, status)
                setShowDetail(null)
              }}
            >{capLabel(status)}</Pill>
          ))}
        </Pills>

        <Sec>Log outcome</Sec>
        <Pills>
          {CALL_OUTCOMES.filter(([value]) => value !== 'none' && value !== d.outcome).slice(0, 6).map(([value, label]) => (
            <Pill key={value} onPress={() => { quickOutcome(d, value); setShowDetail(null) }}>{label}</Pill>
          ))}
        </Pills>

        {d.plainNotes && (
          <>
            <Sec>Notes</Sec>
            <Card pad><span style={{ fontSize: 14.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{d.plainNotes}</span></Card>
          </>
        )}

        {d.history?.length > 0 && (
          <>
            <Sec>History</Sec>
            <div className="dh-card">
              {d.history.map((h, i) => (
                <div key={i} className="dh-row">
                  <span className="dh-g">
                    <span className="dh-t">{capLabel(h.action || '')}{h.value ? `: ${capLabel(String(h.value))}` : ''}</span>
                    {h.actor && <span className="dh-sub">{h.actor}</span>}
                  </span>
                  <span className="dh-sub">{shortDate(h.at)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <Btn variant="danger" onPress={() => deleteContact(d)}>Delete lead</Btn>
        <style>{OUT_CSS}</style>
      </Screen>
    )
  }

  const count = (st) => contacts.filter(c => c.status === st).length
  return (
    <div className="dh-page">
      <PageTitle title="Leads" action={<button type="button" className="ld-add" onClick={openAdd} aria-label="Add a lead"><Icon name="plus" size={20} /></button>} />

      <div className="dh-tiles">
        <Tile label="All leads" value={contacts.length} />
        <Tile label="Interested" value={count('interested')} />
        <Tile label="Follow-ups" value={count('follow_up')} />
        <Tile label="Converted" value={count('converted')} />
      </div>

      <div className="dh-search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="Search leads" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search leads" />
      </div>

      <Pills>
        {[['all', 'All'], ['new', 'New'], ['follow_up', 'Follow-up'], ['hot', 'Hot'], ['converted', 'Converted']].map(([value, label]) => (
          <Pill key={value} on={filter === value} onPress={() => setFilter(value)}>{label}</Pill>
        ))}
      </Pills>

      {loading ? <Loading /> : filtered.length === 0 ? (
        <Empty icon="users" title={search ? 'No leads found' : 'No leads yet'} sub={search ? undefined : 'Tap + to add one.'} />
      ) : (
        <div className="dh-card">
          {filtered.map(contact => (
            <button key={contact.id} type="button" className="dh-row" onClick={() => setShowDetail(contact)}>
              <span className="dh-g">
                <span className="dh-t">{contact.business_name}</span>
                <span className="dh-sub">
                  {[contact.contact_name || 'No contact name', contact.outcome && contact.outcome !== 'none' ? capLabel(contact.outcome) : null, contact.follow_up_date ? `follow up ${shortDate(contact.follow_up_date)}` : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <Chip tone={STATUS_TONE[contact.status] || 'neutral'}>{capLabel(contact.status)}</Chip>
            </button>
          ))}
        </div>
      )}

      <Btn onPress={openAdd}>Add a lead</Btn>
      <style>{OUT_CSS}</style>
    </div>
  )
}

const OUT_CSS = `
  .ld-add { width: 44px; height: 44px; border-radius: 14px; border: 1px solid var(--mobile-border); background: var(--mobile-card); color: var(--mobile-accent); display: flex; align-items: center; justify-content: center; }
  .ld-acts { display: grid; gap: 10px; margin-top: 4px; }
  .ld-act { width: 100%; height: 44px; text-decoration: none; }
`
