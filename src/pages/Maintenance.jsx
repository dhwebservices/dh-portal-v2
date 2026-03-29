import { useState, useEffect } from 'react'
import { Plus, Trash2, CheckCircle, AlertTriangle, XCircle, Wrench, Save } from 'lucide-react'

import { supabase } from '../utils/supabase'

const STATUS_OPTIONS = [
  { value: 'operational',  label: 'Operational',  color: 'var(--green)',  icon: CheckCircle   },
  { value: 'degraded',     label: 'Degraded',     color: 'var(--amber)',  icon: AlertTriangle },
  { value: 'outage',       label: 'Outage',       color: 'var(--red)',    icon: XCircle       },
  { value: 'maintenance',  label: 'Maintenance',  color: 'var(--gold)', icon: Wrench        },
]

const DEFAULT_SYSTEMS = [
  { name: 'Staff Portal',   status: 'operational', note: '', sort_order: 0 },
  { name: 'Client Portal',  status: 'operational', note: '', sort_order: 1 },
  { name: 'Email Service',  status: 'operational', note: '', sort_order: 2 },
  { name: 'Supabase',       status: 'operational', note: '', sort_order: 3 },
  { name: 'Cloudflare',     status: 'operational', note: '', sort_order: 4 },
]

const empty = { name: '', status: 'operational', note: '', sort_order: 99 }

async function createStatusBanner(systemName, status, note, supabaseClient) {
  const typeMap = { degraded: 'warning', outage: 'urgent', maintenance: 'info' }
  const type = typeMap[status] || 'warning'
  const title = status === 'maintenance' ? `Scheduled Maintenance — ${systemName}` 
              : status === 'outage'      ? `Outage — ${systemName}`
              : `Degraded Performance — ${systemName}`
  const message = note || `We are aware of an issue with ${systemName} and are working to resolve it.`
  await supabaseClient.from('banners').insert([{
    title, message, type,
    display_type: status === 'outage' ? 'popup' : 'banner',
    target: 'staff', active: true, dismissible: true,
    target_page: 'all',
    created_at: new Date().toISOString(),
  }])
}

export default function Maintenance() {
  const [systems, setSystems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState({ ...empty })
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)

  useEffect(() => { fetchSystems() }, [])

  const fetchSystems = async () => {
    setLoading(true)
    const { data } = await supabase.from('system_status').select('*').order('sort_order', { ascending: true })
    if (!data || data.length === 0) {
      // Seed defaults
      await supabase.from('system_status').insert(DEFAULT_SYSTEMS)
      setSystems(DEFAULT_SYSTEMS)
    } else {
      setSystems(data)
    }
    setLoading(false)
  }

  const openEdit = (sys = null) => {
    setEditing(sys)
    setForm(sys ? { ...sys } : { ...empty, sort_order: systems.length })
    setModal(true)
  }

  const save = async () => {
    setSaving(true)
    if (editing?.id) {
      await supabase.from('system_status').update({ name: form.name, status: form.status, note: form.note }).eq('id', editing.id)
    } else {
      await supabase.from('system_status').insert([{ name: form.name, status: form.status, note: form.note, sort_order: form.sort_order }])
    }
    await fetchSystems()
    setSaving(false)
    setModal(false)
    if (form.status !== 'operational') {
      const wantBanner = window.confirm(
        `${form.name} saved as ${form.status.toUpperCase()}.\n\nCreate a staff banner to notify the team?`
      )
      if (wantBanner) await createStatusBanner(form.name, form.status, form.note, supabase)
    }
  }

  const remove = async (id) => {
    await supabase.from('system_status').delete().eq('id', id)
    setSystems(p => p.filter(s => s.id !== id))
  }

  const quickStatus = async (sys, newStatus) => {
    await supabase.from('system_status').update({ status: newStatus }).eq('id', sys.id)
    setSystems(p => p.map(s => s.id === sys.id ? { ...s, status: newStatus } : s))
    // Prompt to create banner if not operational
    if (newStatus !== 'operational') {
      const wantBanner = window.confirm(
        `${sys.name} marked as ${newStatus.toUpperCase()}.\n\nCreate a staff banner/popup to notify the team?`
      )
      if (wantBanner) await createStatusBanner(sys.name, newStatus, sys.note, supabase)
    }
  }

  const allOk = systems.every(s => s.status === 'operational')

  return (
    <div className="fade-in">
      {/* Overall status banner */}
      <div style={{
        padding: '16px 20px', borderRadius: '8px', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '12px',
        background: allOk ? 'rgba(0,229,160,0.08)' : 'rgba(255,184,0,0.08)',
        border: `1px solid ${allOk ? 'rgba(0,229,160,0.3)' : 'rgba(255,184,0,0.3)'}`,
      }}>
        {allOk
          ? <CheckCircle size={20} color="var(--green)" />
          : <AlertTriangle size={20} color="var(--amber)" />}
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px', color: allOk ? 'var(--green)' : 'var(--amber)' }}>
            {allOk ? 'All Systems Operational' : 'Some Systems Have Issues'}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--sub)', marginTop: '2px' }}>
            {allOk
              ? 'Everything is running normally. This is shown on the dashboard for all staff.'
              : 'Issues are visible to staff on their dashboard. Update statuses below when resolved.'
            }
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm"><Plus size={12}/> openEdit()}>Add System</button>
      </div>

      {/* Systems list */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--sub)' }}>Loading…</div>
        ) : systems.map((sys, i) => {
          const cfg = STATUS_OPTIONS.find(s => s.value === sys.status) || STATUS_OPTIONS[0]
          const Icon = cfg.icon
          return (
            <div key={sys.id || i} style={{
              padding: '16px 20px', borderBottom: i < systems.length - 1 ? '1px solid var(--border)' : 'none',
              display: 'flex', alignItems: 'center', gap: '14px',
            }}>
              <Icon size={18} color={cfg.color} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{sys.name}</div>
                {sys.note && <div style={{ fontSize: '12.5px', color: 'var(--sub)', marginTop: '2px' }}>{sys.note}</div>}
              </div>

              {/* Quick status buttons */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {STATUS_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => quickStatus(sys, opt.value)} title={opt.label} style={{
                    width: 28, height: 28, borderRadius: '7px', border: '1px solid',
                    borderColor: sys.status === opt.value ? opt.color : 'var(--border)',
                    background: sys.status === opt.value ? `${opt.color}18` : 'transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    <opt.icon size={13} color={sys.status === opt.value ? opt.color : 'var(--faint)'} />
                  </button>
                ))}
              </div>

              <button onClick={() => openEdit(sys)} style={{ background: 'none', border: 'none', color: 'var(--sub)', cursor: 'pointer', fontSize: '12px', padding: '4px 8px' }}>Edit</button>
              {sys.id && (
                <button onClick={() => remove(sys.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', display: 'flex' }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Instructions */}
      <div style={{ marginTop: '16px', padding: '14px 18px', background: 'var(--bg2)', borderRadius: '8px', fontSize: '13px', color: 'var(--sub)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text)' }}>How it works:</strong> Status changes here instantly update the System Status panel on the dashboard for all staff.
        Use the quick buttons to change status, or click Edit to add a note explaining the issue.
        Staff see the overall status and any notes, so they know you're aware of any problems.
      </div>

      {/* Edit/Add Modal */}
      {(modal) && (<div className="modal-backdrop" onClick={() => setModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><span className="modal-title">{editing ? `Edit — ${editing.name}` : 'Add System'}</span><button onClick={() => setModal(false)} style={{background:"none",border:"none",color:"var(--faint)",cursor:"pointer",fontSize:20,lineHeight:1}}>×</button></div><div className="modal-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div><label className="inp-label">System Name</label><input className="inp" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Payment Gateway" /></div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', color: 'var(--sub)', fontWeight: 600 }}>Status</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {STATUS_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setForm(p => ({ ...p, status: opt.value }))} style={{
                  padding: '10px 14px', borderRadius: '6px', border: '2px solid',
                  borderColor: form.status === opt.value ? opt.color : 'var(--border)',
                  background: form.status === opt.value ? `${opt.color}10` : 'transparent',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <opt.icon size={14} color={opt.color} />
                  <span style={{ fontSize: '13px', fontWeight: form.status === opt.value ? 700 : 400, color: form.status === opt.value ? opt.color : 'var(--text)' }}>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', color: 'var(--sub)', fontWeight: 600 }}>Note <span style={{ fontWeight: 400 }}>(shown to staff)</span></label>
            <input className="inp" value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
              placeholder="e.g. Scheduled maintenance until 14:00"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', color: 'var(--text)', fontSize: '13.5px' }}
              onFocus={e => e.target.style.borderColor = 'var(--gold)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '4px' }}>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div></div></div>)}
  )
}
