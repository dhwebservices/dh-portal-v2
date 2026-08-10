import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../utils/supabase'
import { createContractTemplate, buildContractTemplateKey, CONTRACT_PLACEHOLDERS } from '../utils/contracts'
import { Modal } from '../components/Modal'
import { useAuth } from '../contexts/AuthContext'
import { openSecureDocument } from '../utils/fileAccess'
import { Button, FormField, FormLabel, FormInput, StatusBadge } from '../components/ds'

const DS_CARD = { background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)' }

const DEFAULT_TEMPLATE_HTML = `
<p>This Employment Contract is made between <strong>DH Website Services</strong> and <strong>{{staff_name}}</strong>.</p>
<p>The Employee is appointed as <strong>{{staff_role}}</strong> within <strong>{{staff_department}}</strong> from <strong>{{start_date}}</strong> under a <strong>{{contract_type}}</strong> arrangement.</p>
<p>The Employee will report to <strong>{{manager_name}}</strong>, {{manager_title}}.</p>
<p>Both parties agree to the terms of employment, confidentiality requirements, internal policies, and lawful processing of staff data for employment administration.</p>
<p>Issue date: <strong>{{issue_date}}</strong></p>
`

function TemplateCard({ template, onEdit, onArchive, onOpenReference }) {
  return (
    <div style={{ ...DS_CARD, padding:20, display:'grid', gap:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:17, fontWeight:600, color:'var(--color-text-primary)' }}>{template.name}</div>
          <div style={{ fontSize:12.5, color:'var(--color-text-secondary)', marginTop:4 }}>{template.description || 'No description added yet.'}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <StatusBadge variant={template.active ? 'active' : 'info'}>{template.active ? 'Active' : 'Archived'}</StatusBadge>
          <StatusBadge variant="info">{template.contract_type || 'Contract'}</StatusBadge>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
        <div style={{ padding:'10px 12px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:10 }}>
          <div style={{ fontSize:10, color:'var(--color-text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Manager title default</div>
          <div style={{ fontSize:13, fontWeight:600 }}>{template.manager_title_default || 'Department Manager'}</div>
        </div>
        <div style={{ padding:'10px 12px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:10 }}>
          <div style={{ fontSize:10, color:'var(--color-text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Reference file</div>
          <div style={{ fontSize:13, fontWeight:600 }}>{template.reference_file_name || 'None attached'}</div>
        </div>
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:12, color:'var(--color-text-secondary)' }}>
          Updated {new Date(template.updated_at || template.created_at || Date.now()).toLocaleString('en-GB')}
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {template.reference_file_path || template.reference_file_url ? <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => onOpenReference(template)}>Open reference</Button> : null}
          <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => onEdit(template)}>Edit</Button>
          <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px', color:'var(--color-red-500)' }} onClick={() => onArchive(template)}>{template.active ? 'Archive' : 'Restore'}</Button>
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
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Contract Templates</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Employment contract templates</p>
        </div>
        <Button variant="primary" onClick={openNew}>+ New Template</Button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:16, marginBottom:20 }}>
        <div style={{ ...DS_CARD, padding:20 }}><div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{templates.length}</div><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Templates</div></div>
        <div style={{ ...DS_CARD, padding:20 }}><div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{activeCount}</div><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Active</div></div>
        <div style={{ ...DS_CARD, padding:20 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--color-text-tertiary)', marginBottom:8 }}>Merge fields</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {CONTRACT_PLACEHOLDERS.map(([key]) => <StatusBadge key={key} variant="info">{`{{${key}}}`}</StatusBadge>)}
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gap:14 }}>
        {loading ? <div className="spin-wrap"><div className="spin" /></div> : templates.length ? templates.map((template) => (
          <TemplateCard key={template.id} template={template} onEdit={openEdit} onArchive={toggleArchive} onOpenReference={openReference} />
        )) : (
          <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No contract templates yet. Create one to start issuing signed staff contracts.</div>
        )}
      </div>

      {open && (
        <Modal
          title={editing ? `Edit ${editing.name}` : 'New Contract Template'}
          onClose={() => setOpen(false)}
          width={920}
          footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save template'}</Button></>}
        >
          <div style={{ display:'grid', gap:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <FormField><FormLabel>Template name</FormLabel><FormInput value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} /></FormField>
              <FormField><FormLabel>Contract type</FormLabel><FormInput value={form.contract_type} onChange={(e) => setForm((current) => ({ ...current, contract_type: e.target.value }))} /></FormField>
              <FormField><FormLabel>Email subject</FormLabel><FormInput value={form.subject} onChange={(e) => setForm((current) => ({ ...current, subject: e.target.value }))} /></FormField>
              <FormField><FormLabel>Default manager title</FormLabel><FormInput value={form.manager_title_default} onChange={(e) => setForm((current) => ({ ...current, manager_title_default: e.target.value }))} /></FormField>
            </div>
            <FormField><FormLabel>Description</FormLabel><textarea className="ds-form-input" rows={3} value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} style={{ resize:'vertical', padding:'8px 12px' }} /></FormField>
            <FormField>
              <FormLabel>Template body</FormLabel>
              <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginBottom:8 }}>Use merge fields like {CONTRACT_PLACEHOLDERS.map(([key]) => `{{${key}}}`).join(', ')}.</div>
              <textarea className="ds-form-input" rows={14} value={form.content_html} onChange={(e) => setForm((current) => ({ ...current, content_html: e.target.value }))} style={{ resize:'vertical', fontFamily:'var(--font-mono)', fontSize:12, padding:'8px 12px' }} />
            </FormField>
            <div style={{ ...DS_CARD, padding:20, display:'grid', gap:10 }}>
              <FormLabel>Attach reference contract file</FormLabel>
              <div style={{ fontSize:12, color:'var(--color-text-secondary)' }}>Optional. Store the original contract PDF or source document alongside the template for internal reference.</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <input ref={fileRef} type="file" style={{ display:'none' }} accept=".pdf,.doc,.docx,.html" onChange={(e) => setReferenceFile(e.target.files?.[0] || null)} />
                <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => fileRef.current?.click()}>{referenceFile ? 'Change file' : 'Choose file'}</Button>
                <span style={{ fontSize:12, color: referenceFile ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{referenceFile ? referenceFile.name : (form.reference_file_name || 'No reference file attached')}</span>
              </div>
            </div>
            {error ? <div style={{ fontSize:13, color:'var(--color-red-500)' }}>{error}</div> : null}
          </div>
        </Modal>
      )}
    </div>
  )
}
