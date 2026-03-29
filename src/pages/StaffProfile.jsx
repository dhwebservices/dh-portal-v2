import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Upload, UserCheck, UserX, Eye, EyeOff, FileText, ExternalLink } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useMsal } from '@azure/msal-react'

const WORKER_URL = 'https://dh-email-worker.aged-silence-66a7.workers.dev'

const ALL_PERMS = [
  { key:'dashboard',     label:'Dashboard',          group:'Business' },
  { key:'outreach',      label:'Clients Contacted',  group:'Business' },
  { key:'clients',       label:'Onboarded Clients',  group:'Business' },
  { key:'clientmgmt',    label:'Client Portal Mgmt', group:'Business' },
  { key:'support',       label:'Support Tickets',    group:'Business' },
  { key:'competitor',    label:'Competitor Lookup',  group:'Business' },
  { key:'domains',       label:'Domain Checker',     group:'Business' },
  { key:'proposals',     label:'Proposal Builder',   group:'Business' },
  { key:'social',        label:'Social Media',       group:'Business' },
  { key:'sendemail',     label:'Send Email',         group:'Business' },
  { key:'tasks',         label:'Manage Tasks',       group:'Tasks' },
  { key:'mytasks',       label:'My Tasks',           group:'Tasks' },
  { key:'schedule',      label:'Schedule',           group:'Tasks' },
  { key:'hr_onboarding', label:'Onboarding',         group:'HR' },
  { key:'hr_leave',      label:'Leave',              group:'HR' },
  { key:'hr_payslips',   label:'Payslips',           group:'HR' },
  { key:'hr_policies',   label:'Policies',           group:'HR' },
  { key:'hr_timesheet',  label:'Timesheet',          group:'HR' },
  { key:'reports',       label:'Reports',            group:'Admin' },
  { key:'banners',       label:'Banners',            group:'Admin' },
  { key:'emailtemplates',label:'Email Templates',    group:'Admin' },
  { key:'audit',         label:'Audit Log',          group:'Admin' },
  { key:'admin',         label:'Staff Accounts',     group:'Admin' },
  { key:'maintenance',   label:'Maintenance',        group:'Admin' },
  { key:'settings',      label:'Settings',           group:'Admin' },
]

const PRESETS = {
  'Full Access': null,
  'Staff': { dashboard:true,outreach:true,clients:true,clientmgmt:true,support:true,competitor:true,domains:true,proposals:true,social:true,sendemail:true,mytasks:true,schedule:true,hr_leave:true,hr_payslips:true,hr_policies:true,hr_timesheet:true },
  'Read Only': { dashboard:true,outreach:true,clients:true,support:true,mytasks:true,schedule:true },
}

export default function StaffProfile() {
  const { email } = useParams()
  const navigate = useNavigate()
  const { accounts, instance } = useMsal()
  const me = accounts[0]
  const decodedEmail = decodeURIComponent(email)
  const contractRef = useRef()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [msUser, setMsUser] = useState(null)
  const [profile, setProfile] = useState({})
  const [permRow, setPermRow] = useState(null)
  const [permissions, setPermissions] = useState({})
  const [onboarding, setOnboarding] = useState(false)
  const [preset, setPreset] = useState('Full Access')
  const [showBank, setShowBank] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [uploadingContract, setUploadingContract] = useState(false)
  const [staffList, setStaffList] = useState([])
  const [commissions, setCommissions] = useState([])
  const [commRate, setCommRate] = useState(15)
  const [savingComm, setSavingComm] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')

  useEffect(() => { loadAll() }, [decodedEmail])

  const loadAll = async () => {
    setLoading(true)
    try {
      const token = (await instance.acquireTokenSilent({scopes:['https://graph.microsoft.com/User.Read.All'],account:me})).accessToken
      const r = await fetch(`https://graph.microsoft.com/v1.0/users?$filter=userPrincipalName eq '${decodedEmail}'&$select=displayName,userPrincipalName,jobTitle,department`,{headers:{Authorization:`Bearer ${token}`}})
      const d = await r.json()
      setMsUser(d.value?.[0]||null)
    } catch { setMsUser(null) }

    const { data: allProfiles } = await supabase.from('hr_profiles').select('*')
    const p = (allProfiles||[]).find(r=>r.user_email?.toLowerCase()===decodedEmail.toLowerCase())
    setProfile(p||{})

    const { data: allPerms } = await supabase.from('user_permissions').select('*')
    const perm = (allPerms||[]).find(r=>r.user_email?.toLowerCase()===decodedEmail.toLowerCase())
    setPermRow(perm||null)
    setOnboarding(perm?.onboarding||false)
    const perms = perm?.permissions||null
    if (!perms || Object.keys(perms).length===0) {
      setPreset('Full Access'); setPermissions({})
    } else {
      const match = Object.entries(PRESETS).find(([name,pp])=> {
        if (!pp) return false
        const a = Object.keys(pp).sort().join(',')
        const b = Object.keys(perms).filter(k=>perms[k]===true).sort().join(',')
        return a===b
      })
      setPreset(match?.[0]||'Custom'); setPermissions(perms)
    }

    const { data: allComms } = await supabase.from('commissions').select('*').order('created_at',{ascending:false})
    const { data: allStaff } = await supabase.from('staff').select('*')
    const stRec = (allStaff||[]).find(s=>s.email?.toLowerCase()===decodedEmail.toLowerCase()||s.name?.toLowerCase()===(p?.full_name||'').toLowerCase())
    if (stRec?.commission_rate) setCommRate(stRec.commission_rate)
    setCommissions((allComms||[]).filter(c=>c.staff_name?.toLowerCase()===(stRec?.name||p?.full_name||'').toLowerCase()||c.staff_email?.toLowerCase()===decodedEmail.toLowerCase()))
    const { data: staffData } = await supabase.from('hr_profiles').select('user_email,full_name').order('full_name')
    setStaffList(staffData||[])
    setLoading(false)
  }

  const u = (k,v) => setProfile(p=>({...p,[k]:v}))

  const saveProfile = async () => {
    setSaving(p=>({...p,profile:true}))
    const payload = { user_email:decodedEmail,full_name:profile.full_name||'',role:profile.role||'',department:profile.department||'',contract_type:profile.contract_type||'',start_date:profile.start_date||null,phone:profile.phone||'',personal_email:profile.personal_email||'',address:profile.address||'',manager_email:profile.manager_email||'',manager_name:profile.manager_name||'',hr_notes:profile.hr_notes||'',updated_at:new Date().toISOString() }
    if (profile.id) await supabase.from('hr_profiles').update(payload).eq('id',profile.id)
    else { const { data } = await supabase.from('hr_profiles').insert([{...payload,created_at:new Date().toISOString()}]).select().single(); setProfile(data) }
    setSaving(p=>({...p,profile:false}))
  }

  const saveBankDetails = async () => {
    setSaving(p=>({...p,bank:true}))
    await supabase.from('hr_profiles').update({ bank_name:profile.bank_name||'',account_name:profile.account_name||'',sort_code:profile.sort_code||'',account_number:profile.account_number||'',updated_at:new Date().toISOString() }).eq('id',profile.id)
    setSaving(p=>({...p,bank:false}))
  }

  const savePermissions = async () => {
    setSaving(p=>({...p,perms:true}))
    const finalPerms = preset==='Full Access' ? {} : (preset==='Custom' ? permissions : (PRESETS[preset]||{}))
    const emailL = decodedEmail.toLowerCase()
    const { data: allP } = await supabase.from('user_permissions').select('id,user_email')
    const found = (allP||[]).find(r=>r.user_email?.toLowerCase()===emailL)
    if (found?.id) {
      await supabase.from('user_permissions').update({permissions:finalPerms,updated_at:new Date().toISOString()}).eq('id',found.id)
    } else {
      const { error } = await supabase.from('user_permissions').insert([{user_email:emailL,permissions:finalPerms,onboarding:false,updated_at:new Date().toISOString()}])
      if (error?.code==='23505') await supabase.from('user_permissions').update({permissions:finalPerms,updated_at:new Date().toISOString()}).ilike('user_email',emailL)
    }
    setSaving(p=>({...p,perms:false}))
  }

  const toggleOnboarding = async enable => {
    setToggling(true)
    const emailL = decodedEmail.toLowerCase()
    const { data: allP } = await supabase.from('user_permissions').select('id,user_email')
    const found = (allP||[]).find(r=>r.user_email?.toLowerCase()===emailL)
    if (found?.id) await supabase.from('user_permissions').update({onboarding:enable,updated_at:new Date().toISOString()}).eq('id',found.id)
    else await supabase.from('user_permissions').insert([{user_email:emailL,onboarding:enable,permissions:{},updated_at:new Date().toISOString()}])
    if (enable) {
      const { data: allSubs } = await supabase.from('onboarding_submissions').select('id,user_email')
      const existing = (allSubs||[]).find(s=>s.user_email?.toLowerCase()===emailL)
      if (!existing) await supabase.from('onboarding_submissions').insert([{user_email:emailL,user_name:profile.full_name||decodedEmail,status:'in_progress',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}])
      try { await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'custom_email',data:{to:[decodedEmail],from:'DH Website Services <noreply@dhwebsiteservices.co.uk>',subject:'Welcome — Please Complete Your Onboarding',html:`<div style="font-family:Arial,sans-serif;padding:24px"><h2>Welcome to DH Website Services!</h2><p>Hi ${profile.full_name||'there'}, please log in at staff.dhwebsiteservices.co.uk to complete your onboarding.</p></div>`}})}) } catch(e) {}
    }
    setOnboarding(enable); setToggling(false)
  }

  const uploadContract = async file => {
    setUploadingContract(true)
    const path = `contracts/${decodedEmail.toLowerCase()}/${Date.now()}-${file.name}`
    await supabase.storage.from('hr-documents').upload(path,file)
    const { data } = supabase.storage.from('hr-documents').getPublicUrl(path)
    await supabase.from('hr_profiles').update({contract_url:data.publicUrl,contract_path:path,updated_at:new Date().toISOString()}).eq('id',profile.id)
    setProfile(p=>({...p,contract_url:data.publicUrl})); setUploadingContract(false)
  }

  const markPaid = async id => { await supabase.from('commissions').update({status:'paid'}).eq('id',id); setCommissions(p=>p.map(c=>c.id===id?{...c,status:'paid'}:c)) }
  const saveCommRate = async () => { setSavingComm(true); const { data: allSt } = await supabase.from('staff').select('id,email,name'); const st=(allSt||[]).find(s=>s.email?.toLowerCase()===decodedEmail.toLowerCase()||s.name?.toLowerCase()===profile.full_name?.toLowerCase()); if(st?.id) await supabase.from('staff').update({commission_rate:commRate}).eq('id',st.id); setSavingComm(false) }

  if (loading) return <div className="spin-center"><div className="spin"/></div>

  const displayName = profile.full_name||msUser?.displayName||decodedEmail
  const groups = [...new Set(ALL_PERMS.map(p=>p.group))]

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24,flexWrap:'wrap'}}>
        <button onClick={()=>navigate('/staff-accounts')} className="btn btn-outline btn-sm btn-icon"><ArrowLeft size={14}/></button>
        <div style={{width:44,height:44,borderRadius:'50%',background:'var(--gold-bg)',border:'1px solid var(--gold-border)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-display)',fontSize:18,fontWeight:600,color:'var(--gold)',flexShrink:0}}>
          {displayName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
        </div>
        <div>
          <h1 style={{fontFamily:'var(--font-display)',fontSize:22,fontWeight:600,letterSpacing:'-0.01em',lineHeight:1}}>{displayName}</h1>
          <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--faint)',letterSpacing:'0.06em',marginTop:4}}>{decodedEmail}</div>
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          {onboarding && <span className="badge badge-amber">Onboarding Mode</span>}
          <button onClick={()=>toggleOnboarding(!onboarding)} disabled={toggling} className={`btn btn-sm ${onboarding?'btn-danger':'btn-outline'}`}>
            {onboarding ? <><UserX size={12}/>Remove Onboarding</> : <><UserCheck size={12}/>Set Onboarding</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[['profile','Profile'],['bank','Bank Details'],['permissions','Permissions'],['commissions','Commissions']].map(([k,l])=>(
          <button key={k} onClick={()=>setActiveTab(k)} className={`tab${activeTab===k?' active':''}`}>{l}</button>
        ))}
      </div>

      {/* Profile tab */}
      {activeTab==='profile' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
          <div>
            <div className="card card-pad" style={{marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:600,marginBottom:16,paddingBottom:12,borderBottom:'1px solid var(--border)'}}>Personal & Employment</div>
              <div className="form-grid" style={{marginBottom:12}}>
                <div><label className="inp-label">Full Name</label><input className="inp" value={profile.full_name||''} onChange={e=>u('full_name',e.target.value)} /></div>
                <div><label className="inp-label">Job Title</label><input className="inp" value={profile.role||''} onChange={e=>u('role',e.target.value)} /></div>
                <div><label className="inp-label">Department</label><input className="inp" value={profile.department||''} onChange={e=>u('department',e.target.value)} /></div>
                <div><label className="inp-label">Contract Type</label>
                  <select className="inp" value={profile.contract_type||''} onChange={e=>u('contract_type',e.target.value)}>
                    <option value="">Select...</option>
                    {['Full-time','Part-time','Contractor','Zero Hours','Apprentice'].map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div><label className="inp-label">Start Date</label><input className="inp" type="date" value={profile.start_date||''} onChange={e=>u('start_date',e.target.value)} /></div>
                <div><label className="inp-label">Phone</label><input className="inp" value={profile.phone||''} onChange={e=>u('phone',e.target.value)} /></div>
                <div><label className="inp-label">Personal Email</label><input className="inp" value={profile.personal_email||''} onChange={e=>u('personal_email',e.target.value)} /></div>
                <div><label className="inp-label">Manager</label>
                  <select className="inp" value={profile.manager_email||''} onChange={e=>{const s=staffList.find(x=>x.user_email===e.target.value);u('manager_email',e.target.value);u('manager_name',s?.full_name||e.target.value)}}>
                    <option value="">None</option>
                    {staffList.filter(s=>s.user_email!==decodedEmail).map(s=><option key={s.user_email} value={s.user_email}>{s.full_name||s.user_email}</option>)}
                  </select>
                </div>
                <div className="form-col"><label className="inp-label">Address</label><textarea className="inp" rows={2} value={profile.address||''} onChange={e=>u('address',e.target.value)} style={{resize:'vertical'}} /></div>
                <div className="form-col"><label className="inp-label">HR Notes (admin only)</label><textarea className="inp" rows={3} value={profile.hr_notes||''} onChange={e=>u('hr_notes',e.target.value)} style={{resize:'vertical'}} placeholder="Private notes..." /></div>
              </div>
              <div style={{display:'flex',justifyContent:'flex-end'}}>
                <button onClick={saveProfile} disabled={saving.profile} className="btn btn-primary"><Save size={13}/>{saving.profile?'Saving...':'Save Profile'}</button>
              </div>
            </div>
          </div>
          <div>
            {/* Contract */}
            <div className="card card-pad">
              <div style={{fontSize:14,fontWeight:600,marginBottom:16,paddingBottom:12,borderBottom:'1px solid var(--border)'}}>Contract</div>
              {profile.contract_url ? (
                <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',background:'var(--bg2)',borderRadius:8,marginBottom:12}}>
                  <FileText size={14} color="var(--gold)" />
                  <span style={{flex:1,fontSize:13.5,fontWeight:500}}>Contract uploaded</span>
                  <a href={profile.contract_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm"><ExternalLink size={11}/>View</a>
                </div>
              ) : (
                <div style={{padding:'10px 14px',background:'var(--amber-bg)',borderRadius:8,marginBottom:12,fontSize:13,color:'var(--amber)'}}>No contract uploaded yet</div>
              )}
              <div onClick={()=>contractRef.current?.click()} style={{padding:24,border:'2px dashed var(--border)',borderRadius:8,textAlign:'center',cursor:'pointer',transition:'border-color 0.15s'}}
                onMouseOver={e=>e.currentTarget.style.borderColor='var(--gold)'}
                onMouseOut={e=>e.currentTarget.style.borderColor='var(--border)'}
              >
                <Upload size={18} style={{margin:'0 auto 8px',display:'block',opacity:0.3}}/>
                <div style={{fontSize:13,color:'var(--faint)'}}>{uploadingContract?'Uploading...':'Click to upload PDF'}</div>
              </div>
              <input ref={contractRef} type="file" accept=".pdf" style={{display:'none'}} onChange={e=>{if(e.target.files[0])uploadContract(e.target.files[0])}} />
            </div>
          </div>
        </div>
      )}

      {/* Bank tab */}
      {activeTab==='bank' && (
        <div className="card card-pad" style={{maxWidth:560}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,paddingBottom:12,borderBottom:'1px solid var(--border)'}}>
            <div style={{fontSize:14,fontWeight:600}}>Bank Details</div>
            <button onClick={()=>setShowBank(b=>!b)} className="btn btn-ghost btn-sm">
              {showBank ? <><EyeOff size={12}/>Hide</> : <><Eye size={12}/>Reveal</>}
            </button>
          </div>
          <div style={{padding:'10px 14px',background:'var(--gold-bg)',border:'1px solid var(--gold-border)',borderRadius:8,fontSize:13,color:'var(--sub)',marginBottom:16}}>
            Sensitive data — access is logged in the audit trail
          </div>
          {showBank ? (
            <>
              <div className="form-grid" style={{marginBottom:16}}>
                <div><label className="inp-label">Bank Name</label><input className="inp" value={profile.bank_name||''} onChange={e=>u('bank_name',e.target.value)} /></div>
                <div><label className="inp-label">Account Name</label><input className="inp" value={profile.account_name||''} onChange={e=>u('account_name',e.target.value)} /></div>
                <div><label className="inp-label">Sort Code</label><input className="inp" value={profile.sort_code||''} onChange={e=>u('sort_code',e.target.value)} placeholder="00-00-00" /></div>
                <div><label className="inp-label">Account Number</label><input className="inp" value={profile.account_number||''} onChange={e=>u('account_number',e.target.value)} placeholder="8 digits" /></div>
              </div>
              <div style={{display:'flex',justifyContent:'flex-end'}}>
                <button onClick={saveBankDetails} disabled={saving.bank} className="btn btn-primary"><Save size={13}/>{saving.bank?'Saving...':'Save Bank Details'}</button>
              </div>
            </>
          ) : (
            <div style={{textAlign:'center',padding:'32px',color:'var(--faint)',fontSize:13,fontStyle:'italic',fontFamily:'var(--font-display)'}}>Click reveal to view bank details</div>
          )}
        </div>
      )}

      {/* Permissions tab */}
      {activeTab==='permissions' && (
        <div className="card card-pad">
          <div style={{fontSize:14,fontWeight:600,marginBottom:16,paddingBottom:12,borderBottom:'1px solid var(--border)'}}>Access & Permissions</div>
          {/* Preset buttons */}
          <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>
            <span style={{fontFamily:'var(--font-mono)',fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--faint)',alignSelf:'center',marginRight:4}}>Preset:</span>
            {[...Object.keys(PRESETS),'Custom'].map(p=>(
              <button key={p} onClick={()=>setPreset(p)} className={`filter-pill${preset===p?' active':''}`}>{p}</button>
            ))}
          </div>

          {(preset==='Custom'||(!Object.keys(PRESETS).includes(preset)&&preset!=='Custom')) && (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:20,marginBottom:20}}>
              {groups.map(group => (
                <div key={group}>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--faint)',marginBottom:10}}>{group}</div>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {ALL_PERMS.filter(p=>p.group===group).map(p=>(
                      <label key={p.key} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',padding:'7px 10px',borderRadius:6,background:permissions[p.key]?'var(--gold-bg)':'transparent',transition:'background 0.15s'}}>
                        <input type="checkbox" checked={!!permissions[p.key]} onChange={e=>setPermissions(prev=>({...prev,[p.key]:e.target.checked}))} style={{accentColor:'var(--gold)',width:14,height:14}} />
                        <span style={{fontSize:13,color:permissions[p.key]?'var(--text)':'var(--sub)'}}>{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {preset!=='Custom' && (
            <div style={{padding:'14px 16px',background:'var(--bg2)',borderRadius:8,marginBottom:20,fontSize:13,color:'var(--sub)'}}>
              {preset==='Full Access' ? 'Full access to all sections of the portal.' : `Using the "${preset}" preset — specific permissions defined.`}
            </div>
          )}

          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <button onClick={savePermissions} disabled={saving.perms} className="btn btn-primary"><Save size={13}/>{saving.perms?'Saving...':'Save Permissions'}</button>
          </div>
        </div>
      )}

      {/* Commissions tab */}
      {activeTab==='commissions' && (
        <div>
          <div className="card card-pad" style={{marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:16,paddingBottom:12,borderBottom:'1px solid var(--border)'}}>Commission Rate</div>
            <div style={{display:'flex',gap:12,alignItems:'center'}}>
              <div style={{flex:1,maxWidth:200}}>
                <label className="inp-label">Rate (%)</label>
                <input className="inp" type="number" min={0} max={100} value={commRate} onChange={e=>setCommRate(parseFloat(e.target.value)||0)} />
              </div>
              <button onClick={saveCommRate} disabled={savingComm} className="btn btn-primary" style={{marginTop:20}}><Save size={13}/>{savingComm?'Saving...':'Save Rate'}</button>
            </div>
          </div>

          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
            {[
              ['Total Commissions', commissions.length, 'var(--blue)'],
              ['Paid', commissions.filter(c=>c.status==='paid').length, 'var(--green)'],
              ['Pending', commissions.filter(c=>c.status!=='paid').length, 'var(--amber)'],
            ].map(([l,v,c])=>(
              <div key={l} className="stat-card">
                <div className="stat-val" style={{color:c}}>{v}</div>
                <div className="stat-label">{l}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{overflow:'hidden'}}>
            {commissions.length===0 ? <div className="empty"><p>No commission records</p></div> : (
              <table className="tbl">
                <thead><tr><th>Client</th><th>Amount</th><th>Source</th><th>Date</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {commissions.map(c=>(
                    <tr key={c.id}>
                      <td className="text-main">{c.client_name}</td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:600}}>£{c.amount?.toFixed(2)}</span></td>
                      <td>{c.source}</td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{new Date(c.created_at).toLocaleDateString('en-GB')}</span></td>
                      <td>{c.status==='paid' ? <span className="badge badge-green">Paid</span> : <span className="badge badge-amber">Pending</span>}</td>
                      <td>{c.status!=='paid' && <button onClick={()=>markPaid(c.id)} className="btn btn-sm" style={{background:'var(--green-bg)',color:'var(--green)',border:'none'}}>Mark Paid</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
  )
}
