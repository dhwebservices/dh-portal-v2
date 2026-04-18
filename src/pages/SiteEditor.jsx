import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'

const SUPABASE_URL = 'https://xtunnfdwltfesscmpove.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM'

// Default content matching the live site's DEFAULTS in useCMS.js
const DEFAULTS = {
  banner: {
    enabled: false,
    bars: [
      {
        id: 1,
        text: 'First month free on Starter plans',
        link: '',
        link_text: '',
        bg_color: '#1a1a2e',
        text_color: '#ffffff',
        pages: ['home', 'services', 'pricing', 'contact', 'careers'],
        size: 'normal',
      }
    ],
  },
  maintenance: {
    enabled: false,
    headline: 'We are currently carrying out scheduled maintenance.',
    message: 'Leave your name and phone number and a member of our team will call you back as soon as possible.',
    form_enabled: true,
    button_text: 'Request a callback',
    email_to: 'mgmt@dhwebsiteservices.co.uk',
    background_tone: 'light',
  },
  services: [
    { icon: '💻', title: 'Custom Web Development', desc: 'Tailored solutions built from the ground up for your unique business needs. Production-ready code, not templates.', color: 'var(--cyan)' },
    { icon: '🎨', title: 'User-Centric Design', desc: 'Beautiful interfaces that engage visitors and drive conversions. Every pixel intentional, every interaction purposeful.', color: 'var(--purple2)' },
    { icon: '🛠', title: 'Full Support & Maintenance', desc: "Ongoing maintenance to keep your site running at peak performance. We're here long after launch.", color: 'var(--green)' },
    { icon: '👥', title: 'HR System Integration', desc: 'Full HR portal built into your website — onboarding, leave, payslips, timesheets and more.', color: 'var(--amber)' },
  ],
  mailing_list: {
    enabled: true,
    headline: 'Get a discount on your first project',
    subtext: 'Join our mailing list and a client services advisor will reach out with your exclusive discount code.',
    button_text: 'Claim my discount',
    delay_seconds: 5,
  },
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
    { q: 'Is hosting included in the build price?', a: "No — hosting is a separate monthly plan. This keeps things flexible so you're not locked into a bundle you don't need." },
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

const SECTIONS = [
  { key: 'banner',   label: '📢 Banner',   desc: 'Top announcement bar' },
  { key: 'maintenance', label: '🛠 Maintenance', desc: 'Public site lock screen' },
  { key: 'services', label: '🛠 Services',  desc: 'Service cards on homepage' },
  { key: 'pricing',  label: '💰 Pricing',   desc: 'Build packages & hosting plans' },
  { key: 'faq',      label: '❓ FAQ',        desc: 'Frequently asked questions' },
  { key: 'contact',  label: '📞 Contact',   desc: 'Contact details' },
  { key: 'mailing_list', label: '📬 Mailing List', desc: 'Popup settings' },
  { key: 'pages', label: '📄 Pages', desc: 'Create and manage public pages' },
]

const CORE_PAGE_OPTIONS = [
  { key: 'home', label: 'Home' },
  { key: 'services', label: 'Services' },
  { key: 'about', label: 'About' },
  { key: 'partners', label: 'Partners' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'calculator', label: 'Calculator' },
  { key: 'contact', label: 'Contact' },
  { key: 'careers', label: 'Careers' },
]

async function loadSection(section) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/website_content?section=eq.${section}&select=content&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  )
  const rows = await res.json()
  return rows?.[0]?.content || null
}

async function saveSection(section, content, updatedBy) {
  // Upsert by section
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/website_content?on_conflict=section`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ section, content, updated_at: new Date().toISOString(), updated_by: updatedBy }),
    }
  )
  return res.ok
}

async function loadPages() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/website_pages?select=*&order=sort_order.asc.nullslast,created_at.asc`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  )
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

async function createPageRecord(page, updatedBy) {
  const payload = {
    title: page.title,
    slug: page.slug,
    nav_label: page.nav_label || page.title,
    summary: page.summary || '',
    body: page.body || '',
    show_in_nav: !!page.show_in_nav,
    active: page.active !== false,
    sort_order: Number(page.sort_order || 0),
    meta_title: page.meta_title || page.title,
    meta_description: page.meta_description || page.summary || '',
    updated_by: updatedBy,
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/website_pages`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  const rows = await res.json().catch(() => [])
  return { ok: res.ok, page: Array.isArray(rows) ? rows[0] : rows }
}

async function updatePageRecord(page, updatedBy) {
  const payload = {
    title: page.title,
    slug: page.slug,
    nav_label: page.nav_label || page.title,
    summary: page.summary || '',
    body: page.body || '',
    show_in_nav: !!page.show_in_nav,
    active: page.active !== false,
    sort_order: Number(page.sort_order || 0),
    meta_title: page.meta_title || page.title,
    meta_description: page.meta_description || page.summary || '',
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/website_pages?id=eq.${page.id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  const rows = await res.json().catch(() => [])
  return { ok: res.ok, page: Array.isArray(rows) ? rows[0] : rows }
}

async function deletePageRecord(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/website_pages?id=eq.${id}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'return=minimal',
    },
  })
  return res.ok
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function createDraftPage() {
  const stamp = Date.now()
  return {
    id: `draft-${stamp}`,
    title: 'New page',
    slug: `new-page-${String(stamp).slice(-4)}`,
    nav_label: 'New page',
    summary: '',
    body: '',
    show_in_nav: false,
    active: true,
    sort_order: 0,
    meta_title: '',
    meta_description: '',
    isDraft: true,
  }
}

export default function SiteEditor() {
  const { user } = useAuth()
  const [active, setActive]       = useState('banner')
  const [data, setData]           = useState({})    // { section: content }
  const [pages, setPages]         = useState([])
  const [pageDirty, setPageDirty] = useState({})
  const [loading, setLoading]     = useState(true)
  const [dirty, setDirty]         = useState({})    // { section: true }
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState('')
  const [error, setError]         = useState('')

  // Load all sections on mount
  useEffect(() => {
    setLoading(true)
    Promise.all([
      Promise.all(SECTIONS.filter(s => s.key !== 'pages').map(s => loadSection(s.key).then(content => [s.key, content]))),
      loadPages(),
    ])
      .then(([results, pageRows]) => {
        const map = {}
        results.forEach(([key, content]) => {
          map[key] = content || DEFAULTS[key]
        })
        setData(map)
        setPages(pageRows)
        setLoading(false)
      })
      .catch(() => {
        // Fall back to defaults if table doesn't exist yet
        const map = {}
        SECTIONS.filter(s => s.key !== 'pages').forEach(s => { map[s.key] = DEFAULTS[s.key] })
        setData(map)
        setPages([])
        setLoading(false)
      })
  }, [])

  const update = (section, newContent) => {
    setData(p => ({ ...p, [section]: newContent }))
    setDirty(p => ({ ...p, [section]: true }))
  }

  const save = async (section) => {
    setSaving(true); setError('')
    const ok = await saveSection(section, data[section], user?.name || user?.email)
    if (ok) {
      setDirty(p => { const n = { ...p }; delete n[section]; return n })
      setSaved(section); setTimeout(() => setSaved(''), 3000)
    } else {
      setError('Save failed — check Supabase table exists (run the SQL below)')
    }
    setSaving(false)
  }

  const pageOptions = [
    ...CORE_PAGE_OPTIONS,
    ...pages.map((page) => ({ key: page.slug, label: page.nav_label || page.title })),
  ]

  const updatePage = (id, updates) => {
    setPages((current) => current.map((page) => (
      page.id === id ? { ...page, ...updates } : page
    )))
    setPageDirty((current) => ({ ...current, [id]: true }))
  }

  const addPage = () => {
    const draft = createDraftPage()
    setPages((current) => [...current, draft])
    setPageDirty((current) => ({ ...current, [draft.id]: true }))
    setActive('pages')
  }

  const savePage = async (page) => {
    setSaving(true)
    setError('')
    const slug = slugify(page.slug || page.title)
    if (!page.title?.trim()) {
      setError('Page title is required.')
      setSaving(false)
      return
    }
    if (!slug) {
      setError('Page slug is required.')
      setSaving(false)
      return
    }
    if (pages.some((entry) => entry.id !== page.id && entry.slug === slug)) {
      setError('That slug is already in use.')
      setSaving(false)
      return
    }

    const payload = { ...page, slug }
    const updatedBy = user?.name || user?.email
    const result = page.isDraft
      ? await createPageRecord(payload, updatedBy)
      : await updatePageRecord(payload, updatedBy)

    if (result.ok && result.page) {
      setPages((current) => {
        if (page.isDraft) {
          return current.map((entry) => (
            entry.id === page.id ? { ...result.page } : entry
          ))
        }
        return current.map((entry) => (
          entry.id === page.id ? { ...result.page } : entry
        ))
      })
      setPageDirty((current) => {
        const next = { ...current }
        delete next[page.id]
        if (result.page.id !== page.id) delete next[result.page.id]
        return next
      })
      setSaved(`page:${result.page.id}`)
      setTimeout(() => setSaved(''), 3000)
    } else {
      setError('Page save failed — check the website_pages table exists.')
    }
    setSaving(false)
  }

  const deletePage = async (page) => {
    if (!confirm(`Delete page "${page.title}"?`)) return
    setSaving(true)
    setError('')
    if (!page.isDraft) {
      const ok = await deletePageRecord(page.id)
      if (!ok) {
        setError('Page delete failed — check the website_pages table exists.')
        setSaving(false)
        return
      }
    }
    setPages((current) => current.filter((entry) => entry.id !== page.id))
    setPageDirty((current) => {
      const next = { ...current }
      delete next[page.id]
      return next
    })
    setSaving(false)
  }

  const activeData = data[active] || DEFAULTS[active]

  return (
    <div style={{ display:'flex', height:'calc(100vh - 120px)', minHeight:500 }}>

      {/* Left sidebar */}
      <div style={{ width:200, background:'var(--bg2)', borderRight:'1px solid var(--border)', padding:'16px 0', flexShrink:0 }}>
        <div style={{ padding:'0 14px 10px', fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)' }}>Sections</div>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setActive(s.key)}
            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', border:'none', background: active===s.key ? 'var(--accent-soft)' : 'transparent', cursor:'pointer', textAlign:'left', borderLeft: active===s.key ? '2px solid var(--accent)' : '2px solid transparent', transition:'all 0.15s' }}>
            <div>
              <div style={{ fontSize:13, fontWeight: active===s.key ? 500 : 400, color: active===s.key ? 'var(--accent)' : 'var(--text)' }}>{s.label}</div>
              <div style={{ fontSize:10, color:'var(--faint)' }}>{s.desc}</div>
            </div>
            {(dirty[s.key] || (s.key === 'pages' && Object.keys(pageDirty).length > 0)) && <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--amber)', flexShrink:0 }}/>}
          </button>
        ))}

        <div style={{ padding:'20px 14px 0', borderTop:'1px solid var(--border)', marginTop:12 }}>
          <a href="https://dhwebsiteservices.co.uk" target="_blank" rel="noreferrer"
            style={{ fontSize:12, color:'var(--accent)', textDecoration:'none', display:'block', marginBottom:6 }}>↗ View Live Site</a>
          <div style={{ fontSize:10, color:'var(--faint)', lineHeight:1.6 }}>Changes save to Supabase and go live immediately on dhwebsiteservices.co.uk</div>
        </div>
      </div>

      {/* Editor pane */}
      <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
          <>
            {error && <div style={{ padding:'10px 14px', background:'var(--red-bg)', border:'1px solid var(--red)', borderRadius:8, fontSize:13, color:'var(--red)', marginBottom:16 }}>{error}</div>}

            {/* Banner editor */}
            {active === 'banner' && (
              <BannerEditor data={activeData} onChange={v => update('banner', v)} pageOptions={pageOptions} />
            )}

            {active === 'maintenance' && (
              <SectionEditor title="Maintenance Mode" desc="Temporarily replace the public site with a callback form">
                <ToggleField
                  label="Enable maintenance mode"
                  value={activeData?.enabled}
                  onChange={v => update('maintenance', { ...activeData, enabled: v })}
                />
                <Field
                  label="Headline"
                  value={activeData?.headline || ''}
                  onChange={v => update('maintenance', { ...activeData, headline: v })}
                  type="text"
                />
                <Field
                  label="Message"
                  value={activeData?.message || ''}
                  onChange={v => update('maintenance', { ...activeData, message: v })}
                  type="textarea"
                  rows={4}
                />
                <ToggleField
                  label="Show callback form"
                  value={activeData?.form_enabled !== false}
                  onChange={v => update('maintenance', { ...activeData, form_enabled: v })}
                />
                <Field
                  label="Button text"
                  value={activeData?.button_text || ''}
                  onChange={v => update('maintenance', { ...activeData, button_text: v })}
                  type="text"
                />
                <Field
                  label="Notification email"
                  value={activeData?.email_to || 'mgmt@dhwebsiteservices.co.uk'}
                  onChange={v => update('maintenance', { ...activeData, email_to: v })}
                  type="text"
                />
                <div style={{ padding:'10px 14px', background:'var(--blue-bg)', border:'1px solid var(--blue)', borderRadius:8, fontSize:13, color:'var(--blue)' }}>
                  When enabled, the public site will be replaced with a maintenance screen. Callback requests are emailed to the address above.
                </div>
              </SectionEditor>
            )}

            {/* Services editor */}
            {active === 'services' && (
              <SectionEditor title="Services" desc="4 service cards shown on the homepage">
                {(activeData||[]).map((svc, i) => (
                  <div key={i} style={{ background:'var(--bg2)', borderRadius:10, padding:'16px', marginBottom:12, border:'1px solid var(--border)' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>Service {i+1}</div>
                    <div className="fg">
                      <Field label="Icon (emoji)" value={svc.icon} onChange={v => { const a=[...activeData]; a[i]={...a[i],icon:v}; update('services',a) }} type="text"/>
                      <Field label="Title" value={svc.title} onChange={v => { const a=[...activeData]; a[i]={...a[i],title:v}; update('services',a) }} type="text"/>
                    </div>
                    <Field label="Description" value={svc.desc} onChange={v => { const a=[...activeData]; a[i]={...a[i],desc:v}; update('services',a) }} type="textarea"/>
                  </div>
                ))}
              </SectionEditor>
            )}

            {/* Pricing editor */}
            {active === 'pricing' && (
              <SectionEditor title="Pricing" desc="Build packages and hosting plans">
                <div style={{ fontWeight:500, fontSize:13, marginBottom:12, color:'var(--text)' }}>Build Packages</div>
                {(activeData?.builds||[]).map((pkg, i) => (
                  <div key={i} style={{ background:'var(--bg2)', borderRadius:10, padding:'16px', marginBottom:12, border:'1px solid var(--border)' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>{pkg.name}</div>
                    <div className="fg">
                      <Field label="Package Name" value={pkg.name} onChange={v => { const b=[...activeData.builds]; b[i]={...b[i],name:v}; update('pricing',{...activeData,builds:b}) }} type="text"/>
                      <Field label="Price (£)" value={String(pkg.price)} onChange={v => { const b=[...activeData.builds]; b[i]={...b[i],price:Number(v)||pkg.price}; update('pricing',{...activeData,builds:b}) }} type="text"/>
                      <Field label="Delivery Time" value={pkg.delivery} onChange={v => { const b=[...activeData.builds]; b[i]={...b[i],delivery:v}; update('pricing',{...activeData,builds:b}) }} type="text"/>
                      <Field label="Badge (optional)" value={pkg.badge||''} onChange={v => { const b=[...activeData.builds]; b[i]={...b[i],badge:v}; update('pricing',{...activeData,builds:b}) }} type="text"/>
                    </div>
                    <Field label="Features (one per line)" value={(pkg.features||[]).join('\n')} onChange={v => { const b=[...activeData.builds]; b[i]={...b[i],features:v.split('\n').filter(Boolean)}; update('pricing',{...activeData,builds:b}) }} type="textarea" rows={6}/>
                  </div>
                ))}

                <div style={{ fontWeight:500, fontSize:13, margin:'20px 0 12px', color:'var(--text)' }}>Hosting Plans</div>
                {(activeData?.hosting||[]).map((plan, i) => (
                  <div key={i} style={{ background:'var(--bg2)', borderRadius:10, padding:'16px', marginBottom:12, border:'1px solid var(--border)' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>{plan.name}</div>
                    <div className="fg">
                      <Field label="Plan Name" value={plan.name} onChange={v => { const h=[...activeData.hosting]; h[i]={...h[i],name:v}; update('pricing',{...activeData,hosting:h}) }} type="text"/>
                      <Field label="Price (£/mo)" value={String(plan.price)} onChange={v => { const h=[...activeData.hosting]; h[i]={...h[i],price:Number(v)||plan.price}; update('pricing',{...activeData,hosting:h}) }} type="text"/>
                      <Field label="Badge (optional)" value={plan.badge||''} onChange={v => { const h=[...activeData.hosting]; h[i]={...h[i],badge:v}; update('pricing',{...activeData,hosting:h}) }} type="text"/>
                    </div>
                    <Field label="Features (one per line)" value={(plan.features||[]).join('\n')} onChange={v => { const h=[...activeData.hosting]; h[i]={...h[i],features:v.split('\n').filter(Boolean)}; update('pricing',{...activeData,hosting:h}) }} type="textarea" rows={4}/>
                  </div>
                ))}
              </SectionEditor>
            )}

            {/* FAQ editor */}
            {active === 'faq' && (
              <SectionEditor title="FAQ" desc="Questions shown on the pricing page">
                {(activeData||[]).map((item, i) => (
                  <div key={i} style={{ background:'var(--bg2)', borderRadius:10, padding:'16px', marginBottom:12, border:'1px solid var(--border)' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>FAQ {i+1}</div>
                    <Field label="Question" value={item.q} onChange={v => { const a=[...activeData]; a[i]={...a[i],q:v}; update('faq',a) }} type="text"/>
                    <Field label="Answer" value={item.a} onChange={v => { const a=[...activeData]; a[i]={...a[i],a:v}; update('faq',a) }} type="textarea" rows={3}/>
                  </div>
                ))}
                <button className="btn btn-outline btn-sm" onClick={() => update('faq', [...(activeData||[]), { q:'New question', a:'Answer here' }])}>+ Add FAQ</button>
              </SectionEditor>
            )}

            {/* Mailing List editor */}
            {active === 'mailing_list' && (
              <SectionEditor title="Mailing List Popup" desc="Controls the popup shown on the public website">
                <ToggleField label="Enable popup" value={activeData?.enabled !== false} onChange={v => update('mailing_list',{...activeData,enabled:v})}/>
                <Field label="Headline" value={activeData?.headline||''} onChange={v => update('mailing_list',{...activeData,headline:v})}/>
                <Field label="Subtext" value={activeData?.subtext||''} onChange={v => update('mailing_list',{...activeData,subtext:v})} type="textarea"/>
                <Field label="Button text" value={activeData?.button_text||''} onChange={v => update('mailing_list',{...activeData,button_text:v})}/>
                <div>
                  <label className="lbl">Delay before showing (seconds)</label>
                  <input className="inp" type="number" min="0" max="60" value={activeData?.delay_seconds ?? 5} onChange={e => update('mailing_list',{...activeData,delay_seconds:Number(e.target.value)})}/>
                </div>
                <div style={{ padding:'10px 14px', background:'var(--blue-bg)', border:'1px solid var(--blue)', borderRadius:7, fontSize:13, color:'var(--blue)' }}>
                  📬 View subscribers in the <a href="/mailing-list" style={{ color:'var(--accent)', fontWeight:500 }}>Mailing List</a> page.
                </div>
              </SectionEditor>
            )}

            {/* Contact editor */}
            {active === 'contact' && (
              <SectionEditor title="Contact Details" desc="Shown on the contact page">
                <Field label="Email" value={activeData?.email||''} onChange={v => update('contact',{...activeData,email:v})} type="text"/>
                <Field label="Phone" value={activeData?.phone||''} onChange={v => update('contact',{...activeData,phone:v})} type="text"/>
                <Field label="Location" value={activeData?.location||''} onChange={v => update('contact',{...activeData,location:v})} type="text"/>
                <Field label="Response Time" value={activeData?.response_time||''} onChange={v => update('contact',{...activeData,response_time:v})} type="text"/>
                <Field label="Weekday Hours" value={activeData?.hours_weekday||''} onChange={v => update('contact',{...activeData,hours_weekday:v})} type="text"/>
                <Field label="Weekend Hours" value={activeData?.hours_weekend||''} onChange={v => update('contact',{...activeData,hours_weekend:v})} type="text"/>
              </SectionEditor>
            )}

            {active === 'pages' && (
              <SectionEditor title="Pages" desc="Create, publish, hide in navigation, or delete public website pages">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:8 }}>
                  <div style={{ fontSize:12, color:'var(--faint)', lineHeight:1.6 }}>
                    Custom pages publish to the public website and can optionally appear in the main navigation.
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={addPage}>+ Add Page</button>
                </div>
                {pages.length === 0 ? (
                  <div style={{ padding:'18px 16px', background:'var(--bg2)', borderRadius:10, border:'1px solid var(--border)', fontSize:13, color:'var(--faint)' }}>
                    No custom pages yet.
                  </div>
                ) : pages.map((page, index) => (
                  <div key={page.id} style={{ background:'var(--bg2)', borderRadius:12, padding:'16px', border:'1px solid var(--border)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:12 }}>
                      <div>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>
                          {page.isDraft ? 'Draft page' : 'Published page'}
                        </div>
                        <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>
                          {page.title || `Page ${index + 1}`}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <span className={`badge badge-${page.active !== false ? 'green' : 'grey'}`}>
                          {page.active !== false ? 'Live' : 'Hidden'}
                        </span>
                        {pageDirty[page.id] && <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--amber)' }} />}
                      </div>
                    </div>

                    <div className="fg">
                      <Field label="Page title" value={page.title || ''} onChange={v => updatePage(page.id, { title: v, nav_label: page.nav_label || v, meta_title: page.meta_title || v, slug: page.isDraft ? slugify(v) : page.slug })} type="text" />
                      <Field label="Slug" value={page.slug || ''} onChange={v => updatePage(page.id, { slug: slugify(v) })} type="text" />
                    </div>

                    <div className="fg">
                      <Field label="Navigation label" value={page.nav_label || ''} onChange={v => updatePage(page.id, { nav_label: v })} type="text" />
                      <Field label="Sort order" value={String(page.sort_order || 0)} onChange={v => updatePage(page.id, { sort_order: Number(v) || 0 })} type="text" />
                    </div>

                    <Field label="Summary" value={page.summary || ''} onChange={v => updatePage(page.id, { summary: v, meta_description: page.meta_description || v })} type="textarea" rows={3} />
                    <Field label="Body content" value={page.body || ''} onChange={v => updatePage(page.id, { body: v })} type="textarea" rows={8} />

                    <div className="fg">
                      <Field label="Meta title" value={page.meta_title || ''} onChange={v => updatePage(page.id, { meta_title: v })} type="text" />
                      <Field label="Meta description" value={page.meta_description || ''} onChange={v => updatePage(page.id, { meta_description: v })} type="textarea" rows={3} />
                    </div>

                    <div style={{ display:'flex', gap:20, flexWrap:'wrap', marginTop:8 }}>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                        <input type="checkbox" checked={page.active !== false} onChange={e => updatePage(page.id, { active: e.target.checked })} style={{ accentColor:'var(--accent)', width:16, height:16 }} />
                        Publish page
                      </label>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                        <input type="checkbox" checked={!!page.show_in_nav} onChange={e => updatePage(page.id, { show_in_nav: e.target.checked })} style={{ accentColor:'var(--accent)', width:16, height:16 }} />
                        Show in navigation
                      </label>
                    </div>

                    <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:16 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => savePage(page)} disabled={saving}>
                        {saving ? 'Saving...' : 'Save page'}
                      </button>
                      {!page.isDraft && (
                        <a href={`https://dhwebsiteservices.co.uk/${page.slug}`} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                          ↗ View page
                        </a>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => deletePage(page)} disabled={saving}>
                        Delete
                      </button>
                      {saved === `page:${page.id}` && <span style={{ fontSize:13, color:'var(--green)', alignSelf:'center' }}>✓ Saved</span>}
                    </div>
                  </div>
                ))}
              </SectionEditor>
            )}

            {/* Save button */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:24, paddingTop:20, borderTop:'1px solid var(--border)' }}>
              {active !== 'pages' && (
                <>
                  <button className="btn btn-primary" onClick={() => save(active)} disabled={saving || !dirty[active]} style={{ opacity: dirty[active] ? 1 : 0.5 }}>
                    {saving ? 'Saving...' : dirty[active] ? '💾 Save & Publish' : '✓ No Changes'}
                  </button>
                  {saved === active && <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved — live site updated immediately</span>}
                </>
              )}
            </div>

            {/* Setup instructions if needed */}
            <details style={{ marginTop:24 }}>
              <summary style={{ fontSize:12, color:'var(--faint)', cursor:'pointer', fontFamily:'var(--font-mono)' }}>SQL setup (run once if not done)</summary>
              <pre style={{ marginTop:8, padding:'12px', background:'var(--bg2)', borderRadius:8, fontSize:11, fontFamily:'var(--font-mono)', color:'var(--text)', overflow:'auto', lineHeight:1.6 }}>{`drop table if exists website_content;
create table website_content (
  id uuid default gen_random_uuid() primary key,
  section text unique not null,
  content jsonb,
  updated_at timestamptz default now(),
  updated_by text
);
create table if not exists website_pages (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  slug text unique not null,
  nav_label text,
  summary text,
  body text,
  show_in_nav boolean default false,
  active boolean default true,
  sort_order integer default 0,
  meta_title text,
  meta_description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  updated_by text
);
alter table website_content enable row level security;
alter table website_pages enable row level security;
create policy "allow_all" on website_content
  for all using (true) with check (true);
create policy "allow_all_pages" on website_pages
  for all using (true) with check (true);`}</pre>
            </details>
          </>
        )}
      </div>

      {/* Live preview */}
      <div style={{ width:300, borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', background:'var(--bg2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:12, fontWeight:500 }}>Live Preview</span>
          <a href="https://dhwebsiteservices.co.uk" target="_blank" rel="noreferrer" style={{ fontSize:11, color:'var(--accent)', textDecoration:'none' }}>↗ Open</a>
        </div>
        <div style={{ flex:1, position:'relative', overflow:'hidden', background:'var(--bg3)', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, padding:20 }}>
          <div style={{ fontSize:32 }}>🌐</div>
          <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', textAlign:'center' }}>dhwebsiteservices.co.uk</div>
          <div style={{ fontSize:11, color:'var(--faint)', textAlign:'center', lineHeight:1.6 }}>Changes save to Supabase and go live on the public site immediately.</div>
          <a href="https://dhwebsiteservices.co.uk" target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" style={{ marginTop:4 }}>↗ Open Live Site</a>
          <div style={{ marginTop:8, padding:'8px 12px', background:'var(--bg2)', borderRadius:8, border:'1px solid var(--border)', width:'100%' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>How it works</div>
            <div style={{ fontSize:11, color:'var(--sub)', lineHeight:1.7 }}>
              1. Edit content in the fields<br/>
              2. Click <strong>Save & Publish</strong><br/>
              3. Live site updates instantly<br/>
              4. No code deploy needed
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
const SIZE_OPTIONS = [
  { key: 'small',  label: 'Small',  desc: '32px' },
  { key: 'normal', label: 'Normal', desc: '44px' },
  { key: 'large',  label: 'Large',  desc: '56px' },
]

function BannerEditor({ data, onChange, pageOptions }) {
  const bars = data?.bars || []
  const enabled = data?.enabled !== false

  const updateBar = (idx, field, val) => {
    const updated = bars.map((b, i) => i === idx ? { ...b, [field]: val } : b)
    onChange({ ...data, bars: updated })
  }

  const addBar = () => {
    const newBar = {
      id: Date.now(),
      text: 'New announcement',
      link: '',
      link_text: '',
      bg_color: '#1a1a2e',
      text_color: '#ffffff',
      pages: ['home'],
      size: 'normal',
    }
    onChange({ ...data, bars: [...bars, newBar] })
  }

  const removeBar = (idx) => {
    onChange({ ...data, bars: bars.filter((_, i) => i !== idx) })
  }

  const togglePage = (barIdx, pageKey) => {
    const bar = bars[barIdx]
    const pages = bar.pages || []
    const newPages = pages.includes(pageKey) ? pages.filter(p => p !== pageKey) : [...pages, pageKey]
    updateBar(barIdx, 'pages', newPages)
  }

  return (
    <SectionEditor title="Banners" desc="Announcement bars shown under the header on selected pages">
      {/* Global enable */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'var(--bg2)', borderRadius:10, border:'1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize:13, fontWeight:500 }}>Enable Banners</div>
          <div style={{ fontSize:11, color:'var(--faint)' }}>Master switch for all banners</div>
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
          <input type="checkbox" checked={!!enabled} onChange={e => onChange({ ...data, enabled: e.target.checked })} style={{ accentColor:'var(--accent)', width:16, height:16 }}/>
          <span style={{ fontSize:13 }}>{enabled ? 'On' : 'Off'}</span>
        </label>
      </div>

      {/* Banner bars */}
      {bars.map((bar, idx) => (
        <div key={bar.id || idx} style={{ background:'var(--bg2)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
          {/* Preview */}
          <div style={{ padding:'12px 16px', background: bar.bg_color || '#1a1a2e', color: bar.text_color || '#fff', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontSize: bar.size==='large' ? 16 : bar.size==='small' ? 11 : 13, minHeight: bar.size==='large' ? 56 : bar.size==='small' ? 32 : 44 }}>
            <span>{bar.text || 'Banner preview'}</span>
            {bar.link && bar.link_text && (
              <span style={{ padding:'2px 10px', background:'rgba(255,255,255,0.2)', borderRadius:4, fontSize: bar.size==='small' ? 10 : 12, cursor:'pointer' }}>{bar.link_text} →</span>
            )}
          </div>

          {/* Controls */}
          <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
            {/* Text */}
            <div>
              <label className="lbl" style={{ marginBottom:5, display:'block' }}>Banner Text</label>
              <input className="inp" value={bar.text} onChange={e => updateBar(idx, 'text', e.target.value)} placeholder="Your announcement here..."/>
            </div>

            {/* Link */}
            <div className="fg">
              <div>
                <label className="lbl" style={{ marginBottom:5, display:'block' }}>Link URL (optional)</label>
                <input className="inp" value={bar.link||''} onChange={e => updateBar(idx, 'link', e.target.value)} placeholder="/pricing or https://..."/>
              </div>
              <div>
                <label className="lbl" style={{ marginBottom:5, display:'block' }}>Link Button Text</label>
                <input className="inp" value={bar.link_text||''} onChange={e => updateBar(idx, 'link_text', e.target.value)} placeholder="Learn more"/>
              </div>
            </div>

            {/* Colors */}
            <div className="fg">
              <div>
                <label className="lbl" style={{ marginBottom:5, display:'block' }}>Background Colour</label>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input type="color" value={bar.bg_color||'#1a1a2e'} onChange={e => updateBar(idx, 'bg_color', e.target.value)} style={{ width:40, height:36, borderRadius:6, border:'1px solid var(--border)', cursor:'pointer', padding:2 }}/>
                  <input className="inp" value={bar.bg_color||'#1a1a2e'} onChange={e => updateBar(idx, 'bg_color', e.target.value)} style={{ fontFamily:'var(--font-mono)', fontSize:12 }}/>
                </div>
              </div>
              <div>
                <label className="lbl" style={{ marginBottom:5, display:'block' }}>Text Colour</label>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input type="color" value={bar.text_color||'#ffffff'} onChange={e => updateBar(idx, 'text_color', e.target.value)} style={{ width:40, height:36, borderRadius:6, border:'1px solid var(--border)', cursor:'pointer', padding:2 }}/>
                  <input className="inp" value={bar.text_color||'#ffffff'} onChange={e => updateBar(idx, 'text_color', e.target.value)} style={{ fontFamily:'var(--font-mono)', fontSize:12 }}/>
                </div>
              </div>
            </div>

            {/* Size */}
            <div>
              <label className="lbl" style={{ marginBottom:8, display:'block' }}>Size</label>
              <div style={{ display:'flex', gap:8 }}>
                {SIZE_OPTIONS.map(s => (
                  <button key={s.key} onClick={() => updateBar(idx, 'size', s.key)}
                    style={{ padding:'6px 14px', borderRadius:7, border:`1px solid ${bar.size===s.key ? 'var(--accent)' : 'var(--border)'}`, background: bar.size===s.key ? 'var(--accent-soft)' : 'transparent', color: bar.size===s.key ? 'var(--accent)' : 'var(--text)', cursor:'pointer', fontSize:12, fontWeight: bar.size===s.key ? 500 : 400 }}>
                    {s.label} <span style={{ color:'var(--faint)', fontSize:10 }}>{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Pages */}
            <div>
              <label className="lbl" style={{ marginBottom:8, display:'block' }}>Show On Pages</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {pageOptions.map(p => {
                  const active = (bar.pages||[]).includes(p.key)
                  return (
                    <button key={p.key} onClick={() => togglePage(idx, p.key)}
                      style={{ padding:'5px 12px', borderRadius:6, border:`1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent)' : 'var(--sub)', cursor:'pointer', fontSize:12, fontWeight: active ? 500 : 400 }}>
                      {p.label}
                    </button>
                  )
                })}
                <button onClick={() => onChange({ ...data, bars: bars.map((b,i) => i===idx ? {...b, pages: pageOptions.map(p=>p.key)} : b) })}
                  style={{ padding:'5px 12px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--faint)', cursor:'pointer', fontSize:11 }}>All pages</button>
              </div>
            </div>

            {/* Delete */}
            {bars.length > 1 && (
              <button onClick={() => removeBar(idx)} className="btn btn-danger btn-sm" style={{ alignSelf:'flex-start', marginTop:4 }}>
                🗑 Remove Banner
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Add banner */}
      <button className="btn btn-outline" onClick={addBar} style={{ width:'100%', justifyContent:'center' }}>
        + Add Another Banner
      </button>
    </SectionEditor>
  )
}

function SectionEditor({ title, desc, children }) {
  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:400, color:'var(--text)', marginBottom:4 }}>{title}</h2>
        <div style={{ fontSize:12, color:'var(--faint)' }}>{desc}</div>
      </div>
      <div style={{ maxWidth:680, display:'flex', flexDirection:'column', gap:14 }}>{children}</div>
    </div>
  )
}

function Field({ label, value, onChange, type='text', rows=3 }) {
  return (
    <div>
      <label className="lbl" style={{ marginBottom:5, display:'block' }}>{label}</label>
      {type === 'textarea' ? (
        <textarea className="inp" rows={rows} value={value} onChange={e => onChange(e.target.value)} style={{ resize:'vertical', lineHeight:1.6 }}/>
      ) : (
        <input className="inp" value={value} onChange={e => onChange(e.target.value)}/>
      )}
    </div>
  )
}

function ToggleField({ label, value, onChange }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:13 }}>
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} style={{ accentColor:'var(--accent)', width:16, height:16 }}/>
      {label}
    </label>
  )
}
