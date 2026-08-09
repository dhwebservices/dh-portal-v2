import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../utils/supabase'
import { normalizePortalPhone, sendPortalSms } from '../utils/sms'
import { fetchSmsLogs } from '../utils/smsLogs'
import { useAuth } from '../contexts/AuthContext'
import { Button, FormField, FormLabel, FormInput, FormSelect, StatusBadge } from '../components/ds'

const DS_CARD = { background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)' }

const TEMPLATE_OPTIONS = [
  {
    key: 'portal_update',
    label: 'Portal update',
    category: 'general',
    body: 'DH Portal update: there is a new update waiting for you in the staff portal.',
  },
  {
    key: 'contract_updated',
    label: 'Contract updated',
    category: 'hr',
    body: 'DH Portal: your contract record has been updated. Please review it in the staff portal.',
  },
  {
    key: 'onboarding_ready',
    label: 'Onboarding ready',
    category: 'hr',
    body: 'DH Portal: your onboarding pack is ready for review. Please open the portal today.',
  },
  {
    key: 'outreach_assigned',
    label: 'Outreach assigned',
    category: 'tasks',
    body: 'DH Portal: new outreach work has been assigned to you. Open the portal to review the brief.',
  },
  {
    key: 'department_notice',
    label: 'Department notice',
    category: 'general',
    body: 'DH Portal: there is a department update waiting for you in the portal.',
  },
  {
    key: 'custom',
    label: 'Custom message',
    category: 'general',
    body: '',
  },
]

function normalizeEmail(value = '') {
  return String(value || '').toLowerCase().trim()
}

function parseManualRecipients(raw = '') {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [first = '', second = '', third = ''] = line.split(',').map((part) => part.trim())
      if (!second) {
        return {
          id: `manual-${index}`,
          name: '',
          phone: first,
          email: '',
          department: 'Manual',
          source: 'manual',
        }
      }
      return {
        id: `manual-${index}`,
        name: first,
        phone: second,
        email: third,
        department: 'Manual',
        source: 'manual',
      }
    })
    .filter((recipient) => normalizePortalPhone(recipient.phone))
}

export default function SmsCentre() {
  const { user } = useAuth()
  const [staff, setStaff] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [templateKey, setTemplateKey] = useState('portal_update')
  const [category, setCategory] = useState('general')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [selectedDepartments, setSelectedDepartments] = useState([])
  const [selectedStaff, setSelectedStaff] = useState([])
  const [manualRecipients, setManualRecipients] = useState('')
  const [portalLink, setPortalLink] = useState('/notifications')
  const [status, setStatus] = useState({ type: '', text: '' })

  const loadSmsLogs = async () => {
    const rows = await fetchSmsLogs(12)
    setLogs(rows)
  }

  useEffect(() => {
    let mounted = true
    Promise.all([
      supabase.from('hr_profiles').select('id,user_email,full_name,department,role,phone').order('full_name'),
      fetchSmsLogs(12),
    ]).then(([staffResult, logsResult]) => {
      if (!mounted) return
      const nextStaff = (staffResult.data || [])
        .map((row) => ({
          id: row.id || row.user_email,
          email: normalizeEmail(row.user_email),
          name: String(row.full_name || row.user_email || '').trim(),
          department: String(row.department || 'Unassigned').trim(),
          role: String(row.role || 'Staff').trim(),
          phone: normalizePortalPhone(row.phone),
        }))
        .filter((row) => row.email && row.phone)
      setStaff(nextStaff)
      setLogs(logsResult || [])
      setLoading(false)
    }).catch((error) => {
      console.error('SMS centre load error:', error)
      if (!mounted) return
      setStatus({ type: 'error', text: 'Could not load staff SMS records right now.' })
      setLoading(false)
    })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const template = TEMPLATE_OPTIONS.find((item) => item.key === templateKey) || TEMPLATE_OPTIONS[0]
    setCategory(template.category)
    setMessage((current) => {
      if (current && template.key === 'custom') return current
      return template.body
    })
  }, [templateKey])

  const departments = useMemo(() => [...new Set(staff.map((person) => person.department).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [staff])

  const filteredStaff = useMemo(() => {
    return staff.filter((person) => departmentFilter === 'all' || person.department === departmentFilter)
  }, [staff, departmentFilter])

  const selectedRecipients = useMemo(() => {
    const byDepartment = staff.filter((person) => selectedDepartments.includes(person.department))
    const byStaff = staff.filter((person) => selectedStaff.includes(person.email))
    const manual = parseManualRecipients(manualRecipients)
    const deduped = new Map()

    ;[...byDepartment, ...byStaff, ...manual].forEach((recipient) => {
      const phone = normalizePortalPhone(recipient.phone)
      if (!phone) return
      if (!deduped.has(phone)) {
        deduped.set(phone, {
          phone,
          name: recipient.name || '',
          email: normalizeEmail(recipient.email),
          department: recipient.department || '',
          source: recipient.source || 'staff',
        })
      }
    })

    return [...deduped.values()]
  }, [manualRecipients, selectedDepartments, selectedStaff, staff])

  const smsSegments = Math.max(1, Math.ceil((message || '').trim().length / 160))

  const toggleDepartment = (department) => {
    setSelectedDepartments((current) => current.includes(department)
      ? current.filter((item) => item !== department)
      : [...current, department])
  }

  const toggleStaff = (email) => {
    setSelectedStaff((current) => current.includes(email)
      ? current.filter((item) => item !== email)
      : [...current, email])
  }

  const handleSend = async () => {
    if (!selectedRecipients.length) {
      setStatus({ type: 'error', text: 'Select at least one staff member, department, or manual phone number.' })
      return
    }
    if (!String(message || '').trim()) {
      setStatus({ type: 'error', text: 'Write the SMS message before sending.' })
      return
    }

    setSending(true)
    setStatus({ type: '', text: '' })
    try {
      const result = await sendPortalSms({
        recipients: selectedRecipients,
        message,
        category,
        link: portalLink,
        sentByEmail: user?.email || '',
        sentByName: user?.name || user?.email || '',
        audienceType: selectedDepartments.length ? 'department_mix' : selectedStaff.length ? 'staff_selection' : 'manual',
        metadata: {
          template_key: templateKey,
          selected_departments: selectedDepartments,
          selected_staff_count: selectedStaff.length,
        },
      })

      await loadSmsLogs()
      setStatus({ type: 'success', text: `Sent ${result.count || selectedRecipients.length} SMS update${(result.count || selectedRecipients.length) === 1 ? '' : 's'}.` })
    } catch (error) {
      console.error('SMS centre send error:', error)
      setStatus({ type: 'error', text: error.message || 'SMS sending failed.' })
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>SMS Centre</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>One-way staff alerts using an approved alpha-tag sender ID</p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.15fr) minmax(320px,0.85fr)', gap:20 }}>
        <div style={{ display:'grid', gap:20 }}>
          <div style={{ ...DS_CARD, padding:20, display:'grid', gap:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:14, flexWrap:'wrap', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--color-text-tertiary)' }}>Compose</div>
                <div style={{ fontSize:22, fontWeight:600, color:'var(--color-text-primary)', marginTop:4 }}>Staff SMS broadcast</div>
                <div style={{ fontSize:13, color:'var(--color-text-secondary)', marginTop:6, lineHeight:1.6, maxWidth:560 }}>
                  Use this for operational alerts like onboarding ready, contract updated, outreach assigned, or custom department-wide instructions.
                </div>
              </div>
              <div style={{ padding:'12px 14px', border:'1px solid var(--color-border)', borderRadius:14, background:'var(--color-gray-50)', minWidth:220 }}>
                <div style={{ fontSize:11, color:'var(--color-text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Delivery rules</div>
                <div style={{ fontSize:13, color:'var(--color-text-primary)', marginTop:8, lineHeight:1.55 }}>
                  Alpha tag only.
                  <br />
                  No SMS replies.
                  <br />
                  Best for urgent operational updates.
                </div>
              </div>
            </div>

            <FormField>
              <FormLabel>Message type</FormLabel>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
                {TEMPLATE_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setTemplateKey(option.key)}
                    style={{
                      padding:'12px 14px',
                      borderRadius:12,
                      border:`1px solid ${templateKey === option.key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: templateKey === option.key ? 'var(--color-blue-50)' : 'var(--color-bg-surface)',
                      textAlign:'left',
                    }}
                  >
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{option.label}</div>
                    <div style={{ fontSize:11, color:'var(--color-text-secondary)', marginTop:4 }}>{option.category}</div>
                  </button>
                ))}
              </div>
            </FormField>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16 }}>
              <FormField>
                <FormLabel>Category</FormLabel>
                <FormSelect value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="general">General updates</option>
                  <option value="urgent">Urgent / admin</option>
                  <option value="hr">HR updates</option>
                  <option value="tasks">Tasks</option>
                  <option value="schedule">Schedule</option>
                  <option value="appointments">Appointments</option>
                </FormSelect>
              </FormField>
              <FormField>
                <FormLabel>Portal link</FormLabel>
                <FormInput value={portalLink} onChange={(event) => setPortalLink(event.target.value)} placeholder="/notifications" />
              </FormField>
            </div>

            <div>
              <FormField>
                <FormLabel>Message</FormLabel>
                <textarea
                  className="ds-form-input"
                  rows={7}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Write the SMS body here..."
                  style={{ resize:'vertical', lineHeight:1.6, padding:'8px 12px' }}
                />
              </FormField>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginTop:8, fontSize:12, color:'var(--color-text-secondary)' }}>
                <span>{String(message || '').trim().length} characters</span>
                <span>Approx. {smsSegments} SMS segment{smsSegments === 1 ? '' : 's'}</span>
              </div>
            </div>

            {status.text ? (
              <div style={{
                padding:'12px 14px',
                borderRadius:10,
                border:`1px solid ${status.type === 'error' ? 'var(--color-red-500)' : 'var(--color-green-500)'}`,
                background: status.type === 'error' ? 'var(--color-red-50)' : 'var(--color-green-50)',
                color: status.type === 'error' ? 'var(--color-red-500)' : 'var(--color-green-500)',
                fontSize:13,
              }}>
                {status.text}
              </div>
            ) : null}

            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ fontSize:13, color:'var(--color-text-secondary)' }}>
                Sending to <strong style={{ color:'var(--color-text-primary)' }}>{selectedRecipients.length}</strong> recipient{selectedRecipients.length === 1 ? '' : 's'} from your configured alpha tag.
              </div>
              <Button variant="primary" onClick={handleSend} disabled={sending}>
                {sending ? 'Sending SMS...' : 'Send SMS update'}
              </Button>
            </div>
          </div>

          <div style={{ ...DS_CARD, padding:20, display:'grid', gap:16 }}>
            <div>
              <div style={{ fontSize:18, fontWeight:600, color:'var(--color-text-primary)' }}>Audience</div>
              <div style={{ fontSize:13, color:'var(--color-text-secondary)', marginTop:6 }}>
                Mix departments, individual staff, and manual phone entries in the same send. Duplicate numbers are removed automatically.
              </div>
            </div>

            <FormField>
              <FormLabel>Departments</FormLabel>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {departments.map((department) => {
                  const active = selectedDepartments.includes(department)
                  return (
                    <button
                      key={department}
                      type="button"
                      onClick={() => toggleDepartment(department)}
                      style={{
                        padding:'9px 12px',
                        borderRadius:999,
                        border:`1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        background: active ? 'var(--color-blue-50)' : 'var(--color-gray-50)',
                        color: active ? 'var(--color-primary)' : 'var(--color-text-primary)',
                        fontSize:12,
                        fontWeight:600,
                      }}
                    >
                      {department}
                    </button>
                  )
                })}
              </div>
            </FormField>

            <div>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:8, flexWrap:'wrap' }}>
                <FormLabel>Staff with mobile numbers</FormLabel>
                <FormSelect style={{ width:220 }} value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
                  <option value="all">All departments</option>
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </FormSelect>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10, maxHeight:300, overflow:'auto', paddingRight:4 }}>
                {filteredStaff.map((person) => {
                  const active = selectedStaff.includes(person.email)
                  return (
                    <button
                      key={person.email}
                      type="button"
                      onClick={() => toggleStaff(person.email)}
                      style={{
                        padding:'12px 14px',
                        borderRadius:14,
                        border:`1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        background: active ? 'var(--color-blue-50)' : 'var(--color-bg-surface)',
                        textAlign:'left',
                      }}
                    >
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{person.name}</div>
                      <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>{person.role} · {person.department}</div>
                      <div style={{ fontSize:11, color:'var(--color-text-tertiary)', marginTop:6, fontFamily:'var(--font-mono)' }}>{person.phone}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            <FormField>
              <FormLabel>Manual numbers</FormLabel>
              <textarea
                className="ds-form-input"
                rows={5}
                value={manualRecipients}
                onChange={(event) => setManualRecipients(event.target.value)}
                placeholder={'One number per line\nName, 07700 000000, person@dhwebsiteservices.co.uk'}
                style={{ resize:'vertical', lineHeight:1.6, padding:'8px 12px' }}
              />
            </FormField>
          </div>
        </div>

        <div style={{ display:'grid', gap:20 }}>
          <div style={{ ...DS_CARD, padding:20 }}>
            <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--color-text-tertiary)', marginBottom:6 }}>Preview</div>
            <div style={{ fontSize:18, fontWeight:600, color:'var(--color-text-primary)', marginBottom:12 }}>Recipient summary</div>
            <div style={{ display:'grid', gap:10 }}>
              {selectedRecipients.length === 0 ? (
                <div style={{ padding:'14px', border:'1px dashed var(--color-border)', borderRadius:12, color:'var(--color-text-secondary)', fontSize:13 }}>
                  No recipients selected yet.
                </div>
              ) : selectedRecipients.map((recipient) => (
                <div key={`${recipient.phone}-${recipient.email || recipient.name}`} style={{ padding:'12px 14px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{recipient.name || recipient.phone}</div>
                  <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>{recipient.department || 'No department'}</div>
                  <div style={{ fontSize:11, color:'var(--color-text-tertiary)', marginTop:6, fontFamily:'var(--font-mono)' }}>{recipient.phone}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...DS_CARD, padding:20 }}>
            <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--color-text-tertiary)', marginBottom:6 }}>Recent SMS</div>
            <div style={{ fontSize:18, fontWeight:600, color:'var(--color-text-primary)', marginBottom:12 }}>Latest sends</div>
            <div style={{ display:'grid', gap:10 }}>
              {logs.length === 0 ? (
                <div style={{ padding:'14px', border:'1px dashed var(--color-border)', borderRadius:12, color:'var(--color-text-secondary)', fontSize:13 }}>
                  No SMS logs found yet.
                </div>
              ) : logs.map((row, index) => (
                <div key={`${row.created_at}-${row.recipient_phone}-${index}`} style={{ padding:'12px 14px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', marginBottom:6 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{row.recipient_name || row.recipient_phone}</div>
                    <StatusBadge variant="info">{row.category || 'general'}</StatusBadge>
                  </div>
                  <div style={{ fontSize:12, color:'var(--color-text-secondary)', lineHeight:1.5 }}>{row.message}</div>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginTop:8, fontSize:11, color:'var(--color-text-tertiary)', fontFamily:'var(--font-mono)' }}>
                    <span>{row.sender_id || 'Alpha tag'}</span>
                    <span>{row.status || 'queued'} · {new Date(row.created_at).toLocaleString('en-GB')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
