import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { sendEmail, sendPacedEmailBroadcast } from '../utils/email'
import { logAction } from '../utils/audit'
import { clearAuditLogs } from '../utils/auditApi'
import { loadActivePortalStaffAudience } from '../utils/staffAudience'
import SubNav from '../components/SubNav'
import AnnouncementModal from '../components/AnnouncementModal'
import { toSlides } from '../utils/announcements'
import { Button, FormField, FormLabel, FormInput, FormSelect, StatusBadge, Alert } from '../components/ds'
import {
  buildEntraGroupCatalogKey,
  createEntraGroupSkeleton,
  fetchEntraDirectory,
  mergeEntraGroupCatalog,
} from '../utils/entraGroups'

const DS_CARD = { background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)' }
const EMPTY_WHATS_NEW_CARD = { tag:'', title:'', body:'' }
export default function Settings() {
  const { user, isAdmin, can } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab]     = useState('general')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [saved, setSaved]   = useState('')
  const [previousWhatsNew, setPreviousWhatsNew] = useState(null)
  const [entraGroups, setEntraGroups] = useState([])
  const [newGroupName, setNewGroupName] = useState('')
  const [entraDirectory, setEntraDirectory] = useState({ groups: [], licenses: [] })
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [directoryError, setDirectoryError] = useState('')
  const [pickedGroupId, setPickedGroupId] = useState('')
  const [showWhatsNewPopup, setShowWhatsNewPopup] = useState(false)
  const [whatsNew, setWhatsNew] = useState({
    active: false,
    version: '',
    title: 'What’s New',
    intro: '',
    cards: [{ ...EMPTY_WHATS_NEW_CARD }],
  })
  const [settings, setSettings] = useState({
    portal_name: 'DH Staff Portal',
    portal_tagline: 'DH Website Services',
    support_email: 'support@dhwebsiteservices.co.uk',
    from_name: 'DH Website Services',
    email_footer: '36B Coedpenmaen Road, Pontypridd, CF37 4LP',
    gocardless_key: '',
    gocardless_env: 'sandbox',
    notify_new_ticket: true,
    notify_new_client: true,
    notify_leave_request: true,
    notify_invoice_paid: true,
  })

  useEffect(() => {
    supabase.from('portal_settings').select('*').then(({ data }) => {
      if (!data) return
      const map = {}
      data.forEach(r => { map[r.key] = r.value?.value ?? r.value })
      setSettings(p => ({ ...p, ...map }))
      setEntraGroups(mergeEntraGroupCatalog(map[buildEntraGroupCatalogKey()] || []))
      if (map.whats_new_payload) {
        const nextPayload = {
          active: map.whats_new_payload.active === true,
          version: map.whats_new_payload.version || '',
          title: map.whats_new_payload.title || 'What’s New',
          intro: map.whats_new_payload.intro || '',
          cards: Array.isArray(map.whats_new_payload.cards) && map.whats_new_payload.cards.length ? map.whats_new_payload.cards : [{ ...EMPTY_WHATS_NEW_CARD }],
        }
        setWhatsNew(nextPayload)
        setPreviousWhatsNew(nextPayload)
      } else {
        // No release saved yet. Without a baseline the unsaved-changes warning
        // could never fire, so record the empty starting state as the baseline.
        setPreviousWhatsNew((current) => current ?? {
          active: false,
          version: '',
          title: 'What\u2019s New',
          intro: '',
          cards: [{ ...EMPTY_WHATS_NEW_CARD }],
        })
      }
    })
  }, [])

  const set = (k, v) => setSettings(p => ({ ...p, [k]: v }))
  // Removing a card only changed the form, and Save sits a long scroll below,
  // so edits were being lost on refresh with nothing on screen to warn you.
  const whatsNewDirty = previousWhatsNew !== null
    && JSON.stringify(whatsNew) !== JSON.stringify(previousWhatsNew)

  const save = async (section) => {
    setSaving(true)
    const keys = {
      general: ['portal_name','portal_tagline','support_email'],
      email:   ['from_name','email_footer'],
      payments:['gocardless_key','gocardless_env'],
      notifications:['notify_new_ticket','notify_new_client','notify_leave_request','notify_invoice_paid'],
    }[section] || Object.keys(settings)

    await Promise.all(keys.map(key =>
      supabase.from('portal_settings').upsert({ key, value: { value: settings[key] } }, { onConflict:'key' })
    ))
    setSaving(false); setSaved(section); setTimeout(() => setSaved(''), 3000)
  }

  const saveEntraGroups = async (nextGroups) => {
    const merged = mergeEntraGroupCatalog(nextGroups)
    setEntraGroups(merged)
    setSaving(true)
    await supabase.from('portal_settings').upsert({
      key: buildEntraGroupCatalogKey(),
      value: { value: merged },
    }, { onConflict: 'key' })
    setSaving(false)
    setSaved('entra_groups')
    setTimeout(() => setSaved(''), 3000)
  }

  const addEntraGroup = () => {
    if (!newGroupName.trim()) return
    saveEntraGroups([...entraGroups, createEntraGroupSkeleton(newGroupName)])
    setNewGroupName('')
  }

  // Pull the real group + licence list from Entra so groups are picked, not pasted.
  const loadEntraDirectory = async () => {
    setDirectoryLoading(true)
    setDirectoryError('')
    try {
      const result = await fetchEntraDirectory('all')
      setEntraDirectory({ groups: result?.groups || [], licenses: result?.licenses || [] })
    } catch (err) {
      setDirectoryError(err?.message || 'Could not load groups from Entra.')
    } finally {
      setDirectoryLoading(false)
    }
  }

  const addPickedEntraGroup = () => {
    const picked = entraDirectory.groups.find((g) => g.id === pickedGroupId)
    if (!picked) return
    saveEntraGroups([...entraGroups, { ...createEntraGroupSkeleton(picked.name), group_id: picked.id }])
    setPickedGroupId('')
  }

  const updateEntraGroup = (id, patch) => {
    saveEntraGroups(entraGroups.map((g) => g.id === id ? { ...g, ...patch, updated_at: new Date().toISOString() } : g))
  }

  const removeEntraGroup = (group) => {
    if (!window.confirm(`Remove "${group.name}" from the group list? This does not delete the group in Entra.`)) return
    saveEntraGroups(entraGroups.filter((g) => g.id !== group.id))
  }

  const updateWhatsNewCard = (index, key, value) => {
    setWhatsNew((current) => ({
      ...current,
      cards: current.cards.map((card, cardIndex) => cardIndex === index ? { ...card, [key]: value } : card),
    }))
  }

  const addWhatsNewCard = () => {
    setWhatsNew((current) => ({ ...current, cards: [...current.cards, { ...EMPTY_WHATS_NEW_CARD }] }))
  }

  const removeWhatsNewCard = (index) => {
    setWhatsNew((current) => ({
      ...current,
      cards: current.cards.length > 1 ? current.cards.filter((_, cardIndex) => cardIndex !== index) : [{ ...EMPTY_WHATS_NEW_CARD }],
    }))
  }

  const saveWhatsNew = async () => {
    setSaving(true)
    const nextPayload = {
      ...whatsNew,
      cards: whatsNew.cards.filter((card) => card.title || card.body || card.tag),
    }
    await supabase.from('portal_settings').upsert({
      key: 'whats_new_payload',
      value: {
        value: nextPayload,
      },
    }, { onConflict:'key' })

    const shouldEmailRelease = nextPayload.active && (
      !previousWhatsNew?.active
      || String(previousWhatsNew?.version || '').trim() !== String(nextPayload.version || '').trim()
      || JSON.stringify(previousWhatsNew?.cards || []) !== JSON.stringify(nextPayload.cards || [])
      || String(previousWhatsNew?.intro || '').trim() !== String(nextPayload.intro || '').trim()
    )

    if (shouldEmailRelease) {
      try {
        const recipients = await loadActivePortalStaffAudience()

        const subject = `${nextPayload.title || 'What’s New'}${nextPayload.version ? ` — v${nextPayload.version}` : ''}`
        const cardsHtml = nextPayload.cards.map((card) => `
          <div style="padding:14px 16px;border:1px solid #e5e5e5;border-radius:12px;background:#fafafa;margin-bottom:12px;">
            ${card.tag ? `<div style="display:inline-block;padding:4px 8px;border-radius:999px;background:#eef4ff;color:#1d4ed8;font-size:11px;font-weight:600;margin-bottom:8px;">${card.tag}</div>` : ''}
            <div style="font-size:16px;font-weight:700;color:#1d1d1f;margin-bottom:6px;">${card.title || 'Update'}</div>
            <div style="font-size:13px;line-height:1.7;color:#555;">${card.body || ''}</div>
          </div>
        `).join('')

        await sendPacedEmailBroadcast(recipients, (recipient) => sendEmail('send_email', {
          to: recipient.email,
          to_name: recipient.name,
          subject,
          html: `
            <p>Hi ${recipient.name || 'there'},</p>
            <p>${nextPayload.intro || 'There are new updates available in the DH Workplace staff portal.'}</p>
            ${cardsHtml}
            <p><a href="https://staff.dhwebsiteservices.co.uk" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open DH Workplace</a></p>
          `,
          sent_by: user?.name || 'System',
          from_email: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
          log_outreach: false,
        }))
      } catch (error) {
        console.error('Whats new email send failed:', error)
      }
    }

    setPreviousWhatsNew(nextPayload)
    setSaving(false)
    setSaved('experience')
    setTimeout(() => setSaved(''), 3000)
  }

  const SaveBtn = ({ section }) => (
    <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:20 }}>
      <Button variant="primary" onClick={() => save(section)} disabled={saving}>{saving?'Saving...':'Save Changes'}</Button>
      {saved === section && <span style={{ fontSize:13, color:'var(--color-green-500)' }}>✓ Saved</span>}
    </div>
  )

  const requireReason = (label) => {
    const reason = window.prompt(`Add a short reason for this ${label.toLowerCase()}:`)
    return String(reason || '').trim()
  }

  const clearOldAuditLogs = async () => {
    if (!isAdmin) return
    if (!window.confirm('Clear old audit logs? This cannot be undone.')) return
    const reason = requireReason('audit log deletion')
    if (!reason) return
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString()
    await clearAuditLogs(cutoff)
    await logAction(user?.email, user?.name, 'audit_log_cleared', 'audit_log', null, { cutoff, reason })
    setSuccess('Settings saved')
  }

  const exportPortalData = async () => {
    if (!isAdmin) return
    const reason = requireReason('data export')
    if (!reason) return
    const [{ data: clients }, { data: outreach }, { data: staff }] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('outreach').select('*'),
      supabase.from('hr_profiles').select('*'),
    ])
    const generatedAt = new Date().toISOString()
    const blob = new Blob([JSON.stringify({ generated_at: generatedAt, clients, outreach, staff }, null, 2)], { type:'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `dh-portal-export-${generatedAt.split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(link.href)
    await logAction(user?.email, user?.name, 'portal_data_exported', 'portal_data', null, {
      reason,
      generated_at: generatedAt,
      datasets: ['clients', 'outreach', 'hr_profiles'],
    })
  }

  const Field = ({ label, k, type='text', placeholder='' }) => (
    <FormField>
      <FormLabel>{label}</FormLabel>
      <FormInput type={type} value={settings[k]||''} onChange={e => set(k, e.target.value)} placeholder={placeholder}/>
    </FormField>
  )

  const Toggle = ({ label, desc, k }) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid var(--color-border)' }}>
      <div>
        <div style={{ fontSize:13, fontWeight:500 }}>{label}</div>
        {desc && <div style={{ fontSize:12, color:'var(--color-text-tertiary)', marginTop:2 }}>{desc}</div>}
      </div>
      <button onClick={() => set(k, !settings[k])} style={{ width:40, height:22, borderRadius:11, background: settings[k] ? 'var(--color-green-500)' : 'var(--color-border)', border:'none', cursor:'pointer', position:'relative', flexShrink:0 }}>
        <div style={{ position:'absolute', top:2, left: settings[k] ? 20 : 2, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
      </button>
    </div>
  )

  return (
    <div className="ds-content">
      <div className="ds-page-header"><div><h1>Settings</h1></div></div>

      <SubNav items={[
        { label: 'Portal Settings', active: true, onClick: () => {} },
        can('departments') && { label: 'Departments', onClick: () => navigate('/departments') },
        can('service_admin') && { label: 'Service Admin', onClick: () => navigate('/service-admin') },
        can('safeguards') && { label: 'Admin Safeguards', onClick: () => navigate('/admin-safeguards') },
        can('mailinglist') && { label: 'Mailing List', onClick: () => navigate('/mailing-list') },
        can('banners') && { label: 'Banners', onClick: () => navigate('/banners') },
        can('emailtemplates') && { label: 'Email Templates', onClick: () => navigate('/email-templates') },
        can('maintenance') && { label: 'Maintenance', onClick: () => navigate('/maintenance') },
        can('audit') && { label: 'Audit Log', onClick: () => navigate('/audit') },
      ]} />

      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {[['general','General'],['email','Email'],['payments','Payments'],['notifications','Notifications'],['experience','Experience'],['entra_groups','Entra Groups'],['danger','Danger Zone']].map(([k,l]) => (
          <Button key={k} onClick={() => setTab(k)} variant={tab===k ? 'primary' : 'secondary'} style={{ height:30, fontSize:12, padding:'0 10px' }}>{l}</Button>
        ))}
      </div>

      {tab === 'general' && (
        <div style={{ ...DS_CARD, padding:20, maxWidth:520 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <Field label="Portal Name" k="portal_name" placeholder="DH Staff Portal"/>
            <Field label="Portal Tagline" k="portal_tagline" placeholder="DH Website Services"/>
            <Field label="Support Email" k="support_email" type="email" placeholder="support@dhwebsiteservices.co.uk"/>
          </div>
          <SaveBtn section="general"/>
        </div>
      )}

      {showWhatsNewPopup && (
        <AnnouncementModal
          slides={toSlides(whatsNew)}
          onDismiss={() => setShowWhatsNewPopup(false)}
          onDontShowAgain={() => setShowWhatsNewPopup(false)}
        />
      )}

      {tab === 'entra_groups' && (
        <div style={{ ...DS_CARD, padding:20, maxWidth:860 }}>
          <div style={{ fontSize:15, fontWeight:600, color:'var(--color-text-primary)' }}>Entra security groups</div>
          <div style={{ fontSize:13, color:'var(--color-text-secondary)', marginTop:6, lineHeight:1.6, marginBottom:16 }}>
            New starters are added to these groups when their Microsoft 365 account is created.
            Mark a group <strong>Automatic</strong> to add every starter to it, or leave it off to make it
            a tick-box on the new starter form.
          </div>

          {directoryError && (
            <div style={{ marginBottom:16 }}>
              <Alert variant="warning">{directoryError}</Alert>
            </div>
          )}

          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
            {entraDirectory.groups.length > 0 ? (
              <>
                <FormSelect
                  value={pickedGroupId}
                  onChange={(e) => setPickedGroupId(e.target.value)}
                  style={{ flex:1, minWidth:260 }}
                >
                  <option value="">Select a group to add…</option>
                  {entraDirectory.groups
                    .filter((group) => !entraGroups.some((existing) => existing.group_id === group.id))
                    .map((group) => (
                      <option key={group.id} value={group.id}>{group.name} — {group.type}</option>
                    ))}
                </FormSelect>
                <Button variant="primary" onClick={addPickedEntraGroup} disabled={saving || !pickedGroupId}>+ Add group</Button>
              </>
            ) : (
              <>
                <FormInput
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addEntraGroup()}
                  placeholder="Group name (e.g. All Users)"
                  style={{ flex:1, minWidth:220 }}
                />
                <Button variant="primary" onClick={addEntraGroup} disabled={saving || !newGroupName.trim()}>+ Add group</Button>
              </>
            )}
            <Button variant="secondary" onClick={loadEntraDirectory} disabled={directoryLoading}>
              {directoryLoading ? 'Loading…' : 'Load groups from Entra'}
            </Button>
            {saved === 'entra_groups' && <span style={{ fontSize:13, color:'var(--color-green-500)', alignSelf:'center' }}>✓ Saved</span>}
          </div>

          {entraGroups.length === 0 ? (
            <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>
              No groups configured yet. Add the ones every new starter should join.
            </div>
          ) : (
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th style={{ width:'34%' }}>Entra Object ID</th>
                  <th style={{ width:'14%' }}>Assignment</th>
                  <th style={{ width:'10%' }}>Active</th>
                  <th style={{ width:'8%' }}></th>
                </tr>
              </thead>
              <tbody>
                {entraGroups.map((group) => (
                  <tr key={group.id}>
                    <td>
                      <FormInput
                        value={group.name}
                        onChange={(e) => setEntraGroups((cur) => cur.map((g) => g.id === group.id ? { ...g, name: e.target.value } : g))}
                        onBlur={(e) => updateEntraGroup(group.id, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      {group.group_id ? (
                        <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--color-text-tertiary)' }}>
                          {group.group_id}
                        </span>
                      ) : (
                        <FormInput
                          value={group.group_id}
                          onChange={(e) => setEntraGroups((cur) => cur.map((g) => g.id === group.id ? { ...g, group_id: e.target.value } : g))}
                          onBlur={(e) => updateEntraGroup(group.id, { group_id: e.target.value.trim() })}
                          placeholder="00000000-0000-0000-0000-000000000000"
                          style={{ fontFamily:'var(--font-mono)', fontSize:12 }}
                        />
                      )}
                    </td>
                    <td>
                      <Button
                        variant={group.auto_assign ? 'primary' : 'secondary'}
                        style={{ height:28, fontSize:12, padding:'0 8px' }}
                        onClick={() => updateEntraGroup(group.id, { auto_assign: !group.auto_assign })}
                        disabled={saving}
                      >
                        {group.auto_assign ? 'Automatic' : 'Optional'}
                      </Button>
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        style={{ height:28, fontSize:12, padding:'0 8px' }}
                        onClick={() => updateEntraGroup(group.id, { active: !group.active })}
                        disabled={saving}
                      >
                        {group.active ? 'Active' : 'Off'}
                      </Button>
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        style={{ height:28, fontSize:12, padding:'0 8px', color:'var(--color-red-500)' }}
                        onClick={() => removeEntraGroup(group)}
                        disabled={saving}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'email' && (
        <div style={{ ...DS_CARD, padding:20, maxWidth:520 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <Field label="From Name" k="from_name" placeholder="DH Website Services"/>
            <FormField>
              <FormLabel>Email Footer Text</FormLabel>
              <textarea className="ds-form-input" rows={3} value={settings.email_footer||''} onChange={e => set('email_footer',e.target.value)} style={{ resize:'vertical', padding:'8px 12px' }} placeholder="Company address shown in email footers"/>
            </FormField>
            <div style={{ padding:'12px 14px', background:'var(--color-gray-50)', borderRadius:8, fontSize:13, color:'var(--color-text-secondary)' }}>
              Emails are sent via your Cloudflare Worker. Make sure the worker is deployed and has your email provider credentials set.
            </div>
          </div>
          <SaveBtn section="email"/>
        </div>
      )}

      {tab === 'payments' && (
        <div style={{ ...DS_CARD, padding:20, maxWidth:520 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ padding:'12px 14px', background:'var(--color-blue-50)', border:'1px solid var(--color-blue-500)', borderRadius:8, fontSize:13, color:'var(--color-blue-500)' }}>
              GoCardless API keys are used to set up Direct Debit mandates and collect payments from clients automatically.
            </div>
            <FormField><FormLabel>Environment</FormLabel>
              <div style={{ display:'flex', gap:8 }}>
                {[['sandbox','Sandbox (Testing)'],['live','Live (Production)']].map(([v,l]) => (
                  <button key={v} onClick={() => set('gocardless_env',v)} style={{ flex:1, padding:'10px', borderRadius:7, border:`2px solid ${settings.gocardless_env===v?'var(--color-primary)':'var(--color-border)'}`, background: settings.gocardless_env===v ? 'var(--color-blue-50)' : 'transparent', cursor:'pointer', fontSize:13, fontWeight:500, color: settings.gocardless_env===v ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>{l}</button>
                ))}
              </div>
            </FormField>
            <FormField>
              <FormLabel>GoCardless API Key</FormLabel>
              <FormInput type="password" value={settings.gocardless_key||''} onChange={e => set('gocardless_key',e.target.value)} placeholder="live_..."/>
              <div style={{ fontSize:11, color:'var(--color-text-tertiary)', marginTop:5 }}>Get your API key from GoCardless Dashboard → Developers → API Keys</div>
            </FormField>
            {settings.gocardless_env === 'live' && (
              <div style={{ padding:'10px 14px', background:'var(--color-amber-50)', border:'1px solid var(--color-amber-500)', borderRadius:7, fontSize:13, color:'var(--color-amber-500)' }}>
                ⚠️ Live mode — real money will be collected from clients
              </div>
            )}
          </div>
          <SaveBtn section="payments"/>
        </div>
      )}

      {tab === 'notifications' && (
        <div style={{ ...DS_CARD, padding:20, maxWidth:520 }}>
          <div>
            <Toggle label="New support ticket" desc="Notify when a client submits a support ticket" k="notify_new_ticket"/>
            <Toggle label="New client added" desc="Notify when a new client is onboarded" k="notify_new_client"/>
            <Toggle label="Leave request submitted" desc="Notify managers when staff request leave" k="notify_leave_request"/>
            <Toggle label="Invoice paid" desc="Notify when a client pays an invoice" k="notify_invoice_paid"/>
          </div>
          <SaveBtn section="notifications"/>
        </div>
      )}

      {tab === 'experience' && (
        <>
        {whatsNewDirty && (
          <div style={{
            position:'sticky', top:0, zIndex:20, marginBottom:12,
            display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
            padding:'10px 14px', borderRadius:'var(--border-radius-lg)',
            background:'var(--color-amber-50, #FFF7E6)', border:'1px solid var(--color-amber-200, #FFE0A3)',
          }}>
            <span style={{ fontSize:13, color:'var(--color-text-primary)' }}>
              You have unsaved changes to the What’s New popup.
            </span>
            <div style={{ flex:1 }} />
            <Button variant="secondary" style={{ height:28, fontSize:12 }} onClick={() => setWhatsNew(previousWhatsNew)}>Discard</Button>
            <Button variant="primary" style={{ height:28, fontSize:12 }} onClick={saveWhatsNew} disabled={saving}>
              {saving ? 'Saving…' : 'Save now'}
            </Button>
          </div>
        )}
        <div style={{ display:'grid', gap:18, maxWidth:860 }}>
          <div style={{ ...DS_CARD, padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:18, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:16, fontWeight:600, color:'var(--color-text-primary)' }}>What’s New popup</div>
                <div style={{ fontSize:13, color:'var(--color-text-secondary)', marginTop:6, lineHeight:1.6, maxWidth:560 }}>
                  This is the popup staff see after signing in. Write the cards here, preview it below,
                  then save to publish. Each person sees a given version once; change the version to
                  show it again to everyone.
                </div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <button onClick={() => setWhatsNew((current) => ({ ...current, active: !current.active }))} style={{ width:40, height:22, borderRadius:11, background: whatsNew.active ? 'var(--color-green-500)' : 'var(--color-border)', border:'none', cursor:'pointer', position:'relative', flexShrink:0 }}>
                  <div style={{ position:'absolute', top:2, left: whatsNew.active ? 20 : 2, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                </button>
                <span style={{ fontSize:12, color: whatsNew.active ? 'var(--color-green-500)' : 'var(--color-text-tertiary)', fontWeight:600 }}>
                  {whatsNew.active ? 'Live' : 'Off'}
                </span>
              </div>
            </div>

            <div style={{ display:'grid', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16 }}>
                <FormField><FormLabel>Version</FormLabel><FormInput value={whatsNew.version} onChange={e => setWhatsNew((current) => ({ ...current, version: e.target.value }))} placeholder="e.g. 2.4.0" /></FormField>
                <FormField><FormLabel>Title</FormLabel><FormInput value={whatsNew.title} onChange={e => setWhatsNew((current) => ({ ...current, title: e.target.value }))} placeholder="What’s New in DH Portal" /></FormField>
              </div>
              <FormField>
                <FormLabel>Intro</FormLabel>
                <textarea className="ds-form-input" rows={3} value={whatsNew.intro} onChange={e => setWhatsNew((current) => ({ ...current, intro: e.target.value }))} style={{ resize:'vertical', padding:'8px 12px' }} placeholder="Short introduction shown above the cards" />
              </FormField>
            </div>
          </div>

          <div style={{ ...DS_CARD, padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:16, fontWeight:600, color:'var(--color-text-primary)' }}>Update cards</div>
                <div style={{ fontSize:13, color:'var(--color-text-secondary)', marginTop:6 }}>Add as many cards as you need for new features, changes, or improvements.</div>
              </div>
              <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={addWhatsNewCard}>Add card</Button>
            </div>

            <div style={{ display:'grid', gap:14 }}>
              {whatsNew.cards.map((card, index) => (
                <div key={`whats-new-card-${index}`} style={{ padding:'14px', border:'1px solid var(--color-border)', borderRadius:12, background:'var(--color-gray-50)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:12 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text-primary)' }}>Card {index + 1}</div>
                    <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px', color:'var(--color-red-500)' }} onClick={() => removeWhatsNewCard(index)}>Remove</Button>
                  </div>
                  <div style={{ display:'grid', gap:12 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16 }}>
                      <FormField><FormLabel>Tag</FormLabel><FormInput value={card.tag || ''} onChange={e => updateWhatsNewCard(index, 'tag', e.target.value)} placeholder="e.g. New, Improved" /></FormField>
                      <FormField><FormLabel>Title</FormLabel><FormInput value={card.title || ''} onChange={e => updateWhatsNewCard(index, 'title', e.target.value)} placeholder="What changed?" /></FormField>
                    </div>
                    <FormField>
                      <FormLabel>Body</FormLabel>
                      <textarea className="ds-form-input" rows={4} value={card.body || ''} onChange={e => updateWhatsNewCard(index, 'body', e.target.value)} style={{ resize:'vertical', padding:'8px 12px' }} placeholder="Short explanation of the update" />
                    </FormField>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...DS_CARD, padding:20 }}>
            <div style={{ fontSize:16, fontWeight:600, color:'var(--color-text-primary)', marginBottom:4 }}>Preview</div>
            <div style={{ fontSize:12.5, color:'var(--color-text-secondary)', marginBottom:14, lineHeight:1.6 }}>
              Opens the popup exactly as staff will see it, with whatever is typed above. Nothing is
              sent or saved by previewing.
            </div>

            <Button variant="secondary" onClick={() => setShowWhatsNewPopup(true)}>
              Preview the popup
            </Button>

            <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:20, paddingTop:20, borderTop:'1px solid var(--color-border)' }}>
              <Button variant="primary" onClick={saveWhatsNew} disabled={saving}>{saving ? 'Saving...' : 'Save What’s New'}</Button>
              {saved === 'experience' && <span style={{ fontSize:13, color:'var(--color-green-500)' }}>✓ Saved</span>}
              <span style={{ fontSize:12, color:'var(--color-text-tertiary)' }}>
                Saving publishes to staff. Each person sees a version once.
              </span>
            </div>
          </div>
          </div>
        </>
      )}

      {tab === 'danger' && (
        <div style={{ ...DS_CARD, padding:20, maxWidth:520, border:'2px solid var(--color-red-500)' }}>
          <div style={{ fontSize:16, fontWeight:600, color:'var(--color-red-500)', marginBottom:16 }}>⚠️ Danger Zone</div>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ padding:'14px', borderRadius:8, border:'1px solid var(--color-border)' }}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>Clear Audit Log</div>
              <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginBottom:10 }}>Permanently delete all audit log entries older than 90 days.</div>
              <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px', color:'var(--color-red-500)' }} onClick={clearOldAuditLogs} disabled={!isAdmin}>Clear Old Logs</Button>
            </div>
            <div style={{ padding:'14px', borderRadius:8, border:'1px solid var(--color-border)' }}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>Export All Data</div>
              <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginBottom:10 }}>Download a full export of portal data as JSON.</div>
              <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={exportPortalData} disabled={!isAdmin}>Export JSON</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
