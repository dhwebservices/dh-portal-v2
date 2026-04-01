import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useMsal } from '@azure/msal-react'
import { mergeHrProfileWithOnboarding, pickBestProfileRow, syncOnboardingSubmissionToHrProfile } from '../utils/hrProfileSync'
import { sendEmail } from '../utils/email'

const ALL_PAGES = [
  {key:'dashboard',     label:'Dashboard',          group:'Home', category:'Core', desc:'Main overview and stats'},
  {key:'notifications', label:'Notifications',      group:'Home', category:'Core', desc:'Inbox and alerts'},
  {key:'my_profile',    label:'My Profile',         group:'Home', category:'Core', desc:'Personal account page'},
  {key:'search',        label:'Search',             group:'Home', category:'Core', desc:'Portal-wide search'},
  {key:'outreach',      label:'Clients Contacted',  group:'Business'},
  {key:'clients',       label:'Onboarded Clients',  group:'Business'},
  {key:'clientmgmt',    label:'Client Portal',      group:'Business'},
  {key:'support',       label:'Support',            group:'Business'},
  {key:'competitor',    label:'Competitor Lookup',  group:'Business'},
  {key:'domains',       label:'Domain Checker',     group:'Business'},
  {key:'proposals',     label:'Proposal Builder',   group:'Business'},
  {key:'sendemail',     label:'Send Email',         group:'Business'},
  {key:'tasks',         label:'Manage Tasks',       group:'Tasks'},
  {key:'mytasks',       label:'My Tasks',           group:'Tasks'},
  {key:'schedule',      label:'Schedule',           group:'Tasks'},
  {key:'appointments',  label:'Appointments',       group:'Tasks'},
  {key:'hr_onboarding', label:'HR Onboarding',      group:'HR'},
  {key:'hr_leave',      label:'HR Leave',           group:'HR'},
  {key:'hr_payslips',   label:'HR Payslips',        group:'HR'},
  {key:'hr_policies',   label:'HR Policies',        group:'HR'},
  {key:'hr_timesheet',  label:'HR Timesheets',      group:'HR'},
  {key:'org_chart',     label:'Org Chart',          group:'HR', category:'Structure', desc:'Live reporting lines'},
  {key:'staff',         label:'My Staff',           group:'Admin'},
  {key:'reports',       label:'Reports',            group:'Admin'},
  {key:'mailinglist',   label:'Mailing List',       group:'Admin'},
  {key:'banners',       label:'Banners',            group:'Admin'},
  {key:'emailtemplates',label:'Email Templates',    group:'Admin'},
  {key:'audit',         label:'Audit Log',          group:'Admin'},
  {key:'maintenance',   label:'Maintenance',        group:'Admin'},
  {key:'settings',      label:'Settings',           group:'Admin'},
  {key:'admin',         label:'Admin',              group:'Admin'},
  {key:'website_editor',label:'Web Manager',        group:'Admin'},
]

const ROLE_DEFAULTS = {
  Admin:    Object.fromEntries(ALL_PAGES.map(p => [p.key, true])),
  Staff:    Object.fromEntries(ALL_PAGES.filter(p => !['admin','audit','reports','staff','banners','emailtemplates','website_editor','mailinglist'].includes(p.key)).map(p => [p.key, true])),
  ReadOnly: Object.fromEntries(ALL_PAGES.filter(p => ['dashboard','notifications','my_profile','search','mytasks','schedule','hr_leave','hr_payslips','hr_policies'].includes(p.key)).map(p => [p.key, true])),
}

const PERMISSION_GROUPS = ['Home', 'Business', 'Tasks', 'HR', 'Admin']

function countEnabledPermissions(perms) {
  return ALL_PAGES.filter((page) => perms?.[page.key]).length
}

function detectPreset(perms) {
  return Object.entries(ROLE_DEFAULTS).find(([, preset]) =>
    ALL_PAGES.every((page) => !!perms?.[page.key] === !!preset[page.key])
  )?.[0] || 'Custom'
}

function getLifecycleMeta({ onboarding, startDate, contractType }) {
  if (onboarding) {
    return { label: 'Onboarding', tone: 'amber', note: 'Portal access is still being set up.' }
  }
  if (startDate) {
    return {
      label: 'Active',
      tone: 'green',
      note: `${contractType || 'Staff member'} · started ${new Date(startDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}`,
    }
  }
  return { label: 'Active', tone: 'green', note: contractType || 'Staff member is active in the portal.' }
}

export default function StaffProfile() {
  const { email: encodedEmail } = useParams()
  const email = decodeURIComponent(encodedEmail || '').toLowerCase().trim()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { instance } = useMsal()

  const [tab, setTab]             = useState('profile')
  const [profile, setProfile]     = useState({})
  const [profileId, setProfileId] = useState(null)
  const [editPerms, setEditPerms] = useState({ ...ROLE_DEFAULTS.Staff })
  const [onboarding, setOnboarding] = useState(false)
  const [bookable, setBookable]   = useState(false)
  const [commissions, setComms]   = useState([])
  const [docs, setDocs]           = useState([])
  const [uploading, setUploading] = useState(false)
  const [permId, setPermId]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [sendingNotification, setSendingNotification] = useState(false)
  const [notificationSaved, setNotificationSaved] = useState(false)
  const [msUsers, setMsUsers]     = useState([])
  const [prevMgr, setPrevMgr]     = useState('')
  const [customNotification, setCustomNotification] = useState({
    title: '',
    message: '',
    type: 'info',
    link: '/notifications',
    emailSubject: '',
  })
  const fileRef = useRef()

  const pf = (k, v) => setProfile(p => ({ ...p, [k]: v }))
  const nf = (k, v) => setCustomNotification((current) => ({ ...current, [k]: v }))

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!email) return
    loadAll()
    loadMsUsers()
  }, [email])

  const SB_URL = 'https://xtunnfdwltfesscmpove.supabase.co'
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM'
  const sbHeaders = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }

  const sbGet = async (table, query) => {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}&limit=1`, { headers: { ...sbHeaders, 'Accept': 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) ? (data[0] || null) : data
  }

  const sbGetMany = async (table, query) => {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { headers: { ...sbHeaders, 'Accept': 'application/json' } })
    if (!res.ok) return []
    return await res.json()
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const enc = encodeURIComponent(email)
      const [profileRows, perm, comms, docs, onboardingSubmission] = await Promise.all([
        sbGetMany('hr_profiles', `user_email=ilike.${enc}`),
        sbGet('user_permissions', `user_email=ilike.${enc}`),
        sbGetMany('commissions', `staff_email=ilike.${enc}&order=date.desc`),
        sbGetMany('staff_documents', `staff_email=ilike.${enc}&order=created_at.desc`),
        sbGet('onboarding_submissions', `user_email=ilike.${enc}`),
      ])

      const p = pickBestProfileRow(profileRows || [])
      const mergedProfile = mergeHrProfileWithOnboarding(p || {}, onboardingSubmission)

      if (p || onboardingSubmission) {
        setProfile(mergedProfile)
        setProfileId(p?.id || null)
        setPrevMgr(mergedProfile.manager_email || '')
      } else {
        setProfile({})
        setProfileId(null)
        setPrevMgr('')
      }

      if (onboardingSubmission) {
        syncOnboardingSubmissionToHrProfile(onboardingSubmission).catch((err) => {
          console.error('Onboarding sync error:', err)
        })
      }

      if (perm) {
        setPermId(perm.id)
        setEditPerms(perm.permissions && Object.keys(perm.permissions).length ? perm.permissions : { ...ROLE_DEFAULTS.Staff })
        setOnboarding(!!perm.onboarding)
        setBookable(perm.bookable_staff === true)
      } else {
        setPermId(null)
      }

      setComms(comms || [])
      setDocs(docs || [])
    } catch (err) {
      console.error('Load error:', err)
    }
    setLoading(false)
  }

  const loadMsUsers = async () => {
    try {
      const account = instance.getAllAccounts()[0]
      if (!account) return
      const token = await instance.acquireTokenSilent({
        scopes: ['https://graph.microsoft.com/User.Read.All'], account
      }).catch(() => instance.acquireTokenPopup({ scopes: ['https://graph.microsoft.com/User.Read.All'], account }))
      const res = await fetch('https://graph.microsoft.com/v1.0/users?$select=displayName,userPrincipalName&$top=50', {
        headers: { Authorization: `Bearer ${token.accessToken}` }
      })
      const data = await res.json()
      setMsUsers((data.value || [])
        .filter(u => u.userPrincipalName?.toLowerCase() !== email)
        .map(u => ({ name: u.displayName, email: u.userPrincipalName?.toLowerCase() })))
    } catch (_) {}
  }

  // ── Save ────────────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true)
    try {
      const hrPayload = {
        user_email:     email,
        full_name:      profile.full_name      || null,
        role:           profile.role           || null,
        department:     profile.department     || null,
        contract_type:  profile.contract_type  || null,
        start_date:     profile.start_date     || null,
        phone:          profile.phone          || null,
        personal_email: profile.personal_email || null,
        address:        profile.address        || null,
        manager_name:   profile.manager_name   || null,
        manager_email:  profile.manager_email  || null,
        hr_notes:       profile.hr_notes       || null,
        bank_name:      profile.bank_name      || null,
        account_name:   profile.account_name   || null,
        sort_code:      profile.sort_code      || null,
        account_number: profile.account_number || null,
        updated_at:     new Date().toISOString(),
      }

      // Save hr_profiles via raw REST to avoid supabase-js columns= bug
      const existingProfile = profileId
        ? { id: profileId }
        : pickBestProfileRow(await sbGetMany('hr_profiles', `user_email=ilike.${encodeURIComponent(email)}`))

      const hrRes = await fetch(`${SB_URL}/rest/v1/hr_profiles?on_conflict=user_email`, {
        method: 'POST',
        headers: {
          ...sbHeaders,
          'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify([{
          ...(existingProfile?.created_at ? {} : { created_at: new Date().toISOString() }),
          ...hrPayload,
        }]),
      })

      if (!hrRes.ok) {
        const e = await hrRes.text()
        throw new Error('HR save failed: ' + e)
      }

      const savedProfiles = await hrRes.json().catch(() => [])
      const savedProfile = Array.isArray(savedProfiles) ? savedProfiles[0] : savedProfiles
      if (savedProfile?.id) setProfileId(savedProfile.id)
      setPrevMgr(profile.manager_email || '')

      // Save user_permissions via raw REST
      const permPayload = { permissions: editPerms, onboarding, bookable_staff: bookable, updated_at: new Date().toISOString() }
      if (permId) {
        const res = await fetch(`${SB_URL}/rest/v1/user_permissions?id=eq.${permId}`, {
          method: 'PATCH', headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify(permPayload)
        })
        if (!res.ok) { const e = await res.text(); throw new Error('Perms update failed: ' + e) }
      } else {
        const res = await fetch(`${SB_URL}/rest/v1/user_permissions`, {
          method: 'POST', headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ ...permPayload, user_email: email })
        })
        if (!res.ok) { const e = await res.text(); throw new Error('Perms insert failed: ' + e) }
        const newPerm = await sbGet('user_permissions', `user_email=ilike.${encodeURIComponent(email)}`)
        if (newPerm?.id) setPermId(newPerm.id)
      }

      // Manager change notification — fires when manager genuinely changes
      const newMgr = profile.manager_email || ''
      if (newMgr && newMgr !== prevMgr) {
        const staffName = profile.full_name || email
        try {
          await supabase.from('notifications').insert([{
            user_email: newMgr,
            title: 'New Team Member Assigned',
            message: `${staffName} has been assigned to you as their manager.`,
            type: 'info',
            link: `/my-staff/${encodeURIComponent(email)}`,
            read: false,
            created_at: new Date().toISOString(),
          }])
        } catch (_) {}
        const WORKER = 'https://dh-email-worker.aged-silence-66a7.workers.dev'
          const mgr = profile.manager_name || newMgr
          // Email to manager — independent try/catch so staff email always fires
          try {
            await fetch(WORKER, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'manager_assigned',
                data: { to_email: newMgr, manager_name: mgr, staff_name: staffName, staff_email: email, assigned_by: user?.name || 'Admin' }
              })
            })
          } catch (_) {}
          // Email to staff member — always fires independently
          try {
            await fetch(WORKER, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'staff_manager_assigned',
                data: { to_email: email, staff_name: staffName, manager_name: mgr, manager_email: newMgr, assigned_by: user?.name || 'Admin' }
              })
            })
          } catch (_) {}
        setPrevMgr(newMgr)
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Save error:', err)
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Docs ────────────────────────────────────────────────────────────────
  const uploadDoc = async (file) => {
    if (!file) return
    setUploading(true)
    const path = `staff-docs/${email}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('hr-documents').upload(path, file)
    if (!error) {
      const { data: urlData } = supabase.storage.from('hr-documents').getPublicUrl(path)
      await supabase.from('staff_documents').insert([{
        staff_email: email, staff_name: profile.full_name || email,
        name: file.name, type: file.name.toLowerCase().includes('contract') ? 'Contract' : 'Document',
        file_url: urlData.publicUrl, file_path: path, uploaded_by: user?.name, created_at: new Date().toISOString(),
      }])
      const { data: docData } = await supabase.from('staff_documents').select('*').ilike('staff_email', email).order('created_at', { ascending: false })
      setDocs(docData || [])
    }
    setUploading(false)
  }

  const deleteDoc = async (doc) => {
    if (!confirm('Delete "' + doc.name + '"?')) return
    if (doc.file_path) await supabase.storage.from('hr-documents').remove([doc.file_path]).catch(() => {})
    await supabase.from('staff_documents').delete().eq('id', doc.id)
    setDocs(p => p.filter(d => d.id !== doc.id))
  }

  const getInitials = n => (n || email || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const displayName = profile.full_name || email
  const activePreset = detectPreset(editPerms)
  const lifecycle = getLifecycleMeta({ onboarding, startDate: profile.start_date, contractType: profile.contract_type })
  const enabledPermissionCount = countEnabledPermissions(editPerms)
  const managerOption = msUsers.find((u) => u.email === (profile.manager_email || ''))

  const sendCustomNotification = async () => {
    if (!customNotification.title.trim() || !customNotification.message.trim()) {
      alert('Please add both a title and a message.')
      return
    }

    setSendingNotification(true)
    try {
      const notificationPayload = {
        user_email: email,
        title: customNotification.title.trim(),
        message: customNotification.message.trim(),
        type: customNotification.type || 'info',
        link: customNotification.link?.trim() || '/notifications',
        read: false,
        created_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('notifications').insert([notificationPayload])
      if (error) throw error

      const subject = (customNotification.emailSubject || customNotification.title).trim()
      const portalLink = customNotification.link?.trim()
        ? `https://staff.dhwebsiteservices.co.uk${customNotification.link.trim().startsWith('/') ? customNotification.link.trim() : `/${customNotification.link.trim()}`}`
        : 'https://staff.dhwebsiteservices.co.uk/notifications'
      const recipientName = (profile.full_name || email).split(' ')[0]
      const emailBody = `
        <p>Hi ${recipientName || 'there'},</p>
        <p>${customNotification.message.trim().replace(/\n/g, '<br/>')}</p>
        <p><a href="${portalLink}" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open in DH Portal</a></p>
      `

      const emailResult = await sendEmail('send_email', {
        to: email,
        to_name: profile.full_name || email,
        subject: `${subject} — DH Portal`,
        html: emailBody,
        sent_by: user?.name || 'Admin',
        log_outreach: false,
      })

      if (!emailResult.ok) {
        throw new Error(emailResult.error || 'Email send failed')
      }

      setNotificationSaved(true)
      setTimeout(() => setNotificationSaved(false), 3000)
      setCustomNotification({
        title: '',
        message: '',
        type: 'info',
        link: '/notifications',
        emailSubject: '',
      })
    } catch (err) {
      console.error('Custom notification failed:', err)
      alert('Notification send failed: ' + (err.message || 'Unknown error'))
    } finally {
      setSendingNotification(false)
    }
  }

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>

  return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:28 }}>
        <button onClick={() => navigate('/my-staff')} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'1px solid var(--border)', borderRadius:100, padding:'6px 14px', cursor:'pointer', color:'var(--sub)', fontSize:13 }}>
          ← My Staff
        </button>
      </div>

      {/* Hero */}
      <div className="staff-profile-hero" style={{ display:'flex', alignItems:'center', gap:20, padding:'24px 28px', background:'var(--card)', borderRadius:16, border:'1px solid var(--border)', marginBottom:24 }}>
        <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--accent-soft)', border:'2px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:600, fontFamily:'var(--font-display)', color:'var(--accent)', flexShrink:0 }}>
          {getInitials(displayName)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:400, letterSpacing:'-0.02em', lineHeight:1, color:'var(--text)' }}>{displayName}</h1>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:8 }}>
            {profile.role && <span style={{ fontSize:13, color:'var(--sub)' }}>{profile.role}</span>}
            {profile.department && <><span style={{ color:'var(--border2)' }}>·</span><span style={{ fontSize:13, color:'var(--sub)' }}>{profile.department}</span></>}
            <span style={{ color:'var(--border2)' }}>·</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--faint)' }}>{email}</span>
          </div>
        </div>
        <div className="staff-profile-actions" style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, color: onboarding ? 'var(--amber)' : 'var(--green)', fontWeight:500 }}>
              {onboarding ? '⏳ Onboarding' : '✅ Active'}
            </span>
            <button onClick={() => setOnboarding(o => !o)} style={{ width:40, height:22, borderRadius:11, background: onboarding ? 'var(--amber)' : 'var(--green)', border:'none', cursor:'pointer', position:'relative', flexShrink:0 }}>
              <div style={{ position:'absolute', top:2, left: onboarding ? 2 : 20, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
            </button>
          </div>
          <div className="staff-profile-toggle-card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'var(--bg2)', borderRadius:10, border:'1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>📅 Bookable for Calls</div>
              <div style={{ fontSize:11, color:'var(--faint)' }}>Shows in public booking calendar</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginLeft:16 }}>
              <span style={{ fontSize:12, color: bookable ? 'var(--accent)' : 'var(--faint)', fontWeight:500 }}>{bookable ? '✓ Bookable' : 'Not bookable'}</span>
              <button onClick={() => setBookable(b => !b)} style={{ width:40, height:22, borderRadius:11, background: bookable ? 'var(--accent)' : 'var(--bg3)', border:'none', cursor:'pointer', position:'relative', flexShrink:0 }}>
                <div style={{ position:'absolute', top:2, left: bookable ? 20 : 2, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
              </button>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {saved && <span style={{ fontSize:13, color:'var(--green)', alignSelf:'center' }}>✓ Saved</span>}
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[['profile','Profile'],['hr','HR Details'],['bank','Bank'],['permissions','Permissions'],['notify','Notify'],['commissions','Commissions'],['docs','Documents']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={'tab'+(tab===k?' on':'')}>{l}</button>
        ))}
      </div>

      <div style={{ maxWidth:tab === 'profile' ? 'none' : 760, width:'100%' }} className="staff-profile-content">
        {tab === 'profile' && (
          <div className="staff-profile-main-grid" style={{ display:'grid', gridTemplateColumns:'minmax(0,1.55fr) minmax(320px,0.95fr)', gap:20, alignItems:'start' }}>
            <div className="card card-pad staff-profile-form-card">
              <div className="fg">
                <div><label className="lbl">Full Name</label><input className="inp" value={profile.full_name || ''} onChange={e=>pf('full_name',e.target.value)}/></div>
                <div><label className="lbl">Role / Job Title</label><input className="inp" value={profile.role || ''} onChange={e=>pf('role',e.target.value)}/></div>
                <div><label className="lbl">Department</label><input className="inp" value={profile.department || ''} onChange={e=>pf('department',e.target.value)}/></div>
                <div>
                  <label className="lbl">Manager</label>
                  <select className="inp" value={profile.manager_email || ''} onChange={e => {
                    const u = msUsers.find(u => u.email === e.target.value)
                    pf('manager_email', e.target.value)
                    pf('manager_name', u?.name || '')
                  }}>
                    <option value="">— No manager assigned —</option>
                    {msUsers.map(u => <option key={u.email} value={u.email}>{u.name}</option>)}
                  </select>
                  {profile.manager_email && <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', marginTop:4 }}>{profile.manager_email}</div>}
                </div>
                <div><label className="lbl">Phone</label><input className="inp" value={profile.phone || ''} onChange={e=>pf('phone',e.target.value)}/></div>
                <div><label className="lbl">Personal Email</label><input className="inp" value={profile.personal_email || ''} onChange={e=>pf('personal_email',e.target.value)}/></div>
                <div className="fc"><label className="lbl">Address</label><textarea className="inp" rows={2} value={profile.address || ''} onChange={e=>pf('address',e.target.value)} style={{ resize:'vertical' }}/></div>
              </div>
            </div>

            <div className="staff-profile-admin-column" style={{ display:'grid', gap:14 }}>
              <div className="card card-pad staff-profile-admin-card">
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Admin controls</div>
                    <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginTop:4 }}>Lifecycle & access</div>
                  </div>
                  <span className={`badge badge-${lifecycle.tone}`}>{lifecycle.label}</span>
                </div>
                <div style={{ fontSize:12, color:'var(--sub)', marginTop:8, lineHeight:1.5 }}>{lifecycle.note}</div>

                <div style={{ display:'grid', gap:10, marginTop:16 }}>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Access preset</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{activePreset}</div>
                    <div style={{ fontSize:12, color:'var(--sub)', marginTop:4 }}>{enabledPermissionCount} pages enabled</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:10 }}>
                      {Object.keys(ROLE_DEFAULTS).map((role) => (
                        <button
                          key={role}
                          className={activePreset === role ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                          onClick={() => setEditPerms({ ...ROLE_DEFAULTS[role] })}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Manager</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{profile.manager_name || managerOption?.name || 'Unassigned'}</div>
                    <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', marginTop:4 }}>
                      {profile.manager_email || 'No manager selected'}
                    </div>
                  </div>

                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Portal controls</div>
                    <div style={{ display:'grid', gap:8 }}>
                      <label style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>Onboarding mode</div>
                          <div style={{ fontSize:11, color:'var(--sub)' }}>Restricts the portal to onboarding-safe access</div>
                        </div>
                        <button onClick={() => setOnboarding(o => !o)} style={{ width:40, height:22, borderRadius:11, background: onboarding ? 'var(--amber)' : 'var(--green)', border:'none', position:'relative', flexShrink:0 }}>
                          <div style={{ position:'absolute', top:2, left: onboarding ? 2 : 20, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
                        </button>
                      </label>
                      <label style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>Bookable for calls</div>
                          <div style={{ fontSize:11, color:'var(--sub)' }}>Controls public appointment availability</div>
                        </div>
                        <button onClick={() => setBookable(b => !b)} style={{ width:40, height:22, borderRadius:11, background: bookable ? 'var(--accent)' : 'var(--bg3)', border:'none', position:'relative', flexShrink:0 }}>
                          <div style={{ position:'absolute', top:2, left: bookable ? 20 : 2, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
                        </button>
                      </label>
                    </div>
                  </div>

                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Quick admin jumps</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {[
                        ['Permissions', 'permissions'],
                        ['Documents', 'docs'],
                        ['Commissions', 'commissions'],
                        ['HR Details', 'hr'],
                      ].map(([label, nextTab]) => (
                        <button key={nextTab} className="btn btn-outline btn-sm" onClick={() => setTab(nextTab)}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Coverage</div>
                    <div style={{ display:'grid', gap:6 }}>
                      {PERMISSION_GROUPS.map((group) => {
                        const groupItems = ALL_PAGES.filter((page) => page.group === group)
                        const enabled = groupItems.filter((page) => editPerms[page.key]).length
                        return (
                          <div key={group} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, fontSize:12.5 }}>
                            <span style={{ color:'var(--sub)' }}>{group}</span>
                            <span style={{ fontFamily:'var(--font-mono)', color:'var(--text)' }}>{enabled}/{groupItems.length}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'hr' && (
          <div className="card card-pad">
            <div className="fg">
              <div><label className="lbl">Contract Type</label>
                <select className="inp" value={profile.contract_type || ''} onChange={e=>pf('contract_type',e.target.value)}>
                  {['','Full-time','Part-time','Contractor','Zero Hours','Apprentice'].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="lbl">Start Date</label><input className="inp" type="date" value={profile.start_date||''} onChange={e=>pf('start_date',e.target.value)}/></div>
              <div className="fc"><label className="lbl">HR Notes (admin only)</label><textarea className="inp" rows={5} value={profile.hr_notes || ''} onChange={e=>pf('hr_notes',e.target.value)} style={{ resize:'vertical' }} placeholder="Performance notes, training, anything relevant..."/></div>
            </div>
          </div>
        )}

        {tab === 'bank' && (
          <div className="card card-pad">
            <div style={{ padding:'10px 14px', background:'var(--amber-bg)', border:'1px solid var(--amber)', borderRadius:7, fontSize:13, color:'var(--amber)', marginBottom:16 }}>
              Bank details are sensitive — keep this tab secure.
            </div>
            <div className="fg">
              <div><label className="lbl">Bank Name</label><input className="inp" value={profile.bank_name || ''} onChange={e=>pf('bank_name',e.target.value)}/></div>
              <div><label className="lbl">Account Name</label><input className="inp" value={profile.account_name || ''} onChange={e=>pf('account_name',e.target.value)}/></div>
              <div><label className="lbl">Sort Code</label><input className="inp" value={profile.sort_code || ''} onChange={e=>pf('sort_code',e.target.value)} placeholder="12-34-56" style={{ fontFamily:'var(--font-mono)' }}/></div>
              <div><label className="lbl">Account Number</label><input className="inp" value={profile.account_number || ''} onChange={e=>pf('account_number',e.target.value)} placeholder="12345678" style={{ fontFamily:'var(--font-mono)' }}/></div>
            </div>
          </div>
        )}

        {tab === 'permissions' && (
          <div className="card card-pad">
            <div style={{ ...{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:16, marginBottom:18 } }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>Access controls</div>
                  <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:4, maxWidth:420 }}>
                    These switches now control both navigation visibility and actual page access. Disabled pages will show an access-disabled screen if someone tries to open them directly.
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:8, minWidth:280, flex:1, maxWidth:420 }}>
                  {Object.keys(ROLE_DEFAULTS).map(role => {
                    const enabledCount = Object.values(ROLE_DEFAULTS[role]).filter(Boolean).length
                    return (
                      <button
                        key={role}
                        onClick={() => setEditPerms({ ...ROLE_DEFAULTS[role] })}
                        className="btn btn-outline btn-sm"
                        style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2, padding:'10px 12px', height:'auto' }}
                      >
                        <span>Reset to {role}</span>
                        <span style={{ fontSize:10, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{enabledCount} pages enabled</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {['Home','Business','Tasks','HR','Admin'].map(group => {
              const items = ALL_PAGES.filter((page) => page.group === group)
              const enabledCount = items.filter(({ key }) => editPerms[key]).length
              return (
                <div key={group} style={{ marginBottom:18, border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', background:'var(--bg)' }}>
                  <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>{group}</div>
                      <div style={{ fontSize:13, color:'var(--sub)', marginTop:3 }}>
                        {enabledCount} of {items.length} enabled
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditPerms((current) => {
                        const next = { ...current }
                        items.forEach(({ key }) => { next[key] = true })
                        return next
                      })}>Enable all</button>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditPerms((current) => {
                        const next = { ...current }
                        items.forEach(({ key }) => { next[key] = false })
                        return next
                      })}>Disable all</button>
                    </div>
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10, padding:12 }}>
                    {items.map(({ key, label, desc }) => {
                      const enabled = !!editPerms[key]
                      return (
                        <button
                          key={key}
                          onClick={() => setEditPerms((current) => ({ ...current, [key]: !current[key] }))}
                          style={{
                            display:'flex',
                            alignItems:'flex-start',
                            justifyContent:'space-between',
                            gap:12,
                            padding:'12px 14px',
                            borderRadius:10,
                            border:'1px solid',
                            borderColor: enabled ? 'var(--accent-border)' : 'var(--border)',
                            background: enabled ? 'var(--accent-soft)' : 'var(--card)',
                            cursor:'pointer',
                            transition:'all 0.15s',
                            textAlign:'left',
                          }}
                        >
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', lineHeight:1.3 }}>{label}</div>
                            <div style={{ fontSize:11, color:'var(--sub)', marginTop:4, lineHeight:1.45 }}>
                              {desc || 'Page access control'}
                            </div>
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8, flexShrink:0 }}>
                            <span
                              style={{
                                fontSize:10,
                                fontFamily:'var(--font-mono)',
                                letterSpacing:'0.06em',
                                textTransform:'uppercase',
                                color: enabled ? 'var(--accent)' : 'var(--faint)',
                              }}
                            >
                              {enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <div style={{ width:32, height:18, borderRadius:9, background: enabled ? 'var(--accent)' : 'var(--border)', position:'relative' }}>
                              <div style={{ position:'absolute', top:2, left: enabled ? 16 : 2, width:14, height:14, borderRadius:'50%', background:'#fff', transition:'left 0.18s' }} />
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'notify' && (
          <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.2fr) minmax(300px,0.8fr)', gap:18 }} className="staff-profile-main-grid">
            <div className="card card-pad staff-profile-form-card">
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:18, flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Custom notification</div>
                  <div style={{ fontSize:20, fontWeight:600, color:'var(--text)', marginTop:4 }}>Send staff alert</div>
                  <div style={{ fontSize:13, color:'var(--sub)', marginTop:6, lineHeight:1.6, maxWidth:520 }}>
                    This sends one message to the user’s notification bell, notifications page, and work email in the same action.
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  {notificationSaved ? <span style={{ fontSize:13, color:'var(--green)' }}>✓ Sent</span> : null}
                  <button className="btn btn-primary" disabled={sendingNotification} onClick={sendCustomNotification}>
                    {sendingNotification ? 'Sending...' : 'Send notification'}
                  </button>
                </div>
              </div>

              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
                {[
                  ['Info update', { title: 'Portal update', type: 'info', link: '/notifications' }],
                  ['Action needed', { title: 'Action required', type: 'warning', link: '/notifications' }],
                  ['Schedule note', { title: 'Schedule update', type: 'success', link: '/schedule' }],
                  ['Profile review', { title: 'Profile information request', type: 'info', link: '/my-profile' }],
                ].map(([label, preset]) => (
                  <button
                    key={label}
                    className="btn btn-outline btn-sm"
                    onClick={() => setCustomNotification((current) => ({
                      ...current,
                      ...preset,
                      message: current.message || '',
                    }))}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="fg">
                <div><label className="lbl">Notification title</label><input className="inp" value={customNotification.title} onChange={(e) => nf('title', e.target.value)} placeholder="What the staff member sees in the portal" /></div>
                <div>
                  <label className="lbl">Notification type</label>
                  <select className="inp" value={customNotification.type} onChange={(e) => nf('type', e.target.value)}>
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warning">Warning</option>
                  </select>
                </div>
                <div><label className="lbl">Portal link</label><input className="inp" value={customNotification.link} onChange={(e) => nf('link', e.target.value)} placeholder="/notifications" /></div>
                <div><label className="lbl">Email subject</label><input className="inp" value={customNotification.emailSubject} onChange={(e) => nf('emailSubject', e.target.value)} placeholder="Defaults to the notification title" /></div>
                <div className="fc">
                  <label className="lbl">Message</label>
                  <textarea className="inp" rows={7} value={customNotification.message} onChange={(e) => nf('message', e.target.value)} style={{ resize:'vertical' }} placeholder="Write the message the staff member should receive." />
                </div>
              </div>
            </div>

            <div className="staff-profile-admin-column" style={{ display:'grid', gap:14 }}>
              <div className="card card-pad staff-profile-admin-card">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>Delivery summary</div>
                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginBottom:10 }}>Where this goes</div>
                <div style={{ display:'grid', gap:10 }}>
                  {[
                    ['Notification bell', 'Appears in the unread bell dropdown immediately.'],
                    ['Notifications page', 'Stored in the full notifications centre.'],
                    ['Staff email', `Sent to ${email} using the existing portal worker email flow.`],
                  ].map(([title, text]) => (
                    <div key={title} style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{title}</div>
                      <div style={{ fontSize:12, color:'var(--sub)', marginTop:4, lineHeight:1.5 }}>{text}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card card-pad staff-profile-admin-card">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>Preview</div>
                <div style={{ padding:'14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:8 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{customNotification.title || 'Notification title'}</div>
                    <span className={`badge badge-${customNotification.type === 'warning' ? 'amber' : customNotification.type === 'success' ? 'green' : 'blue'}`}>
                      {customNotification.type}
                    </span>
                  </div>
                  <div style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>
                    {customNotification.message || 'Your message preview will appear here.'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', marginTop:10 }}>
                    Link: {customNotification.link || '/notifications'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'docs' && (
          <div className="card" style={{ overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontWeight:500, fontSize:13 }}>{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
              <div>
                <input type="file" ref={fileRef} style={{ display:'none' }} accept=".pdf,.doc,.docx,.png,.jpg" onChange={e => uploadDoc(e.target.files[0])}/>
                <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? 'Uploading...' : '+ Upload Document'}</button>
              </div>
            </div>
            {docs.length === 0 ? (
              <div className="empty"><p>No documents uploaded yet.</p></div>
            ) : (
              <>
                <div className="tbl-wrap hide-mob">
                  <table className="tbl">
                    <thead><tr><th>Document</th><th>Type</th><th>Uploaded By</th><th>Date</th><th></th></tr></thead>
                    <tbody>
                      {docs.map(d => (
                        <tr key={d.id}>
                          <td className="t-main">{d.name}</td>
                          <td><span className="badge badge-blue">{d.type}</span></td>
                          <td>{d.uploaded_by || '—'}</td>
                          <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(d.created_at).toLocaleDateString('en-GB')}</td>
                          <td>
                            <div style={{ display:'flex', gap:4 }}>
                              <a href={d.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">View</a>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteDoc(d)}>Del</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mobile-only" style={{ display:'none' }}>
                  <div style={{ display:'grid', gap:10, padding:12 }}>
                    {docs.map((d) => (
                      <div key={d.id} className="card" style={{ padding:14, display:'grid', gap:10 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>{d.name}</div>
                            <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{new Date(d.created_at).toLocaleDateString('en-GB')}</div>
                          </div>
                          <span className="badge badge-blue">{d.type}</span>
                        </div>
                        <div style={{ fontSize:12, color:'var(--sub)' }}>Uploaded by {d.uploaded_by || '—'}</div>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                          <a href={d.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">View</a>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteDoc(d)}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'commissions' && (
          <div className="card" style={{ overflow:'hidden' }}>
            {commissions.length === 0 ? (
              <div className="empty"><p>No commissions recorded for this staff member</p></div>
            ) : (
              <>
                <div className="tbl-wrap hide-mob">
                  <table className="tbl">
                    <thead><tr><th>Client</th><th>Sale Value</th><th>Commission</th><th>Date</th><th>Status</th></tr></thead>
                    <tbody>
                      {commissions.map(c => (
                        <tr key={c.id}>
                          <td className="t-main">{c.client}</td>
                          <td>£{Number(c.sale_value||0).toLocaleString()}</td>
                          <td>£{Number(c.commission_amount||0).toLocaleString()}</td>
                          <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{c.date}</td>
                          <td><span className={'badge badge-'+(c.status==='paid'?'green':'amber')}>{c.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mobile-only" style={{ display:'none' }}>
                  <div style={{ display:'grid', gap:10, padding:12 }}>
                    {commissions.map((c) => (
                      <div key={c.id} className="card" style={{ padding:14, display:'grid', gap:8 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
                          <div style={{ fontSize:14, fontWeight:600 }}>{c.client}</div>
                          <span className={'badge badge-'+(c.status==='paid'?'green':'amber')}>{c.status}</span>
                        </div>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                          <span className="badge badge-grey">Sale £{Number(c.sale_value||0).toLocaleString()}</span>
                          <span className="badge badge-blue">Commission £{Number(c.commission_amount||0).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{c.date}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
