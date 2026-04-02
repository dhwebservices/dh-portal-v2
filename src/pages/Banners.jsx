import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import SystemBannerCard from '../components/SystemBannerCard'

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
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Banners & Popups</h1>
          <p className="page-sub">{activeCount} active · {banners.length} total</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Create Banner</button>
      </div>

      <div className="dashboard-stat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:20 }}>
        <div className="stat-card">
          <div className="stat-val">{activeCount}</div>
          <div className="stat-lbl">Live banners</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{urgentCount}</div>
          <div className="stat-lbl">Urgent live alerts</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{banners.filter(b => b.target_email).length}</div>
          <div className="stat-lbl">Targeted to one staff member</div>
        </div>
      </div>

      {/* Active banners preview */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--faint)', marginBottom:10 }}>System status banner</div>
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
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--faint)', marginBottom:10 }}>Live Preview</div>
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
      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : banners.length === 0 ? (
          <div className="empty"><p>No banners yet.<br/>Create one to show announcements to staff.</p></div>
        ) : (
          <div style={{ display:'grid', gap:0 }}>
            {banners.map(b => {
              const t = typeInfo(b.type)
              const expired = b.ends_at && new Date(b.ends_at) < new Date()
              return (
                <div key={b.id} style={{ padding:'16px 18px', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', gap:16, alignItems:'start' }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', marginBottom:6 }}>
                      <div style={{ fontWeight:600, color:'var(--text)', fontSize:14 }}>{b.title || b.message?.slice(0,40) || 'Untitled banner'}</div>
                      <span className={`badge badge-${b.active && !expired ? 'green' : 'grey'}`}>{expired ? 'Expired' : b.active ? 'Active' : 'Off'}</span>
                      <span className={`badge badge-${b.type === 'urgent' ? 'red' : b.type === 'warning' ? 'amber' : b.type === 'success' ? 'green' : 'blue'}`}>{b.type}</span>
                    </div>
                    <div style={{ fontSize:13, color:'var(--sub)', lineHeight:1.65, marginBottom:10 }}>{b.message}</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <span className="badge badge-grey">{b.target_email ? b.target_email : 'all staff'}</span>
                      <span className="badge badge-grey">{b.target_page || 'all pages'}</span>
                      <span className="badge badge-grey">{b.display_type || 'banner'}</span>
                      <span className="badge badge-grey">{b.dismissible ? 'dismissible' : 'locked'}</span>
                      <span className="badge badge-grey">{b.ends_at ? new Date(b.ends_at).toLocaleDateString('en-GB') : 'no expiry'}</span>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => toggle(b.id, b.active)}>
                      {b.active ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(b)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(b.id)}>Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <Modal title={editing ? 'Edit Banner' : 'Create Banner'} onClose={close}
          footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Type selector */}
            <div>
              <label className="lbl" style={{ marginBottom:8 }}>Type</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6 }}>
                {TYPES.map(t => (
                  <button key={t.key} onClick={() => sf('type', t.key)}
                    style={{ padding:'10px 8px', borderRadius:8, border:`2px solid ${form.type===t.key ? t.border : 'var(--border)'}`, background: form.type===t.key ? t.bg : 'transparent', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4, transition:'all 0.15s' }}>
                    <span style={{ fontSize:18 }}>{ICONS[t.key]}</span>
                    <span style={{ fontSize:11, fontWeight:500, color: form.type===t.key ? t.color : 'var(--sub)' }}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div><label className="lbl">Title</label><input className="inp" value={form.title} onChange={e=>sf('title',e.target.value)} placeholder="e.g. System Maintenance Tonight"/></div>
            <div><label className="lbl">Message</label><textarea className="inp" rows={3} value={form.message} onChange={e=>sf('message',e.target.value)} style={{ resize:'vertical' }} placeholder="Detailed message shown to staff..."/></div>

            <div className="fg">
              <div><label className="lbl">Display As</label>
                <select className="inp" value={form.display_type} onChange={e=>sf('display_type',e.target.value)}>
                  <option value="banner">Banner Bar</option>
                  <option value="popup">Popup Modal</option>
                </select>
              </div>
              <div><label className="lbl">Show To</label>
                <select className="inp" value={form.target} onChange={e=>sf('target',e.target.value)}>
                  <option value="staff">All Staff</option>
                  <option value="all">Everyone</option>
                </select>
              </div>
              <div><label className="lbl">Expires</label><input className="inp" type="date" value={form.ends_at} onChange={e=>sf('ends_at',e.target.value)}/></div>
            </div>

            <div className="fg">
              <div><label className="lbl">Target Page</label>
                <select className="inp" value={form.target_page || 'all'} onChange={e=>sf('target_page',e.target.value)}>
                  <option value="all">All pages</option>
                  <option value="dashboard">Dashboard only</option>
                  <option value="notifications">Notifications only</option>
                  <option value="my-profile">My Profile only</option>
                </select>
              </div>
              <div className="fc">
                <label className="lbl">Specific Staff Email</label>
                <input className="inp" value={form.target_email || ''} onChange={e=>sf('target_email',e.target.value.toLowerCase())} placeholder="Leave blank for all staff" />
              </div>
            </div>

            <div style={{ display:'flex', gap:20 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                <input type="checkbox" checked={form.active} onChange={e=>sf('active',e.target.checked)} style={{ accentColor:'var(--accent)', width:16, height:16 }}/>
                Active immediately
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                <input type="checkbox" checked={form.dismissible} onChange={e=>sf('dismissible',e.target.checked)} style={{ accentColor:'var(--accent)', width:16, height:16 }}/>
                Dismissible
              </label>
            </div>

            {/* Live preview */}
            {(form.title || form.message) && (
              <div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>Preview</div>
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
