import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { Modal } from '../components/Modal'

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
  const [systems, setSystems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const sf = (k,v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('maintenance_systems').select('*').order('name')
    setSystems(data || [])
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
