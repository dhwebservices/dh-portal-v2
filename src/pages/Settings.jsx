import { useState, useEffect } from 'react'
import { Save, Globe, Mail, Shield, Bell, CreditCard, RefreshCw } from 'lucide-react'
import { supabase } from '../utils/supabase'

const SETTINGS_KEY = 'portal_settings'
const DEFAULTS = {
  businessName:'DH Website Services', legalName:'David Hooper Home Limited',
  email:'clients@dhwebsiteservices.co.uk', phone:'', address:'36B Coedpenmaen Road, Pontypridd, CF37 4LP',
  website:'dhwebsiteservices.co.uk',
  notifNewClient:true, notifCommission:true, notifInvoice:true, notifNewStaff:false,
  commissionStd:'15', commissionSr:'20',
  azureTenant:'', azureClient:'', azureDomain:'dhwebsiteservices.co.uk',
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="card card-pad" style={{ marginBottom: 20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, paddingBottom:14, borderBottom:'1px solid var(--border)' }}>
        <div style={{ width:34, height:34, background:'var(--gold-bg)', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon size={16} color="var(--gold)" />
        </div>
        <h3 style={{ fontSize:15, fontWeight:600 }}>{title}</h3>
      </div>
      {children}
  )
}

function Toggle({ label, desc, checked, onChange }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize:13.5, fontWeight:600, marginBottom:2 }}>{label}</div>
        {desc && <div style={{ fontSize:12, color:'var(--sub)' }}>{desc}</div>}
      </div>
      <button onClick={() => onChange(!checked)} style={{ width:40, height:22, borderRadius:11, border:'none', cursor:'pointer', flexShrink:0, background:checked?'var(--gold)':'var(--border)', position:'relative', transition:'background 0.2s' }}>
        <div style={{ position:'absolute', top:3, left:checked?20:3, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
      </button>
  )
}

export default function Settings() {
  const [form, setForm] = useState({...DEFAULTS})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('portal_settings').select('value').eq('key',SETTINGS_KEY).single()
    if (data?.value) setForm({...DEFAULTS,...data.value})
    setLoading(false)
  }

  const save = async () => {
    setSaving(true)
    await supabase.from('portal_settings').upsert({ key:SETTINGS_KEY, value:form, updated_at:new Date().toISOString() },{ onConflict:'key' })
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2500)
  }

  const u = (k,v) => setForm(p=>({...p,[k]:v}))
  const INP = { className:'inp' }

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'var(--sub)' }}>Loading settings…</div>

  return (
    <div className="fade-in">
      <Section icon={Globe} title="Business Details">
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="form-grid">
            <div><label className="inp-label">Trading Name</label><input {...INP} value={form.businessName} onChange={e=>u('businessName',e.target.value)} /></div>
            <div><label className="inp-label">Legal Name</label><input {...INP} value={form.legalName} onChange={e=>u('legalName',e.target.value)} /></div>
            <div><label className="inp-label">Email</label><input {...INP} value={form.email} onChange={e=>u('email',e.target.value)} /></div>
            <div><label className="inp-label">Phone</label><input {...INP} value={form.phone} onChange={e=>u('phone',e.target.value)} /></div>
          </div>
          <div><label className="inp-label">Address</label><input {...INP} value={form.address} onChange={e=>u('address',e.target.value)} /></div>
          <div><label className="inp-label">Website</label><input {...INP} value={form.website} onChange={e=>u('website',e.target.value)} /></div>
        </div>
      </Section>

      <Section icon={Bell} title="Notifications">
        <Toggle label="New Client"       desc="Alert when a new client is onboarded"           checked={form.notifNewClient}  onChange={v=>u('notifNewClient',v)} />
        <Toggle label="Commission Due"   desc="Alert when a commission payout is pending"       checked={form.notifCommission} onChange={v=>u('notifCommission',v)} />
        <Toggle label="Invoice Paid"     desc="Alert when an invoice is marked as received"    checked={form.notifInvoice}    onChange={v=>u('notifInvoice',v)} />
        <Toggle label="New Staff Member" desc="Alert when a new staff member is added"          checked={form.notifNewStaff}   onChange={v=>u('notifNewStaff',v)} />
      </Section>

      <Section icon={CreditCard} title="Commission Defaults">
        <p style={{ fontSize:13, color:'var(--sub)', lineHeight:1.6, marginBottom:16 }}>Default rates applied to new staff. Individual rates can be overridden in Staff Accounts.</p>
        <div className="form-grid">
          <div><label className="inp-label">Standard Rate (%)</label><input {...INP} type="number" value={form.commissionStd} onChange={e=>u('commissionStd',e.target.value)} /></div>
          <div><label className="inp-label">Senior Rate (%)</label><input {...INP} type="number" value={form.commissionSr} onChange={e=>u('commissionSr',e.target.value)} /></div>
        </div>
        <p style={{ fontSize:12, color:'var(--faint)', marginTop:12 }}>Commissions are paid once the client invoice is confirmed. Staff handle their own tax.</p>
      </Section>

      <Section icon={Shield} title="Azure AD / Microsoft 365">
        <p style={{ fontSize:13, color:'var(--sub)', marginBottom:16 }}>These values are set in your Cloudflare Pages environment variables. Reference only.</p>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div><label className="inp-label">Tenant ID</label><input {...INP} value={form.azureTenant} onChange={e=>u('azureTenant',e.target.value)} placeholder="c8bd84c5-..." /></div>
          <div><label className="inp-label">Client ID</label><input {...INP} value={form.azureClient} onChange={e=>u('azureClient',e.target.value)} placeholder="79722400-..." /></div>
          <div><label className="inp-label">Domain</label><input {...INP} value={form.azureDomain} onChange={e=>u('azureDomain',e.target.value)} /></div>
        </div>
      </Section>

      <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:14, paddingBottom:40 }}>
        {saved && <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved</span>}
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          <Save size={13}/>{saving?'Saving…':'Save Settings'}
        </button>
      </div>
  )
}
