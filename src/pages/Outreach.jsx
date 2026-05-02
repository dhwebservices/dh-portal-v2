import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { logAction } from '../utils/audit'
import { logClientActivity, upsertClientAccount } from '../utils/clientAccounts'
import { sendManagedNotification } from '../utils/notificationPreferences'

const STATUSES = ['new', 'contacted', 'interested', 'not_interested', 'follow_up', 'converted']
const FILTERS = ['all', 'assigned_to_me', 'due_today', 'follow_up_queue', 'overdue', 'hot', 'recent', 'converted', 'not_interested']
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
const EMPTY = {
  business_name: '',
  contact_name: '',
  phone: '',
  email: '',
  website: '',
  status: 'new',
  notes: '',
  outcome: 'none',
  follow_up_date: '',
  assigned_to_email: '',
  creator_department: '',
}
const FOLLOW_UP_DONE_OUTCOMES = ['no_answer', 'follow_up_later', 'interested', 'send_info', 'booked_call', 'proposal_requested', 'not_interested', 'converted']

const statusColor = {
  new: 'grey',
  contacted: 'blue',
  interested: 'green',
  not_interested: 'red',
  follow_up: 'amber',
  converted: 'green',
}

function labelize(value = '') {
  return String(value || '').replace(/_/g, ' ')
}

function normalizeStatus(value = '') {
  const safe = String(value || '').toLowerCase().replace(/\s+/g, '_')
  return STATUSES.includes(safe) ? safe : 'new'
}

function parseOutreachNotes(raw = '') {
  const text = String(raw || '')
  if (!text.startsWith(NOTES_META_PREFIX)) {
    return {
      plainNotes: text,
      meta: { outcome: 'none', follow_up_date: '', history: [], assigned_to_email: '', assigned_to_name: '', creator_email: '', creator_department: '', reminder_notice_key: '' },
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
        reminder_notice_key: parsed.reminder_notice_key || '',
      },
    }
  } catch {
    return {
      plainNotes: remaining || text,
      meta: { outcome: 'none', follow_up_date: '', history: [], assigned_to_email: '', assigned_to_name: '', creator_email: '', creator_department: '', reminder_notice_key: '' },
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
    reminder_notice_key: meta.reminder_notice_key || '',
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

function buildLeadMeta(row = {}, overrides = {}) {
  return {
    outcome: row.outcome || 'none',
    follow_up_date: row.follow_up_date || '',
    assigned_to_email: row.assigned_to_email || '',
    assigned_to_name: row.assigned_to_name || '',
    creator_email: row.creator_email || '',
    creator_department: row.creator_department || '',
    reminder_notice_key: row.reminder_notice_key || '',
    history: Array.isArray(row.history) ? row.history : [],
    ...overrides,
  }
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatShortDate(value) {
  if (!value) return '—'
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getLocalWeekStart(date = new Date()) {
  const dt = new Date(date)
  const day = dt.getDay()
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
  dt.setDate(diff)
  dt.setHours(0, 0, 0, 0)
  return getLocalDateKey(dt)
}

function isSameLocalDay(value, target = new Date()) {
  if (!value) return false
  const date = new Date(value)
  return date.getFullYear() === target.getFullYear()
    && date.getMonth() === target.getMonth()
    && date.getDate() === target.getDate()
}

function getTouchedAt(row) {
  return row.updated_at || row.created_at || null
}

function daysSince(value) {
  if (!value) return null
  const diff = Date.now() - new Date(value).getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}

function getLeadTemperature(row) {
  const status = normalizeStatus(row.status)
  if (status === 'converted') return { label: 'Won', tone: 'green' }
  if (status === 'interested') return { label: 'Hot', tone: 'red' }
  if (status === 'follow_up') return { label: 'Warm', tone: 'amber' }
  if (status === 'contacted') return { label: 'Warm', tone: 'blue' }
  if (status === 'not_interested') return { label: 'Cold', tone: 'grey' }
  return { label: 'New', tone: 'grey' }
}

function needsFollowUp(row) {
  return ['contacted', 'interested', 'follow_up'].includes(normalizeStatus(row.status))
}

function isRecent(row) {
  const touched = getTouchedAt(row)
  const age = daysSince(touched)
  return age !== null && age <= 2
}

function isOverdue(row) {
  if (!needsFollowUp(row)) return false
  if (row.follow_up_date) {
    return new Date(`${row.follow_up_date}T23:59:59`).getTime() < Date.now()
  }
  const touched = getTouchedAt(row)
  const age = daysSince(touched)
  if (age === null) return false
  const status = normalizeStatus(row.status)
  if (status === 'interested') return age >= 2
  if (status === 'follow_up') return age >= 2
  return age >= 4
}

function getNextAction(row) {
  const status = normalizeStatus(row.status)
  if (status === 'new') return 'First outreach'
  if (status === 'contacted') return 'Send follow-up'
  if (status === 'interested') return 'Book a call'
  if (status === 'follow_up') return 'Chase today'
  if (status === 'converted') return 'Hand over to delivery'
  return 'Close out or archive'
}

function getLastContactMethod(row, emails) {
  const emailLog = emails.find((entry) => {
    const sentTo = Array.isArray(entry.sent_to) ? entry.sent_to.join(' ').toLowerCase() : String(entry.sent_to || '').toLowerCase()
    const email = String(row.email || '').toLowerCase()
    return email && sentTo.includes(email)
  })

  if (emailLog) return 'Email sent'
  if (row.phone) return 'Call logged'
  return 'No method logged'
}

function buildQueue(rows, emails) {
  return rows
    .filter((row) => needsFollowUp(row))
    .map((row) => {
      const touched = getTouchedAt(row)
      const age = daysSince(touched)
      return {
        ...row,
        touched,
        age,
        overdue: isOverdue(row),
        nextAction: getNextAction(row),
        contactMethod: getLastContactMethod(row, emails),
        temperature: getLeadTemperature(row),
      }
    })
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      if ((b.age || 0) !== (a.age || 0)) return (b.age || 0) - (a.age || 0)
      return new Date(b.touched || 0).getTime() - new Date(a.touched || 0).getTime()
    })
}

function matchesLeadEmail(entry, row) {
  const sentTo = Array.isArray(entry?.sent_to) ? entry.sent_to.join(' ').toLowerCase() : String(entry?.sent_to || '').toLowerCase()
  const email = String(row?.email || '').toLowerCase()
  return !!email && sentTo.includes(email)
}

function matchesLeadBusiness(value, row) {
  const left = String(value || '').trim().toLowerCase()
  const right = String(row?.business_name || '').trim().toLowerCase()
  return !!left && !!right && left === right
}

function buildLeadTimeline(row, emails, appointments, clientRecord) {
  const items = []

  for (const entry of row.history || []) {
    items.push({
      id: `history-${entry.at}-${entry.action}`,
      type: 'history',
      tone: entry.action === 'created' ? 'blue' : entry.action === 'outcome' ? 'amber' : 'grey',
      title: labelize(entry.action),
      body: entry.value,
      meta: entry.actor || 'Portal user',
      at: entry.at,
    })
  }

  for (const email of emails.filter((entry) => matchesLeadEmail(entry, row)).slice(0, 8)) {
    items.push({
      id: `email-${email.id}`,
      type: 'email',
      tone: 'blue',
      title: email.subject || 'Email sent',
      body: Array.isArray(email.sent_to) ? email.sent_to.join(', ') : email.sent_to,
      meta: email.sent_by || email.from_address || 'Portal email',
      at: email.sent_at,
    })
  }

  for (const appointment of appointments
    .filter((entry) => matchesLeadEmail({ sent_to: entry.client_email }, row) || matchesLeadBusiness(entry.client_business, row))
    .slice(0, 8)) {
    items.push({
      id: `appointment-${appointment.id}`,
      type: 'appointment',
      tone: appointment.status === 'cancelled' ? 'red' : 'green',
      title: appointment.status === 'cancelled' ? 'Call cancelled' : 'Call booked',
      body: `${formatShortDate(appointment.date)} · ${appointment.start_time} – ${appointment.end_time}${appointment.staff_name ? ` · ${appointment.staff_name}` : ''}`,
      meta: appointment.client_name || appointment.client_email || 'Appointment',
      at: appointment.created_at || `${appointment.date}T${appointment.start_time || '09:00'}:00`,
    })
  }

  if (clientRecord) {
    items.push({
      id: `client-${clientRecord.id}`,
      type: 'client',
      tone: 'green',
      title: 'Client record created',
      body: `${clientRecord.name || row.business_name} · ${clientRecord.plan || 'Starter'} · ${clientRecord.status || 'pending'}`,
      meta: clientRecord.email || 'Onboarded client',
      at: clientRecord.updated_at || clientRecord.created_at,
    })
  }

  return items
    .filter((item) => item.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

function StatCard({ label, value, hint, tone = 'var(--accent)' }) {
  return (
    <div className="metric-tile">
      <div className="metric-dot" style={{ background: `${tone}18` }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: tone, display: 'inline-block' }} />
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-hint">{hint}</div>
    </div>
  )
}

export default function Outreach() {
  const { user, isAdmin, org } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const reminderLock = useRef(new Set())
  const reminderRunRef = useRef(false)
  const [tab, setTab] = useState('contacts')
  const [rows, setRows] = useState([])
  const [emails, setEmails] = useState([])
  const [appointments, setAppointments] = useState([])
  const [clients, setClients] = useState([])
  const [bookableStaff, setBookableStaff] = useState([])
  const [staffDirectory, setStaffDirectory] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const initialFilter = FILTERS.includes(searchParams.get('filter')) ? searchParams.get('filter') : 'all'
  const [filter, setFilter] = useState(initialFilter)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewEmail, setViewEmail] = useState(null)
  const [bookingLead, setBookingLead] = useState(null)
  const [bookingForm, setBookingForm] = useState({ date: '', start_time: '10:00', duration: 30, staff_email: '' })
  const [quickNoteLead, setQuickNoteLead] = useState(null)
  const [quickNote, setQuickNote] = useState('')
  const [followUpDoneLead, setFollowUpDoneLead] = useState(null)
  const [followUpDoneForm, setFollowUpDoneForm] = useState({ outcome: 'follow_up_later', note: '', next_follow_up_date: '', clear_queue: true })
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])
  useEffect(() => {
    const nextFilter = searchParams.get('filter')
    if (FILTERS.includes(nextFilter) && nextFilter !== filter) {
      setFilter(nextFilter)
    }
  }, [searchParams, filter])

  const load = async () => {
    setLoading(true)
    const [{ data: contacts }, { data: emailLog }, { data: apptData }, { data: clientData }, { data: profileData }, { data: permData }] = await Promise.all([
      supabase.from('outreach').select('*').order('created_at', { ascending: false }),
      supabase.from('email_log').select('*').order('sent_at', { ascending: false }).limit(200),
      supabase.from('appointments').select('*').order('created_at', { ascending: false }).limit(120),
      supabase.from('clients').select('*').order('created_at', { ascending: false }).limit(120),
      supabase.from('hr_profiles').select('user_email,full_name,role,bookable').order('full_name'),
      supabase.from('user_permissions').select('user_email,bookable_staff').eq('bookable_staff', true),
    ])
    setRows(contacts || [])
    setEmails(emailLog || [])
    setAppointments(apptData || [])
    setClients(clientData || [])
    const profileMap = new Map((profileData || []).map((item) => [String(item.user_email || '').toLowerCase(), item]))
    const emailsWithAccess = new Set()
    for (const item of profileData || []) {
      if (item.bookable) emailsWithAccess.add(String(item.user_email || '').toLowerCase())
    }
    for (const item of permData || []) {
      if (item.bookable_staff) emailsWithAccess.add(String(item.user_email || '').toLowerCase())
    }
    setBookableStaff(Array.from(emailsWithAccess).map((email) => {
      const profile = profileMap.get(email)
      return {
        user_email: email,
        full_name: profile?.full_name || email,
        role: profile?.role || 'Bookable staff',
      }
    }).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')))
    setStaffDirectory((profileData || [])
      .filter((item) => item?.user_email)
      .map((item) => ({
        user_email: String(item.user_email || '').toLowerCase(),
        full_name: item.full_name || item.user_email,
        role: item.role || 'Staff',
      }))
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')))
    setLoading(false)
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ ...EMPTY, creator_department: org?.department || '' })
    setModal(true)
  }
  const openEdit = (r) => {
    setEditing(r)
    setForm({
      ...r,
      status: normalizeStatus(r.status),
      notes: r.plainNotes || '',
      outcome: r.outcome || 'none',
      follow_up_date: r.follow_up_date || '',
      assigned_to_email: r.assigned_to_email || '',
      creator_department: r.creator_department || org?.department || '',
    })
    setModal(true)
  }
  const close = () => { setModal(false); setEditing(null) }
  const sf = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const sbf = (k, v) => setBookingForm((p) => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    const nextStatus = normalizeStatus(form.status)
    const nextAssignee = String(form.assigned_to_email || editing?.assigned_to_email || '').toLowerCase().trim()
    const previousAssignee = String(editing?.assigned_to_email || '').toLowerCase().trim()
    const nextAssigneeProfile = staffDirectory.find((staffMember) => staffMember.user_email === nextAssignee)
    const noteMeta = {
      outcome: form.outcome || 'none',
      follow_up_date: form.follow_up_date || '',
      assigned_to_email: nextAssignee,
      assigned_to_name: nextAssigneeProfile?.full_name || editing?.assigned_to_name || '',
      creator_email: editing?.creator_email || user?.email || '',
      creator_department: editing?.creator_department || form.creator_department || org?.department || '',
      reminder_notice_key: editing?.reminder_notice_key || '',
      history: [
        buildHistoryEntry({
          action: editing ? 'updated' : 'created',
          value: editing ? 'Lead updated' : 'Lead added',
          actor: user?.name || user?.email || 'Portal user',
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
      status: nextStatus,
      notes: buildOutreachNotes(form.notes, noteMeta),
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      const { error } = await supabase.from('outreach').update(payload).eq('id', editing.id)
      if (error) console.error('Outreach update error:', error)
      else await logAction(user?.email, user?.name, 'outreach_updated', form.business_name, editing.id, {})
    } else {
      const { error } = await supabase.from('outreach').insert([{ ...payload, added_by: user?.name, created_at: new Date().toISOString() }])
      if (error) console.error('Outreach insert error:', error)
      else await logAction(user?.email, user?.name, 'outreach_added', form.business_name, null, {})
    }
    if (nextAssignee && nextAssignee !== previousAssignee) {
      await sendManagedNotification({
        userEmail: nextAssignee,
        userName: nextAssigneeProfile?.full_name || nextAssignee,
        category: 'general',
        type: 'info',
        title: 'New outreach follow-up assigned',
        message: `${form.business_name || form.contact_name || 'A lead'} has been assigned to you for follow-up.${form.email ? ` Contact email: ${form.email}.` : ''}`,
        link: '/outreach',
        emailSubject: `New outreach follow-up assigned — ${form.business_name || form.contact_name || 'Lead'}`,
        sentBy: user?.name || user?.email || 'Admin',
      }).catch(() => {})
    }
    setSaving(false)
    close()
    load()
  }

  const quickStatus = async (row, status) => {
    const nextStatus = normalizeStatus(status)
    const meta = buildLeadMeta(row, {
      history: [
        buildHistoryEntry({
          action: 'status',
          value: labelize(nextStatus),
          actor: user?.name || user?.email || 'Portal user',
        }),
        ...(row.history || []),
      ].slice(0, 12),
    })
    const { error } = await supabase.from('outreach').update({
      status: nextStatus,
      notes: buildOutreachNotes(row.plainNotes || '', meta),
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    if (!error) load()
  }

  const quickOutcome = async (row, outcome) => {
    const normalizedOutcome = CALL_OUTCOMES.some(([key]) => key === outcome) ? outcome : 'none'
    const statusFromOutcome = normalizedOutcome === 'converted'
      ? 'converted'
      : normalizedOutcome === 'not_interested'
        ? 'not_interested'
        : normalizedOutcome === 'interested' || normalizedOutcome === 'booked_call' || normalizedOutcome === 'proposal_requested'
          ? 'interested'
          : normalizedOutcome === 'follow_up_later' || normalizedOutcome === 'send_info' || normalizedOutcome === 'no_answer'
            ? 'follow_up'
            : normalizeStatus(row.status)

    const meta = buildLeadMeta(row, {
      outcome: normalizedOutcome,
      history: [
        buildHistoryEntry({
          action: 'outcome',
          value: labelize(normalizedOutcome),
          actor: user?.name || user?.email || 'Portal user',
        }),
        ...(row.history || []),
      ].slice(0, 12),
    })

    const { error } = await supabase.from('outreach').update({
      status: statusFromOutcome,
      notes: buildOutreachNotes(row.plainNotes || '', meta),
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)

    if (!error) load()
  }

  const quickFollowUpDate = async (row, daysAhead) => {
    const target = getLocalDateKey(new Date(Date.now() + daysAhead * 86400000))
    const meta = buildLeadMeta(row, {
      follow_up_date: target,
      history: [
        buildHistoryEntry({
          action: 'follow_up_date',
          value: target,
          actor: user?.name || user?.email || 'Portal user',
        }),
        ...(row.history || []),
      ].slice(0, 12),
    })
    const { error } = await supabase.from('outreach').update({
      status: normalizeStatus(row.status) === 'new' ? 'follow_up' : normalizeStatus(row.status),
      notes: buildOutreachNotes(row.plainNotes || '', meta),
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    if (!error) load()
  }

  const openQuickNote = (row) => {
    setQuickNoteLead(row)
    setQuickNote('')
  }

  const openFollowUpDone = (row) => {
    setFollowUpDoneLead(row)
    setFollowUpDoneForm({
      outcome: row.outcome && row.outcome !== 'none' ? row.outcome : 'follow_up_later',
      note: '',
      next_follow_up_date: '',
      clear_queue: true,
    })
  }

  const saveQuickNote = async () => {
    if (!quickNoteLead) return
    const noteText = String(quickNote || '').trim()
    if (!noteText) {
      alert('Add a note first.')
      return
    }
    const existingPlainNotes = String(quickNoteLead.plainNotes || '').trim()
    const nextPlainNotes = existingPlainNotes ? `${noteText}\n\n${existingPlainNotes}` : noteText
    const meta = {
      outcome: quickNoteLead.outcome || 'none',
      follow_up_date: quickNoteLead.follow_up_date || '',
      assigned_to_email: quickNoteLead.assigned_to_email || '',
      assigned_to_name: quickNoteLead.assigned_to_name || '',
      creator_email: quickNoteLead.creator_email || '',
      reminder_notice_key: quickNoteLead.reminder_notice_key || '',
      history: [
        buildHistoryEntry({
          action: 'note',
          value: noteText,
          actor: user?.name || user?.email || 'Portal user',
        }),
        ...(quickNoteLead.history || []),
      ].slice(0, 12),
      creator_department: quickNoteLead.creator_department || '',
    }
    const { error } = await supabase.from('outreach').update({
      notes: buildOutreachNotes(nextPlainNotes, meta),
      updated_at: new Date().toISOString(),
    }).eq('id', quickNoteLead.id)
    if (error) {
      alert('Could not save note: ' + error.message)
      return
    }
    setQuickNoteLead(null)
    setQuickNote('')
    load()
  }

  const completeFollowUp = async () => {
    if (!followUpDoneLead) return
    const outcome = FOLLOW_UP_DONE_OUTCOMES.includes(followUpDoneForm.outcome) ? followUpDoneForm.outcome : 'follow_up_later'
    const noteText = String(followUpDoneForm.note || '').trim()
    const nextDate = followUpDoneForm.clear_queue ? '' : String(followUpDoneForm.next_follow_up_date || '').trim()
    const existingPlainNotes = String(followUpDoneLead.plainNotes || '').trim()
    const completionNote = noteText ? `Follow-up completed: ${noteText}` : 'Follow-up completed'
    const nextPlainNotes = existingPlainNotes ? `${completionNote}\n\n${existingPlainNotes}` : completionNote
    const statusFromOutcome = outcome === 'converted'
      ? 'converted'
      : outcome === 'not_interested'
        ? 'not_interested'
        : outcome === 'interested' || outcome === 'booked_call' || outcome === 'proposal_requested'
          ? 'interested'
          : nextDate
            ? 'follow_up'
            : 'contacted'

    const meta = {
      outcome,
      follow_up_date: nextDate,
      assigned_to_email: followUpDoneLead.assigned_to_email || '',
      assigned_to_name: followUpDoneLead.assigned_to_name || '',
      creator_email: followUpDoneLead.creator_email || '',
      reminder_notice_key: '',
      history: [
        buildHistoryEntry({
          action: 'follow_up_done',
          value: `${labelize(outcome)}${nextDate ? ` · next follow-up ${nextDate}` : ' · queue cleared'}`,
          actor: user?.name || user?.email || 'Portal user',
        }),
        ...(followUpDoneLead.history || []),
      ].slice(0, 12),
      creator_department: followUpDoneLead.creator_department || '',
    }

    const { error } = await supabase.from('outreach').update({
      status: statusFromOutcome,
      notes: buildOutreachNotes(nextPlainNotes, meta),
      updated_at: new Date().toISOString(),
    }).eq('id', followUpDoneLead.id)

    if (error) {
      alert('Could not complete follow-up: ' + error.message)
      return
    }

    await logAction(user?.email, user?.name, 'outreach_follow_up_completed', followUpDoneLead.business_name, followUpDoneLead.id, {
      outcome,
      next_follow_up_date: nextDate || null,
      queue_cleared: !nextDate,
    }).catch(() => {})

    setFollowUpDoneLead(null)
    setFollowUpDoneForm({ outcome: 'follow_up_later', note: '', next_follow_up_date: '', clear_queue: true })
    load()
  }

  const del = async (id, name) => {
    if (!confirm('Delete ' + name + '?')) return
    await supabase.from('outreach').delete().eq('id', id)
    await logAction(user?.email, user?.name, 'outreach_deleted', name, id, {})
    load()
  }

  const assignLead = async (row, nextAssigneeEmail) => {
    const safeAssignee = String(nextAssigneeEmail || '').toLowerCase().trim()
    const staffMember = staffDirectory.find((entry) => entry.user_email === safeAssignee)
    const meta = {
      outcome: row.outcome || 'none',
      follow_up_date: row.follow_up_date || '',
      assigned_to_email: safeAssignee,
      assigned_to_name: staffMember?.full_name || '',
      creator_email: row.creator_email || user?.email || '',
      creator_department: row.creator_department || '',
      reminder_notice_key: '',
      history: [
        buildHistoryEntry({
          action: 'assigned',
          value: safeAssignee ? `Assigned to ${staffMember?.full_name || safeAssignee}` : 'Assignment cleared',
          actor: user?.name || user?.email || 'Portal user',
        }),
        ...(row.history || []),
      ].slice(0, 12),
    }

    const { error } = await supabase.from('outreach').update({
      notes: buildOutreachNotes(row.plainNotes || '', meta),
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)

    if (error) {
      alert('Assignment failed: ' + error.message)
      return
    }

    if (safeAssignee) {
      await sendManagedNotification({
        userEmail: safeAssignee,
        userName: staffMember?.full_name || safeAssignee,
        category: 'general',
        type: 'info',
        title: 'New outreach follow-up assigned',
        message: `${row.business_name || row.contact_name || 'A lead'} has been assigned to you for follow-up.${row.email ? ` Contact email: ${row.email}.` : ''}`,
        link: '/outreach',
        emailSubject: `New outreach follow-up assigned — ${row.business_name || row.contact_name || 'Lead'}`,
        sentBy: user?.name || user?.email || 'Admin',
      }).catch(() => {})
    }

    await logAction(user?.email, user?.name, 'outreach_assigned', row.business_name, row.id, { assigned_to_email: safeAssignee }).catch(() => {})
    await load()
  }

  const getClientMatch = (row) => clients.find((client) => {
    const leadEmail = String(row.email || '').toLowerCase()
    const clientEmail = String(client.email || '').toLowerCase()
    if (leadEmail && clientEmail && leadEmail === clientEmail) return true
    return matchesLeadBusiness(client.name, row)
  }) || null

  const openProposalBuilder = (row) => {
    const params = new URLSearchParams()
    if (row.business_name) params.set('business', row.business_name)
    if (row.contact_name) params.set('name', row.contact_name)
    if (row.email) params.set('email', row.email)
    if (row.phone) params.set('phone', row.phone)
    if (row.website) params.set('website', row.website)
    if (row.plainNotes) params.set('notes', row.plainNotes)
    navigate(`/proposals?${params.toString()}`)
  }

  const openBookingModal = (row) => {
    setBookingLead(row)
    setBookingForm({
      date: row.follow_up_date || getLocalDateKey(),
      start_time: '10:00',
      duration: 30,
      staff_email: bookableStaff[0]?.user_email || '',
    })
  }

  const saveAppointment = async () => {
    if (!bookingLead) return
    if (!bookingForm.date || !bookingForm.start_time || !bookingForm.staff_email) {
      alert('Choose a staff member, date, and time first.')
      return
    }

    const staffMember = bookableStaff.find((item) => item.user_email === bookingForm.staff_email)
    const duration = Number(bookingForm.duration || 30)
    const [hours, minutes] = String(bookingForm.start_time).split(':').map(Number)
    const endTotal = hours * 60 + minutes + duration
    const end_time = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`

    const conflict = appointments.find((entry) =>
      String(entry.staff_email || '').toLowerCase() === String(bookingForm.staff_email || '').toLowerCase()
      && entry.date === bookingForm.date
      && entry.start_time === bookingForm.start_time
      && entry.status !== 'cancelled'
    )
    if (conflict) {
      alert('That staff member already has a booking at that time.')
      return
    }

    const appointmentPayload = {
      client_name: bookingLead.contact_name || bookingLead.business_name,
      client_business: bookingLead.business_name || null,
      client_email: bookingLead.email || null,
      date: bookingForm.date,
      start_time: bookingForm.start_time,
      end_time,
      duration,
      staff_email: bookingForm.staff_email,
      staff_name: staffMember?.full_name || bookingForm.staff_email,
      status: 'confirmed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('appointments').insert([appointmentPayload])
    if (error) {
      alert('Booking failed: ' + error.message)
      return
    }

    const meta = buildLeadMeta(bookingLead, {
      outcome: 'booked_call',
      follow_up_date: bookingForm.date,
      history: [
        buildHistoryEntry({
          action: 'appointment',
          value: `${formatShortDate(bookingForm.date)} · ${bookingForm.start_time} with ${staffMember?.full_name || bookingForm.staff_email}`,
          actor: user?.name || user?.email || 'Portal user',
        }),
        ...(bookingLead.history || []),
      ].slice(0, 12),
    })

    await supabase.from('outreach').update({
      status: 'interested',
      notes: buildOutreachNotes(bookingLead.plainNotes || '', meta),
      updated_at: new Date().toISOString(),
    }).eq('id', bookingLead.id)

    await logAction(user?.email, user?.name, 'outreach_appointment_booked', bookingLead.business_name, bookingLead.id, appointmentPayload).catch(() => {})
    setBookingLead(null)
    load()
  }

  const convertToClient = async (row) => {
    const existing = getClientMatch(row)
    if (existing) {
      await quickOutcome(row, 'converted')
      navigate(`/clients/${existing.id}`)
      return
    }

    const payload = {
      name: row.business_name || row.contact_name || 'New Client',
      contact: row.contact_name || null,
      email: row.email || null,
      phone: row.phone || null,
      plan: 'Starter',
      status: 'pending',
      value: null,
      invoice_paid: false,
      website_url: row.website || null,
      notes: row.plainNotes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase.from('clients').insert([payload]).select('id').single()
    if (error) {
      alert('Could not convert lead: ' + error.message)
      return
    }

    await Promise.all([
      upsertClientAccount(payload),
      logClientActivity({
        clientEmail: payload.email,
        eventType: 'account_created',
        title: 'Client portal account created',
        description: `${payload.name} was added to the client portal and is ready for onboarding.`,
      }),
    ])

    const meta = {
      outcome: 'converted',
      follow_up_date: row.follow_up_date || '',
      history: [
        buildHistoryEntry({
          action: 'converted',
          value: `Client record created${data?.id ? ` (#${data.id.slice(0, 8)})` : ''}`,
          actor: user?.name || user?.email || 'Portal user',
        }),
        ...(row.history || []),
      ].slice(0, 12),
    }

    await supabase.from('outreach').update({
      status: 'converted',
      notes: buildOutreachNotes(row.plainNotes || '', meta),
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)

    await logAction(user?.email, user?.name, 'outreach_converted_to_client', row.business_name, row.id, { client_id: data?.id }).catch(() => {})
    await load()
    if (data?.id) navigate(`/clients/${data.id}`)
  }

  const enrichedRows = useMemo(() => rows.map((row) => {
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
      creator_email: parsed.meta.creator_email,
      creator_department: parsed.meta.creator_department,
      reminder_notice_key: parsed.meta.reminder_notice_key,
    }
  }), [rows])

  useEffect(() => {
    if (loading || !enrichedRows.length || reminderRunRef.current) return

    const run = async () => {
      reminderRunRef.current = true
      const today = getLocalDateKey()
      const weekStart = getLocalWeekStart()
      const noticeKey = `weekly:${weekStart}`
      const updates = []
      const staffNameMap = new Map(staffDirectory.map((member) => [member.user_email, member.full_name]))
      const digestMap = new Map()

      for (const row of enrichedRows) {
        if (!needsFollowUp(row)) continue
        const overdue = isOverdue(row)
        const due = row.follow_up_date ? row.follow_up_date <= today : overdue
        if (!due) continue
        if (row.reminder_notice_key === noticeKey) continue

        const recipients = Array.from(new Set(
          [row.assigned_to_email, row.creator_email]
            .map((value) => String(value || '').toLowerCase().trim())
            .filter(Boolean)
        ))
        if (!recipients.length) continue

        for (const recipient of recipients) {
          const lockKey = `${recipient}:${noticeKey}`
          if (reminderLock.current.has(lockKey)) continue
          if (!digestMap.has(recipient)) digestMap.set(recipient, [])
          digestMap.get(recipient).push({ ...row, overdue })
        }
      }

      for (const [recipient, rowsForRecipient] of digestMap.entries()) {
        const digestRows = rowsForRecipient
          .filter((row, index, arr) => arr.findIndex((candidate) => candidate.id === row.id) === index)
          .sort((a, b) => {
            const aDate = a.follow_up_date || '9999-12-31'
            const bDate = b.follow_up_date || '9999-12-31'
            if (aDate !== bDate) return aDate.localeCompare(bDate)
            return String(a.business_name || a.contact_name || '').localeCompare(String(b.business_name || b.contact_name || ''))
          })

        if (!digestRows.length) continue

        const lockKey = `${recipient}:${noticeKey}`
        reminderLock.current.add(lockKey)
        let updateFailed = false

        try {
          await sendManagedNotification({
            userEmail: recipient,
            userName: staffNameMap.get(recipient) || recipient,
            category: 'general',
            type: digestRows.some((row) => row.follow_up_date && row.follow_up_date < today) ? 'warning' : 'info',
            title: 'Weekly outreach follow-up digest',
            message: `${digestRows.length} outreach follow-up item${digestRows.length === 1 ? '' : 's'} need attention this week.`,
            link: '/outreach?filter=follow_up_queue',
            emailSubject: `Weekly follow-up digest — ${digestRows.length} item${digestRows.length === 1 ? '' : 's'}`,
            emailHtml: `
              <p>Hi ${(staffNameMap.get(recipient) || recipient).split(' ')[0] || 'there'},</p>
              <p>Here is your weekly outreach follow-up digest from DH Portal.</p>
              <ul>
                ${digestRows.map((row) => `
                  <li>
                    <strong>${row.business_name || row.contact_name || 'Untitled lead'}</strong>
                    ${row.follow_up_date ? ` — due ${formatShortDate(row.follow_up_date)}` : row.overdue ? ' — overdue follow-up' : ' — follow-up due'}
                    ${row.assigned_to_name ? ` — assigned to ${row.assigned_to_name}` : ''}
                    ${row.email ? ` — ${row.email}` : ''}
                  </li>
                `).join('')}
              </ul>
              <p><a href="https://staff.dhwebsiteservices.co.uk/outreach?filter=follow_up_queue" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open follow-up queue</a></p>
            `,
            sentBy: 'DH Portal',
            forceDelivery: 'email',
          })

          const updatedAt = new Date().toISOString()
          for (const row of digestRows) {
            const meta = {
              outcome: row.outcome || 'none',
              follow_up_date: row.follow_up_date || '',
              assigned_to_email: row.assigned_to_email || '',
              assigned_to_name: row.assigned_to_name || '',
              creator_email: row.creator_email || '',
              creator_department: row.creator_department || '',
              reminder_notice_key: noticeKey,
              history: [
                buildHistoryEntry({
                  action: 'reminder',
                  value: `Weekly follow-up digest emailed for week starting ${weekStart}`,
                  actor: 'DH Portal',
                }),
                ...(row.history || []),
              ].slice(0, 12),
            }

            const nextNotes = buildOutreachNotes(row.plainNotes || '', meta)
            const { error } = await supabase.from('outreach').update({
              notes: nextNotes,
              updated_at: updatedAt,
            }).eq('id', row.id)

            if (!error) {
              updates.push({
                id: row.id,
                notes: nextNotes,
                updated_at: updatedAt,
              })
            } else {
              updateFailed = true
            }
          }
        } catch {
          updateFailed = true
        }

        if (updateFailed) {
          reminderLock.current.delete(lockKey)
        }
      }

      if (updates.length) {
        const updateMap = new Map(updates.map((item) => [item.id, item]))
        setRows((current) => current.map((row) => {
          const next = updateMap.get(row.id)
          return next ? { ...row, notes: next.notes, updated_at: next.updated_at } : row
        }))
      }
    }

    run().catch(() => {}).finally(() => {
      reminderRunRef.current = false
    })
  }, [loading, enrichedRows, staffDirectory])

  const followUpQueue = useMemo(() => buildQueue(enrichedRows, emails), [enrichedRows, emails])

  const stats = useMemo(() => ({
    total: enrichedRows.length,
    queue: followUpQueue.length,
    overdue: followUpQueue.filter((row) => row.overdue).length,
    hot: enrichedRows.filter((row) => row.status === 'interested').length,
    converted: enrichedRows.filter((row) => row.status === 'converted').length,
    recent: enrichedRows.filter((row) => isRecent(row)).length,
    completedToday: enrichedRows.filter((row) => (row.history || []).some((entry) => entry.action === 'follow_up_done' && isSameLocalDay(entry.at))).length,
  }), [enrichedRows, followUpQueue])

  const filtered = useMemo(() => {
    return enrichedRows.filter((r) => {
      const q = search.toLowerCase()
      const matchQ = !q
        || r.business_name?.toLowerCase().includes(q)
        || r.contact_name?.toLowerCase().includes(q)
        || r.email?.toLowerCase().includes(q)
        || r.added_by?.toLowerCase().includes(q)
        || r.plainNotes?.toLowerCase().includes(q)
        || labelize(r.outcome).toLowerCase().includes(q)

      const matchF =
        filter === 'all'
        || (filter === 'assigned_to_me' && !!user?.email && String(r.assigned_to_email || '').toLowerCase() === String(user.email || '').toLowerCase())
        || (filter === 'due_today' && !!r.follow_up_date && r.follow_up_date <= getLocalDateKey() && needsFollowUp(r))
        || (filter === 'follow_up_queue' && needsFollowUp(r))
        || (filter === 'overdue' && isOverdue(r))
        || (filter === 'hot' && r.status === 'interested')
        || (filter === 'recent' && isRecent(r))
        || (filter === 'converted' && r.status === 'converted')
        || (filter === 'not_interested' && r.status === 'not_interested')
        || r.status === filter

      return matchQ && matchF
    })
  }, [enrichedRows, search, filter, user?.email])

  const filteredEmails = emails.filter((e) => {
    const q = search.toLowerCase()
    const sentTo = Array.isArray(e.sent_to) ? e.sent_to.join(' ') : (e.sent_to || '')
    return !q || sentTo.toLowerCase().includes(q) || e.subject?.toLowerCase().includes(q) || e.sent_by?.toLowerCase().includes(q)
  })

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Clients Contacted</h1>
          <p className="page-sub">Outreach queue, recent contact history, and follow-up actions in one place.</p>
        </div>
        {tab === 'contacts' && <button className="btn btn-primary" onClick={openAdd}>+ Add Contact</button>}
      </div>

      <div className="metric-grid outreach-mobile-hero" style={{ marginBottom: 22 }}>
        <StatCard label="Total leads" value={stats.total} hint="All outreach records in the portal" tone="var(--accent)" />
        <StatCard label="Follow-up queue" value={stats.queue} hint="Leads that still need another touch" tone="var(--amber)" />
        <StatCard label="Overdue" value={stats.overdue} hint="Follow-ups that are now late" tone="var(--red)" />
        <StatCard label="Done today" value={stats.completedToday} hint="Follow-ups cleared by the team today" tone="var(--green)" />
        <StatCard label="Hot leads" value={stats.hot} hint="Interested contacts worth prioritising" tone="var(--green)" />
        <StatCard label="Converted" value={stats.converted} hint="Handed over into live client work" tone="var(--blue)" />
      </div>

      <div className="insight-grid" style={{ marginBottom: 22 }}>
        <div className="surface-card" style={{ overflow: 'hidden' }}>
          <div className="surface-card-header">
            <div>
              <div className="section-kicker">Follow-up queue</div>
              <div className="section-title">Who should outreach chase next?</div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => setFilter('follow_up_queue')}>Open queue view</button>
          </div>

          {followUpQueue.length ? (
            followUpQueue.slice(0, 6).map((row, index) => {
              const temperature = getLeadTemperature(row)
              const age = daysSince(getTouchedAt(row))
              return (
                <div
                  key={row.id}
                  style={{
                    padding: '14px 18px',
                    borderBottom: index < Math.min(followUpQueue.length, 6) - 1 ? '1px solid var(--border)' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 14,
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{row.business_name || 'Unnamed lead'}</span>
                      <span className={`badge badge-${temperature.tone}`}>{temperature.label}</span>
                      {row.overdue ? <span className="badge badge-red">Overdue</span> : null}
                      {row.assigned_to_name ? <span className="badge badge-grey">{row.assigned_to_name}</span> : null}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.6 }}>
                      {row.contact_name || 'No contact name'} · {getLastContactMethod(row, emails)} · {age === null ? 'No activity date' : `${age} day${age === 1 ? '' : 's'} since touch`}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 8 }}>
                      Next action: <strong>{getNextAction(row)}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(row)}>Open</button>
                    <button className="btn btn-outline btn-sm" onClick={() => openFollowUpDone(row)}>Follow-up done</button>
                    <button className="btn btn-outline btn-sm" onClick={() => openBookingModal(row)}>Book call</button>
                    {row.status !== 'interested' ? <button className="btn btn-outline btn-sm" onClick={() => quickStatus(row, 'interested')}>Mark hot</button> : null}
                    {row.status !== 'follow_up' ? <button className="btn btn-outline btn-sm" onClick={() => quickStatus(row, 'follow_up')}>Set follow-up</button> : null}
                  </div>
                </div>
              )
            })
          ) : (
            <div style={{ padding: '34px 18px', textAlign: 'center', color: 'var(--faint)' }}>No leads currently need a follow-up.</div>
          )}
        </div>

        <div className="surface-card surface-card-body">
          <div className="section-kicker" style={{ marginBottom: 6 }}>Focus area</div>
          <div className="section-title" style={{ marginTop: 0, marginBottom: 10 }}>Work the right leads first</div>
          <div className="section-note" style={{ marginTop: 0, marginBottom: 14 }}>
            Outreach staff should spend most of their time on interested leads, follow-ups that are now overdue, and anyone recently contacted who still has momentum.
          </div>
          <div className="insight-pile">
            {[
              ['Interested leads', `${stats.hot} ready for a stronger push`, 'green'],
              ['Overdue follow-ups', `${stats.overdue} contacts need chasing today`, 'red'],
              ['Completed today', `${stats.completedToday} follow-ups have already been cleared`, 'blue'],
              ['Recent activity', `${stats.recent} leads touched in the last 48 hours`, 'blue'],
            ].map(([title, text, tone]) => (
              <div key={title} className="insight-pill">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className={`badge badge-${tone}`}>{title}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.5 }}>{text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="tabs">
        {[['contacts', 'Contacts'], ['emails', 'Emails Sent']].map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setSearch('') }} className={'tab' + (tab === k ? ' on' : '')}>
            {l}
          </button>
        ))}
      </div>

      <div className="toolbar-row legacy-toolbar">
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="inp" style={{ paddingLeft: 34 }} placeholder={tab === 'contacts' ? 'Search leads, people, notes...' : 'Search emails...'} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {tab === 'contacts' && (
          <div className="toolbar-chips legacy-toolbar-actions">
            {FILTERS.map((value) => (
              <button
                key={value}
                onClick={() => {
                  setFilter(value)
                  setSearchParams((current) => {
                    const next = new URLSearchParams(current)
                    next.set('filter', value)
                    return next
                  }, { replace: true })
                }}
                className={'pill' + (filter === value ? ' on' : '')}
              >
                {labelize(value)}
              </button>
            ))}
            {STATUSES.map((value) => (
              <button
                key={value}
                onClick={() => {
                  setFilter(value)
                  setSearchParams((current) => {
                    const next = new URLSearchParams(current)
                    next.set('filter', value)
                    return next
                  }, { replace: true })
                }}
                className={'pill' + (filter === value ? ' on' : '')}
              >
                {labelize(value)}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'contacts' && (
        <div className="desk-table-shell">
          {loading ? <div className="spin-wrap"><div className="spin" /></div> : (
            <>
              <div className="tbl-wrap desktop-only">
                <table className="tbl" style={{ minWidth: 1320 }}>
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Status</th>
                      <th>Temperature</th>
                      <th>Next action</th>
                      <th>Last touch</th>
                      <th>Added by</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const touched = getTouchedAt(r)
                      const age = daysSince(touched)
                      const temperature = getLeadTemperature(r)
                      const nextAction = getNextAction(r)
                      const overdue = isOverdue(r)
                      return (
                        <tr key={r.id}>
                          <td className="t-main">
                            <div style={{ fontWeight: 600 }}>{r.business_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4 }}>{r.contact_name || 'No contact'}{r.email ? ` · ${r.email}` : ''}</div>
                          </td>
                          <td>
                            <select
                              className="inp"
                              style={{ padding: '4px 8px', fontSize: 11, fontFamily: 'var(--font-mono)', width: 132, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer' }}
                              value={r.status || 'new'}
                              onChange={(e) => quickStatus(r, e.target.value)}
                            >
                              {STATUSES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
                            </select>
                          </td>
                          <td>
                            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                              <span className={`badge badge-${temperature.tone}`}>{temperature.label}</span>
                              {r.outcome && r.outcome !== 'none' ? <span className="badge badge-blue">{labelize(r.outcome)}</span> : null}
                              {r.assigned_to_name ? <span className="badge badge-grey">{r.assigned_to_name}</span> : null}
                            </div>
                          </td>
                          <td style={{ minWidth: 160 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{nextAction}</div>
                            <div style={{ fontSize: 11, color: overdue ? 'var(--red)' : 'var(--faint)', marginTop: 4 }}>
                              {r.follow_up_date
                                ? `Follow up ${new Date(`${r.follow_up_date}T12:00:00`).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}`
                                : overdue ? 'Overdue follow-up' : `${getLastContactMethod(r, emails)}${age !== null ? ` · ${age}d ago` : ''}`}
                            </div>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)' }}>{formatDateTime(touched)}</td>
                          <td>
                            {r.added_by ? (
                              <span style={{ fontSize: 12, color: 'var(--sub)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: 'var(--accent)' }}>
                                  {r.added_by.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                                </span>
                                {r.added_by}
                              </span>
                            ) : '—'}
                          </td>
                          <td>
                            <div className="table-action-row">
                              {r.phone ? <a className="btn btn-outline btn-sm" href={`tel:${r.phone}`}>Call</a> : null}
                              {r.email ? <a className="btn btn-outline btn-sm" href={`mailto:${r.email}`}>Email</a> : null}
                              <button className="btn btn-outline btn-sm" onClick={() => openQuickNote(r)}>Note</button>
                              <button className="btn btn-outline btn-sm" onClick={() => openFollowUpDone(r)}>Done</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>Edit</button>
                              <button className="btn btn-outline btn-sm" onClick={() => openProposalBuilder(r)}>Proposal</button>
                              <button className="btn btn-outline btn-sm" onClick={() => openBookingModal(r)}>Book call</button>
                              {r.status !== 'follow_up' ? <button className="btn btn-outline btn-sm" onClick={() => quickStatus(r, 'follow_up')}>Follow-up</button> : null}
                              {r.status !== 'converted' ? <button className="btn btn-outline btn-sm" onClick={() => convertToClient(r)}>Convert</button> : null}
                              <button className="btn btn-danger btn-sm" onClick={() => del(r.id, r.business_name)}>Del</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--faint)' }}>No outreach records match that view.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mobile-only" style={{ display: 'none', padding: 14 }}>
                <div className="outreach-mobile-stack">
                  {filtered.map((r) => {
                    const touched = getTouchedAt(r)
                    const age = daysSince(touched)
                    const temperature = getLeadTemperature(r)
                    const overdue = isOverdue(r)
                    const timelineItems = buildLeadTimeline(r, emails, appointments, getClientMatch(r)).slice(0, 3)
                    return (
                      <div key={`mobile-${r.id}`} className="soft-list-row outreach-mobile-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{r.business_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4 }}>{r.contact_name || 'No contact'}{r.email ? ` · ${r.email}` : ''}</div>
                          </div>
                          <span className={`badge badge-${temperature.tone}`}>{temperature.label}</span>
                        </div>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                          <span className={`badge badge-${statusColor[r.status || 'new'] || 'grey'}`}>{labelize(r.status || 'new')}</span>
                          {r.outcome && r.outcome !== 'none' ? <span className="badge badge-blue">{labelize(r.outcome)}</span> : null}
                          {r.assigned_to_name ? <span className="badge badge-grey">{r.assigned_to_name}</span> : null}
                          {overdue ? <span className="badge badge-red">Overdue</span> : null}
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.6, marginBottom: 12 }}>
                          {getNextAction(r)} · {getLastContactMethod(r, emails)}{age !== null ? ` · ${age}d ago` : ''}
                        </div>
                        <div style={{ display:'grid', gap:8, marginBottom:12 }}>
                          <div style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>Last touch</div>
                          <div style={{ fontSize:12.5, color:'var(--text)' }}>{formatDateTime(touched)}</div>
                          {r.follow_up_date ? (
                            <>
                              <div style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>Next follow-up</div>
                              <div style={{ fontSize:12.5, color: overdue ? 'var(--red)' : 'var(--text)' }}>{new Date(`${r.follow_up_date}T12:00:00`).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</div>
                            </>
                          ) : null}
                          {r.plainNotes ? (
                            <>
                              <div style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>Latest note</div>
                              <div style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.55 }}>{r.plainNotes}</div>
                            </>
                          ) : null}
                        </div>
                        {timelineItems.length ? (
                          <div style={{ display:'grid', gap:8, marginBottom:12 }}>
                            <div style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>Recent timeline</div>
                            {timelineItems.map((item) => (
                              <div key={item.id} style={{ padding:'9px 10px', border:'1px solid var(--border)', borderRadius:10, background:'var(--bg2)' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:4 }}>
                                  <span className={`badge badge-${item.tone}`}>{item.title}</span>
                                  <span style={{ fontSize:10.5, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{formatDateTime(item.at)}</span>
                                </div>
                                <div style={{ fontSize:12.5, color:'var(--text)', lineHeight:1.5 }}>{item.body}</div>
                                {item.meta ? <div style={{ fontSize:11.5, color:'var(--sub)', marginTop:4 }}>{item.meta}</div> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <div className="outreach-mobile-actions">
                          {r.phone ? <a className="btn btn-outline btn-sm" href={`tel:${r.phone}`}>Call</a> : null}
                          {r.email ? <a className="btn btn-outline btn-sm" href={`mailto:${r.email}`}>Email</a> : null}
                          <button className="btn btn-outline btn-sm" onClick={() => openQuickNote(r)}>Note</button>
                          <button className="btn btn-outline btn-sm" onClick={() => openFollowUpDone(r)}>Done</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>Edit</button>
                          <button className="btn btn-outline btn-sm" onClick={() => openProposalBuilder(r)}>Proposal</button>
                          <button className="btn btn-outline btn-sm" onClick={() => openBookingModal(r)}>Book call</button>
                          <button className="btn btn-outline btn-sm" onClick={() => quickStatus(r, 'follow_up')}>Follow-up</button>
                          <button className="btn btn-outline btn-sm" onClick={() => quickStatus(r, 'interested')}>Hot</button>
                          <button className="btn btn-outline btn-sm" onClick={() => convertToClient(r)}>Convert</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'emails' && (
        <div className="desk-table-shell">
          {loading ? <div className="spin-wrap"><div className="spin" /></div> : (
            <div className="tbl-wrap desktop-only">
              <table className="tbl" style={{ minWidth: 960 }}>
                <thead>
                  <tr>
                    <th>Sent To</th><th>Subject</th><th>From</th><th>Sent By</th><th>Date</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmails.map((e) => (
                    <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => setViewEmail(e)}>
                      <td className="t-main" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{Array.isArray(e.sent_to) ? e.sent_to[0] : e.sent_to}</td>
                      <td style={{ maxWidth: 280 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500 }}>{e.subject}</div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)' }}>{e.from_address}</td>
                      <td>
                        {e.sent_by ? (
                          <span style={{ fontSize: 12, color: 'var(--sub)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: 'var(--accent)' }}>
                              {(e.sent_by || '').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                            </span>
                            {e.sent_by}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)', whiteSpace: 'nowrap' }}>
                        {e.sent_at ? new Date(e.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={(ev) => { ev.stopPropagation(); setViewEmail(e) }}>View</button>
                      </td>
                    </tr>
                  ))}
                  {filteredEmails.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--faint)' }}>No emails logged yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {!loading ? (
            <div className="mobile-only" style={{ display:'none', padding:14 }}>
              <div className="outreach-mobile-stack">
                {filteredEmails.map((e) => (
                  <button
                    key={`mobile-email-${e.id}`}
                    onClick={() => setViewEmail(e)}
                    className="soft-list-row outreach-mobile-card"
                    style={{ textAlign:'left', width:'100%' }}
                  >
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:6, lineHeight:1.4 }}>{e.subject}</div>
                    <div style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.6, marginBottom:10 }}>
                      {Array.isArray(e.sent_to) ? e.sent_to[0] : e.sent_to}
                    </div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <span className="badge badge-blue">{e.sent_by || 'Portal'}</span>
                      <span className="badge badge-grey">{e.sent_at ? new Date(e.sent_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : 'No date'}</span>
                    </div>
                  </button>
                ))}
                {!filteredEmails.length ? <div style={{ textAlign:'center', padding:24, color:'var(--faint)' }}>No emails logged yet</div> : null}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {viewEmail && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
          <div onClick={() => setViewEmail(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: 560, maxWidth: '95vw', height: '100vh', background: 'var(--card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.15)', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 8, lineHeight: 1.3 }}>{viewEmail.subject}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[['To', Array.isArray(viewEmail.sent_to) ? viewEmail.sent_to.join(', ') : viewEmail.sent_to], ['From', viewEmail.from_address], ['Sent by', viewEmail.sent_by], ['Date', viewEmail.sent_at ? new Date(viewEmail.sent_at).toLocaleString('en-GB') : '—']].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                      <span style={{ color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', width: 50, flexShrink: 0, paddingTop: 1 }}>{l}</span>
                      <span style={{ color: 'var(--sub)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setViewEmail(null)} style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <div style={{ flex: 1, padding: '20px 24px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Message</div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: 'var(--bg2)', borderRadius: 10, padding: '16px 20px' }}>
                {viewEmail.body}
              </div>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <Modal
          title={editing ? 'Edit Contact' : 'Add Contact'}
          onClose={close}
          width={editing ? 980 : undefined}
          footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: editing ? 'minmax(0,1.15fr) minmax(280px,0.85fr)' : '1fr', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="fg">
              <div><label className="lbl">Business Name</label><input className="inp" value={form.business_name} onChange={(e) => sf('business_name', e.target.value)} placeholder="Acme Ltd" /></div>
              <div><label className="lbl">Contact Name</label><input className="inp" value={form.contact_name} onChange={(e) => sf('contact_name', e.target.value)} placeholder="John Smith" /></div>
              <div><label className="lbl">Email</label><input className="inp" type="email" value={form.email} onChange={(e) => sf('email', e.target.value)} /></div>
              <div><label className="lbl">Phone</label><input className="inp" value={form.phone} onChange={(e) => sf('phone', e.target.value)} /></div>
              <div><label className="lbl">Website</label><input className="inp" value={form.website} onChange={(e) => sf('website', e.target.value)} placeholder="https://" /></div>
              <div>
                <label className="lbl">Department</label>
                <input className="inp" value={form.creator_department || org?.department || 'No department assigned'} readOnly />
              </div>
              <div><label className="lbl">Status</label>
                <select className="inp" value={form.status} onChange={(e) => sf('status', e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
                </select>
              </div>
              <div><label className="lbl">Call outcome</label>
                <select className="inp" value={form.outcome} onChange={(e) => sf('outcome', e.target.value)}>
                  {CALL_OUTCOMES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
              <div><label className="lbl">Next follow-up date</label><input className="inp" type="date" value={form.follow_up_date} onChange={(e) => sf('follow_up_date', e.target.value)} /></div>
              {isAdmin ? (
                <div><label className="lbl">Assign follow-up to</label>
                  <select className="inp" value={form.assigned_to_email || ''} onChange={(e) => sf('assigned_to_email', e.target.value)}>
                    <option value="">Unassigned</option>
                    {staffDirectory.map((member) => <option key={member.user_email} value={member.user_email}>{member.full_name}</option>)}
                  </select>
                </div>
              ) : null}
            </div>
              {!editing && (
                <div style={{ padding: '8px 12px', background: 'var(--bg2)', borderRadius: 7, fontSize: 13, color: 'var(--sub)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Added by</span>
                  <span style={{ fontWeight: 500, color: 'var(--text)' }}>{user?.name}</span>
                </div>
              )}
              <div><label className="lbl">Notes</label><textarea className="inp" rows={4} value={form.notes} onChange={(e) => sf('notes', e.target.value)} style={{ resize: 'vertical' }} placeholder="What happened on the call? What should happen next?" /></div>
              {editing ? (
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {[
                    ['no_answer', 'No answer'],
                    ['follow_up_later', 'Follow up later'],
                    ['send_info', 'Send info'],
                    ['booked_call', 'Booked call'],
                  ].map(([key, label]) => (
                    <button key={key} type="button" className="btn btn-outline btn-sm" onClick={() => quickOutcome(editing, key)}>{label}</button>
                  ))}
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => quickFollowUpDate(editing, 1)}>Tomorrow</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => quickFollowUpDate(editing, 3)}>+3 days</button>
                </div>
              ) : null}
            </div>
            {editing ? (
              <div style={{ display:'grid', gap:12 }}>
                <div className="card" style={{ padding:'14px 16px' }}>
                  <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Lead actions</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => openProposalBuilder(editing)}>Send proposal</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => openBookingModal(editing)}>Book appointment</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => convertToClient(editing)}>Convert to client</button>
                  </div>
                  {isAdmin ? (
                    <div style={{ marginTop:12 }}>
                      <div className="lbl" style={{ marginBottom:8 }}>Assignment</div>
                      <select className="inp" value={editing.assigned_to_email || ''} onChange={(e) => assignLead(editing, e.target.value)} style={{ maxWidth:280 }}>
                        <option value="">Unassigned</option>
                        {staffDirectory.map((member) => <option key={member.user_email} value={member.user_email}>{member.full_name}</option>)}
                      </select>
                    </div>
                  ) : null}
                  {getClientMatch(editing) ? (
                    <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:10 }}>
                      Already linked to client record <strong style={{ color:'var(--text)' }}>{getClientMatch(editing)?.name}</strong>.
                    </div>
                  ) : null}
                </div>
                <div className="card" style={{ padding:'14px 16px' }}>
                  <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Lead timeline</div>
                  <div style={{ display:'grid', gap:10, maxHeight:360, overflowY:'auto' }}>
                    {buildLeadTimeline(editing, emails, appointments, getClientMatch(editing)).slice(0, 12).map((item) => (
                      <div key={item.id} style={{ padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, background:'var(--bg2)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                          <span className={`badge badge-${item.tone}`}>{item.title}</span>
                          <span style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{formatDateTime(item.at)}</span>
                        </div>
                        <div style={{ fontSize:12.5, color:'var(--text)', lineHeight:1.55 }}>{item.body}</div>
                        {item.meta ? <div style={{ fontSize:11.5, color:'var(--sub)', marginTop:5 }}>{item.meta}</div> : null}
                      </div>
                    ))}
                    {!buildLeadTimeline(editing, emails, appointments, getClientMatch(editing)).length ? (
                      <div style={{ color:'var(--faint)', fontSize:12.5 }}>No timeline items yet.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Modal>
      )}

      {bookingLead ? (
        <Modal
          title={`Book call for ${bookingLead.business_name || bookingLead.contact_name || 'lead'}`}
          onClose={() => setBookingLead(null)}
          footer={<><button className="btn btn-outline" onClick={() => setBookingLead(null)}>Cancel</button><button className="btn btn-primary" onClick={saveAppointment}>Save booking</button></>}
        >
          <div style={{ display:'grid', gap:12 }}>
            <div style={{ padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, background:'var(--bg2)', fontSize:13, color:'var(--sub)' }}>
              {bookingLead.contact_name || 'No contact name'}{bookingLead.email ? ` · ${bookingLead.email}` : ''}{bookingLead.phone ? ` · ${bookingLead.phone}` : ''}
            </div>
            <div className="fg">
              <div><label className="lbl">Staff member</label>
                <select className="inp" value={bookingForm.staff_email} onChange={(e) => sbf('staff_email', e.target.value)}>
                  <option value="">Select staff</option>
                  {bookableStaff.map((member) => <option key={member.user_email} value={member.user_email}>{member.full_name}</option>)}
                </select>
              </div>
              <div><label className="lbl">Date</label><input className="inp" type="date" value={bookingForm.date} onChange={(e) => sbf('date', e.target.value)} /></div>
              <div><label className="lbl">Start time</label><input className="inp" type="time" step="1800" value={bookingForm.start_time} onChange={(e) => sbf('start_time', e.target.value)} /></div>
              <div><label className="lbl">Duration</label>
                <select className="inp" value={bookingForm.duration} onChange={(e) => sbf('duration', Number(e.target.value))}>
                  {[30, 45, 60].map((mins) => <option key={mins} value={mins}>{mins} mins</option>)}
                </select>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {quickNoteLead ? (
        <Modal
          title={`Log note for ${quickNoteLead.business_name || quickNoteLead.contact_name || 'lead'}`}
          onClose={() => { setQuickNoteLead(null); setQuickNote('') }}
          footer={<><button className="btn btn-outline" onClick={() => { setQuickNoteLead(null); setQuickNote('') }}>Cancel</button><button className="btn btn-primary" onClick={saveQuickNote}>Save note</button></>}
        >
          <div style={{ display:'grid', gap:12 }}>
            <div style={{ padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, background:'var(--bg2)', fontSize:13, color:'var(--sub)' }}>
              {quickNoteLead.contact_name || 'No contact name'}{quickNoteLead.email ? ` · ${quickNoteLead.email}` : ''}{quickNoteLead.phone ? ` · ${quickNoteLead.phone}` : ''}
            </div>
            <div>
              <label className="lbl">Quick note</label>
              <textarea
                className="inp"
                rows={5}
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                style={{ resize:'vertical' }}
                placeholder="Log the latest call, voicemail, objection, or next step..."
              />
            </div>
          </div>
        </Modal>
      ) : null}

      {followUpDoneLead ? (
        <Modal
          title={`Follow-up done for ${followUpDoneLead.business_name || followUpDoneLead.contact_name || 'lead'}`}
          onClose={() => {
            setFollowUpDoneLead(null)
            setFollowUpDoneForm({ outcome: 'follow_up_later', note: '', next_follow_up_date: '', clear_queue: true })
          }}
          footer={<><button className="btn btn-outline" onClick={() => {
            setFollowUpDoneLead(null)
            setFollowUpDoneForm({ outcome: 'follow_up_later', note: '', next_follow_up_date: '', clear_queue: true })
          }}>Cancel</button><button className="btn btn-primary" onClick={completeFollowUp}>Save follow-up</button></>}
        >
          <div style={{ display:'grid', gap:12 }}>
            <div style={{ padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, background:'var(--bg2)', fontSize:13, color:'var(--sub)' }}>
              {followUpDoneLead.contact_name || 'No contact name'}{followUpDoneLead.email ? ` · ${followUpDoneLead.email}` : ''}{followUpDoneLead.phone ? ` · ${followUpDoneLead.phone}` : ''}
            </div>
            <div>
              <label className="lbl">Outcome</label>
              <select className="inp" value={followUpDoneForm.outcome} onChange={(e) => setFollowUpDoneForm((current) => ({ ...current, outcome: e.target.value }))}>
                {CALL_OUTCOMES.filter(([key]) => FOLLOW_UP_DONE_OUTCOMES.includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Quick note</label>
              <textarea
                className="inp"
                rows={4}
                value={followUpDoneForm.note}
                onChange={(e) => setFollowUpDoneForm((current) => ({ ...current, note: e.target.value }))}
                style={{ resize:'vertical' }}
                placeholder="What happened on the follow-up?"
              />
            </div>
            <label style={{ display:'flex', alignItems:'flex-start', gap:12, cursor:'pointer', padding:'12px 14px', borderRadius:8, border:`1px solid ${followUpDoneForm.clear_queue ? 'var(--green)' : 'var(--border)'}`, background:followUpDoneForm.clear_queue ? 'var(--green-bg)' : 'transparent' }}>
              <input
                type="checkbox"
                checked={followUpDoneForm.clear_queue}
                onChange={(e) => setFollowUpDoneForm((current) => ({
                  ...current,
                  clear_queue: e.target.checked,
                  next_follow_up_date: e.target.checked ? '' : current.next_follow_up_date,
                }))}
                style={{ width:18, height:18, accentColor:'var(--green)', flexShrink:0, marginTop:1 }}
              />
              <span style={{ fontSize:13, lineHeight:1.6, color:'var(--text)' }}>
                Clear this lead from the active follow-up queue
              </span>
            </label>
            {!followUpDoneForm.clear_queue ? (
              <div>
                <label className="lbl">Next follow-up date</label>
                <input className="inp" type="date" value={followUpDoneForm.next_follow_up_date} onChange={(e) => setFollowUpDoneForm((current) => ({ ...current, next_follow_up_date: e.target.value }))} />
                <div style={{ fontSize:12, color:'var(--sub)', marginTop:6 }}>Leave this lead in the queue and set the next chase date.</div>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
