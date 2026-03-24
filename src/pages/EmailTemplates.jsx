import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { Modal } from '../components/Modal'

const EMPTY = { name:'', subject:'', body:'' }

export default function EmailTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const sf = (k,v) => setForm(p=>({...p,[k]:v}))

  useEffect(() => { load() }, [])
  const load = async () => { setLoading(true); const { data } = await supabase.from('email_templates').select('*').order('name'); setTemplates(data||[]); setLoading(false) }
  const openAdd  = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = t => { setEditing(t); setForm({...t}); setModal(true) }
  const close    = () => { setModal(false); setEditing(null) }
  const save = async () => { setSaving(true); if (editing) await supabase.from('email_templates').update(form).eq('id',editing.id); else await supabase.from('email_templates').insert([form]); setSaving(false); close(); load() }
  const del  = async (id,name) => { if (!confirm('Delete '+name+'?')) return; await supabase.from('email_templates').delete().eq('id',id); load() }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Email Templates</h1><p className="page-sub">{templates.length} templates</p></div>
        <button className="btn btn-primary" onClick={openAdd}>+ New Template</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : templates.map(t => (
          <div key={t.id} className="card card-pad">
            <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>{t.name}</div>
            <div style={{ fontSize:12, color:'var(--sub)', marginBottom:8 }}>{t.subject}</div>
            <div style={{ fontSize:12, color:'var(--faint)', marginBottom:14, lineHeight:1.6, maxHeight:60, overflow:'hidden' }}>{t.body}</div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-outline btn-sm" onClick={() => openEdit(t)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => del(t.id,t.name)}>Delete</button>
            </div>
          </div>
        ))}
        {!loading && templates.length === 0 && <div className="empty"><p>No templates yet. Create one to speed up your emails.</p></div>}
      </div>
      {modal && (
        <Modal title={editing?'Edit Template':'New Template'} onClose={close} width={640} footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving...':'Save'}</button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div><label className="lbl">Template Name</label><input className="inp" value={form.name} onChange={e=>sf('name',e.target.value)} placeholder="e.g. Welcome Email"/></div>
            <div><label className="lbl">Subject Line</label><input className="inp" value={form.subject} onChange={e=>sf('subject',e.target.value)} placeholder="Subject..."/></div>
            <div><label className="lbl">Body</label><textarea className="inp" rows={10} value={form.body} onChange={e=>sf('body',e.target.value)} style={{ resize:'vertical', lineHeight:1.7 }} placeholder="Email body — use {{client_name}}, {{staff_name}} etc for variables"/></div>
          </div>
        </Modal>
      )}
    </div>
  )
}
