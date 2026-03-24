import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'

const SECTIONS = ['general','email','payments','notifications','danger']

export default function Settings() {
  const { user, isAdmin } = useAuth()
  const [tab, setTab]     = useState('general')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [saved, setSaved]   = useState('')
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
    })
  }, [])

  const set = (k, v) => setSettings(p => ({ ...p, [k]: v }))

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

  const SaveBtn = ({ section }) => (
    <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:20 }}>
      <button className="btn btn-primary" onClick={() => save(section)} disabled={saving}>{saving?'Saving...':'Save Changes'}</button>
      {saved === section && <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved</span>}
    </div>
  )

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
        {[['general','General'],['email','Email'],['payments','Payments'],['notifications','Notifications'],['danger','Danger Zone']].map(([k,l]) => (
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

      {tab === 'danger' && (
        <div className="card card-pad" style={{ maxWidth:520, border:'2px solid var(--red)' }}>
          <div style={{ fontSize:16, fontWeight:600, color:'var(--red)', marginBottom:16 }}>⚠️ Danger Zone</div>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ padding:'14px', borderRadius:8, border:'1px solid var(--border)' }}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>Clear Audit Log</div>
              <div style={{ fontSize:12, color:'var(--sub)', marginBottom:10 }}>Permanently delete all audit log entries older than 90 days.</div>
              <button className="btn btn-danger btn-sm" onClick={async () => { if(!confirm('Clear old audit logs? This cannot be undone.')) return; const cutoff = new Date(Date.now()-90*86400000).toISOString(); await supabase.from('audit_log').delete().lt('created_at', cutoff); setSuccess('Settings saved') }}>Clear Old Logs</button>
            </div>
            <div style={{ padding:'14px', borderRadius:8, border:'1px solid var(--border)' }}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>Export All Data</div>
              <div style={{ fontSize:12, color:'var(--sub)', marginBottom:10 }}>Download a full export of portal data as JSON.</div>
              <button className="btn btn-outline btn-sm" onClick={async () => { const [{ data: c }, { data: o }, { data: s }] = await Promise.all([supabase.from('clients').select('*'), supabase.from('outreach').select('*'), supabase.from('staff').select('*')]); const blob = new Blob([JSON.stringify({ clients:c, outreach:o, staff:s }, null, 2)], { type:'application/json' }); const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='dh-portal-export.json'; a.click() }}>Export JSON</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
