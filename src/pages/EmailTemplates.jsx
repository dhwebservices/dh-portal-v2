import { useState, useEffect } from 'react'
import { Mail, Save, RefreshCw, Eye, EyeOff } from 'lucide-react'
import { Card, Btn, Input } from '../components/UI'
import { supabase } from '../utils/supabase'
import { useMsal } from '@azure/msal-react'

const TEMPLATE_TYPES = [
  { type: 'support_ticket_raised', label: 'Support Ticket — Notify Staff',  desc: 'Sent to clients@ when a client raises a support query'    },
  { type: 'support_ticket_reply',  label: 'Support Reply — Notify Client',  desc: 'Sent to the client when staff reply to their ticket'       },
  { type: 'invoice_issued',        label: 'Invoice Issued — Notify Client', desc: 'Sent to the client when a new invoice is added'            },
  { type: 'client_welcome',        label: 'Welcome Pack — New Client',      desc: 'Sent when you click Welcome on the Onboarded Clients page' },
]

const VARIABLES = {
  support_ticket_raised: ['{{clientName}}', '{{clientEmail}}', '{{subject}}', '{{message}}', '{{priority}}'],
  support_ticket_reply:  ['{{clientName}}', '{{clientEmail}}', '{{subject}}', '{{reply}}', '{{staffName}}'],
  invoice_issued:        ['{{clientName}}', '{{clientEmail}}', '{{invoiceNumber}}', '{{amount}}', '{{description}}', '{{stripeLink}}', '{{dueDate}}'],
  client_welcome:        ['{{clientName}}', '{{clientEmail}}', '{{loginEmail}}', '{{plan}}'],
}

function EmailPreview({ template, type }) {
  if (!template) return null
  const previewVars = {
    '{{clientName}}':    'Jane Smith',
    '{{clientEmail}}':   'jane@example.co.uk',
    '{{subject}}':       'Question about my website',
    '{{message}}':       'I had a question about the timeline for my project.',
    '{{priority}}':      'Normal',
    '{{reply}}':         'Hi Jane, thanks for getting in touch! We\'ll have an update for you by end of week.',
    '{{staffName}}':     'David Hooper',
    '{{invoiceNumber}}': 'INV-001',
    '{{amount}}':        '79.00',
    '{{description}}':   'Monthly Website Plan',
    '{{stripeLink}}':    '#',
    '{{dueDate}}':       '31 March 2026',
    '{{loginEmail}}':    'jane@dhwebsiteservices.co.uk',
    '{{plan}}':          'Monthly Starter',
  }

  const fill = (text) => {
    let result = text || ''
    Object.entries(previewVars).forEach(([k, v]) => { result = result.replaceAll(k, v) })
    return result
  }

  return (
    <div style={{ background: 'var(--text)', borderRadius: '8px', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, var(--charcoal), #0EA5E9)', padding: '22px 28px' }}>
          <div style={{ color: '#fff', fontSize: '18px', fontWeight: 800 }}>DH<span style={{ opacity: 0.7 }}>WEBSERVICES</span></div>
        </div>
        {/* Body */}
        <div style={{ padding: '28px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>{fill(template.heading)}</h2>
          <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.7, margin: '0 0 16px' }}>{fill(template.body)}</p>
          {template.button_text && (
            <a href="#" style={{ display: 'inline-block', padding: '11px 24px', background: 'linear-gradient(135deg, var(--charcoal), #0EA5E9)', color: '#fff', borderRadius: '6px', fontWeight: 700, fontSize: '14px', textDecoration: 'none', margin: '8px 0 16px' }}>
              {fill(template.button_text)} →
            </a>
          )}
          {template.footer_note && (
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: '8px 0 0', lineHeight: 1.6 }}>{fill(template.footer_note)}</p>
          )}
        </div>
        {/* Footer */}
        <div style={{ padding: '16px 28px', background: '#F8FAFF', borderTop: '1px solid #E2E8F4', textAlign: 'center', fontSize: '11px', color: '#94A3B8' }}>
          DH Website Services · dhwebsiteservices.co.uk<br />
          36B Coedpenmaen Road, Pontypridd, CF37 4LP
        </div>
      </div>
      <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '11.5px', color: 'var(--sub)' }}>
        Subject: <strong>{fill(template.subject)}</strong>
      </div>
  )
}

export default function EmailTemplates() {
  const { accounts } = useMsal()
  const user = accounts[0]
  const [templates, setTemplates]     = useState({})
  const [selected, setSelected]       = useState(TEMPLATE_TYPES[0].type)
  const [form, setForm]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [preview, setPreview]         = useState(true)

  useEffect(() => { fetchTemplates() }, [])

  useEffect(() => {
    if (templates[selected]) setForm({ ...templates[selected] })
  }, [selected, templates])

  const fetchTemplates = async () => {
    setLoading(true)
    const { data } = await supabase.from('email_templates').select('*')
    const map = {}
    ;(data || []).forEach(t => { map[t.type] = t })
    setTemplates(map)
    setLoading(false)
  }

  const save = async () => {
    if (!form) return
    setSaving(true)
    await supabase.from('email_templates').upsert({
      ...form,
      updated_by: user?.username,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'type' })
    setTemplates(prev => ({ ...prev, [form.type]: form }))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const reset = () => {
    if (templates[selected]) setForm({ ...templates[selected] })
  }

  const update = (field, value) => setForm(p => ({ ...p, [field]: value }))

  const currentType = TEMPLATE_TYPES.find(t => t.type === selected)
  const vars = VARIABLES[selected] || []

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* Left — template selector */}
        <div style={{ width: '260px', flexShrink: 0 }}>
          <div className="card" style={{ padding: '8px' }}>
            {TEMPLATE_TYPES.map(t => (
              <button key={t.type} onClick={() => setSelected(t.type)} style={{
                width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: '6px',
                background: selected === t.type ? 'var(--gold-bg)' : 'transparent',
                border: selected === t.type ? '1px solid rgba(0,194,255,0.25)' : '1px solid transparent',
                cursor: 'pointer', marginBottom: '4px', transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: '13px', fontWeight: selected === t.type ? 700 : 500, color: selected === t.type ? 'var(--gold)' : 'var(--text)', marginBottom: '3px' }}>{t.label}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--sub)', lineHeight: 1.4 }}>{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Right — editor + preview */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading || !form ? (
            <div className="card card-pad"><div style={{ padding: '40px', textAlign: 'center', color: 'var(--sub)' }}>Loading templates…</div></div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px' }}>{currentType?.label}</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--sub)', marginTop: '2px' }}>{currentType?.desc}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPreview(p => !p)}>
                    {preview ? 'Hide Preview' : 'Show Preview'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={reset}><RefreshCw size={12}/>Reset</button>
                  <button className="btn btn-primary btn-sm" onClick={save}><Save size={12}/>
                    {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Template'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1fr' : '1fr', gap: '20px' }}>
                {/* Editor */}
                <div className="card card-pad">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div><label className="inp-label">Subject Line</label><input className="inp" value={form.subject} onChange={e => update('subject', e.target.value)} />
                    <div><label className="inp-label">Email Heading</label><input className="inp" value={form.heading} onChange={e => update('heading', e.target.value)} />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', color: 'var(--sub)', fontWeight: 600 }}>Body Text</label>
                      <textarea className="inp" value={form.body} onChange={e => update('body', e.target.value)} rows={4}
                        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', color: 'var(--text)', fontSize: '13.5px', resize: 'vertical', lineHeight: 1.6 }}
                        onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div><label className="inp-label">Button Text</label><input className="inp" value={form.button_text || ''} onChange={e => update('button_text', e.target.value)} placeholder="e.g. View in Portal" />
                      <div><label className="inp-label">Button Link</label><input className="inp" value={form.button_link || ''} onChange={e => update('button_link', e.target.value)} placeholder="https://…" />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', color: 'var(--sub)', fontWeight: 600 }}>Footer Note <span style={{ fontWeight: 400 }}>(optional)</span></label>
                      <textarea className="inp" value={form.footer_note || ''} onChange={e => update('footer_note', e.target.value)} rows={2}
                        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', color: 'var(--text)', fontSize: '13.5px', resize: 'vertical', lineHeight: 1.6 }}
                        onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'}
                      />
                    </div>

                    {/* Variables reference */}
                    <div style={{ padding: '12px 14px', background: 'var(--bg2)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--sub)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available Variables</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {vars.map(v => (
                          <span key={v} style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(0,194,255,0.1)', color: 'var(--gold)', fontFamily: 'monospace', cursor: 'pointer' }}
                            onClick={() => navigator.clipboard.writeText(v)}
                            title="Click to copy"
                          >{v}</span>
                        ))}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--faint)', marginTop: '6px' }}>Click any variable to copy. Use them in subject, heading, body, button or footer.</div>
                    </div>
                  </div>
                </div>

                {/* Preview */}
                {preview && (
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Live Preview</div>
                    <EmailPreview template={form} type={selected} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </div>
    </div>
    </div>
  )
}
