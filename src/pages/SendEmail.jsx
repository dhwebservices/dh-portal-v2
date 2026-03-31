import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { sendEmail } from '../utils/email'
import { useAuth } from '../contexts/AuthContext'

const FROM_OPTIONS = [
  { value: 'clients', label: 'Client Services', address: 'clients@dhwebsiteservices.co.uk' },
  { value: 'noreply', label: 'No Reply',         address: 'noreply@dhwebsiteservices.co.uk' },
  { value: 'user',    label: 'My Address',       address: null }, // filled dynamically
]

export default function SendEmail() {
  const { user } = useAuth()
  const [outreach,   setOutreach]   = useState([])
  const [clients,    setClients]    = useState([])
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
      })
      if (result.ok) {
        // Log email to email_log
        try {
          await supabase.from('email_log').insert([{
            sent_by: user?.name || user?.email,
            sent_by_email: user?.email,
            sent_to: [form.to],
            subject: form.subject,
            body: form.body,
            from_address: 'DH Website Services <' + selectedFrom.address + '>',
            template_used: form.template_id || null,
            sent_at: new Date().toISOString(),
          }])
        } catch {
          // Email log failure should not block a successful send.
        }

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
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Send Email</h1>
          <p className="page-sub">Send outreach or client emails</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* From */}
          <div>
            <label className="lbl">From</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {fromOptions.map(o => (
                <button key={o.value} onClick={() => sf('from_key', o.value)}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid ' + (form.from_key === o.value ? 'var(--accent)' : 'var(--border)'), background: form.from_key === o.value ? 'var(--accent-soft)' : 'var(--bg2)', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: form.from_key === o.value ? 'var(--accent)' : 'var(--text)' }}>{o.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{o.value === 'user' ? (user?.email || '—') : o.address}</div>
                </button>
              ))}
            </div>
          </div>

          {/* To */}
          <div>
            <label className="lbl">To</label>
            <input className="inp" value={form.to} onChange={e => sf('to', e.target.value)}
              placeholder="email@example.com" type="email" style={{ marginBottom: 6 }}/>
            <select className="inp" value="" onChange={e => sf('to', e.target.value)}>
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
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="lbl">Subject</label>
            <input className="inp" value={form.subject} onChange={e => sf('subject', e.target.value)} placeholder="Subject line"/>
          </div>

          {/* Body */}
          <div>
            <label className="lbl">Message</label>
            <textarea className="inp" rows={14} value={form.body} onChange={e => sf('body', e.target.value)}
              placeholder="Write your message..." style={{ resize: 'vertical', lineHeight: 1.7 }}/>
          </div>

          {error && <div style={{ padding: '10px 14px', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 7, fontSize: 13, color: 'var(--red)' }}>{error}</div>}
          {sent  && <div style={{ padding: '10px 14px', background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 7, fontSize: 13, color: 'var(--green)' }}>✓ Email sent successfully</div>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-primary" onClick={send} disabled={sending}>
              {sending ? 'Sending...' : '✉️ Send Email'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--faint)' }}>
              Sending as: <strong style={{ color: 'var(--text)' }}>DH Website Services — {selectedFrom.label}</strong> &lt;{selectedFrom.address}&gt;
            </span>
          </div>
        </div>

        {/* Templates */}
        <div className="card card-pad">
          <div className="lbl" style={{ marginBottom: 12 }}>Email Templates</div>
          {templates.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--faint)' }}>No templates saved yet</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {templates.map(t => (
                  <button key={t.id} onClick={() => applyTemplate(t.id)}
                    style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: form.template_id === t.id ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s', borderColor: form.template_id === t.id ? 'var(--accent)' : 'var(--border)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--faint)' }}>{t.subject}</div>
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
