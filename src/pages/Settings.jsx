import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { sendEmail } from '../utils/email'
import { logAction } from '../utils/audit'
import { loadActivePortalStaffAudience } from '../utils/staffAudience'

const EMPTY_WHATS_NEW_CARD = { tag:'', title:'', body:'' }
export default function Settings() {
  const { user, isAdmin } = useAuth()
  const [tab, setTab]     = useState('general')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [saved, setSaved]   = useState('')
  const [previousWhatsNew, setPreviousWhatsNew] = useState(null)
  const [previewWhatsNewIndex, setPreviewWhatsNewIndex] = useState(0)
  const [whatsNew, setWhatsNew] = useState({
    active: false,
    version: '',
    title: 'What’s New',
    intro: '',
    cards: [{ ...EMPTY_WHATS_NEW_CARD }],
  })
  const [settings, setSettings] = useState({
    portal_name: 'DH Staff Portal',
    portal_tagline: 'DH Website Services',
    support_email: 'support@dhwebsiteservices.co.uk',
    from_name: 'DH Website Services',
    email_footer: '36B Coedpenmaen Road, Pontypridd, CF37 4LP',
    gocardless_key: '',
    gocardless_env: 'sandbox',
    notify_new_ticket: true,
    notify_new_client: true,
    notify_leave_request: true,
    notify_invoice_paid: true,
  })

  useEffect(() => {
    supabase.from('portal_settings').select('*').then(({ data }) => {
      if (!data) return
      const map = {}
      data.forEach(r => { map[r.key] = r.value?.value ?? r.value })
      setSettings(p => ({ ...p, ...map }))
      if (map.whats_new_payload) {
        const nextPayload = {
          active: map.whats_new_payload.active === true,
          version: map.whats_new_payload.version || '',
          title: map.whats_new_payload.title || 'What’s New',
          intro: map.whats_new_payload.intro || '',
          cards: Array.isArray(map.whats_new_payload.cards) && map.whats_new_payload.cards.length ? map.whats_new_payload.cards : [{ ...EMPTY_WHATS_NEW_CARD }],
        }
        setWhatsNew(nextPayload)
        setPreviousWhatsNew(nextPayload)
      }
    })
  }, [])

  useEffect(() => {
    setPreviewWhatsNewIndex(0)
  }, [whatsNew.version, whatsNew.cards.length])

  const set = (k, v) => setSettings(p => ({ ...p, [k]: v }))
  const previewCards = Array.isArray(whatsNew.cards) && whatsNew.cards.length ? whatsNew.cards : [{ ...EMPTY_WHATS_NEW_CARD }]
  const activePreviewCard = previewCards[previewWhatsNewIndex] || previewCards[0]

  const save = async (section) => {
    setSaving(true)
    const keys = {
      general: ['portal_name','portal_tagline','support_email'],
      email:   ['from_name','email_footer'],
      payments:['gocardless_key','gocardless_env'],
      notifications:['notify_new_ticket','notify_new_client','notify_leave_request','notify_invoice_paid'],
    }[section] || Object.keys(settings)

    await Promise.all(keys.map(key =>
      supabase.from('portal_settings').upsert({ key, value: { value: settings[key] } }, { onConflict:'key' })
    ))
    setSaving(false); setSaved(section); setTimeout(() => setSaved(''), 3000)
  }

  const updateWhatsNewCard = (index, key, value) => {
    setWhatsNew((current) => ({
      ...current,
      cards: current.cards.map((card, cardIndex) => cardIndex === index ? { ...card, [key]: value } : card),
    }))
  }

  const addWhatsNewCard = () => {
    setWhatsNew((current) => ({ ...current, cards: [...current.cards, { ...EMPTY_WHATS_NEW_CARD }] }))
  }

  const removeWhatsNewCard = (index) => {
    setWhatsNew((current) => ({
      ...current,
      cards: current.cards.length > 1 ? current.cards.filter((_, cardIndex) => cardIndex !== index) : [{ ...EMPTY_WHATS_NEW_CARD }],
    }))
  }

  const saveWhatsNew = async () => {
    setSaving(true)
    const nextPayload = {
      ...whatsNew,
      cards: whatsNew.cards.filter((card) => card.title || card.body || card.tag),
    }
    await supabase.from('portal_settings').upsert({
      key: 'whats_new_payload',
      value: {
        value: nextPayload,
      },
    }, { onConflict:'key' })

    const shouldEmailRelease = nextPayload.active && (
      !previousWhatsNew?.active
      || String(previousWhatsNew?.version || '').trim() !== String(nextPayload.version || '').trim()
      || JSON.stringify(previousWhatsNew?.cards || []) !== JSON.stringify(nextPayload.cards || [])
      || String(previousWhatsNew?.intro || '').trim() !== String(nextPayload.intro || '').trim()
    )

    if (shouldEmailRelease) {
      try {
        const recipients = await loadActivePortalStaffAudience()

        const subject = `${nextPayload.title || 'What’s New'}${nextPayload.version ? ` — v${nextPayload.version}` : ''}`
        const cardsHtml = nextPayload.cards.map((card) => `
          <div style="padding:14px 16px;border:1px solid #e5e5e5;border-radius:12px;background:#fafafa;margin-bottom:12px;">
            ${card.tag ? `<div style="display:inline-block;padding:4px 8px;border-radius:999px;background:#eef4ff;color:#1d4ed8;font-size:11px;font-weight:600;margin-bottom:8px;">${card.tag}</div>` : ''}
            <div style="font-size:16px;font-weight:700;color:#1d1d1f;margin-bottom:6px;">${card.title || 'Update'}</div>
            <div style="font-size:13px;line-height:1.7;color:#555;">${card.body || ''}</div>
          </div>
        `).join('')

        await Promise.allSettled(recipients.map((recipient) => sendEmail('send_email', {
          to: recipient.email,
          to_name: recipient.name,
          subject,
          html: `
            <p>Hi ${recipient.name || 'there'},</p>
            <p>${nextPayload.intro || 'There are new updates available in the DH Workplace staff portal.'}</p>
            ${cardsHtml}
            <p><a href="https://staff.dhwebsiteservices.co.uk" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open DH Workplace</a></p>
          `,
          sent_by: user?.name || 'System',
          from_email: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
          log_outreach: false,
        })))
      } catch (error) {
        console.error('Whats new email send failed:', error)
      }
    }

    setPreviousWhatsNew(nextPayload)
    setSaving(false)
    setSaved('experience')
    setTimeout(() => setSaved(''), 3000)
  }

  const SaveBtn = ({ section }) => (
    <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:20 }}>
      <button className="btn btn-primary" onClick={() => save(section)} disabled={saving}>{saving?'Saving...':'Save Changes'}</button>
      {saved === section && <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved</span>}
    </div>
  )

  const requireReason = (label) => {
    const reason = window.prompt(`Add a short reason for this ${label.toLowerCase()}:`)
    return String(reason || '').trim()
  }

  const clearOldAuditLogs = async () => {
    if (!isAdmin) return
    if (!window.confirm('Clear old audit logs? This cannot be undone.')) return
    const reason = requireReason('audit log deletion')
    if (!reason) return
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString()
    await supabase.from('audit_log').delete().lt('created_at', cutoff)
    await logAction(user?.email, user?.name, 'audit_log_cleared', 'audit_log', null, { cutoff, reason })
    setSuccess('Settings saved')
  }

  const exportPortalData = async () => {
    if (!isAdmin) return
    const reason = requireReason('data export')
    if (!reason) return
    const [{ data: clients }, { data: outreach }, { data: staff }] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('outreach').select('*'),
      supabase.from('hr_profiles').select('*'),
    ])
    const generatedAt = new Date().toISOString()
    const blob = new Blob([JSON.stringify({ generated_at: generatedAt, clients, outreach, staff }, null, 2)], { type:'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `dh-portal-export-${generatedAt.split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(link.href)
    await logAction(user?.email, user?.name, 'portal_data_exported', 'portal_data', null, {
      reason,
      generated_at: generatedAt,
      datasets: ['clients', 'outreach', 'hr_profiles'],
    })
  }

  const Field = ({ label, k, type='text', placeholder='' }) => (
    <div>
      <label className="lbl">{label}</label>
      <input className="inp" type={type} value={settings[k]||''} onChange={e => set(k, e.target.value)} placeholder={placeholder}/>
    </div>
  )

  const Toggle = ({ label, desc, k }) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize:13, fontWeight:500 }}>{label}</div>
        {desc && <div style={{ fontSize:12, color:'var(--faint)', marginTop:2 }}>{desc}</div>}
      </div>
      <button onClick={() => set(k, !settings[k])} style={{ width:40, height:22, borderRadius:11, background: settings[k] ? 'var(--green)' : 'var(--border)', border:'none', cursor:'pointer', position:'relative', flexShrink:0 }}>
        <div style={{ position:'absolute', top:2, left: settings[k] ? 20 : 2, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
      </button>
    </div>
  )

  return (
    <div className="fade-in">
      <div className="page-hd"><div><h1 className="page-title">Settings</h1></div></div>

      <div className="tabs">
        {[['general','General'],['email','Email'],['payments','Payments'],['notifications','Notifications'],['experience','Experience'],['danger','Danger Zone']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={'tab'+(tab===k?' on':'')}>{l}</button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="card card-pad" style={{ maxWidth:520 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <Field label="Portal Name" k="portal_name" placeholder="DH Staff Portal"/>
            <Field label="Portal Tagline" k="portal_tagline" placeholder="DH Website Services"/>
            <Field label="Support Email" k="support_email" type="email" placeholder="support@dhwebsiteservices.co.uk"/>
          </div>
          <SaveBtn section="general"/>
        </div>
      )}

      {tab === 'email' && (
        <div className="card card-pad" style={{ maxWidth:520 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <Field label="From Name" k="from_name" placeholder="DH Website Services"/>
            <div>
              <label className="lbl">Email Footer Text</label>
              <textarea className="inp" rows={3} value={settings.email_footer||''} onChange={e => set('email_footer',e.target.value)} style={{ resize:'vertical' }} placeholder="Company address shown in email footers"/>
            </div>
            <div style={{ padding:'12px 14px', background:'var(--bg2)', borderRadius:8, fontSize:13, color:'var(--sub)' }}>
              Emails are sent via your Cloudflare Worker. Make sure the worker is deployed and has your email provider credentials set.
            </div>
          </div>
          <SaveBtn section="email"/>
        </div>
      )}

      {tab === 'payments' && (
        <div className="card card-pad" style={{ maxWidth:520 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ padding:'12px 14px', background:'var(--blue-bg)', border:'1px solid var(--blue)', borderRadius:8, fontSize:13, color:'var(--blue)' }}>
              GoCardless API keys are used to set up Direct Debit mandates and collect payments from clients automatically.
            </div>
            <div><label className="lbl">Environment</label>
              <div style={{ display:'flex', gap:8 }}>
                {[['sandbox','Sandbox (Testing)'],['live','Live (Production)']].map(([v,l]) => (
                  <button key={v} onClick={() => set('gocardless_env',v)} style={{ flex:1, padding:'10px', borderRadius:7, border:`2px solid ${settings.gocardless_env===v?'var(--accent)':'var(--border)'}`, background: settings.gocardless_env===v ? 'var(--accent-soft)' : 'transparent', cursor:'pointer', fontSize:13, fontWeight:500, color: settings.gocardless_env===v ? 'var(--accent)' : 'var(--sub)' }}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="lbl">GoCardless API Key</label>
              <input className="inp" type="password" value={settings.gocardless_key||''} onChange={e => set('gocardless_key',e.target.value)} placeholder="live_..."/>
              <div style={{ fontSize:11, color:'var(--faint)', marginTop:5 }}>Get your API key from GoCardless Dashboard → Developers → API Keys</div>
            </div>
            {settings.gocardless_env === 'live' && (
              <div style={{ padding:'10px 14px', background:'var(--amber-bg)', border:'1px solid var(--amber)', borderRadius:7, fontSize:13, color:'var(--amber)' }}>
                ⚠️ Live mode — real money will be collected from clients
              </div>
            )}
          </div>
          <SaveBtn section="payments"/>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="card card-pad" style={{ maxWidth:520 }}>
          <div>
            <Toggle label="New support ticket" desc="Notify when a client submits a support ticket" k="notify_new_ticket"/>
            <Toggle label="New client added" desc="Notify when a new client is onboarded" k="notify_new_client"/>
            <Toggle label="Leave request submitted" desc="Notify managers when staff request leave" k="notify_leave_request"/>
            <Toggle label="Invoice paid" desc="Notify when a client pays an invoice" k="notify_invoice_paid"/>
          </div>
          <SaveBtn section="notifications"/>
        </div>
      )}

      {tab === 'experience' && (
        <div style={{ display:'grid', gap:18, maxWidth:860 }}>
          <div className="card card-pad">
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:18, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>What’s New popup</div>
                <div style={{ fontSize:13, color:'var(--sub)', marginTop:6, lineHeight:1.6, maxWidth:560 }}>
                  Publish a multi-card update modal for staff. It appears once per user for each version until they dismiss it.
                </div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <button onClick={() => setWhatsNew((current) => ({ ...current, active: !current.active }))} style={{ width:40, height:22, borderRadius:11, background: whatsNew.active ? 'var(--green)' : 'var(--border)', border:'none', cursor:'pointer', position:'relative', flexShrink:0 }}>
                  <div style={{ position:'absolute', top:2, left: whatsNew.active ? 20 : 2, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                </button>
                <span style={{ fontSize:12, color: whatsNew.active ? 'var(--green)' : 'var(--faint)', fontWeight:600 }}>
                  {whatsNew.active ? 'Live' : 'Off'}
                </span>
              </div>
            </div>

            <div style={{ display:'grid', gap:14 }}>
              <div className="fg">
                <div><label className="lbl">Version</label><input className="inp" value={whatsNew.version} onChange={e => setWhatsNew((current) => ({ ...current, version: e.target.value }))} placeholder="e.g. 2.4.0" /></div>
                <div><label className="lbl">Title</label><input className="inp" value={whatsNew.title} onChange={e => setWhatsNew((current) => ({ ...current, title: e.target.value }))} placeholder="What’s New in DH Portal" /></div>
              </div>
              <div>
                <label className="lbl">Intro</label>
                <textarea className="inp" rows={3} value={whatsNew.intro} onChange={e => setWhatsNew((current) => ({ ...current, intro: e.target.value }))} style={{ resize:'vertical' }} placeholder="Short introduction shown above the cards" />
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>Update cards</div>
                <div style={{ fontSize:13, color:'var(--sub)', marginTop:6 }}>Add as many cards as you need for new features, changes, or improvements.</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={addWhatsNewCard}>Add card</button>
            </div>

            <div style={{ display:'grid', gap:14 }}>
              {whatsNew.cards.map((card, index) => (
                <div key={`whats-new-card-${index}`} style={{ padding:'14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:12 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Card {index + 1}</div>
                    <button className="btn btn-danger btn-sm" onClick={() => removeWhatsNewCard(index)}>Remove</button>
                  </div>
                  <div style={{ display:'grid', gap:12 }}>
                    <div className="fg">
                      <div><label className="lbl">Tag</label><input className="inp" value={card.tag || ''} onChange={e => updateWhatsNewCard(index, 'tag', e.target.value)} placeholder="e.g. New, Improved" /></div>
                      <div><label className="lbl">Title</label><input className="inp" value={card.title || ''} onChange={e => updateWhatsNewCard(index, 'title', e.target.value)} placeholder="What changed?" /></div>
                    </div>
                    <div>
                      <label className="lbl">Body</label>
                      <textarea className="inp" rows={4} value={card.body || ''} onChange={e => updateWhatsNewCard(index, 'body', e.target.value)} style={{ resize:'vertical' }} placeholder="Short explanation of the update" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginBottom:12 }}>Preview</div>
            <div style={{ padding:'16px 18px', borderRadius:14, background:'var(--accent-soft)', border:'1px solid var(--accent-border)', marginBottom:14 }}>
              <div style={{ fontSize:12, color:'var(--sub)', marginBottom:6 }}>Version {whatsNew.version || '—'}</div>
              <div style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginBottom:8 }}>{whatsNew.title || 'What’s New'}</div>
              <div style={{ fontSize:13, color:'var(--sub)', lineHeight:1.7 }}>{whatsNew.intro || 'Your intro text will appear here.'}</div>
            </div>
            <div style={{ display:'grid', gap:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                <div style={{ fontSize:12, color:'var(--sub)' }}>
                  Previewing card {Math.min(previewWhatsNewIndex + 1, previewCards.length)} of {previewCards.length}
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  {previewCards.map((card, index) => (
                    <button
                      key={`preview-dot-${index}`}
                      onClick={() => setPreviewWhatsNewIndex(index)}
                      style={{
                        width: index === previewWhatsNewIndex ? 28 : 10,
                        height: 10,
                        borderRadius: 999,
                        border: 'none',
                        background: index === previewWhatsNewIndex ? 'var(--accent)' : 'var(--border)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ padding:'18px', border:'1px solid var(--border)', borderRadius:14, background:'var(--card)', minHeight:220, display:'grid', alignContent:'start' }}>
                {activePreviewCard?.tag ? <span className="badge badge-blue" style={{ marginBottom:10 }}>{activePreviewCard.tag}</span> : null}
                <div style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginBottom:8 }}>{activePreviewCard?.title || 'Update title'}</div>
                <div style={{ fontSize:13, color:'var(--sub)', lineHeight:1.7 }}>{activePreviewCard?.body || 'Card details appear here.'}</div>
              </div>

              <div style={{ display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
                <button className="btn btn-outline btn-sm" onClick={() => setPreviewWhatsNewIndex((current) => Math.max(0, current - 1))} disabled={previewWhatsNewIndex === 0}>Previous</button>
                <button className="btn btn-outline btn-sm" onClick={() => setPreviewWhatsNewIndex((current) => Math.min(previewCards.length - 1, current + 1))} disabled={previewWhatsNewIndex >= previewCards.length - 1}>Next</button>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:20 }}>
              <button className="btn btn-primary" onClick={saveWhatsNew} disabled={saving}>{saving ? 'Saving...' : 'Save What’s New'}</button>
              {saved === 'experience' && <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved</span>}
            </div>
          </div>
        </div>
      )}

      {tab === 'danger' && (
        <div className="card card-pad" style={{ maxWidth:520, border:'2px solid var(--red)' }}>
          <div style={{ fontSize:16, fontWeight:600, color:'var(--red)', marginBottom:16 }}>⚠️ Danger Zone</div>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ padding:'14px', borderRadius:8, border:'1px solid var(--border)' }}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>Clear Audit Log</div>
              <div style={{ fontSize:12, color:'var(--sub)', marginBottom:10 }}>Permanently delete all audit log entries older than 90 days.</div>
              <button className="btn btn-danger btn-sm" onClick={clearOldAuditLogs} disabled={!isAdmin}>Clear Old Logs</button>
            </div>
            <div style={{ padding:'14px', borderRadius:8, border:'1px solid var(--border)' }}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>Export All Data</div>
              <div style={{ fontSize:12, color:'var(--sub)', marginBottom:10 }}>Download a full export of portal data as JSON.</div>
              <button className="btn btn-outline btn-sm" onClick={exportPortalData} disabled={!isAdmin}>Export JSON</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
