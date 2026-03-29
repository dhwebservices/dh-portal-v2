import { useState, useEffect } from 'react'
import { Plus, Eye, EyeOff, Megaphone, X, Edit2, Trash2 } from 'lucide-react'
import { Card, Btn, Modal, Input, Badge } from '../components/UI'
import { supabase } from '../utils/supabase'
import { useMsal } from '@azure/msal-react'

const TYPES = [
  { key: 'info',    label: 'Info',    color: 'var(--charcoal)', bg: 'rgba(26,86,219,0.1)',   border: 'rgba(26,86,219,0.3)'  },
  { key: 'success', label: 'Success', color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)' },
  { key: 'warning', label: 'Warning', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)' },
  { key: 'urgent',  label: 'Urgent',  color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)'  },
]

const TARGET_OPTIONS = [
  { key: 'all',          label: 'All Clients'      },
  { key: 'staff',        label: 'Staff Portal'     },
  { key: 'specific',     label: 'Specific Client'  },
]

const typeIcon = { info: 'ℹ️', success: '✅', warning: '⚠️', urgent: '🚨' }

const empty = {
  title: '', message: '', type: 'info', display_type: 'banner',
  target: 'all', target_email: '', target_page: 'all', active: true, dismissible: true,
  starts_at: new Date().toISOString().split('T')[0], ends_at: '',
}

function BannerPreview({ banner }) {
  const t = TYPES.find(t => t.key === banner.type) || TYPES[0]
  if (banner.display_type === 'popup') {
    return (
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--card)', border: `1px solid ${t.border}`, borderRadius: '8px', padding: '24px', maxWidth: '380px', width: '100%', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>{typeIcon[banner.type]}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', marginBottom: '8px', color: t.color }}>{banner.title || 'Banner Title'}</div>
          <div style={{ fontSize: '13.5px', color: 'var(--sub)', lineHeight: 1.6, marginBottom: '16px' }}>{banner.message || 'Your message will appear here.'}</div>
          {banner.dismissible && <button style={{ padding: '8px 20px', background: t.color, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Got it</button>}
        </div>
    )
  }
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: '8px', padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
      <span style={{ fontSize: '18px', flexShrink: 0 }}>{typeIcon[banner.type]}</span>
      <div style={{ flex: 1 }}>
        {banner.title && <div style={{ fontWeight: 700, fontSize: '14px', color: t.color, marginBottom: '3px' }}>{banner.title}</div>}
        <div style={{ fontSize: '13.5px', color: 'var(--text)', lineHeight: 1.5 }}>{banner.message || 'Your message will appear here.'}</div>
      </div>
      {banner.dismissible && <button style={{ background: 'none', color: 'var(--sub)', fontSize: '16px', flexShrink: 0 }}>×</button>}
  )
}

export default function Banners() {
  const { accounts } = useMsal()
  const user = accounts[0]
  const [banners, setBanners]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)
  const [selected, setSelected] = useState(null)
  const [form, setForm]         = useState(empty)
  const [saving, setSaving]     = useState(false)
  const [preview, setPreview]   = useState(false)

  useEffect(() => { fetchBanners() }, [])

  const fetchBanners = async () => {
    setLoading(true)
    const { data } = await supabase.from('banners').select('*').order('created_at', { ascending: false })
    setBanners(data || [])
    setLoading(false)
  }

  const openAdd  = () => { setForm({ ...empty, starts_at: new Date().toISOString().split('T')[0] }); setModal('add'); setPreview(false) }
  const openEdit = (b) => { setSelected(b); setForm({ ...b, starts_at: b.starts_at?.split('T')[0] || '', ends_at: b.ends_at?.split('T')[0] || '' }); setModal('edit'); setPreview(false) }
  const close    = () => { setModal(null); setSelected(null); setPreview(false) }

  const save = async () => {
    setSaving(true)
    const payload = {
      ...form,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : new Date().toISOString(),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      created_by: user?.name || user?.username,
    }
    if (modal === 'add') {
      await supabase.from('banners').insert([payload])
    } else {
      await supabase.from('banners').update(payload).eq('id', selected.id)
    }
    await fetchBanners()
    setSaving(false)
    close()
  }

  const toggleActive = async (id, current) => {
    await supabase.from('banners').update({ active: !current }).eq('id', id)
    setBanners(prev => prev.map(b => b.id === id ? { ...b, active: !current } : b))
  }

  const deleteBanner = async (id, e) => {
    e.stopPropagation()
    await supabase.from('banners').delete().eq('id', id)
    setBanners(prev => prev.filter(b => b.id !== id))
  }

  const active   = banners.filter(b => b.active)
  const inactive = banners.filter(b => !b.active)

  return (
    <div className="fade-in">
      {/* Stats */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total Banners', value: banners.length,        color: 'var(--text)'   },
          { label: 'Active',        value: active.length,         color: 'var(--green)'  },
          { label: 'Inactive',      value: inactive.length,       color: 'var(--sub)'    },
          { label: 'Popups',        value: banners.filter(b => b.display_type === 'popup').length, color: 'var(--gold)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 18px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--sub)' }}>{label}:</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color }}>{value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={openAdd}>Create Banner</button>
      </div>

      {/* Active banners */}
      {active.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            Active
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {active.map(b => <BannerRow key={b.id} banner={b} onEdit={openEdit} onToggle={toggleActive} onDelete={deleteBanner} />)}
          </div>
        </div>
      )}

      {/* Inactive banners */}
      {inactive.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            Inactive
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {inactive.map(b => <BannerRow key={b.id} banner={b} onEdit={openEdit} onToggle={toggleActive} onDelete={deleteBanner} />)}
          </div>
        </div>
      )}

      {banners.length === 0 && !loading && (
        <div className="card card-pad">
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '14px' }}>📢</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', marginBottom: '6px' }}>No banners yet</div>
            <p style={{ fontSize: '13.5px', color: 'var(--sub)', marginBottom: '20px' }}>
              Create banners or popups that appear in the client portal — announcements, maintenance notices, important updates.
            </p>
            <button className="btn btn-primary" onClick={openAdd}>Create First Banner</button>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {(!!modal) && (<div className="modal-backdrop" onClick={close}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><span className="modal-title">{modal === 'add' ? 'Create Banner' : 'Edit Banner'}</span><button onClick={close} style={{background:"none",border:"none",color:"var(--faint)",cursor:"pointer",fontSize:20,lineHeight:1}}>×</button></div><div className="modal-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Preview toggle */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setPreview(p => !p)} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: preview ? 'var(--bg2)' : 'transparent',
              border: '1px solid var(--border)', borderRadius: '8px',
              padding: '6px 14px', fontSize: '12.5px', color: 'var(--sub)', cursor: 'pointer',
            }}>
              <Eye size={13} /> {preview ? 'Hide Preview' : 'Preview'}
            </button>
          </div>

          {preview && (
            <div style={{ marginBottom: '4px' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--sub)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Preview</div>
              <BannerPreview banner={form} />
            </div>
          )}

          <div><label className="inp-label">Title</label><input className="inp" value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} placeholder="Scheduled Maintenance" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', color: 'var(--sub)', fontWeight: 600 }}>Message</label>
            <textarea className="inp" value={form.message} onChange={e => setForm(p => ({...p, message: e.target.value}))}
              placeholder="We'll be carrying out maintenance on Saturday 15th March between 10pm–2am. The portal may be unavailable during this time."
              rows={3} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', color: 'var(--text)', fontSize: '13.5px', resize: 'vertical', lineHeight: 1.6 }}
              onFocus={e => e.target.style.borderColor = 'var(--gold)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {/* Type */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', color: 'var(--sub)', fontWeight: 600 }}>Type</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {TYPES.map(t => (
                  <button key={t.key} onClick={() => setForm(p => ({...p, type: t.key}))} style={{
                    padding: '6px 12px', borderRadius: '8px', border: `1px solid ${form.type === t.key ? t.color : 'var(--border)'}`,
                    background: form.type === t.key ? t.bg : 'transparent',
                    color: form.type === t.key ? t.color : 'var(--sub)',
                    fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
                  }}>{typeIcon[t.key]} {t.label}</button>
                ))}
              </div>
            </div>

            {/* Display type */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', color: 'var(--sub)', fontWeight: 600 }}>Display As</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[{ key: 'banner', label: '— Banner bar' }, { key: 'popup', label: '⬜ Popup modal' }].map(d => (
                  <button key={d.key} onClick={() => setForm(p => ({...p, display_type: d.key}))} style={{
                    padding: '6px 14px', borderRadius: '8px', border: '1px solid',
                    borderColor: form.display_type === d.key ? 'var(--gold)' : 'var(--border)',
                    background: form.display_type === d.key ? 'var(--gold-bg)' : 'transparent',
                    color: form.display_type === d.key ? 'var(--gold)' : 'var(--sub)',
                    fontSize: '12.5px', fontWeight: 500, cursor: 'pointer',
                  }}>{d.label}</button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {/* Target */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', color: 'var(--sub)', fontWeight: 600 }}>Show To</label>
              <select className="inp" value={form.target} onChange={e => setForm(p => ({...p, target: e.target.value}))} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', color: 'var(--text)', fontSize: '13.5px' }}>
                {TARGET_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>

            {/* Page targeting — only show for staff */}
            {form.target === 'staff' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', color: 'var(--sub)', fontWeight: 600 }}>Show on Page</label>
                <select className="inp" value={form.target_page || 'all'} onChange={e => setForm(p => ({...p, target_page: e.target.value}))} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', color: 'var(--text)', fontSize: '13.5px' }}>
                  <option value="all">All Pages</option>
                  <option value="/dashboard">Dashboard</option>
                  <option value="/outreach">Clients Contacted</option>
                  <option value="/clients">Onboarded Clients</option>
                  <option value="/client-mgmt">Client Portal Mgmt</option>
                  <option value="/support">Support Tickets</option>
                  <option value="/staff">Staff & Commissions</option>
                  <option value="/reports">Reports</option>
                  <option value="/banners">Banners & Popups</option>
                  <option value="/email-templates">Email Templates</option>
                  <option value="/audit">Audit & Sessions</option>
                  <option value="/admin">User Accounts</option>
                  <option value="/settings">Settings</option>
                </select>
              </div>
            )}

            {/* Page targeting for client portal */}
            {form.target === 'all' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', color: 'var(--sub)', fontWeight: 600 }}>Show on Page (Client Portal)</label>
                <select className="inp" value={form.target_page || 'all'} onChange={e => setForm(p => ({...p, target_page: e.target.value}))} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', color: 'var(--text)', fontSize: '13.5px' }}>
                  <option value="all">All Pages</option>
                  <option value="/dashboard">Dashboard</option>
                  <option value="/plan">My Plan</option>
                  <option value="/invoices">Invoices</option>
                  <option value="/website">My Website</option>
                  <option value="/documents">Documents</option>
                  <option value="/support">Support</option>
                  <option value="/activity">Activity</option>
                </select>
              </div>
            )}

            {/* Dates */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', color: 'var(--sub)', fontWeight: 600 }}>Expires (optional)</label>
              <input type="date" className="inp" value={form.ends_at} onChange={e => setForm(p => ({...p, ends_at: e.target.value}))} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', color: 'var(--text)', fontSize: '13.5px' }} />
            </div>
          </div>

          {form.target === 'specific' && (
            <div><label className="inp-label">Client Email</label><input className="inp" value={form.target_email} onChange={e => setForm(p => ({...p, target_email: e.target.value}))} placeholder="client@dhwebsiteservices.co.uk" type="email" />
          )}

          <div style={{ display: 'flex', gap: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
              <input type="checkbox" checked={form.active} onChange={e => setForm(p => ({...p, active: e.target.checked}))} style={{ width: 16, height: 16, accentColor: 'var(--gold)' }} />
              Active (show immediately)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
              <input type="checkbox" checked={form.dismissible} onChange={e => setForm(p => ({...p, dismissible: e.target.checked}))} style={{ width: 16, height: 16, accentColor: 'var(--gold)' }} />
              Dismissible
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
            <button className="btn btn-ghost" onClick={close}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={!form.title || !form.message || saving}>{saving ? 'Saving…' : modal === 'add' ? 'Create Banner' : 'Save Changes'}</button>
          </div>
        </div>
      </div></div></div>)}
  )
}

function BannerRow({ banner, onEdit, onToggle, onDelete }) {
  const t = TYPES.find(t => t.key === banner.type) || TYPES[0]
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: '8px', padding: '16px 18px',
      display: 'flex', alignItems: 'flex-start', gap: '14px',
      borderLeft: `4px solid ${banner.active ? t.color : 'var(--faint)'}`,
      opacity: banner.active ? 1 : 0.6,
    }}>
      <div style={{ fontSize: '20px', flexShrink: 0, marginTop: '2px' }}>{typeIcon[banner.type]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{banner.title}</div>
          <span style={{ fontSize: '11px', padding: '1px 8px', borderRadius: '100px', fontWeight: 600, background: `${t.color}18`, color: t.color }}>{banner.type}</span>
          <span style={{ fontSize: '11px', padding: '1px 8px', borderRadius: '100px', fontWeight: 600, background: 'var(--bg2)', color: 'var(--sub)' }}>{banner.display_type}</span>
          <span style={{ fontSize: '11px', padding: '1px 8px', borderRadius: '100px', fontWeight: 600, background: 'var(--bg2)', color: 'var(--sub)' }}>
            {banner.target === 'all' ? 'All clients' : banner.target === 'staff' ? 'Staff portal' : banner.target_email || 'Specific client'}
          </span>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--sub)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{banner.message}</div>
        <div style={{ fontSize: '11.5px', color: 'var(--faint)', marginTop: '4px' }}>
          Created {new Date(banner.created_at).toLocaleDateString('en-GB')}
          {banner.ends_at && ` · Expires ${new Date(banner.ends_at).toLocaleDateString('en-GB')}`}
          {banner.created_by && ` · by ${banner.created_by}`}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button onClick={() => onToggle(banner.id, banner.active)} title={banner.active ? 'Deactivate' : 'Activate'} style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '7px',
          padding: '6px 8px', color: banner.active ? 'var(--green)' : 'var(--sub)', cursor: 'pointer', display: 'flex',
        }}>{banner.active ? <Eye size={14} /> : <EyeOff size={14} />}</button>
        <button onClick={() => onEdit(banner)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px 8px', color: 'var(--sub)', cursor: 'pointer', display: 'flex' }}><Edit2 size={14} /></button>
        <button onClick={e => onDelete(banner.id, e)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px 8px', color: 'var(--red)', cursor: 'pointer', display: 'flex' }}><Trash2 size={14} /></button>
      </div>
  )
}
