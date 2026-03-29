import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, UserPlus, Shield, Clock } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useMsal } from '@azure/msal-react'

export default function StaffAccounts() {
  const { accounts, instance } = useMsal()
  const me = accounts[0]
  const navigate = useNavigate()
  const [msUsers, setMsUsers] = useState([])
  const [profiles, setProfiles] = useState([])
  const [perms, setPerms] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: profs }, { data: permData }] = await Promise.all([
      supabase.from('hr_profiles').select('*'),
      supabase.from('user_permissions').select('user_email,permissions,onboarding'),
    ])
    setProfiles(profs||[])
    setPerms(permData||[])
    try {
      const token = (await instance.acquireTokenSilent({ scopes:['https://graph.microsoft.com/User.Read.All'], account:me })).accessToken
      const r = await fetch('https://graph.microsoft.com/v1.0/users?$select=displayName,userPrincipalName,jobTitle,department&$top=50',{headers:{Authorization:`Bearer ${token}`}})
      const d = await r.json()
      setMsUsers((d.value||[]).filter(u=>!u.userPrincipalName?.includes('#EXT#')))
    } catch { setMsUsers([]) }
    setLoading(false)
  }

  const merged = msUsers.map(u => {
    const email = u.userPrincipalName?.toLowerCase()
    const profile = (profiles||[]).find(p=>p.user_email?.toLowerCase()===email)||{}
    const perm = (perms||[]).find(p=>p.user_email?.toLowerCase()===email)||{}
    return { ...u, email, profile, onboarding: perm.onboarding||false, hasPerms: !!(perm.permissions && Object.keys(perm.permissions||{}).length) }
  }).filter(u => {
    const q = search.toLowerCase()
    return !q || u.displayName?.toLowerCase().includes(q) || u.email?.includes(q) || u.jobTitle?.toLowerCase().includes(q)
  })

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff Accounts</h1>
          <p className="page-sub">{msUsers.length} staff members</p>
        </div>
      </div>

      <div className="search-wrap" style={{maxWidth:400,marginBottom:20}}>
        <Search size={13} className="search-icon" />
        <input className="inp" style={{paddingLeft:36}} placeholder="Search by name, email or role..." value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="spin-center"><div className="spin"/></div>
      ) : (
        <div className="card" style={{overflow:'hidden'}}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {merged.map(u => (
                <tr key={u.email} style={{cursor:'pointer'}} onClick={()=>navigate(`/staff-accounts/${encodeURIComponent(u.email)}`)}>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:30,height:30,borderRadius:'50%',background:'var(--gold-bg)',border:'1px solid var(--gold-border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600,color:'var(--gold)',flexShrink:0}}>
                        {u.displayName?.[0]?.toUpperCase()||'?'}
                      </div>
                      <span style={{fontWeight:500,color:'var(--text)'}}>{u.displayName}</span>
                    </div>
                  </td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{u.email}</span></td>
                  <td>{u.profile?.role || u.jobTitle || '—'}</td>
                  <td>{u.profile?.department || u.department || '—'}</td>
                  <td>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {u.onboarding && <span className="badge badge-amber"><Clock size={9}/>Onboarding</span>}
                      {!u.onboarding && !u.hasPerms && <span className="badge badge-green"><Shield size={9}/>Full Access</span>}
                      {!u.onboarding && u.hasPerms && <span className="badge badge-blue">Custom</span>}
                    </div>
                  </td>
                  <td><span style={{fontSize:12,color:'var(--faint)'}}>→</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
