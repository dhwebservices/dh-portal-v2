import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { sendEmail } from '../utils/email'
import { useAuth } from '../contexts/AuthContext'
import { loadActivePortalStaffAudience } from '../utils/staffAudience'
import { Button, FormField, FormLabel, FormInput, FormSelect, Alert } from '../components/ds'

const FROM_OPTIONS = [
  { value: 'clients', label: 'Client Services', address: 'clients@dhwebsiteservices.co.uk' },
  { value: 'noreply', label: 'No Reply',         address: 'noreply@dhwebsiteservices.co.uk' },
  { value: 'user',    label: 'My Address',       address: null }, // filled dynamically
]

export default function SendEmail() {
  const { user } = useAuth()
  const [outreach,   setOutreach]   = useState([])
  const [clients,    setClients]    = useState([])
  const [staff,      setStaff]      = useState([])
  const [templates,  setTemplates]  = useState([])
  const [form, setForm] = useState({ to: '', subject: '', body: '', template_id: '', from_key: 'clients' })
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    supabase.from('outreach').select('business_name,contact_email,contact_name')
      .not('contact_email', 'is', null).order('business_name')
      .then(({ data }) => setOutreach(data || []))
    supabase.from('clients').select('name,email').order('name')
      .then(({ data }) => setClients(data || []))
    loadActivePortalStaffAudience()
      .then((rows) => setStaff(rows || []))
      .catch(() => setStaff([]))
    supabase.from('email_templates').select('*').order('name')
      .then(({ data }) => setTemplates(data || []))
  }, [])

  const applyTemplate = (id) => {
    const t = templates.find(t => t.id === id)
    if (t) setForm(p => ({ ...p, subject: t.subject || '', body: t.body || '', template_id: id }))
  }

  const fromOptions = FROM_OPTIONS.map(o =>
    o.value === 'user' ? { ...o, address: user?.email || '' } : o
  )

  const selectedFrom = fromOptions.find(o => o.value === form.from_key) || fromOptions[0]

  const send = async () => {
    if (!form.to || !form.subject || !form.body) { setError('Please fill in all fields'); return }
    setSending(true); setError('')
    try {
      const result = await sendEmail('send_email', {
        to: form.to,
        subject: form.subject,
        html: form.body.replace(/\n/g, '<br/>'),
        text: form.body,
        from_name: 'DH Website Services — ' + selectedFrom.label,
        from_email: selectedFrom.address,
        sent_by: user?.name || user?.email,
        sent_by_email: user?.email,
        log_email: true,
        log_body: form.body,
        log_from_address: 'DH Website Services <' + selectedFrom.address + '>',
        template_id: form.template_id || null,
      })
      if (result.ok) {
        // Mark outreach contact as contacted
        const match = outreach.find(o => o.contact_email === form.to)
        if (match) {
          await supabase.from('outreach')
            .update({ last_contacted: new Date().toISOString(), status: 'contacted' })
            .eq('contact_email', form.to)
        }
        setSent(true)
        setForm({ to: '', subject: '', body: '', template_id: '', from_key: form.from_key })
        setTimeout(() => setSent(false), 4000)
      } else {
        setError('Failed: ' + (result?.error || 'Unable to send email'))
      }
    } catch (e) { setError('Network error: ' + e.message) }
    setSending(false)
  }

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Send Email</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Send outreach or client emails</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* From */}
          <FormField>
            <FormLabel>From</FormLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              {fromOptions.map(o => (
                <button key={o.value} onClick={() => sf('from_key', o.value)}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 'var(--border-radius-md)', border: '1px solid ' + (form.from_key === o.value ? 'var(--color-primary)' : 'var(--color-border)'), background: form.from_key === o.value ? 'var(--color-blue-50)' : 'var(--color-bg-surface)', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: form.from_key === o.value ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>{o.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{o.value === 'user' ? (user?.email || '—') : o.address}</div>
                </button>
              ))}
            </div>
          </FormField>

          {/* To */}
          <FormField>
            <FormLabel>To</FormLabel>
            <FormInput value={form.to} onChange={e => sf('to', e.target.value)}
              placeholder="email@example.com" type="email" style={{ marginBottom: 6, width: '100%' }}/>
            <FormSelect value="" onChange={e => sf('to', e.target.value)}>
              <option value="">— Or pick a contact —</option>
              {outreach.length > 0 && (
                <optgroup label="📋 Outreach Contacts">
                  {outreach.map(o => (
                    <option key={o.contact_email} value={o.contact_email}>
                      {o.contact_name ? o.contact_name + ' — ' : ''}{o.business_name} ({o.contact_email})
                    </option>
                  ))}
                </optgroup>
              )}
              {clients.length > 0 && (
                <optgroup label="👤 Clients">
                  {clients.map(c => (
                    <option key={c.email} value={c.email}>{c.name} ({c.email})</option>
                  ))}
                </optgroup>
              )}
              {staff.length > 0 && (
                <optgroup label="🧑 Staff">
                  {staff.map(member => (
                    <option key={member.email} value={member.email}>
                      {member.name} ({member.email}){member.role ? ` — ${member.role}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </FormSelect>
          </FormField>

          {/* Subject */}
          <FormField>
            <FormLabel>Subject</FormLabel>
            <FormInput value={form.subject} onChange={e => sf('subject', e.target.value)} placeholder="Subject line"/>
          </FormField>

          {/* Body */}
          <FormField>
            <FormLabel>Message</FormLabel>
            <textarea className="ds-form-input" rows={14} value={form.body} onChange={e => sf('body', e.target.value)}
              placeholder="Write your message..." style={{ resize: 'vertical', lineHeight: 1.7, padding: '8px 12px' }}/>
          </FormField>

          {error && <Alert variant="warning">{error}</Alert>}
          {sent  && <Alert variant="info">✓ Email sent successfully</Alert>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button variant="primary" onClick={send} disabled={sending}>
              {sending ? 'Sending...' : '✉️ Send Email'}
            </Button>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Sending as: <strong style={{ color: 'var(--color-text-primary)' }}>DH Website Services — {selectedFrom.label}</strong> &lt;{selectedFrom.address}&gt;
            </span>
          </div>
        </div>

        {/* Templates */}
        <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 12 }}>Email Templates</div>
          {templates.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No templates saved yet</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {templates.map(t => (
                  <button key={t.id} onClick={() => applyTemplate(t.id)}
                    style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--border-radius-md)', border: '1px solid ' + (form.template_id === t.id ? 'var(--color-primary)' : 'var(--color-border)'), background: form.template_id === t.id ? 'var(--color-blue-50)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{t.subject}</div>
                  </button>
                ))}
              </div>
            )
          }
        </div>
      </div>
    </div>
  )
}
