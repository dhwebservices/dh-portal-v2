import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../utils/supabase'
import { createContractTemplate, buildContractTemplateKey, CONTRACT_PLACEHOLDERS } from '../utils/contracts'
import { Modal } from '../components/Modal'
import { useAuth } from '../contexts/AuthContext'
import { openSecureDocument } from '../utils/fileAccess'

const DEFAULT_TEMPLATE_HTML = `
<p>This Employment Contract is made between <strong>DH Website Services</strong> and <strong>{{staff_name}}</strong>.</p>
<p>The Employee is appointed as <strong>{{staff_role}}</strong> within <strong>{{staff_department}}</strong> from <strong>{{start_date}}</strong> under a <strong>{{contract_type}}</strong> arrangement.</p>
<p>The Employee will report to <strong>{{manager_name}}</strong>, {{manager_title}}.</p>
<p>Both parties agree to the terms of employment, confidentiality requirements, internal policies, and lawful processing of staff data for employment administration.</p>
<p>Issue date: <strong>{{issue_date}}</strong></p>
`

function TemplateCard({ template, onEdit, onArchive, onOpenReference }) {
  return (
    <div className="card card-pad" style={{ display:'grid', gap:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:17, fontWeight:600, color:'var(--text)' }}>{template.name}</div>
          <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:4 }}>{template.description || 'No description added yet.'}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <span className={`badge badge-${template.active ? 'green' : 'grey'}`}>{template.active ? 'Active' : 'Archived'}</span>
          <span className="badge badge-blue">{template.contract_type || 'Contract'}</span>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
        <div style={{ padding:'10px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
          <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Manager title default</div>
          <div style={{ fontSize:13, fontWeight:600 }}>{template.manager_title_default || 'Department Manager'}</div>
        </div>
        <div style={{ padding:'10px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
          <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Reference file</div>
          <div style={{ fontSize:13, fontWeight:600 }}>{template.reference_file_name || 'None attached'}</div>
        </div>
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:12, color:'var(--sub)' }}>
          Updated {new Date(template.updated_at || template.created_at || Date.now()).toLocaleString('en-GB')}
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {template.reference_file_path || template.reference_file_url ? <button className="btn btn-outline btn-sm" onClick={() => onOpenReference(template)}>Open reference</button> : null}
          <button className="btn btn-outline btn-sm" onClick={() => onEdit(template)}>Edit</button>
          <button className="btn btn-danger btn-sm" onClick={() => onArchive(template)}>{template.active ? 'Archive' : 'Restore'}</button>
        </div>
      </div>
    </div>
  )
}

export default function ContractTemplates() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState(createContractTemplate({
    name: '',
    description: '',
    contract_type: 'Employment Contract',
    subject: 'Employment contract',
    manager_title_default: 'Department Manager',
    content_html: DEFAULT_TEMPLATE_HTML,
  }))
  const [referenceFile, setReferenceFile] = useState(null)
  const fileRef = useRef()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('portal_settings').select('key,value').like('key', 'contract_template:%')
    const rows = (data || []).map((row) => createContractTemplate({
      id: String(row.key || '').replace('contract_template:', ''),
      ...(row.value?.value ?? row.value ?? {}),
    }))
    rows.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
    setTemplates(rows)
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setReferenceFile(null)
    setForm(createContractTemplate({
      name: '',
      description: '',
      contract_type: 'Employment Contract',
      subject: 'Employment contract',
      manager_title_default: 'Department Manager',
      content_html: DEFAULT_TEMPLATE_HTML,
      active: true,
    }))
    setError('')
    setOpen(true)
  }

  function openEdit(template) {
    setEditing(template)
    setReferenceFile(null)
    setForm(createContractTemplate(template))
    setError('')
    setOpen(true)
  }

  async function save() {
    if (!form.name.trim() || !form.content_html.trim()) {
      setError('Add a template name and contract body before saving.')
      return
    }
    setSaving(true)
    setError('')
    try {
      let nextTemplate = createContractTemplate({
        ...form,
        id: editing?.id || form.id,
        updated_at: new Date().toISOString(),
      })

      if (referenceFile) {
        const filePath = `contract-templates/${nextTemplate.id}/${Date.now()}-${referenceFile.name}`
        const { error: uploadError } = await supabase.storage.from('hr-documents').upload(filePath, referenceFile)
        if (uploadError) throw uploadError
        nextTemplate = {
          ...nextTemplate,
          reference_file_url: '',
          reference_file_path: filePath,
          reference_file_name: referenceFile.name,
        }
      }

      const { error } = await supabase.from('portal_settings').upsert({
        key: buildContractTemplateKey(nextTemplate.id),
        value: { value: nextTemplate },
      }, { onConflict: 'key' })
      if (error) throw error

      setOpen(false)
      await load()
    } catch (saveError) {
      setError(saveError.message || 'Could not save the contract template.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleArchive(template) {
    const nextTemplate = createContractTemplate({
      ...template,
      active: !template.active,
      updated_at: new Date().toISOString(),
    })
    await supabase.from('portal_settings').upsert({
      key: buildContractTemplateKey(nextTemplate.id),
      value: { value: nextTemplate },
    }, { onConflict: 'key' })
    await load()
  }

  async function openReference(template) {
    try {
      await openSecureDocument({
        filePath: template.reference_file_path,
        fallbackUrl: template.reference_file_url,
        userEmail: user?.email,
        userName: user?.name,
        action: 'contract_template_reference_opened',
        entity: 'contract_template',
        entityId: template.id,
        details: {
          template_name: template.name,
          file_name: template.reference_file_name || '',
        },
      })
    } catch (openError) {
      setError(openError.message || 'Could not open the reference file.')
    }
  }

  const activeCount = useMemo(() => templates.filter((template) => template.active).length, [templates])

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Contract Templates</h1>
          <p className="page-sub">Build mergeable employment contract templates, attach a reference contract, and reuse them across staff onboarding.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ New Template</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:16, marginBottom:20 }}>
        <div className="stat-card"><div className="stat-val">{templates.length}</div><div className="stat-lbl">Templates</div></div>
        <div className="stat-card"><div className="stat-val">{activeCount}</div><div className="stat-lbl">Active</div></div>
        <div className="card card-pad">
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:8 }}>Merge fields</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {CONTRACT_PLACEHOLDERS.map(([key]) => <span key={key} className="badge badge-blue">{`{{${key}}}`}</span>)}
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gap:14 }}>
        {loading ? <div className="spin-wrap"><div className="spin" /></div> : templates.length ? templates.map((template) => (
          <TemplateCard key={template.id} template={template} onEdit={openEdit} onArchive={toggleArchive} onOpenReference={openReference} />
        )) : (
          <div className="empty"><p>No contract templates yet. Create one to start issuing signed staff contracts.</p></div>
        )}
      </div>

      {open && (
        <Modal
          title={editing ? `Edit ${editing.name}` : 'New Contract Template'}
          onClose={() => setOpen(false)}
          width={920}
          footer={<><button className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save template'}</button></>}
        >
          <div style={{ display:'grid', gap:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><label className="lbl">Template name</label><input className="inp" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} /></div>
              <div><label className="lbl">Contract type</label><input className="inp" value={form.contract_type} onChange={(e) => setForm((current) => ({ ...current, contract_type: e.target.value }))} /></div>
              <div><label className="lbl">Email subject</label><input className="inp" value={form.subject} onChange={(e) => setForm((current) => ({ ...current, subject: e.target.value }))} /></div>
              <div><label className="lbl">Default manager title</label><input className="inp" value={form.manager_title_default} onChange={(e) => setForm((current) => ({ ...current, manager_title_default: e.target.value }))} /></div>
            </div>
            <div><label className="lbl">Description</label><textarea className="inp" rows={3} value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} style={{ resize:'vertical' }} /></div>
            <div>
              <div className="lbl" style={{ marginBottom:6 }}>Template body</div>
              <div style={{ fontSize:12, color:'var(--sub)', marginBottom:8 }}>Use merge fields like {CONTRACT_PLACEHOLDERS.map(([key]) => `{{${key}}}`).join(', ')}.</div>
              <textarea className="inp" rows={14} value={form.content_html} onChange={(e) => setForm((current) => ({ ...current, content_html: e.target.value }))} style={{ resize:'vertical', fontFamily:'var(--font-mono)', fontSize:12 }} />
            </div>
            <div className="card card-pad" style={{ display:'grid', gap:10 }}>
              <div className="lbl">Attach reference contract file</div>
              <div style={{ fontSize:12, color:'var(--sub)' }}>Optional. Store the original contract PDF or source document alongside the template for internal reference.</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <input ref={fileRef} type="file" style={{ display:'none' }} accept=".pdf,.doc,.docx,.html" onChange={(e) => setReferenceFile(e.target.files?.[0] || null)} />
                <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{referenceFile ? 'Change file' : 'Choose file'}</button>
                <span style={{ fontSize:12, color: referenceFile ? 'var(--text)' : 'var(--sub)' }}>{referenceFile ? referenceFile.name : (form.reference_file_name || 'No reference file attached')}</span>
              </div>
            </div>
            {error ? <div style={{ fontSize:13, color:'var(--red)' }}>{error}</div> : null}
          </div>
        </Modal>
      )}
    </div>
  )
}
