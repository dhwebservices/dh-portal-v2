import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Modal } from '../../components/Modal'
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
    <div className="fade-in">
      <div className="page-hd"><div><h1 className="page-title">HR Profiles</h1><p className="page-sub">{profiles.length} staff</p></div></div>
      <div style={{ position:'relative', maxWidth:400, marginBottom:20 }}>
        <input className="inp" style={{ paddingLeft:34 }} placeholder="Search staff..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <svg style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--faint)',pointerEvents:'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>
      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
          <table className="tbl">
            <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Workspace</th><th>Contract</th><th>Start</th><th></th></tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id||p.user_email}>
                  <td className="t-main">{p.full_name||p.user_email}</td>
                  <td>{p.role||'—'}</td>
                  <td>{p.department||'—'}</td>
                  <td>{p.primary_workspace ? getWorkspaceLabel(p.primary_workspace) : 'Auto'}</td>
                  <td>{p.contract_type||'—'}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{p.start_date||'—'}</td>
                  <td>{isManager && <button className="btn btn-outline btn-sm" onClick={()=>openEdit(p)}>Edit</button>}</td>
                </tr>
              ))}
              {filtered.length===0 && <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>No profiles found</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {modal && selected && (
        <Modal title={`Edit — ${selected.full_name||selected.user_email}`} onClose={close} width={600} footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving...':'Save'}</button></>}>
          <div className="tabs" style={{ marginBottom:16 }}>
            {[['info','Info'],['hr','HR Details'],['bank','Bank Details']].map(([k,l]) => (
              <button key={k} onClick={()=>setTab(k)} className={'tab'+(tab===k?' on':'')}>{l}</button>
            ))}
          </div>
          {tab==='info' && <div className="fg">
            <div><label className="lbl">Full Name</label><input className="inp" value={form.full_name} onChange={e=>sf('full_name',e.target.value)}/></div>
            <div><label className="lbl">Role</label><input className="inp" value={form.role} onChange={e=>sf('role',e.target.value)}/></div>
            <div><label className="lbl">Department</label><input className="inp" value={form.department} onChange={e=>sf('department',e.target.value)}/></div>
            <div><label className="lbl">Primary Workspace</label>
              <select className="inp" value={form.primary_workspace || ''} onChange={e=>sf('primary_workspace', normalizeWorkspace(e.target.value))}>
                <option value="">Auto / infer from role</option>
                {WORKSPACE_OPTIONS.filter(([key]) => key !== 'self_service').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div><label className="lbl">Manager</label><input className="inp" value={form.manager_name} onChange={e=>sf('manager_name',e.target.value)}/></div>
            <div><label className="lbl">Phone</label><input className="inp" value={form.phone} onChange={e=>sf('phone',e.target.value)}/></div>
            <div><label className="lbl">Personal Email</label><input className="inp" value={form.personal_email} onChange={e=>sf('personal_email',e.target.value)}/></div>
            <div className="fc"><label className="lbl">Address</label><textarea className="inp" rows={2} value={form.address} onChange={e=>sf('address',e.target.value)} style={{ resize:'vertical' }}/></div>
          </div>}
          {tab==='hr' && <div className="fg">
            <div><label className="lbl">Contract Type</label>
              <select className="inp" value={form.contract_type} onChange={e=>sf('contract_type',e.target.value)}>
                {['','Full-time','Part-time','Contractor','Zero Hours','Apprentice'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="lbl">Start Date</label><input className="inp" type="date" value={form.start_date} onChange={e=>sf('start_date',e.target.value)}/></div>
            <div className="fc"><label className="lbl">HR Notes (admin only)</label><textarea className="inp" rows={3} value={form.hr_notes} onChange={e=>sf('hr_notes',e.target.value)} style={{ resize:'vertical' }}/></div>
          </div>}
          {tab==='bank' && <div>
            <div style={{ padding:'10px 14px', background:'var(--amber-bg)', border:'1px solid var(--amber)', borderRadius:7, fontSize:13, color:'var(--amber)', marginBottom:14 }}>Bank details are sensitive — only admins can edit these.</div>
            <div className="fg">
              <div><label className="lbl">Bank Name</label><input className="inp" value={form.bank_name} onChange={e=>sf('bank_name',e.target.value)}/></div>
              <div><label className="lbl">Account Name</label><input className="inp" value={form.account_name} onChange={e=>sf('account_name',e.target.value)}/></div>
              <div><label className="lbl">Sort Code</label><input className="inp" value={form.sort_code} onChange={e=>sf('sort_code',e.target.value)} placeholder="12-34-56"/></div>
              <div><label className="lbl">Account Number</label><input className="inp" value={form.account_number} onChange={e=>sf('account_number',e.target.value)} placeholder="12345678"/></div>
            </div>
          </div>}
        </Modal>
      )}
    </div>
  )
}
