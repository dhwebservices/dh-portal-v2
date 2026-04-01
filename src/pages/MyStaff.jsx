import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useMsal } from '@azure/msal-react'
import { mergeHrProfileWithOnboarding } from '../utils/hrProfileSync'

const ALL_PAGES = [
  {key:'dashboard',label:'Dashboard'},{key:'outreach',label:'Clients Contacted'},
  {key:'clients',label:'Onboarded Clients'},{key:'clientmgmt',label:'Client Portal'},
  {key:'support',label:'Support'},{key:'competitor',label:'Competitor Lookup'},
  {key:'domains',label:'Domain Checker'},{key:'proposals',label:'Proposal Builder'},
  {key:'sendemail',label:'Send Email'},{key:'tasks',label:'Manage Tasks'},
  {key:'mytasks',label:'My Tasks'},{key:'schedule',label:'Schedule'},
  {key:'reports',label:'Reports'},{key:'staff',label:'My Staff'},
  {key:'banners',label:'Banners'},{key:'emailtemplates',label:'Email Templates'},
  {key:'audit',label:'Audit Log'},{key:'maintenance',label:'Maintenance'},
  {key:'admin',label:'Admin'},{key:'settings',label:'Settings'},
  {key:'hr_leave',label:'HR Leave'},{key:'hr_payslips',label:'HR Payslips'},
  {key:'hr_profiles',label:'HR Profiles'},{key:'hr_policies',label:'HR Policies'},
  {key:'hr_timesheet',label:'HR Timesheets'},{key:'hr_onboarding',label:'HR Onboarding'},
  {key:'website_editor',label:'Web Manager'},
]

const ROLE_DEFAULTS = {
  Admin:    Object.fromEntries(ALL_PAGES.map(p => [p.key, true])),
  Staff:    Object.fromEntries(ALL_PAGES.filter(p => !['admin','audit','reports','staff','banners','emailtemplates','website_editor'].includes(p.key)).map(p => [p.key, true])),
  ReadOnly: Object.fromEntries(ALL_PAGES.filter(p => ['dashboard','mytasks','schedule','hr_leave','hr_payslips','hr_policies'].includes(p.key)).map(p => [p.key, true])),
}

const EMPTY_PROFILE = { full_name:'', role:'', department:'', contract_type:'', start_date:'', phone:'', personal_email:'', address:'', manager_name:'', hr_notes:'', bank_name:'', account_name:'', sort_code:'', account_number:'' }

// ── Staff grid (list view) ─────────────────────────────────────────────
export default function MyStaff() {
  const navigate = useNavigate()
  const { instance, accounts } = useMsal()
  const [msUsers, setMsUsers]   = useState([])
  const [profiles, setProfiles] = useState({})
  const [permsMap, setPermsMap] = useState({})
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [search, setSearch]     = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const account = accounts[0]
      const token = await instance.acquireTokenSilent({ scopes:['https://graph.microsoft.com/User.Read.All'], account })
        .catch(() => instance.acquireTokenPopup({ scopes:['https://graph.microsoft.com/User.Read.All'], account }))
      const res = await fetch('https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,jobTitle&$top=50', { headers:{ Authorization:`Bearer ${token.accessToken}` }})
      const data = await res.json()
      const activeUsers = (data.value||[]).map(u => ({ id:u.id, name:u.displayName, email:u.userPrincipalName, jobTitle:u.jobTitle }))
      setMsUsers(activeUsers)

      // Sync: remove hr_profiles rows for users no longer in Microsoft AD
      const activeEmails = new Set(activeUsers.map(u => u.email.toLowerCase()))
      const { data: allProfiles } = await supabase.from('hr_profiles').select('id,user_email')
      const toDelete = (allProfiles||[]).filter(p => {
        const em = (p.user_email||'').toLowerCase()
        const isSystem = ['hr@','clients@','log@','legal@','noreply@','admin@','test@'].some(s => em.startsWith(s))
        return !isSystem && !activeEmails.has(em)
      })
      if (toDelete.length > 0) {
        await Promise.all(toDelete.map(p => supabase.from('hr_profiles').delete().eq('id', p.id)))
        await Promise.all(toDelete.map(p => supabase.from('user_permissions').delete().ilike('user_email', p.user_email)))
      }
    } catch(e) { setError('Could not load Azure users: ' + e.message) }

    const [{ data: pd }, { data: hrd }, { data: onboard }] = await Promise.all([
      supabase.from('user_permissions').select('*'),
      supabase.from('hr_profiles').select('*'),
      supabase.from('onboarding_submissions').select('*'),
    ])
    const pm = {}; (pd||[]).forEach(p => { pm[p.user_email?.toLowerCase()] = { perms: p.permissions, onboarding: p.onboarding } })
    setPermsMap(pm)
    const hm = {}; (hrd||[]).forEach(p => { hm[p.user_email?.toLowerCase()] = p })
    ;(onboard || []).forEach((submission) => {
      const key = submission.user_email?.toLowerCase()
      if (!key) return
      hm[key] = mergeHrProfileWithOnboarding(hm[key] || {}, submission)
    })
    setProfiles(hm)
    setLoading(false)
  }

  const filtered = msUsers.filter(u => {
    const q = search.toLowerCase()
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
  })

  const getInitials = (name) => (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  const COLOURS = ['#0071E3','#30A46C','#E54D2E','#8E4EC6','#C2500D','#0197C8','#D6409F']
  const colourFor = (email) => COLOURS[(email||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0) % COLOURS.length]

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">My Staff</h1><p className="page-sub">{msUsers.length} team members</p></div>
        <button className="btn btn-outline" onClick={load} disabled={loading} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <div style={{ padding:'10px 14px', background:'var(--amber-bg)', border:'1px solid var(--amber)', borderRadius:8, fontSize:13, color:'var(--amber)', marginBottom:16 }}>{error}</div>}

      <div style={{ position:'relative', maxWidth:400, marginBottom:24 }}>
        <svg style={{ position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--faint)',pointerEvents:'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input className="inp" style={{ paddingLeft:34, borderRadius:100 }} placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)}/>
      </div>

      {loading ? (
        <div className="compact-card-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:16 }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="card" style={{ padding:24 }}>
              <div className="skel" style={{ width:56, height:56, borderRadius:'50%', marginBottom:12 }}/>
              <div className="skel" style={{ width:'70%', height:14, marginBottom:8 }}/>
              <div className="skel" style={{ width:'50%', height:12 }}/>
            </div>
          ))}
        </div>
      ) : (
        <div className="compact-card-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:16 }}>
          {filtered.map(u => {
            const userEmail = u.email?.toLowerCase()
            const profile = profiles[userEmail] || {}
            const userPm = permsMap[userEmail]
            const isOnboarding = userPm?.onboarding || false
            const colour = colourFor(userEmail)
            return (
              <button
                key={u.id}
                onClick={() => navigate(`/my-staff/${encodeURIComponent(u.email.toLowerCase())}`)}
                style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:'24px 20px', textAlign:'center', cursor:'pointer', transition:'all 0.2s cubic-bezier(0.16,1,0.3,1)', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}
                onMouseOver={e => { e.currentTarget.style.borderColor=colour; e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow=`0 8px 24px ${colour}22` }}
                onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}
              >
                {/* Avatar */}
                <div style={{ width:56, height:56, borderRadius:'50%', background:colour+'18', border:`2px solid ${colour}33`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:600, color:colour, fontFamily:'var(--font-display)', flexShrink:0 }}>
                  {getInitials(u.name)}
                </div>

                {/* Name */}
                <div style={{ width:'100%' }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:3, lineHeight:1.3 }}>{profile.full_name || u.name}</div>
                  <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160 }}>{profile.role || u.jobTitle || '—'}</div>
                  {profile.department && <div style={{ fontSize:11, color:'var(--sub)', marginTop:2 }}>{profile.department}</div>}
                  {profile.contract_type && <div style={{ fontSize:10, color:'var(--faint)', marginTop:2, fontFamily:'var(--font-mono)', letterSpacing:'0.04em' }}>{profile.contract_type}</div>}
                </div>

                {/* Status */}
                <span className={`badge badge-${isOnboarding?'amber':'green'}`}>
                  {isOnboarding ? 'Onboarding' : 'Active'}
                </span>
              </button>
            )
          })}
          {filtered.length === 0 && !loading && (
            <div style={{ gridColumn:'1/-1' }}>
              <div className="empty"><p>No staff found</p></div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
