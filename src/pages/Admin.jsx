import { useMobile } from '../hooks/useMobile'
import { useState, useEffect } from 'react'
import { Shield, Users, RefreshCw, Phone, MapPin, FileText, Star, Pencil, Lock, Unlock, AlertCircle } from 'lucide-react'
import { Card, Btn, Modal, Input } from '../components/UI'
import { useMsal } from '@azure/msal-react'
import { supabase } from '../utils/supabase'

const ALL_PAGES = [
  { key: 'dashboard',      label: 'Dashboard'            },
  { key: 'outreach',       label: 'Clients Contacted'    },
  { key: 'clients',        label: 'Onboarded Clients'    },
  { key: 'clientmgmt',     label: 'Client Portal Mgmt'   },
  { key: 'support',        label: 'Support Tickets'      },
  { key: 'staff',          label: 'Staff & Commissions'  },
  { key: 'competitor',     label: 'Competitor Lookup'    },
  { key: 'domains',        label: 'Domain Checker'       },
  { key: 'proposals',      label: 'Proposal Builder'     },
  { key: 'social',         label: 'Social Media'         },
  { key: 'reports',        label: 'Reports'              },
  { key: 'banners',        label: 'Banners & Popups'     },
  { key: 'emailtemplates', label: 'Email Templates'      },
  { key: 'audit',          label: 'Audit & Sessions'     },
  { key: 'admin',          label: 'User Accounts'        },
  { key: 'sendemail',      label: 'Send Email'           },
  { key: 'tasks',          label: 'Manage Tasks'         },
  { key: 'mytasks',        label: 'My Tasks'             },
  { key: 'schedule',       label: 'Schedule'             },
  { key: 'hr_leave',       label: 'HR — Leave'           },
  { key: 'hr_payslips',    label: 'HR — Payslips'        },
  { key: 'hr_profiles',    label: 'HR — Profiles'        },
  { key: 'hr_policies',    label: 'HR — Policies'        },
  { key: 'hr_timesheet',   label: 'HR — Timesheet'       },
  { key: 'maintenance',    label: 'Maintenance'          },
  { key: 'settings',       label: 'Settings'             },
]

const ROLE_DEFAULTS = {
  Administrator: { dashboard: true, outreach: true, clients: true, clientmgmt: true, support: true, staff: true, competitor: true, domains: true, proposals: true, social: true, reports: true, banners: true, emailtemplates: true, audit: true, admin: true, sendemail: true, tasks: true, tasks: true, mytasks: true, schedule: true, hr_onboarding: true, hr_leave: true, hr_payslips: true, hr_profiles: true, hr_policies: true, hr_timesheet: true, maintenance: true, settings: true },
  Staff:         { dashboard: true, outreach: true, clients: true, clientmgmt: true, support: true, staff: false, competitor: true, domains: true, proposals: true, social: true, reports: false, banners: false, emailtemplates: false, audit: false, admin: false, sendemail: true, tasks: true, tasks: true, mytasks: true, schedule: true, hr_onboarding: true, hr_leave: true, hr_payslips: true, hr_profiles: true, hr_policies: true, hr_timesheet: true, maintenance: false, settings: false },
  ReadOnly:      { dashboard: true, outreach: true, clients: false, clientmgmt: false, support: false, staff: false, competitor: false, domains: false, proposals: false, social: false, reports: false, banners: false, emailtemplates: false, audit: false, admin: false, sendemail: false, tasks: false, tasks: false, mytasks: true, schedule: true, hr_onboarding: true, hr_leave: true, hr_payslips: true, hr_profiles: true, hr_policies: true, hr_timesheet: true, maintenance: false, settings: false },
}

const emptyProfile = { phone: '', location: '', department: '', start_date: '', bio: '', skills: '', emergency_contact: '', emergency_phone: '', notes: '' }

export default function Admin() {
  const isMobile = useMobile()
  const { instance, accounts } = useMsal()
  const [users, setUsers]         = useState([])
  const [profiles, setProfiles]   = useState({})
  const [portalPerms, setPortalPerms] = useState({})
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [modal, setModal]         = useState(null)
  const [selected, setSelected]   = useState(null)
  const [editPerms, setEditPerms] = useState({})
  const [editProfile, setEditProfile] = useState({ ...emptyProfile })
  const [profileTab, setProfileTab] = useState('info')
  const [saving, setSaving]       = useState(false)

  useEffect(() => { fetchUsers() }, [])

  const getToken = async () => {
    const account = accounts[0]
    try {
      return (await instance.acquireTokenSilent({ scopes: ['https://graph.microsoft.com/Directory.Read.All'], account })).accessToken
    } catch {
      return (await instance.acquireTokenPopup({ scopes: ['https://graph.microsoft.com/Directory.Read.All'], account })).accessToken
    }
  }

  const fetchUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const usersRes = await fetch('https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,jobTitle,mail&$top=50', { headers: { Authorization: `Bearer ${token}` } })
      const usersData = await usersRes.json()

      const enriched = (usersData.value || []).map(u => ({
        ...u, roles: [], email: u.userPrincipalName, name: u.displayName,
      }))
      setUsers(enriched)

      const [{ data: permsData }, { data: profilesData }] = await Promise.all([
        supabase.from('user_permissions').select('*'),
        supabase.from('staff_profiles').select('*'),
      ])
      const permsMap = {}
      ;(permsData || []).forEach(p => { permsMap[p.user_email] = p.permissions })
      setPortalPerms(permsMap)
      const profMap = {}
      ;(profilesData || []).forEach(p => { profMap[p.user_email] = p })
      setProfiles(profMap)
    } catch (err) {
      setError(err.message || 'Failed to load users')
    }
    setLoading(false)
  }

  const openProfile = (user) => {
    setSelected(user)
    setEditProfile({ ...emptyProfile, ...(profiles[user.email] || {}) })
    const existing = portalPerms[user.email]
    const defaultRole = user.roles?.includes('Administrator') ? 'Administrator' : 'Staff'
    setEditPerms(existing || { ...ROLE_DEFAULTS[defaultRole] })
    setProfileTab('info')
    setModal('profile')
  }

  const save = async () => {
    setSaving(true)
    const email = selected.email?.toLowerCase()

    // staff_profiles upsert
    await supabase.from('staff_profiles').upsert({
      user_email: selected.email, user_name: selected.name,
      ...editProfile, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_email' })

    // permissions — manual match to avoid case/constraint issues
    const { data: allP } = await supabase.from('user_permissions').select('id, user_email')
    const found = (allP || []).find(r => r.user_email?.toLowerCase() === email)
    if (found?.id) {
      await supabase.from('user_permissions').update({
        permissions: editPerms, updated_by: accounts[0]?.username, updated_at: new Date().toISOString(),
      }).eq('id', found.id)
    } else {
      await supabase.from('user_permissions').insert([{
        user_email: email, permissions: editPerms,
        updated_by: accounts[0]?.username, updated_at: new Date().toISOString(),
      }])
    }

    setProfiles(p => ({ ...p, [selected.email]: { ...editProfile, user_email: selected.email } }))
    setPortalPerms(p => ({ ...p, [selected.email]: editPerms }))
    setSaving(false)
    setModal(null)
  }

  const togglePerm = (key) => setEditPerms(p => ({ ...p, [key]: !p[key] }))
  const updateP = (k, v) => setEditProfile(p => ({ ...p, [k]: v }))

  const roleColor = { Staff: 'var(--green)', Administrator: 'var(--gold)', Client: 'var(--amber)' }

  const TABS = [
    { key: 'info',        label: 'Profile Info'   },
    { key: 'notes',       label: 'Notes'          },
    { key: 'permissions', label: 'Permissions'    },
  ]

  return (
    <div className="animate-fade">
      <div className="card" style={{ padding: '24px 24px 20px', marginBottom: 18, background: 'linear-gradient(135deg, var(--card-strong) 0%, rgba(190,122,23,0.08) 100%)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 10 }}>Admin Workspace</div>
        <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title">Permissions and Staff Accounts</h1>
            <p style={{ fontSize: 14, color: 'var(--sub)', marginTop: 10, maxWidth: 660 }}>
              Manage staff records, page access, and profile metadata from the platform control area.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="badge badge-grey">{users.length} visible users</div>
            <div className="badge badge-gold">{Object.keys(portalPerms).length} permission sets</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-ghost btn-sm" onClick={fetchUsers}><RefreshCw size={12}/>Refresh</button>
      </div>

      {error && (
        <div style={{ padding: '14px 18px', background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: '10px', color: 'var(--red)', fontSize: '13px', marginBottom: '16px', display: 'flex', gap: '8px' }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>Could not load Azure users: {error}. Showing users from Supabase only.</span>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--sub)' }}>Loading users…</div>
        ) : users.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--sub)' }}>No users found</div>
        ) : users.map((user, i) => {
          const profile = profiles[user.email]
          const perms   = portalPerms[user.email]
          const accessCount = perms ? Object.values(perms).filter(Boolean).length : ALL_PAGES.length
          return (
            <div key={user.id} style={{
              padding: '16px 20px', borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none',
              display: 'flex', alignItems: 'center', gap: '14px',
            }}>
              {/* Avatar */}
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {user.name?.charAt(0)}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{user.name}</span>
                  {user.roles?.map(r => (
                    <span key={r} style={{ fontSize: '11px', padding: '1px 8px', borderRadius: '100px', fontWeight: 600, background: `${roleColor[r] || 'var(--sub)'}20`, color: roleColor[r] || 'var(--sub)' }}>{r}</span>
                  ))}
                  {user.jobTitle && <span style={{ fontSize: '11.5px', color: 'var(--sub)' }}>{user.jobTitle}</span>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--sub)', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                  <span>{user.email}</span>
                  {profile?.phone && <span>📞 {profile.phone}</span>}
                  {profile?.location && <span>📍 {profile.location}</span>}
                  {profile?.department && <span>🏢 {profile.department}</span>}
                </div>
                {profile?.bio && (
                  <div style={{ fontSize: '12px', color: 'var(--faint)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '500px' }}>{profile.bio}</div>
                )}
              </div>

              {/* Access count */}
              <div style={{ textAlign: 'center', padding: '6px 12px', background: 'var(--bg2)', borderRadius: '8px', flexShrink: 0 }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--gold)' }}>{accessCount}</div>
                <div style={{ fontSize: '10px', color: 'var(--sub)' }}>pages</div>
              </div>

              {/* Edit button */}
              <button className="btn btn-ghost btn-sm" onClick={() => openProfile(user)}><Pencil size={13}/>Edit Profile</button>
            </div>
          )
        })}
      </div>

      {/* Profile Modal */}
      {(modal === 'profile') && (<div className="modal-backdrop" onClick={() => setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><span className="modal-title">{selected?.name}</span><button onClick={() => setModal(null)} style={{background:"none",border:"none",color:"var(--faint)",cursor:"pointer",fontSize:20,lineHeight:1}}>×</button></div><div className="modal-body">
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setProfileTab(t.key)} style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13.5px', fontWeight: profileTab === t.key ? 700 : 400,
              color: profileTab === t.key ? 'var(--gold)' : 'var(--sub)',
              borderBottom: `2px solid ${profileTab === t.key ? 'var(--gold)' : 'transparent'}`,
              marginBottom: '-1px',
            }}>{t.label}</button>
          ))}
        </div>

        {profileTab === 'info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <Input label="Phone" value={editProfile.phone} onChange={e => updateP('phone', e.target.value)} placeholder="07700 000000" />
              <Input label="Location" value={editProfile.location} onChange={e => updateP('location', e.target.value)} placeholder="Cardiff, Wales" />
              <Input label="Department" value={editProfile.department} onChange={e => updateP('department', e.target.value)} placeholder="Sales, Design, Dev…" />
              <Input label="Start Date" value={editProfile.start_date} onChange={e => updateP('start_date', e.target.value)} type="date" />
              <Input label="Emergency Contact" value={editProfile.emergency_contact} onChange={e => updateP('emergency_contact', e.target.value)} placeholder="Name" />
              <Input label="Emergency Phone" value={editProfile.emergency_phone} onChange={e => updateP('emergency_phone', e.target.value)} placeholder="07700 000000" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', color: 'var(--sub)', fontWeight: 600 }}>Bio / About</label>
              <textarea value={editProfile.bio} onChange={e => updateP('bio', e.target.value)} rows={3} placeholder="Brief description of their role and background…"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '9px', padding: '10px 14px', color: 'var(--text)', fontSize: '13.5px', resize: 'vertical', lineHeight: 1.6 }}
                onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', color: 'var(--sub)', fontWeight: 600 }}>Skills / Specialisms</label>
              <input value={editProfile.skills} onChange={e => updateP('skills', e.target.value)} placeholder="e.g. WordPress, SEO, Client Relations, Design"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '9px', padding: '10px 14px', color: 'var(--text)', fontSize: '13.5px' }}
                onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
          </div>
        )}

        {profileTab === 'notes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', color: 'var(--sub)', fontWeight: 600 }}>Internal Notes</label>
            <p style={{ fontSize: '12px', color: 'var(--faint)', marginBottom: '4px' }}>Private notes about this team member — only visible to admins</p>
            <textarea value={editProfile.notes} onChange={e => updateP('notes', e.target.value)} rows={10}
              placeholder="Performance notes, training records, access history, anything relevant…"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '9px', padding: '10px 14px', color: 'var(--text)', fontSize: '13.5px', resize: 'vertical', lineHeight: 1.6 }}
              onFocus={e => e.target.style.borderColor = 'var(--gold)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
        )}

        {profileTab === 'permissions' && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {['Administrator', 'Staff', 'ReadOnly'].map(role => (
                <button key={role} onClick={() => setEditPerms({ ...ROLE_DEFAULTS[role] })} style={{
                  padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                  background: 'var(--bg2)', color: 'var(--sub)', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer',
                }}>Reset to {role}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px' }}>
              {ALL_PAGES.map(({ key, label }) => (
                <button key={key} onClick={() => togglePerm(key)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: '9px', border: '1px solid',
                  borderColor: editPerms[key] ? 'var(--green)' : 'var(--border)',
                  background: editPerms[key] ? 'rgba(0,229,160,0.06)' : 'transparent',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: '13px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                    {editPerms[key] ? <Unlock size={12} color="var(--green)" /> : <Lock size={12} color="var(--faint)" />}
                    {label}
                  </span>
                  <div style={{ width: 32, height: 18, borderRadius: '9px', background: editPerms[key] ? 'var(--green)' : 'var(--border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: editPerms[key] ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{saving ? 'Saving…' : 'Save Profile'}</button>
        </div>
      </div></div></div>)}
    </div>
  )
}
