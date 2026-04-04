import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const BUILDS = [
  { id:'starter',  name:'Starter',    price:449,  monthly:37,  features:['Up to 5 pages','Mobile responsive','Contact form','Basic SEO','1 revision round'] },
  { id:'growth',   name:'Growth',     price:999,  monthly:83,  features:['Up to 10 pages','Advanced SEO','Blog/news section','Google Analytics','3 revision rounds','Social media integration'] },
  { id:'pro',      name:'Pro',        price:1499, monthly:125, features:['Unlimited pages','E-commerce ready','Custom animations','Priority support','Unlimited revisions','Full CMS'] },
  { id:'enterprise',name:'Enterprise',price:2499, monthly:208, features:['Everything in Pro','HR portal integration','Custom integrations','Dedicated account manager','SLA guarantee'] },
]
const HOSTING = [
  { id:'h1', name:'Starter Hosting',      price:35,  features:['99.9% uptime','SSL certificate','Daily backups','Email support'] },
  { id:'h2', name:'Professional Hosting', price:65,  features:['Everything in Starter','CDN included','Priority support','Weekly reports'] },
  { id:'h3', name:'Business Hosting',     price:109, features:['Everything in Pro','Dedicated resources','Phone support','Custom domain emails'] },
]
const EXTRAS = [
  { id:'e1', name:'Logo Design',                    price:199, group:'Creative' },
  { id:'e2', name:'Copywriting (per page)',         price:49,  group:'Creative' },
  { id:'e3', name:'SEO Audit',                      price:149, group:'Marketing' },
  { id:'e4', name:'Google Ads Setup',               price:299, group:'Marketing' },
  { id:'e5', name:'Social Media Setup',             price:99,  group:'Marketing' },
  { id:'e8', name:'Maintenance Plan',               price:49,  group:'Support' },
  { id:'blog', name:'Blog / News section',          price:0,   group:'Content', note:'Included in Growth+' },
  { id:'gallery', name:'Photo gallery',             price:99,  group:'Content' },
  { id:'video', name:'Video embed / hero video',    price:99,  group:'Content' },
  { id:'booking', name:'Booking / appointment system', price:350, group:'Business' },
  { id:'ecommerce', name:'E-commerce store',        price:500, group:'Business', note:'Included in Pro+' },
  { id:'payments', name:'Online payments (Stripe)', price:199, group:'Business' },
  { id:'members', name:'Members / login area',      price:299, group:'Business' },
  { id:'livechat', name:'Live chat integration',    price:79,  group:'Business' },
  { id:'seo', name:'Full SEO setup',                price:0,   group:'Marketing', note:'Included in Growth+' },
  { id:'analytics', name:'Google Analytics setup',  price:0,   group:'Marketing', note:'Included in Growth+' },
  { id:'mailchimp', name:'Email marketing integration', price:149, group:'Marketing' },
  { id:'social-feeds', name:'Social media links / feeds', price:79, group:'Marketing' },
  { id:'multilang', name:'Multi-language support',  price:399, group:'Technical' },
  { id:'hr', name:'HR portal integration',          price:0,   group:'Technical', note:'Included in Enterprise' },
  { id:'crm', name:'CRM integration',               price:299, group:'Technical' },
  { id:'api', name:'Custom API integration',        price:399, group:'Technical' },
]

const EXTRA_GROUPS = ['Creative', 'Content', 'Business', 'Marketing', 'Technical', 'Support']

export default function Proposals() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [form, setForm] = useState({
    clientBusiness: params.get('business') || '',
    clientName: params.get('name') || '',
    clientEmail: params.get('email') || '',
    clientPhone: params.get('phone') || '',
    clientIndustry:'',
    timeline:'',
    requirements: params.get('notes') || '',
    preparedBy: user?.name || 'DH Team',
    validUntil:'',
  })
  const [selectedBuild, setBuild]   = useState(null)
  const [payMonthly, setPayMonthly] = useState(false)
  const [selectedHosting, setHosting] = useState(null)
  const [selectedExtras, setExtras] = useState([])
  const [step, setStep]             = useState(0)
  const [downloading, setDownloading] = useState(false)
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const toggleExtra = (id) => setExtras(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id])

  const build = BUILDS.find(b => b.id === selectedBuild)
  const hosting = HOSTING.find(h => h.id === selectedHosting)
  const extras = EXTRAS.filter(e => selectedExtras.includes(e.id))
  const extrasByGroup = EXTRA_GROUPS
    .map((group) => ({ group, items: EXTRAS.filter((extra) => extra.group === group) }))
    .filter((section) => section.items.length)
  const extrasTotal = extras.reduce((s, e) => s + e.price, 0)
  const buildPrice = build ? (payMonthly ? 0 : build.price) : 0
  const monthlyTotal = (hosting?.price || 0) + (payMonthly && build ? build.monthly : 0)
  const oneOffTotal = buildPrice + extrasTotal
  const firstYearTotal = oneOffTotal + (monthlyTotal * 12)

  const download = () => {
    setDownloading(true)
    const html = generateHTML()
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `DH-Proposal-${(form.clientBusiness||'Client').replace(/\s+/g,'-')}-${new Date().toISOString().split('T')[0]}.html`
    a.click()
    URL.revokeObjectURL(url)
    setDownloading(false)
  }

  const generateHTML = () => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Proposal — ${form.clientBusiness}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#faf8f4;color:#1a1612;line-height:1.6}
.wrap{max-width:800px;margin:0 auto;padding:40px 24px}
.header{background:#1a1612;color:#fff;padding:40px;border-radius:12px;margin-bottom:32px}
.logo{font-size:28px;font-weight:700;letter-spacing:-0.02em;margin-bottom:8px}
.logo span{color:#c9a84c}
.client-name{font-size:22px;font-weight:600;margin-bottom:4px}
.sub{font-size:14px;opacity:0.6}
.section{background:#fff;border:1px solid #e2ddd5;border-radius:10px;padding:28px;margin-bottom:20px}
.section-title{font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#a8a096;margin-bottom:16px}
.package{padding:16px;border:2px solid #b8960c;border-radius:8px;background:#fffdf5;margin-bottom:12px}
.package-name{font-size:18px;font-weight:700;color:#b8960c;margin-bottom:4px}
.feature-list{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
.feature{font-size:13px;color:#6b6158;display:flex;align-items:center;gap:6px}
.feature::before{content:"✓";color:#3a7d44;font-weight:700}
.total{background:#1a1612;color:#fff;border-radius:10px;padding:24px;margin-top:20px}
.total-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);font-size:14px}
.total-row.big{font-size:20px;font-weight:700;border:none;padding-top:16px;color:#c9a84c}
.footer{text-align:center;padding:32px;font-size:12px;color:#a8a096;margin-top:32px}
</style></head><body><div class="wrap">
<div class="header">
  <div class="logo">DH <span>Website Services</span></div>
  <div style="opacity:0.4;font-size:12px;margin-bottom:24px">Website Design & Development</div>
  <div class="client-name">Proposal for ${form.clientBusiness}</div>
  <div class="sub">Prepared for ${form.clientName} · ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
  ${form.validUntil ? `<div class="sub">Valid until ${new Date(form.validUntil).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>` : ''}
</div>
${form.requirements ? `<div class="section"><div class="section-title">Project Overview</div><p style="font-size:14px;color:#6b6158;line-height:1.8">${form.requirements}</p></div>` : ''}
${build ? `<div class="section"><div class="section-title">Website Package</div>
<div class="package">
  <div class="package-name">${build.name} Website</div>
  <div style="font-size:22px;font-weight:700;margin:6px 0">${payMonthly ? `£${build.monthly}/mo` : `£${build.price.toLocaleString()}`}${payMonthly ? ' <span style="font-size:13px;opacity:0.6">over 12 months</span>' : ''}</div>
  <div class="feature-list">${build.features.map(f => `<div class="feature">${f}</div>`).join('')}</div>
</div></div>` : ''}
${hosting ? `<div class="section"><div class="section-title">Hosting Plan</div>
<div class="package" style="border-color:#1a56db;background:#f8f9ff">
  <div class="package-name" style="color:#1a56db">${hosting.name}</div>
  <div style="font-size:20px;font-weight:700;margin:6px 0">£${hosting.price}/month</div>
  <div class="feature-list">${hosting.features.map(f => `<div class="feature">${f}</div>`).join('')}</div>
</div></div>` : ''}
${extras.length > 0 ? `<div class="section"><div class="section-title">Additional Services</div>
<table style="width:100%;border-collapse:collapse">${extras.map(e => `<tr><td style="padding:8px 0;font-size:14px;border-bottom:1px solid #e2ddd5">${e.name}${e.note ? `<div style="font-size:11px;color:#a8a096;margin-top:2px">${e.note}</div>` : ''}</td><td style="text-align:right;font-weight:600;border-bottom:1px solid #e2ddd5">${e.price > 0 ? `£${e.price}` : 'Included'}</td></tr>`).join('')}</table></div>` : ''}
<div class="total">
  ${oneOffTotal > 0 ? `<div class="total-row"><span>One-off payment</span><span>£${oneOffTotal.toLocaleString()}</span></div>` : ''}
  ${monthlyTotal > 0 ? `<div class="total-row"><span>Monthly (hosting${payMonthly?' + build':''} )</span><span>£${monthlyTotal}/mo</span></div>` : ''}
  <div class="total-row big"><span>First Year Total</span><span>£${firstYearTotal.toLocaleString()}</span></div>
</div>
<div class="footer">
  <strong>DH Website Services</strong><br/>
  david@dhwebsiteservices.co.uk · dhwebsiteservices.co.uk<br/>
  36B Coedpenmaen Road, Pontypridd, CF37 4LP<br/><br/>
  Prepared by ${form.preparedBy}
</div>
</div></body></html>`

  const steps = ['Client Details', 'Choose Package', 'Hosting', 'Extras', 'Review']

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Proposal Builder</h1></div>
        {step === 4 && <button className="btn btn-primary" onClick={download} disabled={downloading}>{downloading ? 'Generating...' : '⬇ Download PDF'}</button>}
      </div>

      {/* Progress */}
      <div style={{ display:'flex', gap:0, marginBottom:28, background:'var(--card)', borderRadius:10, border:'1px solid var(--border)', overflow:'hidden' }}>
        {steps.map((s, i) => (
          <button key={i} onClick={() => setStep(i)} style={{ flex:1, padding:'12px 8px', border:'none', borderRight: i < steps.length-1 ? '1px solid var(--border)' : 'none', background: step === i ? 'var(--text)' : 'transparent', color: step === i ? 'var(--bg)' : 'var(--sub)', fontSize:12, fontWeight: step === i ? 600 : 400, cursor:'pointer', transition:'all 0.15s' }}>
            <span style={{ display:'block', fontFamily:'var(--font-mono)', fontSize:9, marginBottom:3, opacity:0.6 }}>STEP {i+1}</span>
            {s}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="card card-pad" style={{ maxWidth:560 }}>
          <div className="fg">
            <div><label className="lbl">Business Name</label><input className="inp" value={form.clientBusiness} onChange={e=>sf('clientBusiness',e.target.value)} placeholder="Acme Ltd"/></div>
            <div><label className="lbl">Contact Name</label><input className="inp" value={form.clientName} onChange={e=>sf('clientName',e.target.value)} placeholder="John Smith"/></div>
            <div><label className="lbl">Email</label><input className="inp" type="email" value={form.clientEmail} onChange={e=>sf('clientEmail',e.target.value)}/></div>
            <div><label className="lbl">Phone</label><input className="inp" value={form.clientPhone} onChange={e=>sf('clientPhone',e.target.value)}/></div>
            <div><label className="lbl">Industry</label><input className="inp" value={form.clientIndustry} onChange={e=>sf('clientIndustry',e.target.value)} placeholder="e.g. Retail, Healthcare"/></div>
            <div><label className="lbl">Timeline</label><input className="inp" value={form.timeline} onChange={e=>sf('timeline',e.target.value)} placeholder="e.g. 6 weeks"/></div>
            <div><label className="lbl">Valid Until</label><input className="inp" type="date" value={form.validUntil} onChange={e=>sf('validUntil',e.target.value)}/></div>
            <div><label className="lbl">Prepared By</label><input className="inp" value={form.preparedBy} onChange={e=>sf('preparedBy',e.target.value)}/></div>
            <div className="fc"><label className="lbl">Project Requirements / Notes</label><textarea className="inp" rows={4} value={form.requirements} onChange={e=>sf('requirements',e.target.value)} style={{ resize:'vertical' }} placeholder="Brief description of what the client needs..."/></div>
          </div>
          <button className="btn btn-primary" style={{ marginTop:16 }} onClick={() => setStep(1)}>Next: Choose Package →</button>
        </div>
      )}

      {step === 1 && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:16, marginBottom:20 }}>
            {BUILDS.map(b => (
              <button key={b.id} onClick={() => setBuild(b.id)} style={{ textAlign:'left', padding:'20px', borderRadius:10, border:`2px solid ${selectedBuild===b.id?'var(--accent)':'var(--border)'}`, background: selectedBuild===b.id ? 'var(--accent-soft)' : 'var(--card)', cursor:'pointer', transition:'all 0.15s' }}>
                <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>{b.name}</div>
                <div style={{ fontSize:20, fontWeight:700, color:'var(--accent)', marginBottom:10 }}>£{b.price.toLocaleString()}</div>
                {b.features.slice(0,3).map(f => <div key={f} style={{ fontSize:12, color:'var(--sub)', marginBottom:2 }}>✓ {f}</div>)}
              </button>
            ))}
          </div>
          {selectedBuild && (
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', background:'var(--card)', borderRadius:10, border:'1px solid var(--border)', marginBottom:16 }}>
              <span style={{ fontSize:13, color:'var(--sub)' }}>Payment option:</span>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setPayMonthly(false)} className={'pill'+(payMonthly?'':' on')}>Pay in Full — £{build?.price.toLocaleString()}</button>
                <button onClick={() => setPayMonthly(true)} className={'pill'+(payMonthly?' on':'')}>Pay Monthly — £{build?.monthly}/mo</button>
              </div>
            </div>
          )}
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-outline" onClick={() => setStep(0)}>← Back</button>
            <button className="btn btn-primary" onClick={() => setStep(2)}>Next: Hosting →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:16, marginBottom:20 }}>
            <button onClick={() => setHosting(null)} style={{ textAlign:'left', padding:'20px', borderRadius:10, border:`2px solid ${!selectedHosting?'var(--border2)':'var(--border)'}`, background: !selectedHosting ? 'var(--bg2)' : 'var(--card)', cursor:'pointer' }}>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>No Hosting</div>
              <div style={{ fontSize:13, color:'var(--sub)' }}>Client handles their own hosting</div>
            </button>
            {HOSTING.map(h => (
              <button key={h.id} onClick={() => setHosting(h.id)} style={{ textAlign:'left', padding:'20px', borderRadius:10, border:`2px solid ${selectedHosting===h.id?'var(--blue)':'var(--border)'}`, background: selectedHosting===h.id ? 'var(--blue-bg)' : 'var(--card)', cursor:'pointer', transition:'all 0.15s' }}>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>{h.name}</div>
                <div style={{ fontSize:20, fontWeight:700, color:'var(--blue)', marginBottom:10 }}>£{h.price}/mo</div>
                {h.features.slice(0,3).map(f => <div key={f} style={{ fontSize:12, color:'var(--sub)', marginBottom:2 }}>✓ {f}</div>)}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-outline" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Next: Extras →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div style={{ display:'grid', gap:20, marginBottom:20 }}>
            {extrasByGroup.map(({ group, items }) => (
              <div key={group}>
                <div className="section-label" style={{ marginBottom:10 }}>{group}</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:12 }}>
                  {items.map(e => (
                    <button key={e.id} onClick={() => toggleExtra(e.id)} style={{ textAlign:'left', padding:'16px', borderRadius:10, border:`2px solid ${selectedExtras.includes(e.id)?'var(--green)':'var(--border)'}`, background: selectedExtras.includes(e.id) ? 'var(--green-bg)' : 'var(--card)', cursor:'pointer', transition:'all 0.15s' }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{e.name}</div>
                      <div style={{ fontSize:16, fontWeight:700, color:'var(--green)', marginTop:4 }}>
                        {e.price > 0 ? `£${e.price}` : 'Included'}
                      </div>
                      {e.note ? (
                        <div style={{ fontSize:11.5, color:'var(--faint)', marginTop:4, lineHeight:1.4 }}>
                          {e.note}
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-outline" onClick={() => setStep(2)}>← Back</button>
            <button className="btn btn-primary" onClick={() => setStep(4)}>Review →</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:20 }}>
          <div className="card card-pad">
            <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:600, marginBottom:16 }}>Proposal Summary</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ padding:'14px', background:'var(--bg2)', borderRadius:8 }}>
                <div className="lbl" style={{ marginBottom:6 }}>Client</div>
                <div style={{ fontSize:15, fontWeight:600 }}>{form.clientBusiness || 'Not set'}</div>
                <div style={{ fontSize:13, color:'var(--sub)' }}>{form.clientName} · {form.clientEmail}</div>
              </div>
              {build && <div style={{ padding:'14px', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius:8 }}>
                <div className="lbl" style={{ marginBottom:4 }}>Package</div>
                <div style={{ fontWeight:600 }}>{build.name} — {payMonthly ? `£${build.monthly}/mo` : `£${build.price.toLocaleString()}`}</div>
              </div>}
              {hosting && <div style={{ padding:'14px', background:'var(--blue-bg)', border:'1px solid rgba(26,86,219,0.2)', borderRadius:8 }}>
                <div className="lbl" style={{ marginBottom:4 }}>Hosting</div>
                <div style={{ fontWeight:600 }}>{hosting.name} — £{hosting.price}/mo</div>
              </div>}
              {extras.length > 0 && <div style={{ padding:'14px', background:'var(--green-bg)', border:'1px solid var(--green)', borderRadius:8 }}>
                <div className="lbl" style={{ marginBottom:6 }}>Extras</div>
                {extras.map(e => <div key={e.id} style={{ fontSize:13, display:'flex', justifyContent:'space-between', marginBottom:3, gap:12 }}><span>{e.name}</span><span style={{ fontWeight:600, whiteSpace:'nowrap' }}>{e.price > 0 ? `£${e.price}` : 'Included'}</span></div>)}
              </div>}
            </div>
          </div>

          <div>
            <div className="card card-pad" style={{ marginBottom:16 }}>
              <div className="lbl" style={{ marginBottom:12 }}>Totals</div>
              {oneOffTotal > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:8 }}><span>One-off</span><span style={{ fontWeight:600 }}>£{oneOffTotal.toLocaleString()}</span></div>}
              {monthlyTotal > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:8 }}><span>Monthly</span><span style={{ fontWeight:600 }}>£{monthlyTotal}/mo</span></div>}
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:18, fontWeight:700, color:'var(--accent)', paddingTop:10, borderTop:'1px solid var(--border)', marginTop:8 }}>
                <span>Year 1 Total</span><span>£{firstYearTotal.toLocaleString()}</span>
              </div>
            </div>
            <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center', padding:'13px' }} onClick={download} disabled={downloading}>
              {downloading ? 'Generating...' : '⬇ Download Proposal'}
            </button>
            <button className="btn btn-outline" style={{ width:'100%', justifyContent:'center', marginTop:8 }} onClick={() => setStep(0)}>
              ← Edit Proposal
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
