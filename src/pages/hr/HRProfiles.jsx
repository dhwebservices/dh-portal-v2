import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Modal } from '../../components/Modal'
import { Button, FormField, FormLabel, FormInput, FormSelect, Alert } from '../../components/ds'
import { buildStaffWorkspaceKey, getWorkspaceLabel, normalizeWorkspace, WORKSPACE_OPTIONS } from '../../utils/workspaces'

const EMPTY = { full_name:'',role:'',department:'',contract_type:'',start_date:'',phone:'',personal_email:'',address:'',manager_name:'',hr_notes:'',bank_name:'',account_name:'',sort_code:'',account_number:'',primary_workspace:'' }

export default function HRProfiles() {
  const { user, can } = useAuth()
  const isManager = can('admin') || can('hr_profiles')
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [tab, setTab]           = useState('info')
  const [saving, setSaving]     = useState(false)
  const sf = (k,v) => setForm(p=>({...p,[k]:v}))

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    const [{ data }, { data: workspaceRows }] = await Promise.all([
      supabase.from('hr_profiles').select('*').order('full_name'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_workspace:%'),
    ])
    const workspaceMap = Object.fromEntries((workspaceRows || []).map((row) => {
      const email = String(row.key || '').replace('staff_workspace:', '')
      const raw = row?.value?.value ?? row?.value ?? {}
      return [email, normalizeWorkspace(raw?.primary_workspace ?? raw)]
    }))
    const bestByEmail = new Map()
    for (const row of data || []) {
      const email = String(row.user_email || '').toLowerCase()
      if (!email) continue
      const existing = bestByEmail.get(email)
      const rowScore = (String(row.user_email || '') === email ? 2 : 0) + (row.full_name && !String(row.full_name).includes('(') ? 2 : 0)
      const existingScore = existing ? ((String(existing.user_email || '') === email ? 2 : 0) + (existing.full_name && !String(existing.full_name).includes('(') ? 2 : 0)) : -1
      if (!existing || rowScore >= existingScore) bestByEmail.set(email, { ...row, user_email: email, primary_workspace: workspaceMap[email] || '' })
    }
    setProfiles([...bestByEmail.values()])
    setLoading(false)
  }

  const openEdit = p => { setSelected(p); setForm({...EMPTY,...p}); setTab('info'); setModal(true) }
  const close    = () => { setModal(false); setSelected(null) }
  const save = async () => {
    setSaving(true)
    const payload = { ...form, user_email: String(selected.user_email || '').toLowerCase(), updated_at: new Date().toISOString() }
    delete payload.primary_workspace
    if (selected?.id) await supabase.from('hr_profiles').update(payload).eq('id', selected.id)
    else await supabase.from('hr_profiles').insert([{ ...payload, created_at: new Date().toISOString() }])
    const workspaceValue = normalizeWorkspace(form.primary_workspace)
    if (workspaceValue) {
      await supabase.from('portal_settings').upsert({
        key: buildStaffWorkspaceKey(payload.user_email),
        value: { value: { primary_workspace: workspaceValue, updated_at: new Date().toISOString() } },
      }, { onConflict: 'key' })
    } else {
      await supabase.from('portal_settings').delete().eq('key', buildStaffWorkspaceKey(payload.user_email))
    }
    setSaving(false); close(); load()
  }

  const filtered = profiles.filter(p => { const q=search.toLowerCase(); return !q||p.full_name?.toLowerCase().includes(q)||p.user_email?.toLowerCase().includes(q)||p.role?.toLowerCase().includes(q) })

  return (
    <div className="ds-content">
      <div className="ds-page-header"><div><h1>HR Profiles</h1><p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>{profiles.length} staff</p></div></div>
      <div style={{ position:'relative', maxWidth:400, marginBottom:20 }}>
        <FormInput style={{ paddingLeft:34, width:'100%' }} placeholder="Search staff..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--color-text-tertiary)' }}/>
      </div>
      <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
          <table className="ds-table">
            <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Workspace</th><th>Contract</th><th>Start</th><th></th></tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id||p.user_email}>
                  <td>{p.full_name||p.user_email}</td>
                  <td>{p.role||'—'}</td>
                  <td>{p.department||'—'}</td>
                  <td>{p.primary_workspace ? getWorkspaceLabel(p.primary_workspace) : 'Auto'}</td>
                  <td>{p.contract_type||'—'}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{p.start_date||'—'}</td>
                  <td>{isManager && <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={()=>openEdit(p)}>Edit</Button>}</td>
                </tr>
              ))}
              {filtered.length===0 && <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--color-text-tertiary)' }}>No profiles found</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {modal && selected && (
        <Modal title={`Edit — ${selected.full_name||selected.user_email}`} onClose={close} width={600} footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>{saving?'Saving...':'Save'}</Button></>}>
          <div style={{ display:'flex', gap:8, marginBottom:16, borderBottom:'1px solid var(--color-border)' }}>
            {[['info','Info'],['hr','HR Details'],['bank','Bank Details']].map(([k,l]) => (
              <button key={k} onClick={()=>setTab(k)} style={{ padding:'8px 0', marginRight:16, background:'none', border:'none', borderBottom: tab===k ? '2px solid var(--color-text-primary)' : '2px solid transparent', color: tab===k ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontSize:14, cursor:'pointer' }}>{l}</button>
            ))}
          </div>
          {tab==='info' && <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16 }}>
            <FormField><FormLabel>Full Name</FormLabel><FormInput value={form.full_name} onChange={e=>sf('full_name',e.target.value)}/></FormField>
            <FormField><FormLabel>Role</FormLabel><FormInput value={form.role} onChange={e=>sf('role',e.target.value)}/></FormField>
            <FormField><FormLabel>Department</FormLabel><FormInput value={form.department} onChange={e=>sf('department',e.target.value)}/></FormField>
            <FormField>
              <FormLabel>Primary Workspace</FormLabel>
              <FormSelect value={form.primary_workspace || ''} onChange={e=>sf('primary_workspace', normalizeWorkspace(e.target.value))}>
                <option value="">Auto / infer from role</option>
                {WORKSPACE_OPTIONS.filter(([key]) => key !== 'self_service').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </FormSelect>
            </FormField>
            <FormField><FormLabel>Manager</FormLabel><FormInput value={form.manager_name} onChange={e=>sf('manager_name',e.target.value)}/></FormField>
            <FormField><FormLabel>Phone</FormLabel><FormInput value={form.phone} onChange={e=>sf('phone',e.target.value)}/></FormField>
            <FormField><FormLabel>Personal Email</FormLabel><FormInput value={form.personal_email} onChange={e=>sf('personal_email',e.target.value)}/></FormField>
            <FormField className="staff-onboarding-fc"><FormLabel>Address</FormLabel><textarea className="ds-form-input" rows={2} value={form.address} onChange={e=>sf('address',e.target.value)} style={{ resize:'vertical', padding:'8px 12px' }}/></FormField>
          </div>}
          {tab==='hr' && <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16 }}>
            <FormField>
              <FormLabel>Contract Type</FormLabel>
              <FormSelect value={form.contract_type} onChange={e=>sf('contract_type',e.target.value)}>
                {['','Full-time','Part-time','Contractor','Zero Hours','Apprentice'].map(t=><option key={t}>{t}</option>)}
              </FormSelect>
            </FormField>
            <FormField><FormLabel>Start Date</FormLabel><FormInput type="date" value={form.start_date} onChange={e=>sf('start_date',e.target.value)}/></FormField>
            <FormField className="staff-onboarding-fc"><FormLabel>HR Notes (admin only)</FormLabel><textarea className="ds-form-input" rows={3} value={form.hr_notes} onChange={e=>sf('hr_notes',e.target.value)} style={{ resize:'vertical', padding:'8px 12px' }}/></FormField>
          </div>}
          {tab==='bank' && <div>
            <div style={{ marginBottom:14 }}><Alert variant="warning">Bank details are sensitive — only admins can edit these.</Alert></div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16 }}>
              <FormField><FormLabel>Bank Name</FormLabel><FormInput value={form.bank_name} onChange={e=>sf('bank_name',e.target.value)}/></FormField>
              <FormField><FormLabel>Account Name</FormLabel><FormInput value={form.account_name} onChange={e=>sf('account_name',e.target.value)}/></FormField>
              <FormField><FormLabel>Sort Code</FormLabel><FormInput value={form.sort_code} onChange={e=>sf('sort_code',e.target.value)} placeholder="12-34-56"/></FormField>
              <FormField><FormLabel>Account Number</FormLabel><FormInput value={form.account_number} onChange={e=>sf('account_number',e.target.value)} placeholder="12345678"/></FormField>
            </div>
          </div>}
        </Modal>
      )}
    </div>
  )
}
