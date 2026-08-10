import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { mergeHrProfileWithOnboarding, pickBestProfileRow, syncOnboardingSubmissionToHrProfile } from '../utils/hrProfileSync'
import { sendManagedNotification } from '../utils/notificationPreferences'
import { openSecureDocument } from '../utils/fileAccess'
import { createPortalSignature } from '../utils/contracts'
import {
  buildStaffSignDocumentBodyHtml,
  buildStaffSignDocumentFileName,
  buildStaffSignDocumentKey,
  buildStaffSignDocumentPdfBlob,
  createStaffSignDocument,
  getStaffSignDocumentStatusLabel,
} from '../utils/staffSignDocuments'
import {
  ACCENT_SCHEMES,
  CONTRAST_OPTIONS,
  DEFAULT_LANDING_OPTIONS,
  DASHBOARD_DENSITY_OPTIONS,
  DASHBOARD_HEADER_OPTIONS,
  DASHBOARD_SECTIONS,
  MOTION_OPTIONS,
  NAV_DENSITY_OPTIONS,
  NOTIFICATION_CATEGORY_OPTIONS,
  NOTIFICATION_DELIVERY_OPTIONS,
  QUICK_ACTION_OPTIONS,
  SMS_NOTIFICATION_CATEGORY_OPTIONS,
  TEXT_SCALE_OPTIONS,
  WORKSPACE_PRESET_OPTIONS,
  applyWorkspacePreset,
  describeWorkspacePreset,
  mergePortalPreferences,
} from '../utils/portalPreferences'
import { STAFF_PRESENCE_OPTIONS } from '../utils/staffPresence'
import { Button, FormField, FormLabel, FormInput, StatusBadge } from '../components/ds'

const DS_CARD = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)' }
const TONE_TO_VARIANT = { green: 'active', amber: 'warning', red: 'error', blue: 'info', grey: 'neutral' }

const PROFILE_TABS = ['info', 'portal', 'alerts', 'hr', 'bank', 'docs', 'sign_docs', 'payslips']

export default function MyProfile() {
  const { user, preferences, updatePreferences, presence, updatePresenceStatus } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const normalizedEmail = user?.email?.toLowerCase?.() || ''
  const [profile, setProfile]   = useState({})
  const [profileId, setProfileId] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [prefsSaved, setPrefsSaved] = useState(false)
  const [tab, setTab]           = useState(() => PROFILE_TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'info')
  const [docs, setDocs]         = useState([])
  const [signDocuments, setSignDocuments] = useState([])
  const [payslips, setPayslips] = useState([])
  const [portalPrefs, setPortalPrefs] = useState(() => mergePortalPreferences(preferences))
  const [signingDocumentId, setSigningDocumentId] = useState('')
  const [signDocumentMessage, setSignDocumentMessage] = useState('')
  const [presenceStatus, setPresenceStatus] = useState('online')
  const [presenceNote, setPresenceNote] = useState('')
  const [presenceSaving, setPresenceSaving] = useState(false)

  // All editable fields staff can update themselves
  const [form, setForm] = useState({
    phone: '', personal_email: '', location: '', bio: '', skills: '',
  })
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const sp = (k, v) => setPortalPrefs((current) => mergePortalPreferences(current, { workspacePreset: 'custom', [k]: v }))
  const applyPreset = (presetKey) => setPortalPrefs((current) => applyWorkspacePreset(current, presetKey))
  const toggleSection = (key) => setPortalPrefs((current) => mergePortalPreferences(current, {
    workspacePreset: 'custom',
    dashboardSections: {
      ...current.dashboardSections,
      [key]: !current.dashboardSections?.[key],
    },
  }))
  const toggleQuickAction = (key) => setPortalPrefs((current) => {
    const active = current.quickActions || []
    const next = active.includes(key) ? active.filter((item) => item !== key) : [...active, key].slice(0, 6)
    return mergePortalPreferences(current, { workspacePreset: 'custom', quickActions: next })
  })
  const setNotificationDelivery = (category, delivery) => setPortalPrefs((current) => mergePortalPreferences(current, {
    workspacePreset: 'custom',
    notificationPreferences: {
      ...current.notificationPreferences,
      [category]: delivery,
    },
  }))
  const setSmsNotificationsEnabled = (enabled) => setPortalPrefs((current) => mergePortalPreferences(current, {
    workspacePreset: 'custom',
    smsNotificationsEnabled: enabled,
  }))
  const setSmsCategoryEnabled = (category, enabled) => setPortalPrefs((current) => mergePortalPreferences(current, {
    workspacePreset: 'custom',
    smsNotificationPreferences: {
      ...current.smsNotificationPreferences,
      [category]: enabled,
    },
  }))

  useEffect(() => {
    const requestedTab = searchParams.get('tab')
    if (PROFILE_TABS.includes(requestedTab) && requestedTab !== tab) {
      setTab(requestedTab)
    }
  }, [searchParams, tab])

  useEffect(() => {
    if (!normalizedEmail) return
    Promise.all([
      supabase.from('hr_profiles').select('*').ilike('user_email', normalizedEmail),
      supabase.from('onboarding_submissions').select('*').ilike('user_email', normalizedEmail).maybeSingle(),
      supabase.from('staff_documents').select('*').ilike('staff_email', normalizedEmail).order('created_at', { ascending:false }),
      supabase.from('payslips').select('*').ilike('user_email', normalizedEmail).order('uploaded_at', { ascending:false }),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_sign_document:%'),
    ]).then(([{ data: profileRows, error: profileError }, { data: onboarding }, { data: d }, { data: ps }, { data: signDocumentRows }]) => {
      if (profileError) {
        console.error('My Profile load error:', profileError)
      }
      const bestProfile = pickBestProfileRow(profileRows || [])
      const mergedProfile = mergeHrProfileWithOnboarding(bestProfile || {}, onboarding)
      if (bestProfile || onboarding) {
        setProfile(mergedProfile); setProfileId(bestProfile?.id || null)
        // Load ALL fields from the hr_profile row into form
        setForm({
          phone:          mergedProfile.phone          || '',
          personal_email: mergedProfile.personal_email || '',
          location:       mergedProfile.location       || '',
          bio:            mergedProfile.bio            || '',
          skills:         mergedProfile.skills         || '',
        })
        if (onboarding) {
          syncOnboardingSubmissionToHrProfile(onboarding).catch(() => {})
        }
      }
      setDocs(d || [])
      setSignDocuments((signDocumentRows || [])
        .map((row) => createStaffSignDocument({
          id: String(row.key || '').replace('staff_sign_document:', ''),
          ...(row.value?.value ?? row.value ?? {}),
        }))
        .filter((item) => item.staff_email === normalizedEmail)
        .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()))
      setPayslips(ps || [])
      setLoading(false)
    })
  }, [normalizedEmail])

  useEffect(() => {
    setPortalPrefs(mergePortalPreferences(preferences))
  }, [preferences])

  useEffect(() => {
    setPresenceStatus(presence?.status || 'online')
    setPresenceNote(presence?.note || '')
  }, [presence?.status, presence?.note])

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        user_email:     normalizedEmail,
        user_name:      user.name,
        phone:          form.phone,
        personal_email: form.personal_email,
        location:       form.location,
        bio:            form.bio,
        skills:         form.skills,
        updated_at:     new Date().toISOString(),
      }

      if (profileId) {
        const { error } = await supabase.from('hr_profiles').update(payload).eq('id', profileId)
        if (error) throw error
      } else {
        const { data: existingRows, error: existingError } = await supabase.from('hr_profiles').select('id,user_email,full_name,updated_at,created_at').ilike('user_email', normalizedEmail)
        if (existingError) throw existingError
        const existing = pickBestProfileRow(existingRows || [])
        let inserted = existing
        if (existing?.id) {
          const { error } = await supabase.from('hr_profiles').update(payload).eq('id', existing.id)
          if (error) throw error
        } else {
          const insertRes = await supabase.from('hr_profiles').insert([payload]).select().maybeSingle()
          if (insertRes.error) throw insertRes.error
          inserted = insertRes.data
        }
        if (inserted?.id) setProfileId(inserted.id)
      }

      setProfile((prev) => ({ ...prev, ...payload }))
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error('My Profile save error:', error)
      alert('Could not save your profile right now. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const savePortalPrefs = async () => {
    setPrefsSaving(true)
    try {
      await updatePreferences(portalPrefs)
      setPrefsSaved(true)
      setTimeout(() => setPrefsSaved(false), 3000)
    } catch (error) {
      console.error('Portal preferences save error:', error)
      alert('Could not save your portal preferences right now. Please try again.')
    } finally {
      setPrefsSaving(false)
    }
  }

  const savePresence = async () => {
    setPresenceSaving(true)
    try {
      await updatePresenceStatus({
        status: presenceStatus,
        note: presenceNote,
      })
    } catch (error) {
      console.error('Presence update error:', error)
      alert('Could not update your account status right now. Please try again.')
    } finally {
      setPresenceSaving(false)
    }
  }

  const openSignDocumentReferenceFile = async (documentRecord) => {
    try {
      await openSecureDocument({
        bucket: 'hr-documents',
        filePath: documentRecord?.reference_file_path,
        fallbackUrl: documentRecord?.reference_file_url,
        userEmail: normalizedEmail,
        userName: user?.name || normalizedEmail,
        action: 'staff_sign_document_reference_opened',
        entity: 'staff_sign_document',
        entityId: documentRecord?.id || '',
        details: {
          title: documentRecord?.title || '',
          staff_email: normalizedEmail,
        },
      })
    } catch (error) {
      setSignDocumentMessage(error.message || 'Could not open the attached file.')
    }
  }

  const openSignedSignDocumentFile = async (documentRecord) => {
    try {
      await openSecureDocument({
        bucket: 'hr-documents',
        filePath: documentRecord?.final_document_path,
        fallbackUrl: documentRecord?.final_document_url,
        userEmail: normalizedEmail,
        userName: user?.name || normalizedEmail,
        action: 'staff_sign_document_signed_pdf_opened',
        entity: 'staff_sign_document',
        entityId: documentRecord?.id || '',
        details: {
          title: documentRecord?.title || '',
          staff_email: normalizedEmail,
        },
      })
    } catch (error) {
      setSignDocumentMessage(error.message || 'Could not open the signed PDF.')
    }
  }

  const signStaffDocument = async (documentRecord) => {
    if (!documentRecord || documentRecord.status !== 'awaiting_staff_signature') return
    setSigningDocumentId(documentRecord.id)
    setSignDocumentMessage('')
    try {
      const staffSignature = createPortalSignature({
        name: profile.full_name || user?.name || normalizedEmail,
        title: 'Staff member',
        email: normalizedEmail,
      })
      const now = new Date().toISOString()
      const completedDocument = createStaffSignDocument({
        ...documentRecord,
        staff_name: profile.full_name || documentRecord.staff_name || user?.name || normalizedEmail,
        staff_role: profile.role || documentRecord.staff_role || '',
        staff_department: profile.department || documentRecord.staff_department || '',
        merge_fields: {
          ...(documentRecord.merge_fields || {}),
          staff_name: profile.full_name || documentRecord.staff_name || user?.name || normalizedEmail,
          staff_role: profile.role || documentRecord.staff_role || '',
          staff_department: profile.department || documentRecord.staff_department || '',
          staff_signature_name: profile.full_name || documentRecord.staff_name || user?.name || normalizedEmail,
          staff_signed_date: new Date(staffSignature.signed_at).toLocaleDateString('en-GB'),
        },
        staff_signature: staffSignature,
        staff_signed_at: staffSignature.signed_at,
        status: 'completed',
        completed_at: now,
        updated_at: now,
      })

      const pdfBlob = await buildStaffSignDocumentPdfBlob(completedDocument)
      const fileName = buildStaffSignDocumentFileName(completedDocument)
      const filePath = `staff-sign-documents/${normalizedEmail}/completed/${Date.now()}-${fileName}`
      const { error: uploadError } = await supabase.storage.from('hr-documents').upload(filePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: false,
      })
      if (uploadError) throw uploadError
      const { data: publicUrlData } = supabase.storage.from('hr-documents').getPublicUrl(filePath)

      const finalizedDocument = createStaffSignDocument({
        ...completedDocument,
        final_document_path: filePath,
        final_document_url: publicUrlData.publicUrl,
      })

      const [{ error: signDocError }, { error: docError }] = await Promise.all([
        supabase
          .from('portal_settings')
          .upsert({
            key: buildStaffSignDocumentKey(finalizedDocument.id),
            value: { value: finalizedDocument },
          }, { onConflict: 'key' }),
        supabase
          .from('staff_documents')
          .insert([{
            staff_email: normalizedEmail,
            staff_name: profile.full_name || user?.name || normalizedEmail,
            name: `${finalizedDocument.title || finalizedDocument.document_type || 'Staff document'}.pdf`,
            type: finalizedDocument.document_type || 'Signed Document',
            file_url: publicUrlData.publicUrl,
            file_path: filePath,
            uploaded_by: 'Staff sign-off',
            created_at: now,
          }]),
      ])
      if (signDocError) throw signDocError
      if (docError) throw docError

      await Promise.allSettled([
        sendManagedNotification({
          userEmail: normalizedEmail,
          userName: profile.full_name || user?.name || normalizedEmail,
          category: 'hr',
          type: 'success',
          title: 'Signed document complete',
          message: `${finalizedDocument.title || 'Your document'} has been signed and stored in DH Portal.`,
          link: finalizedDocument.final_document_url || '/my-profile?tab=docs',
          emailSubject: `${finalizedDocument.title || 'Staff document'} — signed copy`,
          emailHtml: `
            <p>Hi ${(profile.full_name || user?.name || normalizedEmail).split(' ')[0] || 'there'},</p>
            <p>Your document has now been signed and stored.</p>
            <p><a href="${finalizedDocument.final_document_url}" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open signed PDF</a></p>
          `,
          sentBy: user?.name || user?.email || 'DH Portal',
          fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
          forceImportant: true,
        }),
        finalizedDocument.manager_email
          ? sendManagedNotification({
            userEmail: finalizedDocument.manager_email,
            userName: finalizedDocument.manager_name || finalizedDocument.manager_email,
            category: 'hr',
            type: 'success',
            title: 'Staff document signed',
            message: `${finalizedDocument.staff_name || normalizedEmail} has signed ${finalizedDocument.title || 'their document'}.`,
            link: finalizedDocument.final_document_url || '/my-staff',
            emailSubject: `${finalizedDocument.staff_name || normalizedEmail} — document signed`,
            emailHtml: `
              <p>Hi ${(finalizedDocument.manager_name || finalizedDocument.manager_email).split(' ')[0] || 'there'},</p>
              <p>${finalizedDocument.staff_name || normalizedEmail} has signed <strong>${finalizedDocument.title || 'their document'}</strong>.</p>
              <p><a href="${finalizedDocument.final_document_url}" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open signed PDF</a></p>
            `,
            sentBy: user?.name || user?.email || 'DH Portal',
            fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
            forceImportant: true,
          })
          : Promise.resolve(),
      ])

      setSignDocuments((current) => current.map((item) => item.id === finalizedDocument.id ? finalizedDocument : item))
      setDocs((current) => [{
        id: `signed-${finalizedDocument.id}`,
        staff_email: normalizedEmail,
        name: `${finalizedDocument.title || finalizedDocument.document_type || 'Staff document'}.pdf`,
        type: finalizedDocument.document_type || 'Signed Document',
        file_url: finalizedDocument.final_document_url,
        file_path: finalizedDocument.final_document_path,
        uploaded_by: 'Staff sign-off',
        created_at: now,
      }, ...current])
      setSignDocumentMessage('Document signed successfully. The PDF has been stored and emailed.')
    } catch (error) {
      console.error('Staff sign document failed:', error)
      setSignDocumentMessage(error.message || 'Could not sign the document right now.')
    } finally {
      setSigningDocumentId('')
    }
  }

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>

  return (
    <div className="ds-content">
      {/* Hero */}
      <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:28, padding:'24px', background:'var(--color-bg-surface)', borderRadius:14, border:'1px solid var(--color-border)' }}>
        <div style={{ width:64, height:64, borderRadius:'50%', background:'var(--color-blue-50)', border:'2px solid var(--color-border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, overflow:'hidden' }}>
          <img src="/dh-logo-icon.png" alt="DH avatar" style={{ width:38, height:38, objectFit:'contain' }} />
        </div>
        <div style={{ flex:1 }}>
          <h1 style={{ fontSize:28, fontWeight:400, letterSpacing:'-0.02em', lineHeight:1 }}>{user?.name}</h1>
          <div style={{ fontSize:13, color:'var(--color-text-secondary)', marginTop:5 }}>
            {profile.role || 'Staff'}{profile.department ? ` · ${profile.department}` : ''}
            {profile.contract_type ? ` · ${profile.contract_type}` : ''}
          </div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--color-text-tertiary)', marginTop:3 }}>{user?.email}</div>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          {saved && <span style={{ fontSize:13, color:'var(--color-green-500)' }}>✓ Saved</span>}
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
        </div>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {[['info','My Details'],['portal','Portal'],['alerts','Alerts'],['hr','HR Info'],['bank','Bank Details'],['docs','Documents'],['sign_docs','Sign Docs'],['payslips','Payslips']].map(([k,l]) => (
          <Button key={k} onClick={() => { setTab(k); setSearchParams(k === 'info' ? {} : { tab: k }) }} variant={tab===k ? 'primary' : 'secondary'} style={{ height:30, fontSize:12, padding:'0 10px' }}>{l}</Button>
        ))}
      </div>

      {/* My Details — staff can edit these */}
      {tab === 'info' && (
        <div style={{ ...DS_CARD, padding:20, maxWidth:600 }}>
          <div style={{ fontSize:12, color:'var(--color-text-tertiary)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:16 }}>Editable by you</div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16 }}>
              <FormField><FormLabel>Phone</FormLabel><FormInput value={form.phone} onChange={e=>sf('phone',e.target.value)} placeholder="07700 000000"/></FormField>
              <FormField><FormLabel>Personal Email</FormLabel><FormInput type="email" value={form.personal_email} onChange={e=>sf('personal_email',e.target.value)}/></FormField>
              <FormField className="staff-onboarding-fc"><FormLabel>Location</FormLabel><FormInput value={form.location} onChange={e=>sf('location',e.target.value)} placeholder="Cardiff, Wales"/></FormField>
              <FormField className="staff-onboarding-fc"><FormLabel>Skills</FormLabel><FormInput value={form.skills} onChange={e=>sf('skills',e.target.value)} placeholder="e.g. WordPress, SEO, Client Relations"/></FormField>
            </div>
            <FormField><FormLabel>Bio / About Me</FormLabel><textarea className="ds-form-input" rows={3} value={form.bio} onChange={e=>sf('bio',e.target.value)} style={{ resize:'vertical' }}/></FormField>
          </div>
        </div>
      )}

      {tab === 'portal' && (
        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.1fr) minmax(280px,0.9fr)', gap:18 }} className="staff-profile-main-grid">
          <div style={{ ...DS_CARD, padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:18, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--color-text-tertiary)' }}>Portal preferences</div>
                <div style={{ fontSize:20, fontWeight:600, color:'var(--color-text-primary)', marginTop:4 }}>Personalise your workspace</div>
                <div style={{ fontSize:13, color:'var(--color-text-secondary)', marginTop:6, lineHeight:1.6, maxWidth:520 }}>
                  Choose your portal theme, accent scheme, and which dashboard sections you want to keep visible.
                </div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                {prefsSaved ? <span style={{ fontSize:13, color:'var(--color-green-500)' }}>✓ Saved</span> : null}
                <Button variant="primary" onClick={savePortalPrefs} disabled={prefsSaving}>
                  {prefsSaving ? 'Saving...' : 'Save portal preferences'}
                </Button>
              </div>
            </div>

            <div style={{ marginBottom:18 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Account status</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:10, marginBottom:12 }}>
                {STAFF_PRESENCE_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => setPresenceStatus(option.key)}
                    style={{
                      padding:'13px 14px',
                      borderRadius:12,
                      border:`1px solid ${presenceStatus === option.key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: presenceStatus === option.key ? 'var(--color-blue-50)' : 'var(--color-bg-surface)',
                      textAlign:'left',
                    }}
                  >
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{option.label}</div>
                  </button>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', gap:10 }} className="dashboard-personalise-grid">
                <FormInput
                  value={presenceNote}
                  onChange={(e) => setPresenceNote(e.target.value)}
                  placeholder="Optional note, like In client call or Heads down."
                />
                <Button variant="primary" onClick={savePresence} disabled={presenceSaving}>
                  {presenceSaving ? 'Updating...' : 'Update status'}
                </Button>
              </div>
            </div>

            <div style={{ marginBottom:18 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Workspace preset</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
                {WORKSPACE_PRESET_OPTIONS.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => applyPreset(key)}
                    style={{
                      padding:'13px 14px',
                      borderRadius:12,
                      border:`1px solid ${portalPrefs.workspacePreset === key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: portalPrefs.workspacePreset === key ? 'var(--color-blue-50)' : 'var(--color-bg-surface)',
                      textAlign:'left',
                    }}
                  >
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:18 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Theme mode</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[
                  ['light', 'Light', 'Clean white workspace'],
                  ['dark', 'Dark', 'Low-glare evening mode'],
                ].map(([key, label, desc]) => (
                  <button
                    key={key}
                    onClick={() => sp('themeMode', key)}
                    style={{
                      padding:'14px 16px',
                      borderRadius:12,
                      border:`2px solid ${portalPrefs.themeMode === key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: portalPrefs.themeMode === key ? 'var(--color-blue-50)' : 'var(--color-bg-surface)',
                      textAlign:'left',
                    }}
                  >
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--color-text-primary)', marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:12, color:'var(--color-text-secondary)' }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:18 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Accent scheme</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10 }}>
                {Object.entries(ACCENT_SCHEMES).map(([key, scheme]) => (
                  <button
                    key={key}
                    onClick={() => sp('accentScheme', key)}
                    style={{
                      padding:'14px 14px',
                      borderRadius:12,
                      border:`2px solid ${portalPrefs.accentScheme === key ? scheme.accent : 'var(--color-border)'}`,
                      background: portalPrefs.accentScheme === key ? scheme.soft : 'var(--color-bg-surface)',
                      textAlign:'left',
                    }}
                  >
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <span style={{ width:12, height:12, borderRadius:'50%', background:scheme.accent, boxShadow:`0 0 10px ${scheme.accent}` }} />
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{scheme.label}</span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--color-text-secondary)' }}>{key}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:18 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Comfort & accessibility</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }} className="dashboard-personalise-grid">
                <div>
                  <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Text size</div>
                  <div style={{ display:'grid', gap:10 }}>
                    {TEXT_SCALE_OPTIONS.map(([key, label]) => (
                      <button key={key} onClick={() => sp('textScale', key)} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${portalPrefs.textScale === key ? 'var(--color-primary)' : 'var(--color-border)'}`, background: portalPrefs.textScale === key ? 'var(--color-blue-50)' : 'var(--color-bg-surface)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, textAlign:'left' }}>
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{label}</span>
                        <StatusBadge variant="info">{portalPrefs.textScale === key ? 'On' : 'Off'}</StatusBadge>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Motion</div>
                  <div style={{ display:'grid', gap:10 }}>
                    {MOTION_OPTIONS.map(([key, label]) => (
                      <button key={key} onClick={() => sp('motionMode', key)} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${portalPrefs.motionMode === key ? 'var(--color-primary)' : 'var(--color-border)'}`, background: portalPrefs.motionMode === key ? 'var(--color-blue-50)' : 'var(--color-bg-surface)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, textAlign:'left' }}>
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{label}</span>
                        <StatusBadge variant="info">{portalPrefs.motionMode === key ? 'On' : 'Off'}</StatusBadge>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }} className="dashboard-personalise-grid">
                <div>
                  <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Navigation density</div>
                  <div style={{ display:'grid', gap:10 }}>
                    {NAV_DENSITY_OPTIONS.map(([key, label]) => (
                      <button key={key} onClick={() => sp('navDensity', key)} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${portalPrefs.navDensity === key ? 'var(--color-primary)' : 'var(--color-border)'}`, background: portalPrefs.navDensity === key ? 'var(--color-blue-50)' : 'var(--color-bg-surface)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, textAlign:'left' }}>
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{label}</span>
                        <StatusBadge variant="info">{portalPrefs.navDensity === key ? 'On' : 'Off'}</StatusBadge>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Contrast</div>
                  <div style={{ display:'grid', gap:10 }}>
                    {CONTRAST_OPTIONS.map(([key, label]) => (
                      <button key={key} onClick={() => sp('contrastMode', key)} style={{ padding:'13px 14px', borderRadius:12, border:`1px solid ${portalPrefs.contrastMode === key ? 'var(--color-primary)' : 'var(--color-border)'}`, background: portalPrefs.contrastMode === key ? 'var(--color-blue-50)' : 'var(--color-bg-surface)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, textAlign:'left' }}>
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{label}</span>
                        <StatusBadge variant="info">{portalPrefs.contrastMode === key ? 'On' : 'Off'}</StatusBadge>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }} className="dashboard-personalise-grid">
              <div>
                <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Dashboard density</div>
                <div style={{ display:'grid', gap:10 }}>
                  {DASHBOARD_DENSITY_OPTIONS.map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => sp('dashboardDensity', key)}
                      style={{
                        padding:'13px 14px',
                        borderRadius:12,
                        border:`1px solid ${portalPrefs.dashboardDensity === key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        background: portalPrefs.dashboardDensity === key ? 'var(--color-blue-50)' : 'var(--color-bg-surface)',
                        display:'flex',
                        alignItems:'center',
                        justifyContent:'space-between',
                        gap:12,
                        textAlign:'left',
                      }}
                    >
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{label}</span>
                      <StatusBadge variant="info">{portalPrefs.dashboardDensity === key ? 'On' : 'Off'}</StatusBadge>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Header style</div>
                <div style={{ display:'grid', gap:10 }}>
                  {DASHBOARD_HEADER_OPTIONS.map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => sp('dashboardHeader', key)}
                      style={{
                        padding:'13px 14px',
                        borderRadius:12,
                        border:`1px solid ${portalPrefs.dashboardHeader === key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        background: portalPrefs.dashboardHeader === key ? 'var(--color-blue-50)' : 'var(--color-bg-surface)',
                        display:'flex',
                        alignItems:'center',
                        justifyContent:'space-between',
                        gap:12,
                        textAlign:'left',
                      }}
                    >
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{label}</span>
                      <StatusBadge variant="info">{portalPrefs.dashboardHeader === key ? 'On' : 'Off'}</StatusBadge>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginBottom:18 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Default landing page</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10 }}>
                {DEFAULT_LANDING_OPTIONS.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => sp('defaultLanding', key)}
                    style={{
                      padding:'13px 14px',
                      borderRadius:12,
                      border:`1px solid ${portalPrefs.defaultLanding === key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: portalPrefs.defaultLanding === key ? 'var(--color-blue-50)' : 'var(--color-bg-surface)',
                      textAlign:'left',
                    }}
                  >
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:18 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Dashboard behaviour</div>
              <div style={{ display:'grid', gap:10 }}>
                <button
                  onClick={() => sp('showSystemBanners', !portalPrefs.showSystemBanners)}
                  style={{
                    padding:'13px 14px',
                    borderRadius:12,
                    border:`1px solid ${portalPrefs.showSystemBanners ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: portalPrefs.showSystemBanners ? 'var(--color-blue-50)' : 'var(--color-bg-surface)',
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'space-between',
                    gap:12,
                    textAlign:'left',
                  }}
                >
                  <span>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)', marginBottom:4 }}>Show system banners</div>
                    <div style={{ fontSize:12, color:'var(--color-text-secondary)' }}>Display maintenance and status notices at the top of your dashboard.</div>
                  </span>
                  <StatusBadge variant="info">{portalPrefs.showSystemBanners ? 'Visible' : 'Hidden'}</StatusBadge>
                </button>
              </div>
            </div>

            <div style={{ marginBottom:18 }}>
              <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Pinned quick actions</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:10 }}>
                {QUICK_ACTION_OPTIONS.map(([key, label]) => {
                  const enabled = portalPrefs.quickActions?.includes(key)
                  return (
                    <button
                      key={key}
                      onClick={() => toggleQuickAction(key)}
                      style={{
                        padding:'13px 14px',
                        borderRadius:12,
                        border:`1px solid ${enabled ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        background: enabled ? 'var(--color-blue-50)' : 'var(--color-bg-surface)',
                        display:'flex',
                        alignItems:'center',
                        justifyContent:'space-between',
                        gap:12,
                        textAlign:'left',
                      }}
                    >
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{label}</span>
                      <StatusBadge variant="info">{enabled ? 'Pinned' : 'Off'}</StatusBadge>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="ds-form-label" style={{ display:'block', marginBottom:8 }}>Dashboard sections</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10 }}>
                {DASHBOARD_SECTIONS.map(([key, label]) => {
                  const enabled = portalPrefs.dashboardSections?.[key] !== false
                  return (
                    <button
                      key={key}
                      onClick={() => toggleSection(key)}
                      style={{
                        padding:'13px 14px',
                        borderRadius:12,
                        border:`1px solid ${enabled ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        background: enabled ? 'var(--color-blue-50)' : 'var(--color-bg-surface)',
                        display:'flex',
                        alignItems:'center',
                        justifyContent:'space-between',
                        gap:12,
                        textAlign:'left',
                      }}
                    >
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{label}</span>
                      <StatusBadge variant="info">{enabled ? 'On' : 'Off'}</StatusBadge>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div style={{ ...DS_CARD, padding:20 }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--color-text-tertiary)', marginBottom:6 }}>Preview</div>
            <div style={{ fontSize:18, fontWeight:600, color:'var(--color-text-primary)', marginBottom:12 }}>Your dashboard setup</div>
            <div style={{ display:'grid', gap:10 }}>
              <div style={{ padding:'14px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginBottom:6 }}>Workspace preset</div>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--color-text-primary)' }}>{describeWorkspacePreset(portalPrefs)}</div>
              </div>
              <div style={{ padding:'14px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginBottom:6 }}>Theme</div>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--color-text-primary)' }}>{portalPrefs.themeMode === 'dark' ? 'Dark mode' : 'Light mode'}</div>
              </div>
              <div style={{ padding:'14px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginBottom:6 }}>Accent</div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ width:12, height:12, borderRadius:'50%', background:(ACCENT_SCHEMES[portalPrefs.accentScheme] || ACCENT_SCHEMES.blue).accent }} />
                  <span style={{ fontSize:14, fontWeight:600, color:'var(--color-text-primary)' }}>{(ACCENT_SCHEMES[portalPrefs.accentScheme] || ACCENT_SCHEMES.blue).label}</span>
                </div>
              </div>
              <div style={{ padding:'14px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginBottom:6 }}>Landing page</div>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--color-text-primary)' }}>
                  {(DEFAULT_LANDING_OPTIONS.find(([key]) => key === portalPrefs.defaultLanding)?.[1]) || 'Dashboard'}
                </div>
              </div>
              <div style={{ padding:'14px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginBottom:6 }}>Layout</div>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--color-text-primary)' }}>
                  {(DASHBOARD_DENSITY_OPTIONS.find(([key]) => key === portalPrefs.dashboardDensity)?.[1]) || 'Comfortable'} · {(DASHBOARD_HEADER_OPTIONS.find(([key]) => key === portalPrefs.dashboardHeader)?.[1]) || 'Full header'}
                </div>
              </div>
              <div style={{ padding:'14px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginBottom:8 }}>Comfort</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <StatusBadge variant="info">{TEXT_SCALE_OPTIONS.find(([key]) => key === portalPrefs.textScale)?.[1] || 'Standard'}</StatusBadge>
                  <StatusBadge variant="info">{MOTION_OPTIONS.find(([key]) => key === portalPrefs.motionMode)?.[1] || 'Standard motion'}</StatusBadge>
                  <StatusBadge variant="info">{NAV_DENSITY_OPTIONS.find(([key]) => key === portalPrefs.navDensity)?.[1] || 'Comfortable nav'}</StatusBadge>
                  <StatusBadge variant="info">{CONTRAST_OPTIONS.find(([key]) => key === portalPrefs.contrastMode)?.[1] || 'Standard contrast'}</StatusBadge>
                </div>
              </div>
              <div style={{ padding:'14px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginBottom:8 }}>Pinned actions</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {(portalPrefs.quickActions || []).map((key) => (
                    <StatusBadge key={key} variant="info">{QUICK_ACTION_OPTIONS.find(([actionKey]) => actionKey === key)?.[1] || key}</StatusBadge>
                  ))}
                </div>
              </div>
              <div style={{ padding:'14px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginBottom:6 }}>System banners</div>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--color-text-primary)' }}>{portalPrefs.showSystemBanners ? 'Shown on dashboard' : 'Hidden from dashboard'}</div>
              </div>
              <div style={{ padding:'14px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginBottom:8 }}>Visible sections</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {DASHBOARD_SECTIONS.filter(([key]) => portalPrefs.dashboardSections?.[key] !== false).map(([, label]) => (
                    <StatusBadge key={label} variant="info">{label}</StatusBadge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'alerts' && (
        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.05fr) minmax(280px,0.95fr)', gap:18 }} className="staff-profile-main-grid">
          <div style={{ ...DS_CARD, padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:18, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--color-text-tertiary)' }}>Notification preferences</div>
                <div style={{ fontSize:20, fontWeight:600, color:'var(--color-text-primary)', marginTop:4 }}>Choose how you hear from the portal</div>
                <div style={{ fontSize:13, color:'var(--color-text-secondary)', marginTop:6, lineHeight:1.6, maxWidth:560 }}>
                  Pick whether each type of alert reaches you in the portal, by email, or both. Urgent and maintenance-style alerts still break through to both channels.
                </div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                {prefsSaved ? <span style={{ fontSize:13, color:'var(--color-green-500)' }}>✓ Saved</span> : null}
                <Button variant="primary" onClick={savePortalPrefs} disabled={prefsSaving}>
                  {prefsSaving ? 'Saving...' : 'Save alert preferences'}
                </Button>
              </div>
            </div>

            <div style={{ display:'grid', gap:12 }}>
              {NOTIFICATION_CATEGORY_OPTIONS.map(([category, label]) => (
                <div key={category} style={{ padding:'14px 16px', border:'1px solid var(--color-border)', borderRadius:14, background:'var(--color-bg-surface)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--color-text-primary)' }}>{label}</div>
                      <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>
                        {category === 'urgent' ? 'Critical admin and maintenance alerts always stay visible and emailed.' : 'Choose the default delivery for this type of update.'}
                      </div>
                    </div>
                    <StatusBadge variant={category === 'urgent' ? 'error' : 'info'}>
                      {portalPrefs.notificationPreferences?.[category] || 'both'}
                    </StatusBadge>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10 }}>
                    {NOTIFICATION_DELIVERY_OPTIONS.map(([delivery, deliveryLabel]) => {
                      const active = (portalPrefs.notificationPreferences?.[category] || 'both') === delivery
                      return (
                        <button
                          key={delivery}
                          onClick={() => setNotificationDelivery(category, delivery)}
                          disabled={category === 'urgent'}
                          style={{
                            padding:'12px 13px',
                            borderRadius:12,
                            border:`1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            background: active ? 'var(--color-blue-50)' : 'var(--color-bg-surface)',
                            textAlign:'left',
                            opacity: category === 'urgent' && !active ? 0.55 : 1,
                            cursor: category === 'urgent' ? 'default' : 'pointer',
                          }}
                        >
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{deliveryLabel}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...DS_CARD, padding:20 }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--color-text-tertiary)', marginBottom:6 }}>Preview</div>
            <div style={{ fontSize:18, fontWeight:600, color:'var(--color-text-primary)', marginBottom:12 }}>Your delivery setup</div>
            <div style={{ display:'grid', gap:10 }}>
              {NOTIFICATION_CATEGORY_OPTIONS.map(([category, label]) => (
                <div key={category} style={{ padding:'14px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', marginBottom:6 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{label}</div>
                    <StatusBadge variant={category === 'urgent' ? 'error' : 'info'}>
                      {portalPrefs.notificationPreferences?.[category] || 'both'}
                    </StatusBadge>
                  </div>
                  <div style={{ fontSize:12, color:'var(--color-text-secondary)', lineHeight:1.55 }}>
                    {category === 'urgent'
                      ? 'Always delivered to both your portal inbox and your work email.'
                      : (portalPrefs.notificationPreferences?.[category] || 'both') === 'portal'
                        ? 'Stays inside the bell and notifications page only.'
                        : (portalPrefs.notificationPreferences?.[category] || 'both') === 'email'
                          ? 'Sent to your email without adding portal noise.'
                          : 'Delivered through both the portal and email.'}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18, padding:'16px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--color-text-primary)' }}>SMS alerts</div>
                  <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4, lineHeight:1.55 }}>
                    Use one-way SMS for operational updates. Messages are sent from an alpha tag sender and replies are not supported.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSmsNotificationsEnabled(!portalPrefs.smsNotificationsEnabled)}
                  style={{
                    padding:'10px 14px',
                    borderRadius:999,
                    border:`1px solid ${portalPrefs.smsNotificationsEnabled ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: portalPrefs.smsNotificationsEnabled ? 'var(--color-blue-50)' : 'var(--color-bg-surface)',
                    color:'var(--color-text-primary)',
                    fontSize:12,
                    fontWeight:700,
                    letterSpacing:'0.04em',
                    textTransform:'uppercase',
                  }}
                >
                  {portalPrefs.smsNotificationsEnabled ? 'SMS enabled' : 'SMS disabled'}
                </button>
              </div>

              <div style={{ display:'grid', gap:10 }}>
                {SMS_NOTIFICATION_CATEGORY_OPTIONS.map(([category, label]) => {
                  const active = category === 'urgent'
                    ? true
                    : portalPrefs.smsNotificationsEnabled && portalPrefs.smsNotificationPreferences?.[category] === true
                  return (
                    <div key={category} style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', padding:'12px 14px', border:'1px solid var(--color-border)', borderRadius:12, background:'var(--color-bg-surface)', opacity: !portalPrefs.smsNotificationsEnabled && category !== 'urgent' ? 0.6 : 1 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>{label}</div>
                        <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>
                          {category === 'urgent'
                            ? 'Critical alerts stay SMS-enabled once the SMS channel is on.'
                            : 'Allow this category to trigger text messages to your staff mobile number.'}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={category === 'urgent' || !portalPrefs.smsNotificationsEnabled}
                        onClick={() => setSmsCategoryEnabled(category, !portalPrefs.smsNotificationPreferences?.[category])}
                        style={{
                          minWidth:88,
                          padding:'9px 12px',
                          borderRadius:999,
                          border:`1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          background: active ? 'var(--color-blue-50)' : 'var(--color-gray-50)',
                          color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                          fontSize:12,
                          fontWeight:700,
                          cursor: category === 'urgent' || !portalPrefs.smsNotificationsEnabled ? 'default' : 'pointer',
                        }}
                      >
                        {active ? 'On' : 'Off'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HR Info — read only, set by admin */}
      {tab === 'hr' && (
        <div style={{ ...DS_CARD, padding:20, maxWidth:500 }}>
          <div style={{ padding:'10px 14px', background:'var(--color-blue-50)', border:'1px solid var(--color-border)', borderRadius:8, marginBottom:18, fontSize:13, color:'var(--color-primary)' }}>
            These details are managed by HR. Contact your manager to make changes.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {[
              ['Full Name',       profile.full_name],
              ['Role',            profile.role],
              ['Department',      profile.department],
              ['Contract Type',   profile.contract_type],
              ['Start Date',      profile.start_date ? new Date(profile.start_date).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : null],
              ['Manager',         profile.manager_name],
              ['Address',         profile.address],
            ].map(([label, val]) => val ? (
              <div key={label}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:9, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--color-text-tertiary)', marginBottom:3 }}>{label}</div>
                <div style={{ fontSize:14, color:'var(--color-text-primary)', padding:'9px 13px', background:'var(--color-gray-50)', borderRadius:7 }}>{val}</div>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      {/* Bank — read only */}
      {tab === 'bank' && (
        <div style={{ ...DS_CARD, padding:20, maxWidth:480 }}>
          <div style={{ padding:'10px 14px', background:'var(--color-amber-50)', border:'1px solid var(--color-amber-500)', borderRadius:8, marginBottom:18, fontSize:13, color:'var(--color-amber-500)' }}>
            Bank details are managed by HR. Contact your manager to update them.
          </div>
          {[['Bank Name','bank_name'],['Account Name','account_name'],['Sort Code','sort_code'],['Account Number','account_number']].map(([label, key]) => (
            <div key={key} style={{ marginBottom:14 }}>
              <FormLabel>{label}</FormLabel>
              <div style={{ padding:'9px 13px', background:'var(--color-gray-100)', borderRadius:7, fontSize:13, color: profile[key] ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontFamily: key==='sort_code'||key==='account_number' ? 'var(--font-mono)' : 'inherit' }}>
                {profile[key] || '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Documents */}
      {tab === 'docs' && (
        <div style={{ ...DS_CARD, overflow:'hidden' }}>
          {docs.length === 0 ? (
            <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No documents uploaded yet.<br/>Your manager will upload contracts and documents here.</div>
          ) : (
            <table className="ds-table">
              <thead><tr><th>Document</th><th>Type</th><th>Uploaded</th><th></th></tr></thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td><StatusBadge variant="info">{d.type}</StatusBadge></td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(d.created_at).toLocaleDateString('en-GB')}</td>
                    <td><Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => window.open(d.file_url, '_blank', 'noreferrer')}>View</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'sign_docs' && (
        <div style={{ ...DS_CARD, overflow:'hidden' }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--color-border)', display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:16, fontWeight:600, color:'var(--color-text-primary)' }}>Documents waiting for your agreement</div>
              <div style={{ fontSize:12.5, color:'var(--color-text-secondary)', marginTop:4 }}>These are separate from onboarding contracts. Review each one, then sign digitally when you agree.</div>
            </div>
            <span style={{ fontSize:11, color:'var(--color-text-tertiary)', fontFamily:'var(--font-mono)' }}>{signDocuments.filter((item) => item.status === 'awaiting_staff_signature').length} awaiting</span>
          </div>
          {signDocumentMessage ? (
            <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--color-border)', fontSize:12.5, color:signDocumentMessage.includes('successfully') ? 'var(--color-green-500)' : 'var(--color-text-secondary)' }}>
              {signDocumentMessage}
            </div>
          ) : null}
          {signDocuments.length === 0 ? (
            <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No sign-off documents have been sent to you yet.</div>
          ) : (
            <div style={{ display:'grid', gap:12, padding:12 }}>
              {signDocuments.map((documentRecord) => {
                const [statusLabel, statusTone] = getStaffSignDocumentStatusLabel(documentRecord.status)
                const renderedHtml = buildStaffSignDocumentBodyHtml(documentRecord)
                return (
                  <div key={documentRecord.id} style={{ ...DS_CARD, padding:16, display:'grid', gap:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'flex-start', flexWrap:'wrap' }}>
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ fontSize:15, fontWeight:600, color:'var(--color-text-primary)', marginBottom:4 }}>{documentRecord.title || documentRecord.document_type || 'Staff document'}</div>
                        <div style={{ fontSize:13, color:'var(--color-text-secondary)' }}>
                          {documentRecord.document_type || 'Staff document'} · issued {documentRecord.issued_at ? new Date(documentRecord.issued_at).toLocaleDateString('en-GB') : 'recently'}
                        </div>
                      </div>
                      <StatusBadge variant={TONE_TO_VARIANT[statusTone] || 'info'}>{statusLabel}</StatusBadge>
                    </div>
                    <div style={{ padding:'18px 20px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                      <div style={{ color:'var(--color-text-primary)', lineHeight:1.8, fontSize:14 }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderedHtml, {
                        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'span', 'div', 'table', 'tr', 'td', 'th', 'tbody', 'thead'],
                        ALLOWED_ATTR: ['style', 'class']
                      }) }} />
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:12 }}>
                      <div style={{ padding:'14px 16px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                        <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--color-text-tertiary)', marginBottom:8 }}>Issued by manager</div>
                        <div style={{ fontSize:15, fontWeight:600, color:'var(--color-text-primary)' }}>{documentRecord.manager_signature?.name || documentRecord.manager_name || 'Pending'}</div>
                        <div style={{ fontSize:12.5, color:'var(--color-text-secondary)', marginTop:4 }}>{documentRecord.manager_signature?.title || documentRecord.manager_title || 'Manager'}</div>
                        <div style={{ fontSize:11, color:'var(--color-text-tertiary)', fontFamily:'var(--font-mono)', marginTop:8 }}>
                          {documentRecord.manager_signed_at ? `Signed ${new Date(documentRecord.manager_signed_at).toLocaleString('en-GB')}` : 'Manager sign-off pending'}
                        </div>
                      </div>
                      <div style={{ padding:'14px 16px', background:'var(--color-gray-50)', border:'1px solid var(--color-border)', borderRadius:12 }}>
                        <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--color-text-tertiary)', marginBottom:8 }}>Your agreement</div>
                        <div style={{ fontSize:15, fontWeight:600, color:'var(--color-text-primary)' }}>{documentRecord.staff_signature?.name || profile.full_name || user?.name || 'Awaiting your signature'}</div>
                        <div style={{ fontSize:12.5, color:'var(--color-text-secondary)', marginTop:4 }}>{documentRecord.staff_signature?.title || 'Staff member'}</div>
                        <div style={{ fontSize:11, color:'var(--color-text-tertiary)', fontFamily:'var(--font-mono)', marginTop:8 }}>
                          {documentRecord.staff_signed_at ? `Signed ${new Date(documentRecord.staff_signed_at).toLocaleString('en-GB')}` : 'Not signed yet'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                      {documentRecord.reference_file_path || documentRecord.reference_file_url ? <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => openSignDocumentReferenceFile(documentRecord)}>Open attachment</Button> : null}
                      {documentRecord.final_document_path || documentRecord.final_document_url ? <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => openSignedSignDocumentFile(documentRecord)}>Open signed PDF</Button> : null}
                      {documentRecord.status === 'awaiting_staff_signature' ? (
                        <Button variant="primary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => signStaffDocument(documentRecord)} disabled={signingDocumentId === documentRecord.id}>
                          {signingDocumentId === documentRecord.id ? 'Signing...' : 'I agree and sign'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Payslips */}
      {tab === 'payslips' && (
        <div style={{ ...DS_CARD, overflow:'hidden' }}>
          {payslips.length === 0 ? (
            <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No payslips uploaded yet.</div>
          ) : (
            <table className="ds-table">
              <thead><tr><th>Period</th><th>Uploaded</th><th></th></tr></thead>
              <tbody>
                {payslips.map(p => (
                  <tr key={p.id}>
                    <td>{p.period}</td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(p.uploaded_at||p.created_at).toLocaleDateString('en-GB')}</td>
                    <td><Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => window.open(p.file_url, '_blank', 'noreferrer')}>Download</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
