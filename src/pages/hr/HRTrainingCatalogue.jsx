import { useEffect, useMemo, useState } from 'react'
import { BookOpen, GraduationCap, ShieldCheck } from 'lucide-react'
import { supabase } from '../../utils/supabase'
import { Modal } from '../../components/Modal'
import { TRAINING_CATEGORY_OPTIONS } from '../../utils/peopleOps'
import { buildTrainingTemplateKey, createTrainingTemplate } from '../../utils/trainingCatalogue'

const EMPTY_FORM = {
  title: '',
  summary: '',
  category: 'induction',
  mandatory: true,
  default_due_days: 7,
  default_expiry_days: 0,
  certificate_name: '',
  notes: '',
  active: true,
}

function StatCard({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="stat-card" style={{ minHeight: 118 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div className="stat-lbl">{label}</div>
        <div style={{ width: 34, height: 34, borderRadius: 12, background: `${tone}22`, color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} />
        </div>
      </div>
      <div className="stat-val">{value}</div>
      <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 8, lineHeight: 1.5 }}>{hint}</div>
    </div>
  )
}

export default function HRTrainingCatalogue() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('portal_settings').select('key,value').like('key', 'training_template:%')
    const rows = (data || []).map((row) => createTrainingTemplate({
      id: String(row.key || '').replace('training_template:', ''),
      ...(row?.value?.value ?? row?.value ?? {}),
    }))
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
    setTemplates(rows)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setOpen(true)
  }

  const openEdit = (template) => {
    setEditing(template)
    setForm(createTrainingTemplate(template))
    setOpen(true)
  }

  const save = async () => {
    if (!form.title.trim()) return
    const next = createTrainingTemplate({
      ...form,
      id: editing?.id || form.id,
      created_at: editing?.created_at || undefined,
      updated_at: new Date().toISOString(),
    })
    setSaving(true)
    await supabase.from('portal_settings').upsert({
      key: buildTrainingTemplateKey(next.id),
      value: { value: next },
    }, { onConflict: 'key' })
    setSaving(false)
    setOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
    await load()
  }

  const toggleArchive = async (template) => {
    const next = createTrainingTemplate({
      ...template,
      active: !template.active,
      updated_at: new Date().toISOString(),
    })
    await supabase.from('portal_settings').upsert({
      key: buildTrainingTemplateKey(next.id),
      value: { value: next },
    }, { onConflict: 'key' })
    await load()
  }

  const stats = useMemo(() => ({
    total: templates.length,
    active: templates.filter((item) => item.active).length,
    mandatory: templates.filter((item) => item.active && item.mandatory).length,
  }), [templates])

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Training Catalogue</h1>
          <p className="page-sub">Reusable training templates for induction, compliance, systems, and certification assignments.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>New training template</button>
      </div>

      <div className="dashboard-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon={BookOpen} label="Templates" value={stats.total} hint="All saved catalogue entries." tone="var(--blue)" />
        <StatCard icon={GraduationCap} label="Active" value={stats.active} hint="Templates available for assignment in staff profiles." tone="var(--green)" />
        <StatCard icon={ShieldCheck} label="Mandatory" value={stats.mandatory} hint="Active items flagged as mandatory training." tone="var(--red)" />
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        {loading ? <div className="spin-wrap"><div className="spin" /></div> : templates.length ? templates.map((template) => (
          <div key={template.id} className="card card-pad" style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>{template.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 4 }}>{template.summary || 'No summary added yet.'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className={`badge badge-${template.active ? 'green' : 'grey'}`}>{template.active ? 'Active' : 'Archived'}</span>
                <span className={`badge badge-${template.mandatory ? 'red' : 'blue'}`}>{template.mandatory ? 'Mandatory' : 'Optional'}</span>
                <span className="badge badge-grey">{TRAINING_CATEGORY_OPTIONS.find(([key]) => key === template.category)?.[1] || template.category}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
              <div style={{ padding: '10px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Default due</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{template.default_due_days} day{template.default_due_days === 1 ? '' : 's'}</div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Default expiry</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{template.default_expiry_days ? `${template.default_expiry_days} day${template.default_expiry_days === 1 ? '' : 's'}` : 'No expiry'}</div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Certificate</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{template.certificate_name || 'Not required'}</div>
              </div>
            </div>
            {template.notes ? <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.6 }}>{template.notes}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--sub)' }}>Updated {new Date(template.updated_at || template.created_at || Date.now()).toLocaleString('en-GB')}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => openEdit(template)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => toggleArchive(template)}>{template.active ? 'Archive' : 'Restore'}</button>
              </div>
            </div>
          </div>
        )) : (
          <div className="empty"><p>No training templates yet. Create one to reuse training assignments across staff.</p></div>
        )}
      </div>

      {open ? (
        <Modal
          title={editing ? `Edit ${editing.title}` : 'New Training Template'}
          onClose={() => setOpen(false)}
          width={860}
          footer={<><button className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving || !form.title.trim()}>{saving ? 'Saving...' : 'Save template'}</button></>}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: 12 }}>
              <div><label className="lbl">Template title</label><input className="inp" value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} /></div>
              <div><label className="lbl">Category</label><select className="inp" value={form.category} onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))}>{TRAINING_CATEGORY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
            </div>
            <div><label className="lbl">Summary</label><input className="inp" value={form.summary} onChange={(e) => setForm((current) => ({ ...current, summary: e.target.value }))} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <div><label className="lbl">Default due days</label><input className="inp" type="number" min="0" value={form.default_due_days} onChange={(e) => setForm((current) => ({ ...current, default_due_days: e.target.value }))} /></div>
              <div><label className="lbl">Default expiry days</label><input className="inp" type="number" min="0" value={form.default_expiry_days} onChange={(e) => setForm((current) => ({ ...current, default_expiry_days: e.target.value }))} /></div>
              <div><label className="lbl">Certificate name</label><input className="inp" value={form.certificate_name} onChange={(e) => setForm((current) => ({ ...current, certificate_name: e.target.value }))} /></div>
            </div>
            <div><label className="lbl">Assignment notes</label><textarea className="inp" rows={5} value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} style={{ resize: 'vertical' }} /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--sub)' }}>
              <input type="checkbox" checked={form.mandatory} onChange={(e) => setForm((current) => ({ ...current, mandatory: e.target.checked }))} />
              Mandatory training
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--sub)' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((current) => ({ ...current, active: e.target.checked }))} />
              Template is active
            </label>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
