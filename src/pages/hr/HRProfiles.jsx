import { useState, useEffect } from 'react'
import { Edit2, Save, User, RefreshCw, UserCheck, UserX } from 'lucide-react'
import { Card, Btn, Modal, Input } from '../../components/UI'
import { supabase } from '../../utils/supabase'
import { useMsal } from '@azure/msal-react'

export default function HRProfiles() {
  const { accounts, instance } = useMsal()
  const me = accounts[0]
  const myEmail = me?.username?.toLowerCase() || ''
  const [isAdmin, setIsAdmin]   = useState(false)
  const [profiles, setProfiles] = useState([]) // merged MS + Supabase
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [selected, setSelected] = useState(null)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState({})
  const [saving, setSaving]     = useState(false)
  const [msUsers, setMsUsers]     = useState([])
  const [onboardingMap, setOnboardingMap] = useState({}) // email -> bool
  const [togglingEmail, setTogglingEmail] = useState(null)

  useEffect(() => { checkRole() }, [myEmail])
  useEffect(() => { if (myEmail) loadAll() }, [myEmail, isAdmin])

  const checkRole = async () => {
    const { data } = await supabase.from('user_permissions').select('permissions').ilike('user_email', myEmail).maybeSingle()
    const p = data?.permissions
    setIsAdmin(!p || p.admin === true)
  }

  const fetchMsUsers = async () => {
    try {
      const token = (await instance.acquireTokenSilent({
        scopes: ['https://graph.microsoft.com/User.Read.All'], account: me
      })).accessToken
      const res = await fetch(
        'https://graph.microsoft.com/v1.0/users?$select=displayName,userPrincipalName,jobTitle,department,mobilePhone&$top=50&$filter=accountEnabled eq true',
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const data = await res.json()
      return (data.value || []).filter(u =>
        u.userPrincipalName &&
        !u.userPrincipalName.includes('#EXT#') &&
        u.userPrincipalName.toLowerCase().includes('dhwebsiteservices')
      )
    } catch { return [] }
  }

  const loadAll = async () => {
    setLoading(true)

    // Load onboarding flags - fetch all and match manually to avoid case issues
    const { data: permRows } = await supabase.from('user_permissions').select('user_email, onboarding')
    const oMap = {}
    ;(permRows || []).forEach(r => {
      if (r.onboarding === true) oMap[r.user_email?.toLowerCase()] = true
    })
    setOnboardingMap(oMap)

    // Get Microsoft users
    const msUserList = await fetchMsUsers()
    setMsUsers(msUserList)

    // Get all existing HR profiles from Supabase
    const { data: dbProfiles } = await supabase.from('hr_profiles').select('*')
    const dbMap = {}
    ;(dbProfiles || []).forEach(p => { dbMap[p.user_email?.toLowerCase()] = p })

    if (isAdmin) {
      // Auto-create missing profiles for all MS users
      const upserts = []
      for (const u of msUserList) {
        const email = u.userPrincipalName.toLowerCase()
        if (!dbMap[email]) {
          upserts.push({
            user_email:  email,
            full_name:   u.displayName || '',
            role:        u.jobTitle || '',
            department:  u.department || '',
            phone:       u.mobilePhone || '',
            created_at:  new Date().toISOString(),
            updated_at:  new Date().toISOString(),
          })
        }
      }
      if (upserts.length > 0) {
        await supabase.from('hr_profiles').insert(upserts)
        // Reload after insert
        const { data: fresh } = await supabase.from('hr_profiles').select('*')
        ;(fresh || []).forEach(p => { dbMap[p.user_email?.toLowerCase()] = p })
      }

      // Merge: build final list from MS users order, attach DB profile
      const merged = msUserList.map(u => {
        const email = u.userPrincipalName.toLowerCase()
        const db = dbMap[email] || {}
        return {
          ...db,
          user_email:  email,
          full_name:   db.full_name || u.displayName || email,
          role:        db.role || u.jobTitle || '',
          department:  db.department || u.department || '',
          ms_display:  u.displayName,
        }
      })
      setProfiles(merged)
    } else {
      // Staff: show only own profile
      const db = dbMap[myEmail] || {}
      const msMe = msUserList.find(u => u.userPrincipalName.toLowerCase() === myEmail)
      setProfiles([{
        ...db,
        user_email: myEmail,
        full_name:  db.full_name || msMe?.displayName || myEmail,
        role:       db.role || msMe?.jobTitle || '',
      }])
    }
    setLoading(false)
  }

  const syncNow = async () => {
    setSyncing(true)
    await loadAll()
    setSyncing(false)
  }

  const toggleOnboarding = async (profile, enable) => {
    setTogglingEmail(profile.user_email)
    const email = profile.user_email.toLowerCase()

    try {
      // Use raw SQL to find by lowercase email — avoids all case matching issues
      const { data: rows, error: fetchError } = await supabase
        .from('user_permissions')
        .select('id, user_email')

      if (fetchError) throw fetchError

      // Find matching row manually by lowercasing both sides
      const existing = (rows || []).find(r => r.user_email?.toLowerCase() === email)

      if (existing?.id) {
        // Row found — update by primary key
        const { error } = await supabase
          .from('user_permissions')
          .update({ onboarding: enable, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        // No row at all — safe to insert
        const { error } = await supabase
          .from('user_permissions')
          .insert([{ user_email: email, onboarding: enable, permissions: {}, updated_at: new Date().toISOString() }])
        if (error) throw error
      }

      // Create onboarding submission placeholder if enabling
      if (enable) {
        const { data: allSubs } = await supabase.from('onboarding_submissions').select('id, user_email')
        const existingSub = (allSubs || []).find(s => s.user_email?.toLowerCase() === email)
        if (!existingSub) {
          await supabase.from('onboarding_submissions').insert([{
            user_email: email,
            user_name: profile.full_name || email,
            status: 'in_progress',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }])
        }
      }

      setOnboardingMap(p => ({ ...p, [email]: enable }))
    } catch (err) {
      console.error('Onboarding toggle error:', err)
      alert('Error saving: ' + (err.message || JSON.stringify(err)))
    }

    setTogglingEmail(null)
  }

  const openEdit = (profile) => {
    setSelected(profile)
    setForm({ ...profile })
    setModal(true)
  }

  const save = async () => {
    setSaving(true)
    const payload = {
      user_email:     form.user_email,
      full_name:      form.full_name,
      role:           form.role,
      department:     form.department,
      contract_type:  form.contract_type,
      start_date:     form.start_date,
      phone:          form.phone,
      personal_email: form.personal_email,
      address:        form.address,
      manager_email:  form.manager_email,
      manager_name:   form.manager_name,
      hr_notes:       form.hr_notes,
      updated_at:     new Date().toISOString(),
    }
    if (form.id) {
      await supabase.from('hr_profiles').update(payload).eq('id', form.id)
    } else {
      await supabase.from('hr_profiles').insert([{ ...payload, created_at: new Date().toISOString() }])
    }
    await loadAll()
    setSaving(false)
    setModal(false)
  }

  const u = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const canEdit = (profile) => isAdmin || profile.user_email?.toLowerCase() === myEmail

  return (
    <div className="animate-fade">
      <div className="card" style={{ padding: '24px 24px 20px', marginBottom: 18, background: 'linear-gradient(135deg, var(--card-strong) 0%, rgba(47,122,85,0.08) 100%)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 10 }}>People Workspace</div>
        <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title">HR Profiles</h1>
            <p style={{ fontSize: 14, color: 'var(--sub)', marginTop: 10, maxWidth: 660 }}>
              Keep staff records, onboarding state, reporting lines, and personal details tidy in one shared profile directory.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="badge badge-grey">{profiles.length} profiles</div>
            <div className="badge badge-amber">{Object.keys(onboardingMap).length} onboarding</div>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '12.5px', color: 'var(--faint)' }}>{profiles.length} staff member{profiles.length !== 1 ? 's' : ''} from Microsoft</span>
          <button onClick={syncNow} disabled={syncing} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', color: 'var(--sub)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}>
            <RefreshCw size={13} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Syncing…' : 'Sync from Microsoft'}
          </button>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

      {loading ? (
        <div className="card card-pad"><div style={{ padding: '40px', textAlign: 'center', color: 'var(--sub)' }}>Loading staff from Microsoft…</div></div>
      ) : profiles.length === 0 ? (
        <div className="card" style={{ padding: '60px', textAlign: 'center' }}>
          <User size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
          <div style={{ color: 'var(--faint)', fontWeight: 600 }}>No staff found in Microsoft</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '16px' }}>
          {profiles.map((p, i) => (
            <div key={p.user_email || i} className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                  {(p.full_name || p.user_email || '?')[0].toUpperCase()}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {isAdmin && (() => {
                    const inOnboarding = onboardingMap[p.user_email?.toLowerCase()]
                    const isToggling = togglingEmail === p.user_email
                    return (
                      <button
                        onClick={() => toggleOnboarding(p, !inOnboarding)}
                        disabled={isToggling}
                        title={inOnboarding ? 'Remove from onboarding mode' : 'Put into onboarding mode'}
                        style={{
                          padding: '4px 10px', borderRadius: '100px', border: '1px solid',
                          borderColor: inOnboarding ? 'var(--amber)' : 'var(--border)',
                          background: inOnboarding ? 'rgba(255,184,0,0.1)' : 'transparent',
                          color: inOnboarding ? 'var(--amber)' : 'var(--faint)',
                          fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '4px',
                          transition: 'all 0.15s',
                        }}
                      >
                        {inOnboarding ? <><UserX size={11}/> {isToggling ? '…' : 'Onboarding'}</> : <><UserCheck size={11}/> {isToggling ? '…' : 'Set Onboarding'}</>}
                      </button>
                    )
                  })()}
                  {canEdit(p) && (
                    <button onClick={() => openEdit(p)} style={{ background: 'none', border: 'none', color: 'var(--sub)', cursor: 'pointer', display: 'flex', padding: '4px' }}>
                      <Edit2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '2px' }}>{p.full_name || p.user_email}</div>
              <div style={{ fontSize: '12.5px', color: 'var(--gold)', marginBottom: '10px' }}>{p.role || 'Staff'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <Row label="Email"      value={p.user_email} />
                {p.department    && <Row label="Dept"       value={p.department} />}
                {p.contract_type && <Row label="Contract"   value={p.contract_type} />}
                {p.start_date    && <Row label="Started"    value={new Date(p.start_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})} />}
                {p.manager_name  && <Row label="Manager"    value={p.manager_name} />}
                {p.phone         && <Row label="Phone"      value={p.phone} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {(modal) && (<div className="modal-backdrop" onClick={() => setModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><span className="modal-title">{`Edit Profile — ${selected?.full_name || selected?.user_email}`}</span><button onClick={() => setModal(false)} style={{background:"none",border:"none",color:"var(--faint)",cursor:"pointer",fontSize:20,lineHeight:1}}>×</button></div><div className="modal-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input label="Full Name"      value={form.full_name||''}      onChange={e=>u('full_name',e.target.value)} />
            <Input label="Role / Job Title" value={form.role||''}         onChange={e=>u('role',e.target.value)} />
            <Input label="Department"     value={form.department||''}     onChange={e=>u('department',e.target.value)} />
            <div style={{ display:'flex',flexDirection:'column',gap:'6px' }}>
              <label style={{ fontSize:'13px',color:'var(--sub)',fontWeight:600 }}>Contract Type</label>
              <select value={form.contract_type||''} onChange={e=>u('contract_type',e.target.value)} style={{ background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'9px',padding:'10px 14px',color:'var(--text)',fontSize:'13.5px' }}>
                <option value="">Select…</option>
                {['Full-time','Part-time','Contractor','Zero Hours','Apprentice'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <Input label="Start Date"     type="date" value={form.start_date||''}   onChange={e=>u('start_date',e.target.value)} />
            <Input label="Phone"          value={form.phone||''}          onChange={e=>u('phone',e.target.value)} />
            <Input label="Personal Email" value={form.personal_email||''} onChange={e=>u('personal_email',e.target.value)} />
            <Input label="Address"        value={form.address||''}        onChange={e=>u('address',e.target.value)} />
          </div>
          {isAdmin && (
            <>
              <div style={{ display:'flex',flexDirection:'column',gap:'6px' }}>
                <label style={{ fontSize:'13px',color:'var(--sub)',fontWeight:600 }}>Manager</label>
                <select value={form.manager_email||''} onChange={e=>{ const mgr=msUsers.find(x=>x.userPrincipalName===e.target.value); u('manager_email',e.target.value); u('manager_name',mgr?.displayName||'') }}
                  style={{ background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'9px',padding:'10px 14px',color:form.manager_email?'var(--text)':'var(--sub)',fontSize:'13.5px' }}>
                  <option value="">None</option>
                  {msUsers.map(x=><option key={x.userPrincipalName} value={x.userPrincipalName}>{x.displayName}</option>)}
                </select>
              </div>
              <div style={{ display:'flex',flexDirection:'column',gap:'6px' }}>
                <label style={{ fontSize:'13px',color:'var(--sub)',fontWeight:600 }}>HR Notes (admin only)</label>
                <textarea value={form.hr_notes||''} onChange={e=>u('hr_notes',e.target.value)} rows={3}
                  style={{ background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'9px',padding:'10px 14px',color:'var(--text)',fontSize:'13.5px',resize:'vertical' }} />
              </div>
            </>
          )}
          <div style={{ display:'flex',justifyContent:'flex-end',gap:'10px' }}>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}><Save size={13}/>{saving?'Saving…':'Save Profile'}</button>
          </div>
        </div>
      </div></div></div>)}
  
  )
}

const Row = ({ label, value }) => (
  <div style={{ display:'flex',gap:'6px',fontSize:'12.5px' }}>
    <span style={{ color:'var(--faint)',minWidth:'60px',flexShrink:0 }}>{label}</span>
    <span style={{ color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{value}</span>
  </div>
)
