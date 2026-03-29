import { useMobile } from '../hooks/useMobile'
import { useState } from 'react'
import { FileText, Trash2, Download, Plus, Wand2, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { Card, Btn, Input } from '../components/UI'
import { aiSearch } from '../utils/ai'

// ─── Packages ────────────────────────────────────────────────────────────────
const BUILD_PACKAGES = [
  { name: 'Starter',        price: 449,  delivery: '2–3 weeks', revisions: '1 round',  features: ['5-page professional website', 'Mobile responsive', 'Basic SEO setup', 'Contact form', 'Google Maps embed'] },
  { name: 'Growth',         price: 999,  delivery: '3–4 weeks', revisions: '2 rounds', features: ['10-page website', 'Blog section', 'Full SEO setup', 'Branding integration', 'Google Analytics', 'Social media links'] },
  { name: 'Pro',            price: 1499, delivery: '4–6 weeks', revisions: '3 rounds', features: ['15 pages', 'E-commerce ready', 'Custom integrations', 'Advanced SEO', 'Blog/News section', 'Priority support'] },
  { name: 'Enterprise + HR',price: 2499, delivery: '6–8 weeks', revisions: '3 rounds', features: ['Full enterprise website', 'Integrated HR system', 'SEO & branding', 'Content creation', 'Custom development'] },
  { name: 'Custom Build',   price: null, delivery: 'TBD',       revisions: 'Agreed',   features: [] },
]

const HOSTING_PACKAGES = [
  { name: 'Starter',         monthly: 35,  features: ['1 content update/month', '48–72hr support', 'Weekly backups', 'Uptime monitoring'] },
  { name: 'Professional',    monthly: 65,  features: ['3 content updates/month', 'Priority support', 'Weekly backups', 'SEO health check', 'Uptime monitoring'] },
  { name: 'Business',        monthly: 109, features: ['Unlimited content updates', 'Priority support', 'Weekly backups', 'Weekly performance tuning', 'Quarterly strategy review'] },
  { name: 'HR Maintenance',  monthly: 49,  features: ['Ongoing HR system support', 'Staff changes & updates', 'System maintenance', 'Monthly updates'] },
  { name: 'Custom Hosting',  monthly: null, features: [] },
]

const HR_ADDONS = [
  { name: 'none',            label: 'No HR Add-on',                 price: 0    },
  { name: 'addon',           label: 'HR Add-on to Existing Build',  price: 1200 },
  { name: 'standalone',      label: 'HR Standalone System',         price: 1800 },
  { name: 'maintenance',     label: 'HR Monthly Maintenance Only',  price: 0, monthly: 49 },
]

const empty = {
  clientName: '', clientEmail: '', clientBusiness: '', clientIndustry: '',
  buildPlan: 'Growth', hostingPlan: 'Professional',
  customBuildPrice: '', customMonthly: '', hr_addon: 'none',
  requirements: '', extras: [], timeline: '4-6 weeks',
  validUntil: new Date(Date.now() + 14*24*60*60*1000).toISOString().split('T')[0],
  preparedBy: 'David Hooper',
}

export default function ProposalBuilder() {
  const isMobile = useMobile()
  const [form, setForm]         = useState({ ...empty })
  const [preview, setPreview]   = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [newExtra, setNewExtra] = useState('')
  const [downloading, setDownloading] = useState(false)

  const u = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const build   = BUILD_PACKAGES.find(p => p.name === form.buildPlan)
  const hosting = HOSTING_PACKAGES.find(p => p.name === form.hostingPlan)
  const buildPrice   = form.buildPlan === 'Custom Build' || form.buildPlan === 'Custom' ? Number(form.customBuildPrice || 0) : (build?.price || 0)
  const monthlyPrice = form.hostingPlan === 'Custom Hosting' ? Number(form.customMonthly || 0) : (hosting?.monthly || 0)
  const hrAddon      = HR_ADDONS.find(h => h.name === form.hr_addon) || HR_ADDONS[0]
  const totalOneOff  = buildPrice + (hrAddon.price || 0)
  const totalMonthly = monthlyPrice + (hrAddon.monthly || 0)

  const aiWrite = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    try {
      const text = await aiSearch(
        `Write a compelling 2-3 sentence project overview for a web design proposal for:\n` +
        `Business: ${form.clientBusiness || aiPrompt}\nIndustry: ${form.clientIndustry || 'Business'}\n` +
        `Build Package: ${form.buildPlan}\nHosting: ${form.hostingPlan}\n` +
        `Focus on what we will deliver and the value it brings. Professional but friendly tone. UK English.\n` +
        `Return ONLY the paragraph text.`
      )
      u('requirements', text.replace(/```/g, '').trim())
    } catch (e) { console.error(e) }
    setAiLoading(false)
  }

  const addExtra = () => {
    if (!newExtra.trim()) return
    u('extras', [...form.extras, { text: newExtra, price: '' }])
    setNewExtra('')
  }

  const download = () => {
    setDownloading(true)
    const html = buildHTML(form, build, hosting, buildPrice, monthlyPrice, hrAddon)
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `DH-Proposal-${(form.clientBusiness || 'Client').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.html`
    a.click()
    URL.revokeObjectURL(url)
    setDownloading(false)
  }

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', color: 'var(--sub)' }}>Fill in client details, select packages, download a branded proposal</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setPreview(p => !p)}>
            {preview ? 'Edit' : 'Preview'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={download}>
            {downloading ? 'Generating…' : 'Download'}
          </button>
        </div>
      </div>

      {!preview ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Row 1 — Client details */}
          <div className="card card-pad">
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>Client Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: '12px' }}>
              <div><label className="inp-label">Contact Name *</label><input className="inp" value={form.clientName}     onChange={e => u('clientName', e.target.value)}     placeholder="Jane Smith" />
              <div><label className="inp-label">Business Name *</label><input className="inp" value={form.clientBusiness} onChange={e => u('clientBusiness', e.target.value)} placeholder="Acme Ltd" />
              <div><label className="inp-label">Email</label><input className="inp" value={form.clientEmail}    onChange={e => u('clientEmail', e.target.value)}    placeholder="jane@acme.co.uk" type="email" />
              <div><label className="inp-label">Industry</label><input className="inp" value={form.clientIndustry} onChange={e => u('clientIndustry', e.target.value)} placeholder="Plumbing, Retail…" />
            </div>
          </div>

          {/* Row 2 — Build + Hosting side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>

            {/* Build */}
            <div className="card card-pad">
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>
                🏗️ Website Build — One-off
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {BUILD_PACKAGES.map(p => (
                  <button key={p.name} onClick={() => u('buildPlan', p.name)} style={{
                    padding: '12px 14px', borderRadius: '8px', border: '2px solid',
                    borderColor: form.buildPlan === p.name ? 'var(--gold)' : 'var(--border)',
                    background: form.buildPlan === p.name ? 'rgba(0,194,255,0.06)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: p.features.length > 0 ? '6px' : 0 }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 700, color: form.buildPlan === p.name ? 'var(--gold)' : 'var(--text)' }}>{p.name}</span>
                      {p.price && <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--green)' }}>£{p.price}</span>}
                      {!p.price && <span style={{ fontSize: '13px', color: 'var(--sub)' }}>Custom</span>}
                    </div>
                    {p.features.length > 0 && (
                      <div style={{ fontSize: '11.5px', color: 'var(--sub)' }}>{p.features.slice(0, 3).join(' · ')}{p.features.length > 3 ? ` +${p.features.length - 3} more` : ''}</div>
                    )}
                  </button>
                ))}
              </div>
              {form.buildPlan === 'Custom Build' || form.buildPlan === 'Custom' && (
                <div><label className="inp-label">Custom Build Price (£)</label><input className="inp" value={form.customBuildPrice} onChange={e => u('customBuildPrice', e.target.value)} type="number" style={{ marginTop: '10px' }} />
              )}
            </div>

            {/* Hosting */}
            <div className="card card-pad">
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>
                ☁️ Hosting & Support — Monthly
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {HOSTING_PACKAGES.map(p => (
                  <button key={p.name} onClick={() => u('hostingPlan', p.name)} style={{
                    padding: '12px 14px', borderRadius: '8px', border: '2px solid',
                    borderColor: form.hostingPlan === p.name ? 'var(--green)' : 'var(--border)',
                    background: form.hostingPlan === p.name ? 'rgba(0,229,160,0.06)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: p.features.length > 0 ? '6px' : 0 }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 700, color: form.hostingPlan === p.name ? 'var(--green)' : 'var(--text)' }}>{p.name}</span>
                      {p.monthly && <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gold)' }}>£{p.monthly}/mo</span>}
                      {!p.monthly && <span style={{ fontSize: '13px', color: 'var(--sub)' }}>Custom</span>}
                    </div>
                    {p.features.length > 0 && (
                      <div style={{ fontSize: '11.5px', color: 'var(--sub)' }}>{p.features.slice(0, 3).join(' · ')}{p.features.length > 3 ? ` +${p.features.length - 3} more` : ''}</div>
                    )}
                  </button>
                ))}
              </div>
              {form.hostingPlan === 'Custom Hosting' && (
                <div><label className="inp-label">Custom Monthly (£)</label><input className="inp" value={form.customMonthly} onChange={e => u('customMonthly', e.target.value)} type="number" style={{ marginTop: '10px' }} />
              )}

              {/* HR Add-on */}
              <div style={{ marginTop: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>HR System Add-on</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {HR_ADDONS.map(hr => (
                    <button key={hr.name} onClick={() => u('hr_addon', hr.name)} style={{
                      padding: '10px 14px', borderRadius: '6px', border: '1px solid', textAlign: 'left', cursor: 'pointer',
                      borderColor: form.hr_addon === hr.name ? 'var(--blue)' : 'var(--border)',
                      background: form.hr_addon === hr.name ? 'rgba(139,92,246,0.06)' : 'transparent',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: '13px', fontWeight: form.hr_addon === hr.name ? 700 : 400, color: form.hr_addon === hr.name ? 'var(--blue)' : 'var(--text)' }}>{hr.label}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--blue)' }}>
                        {hr.price ? `£${hr.price.toLocaleString()}` : hr.monthly ? `£${hr.monthly}/mo` : '—'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Row 3 — Price summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            {[
              { label: 'One-off Build',   value: buildPrice ? `£${buildPrice}` : '—',        color: 'var(--green)'  },
              { label: 'Monthly Hosting', value: monthlyPrice ? `£${monthlyPrice}/mo` : '—', color: 'var(--gold)' },
              { label: 'First Year Total',value: buildPrice && monthlyPrice ? `£${buildPrice + (monthlyPrice * 12)}` : '—', color: 'var(--amber)' },
            ].map(s => (
              <div key={s.label} style={{ padding: '14px 18px', background: 'var(--bg2)', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 800, color: s.color, fontFamily: 'var(--font-display)' }}>{s.value}</div>
                <div style={{ fontSize: '12px', color: 'var(--sub)', marginTop: '4px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Row 4 — Project overview + extras + dates */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
            <div className="card card-pad">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Project Overview</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input className="inp" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && aiWrite()}
                    placeholder="topic for AI…" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '5px 10px', color: 'var(--text)', fontSize: '12px', width: '140px' }} />
                  <button className="btn btn-ghost btn-sm" onClick={aiWrite}>{aiLoading ? '…' : 'AI'}</button>
                </div>
              </div>
              <textarea className="inp" value={form.requirements} onChange={e => u('requirements', e.target.value)} rows={5}
                placeholder="Describe what you'll build and the value it brings…"
                style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', color: 'var(--text)', fontSize: '13.5px', resize: 'vertical', lineHeight: 1.6 }}
                onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            <div className="card card-pad">
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Add-ons & Dates</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <input className="inp" value={newExtra} onChange={e => setNewExtra(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExtra()}
                  placeholder="Extra service…" style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text)', fontSize: '13px' }} />
                <button className="btn btn-primary btn-sm" onClick={addExtra}><Plus size={12}/>
              </div>
              {form.extras.map((ex, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                  <span style={{ flex: 1, fontSize: '13px' }}>• {ex.text}</span>
                  <input className="inp" value={ex.price} onChange={e => { const x = [...form.extras]; x[i].price = e.target.value; u('extras', x) }}
                    placeholder="£" style={{ width: '55px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '4px 8px', color: 'var(--text)', fontSize: '12px' }} />
                  <button onClick={() => u('extras', form.extras.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}><Trash2 size={13} /></button>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div><label className="inp-label">Timeline</label><input className="inp" value={form.timeline} onChange={e => u('timeline', e.target.value)} />
                <div><label className="inp-label">Valid Until</label><input className="inp" value={form.validUntil} onChange={e => u('validUntil', e.target.value)} type="date" />
                <div><label className="inp-label">Prepared By</label><input className="inp" value={form.preparedBy} onChange={e => u('preparedBy', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <iframe srcDoc={buildHTML(form, build, hosting, buildPrice, monthlyPrice, hrAddon)}
            style={{ width: '100%', height: '85vh', border: 'none' }} title="Proposal Preview" />
        </div>
      )}
    </div>
    </div>
    </div>
    </div>
    </div>
    </div>
    </div>
    </div>
    </div>
  )
}

function buildHTML(form, build, hosting, buildPrice, monthlyPrice, hrAddon) {
  const buildFeatures   = form.buildPlan === 'Custom Build' || form.buildPlan === 'Custom' ? [] : (build?.features || [])
  const hostingFeatures = form.hostingPlan === 'Custom Hosting' ? [] : (hosting?.features || [])
  const extrasTotal     = form.extras.reduce((s, e) => s + (Number(e.price) || 0), 0)
  const hrPrice         = hrAddon?.price || 0
  const hrMonthly       = hrAddon?.monthly || 0
  const firstYear       = buildPrice + hrPrice + ((monthlyPrice + hrMonthly) * 12) + extrasTotal

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Proposal — ${form.clientBusiness || 'Client'}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4ff;color:#0f172a;padding:32px 20px}
  .wrap{max-width:760px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.1)}
  .hdr{background:linear-gradient(135deg,var(--charcoal),#0EA5E9);padding:40px 48px;color:#fff}
  .logo{font-size:22px;font-weight:800;letter-spacing:-.5px;margin-bottom:24px;opacity:.9}
  .logo span{opacity:.6}
  h1{font-size:30px;font-weight:800;margin-bottom:6px}
  .hdr p{opacity:.85;font-size:15px}
  .valid{display:inline-block;background:rgba(255,255,255,.15);padding:4px 14px;border-radius:20px;font-size:12px;font-weight:600;margin-top:10px}
  .body{padding:40px 48px}
  .section{margin-bottom:32px}
  .stitle{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--charcoal);margin-bottom:12px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .ibox{background:#f8faff;border:1px solid #e2e8f4;border-radius:10px;padding:12px 16px}
  .ilabel{font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;margin-bottom:2px}
  .ivalue{font-size:14px;font-weight:600;color:#0f172a}
  .pkg-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
  .pkg{border-radius:12px;padding:22px;border:2px solid}
  .pkg-build{background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border-color:var(--charcoal)}
  .pkg-hosting{background:linear-gradient(135deg,#F0FDF4,#DCFCE7);border-color:#16A34A}
  .pkg-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
  .pkg-label-build{color:var(--charcoal)}
  .pkg-label-hosting{color:#16A34A}
  .pkg-name{font-size:18px;font-weight:800;margin-bottom:4px}
  .pkg-price{font-size:26px;font-weight:800;margin-bottom:12px}
  .features{list-style:none}
  .features li{font-size:13px;padding:4px 0;display:flex;gap:8px;align-items:flex-start;border-bottom:1px solid rgba(0,0,0,.06)}
  .features li:before{content:"✓";font-weight:700;flex-shrink:0;margin-top:1px}
  .feat-build li:before{color:var(--charcoal)}
  .feat-hosting li:before{color:#16A34A}
  .summary{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:24px 0}
  .sum-box{text-align:center;padding:16px;border-radius:12px;background:#f8faff;border:1px solid #e2e8f4}
  .sum-val{font-size:24px;font-weight:800;margin-bottom:4px}
  .sum-label{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}
  .req{background:#f8faff;border-left:4px solid var(--charcoal);border-radius:0 10px 10px 0;padding:16px 20px;font-size:14px;line-height:1.7;color:#334155}
  .extras table{width:100%;border-collapse:collapse}
  .extras td,.extras th{padding:9px 12px;text-align:left;border-bottom:1px solid #e2e8f4;font-size:13.5px}
  .extras th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:600}
  .ftr{padding:24px 48px;background:#f8faff;border-top:1px solid #e2e8f4;display:flex;justify-content:space-between;align-items:center}
  .ftr-co{font-size:14px;font-weight:700}
  .ftr-meta{font-size:12px;color:#94a3b8;text-align:right}
  @media print{body{padding:0;background:#fff}.wrap{box-shadow:none;border-radius:0}}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <div class="logo">DH<span>WEBSERVICES</span></div>
    <h1>Website Proposal</h1>
    <p>Prepared for ${form.clientBusiness || 'Your Business'} · ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</p>
    ${form.validUntil ? `<div class="valid">Valid until ${new Date(form.validUntil).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>` : ''}
  </div>
  <div class="body">
    <div class="section">
      <div class="stitle">Client Information</div>
      <div class="info-grid">
        <div class="ibox"><div class="ilabel">Contact</div><div class="ivalue">${form.clientName||'—'}</div></div>
        <div class="ibox"><div class="ilabel">Business</div><div class="ivalue">${form.clientBusiness||'—'}</div></div>
        ${form.clientEmail?`<div class="ibox"><div class="ilabel">Email</div><div class="ivalue">${form.clientEmail}</div></div>`:''}
        ${form.clientIndustry?`<div class="ibox"><div class="ilabel">Industry</div><div class="ivalue">${form.clientIndustry}</div></div>`:''}
        ${form.timeline?`<div class="ibox"><div class="ilabel">Timeline</div><div class="ivalue">${form.timeline}</div></div>`:''}
      </div>
    </div>

    ${form.requirements?`<div class="section"><div class="stitle">Project Overview</div><div class="req">${form.requirements}</div></div>`:''}

    <div class="section">
      <div class="stitle">Your Package</div>
      <div class="pkg-grid">
        <div class="pkg pkg-build">
          <div class="pkg-label pkg-label-build">Website Build — One-off</div>
          <div class="pkg-name">${form.buildPlan}</div>
          <div class="pkg-price" style="color:var(--charcoal)">£${buildPrice||'POA'}</div>
          ${buildFeatures.length>0?`<ul class="features feat-build">${buildFeatures.map(f=>`<li>${f}</li>`).join('')}</ul>`:''}
        </div>
        <div class="pkg pkg-hosting">
          <div class="pkg-label pkg-label-hosting">Hosting &amp; Support — Monthly</div>
          <div class="pkg-name">${form.hostingPlan}</div>
          <div class="pkg-price" style="color:#16A34A">£${monthlyPrice||'POA'}/mo</div>
          ${hostingFeatures.length>0?`<ul class="features feat-hosting">${hostingFeatures.map(f=>`<li>${f}</li>`).join('')}</ul>`:''}
        </div>
      </div>
      <div class="summary">
        <div class="sum-box"><div class="sum-val" style="color:var(--charcoal)">£${buildPrice||'—'}</div><div class="sum-label">One-off Build</div></div>
        <div class="sum-box"><div class="sum-val" style="color:#16A34A">£${monthlyPrice||'—'}/mo</div><div class="sum-label">Monthly Hosting</div></div>
        <div class="sum-box"><div class="sum-val" style="color:#F59E0B">£${firstYear||'—'}</div><div class="sum-label">First Year Total</div></div>
      </div>
    </div>

    ${form.extras.length>0?`
    <div class="section extras">
      <div class="stitle">Additional Services</div>
      <table><tr><th>Service</th><th>Price</th></tr>
        ${form.extras.map(e=>`<tr><td>${e.text}</td><td>${e.price?'£'+e.price:'POA'}</td></tr>`).join('')}
      </table>
    </div>`:''}
  </div>
  <div class="ftr">
    <div>
      <div class="ftr-co">DH Website Services</div>
      <div style="font-size:12px;color:#94a3b8">clients@dhwebsiteservices.co.uk · dhwebsiteservices.co.uk<br/>36B Coedpenmaen Road, Pontypridd, CF37 4LP</div>
    </div>
    <div class="ftr-meta">
      <div>Prepared by ${form.preparedBy||'DH Team'}</div>
      <div>${new Date().toLocaleDateString('en-GB')}</div>
    </div>
  </div>
</div>
</body></html>`
}
