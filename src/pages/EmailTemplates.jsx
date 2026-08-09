import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { Modal } from '../components/Modal'
import { Button, FormField, FormLabel, FormInput } from '../components/ds'

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
    <div className="ds-content">
      <div className="ds-page-header">
        <div><h1>Email Templates</h1><p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>{templates.length} templates</p></div>
        <Button variant="primary" onClick={openAdd}>+ New Template</Button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : templates.map(t => (
          <div key={t.id} style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20 }}>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:4, color:'var(--color-text-primary)' }}>{t.name}</div>
            <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginBottom:8 }}>{t.subject}</div>
            <div style={{ fontSize:12, color:'var(--color-text-tertiary)', marginBottom:14, lineHeight:1.6, maxHeight:60, overflow:'hidden' }}>{t.body}</div>
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" style={{ height:30, fontSize:12, padding:'0 10px' }} onClick={() => openEdit(t)}>Edit</Button>
              <Button variant="secondary" style={{ height:30, fontSize:12, padding:'0 10px', color:'var(--color-red-500)' }} onClick={() => del(t.id,t.name)}>Delete</Button>
            </div>
          </div>
        ))}
        {!loading && templates.length === 0 && <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No templates yet. Create one to speed up your emails.</div>}
      </div>
      {modal && (
        <Modal title={editing?'Edit Template':'New Template'} onClose={close} width={640} footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>{saving?'Saving...':'Save'}</Button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <FormField><FormLabel>Template Name</FormLabel><FormInput value={form.name} onChange={e=>sf('name',e.target.value)} placeholder="e.g. Welcome Email"/></FormField>
            <FormField><FormLabel>Subject Line</FormLabel><FormInput value={form.subject} onChange={e=>sf('subject',e.target.value)} placeholder="Subject..."/></FormField>
            <FormField><FormLabel>Body</FormLabel><textarea className="ds-form-input" rows={10} value={form.body} onChange={e=>sf('body',e.target.value)} style={{ resize:'vertical', lineHeight:1.7, padding:'8px 12px' }} placeholder="Email body — use {{client_name}}, {{staff_name}} etc for variables"/></FormField>
          </div>
        </Modal>
      )}
    </div>
  )
}
