import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import SystemBannerCard from '../components/SystemBannerCard'
import { Button, FormField, FormLabel, FormInput, FormSelect, StatusBadge } from '../components/ds'

const DS_CARD = { background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)' }
const KICKER = { fontSize:11, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--color-text-tertiary)', marginBottom:10 }

const TYPES = [
  { key:'info',    label:'Info',    color:'var(--accent)', bg:'var(--accent-soft)', border:'var(--accent-border)' },
  { key:'success', label:'Success', color:'var(--green)',  bg:'var(--green-bg)',    border:'var(--green)'  },
  { key:'warning', label:'Warning', color:'var(--amber)',  bg:'var(--amber-bg)',    border:'var(--amber)'  },
  { key:'urgent',  label:'Urgent',  color:'var(--red)',    bg:'var(--red-bg)',      border:'var(--red)'    },
]
const ICONS = { info:'ℹ️', success:'✅', warning:'⚠️', urgent:'🚨' }
const EMPTY = { title:'', message:'', type:'info', display_type:'banner', target:'staff', active:true, dismissible:true, ends_at:'', target_email:'', target_page:'all' }
const STATUS_TO_TONE = {
  operational: 'success',
  degraded: 'warning',
  outage: 'urgent',
  maintenance: 'info',
}

export default function Banners() {
  const { user } = useAuth()
  const [banners, setBanners] = useState([])
  const [systems, setSystems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [preview, setPreview] = useState(false)
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    const [{ data }, { data: systemData }] = await Promise.all([
      supabase.from('banners').select('*').order('created_at', { ascending:false }),
      supabase.from('maintenance_systems').select('*').order('name'),
    ])
    setBanners(data || [])
    setSystems(systemData || [])
    setLoading(false)
  }
  const openAdd  = () => { setEditing(null); setForm(EMPTY); setPreview(false); setModal(true) }
  const openEdit = b => { setEditing(b); setForm({ ...b, ends_at: b.ends_at?.split('T')[0]||'' }); setPreview(false); setModal(true) }
  const close    = () => { setModal(false); setEditing(null) }

  const save = async () => {
    setSaving(true)
    const payload = { ...form, ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null, created_by: user?.name }
    if (editing) await supabase.from('banners').update(payload).eq('id', editing.id)
    else await supabase.from('banners').insert([payload])
    setSaving(false); close(); load()
  }

  const toggle = async (id, current) => {
    await supabase.from('banners').update({ active: !current }).eq('id', id)
    setBanners(p => p.map(b => b.id === id ? { ...b, active: !current } : b))
  }

  const del = async (id) => {
    if (!confirm('Delete this banner?')) return
    await supabase.from('banners').delete().eq('id', id)
    load()
  }

  const activeCount = banners.filter(b => b.active && (!b.ends_at || new Date(b.ends_at) > new Date())).length
  const urgentCount = banners.filter(b => b.active && b.type === 'urgent' && (!b.ends_at || new Date(b.ends_at) > new Date())).length
  const typeInfo = (key) => TYPES.find(t => t.key === key) || TYPES[0]
  const overallStatus = systems.length === 0
    ? 'operational'
    : systems.every((system) => system.status === 'operational')
      ? 'operational'
      : systems.some((system) => system.status === 'outage')
        ? 'outage'
        : systems.some((system) => system.status === 'maintenance')
          ? 'maintenance'
          : 'degraded'
  const livePreviewBanners = banners.filter((b) => b.active && (!b.ends_at || new Date(b.ends_at) > new Date()))

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Banners &amp; Popups</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>{activeCount} active · {banners.length} total</p>
        </div>
        <Button variant="primary" onClick={openAdd}>+ Create Banner</Button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:20 }}>
        <div style={{ ...DS_CARD, padding:20 }}>
          <div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{activeCount}</div>
          <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Live banners</div>
        </div>
        <div style={{ ...DS_CARD, padding:20 }}>
          <div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{urgentCount}</div>
          <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Urgent live alerts</div>
        </div>
        <div style={{ ...DS_CARD, padding:20 }}>
          <div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{banners.filter(b => b.target_email).length}</div>
          <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Targeted to one staff member</div>
        </div>
      </div>

      {/* Active banners preview */}
      <div style={{ marginBottom:20 }}>
        <div style={KICKER}>System status banner</div>
        <SystemBannerCard
          title="All Systems"
          statusText={overallStatus === 'operational' ? 'Operational' : overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1)}
          tone={STATUS_TO_TONE[overallStatus] || 'info'}
          subtitle={`${systems.length} systems monitored · Last updated ${new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}`}
          meta={[
            overallStatus === 'operational' ? 'ready for broadcast style' : 'active status state',
            'matches maintenance board design',
          ]}
        />
      </div>

      {activeCount > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={KICKER}>Live Preview</div>
          <div style={{ display:'grid', gap:10 }}>
          {livePreviewBanners.map(b => {
            const tone = b.type === 'urgent' ? 'urgent' : b.type === 'warning' ? 'warning' : b.type === 'success' ? 'success' : 'info'
            return (
              <SystemBannerCard
                key={b.id}
                title={b.title || 'Staff announcement'}
                statusText={null}
                tone={tone}
                subtitle={b.message}
                dismissible={b.dismissible}
                meta={[
                  b.target_email ? b.target_email : 'all staff',
                  b.target_page || 'all pages',
                  b.ends_at ? `expires ${new Date(b.ends_at).toLocaleDateString('en-GB')}` : 'no expiry',
                ]}
              />
            )
          })}
          </div>
        </div>
      )}

      {/* Banners list */}
      <div style={{ ...DS_CARD, overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : banners.length === 0 ? (
          <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No banners yet. Create one to show announcements to staff.</div>
        ) : (
          <div style={{ display:'grid', gap:0 }}>
            {banners.map(b => {
              const t = typeInfo(b.type)
              const expired = b.ends_at && new Date(b.ends_at) < new Date()
              return (
                <div key={b.id} style={{ padding:'16px 18px', borderBottom:'1px solid var(--color-border)', display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', gap:16, alignItems:'start' }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', marginBottom:6 }}>
                      <div style={{ fontWeight:600, color:'var(--color-text-primary)', fontSize:14 }}>{b.title || b.message?.slice(0,40) || 'Untitled banner'}</div>
                      <StatusBadge variant={b.active && !expired ? 'active' : 'info'}>{expired ? 'Expired' : b.active ? 'Active' : 'Off'}</StatusBadge>
                      <StatusBadge variant={b.type === 'urgent' ? 'error' : b.type === 'warning' ? 'warning' : b.type === 'success' ? 'active' : 'info'}>{b.type}</StatusBadge>
                    </div>
                    <div style={{ fontSize:13, color:'var(--color-text-secondary)', lineHeight:1.65, marginBottom:10 }}>{b.message}</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <StatusBadge variant="info">{b.target_email ? b.target_email : 'all staff'}</StatusBadge>
                      <StatusBadge variant="info">{b.target_page || 'all pages'}</StatusBadge>
                      <StatusBadge variant="info">{b.display_type || 'banner'}</StatusBadge>
                      <StatusBadge variant="info">{b.dismissible ? 'dismissible' : 'locked'}</StatusBadge>
                      <StatusBadge variant="info">{b.ends_at ? new Date(b.ends_at).toLocaleDateString('en-GB') : 'no expiry'}</StatusBadge>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                    <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => toggle(b.id, b.active)}>
                      {b.active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => openEdit(b)}>Edit</Button>
                    <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px', color:'var(--color-red-500)' }} onClick={() => del(b.id)}>Delete</Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <Modal title={editing ? 'Edit Banner' : 'Create Banner'} onClose={close}
          footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Type selector */}
            <FormField>
              <FormLabel>Type</FormLabel>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6 }}>
                {TYPES.map(t => (
                  <button key={t.key} onClick={() => sf('type', t.key)}
                    style={{ padding:'10px 8px', borderRadius:'var(--border-radius-md)', border:`2px solid ${form.type===t.key ? 'var(--color-primary)' : 'var(--color-border)'}`, background: form.type===t.key ? 'var(--color-blue-50)' : 'transparent', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4, transition:'all 0.15s' }}>
                    <span style={{ fontSize:18 }}>{ICONS[t.key]}</span>
                    <span style={{ fontSize:11, fontWeight:500, color: form.type===t.key ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>{t.label}</span>
                  </button>
                ))}
              </div>
            </FormField>

            <FormField><FormLabel>Title</FormLabel><FormInput value={form.title} onChange={e=>sf('title',e.target.value)} placeholder="e.g. System Maintenance Tonight"/></FormField>
            <FormField><FormLabel>Message</FormLabel><textarea className="ds-form-input" rows={3} value={form.message} onChange={e=>sf('message',e.target.value)} style={{ resize:'vertical', padding:'8px 12px' }} placeholder="Detailed message shown to staff..."/></FormField>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:16 }}>
              <FormField><FormLabel>Display As</FormLabel>
                <FormSelect value={form.display_type} onChange={e=>sf('display_type',e.target.value)}>
                  <option value="banner">Banner Bar</option>
                  <option value="popup">Popup Modal</option>
                </FormSelect>
              </FormField>
              <FormField><FormLabel>Show To</FormLabel>
                <FormSelect value={form.target} onChange={e=>sf('target',e.target.value)}>
                  <option value="staff">All Staff</option>
                  <option value="all">Everyone</option>
                </FormSelect>
              </FormField>
              <FormField><FormLabel>Expires</FormLabel><FormInput type="date" value={form.ends_at} onChange={e=>sf('ends_at',e.target.value)}/></FormField>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16 }}>
              <FormField><FormLabel>Target Page</FormLabel>
                <FormSelect value={form.target_page || 'all'} onChange={e=>sf('target_page',e.target.value)}>
                  <option value="all">All pages</option>
                  <option value="dashboard">Dashboard only</option>
                  <option value="notifications">Notifications only</option>
                  <option value="my-profile">My Profile only</option>
                </FormSelect>
              </FormField>
              <FormField>
                <FormLabel>Specific Staff Email</FormLabel>
                <FormInput value={form.target_email || ''} onChange={e=>sf('target_email',e.target.value.toLowerCase())} placeholder="Leave blank for all staff" />
              </FormField>
            </div>

            <div style={{ display:'flex', gap:20 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'var(--color-text-primary)' }}>
                <input type="checkbox" checked={form.active} onChange={e=>sf('active',e.target.checked)} style={{ accentColor:'var(--color-primary)', width:16, height:16 }}/>
                Active immediately
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'var(--color-text-primary)' }}>
                <input type="checkbox" checked={form.dismissible} onChange={e=>sf('dismissible',e.target.checked)} style={{ accentColor:'var(--color-primary)', width:16, height:16 }}/>
                Dismissible
              </label>
            </div>

            {/* Live preview */}
            {(form.title || form.message) && (
              <div>
                <div style={{ ...KICKER, marginBottom:6 }}>Preview</div>
                <SystemBannerCard
                  title={form.title || 'Banner preview'}
                  tone={form.type === 'urgent' ? 'urgent' : form.type === 'warning' ? 'warning' : form.type === 'success' ? 'success' : 'info'}
                  subtitle={form.message}
                  dismissible={form.dismissible}
                  compact
                  meta={[
                    form.target_email || 'all staff',
                    form.target_page || 'all pages',
                    form.ends_at ? `expires ${new Date(form.ends_at).toLocaleDateString('en-GB')}` : 'no expiry',
                  ]}
                />
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
