import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useMsal } from '@azure/msal-react'
import { mergeHrProfileWithOnboarding, pickBestProfileRow, syncOnboardingSubmissionToHrProfile } from '../utils/hrProfileSync'
import { sendEmail } from '../utils/email'
import {
  ACCENT_SCHEMES,
  buildPreferenceSettingKey,
  DASHBOARD_DENSITY_OPTIONS,
  DASHBOARD_HEADER_OPTIONS,
  DASHBOARD_SECTIONS,
  DEFAULT_PORTAL_PREFERENCES,
  mergePortalPreferences,
} from '../utils/portalPreferences'

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
  {key:'hr_documents',  label:'HR Documents',       group:'HR', category:'Records', desc:'Document coverage and expiry checks'},
  {key:'hr_timesheet',  label:'HR Timesheets',      group:'HR'},
  {key:'org_chart',     label:'Org Chart',          group:'HR', category:'Structure', desc:'Live reporting lines'},
  {key:'staff',         label:'My Staff',           group:'Admin'},
  {key:'reports',       label:'Reports',            group:'Admin'},
  {key:'safeguards',    label:'Admin Safeguards',   group:'Admin', category:'Control', desc:'Data integrity and risk checks'},
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
  Staff:    Object.fromEntries(ALL_PAGES.filter(p => !['admin','audit','reports','staff','banners','emailtemplates','website_editor','mailinglist','safeguards','hr_documents'].includes(p.key)).map(p => [p.key, true])),
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

function formatTimelineDate(value) {
  if (!value) return 'Unknown time'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [docUploadError, setDocUploadError] = useState('')
  const [docUploadSuccess, setDocUploadSuccess] = useState('')
  const [permId, setPermId]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [sendingNotification, setSendingNotification] = useState(false)
  const [notificationSaved, setNotificationSaved] = useState(false)
  const [notificationHistory, setNotificationHistory] = useState([])
  const [msUsers, setMsUsers]     = useState([])
  const [prevMgr, setPrevMgr]     = useState('')
  const [portalPrefs, setPortalPrefs] = useState(() => mergePortalPreferences(DEFAULT_PORTAL_PREFERENCES))
  const [portalPrefsSaving, setPortalPrefsSaving] = useState(false)
  const [portalPrefsSaved, setPortalPrefsSaved] = useState(false)
  const [customNotification, setCustomNotification] = useState({
    title: '',
    message: '',
    type: 'info',
    link: '/notifications',
    emailSubject: '',
    important: false,
    pinAsBanner: false,
    bannerTargetPage: 'all',
    bannerExpiresAt: '',
  })
  const fileRef = useRef()

  const fileTypeLabel = (name = '') => {
    const ext = name.split('.').pop()?.toUpperCase()
    return ext ? ext : 'FILE'
  }

  const pf = (k, v) => setProfile(p => ({ ...p, [k]: v }))
  const nf = (k, v) => setCustomNotification((current) => ({ ...current, [k]: v }))
  const gp = (k, v) => setPortalPrefs((current) => mergePortalPreferences(current, { [k]: v }))
  const togglePortalSection = (key) => setPortalPrefs((current) => mergePortalPreferences(current, {
    dashboardSections: {
      ...current.dashboardSections,
      [key]: !current.dashboardSections?.[key],
    },
  }))

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
      const { data: preferenceSetting } = await supabase
        .from('portal_settings')
        .select('value')
        .eq('key', buildPreferenceSettingKey(email))
        .maybeSingle()

      const p = pickBestProfileRow(profileRows || [])
      const mergedProfile = mergeHrProfileWithOnboarding(p || {}, onboardingSubmission)
      const preferenceRaw = preferenceSetting?.value?.value ?? preferenceSetting?.value ?? {}
      setPortalPrefs(mergePortalPreferences(DEFAULT_PORTAL_PREFERENCES, preferenceRaw))

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
      const { data: notificationRows } = await supabase
        .from('notifications')
        .select('*')
        .ilike('user_email', email)
        .order('created_at', { ascending: false })
        .limit(12)
      setNotificationHistory(notificationRows || [])
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

  const savePortalPrefs = async () => {
    setPortalPrefsSaving(true)
    try {
      const nextPreferences = mergePortalPreferences(DEFAULT_PORTAL_PREFERENCES, portalPrefs)
      const { error } = await supabase
        .from('portal_settings')
        .upsert({
          key: buildPreferenceSettingKey(email),
          value: { value: nextPreferences },
        }, { onConflict: 'key' })
      if (error) throw error
      setPortalPrefsSaved(true)
      setTimeout(() => setPortalPrefsSaved(false), 3000)
    } catch (error) {
      console.error('Portal preference save failed:', error)
      alert('Could not save staff portal preferences right now.')
    } finally {
      setPortalPrefsSaving(false)
    }
  }

  // ── Docs ────────────────────────────────────────────────────────────────
  const uploadDoc = async () => {
    if (!selectedDoc) {
      setDocUploadError('Choose a document first.')
      return
    }
    setUploading(true)
    setDocUploadError('')
    setDocUploadSuccess('')
    const path = `staff-docs/${email}/${Date.now()}-${selectedDoc.name}`
    const { error } = await supabase.storage.from('hr-documents').upload(path, selectedDoc)
    if (!error) {
      const { data: urlData } = supabase.storage.from('hr-documents').getPublicUrl(path)
      const { error: insertError } = await supabase.from('staff_documents').insert([{
        staff_email: email, staff_name: profile.full_name || email,
        name: selectedDoc.name, type: selectedDoc.name.toLowerCase().includes('contract') ? 'Contract' : 'Document',
        file_url: urlData.publicUrl, file_path: path, uploaded_by: user?.name, created_at: new Date().toISOString(),
      }])
      if (insertError) {
        setDocUploadError(insertError.message || 'Could not save the document record.')
      } else {
        const { data: docData } = await supabase.from('staff_documents').select('*').ilike('staff_email', email).order('created_at', { ascending: false })
        setDocs(docData || [])
        setDocUploadSuccess(`Uploaded ${selectedDoc.name}`)
        setSelectedDoc(null)
        if (fileRef.current) fileRef.current.value = ''
      }
    } else {
      setDocUploadError(error.message || 'Could not upload the document.')
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
  const contractDoc = docs.find((doc) => String(doc.type || '').toLowerCase().includes('contract') || String(doc.name || '').toLowerCase().includes('contract'))
  const rtwRemaining = profile.rtw_expiry ? Math.ceil((new Date(profile.rtw_expiry).getTime() - Date.now()) / 86400000) : null
  const rtwStatus = !profile.rtw_document_url
    ? { label: 'Missing', tone: 'red', hint: 'No right-to-work file linked.' }
    : rtwRemaining !== null && rtwRemaining < 0
      ? { label: 'Expired', tone: 'red', hint: 'Document expiry date has passed.' }
      : rtwRemaining !== null && rtwRemaining <= 45
        ? { label: `${rtwRemaining}d left`, tone: 'amber', hint: 'Review before expiry.' }
        : { label: 'Valid', tone: 'green', hint: 'Document is on file.' }
  const contractStatus = contractDoc
    ? { label: 'On file', tone: 'green', hint: contractDoc.name }
    : { label: 'Missing', tone: 'amber', hint: 'No contract document uploaded yet.' }
  const documentTimeline = [
    ...docs.map((doc) => ({
      id: `doc-${doc.id}`,
      date: doc.created_at,
      title: doc.name,
      subtitle: `${doc.type || 'Document'} · uploaded by ${doc.uploaded_by || 'Unknown'}`,
      tone: String(doc.type || '').toLowerCase().includes('contract') ? 'green' : 'blue',
      action: doc.file_url,
      actionLabel: 'Open file',
    })),
    ...(profile.rtw_document_url ? [{
      id: 'rtw-record',
      date: profile.updated_at || profile.created_at || null,
      title: 'Right-to-work document linked',
      subtitle: profile.rtw_expiry ? `Expiry: ${new Date(profile.rtw_expiry).toLocaleDateString('en-GB')}` : 'No expiry date recorded',
      tone: rtwStatus.tone,
      action: profile.rtw_document_url,
      actionLabel: 'Open RTW file',
    }] : []),
  ]
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 10)

  const sendCustomNotification = async () => {
    if (!customNotification.title.trim() || !customNotification.message.trim()) {
      alert('Please add both a title and a message.')
      return
    }

    setSendingNotification(true)
    try {
      const effectiveType = customNotification.important ? 'urgent' : (customNotification.type || 'info')
      const notificationPayload = {
        user_email: email,
        title: customNotification.title.trim(),
        message: customNotification.message.trim(),
        type: effectiveType,
        link: customNotification.link?.trim() || '/notifications',
        read: false,
        created_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('notifications').insert([notificationPayload])
      if (error) throw error

      setNotificationHistory((current) => [notificationPayload, ...current].slice(0, 12))

      if (customNotification.pinAsBanner) {
        const { error: bannerError } = await supabase.from('banners').insert([{
          title: customNotification.title.trim(),
          message: customNotification.message.trim(),
          type: effectiveType,
          display_type: 'banner',
          target: 'staff',
          target_email: email,
          target_page: customNotification.bannerTargetPage || 'all',
          active: true,
          dismissible: true,
          starts_at: new Date().toISOString(),
          ends_at: customNotification.bannerExpiresAt ? new Date(customNotification.bannerExpiresAt).toISOString() : null,
          created_by: user?.name || 'Admin',
          created_at: new Date().toISOString(),
        }])
        if (bannerError) throw bannerError
      }

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
        important: false,
        pinAsBanner: false,
        bannerTargetPage: 'all',
        bannerExpiresAt: '',
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
        {[['profile','Profile'],['portal','Portal'],['hr','HR Details'],['bank','Bank'],['permissions','Permissions'],['notify','Notify'],['commissions','Commissions'],['docs','Documents']].map(([k,l]) => (
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

        {tab === 'portal' && (
          <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.1fr) minmax(300px,0.9fr)', gap:18 }} className="staff-profile-main-grid">
            <div className="card card-pad staff-profile-form-card">
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:18, flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>Staff experience</div>
                  <div style={{ fontSize:20, fontWeight:600, color:'var(--text)', marginTop:4 }}>Theme and dashboard layout</div>
                  <div style={{ fontSize:13, color:'var(--sub)', marginTop:6, lineHeight:1.6, maxWidth:520 }}>
                    Control this staff member’s portal colour scheme and which dashboard sections appear for them.
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  {portalPrefsSaved ? <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved</span> : null}
                  <button className="btn btn-primary" onClick={savePortalPrefs} disabled={portalPrefsSaving}>
                    {portalPrefsSaving ? 'Saving...' : 'Save portal setup'}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom:18 }}>
                <div className="lbl" style={{ marginBottom:8 }}>Theme mode</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    ['light', 'Light', 'Bright default workspace'],
                    ['dark', 'Dark', 'Lower-glare evening mode'],
                  ].map(([key, label, desc]) => (
                    <button
                      key={key}
                      onClick={() => gp('themeMode', key)}
                      style={{
                        padding:'14px 16px',
                        borderRadius:12,
                        border:`2px solid ${portalPrefs.themeMode === key ? 'var(--accent)' : 'var(--border)'}`,
                        background: portalPrefs.themeMode === key ? 'var(--accent-soft)' : 'var(--card)',
                        textAlign:'left',
                      }}
                    >
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:4 }}>{label}</div>
                      <div style={{ fontSize:12, color:'var(--sub)' }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:18 }}>
                <div className="lbl" style={{ marginBottom:8 }}>Accent scheme</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10 }}>
                  {Object.entries(ACCENT_SCHEMES).map(([key, scheme]) => (
                    <button
                      key={key}
                      onClick={() => gp('accentScheme', key)}
                      style={{
                        padding:'14px',
                        borderRadius:12,
                        border:`2px solid ${portalPrefs.accentScheme === key ? scheme.accent : 'var(--border)'}`,
                        background: portalPrefs.accentScheme === key ? scheme.soft : 'var(--card)',
                        textAlign:'left',
                      }}
                    >
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                        <span style={{ width:12, height:12, borderRadius:'50%', background:scheme.accent, boxShadow:`0 0 10px ${scheme.accent}` }} />
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{scheme.label}</span>
                      </div>
                      <div style={{ fontSize:11, color:'var(--sub)' }}>{key}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }} className="dashboard-personalise-grid">
                <div>
                  <div className="lbl" style={{ marginBottom:8 }}>Dashboard density</div>
                  <div style={{ display:'grid', gap:10 }}>
                    {DASHBOARD_DENSITY_OPTIONS.map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => gp('dashboardDensity', key)}
                        style={{
                          padding:'13px 14px',
                          borderRadius:12,
                          border:`1px solid ${portalPrefs.dashboardDensity === key ? 'var(--accent-border)' : 'var(--border)'}`,
                          background: portalPrefs.dashboardDensity === key ? 'var(--accent-soft)' : 'var(--card)',
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'space-between',
                          gap:12,
                          textAlign:'left',
                        }}
                      >
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</span>
                        <span className={`badge badge-${portalPrefs.dashboardDensity === key ? 'blue' : 'grey'}`}>{portalPrefs.dashboardDensity === key ? 'On' : 'Off'}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="lbl" style={{ marginBottom:8 }}>Header style</div>
                  <div style={{ display:'grid', gap:10 }}>
                    {DASHBOARD_HEADER_OPTIONS.map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => gp('dashboardHeader', key)}
                        style={{
                          padding:'13px 14px',
                          borderRadius:12,
                          border:`1px solid ${portalPrefs.dashboardHeader === key ? 'var(--accent-border)' : 'var(--border)'}`,
                          background: portalPrefs.dashboardHeader === key ? 'var(--accent-soft)' : 'var(--card)',
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'space-between',
                          gap:12,
                          textAlign:'left',
                        }}
                      >
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</span>
                        <span className={`badge badge-${portalPrefs.dashboardHeader === key ? 'blue' : 'grey'}`}>{portalPrefs.dashboardHeader === key ? 'On' : 'Off'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom:18 }}>
                <div className="lbl" style={{ marginBottom:8 }}>Dashboard behaviour</div>
                <button
                  onClick={() => gp('showSystemBanners', !portalPrefs.showSystemBanners)}
                  style={{
                    width:'100%',
                    padding:'13px 14px',
                    borderRadius:12,
                    border:`1px solid ${portalPrefs.showSystemBanners ? 'var(--accent-border)' : 'var(--border)'}`,
                    background: portalPrefs.showSystemBanners ? 'var(--accent-soft)' : 'var(--card)',
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'space-between',
                    gap:12,
                    textAlign:'left',
                  }}
                >
                  <span>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:4 }}>Show system banners</div>
                    <div style={{ fontSize:12, color:'var(--sub)' }}>Show maintenance and system-status notices at the top of this staff member’s dashboard.</div>
                  </span>
                  <span className={`badge badge-${portalPrefs.showSystemBanners ? 'blue' : 'grey'}`}>{portalPrefs.showSystemBanners ? 'Visible' : 'Hidden'}</span>
                </button>
              </div>

              <div>
                <div className="lbl" style={{ marginBottom:8 }}>Dashboard sections</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10 }}>
                  {DASHBOARD_SECTIONS.map(([key, label]) => {
                    const enabled = portalPrefs.dashboardSections?.[key] !== false
                    return (
                      <button
                        key={key}
                        onClick={() => togglePortalSection(key)}
                        style={{
                          padding:'13px 14px',
                          borderRadius:12,
                          border:`1px solid ${enabled ? 'var(--accent-border)' : 'var(--border)'}`,
                          background: enabled ? 'var(--accent-soft)' : 'var(--card)',
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'space-between',
                          gap:12,
                          textAlign:'left',
                        }}
                      >
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</span>
                        <span className={`badge badge-${enabled ? 'blue' : 'grey'}`}>{enabled ? 'On' : 'Off'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="staff-profile-admin-column" style={{ display:'grid', gap:14 }}>
              <div className="card card-pad staff-profile-admin-card">
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)', marginBottom:6 }}>Current setup</div>
                <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginBottom:10 }}>Live staff view</div>
                <div style={{ display:'grid', gap:10 }}>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Theme</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{portalPrefs.themeMode === 'dark' ? 'Dark mode' : 'Light mode'}</div>
                  </div>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Accent</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:12, height:12, borderRadius:'50%', background:(ACCENT_SCHEMES[portalPrefs.accentScheme] || ACCENT_SCHEMES.blue).accent }} />
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{(ACCENT_SCHEMES[portalPrefs.accentScheme] || ACCENT_SCHEMES.blue).label}</div>
                    </div>
                  </div>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Layout</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>
                      {(DASHBOARD_DENSITY_OPTIONS.find(([key]) => key === portalPrefs.dashboardDensity)?.[1]) || 'Comfortable'} · {(DASHBOARD_HEADER_OPTIONS.find(([key]) => key === portalPrefs.dashboardHeader)?.[1]) || 'Full header'}
                    </div>
                  </div>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>System banners</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{portalPrefs.showSystemBanners ? 'Shown on dashboard' : 'Hidden from dashboard'}</div>
                  </div>
                  <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Dashboard shown</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {DASHBOARD_SECTIONS.filter(([key]) => portalPrefs.dashboardSections?.[key] !== false).map(([, label]) => (
                        <span key={label} className="badge badge-blue">{label}</span>
                      ))}
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
                <div>
                  <label className="lbl">Pinned banner page</label>
                  <select className="inp" value={customNotification.bannerTargetPage} onChange={(e) => nf('bannerTargetPage', e.target.value)} disabled={!customNotification.pinAsBanner}>
                    <option value="all">Everywhere</option>
                    <option value="dashboard">Dashboard</option>
                    <option value="notifications">Notifications</option>
                    <option value="my-profile">My Profile</option>
                  </select>
                </div>
                <div>
                  <label className="lbl">Banner expiry</label>
                  <input className="inp" type="date" value={customNotification.bannerExpiresAt} onChange={(e) => nf('bannerExpiresAt', e.target.value)} disabled={!customNotification.pinAsBanner} />
                </div>
                <div className="fc">
                  <label className="lbl">Message</label>
                  <textarea className="inp" rows={7} value={customNotification.message} onChange={(e) => nf('message', e.target.value)} style={{ resize:'vertical' }} placeholder="Write the message the staff member should receive." />
                </div>
              </div>

              <div style={{ display:'flex', gap:18, flexWrap:'wrap', marginTop:16 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                  <input type="checkbox" checked={customNotification.important} onChange={(e) => nf('important', e.target.checked)} style={{ accentColor:'var(--red)', width:16, height:16 }} />
                  Mark as important
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                  <input type="checkbox" checked={customNotification.pinAsBanner} onChange={(e) => nf('pinAsBanner', e.target.checked)} style={{ accentColor:'var(--accent)', width:16, height:16 }} />
                  Pin as banner
                </label>
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
                    <span className={`badge badge-${customNotification.important ? 'red' : customNotification.type === 'warning' ? 'amber' : customNotification.type === 'success' ? 'green' : 'blue'}`}>
                      {customNotification.important ? 'urgent' : customNotification.type}
                    </span>
                  </div>
                  <div style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>
                    {customNotification.message || 'Your message preview will appear here.'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', marginTop:10 }}>
                    Link: {customNotification.link || '/notifications'}
                  </div>
                  {customNotification.pinAsBanner ? (
                    <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', marginTop:6 }}>
                      Pinned banner on: {customNotification.bannerTargetPage || 'all'}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="card card-pad staff-profile-admin-card">
                <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--faint)' }}>History</div>
                    <div style={{ fontSize:16, fontWeight:600, color:'var(--text)', marginTop:4 }}>Recent notifications</div>
                  </div>
                  <span style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{notificationHistory.length} shown</span>
                </div>
                {notificationHistory.length ? (
                  <div style={{ display:'grid', gap:10 }}>
                    {notificationHistory.map((item, index) => (
                      <div key={`${item.created_at || 'notification'}-${index}`} style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:6 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{item.title || 'Notification'}</div>
                          <span className={`badge badge-${item.type === 'warning' ? 'amber' : item.type === 'success' ? 'green' : 'blue'}`}>{item.type || 'info'}</span>
                        </div>
                        <div style={{ fontSize:12, color:'var(--sub)', lineHeight:1.55, whiteSpace:'pre-wrap' }}>{item.message || '—'}</div>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginTop:8, flexWrap:'wrap' }}>
                          <span style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>
                            {item.created_at ? new Date(item.created_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : 'Unknown time'}
                          </span>
                          <span style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>
                            {item.link || '/notifications'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding:'16px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, fontSize:12.5, color:'var(--sub)', lineHeight:1.6 }}>
                    No recent notifications have been sent to this staff member yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'docs' && (
          <div className="card" style={{ overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontWeight:500, fontSize:13 }}>{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', justifyContent:'flex-end' }}>
                <input
                  type="file"
                  ref={fileRef}
                  style={{ display:'none' }}
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={e => {
                    const file = e.target.files?.[0] || null
                    setSelectedDoc(file)
                    setDocUploadError('')
                    setDocUploadSuccess('')
                  }}
                />
                <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {selectedDoc ? 'Change File' : 'Choose File'}
                </button>
                <button className="btn btn-primary btn-sm" onClick={uploadDoc} disabled={uploading || !selectedDoc}>
                  {uploading ? 'Uploading...' : '+ Upload Document'}
                </button>
              </div>
            </div>
            <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--border)', display:'grid', gap:6 }}>
              <div style={{ fontSize:12, color:selectedDoc ? 'var(--text)' : 'var(--sub)' }}>
                {selectedDoc ? `Selected: ${selectedDoc.name}` : 'No file selected yet.'}
              </div>
              {docUploadError ? <div style={{ fontSize:12, color:'var(--red)' }}>{docUploadError}</div> : null}
              {docUploadSuccess ? <div style={{ fontSize:12, color:'var(--green)' }}>{docUploadSuccess}</div> : null}
            </div>
            <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
              <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Contract</div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span className={`badge badge-${contractStatus.tone}`}>{contractStatus.label}</span>
                  <span style={{ fontSize:12, color:'var(--sub)' }}>{contractStatus.hint}</span>
                </div>
              </div>
              <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Right to work</div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span className={`badge badge-${rtwStatus.tone}`}>{rtwStatus.label}</span>
                  <span style={{ fontSize:12, color:'var(--sub)' }}>{rtwStatus.hint}</span>
                </div>
              </div>
              <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Document health</div>
                <div style={{ fontSize:13, color:'var(--text)', fontWeight:600 }}>{docs.length} file{docs.length === 1 ? '' : 's'} on record</div>
                <div style={{ fontSize:12, color:'var(--sub)', marginTop:4 }}>
                  {docs[0]?.created_at ? `Latest upload ${new Date(docs[0].created_at).toLocaleDateString('en-GB')}` : 'No uploaded staff files yet.'}
                </div>
              </div>
            </div>
            {docs.length === 0 ? (
              <div className="empty"><p>No documents uploaded yet.</p></div>
            ) : (
              <div style={{ display:'grid', gap:12, padding:12 }}>
                {docs.map((d) => (
                  <div key={d.id} className="card" style={{ padding:16, display:'grid', gap:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'flex-start', flexWrap:'wrap' }}>
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ fontSize:15, fontWeight:600, color:'var(--text)', marginBottom:4 }}>{d.name}</div>
                        <div style={{ fontSize:13, color:'var(--sub)' }}>
                          {d.type || 'Document'} for {profile.full_name || email}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                        <span className="badge badge-blue">{fileTypeLabel(d.name)}</span>
                        <span className="badge badge-grey">{d.type || 'Document'}</span>
                        <span className="badge badge-green">Stored</span>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
                      <div style={{ padding:'10px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                        <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Uploaded by</div>
                        <div style={{ fontSize:13, color:'var(--text)', fontWeight:600 }}>{d.uploaded_by || 'Unknown'}</div>
                      </div>
                      <div style={{ padding:'10px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                        <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Date</div>
                        <div style={{ fontSize:13, color:'var(--text)', fontWeight:600 }}>{new Date(d.created_at).toLocaleDateString('en-GB')}</div>
                      </div>
                      <div style={{ padding:'10px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                        <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>File path</div>
                        <div style={{ fontSize:11, color:'var(--sub)', fontFamily:'var(--font-mono)', overflow:'hidden', textOverflow:'ellipsis' }}>{d.file_path || 'Stored in HR documents'}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap', paddingTop:10, borderTop:'1px solid var(--border)' }}>
                      <div style={{ fontSize:12, color:'var(--sub)' }}>Open to preview or download, or remove if this file should no longer sit on the staff record.</div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        <a href={d.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Open document</a>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteDoc(d)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ borderTop:'1px solid var(--border)', padding:'14px 20px' }}>
              <div style={{ fontSize:10, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Timeline</div>
              {documentTimeline.length ? (
                <div style={{ display:'grid', gap:10 }}>
                  {documentTimeline.map((item) => (
                    <div key={item.id} style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                          <span className={`badge badge-${item.tone}`}>{item.tone === 'green' ? 'Compliant' : item.tone === 'amber' ? 'Review' : item.tone === 'red' ? 'Risk' : 'File'}</span>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{item.title}</div>
                        </div>
                        <div style={{ fontSize:12, color:'var(--sub)', marginTop:5 }}>{item.subtitle}</div>
                        <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)', marginTop:6 }}>{formatTimelineDate(item.date)}</div>
                      </div>
                      {item.action ? <a href={item.action} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">{item.actionLabel || 'Open'}</a> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize:12.5, color:'var(--sub)' }}>No document timeline entries yet for this staff member.</div>
              )}
            </div>
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
