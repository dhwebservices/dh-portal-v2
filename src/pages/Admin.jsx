import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { useMsal } from '@azure/msal-react'

const ALL_PAGES = [
  {key:'dashboard',label:'Dashboard'},{key:'outreach',label:'Clients Contacted'},
  {key:'clients',label:'Onboarded Clients'},{key:'clientmgmt',label:'Client Portal'},
  {key:'support',label:'Support'},{key:'competitor',label:'Competitor Lookup'},
  {key:'domains',label:'Domain Checker'},{key:'proposals',label:'Proposal Builder'},
  {key:'sendemail',label:'Send Email'},{key:'tasks',label:'Manage Tasks'},
  {key:'mytasks',label:'My Tasks'},{key:'schedule',label:'Schedule'},
  {key:'reports',label:'Reports'},{key:'staff',label:'Staff & Commissions'},
  {key:'banners',label:'Banners'},{key:'emailtemplates',label:'Email Templates'},
  {key:'audit',label:'Audit Log'},{key:'maintenance',label:'Maintenance'},
  {key:'admin',label:'User Accounts'},{key:'settings',label:'Settings'},
  {key:'hr_leave',label:'HR Leave'},{key:'hr_payslips',label:'HR Payslips'},
  {key:'hr_profiles',label:'HR Profiles'},{key:'hr_policies',label:'HR Policies'},
  {key:'hr_timesheet',label:'HR Timesheets'},{key:'hr_onboarding',label:'HR Onboarding'},
  {key:'website_editor',label:'Website Editor (Web Mgr)'},
]
const ROLE_DEFAULTS = {
  Admin: Object.fromEntries(ALL_PAGES.map(p=>[p.key,true])),
  Staff: Object.fromEntries(ALL_PAGES.filter(p=>!['admin','audit','reports','staff','banners','emailtemplates','website_editor'].includes(p.key)).map(p=>[p.key,true])),
  ReadOnly: Object.fromEntries(ALL_PAGES.filter(p=>['dashboard','mytasks','schedule','hr_leave','hr_payslips','hr_policies'].includes(p.key)).map(p=>[p.key,true])),
}

export default function Admin() {
  const { user } = useAuth()
  const { instance, accounts } = useMsal()
  const [users, setUsers]       = useState([])
  const [permsMap, setPermsMap] = useState({})
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [selected, setSelected] = useState(null)
  const [editPerms, setEditPerms] = useState({})
  const [tab, setTab]           = useState('permissions')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const account = accounts[0]
      const token = await instance.acquireTokenSilent({ scopes:['https://graph.microsoft.com/User.Read.All'], account }).catch(async () => instance.acquireTokenPopup({ scopes:['https://graph.microsoft.com/User.Read.All'], account }))
      const res = await fetch('https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,jobTitle&$top=50', { headers:{ Authorization:`Bearer ${token.accessToken}` } })
      const data = await res.json()
      setUsers((data.value||[]).map(u=>({ id:u.id, name:u.displayName, email:u.userPrincipalName, role:u.jobTitle })))
    } catch(e) { setError('Could not load Azure users: '+e.message) }
    const { data: pd } = await supabase
      .from('user_permissions')
      .select('id,user_email,permissions,onboarding,bookable_staff,updated_at')
    const map = {}; (pd||[]).forEach(p=>{ map[p.user_email?.toLowerCase()] = p.permissions }); setPermsMap(map)
    setLoading(false)
  }

  const openUser = (u) => {
    setSelected(u)
    setEditPerms(permsMap[u.email?.toLowerCase()] || { ...ROLE_DEFAULTS.Staff })
    setTab('permissions')
    setModal(true)
  }

  const save = async () => {
    setSaving(true)
    const email = selected.email?.toLowerCase()
    const { data: existing } = await supabase.from('user_permissions').select('id').ilike('user_email', email).maybeSingle()
    if (existing?.id) await supabase.from('user_permissions').update({ permissions: editPerms, updated_at: new Date().toISOString() }).eq('id', existing.id)
    else await supabase.from('user_permissions').insert([{ user_email: email, permissions: editPerms }])
    setPermsMap(p => ({ ...p, [email]: editPerms }))
    setSaving(false); setModal(false)
  }

  const togglePerm = k => setEditPerms(p => ({ ...p, [k]: !p[k] }))
  const accessCount = (email) => { const p = permsMap[email?.toLowerCase()]; return p ? Object.values(p).filter(Boolean).length : 0 }

  return (
    <div className="fade-in">
      <div className="page-hd"><div><h1 className="page-title">User Accounts</h1><p className="page-sub">{users.length} users</p></div></div>
      {error && <div style={{ padding:'12px 16px', background:'var(--amber-bg)', border:'1px solid var(--amber)', borderRadius:8, fontSize:13, color:'var(--amber)', marginBottom:16 }}>{error}</div>}
      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
          <table className="tbl">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Page Access</th><th></th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td className="t-main">{u.name}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{u.email}</td>
                  <td>{u.role || '—'}</td>
                  <td><span className="badge badge-blue">{accessCount(u.email)} pages</span></td>
                  <td><button className="btn btn-outline btn-sm" onClick={()=>openUser(u)}>Edit Access</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && selected && (
        <Modal title={selected.name} onClose={() => setModal(false)} width={680} footer={<><button className="btn btn-outline" onClick={()=>setModal(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving...':'Save'}</button></>}>
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
            {Object.keys(ROLE_DEFAULTS).map(role => (
              <button key={role} onClick={() => setEditPerms({...ROLE_DEFAULTS[role]})} className="btn btn-outline btn-sm">Reset to {role}</button>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {ALL_PAGES.map(({ key, label }) => (
              <button key={key} onClick={() => togglePerm(key)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:8, border:'1px solid', borderColor: editPerms[key] ? 'var(--green)' : 'var(--border)', background: editPerms[key] ? 'var(--green-bg)' : 'transparent', cursor:'pointer', transition:'all 0.15s' }}>
                <span style={{ fontSize:13, color:'var(--text)' }}>{label}</span>
                <div style={{ width:32, height:18, borderRadius:9, background: editPerms[key] ? 'var(--green)' : 'var(--border)', position:'relative', flexShrink:0 }}>
                  <div style={{ position:'absolute', top:2, left: editPerms[key] ? 16 : 2, width:14, height:14, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
