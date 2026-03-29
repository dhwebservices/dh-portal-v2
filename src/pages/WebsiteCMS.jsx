import { useState, useEffect } from 'react'
import { Save, RefreshCw, Globe, Type, Tag, HelpCircle, Megaphone, DollarSign, Plus, Trash2, ChevronDown, ChevronUp, Eye } from 'lucide-react'
import { Card, Btn, Input } from '../components/UI'
import { supabase } from '../utils/supabase'

const SUPABASE_URL = 'https://xtunnfdwltfesscmpove.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM'

const SECTIONS = [
  { key: 'hero',     label: 'Hero Section',      icon: Globe,       color: 'var(--gold)' },
  { key: 'banner',   label: 'Announcement Banner',icon: Megaphone,   color: 'var(--amber)' },
  { key: 'services', label: 'Services',           icon: Tag,         color: 'var(--green)' },
  { key: 'pricing',  label: 'Pricing Packages',   icon: DollarSign,  color: 'var(--blue)' },
  { key: 'faq',      label: 'FAQ',                icon: HelpCircle,  color: 'var(--red)' },
  { key: 'contact',  label: 'Contact Details',    icon: Type,        color: 'var(--sub)' },
]

const DEFAULTS = {
  hero: {
    headline: 'Elevate Your Digital Presence',
    subheadline: 'Modern, high-performance websites built for growth. From concept to deployment, we deliver excellence with full functionality and strategic design.',
    cta_primary: 'View Pricing',
    cta_secondary: 'Start a Project',
    pill1: '⚡ Lightning Fast',
    pill2: '✓ Fully Functional',
    pill3: '🚀 Ready to Deploy',
  },
  banner: {
    text: 'First month free on Starter plans | Students get free pay monthly starter sites',
    enabled: true,
  },
  services: [
    { icon: '💻', title: 'Custom Web Development', desc: 'Tailored solutions built from the ground up for your unique business needs. Production-ready code, not templates.', color: 'var(--gold)' },
    { icon: '🎨', title: 'User-Centric Design', desc: 'Beautiful interfaces that engage visitors and drive conversions. Every pixel intentional, every interaction purposeful.', color: 'var(--purple2)' },
    { icon: '🛠', title: 'Full Support & Maintenance', desc: 'Ongoing maintenance to keep your site running at peak performance. We\'re here long after launch.', color: 'var(--green)' },
    { icon: '👥', title: 'HR System Integration', desc: 'Full HR portal built into your website — onboarding, leave, payslips, timesheets and more.', color: 'var(--amber)' },
  ],
  pricing: {
    builds: [
      { name: 'Starter', price: 449, delivery: '2–3 weeks', revisions: '1 round', badge: '', features: ['5-page professional website', 'Mobile responsive design', 'Basic SEO setup', 'Contact form', 'Google Maps embed', 'SSL certificate'] },
      { name: 'Growth', price: 999, delivery: '3–4 weeks', revisions: '2 rounds', badge: 'Most Popular', features: ['10-page website', 'Blog section', 'Full SEO setup', 'Branding integration', 'Google Analytics', 'Social media links', 'SSL certificate'] },
      { name: 'Pro', price: 1499, delivery: '4–6 weeks', revisions: '3 rounds', badge: '', features: ['15 pages', 'E-commerce ready', 'Custom integrations', 'Advanced SEO', 'Blog/News section', 'Priority support', 'SSL certificate'] },
      { name: 'Enterprise + HR', price: 2499, delivery: '6–8 weeks', revisions: '3 rounds', badge: 'Most Complete', features: ['Full enterprise website', 'Integrated HR system', 'Staff onboarding portal', 'Leave & timesheet management', 'SEO & branding', 'Content creation'] },
    ],
    hosting: [
      { name: 'Starter', price: 35, badge: '', features: ['1 content update/month', '48–72hr support response', 'Weekly backups', 'Uptime monitoring'] },
      { name: 'Professional', price: 65, badge: 'Most Popular', features: ['3 content updates/month', 'Priority support', 'Weekly backups', 'SEO health check', 'Uptime monitoring'] },
      { name: 'Business', price: 109, badge: '', features: ['Unlimited content updates', 'Priority support', 'Weekly backups', 'Weekly performance tuning', 'Quarterly strategy review'] },
    ],
  },
  faq: [
    { q: 'Do you offer payment plans?', a: 'Yes — we can arrange staged payments for larger projects. Get in touch to discuss what works for you.' },
    { q: 'What happens after the project is delivered?', a: 'You get a handover call, access to all files, and ongoing support through one of our hosting & maintenance plans.' },
    { q: 'Can I upgrade my package later?', a: 'Absolutely. Many clients start on Starter and grow into Growth or Pro as their business scales.' },
    { q: 'Is hosting included in the build price?', a: 'No — hosting is a separate monthly plan. This keeps things flexible so you\'re not locked into a bundle you don\'t need.' },
    { q: 'Do you work with clients outside Wales / the UK?', a: 'Yes, we work with clients across the UK and internationally. Everything is done remotely.' },
  ],
  contact: {
    email: 'clients@dhwebsiteservices.co.uk',
    phone: '029 2002 4218',
    location: 'Cardiff, United Kingdom',
    response_time: 'Within 24 hours',
    hours_weekday: '9:00 AM – 5:00 PM GMT',
    hours_weekend: 'Next business day',
  },
}

async function loadContent(key) {
  const { data } = await supabase.from('website_content').select('content').eq('section', key).maybeSingle()
  return data?.content || null
}

async function saveContent(key, content) {
  const { data: existing } = await supabase.from('website_content').select('id').eq('section', key).maybeSingle()
  if (existing?.id) {
    await supabase.from('website_content').update({ content, updated_at: new Date().toISOString() }).eq('id', existing.id)
  } else {
    await supabase.from('website_content').insert([{ section: key, content, updated_at: new Date().toISOString() }])
  }
}

// ── Sub-editors ──────────────────────────────────────────────

function HeroEditor({ data, onChange }) {
  const u = (k, v) => onChange({ ...data, [k]: v })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={LBL}>Main Headline</label>
        <input className="inp" value={data.headline || ''} onChange={e => u('headline', e.target.value)} style={INP} />
      </div>
      <div>
        <label style={LBL}>Subheadline</label>
        <textarea className="inp" value={data.subheadline || ''} onChange={e => u('subheadline', e.target.value)} rows={3} style={{ ...INP, resize: 'vertical' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div><label style={LBL}>Primary CTA Button</label><input className="inp" value={data.cta_primary || ''} onChange={e => u('cta_primary', e.target.value)} style={INP} /></div>
        <div><label style={LBL}>Secondary CTA Button</label><input className="inp" value={data.cta_secondary || ''} onChange={e => u('cta_secondary', e.target.value)} style={INP} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <div><label style={LBL}>Feature Pill 1</label><input className="inp" value={data.pill1 || ''} onChange={e => u('pill1', e.target.value)} style={INP} /></div>
        <div><label style={LBL}>Feature Pill 2</label><input className="inp" value={data.pill2 || ''} onChange={e => u('pill2', e.target.value)} style={INP} /></div>
        <div><label style={LBL}>Feature Pill 3</label><input className="inp" value={data.pill3 || ''} onChange={e => u('pill3', e.target.value)} style={INP} /></div>
      </div>
  )
}

function BannerEditor({ data, onChange }) {
  const u = (k, v) => onChange({ ...data, [k]: v })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--bg2)', borderRadius: '6px', border: '1px solid var(--border)' }}>
        <label style={{ fontSize: '13px', fontWeight: 600, flex: 1 }}>Show announcement banner on homepage</label>
        <button onClick={() => u('enabled', !data.enabled)} style={{
          width: 44, height: 24, borderRadius: '8px', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
          background: data.enabled ? 'var(--green)' : 'var(--border)',
        }}>
          <div style={{ position: 'absolute', top: 3, left: data.enabled ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
        </button>
      </div>
      <div>
        <label style={LBL}>Banner Text</label>
        <input className="inp" value={data.text || ''} onChange={e => u('text', e.target.value)} style={INP} placeholder="e.g. First month free on Starter plans" />
        <div style={{ fontSize: '11px', color: 'var(--faint)', marginTop: '4px' }}>Use | to separate multiple messages</div>
      </div>
  )
}

function ServicesEditor({ data, onChange }) {
  const update = (i, k, v) => { const n = [...data]; n[i] = { ...n[i], [k]: v }; onChange(n) }
  const add = () => onChange([...data, { icon: '✨', title: 'New Service', desc: 'Description here.', color: 'var(--gold)' }])
  const remove = (i) => onChange(data.filter((_, j) => j !== i))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {data.map((s, i) => (
        <div key={i} style={{ padding: '16px', background: 'var(--bg2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{ fontSize: '20px' }}>{s.icon}</span>
            <span style={{ fontWeight: 700, fontSize: '14px', flex: 1 }}>{s.title}</span>
            <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}><Trash2 size={14} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '10px', marginBottom: '10px' }}>
            <div><label style={LBL}>Icon</label><input className="inp" value={s.icon || ''} onChange={e => update(i, 'icon', e.target.value)} style={INP} /></div>
            <div><label style={LBL}>Title</label><input className="inp" value={s.title || ''} onChange={e => update(i, 'title', e.target.value)} style={INP} /></div>
          </div>
          <div><label style={LBL}>Description</label><textarea className="inp" value={s.desc || ''} onChange={e => update(i, 'desc', e.target.value)} rows={2} style={{ ...INP, resize: 'vertical' }} /></div>
        </div>
      ))}
      <button onClick={add} style={{ padding: '10px', borderRadius: '6px', border: '2px dashed var(--border)', background: 'none', color: 'var(--sub)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        <Plus size={14} /> Add Service
      </button>
  )
}

function PricingEditor({ data, onChange }) {
  const [tab, setTab] = useState('builds')
  const updateBuild = (i, k, v) => { const n = { ...data, builds: [...data.builds] }; n.builds[i] = { ...n.builds[i], [k]: v }; onChange(n) }
  const updateBuildFeature = (i, fi, v) => { const n = { ...data, builds: [...data.builds] }; const f = [...n.builds[i].features]; f[fi] = v; n.builds[i] = { ...n.builds[i], features: f }; onChange(n) }
  const addBuildFeature = (i) => { const n = { ...data, builds: [...data.builds] }; n.builds[i] = { ...n.builds[i], features: [...n.builds[i].features, 'New feature'] }; onChange(n) }
  const removeBuildFeature = (i, fi) => { const n = { ...data, builds: [...data.builds] }; n.builds[i] = { ...n.builds[i], features: n.builds[i].features.filter((_, j) => j !== fi) }; onChange(n) }
  const updateHosting = (i, k, v) => { const n = { ...data, hosting: [...data.hosting] }; n.hosting[i] = { ...n.hosting[i], [k]: v }; onChange(n) }
  const updateHostingFeature = (i, fi, v) => { const n = { ...data, hosting: [...data.hosting] }; const f = [...n.hosting[i].features]; f[fi] = v; n.hosting[i] = { ...n.hosting[i], features: f }; onChange(n) }

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', background: 'var(--bg2)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
        {[['builds', 'Build Packages'], ['hosting', 'Hosting Plans']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', background: tab === k ? 'var(--gold)' : 'transparent', color: tab === k ? '#fff' : 'var(--sub)' }}>{l}</button>
        ))}
      </div>

      {tab === 'builds' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {data.builds.map((b, i) => (
            <div key={i} style={{ padding: '20px', background: 'var(--bg2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '14px', color: 'var(--gold)' }}>{b.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
                <div><label style={LBL}>Package Name</label><input className="inp" value={b.name} onChange={e => updateBuild(i, 'name', e.target.value)} style={INP} /></div>
                <div><label style={LBL}>Price (£)</label><input type="number" className="inp" value={b.price} onChange={e => updateBuild(i, 'price', Number(e.target.value))} style={INP} /></div>
                <div><label style={LBL}>Delivery</label><input className="inp" value={b.delivery} onChange={e => updateBuild(i, 'delivery', e.target.value)} style={INP} /></div>
                <div><label style={LBL}>Revisions</label><input className="inp" value={b.revisions} onChange={e => updateBuild(i, 'revisions', e.target.value)} style={INP} /></div>
              </div>
              <div><label style={LBL}>Badge (leave blank for none)</label><input className="inp" value={b.badge || ''} onChange={e => updateBuild(i, 'badge', e.target.value)} style={{ ...INP, marginBottom: '12px' }} placeholder="e.g. Most Popular" /></div>
              <div>
                <label style={LBL}>Features</label>
                {b.features.map((f, fi) => (
                  <div key={fi} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <input className="inp" value={f} onChange={e => updateBuildFeature(i, fi, e.target.value)} style={{ ...INP, flex: 1 }} />
                    <button onClick={() => removeBuildFeature(i, fi)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', flexShrink: 0 }}><Trash2 size={13} /></button>
                  </div>
                ))}
                <button onClick={() => addBuildFeature(i)} style={{ fontSize: '12px', color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                  <Plus size={12} /> Add feature
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'hosting' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {data.hosting.map((h, i) => (
            <div key={i} style={{ padding: '20px', background: 'var(--bg2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '14px', color: 'var(--green)' }}>{h.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <div><label style={LBL}>Plan Name</label><input className="inp" value={h.name} onChange={e => updateHosting(i, 'name', e.target.value)} style={INP} /></div>
                <div><label style={LBL}>Monthly Price (£)</label><input type="number" className="inp" value={h.price} onChange={e => updateHosting(i, 'price', Number(e.target.value))} style={INP} /></div>
                <div><label style={LBL}>Badge (leave blank for none)</label><input className="inp" value={h.badge || ''} onChange={e => updateHosting(i, 'badge', e.target.value)} style={INP} placeholder="e.g. Most Popular" /></div>
              </div>
              <div>
                <label style={LBL}>Features</label>
                {h.features.map((f, fi) => (
                  <div key={fi} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <input className="inp" value={f} onChange={e => updateHostingFeature(i, fi, e.target.value)} style={{ ...INP, flex: 1 }} />
                    <button onClick={() => { const n = { ...data, hosting: [...data.hosting] }; n.hosting[i] = { ...n.hosting[i], features: n.hosting[i].features.filter((_, j) => j !== fi) }; onChange(n) }} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}><Trash2 size={13} /></button>
                  </div>
                ))}
                <button onClick={() => { const n = { ...data, hosting: [...data.hosting] }; n.hosting[i] = { ...n.hosting[i], features: [...n.hosting[i].features, 'New feature'] }; onChange(n) }} style={{ fontSize: '12px', color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                  <Plus size={12} /> Add feature
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
  )
}

function FaqEditor({ data, onChange }) {
  const update = (i, k, v) => { const n = [...data]; n[i] = { ...n[i], [k]: v }; onChange(n) }
  const add = () => onChange([...data, { q: 'New question?', a: 'Answer here.' }])
  const remove = (i) => onChange(data.filter((_, j) => j !== i))
  const move = (i, dir) => { const n = [...data]; const t = n[i]; n[i] = n[i + dir]; n[i + dir] = t; onChange(n) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {data.map((f, i) => (
        <div key={i} style={{ padding: '16px', background: 'var(--bg2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--faint)', minWidth: '20px' }}>Q{i + 1}</span>
            <div style={{ flex: 1 }}><input className="inp" value={f.q} onChange={e => update(i, 'q', e.target.value)} style={INP} placeholder="Question" /></div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {i > 0 && <button onClick={() => move(i, -1)} style={ICON_BTN}><ChevronUp size={13} /></button>}
              {i < data.length - 1 && <button onClick={() => move(i, 1)} style={ICON_BTN}><ChevronDown size={13} /></button>}
              <button onClick={() => remove(i)} style={{ ...ICON_BTN, color: 'var(--red)' }}><Trash2 size={13} /></button>
            </div>
          </div>
          <textarea className="inp" value={f.a} onChange={e => update(i, 'a', e.target.value)} rows={2} style={{ ...INP, resize: 'vertical' }} placeholder="Answer" />
        </div>
      ))}
      <button onClick={add} style={{ padding: '10px', borderRadius: '6px', border: '2px dashed var(--border)', background: 'none', color: 'var(--sub)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        <Plus size={14} /> Add FAQ
      </button>
  )
}

function ContactEditor({ data, onChange }) {
  const u = (k, v) => onChange({ ...data, [k]: v })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
      <div><label style={LBL}>Email Address</label><input className="inp" value={data.email || ''} onChange={e => u('email', e.target.value)} style={INP} /></div>
      <div><label style={LBL}>Phone Number</label><input className="inp" value={data.phone || ''} onChange={e => u('phone', e.target.value)} style={INP} /></div>
      <div><label style={LBL}>Location</label><input className="inp" value={data.location || ''} onChange={e => u('location', e.target.value)} style={INP} /></div>
      <div><label style={LBL}>Response Time</label><input className="inp" value={data.response_time || ''} onChange={e => u('response_time', e.target.value)} style={INP} /></div>
      <div><label style={LBL}>Weekday Hours</label><input className="inp" value={data.hours_weekday || ''} onChange={e => u('hours_weekday', e.target.value)} style={INP} /></div>
      <div><label style={LBL}>Weekend Hours</label><input className="inp" value={data.hours_weekend || ''} onChange={e => u('hours_weekend', e.target.value)} style={INP} /></div>
  )
}

// ── Shared styles ─────────────────────────────────────────────
const LBL = { display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--sub)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }
const INP = { width: '100%', padding: '9px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13.5px', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }
const ICON_BTN = { background: 'none', border: 'none', color: 'var(--sub)', cursor: 'pointer', padding: '4px', display: 'flex' }

const EDITORS = {
  hero:     HeroEditor,
  banner:   BannerEditor,
  services: ServicesEditor,
  pricing:  PricingEditor,
  faq:      FaqEditor,
  contact:  ContactEditor,
}

// ── Main page ─────────────────────────────────────────────────
export default function WebsiteCMS() {
  const [active, setActive] = useState('hero')
  const [content, setContent] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const results = {}
    await Promise.all(SECTIONS.map(async s => {
      const data = await loadContent(s.key)
      results[s.key] = data || DEFAULTS[s.key]
    }))
    setContent(results)
    setLoading(false)
  }

  const save = async () => {
    setSaving(true)
    await saveContent(active, content[active])
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const saveAll = async () => {
    setSaving(true)
    await Promise.all(SECTIONS.map(s => saveContent(s.key, content[s.key])))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const ActiveEditor = EDITORS[active]
  const activeSection = SECTIONS.find(s => s.key === active)

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', margin: 0 }}>Website Content Editor</h2>
          <p style={{ fontSize: '12.5px', color: 'var(--sub)', marginTop: '3px' }}>Changes are saved to Supabase and reflected on <a href="https://dhwebsiteservices.co.uk" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>dhwebsiteservices.co.uk</a> immediately</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {saved && <span style={{ fontSize: '13px', color: 'var(--green)' }}>✓ Saved</span>}
          <a href="https://dhwebsiteservices.co.uk" target="_blank" rel="noreferrer" style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--sub)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
            <Eye size={13} /> Preview site
          </a>
          <button onClick={loadAll} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--sub)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <RefreshCw size={13} /> Reload
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : `Save ${activeSection?.label}`}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', alignItems: 'start' }}>
        {/* Sidebar nav */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {SECTIONS.map(s => {
            const Icon = s.icon
            const isActive = active === s.key
            return (
              <button key={s.key} onClick={() => setActive(s.key)} style={{
                width: '100%', padding: '11px 14px', borderRadius: '8px', border: `1px solid ${isActive ? s.color : 'transparent'}`,
                background: isActive ? `${s.color}15` : 'var(--bg2)', color: isActive ? s.color : 'var(--sub)',
                fontSize: '13px', fontWeight: isActive ? 700 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '9px', transition: 'all 0.15s', textAlign: 'left',
              }}>
                <Icon size={14} style={{ flexShrink: 0 }} /> {s.label}
              </button>
            )
          })}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '8px', paddingTop: '8px' }}>
            <button onClick={saveAll} disabled={saving} style={{
              width: '100%', padding: '11px 14px', borderRadius: '8px', border: '1px solid var(--green)',
              background: 'rgba(0,229,160,0.08)', color: 'var(--green)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '9px',
            }}>
              <Save size={14} /> Save All Sections
            </button>
          </div>
        </div>

        {/* Editor panel */}
        <div className="card card-pad">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--sub)' }}>Loading content…</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 36, height: 36, borderRadius: '8px', background: `${activeSection?.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {activeSection && <activeSection.icon size={17} color={activeSection.color} />}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{activeSection?.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--sub)' }}>Edit and save — changes go live instantly</div>
                </div>
              </div>
              {content[active] !== undefined && (
                <ActiveEditor
                  data={content[active]}
                  onChange={val => setContent(p => ({ ...p, [active]: val }))}
                />
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)', gap: '10px', alignItems: 'center' }}>
                {saved && <span style={{ fontSize: '13px', color: 'var(--green)' }}>✓ Saved successfully</span>}
                <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </>
          )}
        </div>
      </div>
  )
}
