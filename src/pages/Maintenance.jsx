import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { Modal } from '../components/Modal'
import { sendEmail } from '../utils/email'
import { useAuth } from '../contexts/AuthContext'
import { loadActivePortalStaffAudience } from '../utils/staffAudience'

const STATUS_OPTS = [
  { value:'operational', label:'Operational', color:'var(--green)' },
  { value:'degraded',    label:'Degraded',    color:'var(--amber)' },
  { value:'outage',      label:'Outage',      color:'var(--red)'   },
  { value:'maintenance', label:'Maintenance', color:'var(--blue)'  },
]

const PRESET_SYSTEMS = [
  { name:'Staff Portal',        url:'https://staff.dhwebsiteservices.co.uk' },
  { name:'Client Portal',       url:'https://app.dhwebsiteservices.co.uk'   },
  { name:'Public Website',      url:'https://dhwebsiteservices.co.uk'       },
  { name:'Email (Microsoft 365)', url:''                                    },
  { name:'GoCardless Payments', url:'https://gocardless.com'                },
  { name:'Supabase Database',   url:'https://supabase.com'                  },
  { name:'Cloudflare CDN',      url:'https://cloudflare.com'                },
  { name:'Microsoft 365',       url:'https://portal.office.com'             },
  { name:'GitHub',              url:'https://github.com/dhwebservices'      },
]

const EMPTY = { name:'', status:'operational', note:'', url:'' }

export default function Maintenance() {
  const { user } = useAuth()
  const [systems, setSystems] = useState([])
  const [portalMaintenance, setPortalMaintenance] = useState({ enabled:false, message:'', eta:'' })
  const [savedPortalMaintenance, setSavedPortalMaintenance] = useState({ enabled:false, message:'', eta:'' })
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [portalSaving, setPortalSaving] = useState(false)
  const [portalSaved, setPortalSaved] = useState('')
  const [portalError, setPortalError] = useState('')
  const sf = (k,v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    const [{ data }, { data: maintenanceSetting }] = await Promise.all([
      supabase.from('maintenance_systems').select('*').order('name'),
      supabase.from('portal_settings').select('value').eq('key', 'portal_maintenance').maybeSingle(),
    ])
    setSystems(data || [])
    const raw = maintenanceSetting?.value?.value ?? maintenanceSetting?.value ?? {}
    const nextMaintenance = {
      enabled: raw?.enabled === true,
      message: raw?.message || '',
      eta: raw?.eta || '',
    }
    setPortalMaintenance(nextMaintenance)
    setSavedPortalMaintenance(nextMaintenance)
    setLoading(false)
  }

  const openAdd     = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit    = s => { setEditing(s); setForm({ ...s }); setModal(true) }
  const close       = () => { setModal(false); setEditing(null) }
  const save = async () => {
    setSaving(true)
    if (editing) await supabase.from('maintenance_systems').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editing.id)
    else await supabase.from('maintenance_systems').insert([{ ...form, updated_at: new Date().toISOString() }])
    setSaving(false); close(); load()
  }
  const del = async (id, name) => { if (!confirm('Remove '+name+'?')) return; await supabase.from('maintenance_systems').delete().eq('id', id); load() }

  const addPreset = async (preset) => {
    if (systems.find(s => s.name === preset.name)) return
    await supabase.from('maintenance_systems').insert([{ name: preset.name, url: preset.url, status:'operational', updated_at: new Date().toISOString() }])
    load()
  }

  const savePortalMaintenance = async () => {
    setPortalSaving(true)
    setPortalError('')
    const shouldNotifyStaff = !savedPortalMaintenance.enabled && portalMaintenance.enabled
    const { error: settingsError } = await supabase
      .from('portal_settings')
      .upsert({
        key: 'portal_maintenance',
        value: { value: portalMaintenance },
      }, { onConflict:'key' })

    if (settingsError) {
      setPortalSaving(false)
      setPortalError(settingsError.message || 'Unable to save maintenance mode.')
      return
    }

    if (shouldNotifyStaff) {
      try {
        const recipients = await loadActivePortalStaffAudience()

        const subject = 'DH Staff Portal Under Maintenance'
        const message = `
          <p>Hi {{name}},</p>
          <p>${portalMaintenance.message || 'The DH Staff Portal is currently under maintenance. Please come back later.'}</p>
          ${portalMaintenance.eta ? `<p><strong>Expected return time:</strong> ${portalMaintenance.eta}</p>` : ''}
          <p>You will be able to log in again once maintenance has been completed.</p>
        `

        await Promise.allSettled(
          recipients.map((recipient) =>
            sendEmail('send_email', {
              to: recipient.email,
              to_name: recipient.name,
              subject,
              html: message.replace('{{name}}', recipient.name || 'there'),
              sent_by: user?.name || 'System',
              from_email: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
              log_outreach: false,
            })
          )
        )
      } catch (err) {
        console.error('Maintenance notification send failed:', err)
      }
    }

    setSavedPortalMaintenance({ ...portalMaintenance })
    setPortalSaved('saved')
    setTimeout(() => setPortalSaved(''), 3000)
    setPortalSaving(false)
  }

  const statusColor = Object.fromEntries(STATUS_OPTS.map(s => [s.value, s.color]))
  const overall = systems.length === 0 ? 'operational' : systems.every(s => s.status === 'operational') ? 'operational' : systems.some(s => s.status === 'outage') ? 'outage' : 'degraded'
  const overallColor = { operational:'var(--green)', degraded:'var(--amber)', outage:'var(--red)', maintenance:'var(--blue)' }[overall] || 'var(--green)'

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Maintenance</h1><p className="page-sub">System status board</p></div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add System</button>
      </div>

      {/* Overall status banner */}
      <div style={{ padding:'16px 20px', borderRadius:10, background:'var(--card)', border:`2px solid ${overallColor}`, marginBottom:24, display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:14, height:14, borderRadius:'50%', background:overallColor, flexShrink:0, boxShadow:`0 0 8px ${overallColor}` }}/>
        <div>
          <div style={{ fontWeight:600, fontSize:15 }}>All Systems <span style={{ color:overallColor, textTransform:'capitalize' }}>{overall === 'operational' ? 'Operational' : overall}</span></div>
          <div style={{ fontSize:12, color:'var(--faint)', marginTop:1 }}>{systems.length} systems monitored · Last updated {new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}</div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom:20, maxWidth:720 }}>
        <div className="lbl" style={{ marginBottom:12 }}>Portal Maintenance Lock</div>
        <div style={{ display:'grid', gap:14 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600 }}>Enable maintenance mode</div>
              <div style={{ fontSize:12, color:'var(--sub)', marginTop:4 }}>Blocks staff access after login, while admins can still enter the portal.</div>
            </div>
            <button onClick={() => setPortalMaintenance((current) => ({ ...current, enabled: !current.enabled }))} style={{ width:40, height:22, borderRadius:11, background: portalMaintenance.enabled ? 'var(--amber)' : 'var(--border)', border:'none', cursor:'pointer', position:'relative', flexShrink:0 }}>
              <div style={{ position:'absolute', top:2, left: portalMaintenance.enabled ? 20 : 2, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
            </button>
          </div>
          <div>
            <label className="lbl">Staff message</label>
            <textarea className="inp" rows={3} value={portalMaintenance.message} onChange={(e) => setPortalMaintenance((current) => ({ ...current, message: e.target.value }))} style={{ resize:'vertical' }} placeholder="The portal is currently undergoing maintenance. Please come back later." />
          </div>
          <div>
            <label className="lbl">Expected return time</label>
            <input className="inp" value={portalMaintenance.eta} onChange={(e) => setPortalMaintenance((current) => ({ ...current, eta: e.target.value }))} placeholder="e.g. Today at 18:30 or 2 Apr 2026, 09:00" />
          </div>
          <div style={{ padding:'12px 14px', background: portalMaintenance.enabled ? 'var(--amber-bg)' : 'var(--bg2)', border:`1px solid ${portalMaintenance.enabled ? 'var(--amber)' : 'var(--border)'}`, borderRadius:8, fontSize:13, color: portalMaintenance.enabled ? 'var(--amber)' : 'var(--sub)' }}>
            {portalMaintenance.enabled
              ? 'Maintenance mode is live for staff once you save these settings.'
              : 'Maintenance mode is currently off.'}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <button className="btn btn-primary" onClick={savePortalMaintenance} disabled={portalSaving}>{portalSaving ? 'Saving...' : 'Save Portal Maintenance'}</button>
            {portalSaved === 'saved' ? <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved</span> : null}
            {portalError ? <span style={{ fontSize:13, color:'var(--red)' }}>{portalError}</span> : null}
            <span style={{ fontSize:12, color:'var(--faint)' }}>Staff will be blocked. Admins will still be allowed in.</span>
          </div>
        </div>
      </div>

      {/* Preset systems quick-add */}
      {systems.length < PRESET_SYSTEMS.length && (
        <div className="card card-pad" style={{ marginBottom:20 }}>
          <div className="lbl" style={{ marginBottom:10 }}>Quick Add Preset Systems</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {PRESET_SYSTEMS.filter(p => !systems.find(s => s.name === p.name)).map(p => (
              <button key={p.name} onClick={() => addPreset(p)} className="btn btn-outline btn-sm">+ {p.name}</button>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : systems.length === 0 ? (
          <div className="empty"><p>No systems added yet.<br/>Use quick-add above to add preset systems.</p></div>
        ) : (
          <table className="tbl">
            <thead><tr><th>System</th><th>Status</th><th>Note</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {systems.map(s => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight:500, color:'var(--text)' }}>{s.name}</div>
                    {s.url && <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize:10, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{s.url}</a>}
                  </td>
                  <td>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600, color: statusColor[s.status] || 'var(--sub)' }}>
                      <span style={{ width:8, height:8, borderRadius:'50%', background: statusColor[s.status] || 'var(--sub)', flexShrink:0 }}/>
                      {STATUS_OPTS.find(o => o.value === s.status)?.label || s.status}
                    </span>
                  </td>
                  <td style={{ maxWidth:250, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:13 }}>{s.note || '—'}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{s.updated_at ? new Date(s.updated_at).toLocaleDateString('en-GB') : '—'}</td>
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(s.id, s.name)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal title={editing ? `Edit — ${editing.name}` : 'Add System'} onClose={close}
          footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div><label className="lbl">System Name</label><input className="inp" value={form.name} onChange={e => sf('name', e.target.value)} placeholder="e.g. Client Portal"/></div>
            <div><label className="lbl">URL (optional)</label><input className="inp" value={form.url} onChange={e => sf('url', e.target.value)} placeholder="https://"/></div>
            <div>
              <label className="lbl" style={{ marginBottom:8 }}>Status</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {STATUS_OPTS.map(opt => (
                  <button key={opt.value} onClick={() => sf('status', opt.value)} style={{ padding:'10px 14px', borderRadius:7, border:`2px solid ${form.status === opt.value ? opt.color : 'var(--border)'}`, background: form.status === opt.value ? opt.color+'18' : 'transparent', cursor:'pointer', display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:500, color: form.status === opt.value ? opt.color : 'var(--sub)' }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:opt.color, flexShrink:0 }}/>{opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div><label className="lbl">Note (shown to staff)</label><input className="inp" value={form.note} onChange={e => sf('note', e.target.value)} placeholder="e.g. Scheduled maintenance until 14:00"/></div>
          </div>
        </Modal>
      )}
    </div>
  )
}
