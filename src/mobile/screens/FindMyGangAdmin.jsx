import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { getPortalIdToken } from '../../utils/portalApi'
import { apiUrl } from '../../utils/apiBase'
import Icon from '../components/Icon'

/**
 * Running FindMyGang from the staff portal.
 *
 * Everything goes through `/api/findmygang/*`, which checks the Entra token,
 * adds the operator key (a Pages secret, never on this device) and passes
 * the staff member's email on, so FindMyGang's admin_log says who did what.
 *
 * **What people see in the app.** A "banner" sits at the top of the app
 * until it is closed; a "pop-up" appears once and needs OK. Both come from
 * the same announcements list. "Push" goes to the phone's notification
 * centre and only reaches people who allowed notifications.
 *
 * **Deleting someone is final.** It removes their account, location history,
 * photos and circle memberships, exactly as if they had deleted it in the
 * app. That is why it needs the word DELETE typed, not a tap.
 */

const TABS = [
  ['overview', 'Overview'],
  ['people', 'People'],
  ['groups', 'Groups'],
  ['message', 'Message'],
  ['banners', 'Banners'],
  ['settings', 'Settings'],
  ['log', 'Log'],
]

export default function MobileFindMyGangAdmin({ goBack, isAdmin }) {
  const { instance, accounts } = useMsal()
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [outcome, setOutcome] = useState(null)
  const [busy, setBusy] = useState(false)

  const [overview, setOverview] = useState(null)
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [profile, setProfile] = useState(null)       // { user, circles, devices, uploads, history }
  const [banDays, setBanDays] = useState(7)
  const [deleting, setDeleting] = useState(false)
  const [deleteWord, setDeleteWord] = useState('')

  const [circles, setCircles] = useState([])
  const [groupSearch, setGroupSearch] = useState('')
  const [group, setGroup] = useState(null)           // { circle, members, places }
  const [renameDraft, setRenameDraft] = useState('')
  const [deletingGroup, setDeletingGroup] = useState(false)

  const [announcements, setAnnouncements] = useState([])
  const [draft, setDraft] = useState({ title: '', body: '', style: 'banner', link_url: '', days: '7' })

  const [msg, setMsg] = useState({ title: '', body: '', push: true, in_app: false, style: 'banner' })
  const [audience, setAudience] = useState('everyone')
  const [chosen, setChosen] = useState(new Set())

  const [settings, setSettings] = useState({ min_build: '0', maintenanceOn: false, maintenanceMessage: '' })
  const [log, setLog] = useState([])

  useEffect(() => { load() }, [tab])

  if (!isAdmin) return <div className="fg"><p className="fg-note">Managers only.</p></div>

  async function call(path, options = {}) {
    const account = accounts?.[0]
    if (!account) throw new Error('Sign in to the portal again, then retry.')
    const token = await getPortalIdToken(instance, account)
    const response = await fetch(apiUrl(`/api/findmygang${path}`), {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || `FindMyGang said no (${response.status}).`)
    return payload
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      if (tab === 'overview') setOverview(await call('/overview'))
      if (tab === 'people' || tab === 'message') setUsers((await call(`/users?q=${encodeURIComponent(search)}`)).users || [])
      if (tab === 'groups') setCircles((await call(`/circles?q=${encodeURIComponent(groupSearch)}`)).circles || [])
      if (tab === 'banners') setAnnouncements((await call('/announcements')).announcements || [])
      if (tab === 'settings') {
        const { settings: s } = await call('/settings')
        setSettings({
          min_build: String(s?.min_build ?? 0),
          maintenanceOn: !!s?.maintenance?.on,
          maintenanceMessage: s?.maintenance?.message || '',
        })
      }
      if (tab === 'log') setLog((await call('/log')).log || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function act(label, fn) {
    setBusy(true)
    setOutcome(null)
    try {
      const result = await fn()
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      setOutcome({ ok: true, text: typeof label === 'function' ? label(result) : label })
      return result
    } catch (e) {
      setOutcome({ ok: false, text: e.message })
      return null
    } finally {
      setBusy(false)
    }
  }

  async function openProfile(id) {
    setOutcome(null)
    setDeleting(false)
    setDeleteWord('')
    try {
      setProfile(await call(`/users/${id}`))
    } catch (e) {
      setError(e.message)
    }
  }

  const reloadProfile = () => profile && openProfile(profile.user.id)

  async function openGroup(id) {
    setOutcome(null)
    setDeletingGroup(false)
    try {
      const g = await call(`/circles/${id}`)
      setGroup(g)
      setRenameDraft(g.circle.name)
      setProfile(null)
    } catch (e) {
      setError(e.message)
    }
  }

  // ---------------------------------------------------------------- render

  const header = (
    <>
      <style>{FG_CSS}</style>
      <div className="fg-head">
        <button className="fg-back" onClick={profile ? () => setProfile(null) : group ? () => setGroup(null) : goBack} aria-label="Back">
          <Icon name="chevron-left" size={22} />
        </button>
        <h1>{profile ? (profile.user.display_name || profile.user.email) : group ? group.circle.name : 'FindMyGang'}</h1>
        <button className="fg-back" onClick={profile ? reloadProfile : group ? () => openGroup(group.circle.id) : load} aria-label="Refresh">
          <Icon name="refresh" size={18} />
        </button>
      </div>
      {outcome && <div className={`fg-outcome ${outcome.ok ? 'ok' : 'bad'}`}>{outcome.text}</div>}
    </>
  )

  if (profile) return <div className="fg">{header}{renderProfile()}</div>
  if (group) return <div className="fg">{header}{renderGroup()}</div>

  return (
    <div className="fg">
      {header}
      <div className="fg-tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); setOutcome(null) }}>{label}</button>
        ))}
      </div>
      {error && <div className="fg-outcome bad">{error}</div>}
      {loading && <p className="fg-note">Loading…</p>}
      {!loading && tab === 'overview' && renderOverview()}
      {!loading && tab === 'people' && renderPeople()}
      {!loading && tab === 'groups' && renderGroups()}
      {!loading && tab === 'message' && renderMessage()}
      {!loading && tab === 'banners' && renderBanners()}
      {!loading && tab === 'settings' && renderSettings()}
      {!loading && tab === 'log' && renderLog()}
    </div>
  )

  function renderOverview() {
    if (!overview) return null
    const stat = (value, label, alarm) => (
      <div className={`fg-stat ${alarm ? 'alarm' : ''}`}><strong>{value ?? '–'}</strong><span>{label}</span></div>
    )
    return (
      <>
        <div className="fg-stats">{stat(overview.users, 'Accounts')}{stat(overview.new_7d, 'New this week')}</div>
        <div className="fg-stats">{stat(overview.active_24h, 'Shared in 24 h')}{stat(overview.circles, 'Circles')}</div>
        <div className="fg-stats">
          {stat(overview.devices, 'Phones with push')}
          {stat(overview.sos_active, 'SOS on now', overview.sos_active > 0)}
        </div>
        <div className="fg-stats">
          {stat(overview.push_pending, 'Push waiting')}
          {stat(overview.push_failed_24h, 'Push failed (24 h)', overview.push_failed_24h > 0)}
        </div>
      </>
    )
  }

  function renderPeople() {
    return (
      <>
        <form className="fg-search" onSubmit={e => { e.preventDefault(); load() }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email" />
          <button type="submit">Search</button>
        </form>
        <div className="fg-list">
          {users.map(u => (
            <button key={u.id} className="fg-row" onClick={() => openProfile(u.id)}>
              <div>
                <strong>{u.display_name || '(no name)'} {isBanned(u) && <span className="fg-pill bad">Banned</span>}</strong>
                <span className="fg-meta">{u.email}</span>
                <span className="fg-meta">
                  {u.circles} circle{u.circles === 1 ? '' : 's'} · last location {ago(u.last_location_at)}{u.build ? ` · build ${u.build}` : ''}
                </span>
              </div>
              <Icon name="chevron-right" size={18} color="var(--mobile-text-secondary)" />
            </button>
          ))}
          {!users.length && <p className="fg-note">Nobody found.</p>}
        </div>
      </>
    )
  }

  function renderProfile() {
    const { user: u, circles = [], devices = [], uploads = [], history = [] } = profile
    const banned = isBanned(u)
    return (
      <>
        <div className="fg-card">
          <Info label="Email" value={u.email} />
          <Info label="Phone" value={u.phone || '—'} />
          <Info label="Joined" value={when(u.created_at)} />
          <Info label="Last sign-in" value={when(u.last_sign_in_at)} />
          <Info label="Email confirmed" value={u.email_confirmed ? 'Yes' : 'No'} />
          <Info label="Last location" value={ago(u.last_location_at)} />
          {banned && <Info label="Banned until" value={when(u.banned_until)} />}
        </div>

        <h3 className="fg-h">Circles</h3>
        <div className="fg-card">
          {circles.length ? circles.map((c, i) => (
            <button key={i} className="fg-row flat" onClick={() => c.circles?.id && openGroup(c.circles.id)}>
              <div><strong>{c.circles?.name || 'Circle'}</strong><span className="fg-meta">{c.role} · sharing {c.sharing}</span></div>
              <Icon name="chevron-right" size={18} color="var(--mobile-text-secondary)" />
            </button>
          )) : <p className="fg-note">None</p>}
        </div>

        <h3 className="fg-h">Phones</h3>
        <div className="fg-card">
          {devices.length ? devices.map(d => (
            <div key={d.id} className="fg-device">
              <Info label={`${d.platform} ${d.app_version || ''}`} value={`${d.can_push ? 'push on' : 'no push'} · seen ${ago(d.last_seen_at)}`} />
              <button className="warn" disabled={busy} onClick={async () => {
                if (await act('Phone removed. It stops getting notifications until the app is opened signed in again — ban the account to keep them out.',
                  () => call(`/devices/${d.id}`, { method: 'DELETE' }))) reloadProfile()
              }}>Remove phone</button>
            </div>
          )) : <p className="fg-note">None registered</p>}
        </div>

        <h3 className="fg-h">Actions</h3>
        <div className="fg-actions">
          <button disabled={busy} onClick={() => act(r => `Password reset code sent to ${r.email}.`, () => call(`/users/${u.id}/reset-password`, { method: 'POST' }))}>
            Send password reset
          </button>
          <button disabled={busy} onClick={() => { setTab('message'); setAudience('some'); setChosen(new Set([u.id])); setProfile(null) }}>
            Send them a message
          </button>
          {banned ? (
            <button disabled={busy} onClick={async () => { if (await act('Unbanned.', () => call(`/users/${u.id}/unban`, { method: 'POST' }))) reloadProfile() }}>
              Unban
            </button>
          ) : (
            <div className="fg-inline">
              <select value={banDays} onChange={e => setBanDays(Number(e.target.value))}>
                <option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={0}>Permanent</option>
              </select>
              <button className="warn" disabled={busy} onClick={async () => {
                if (await act('Banned. They are signed out within the hour.', () => call(`/users/${u.id}/ban`, { method: 'POST', body: JSON.stringify({ days: banDays }) }))) reloadProfile()
              }}>Ban</button>
            </div>
          )}
          {!deleting ? (
            <button className="danger" onClick={() => setDeleting(true)}>Delete account…</button>
          ) : (
            <div className="fg-card danger">
              <p>This deletes {u.display_name || u.email}'s account, locations, history, photos and circle memberships. It can't be undone. Type DELETE to confirm.</p>
              <input value={deleteWord} onChange={e => setDeleteWord(e.target.value)} placeholder="DELETE" autoCapitalize="characters" />
              <button className="danger" disabled={busy || deleteWord !== 'DELETE'} onClick={async () => {
                if (await act('Account deleted.', () => call(`/users/${u.id}`, { method: 'DELETE' }))) { setProfile(null); load() }
              }}>Delete for good</button>
            </div>
          )}
        </div>

        <h3 className="fg-h">Recent uploads</h3>
        <div className="fg-card">
          {uploads.length ? uploads.map((x, i) => <Info key={i} label={when(x.received_at)} value={`${x.src} · ${x.app_state || ''} · build ${x.build ?? '?'}`} />) : <p className="fg-note">None in the last 3 days</p>}
        </div>

        <h3 className="fg-h">Staff actions on this account</h3>
        <div className="fg-card">
          {history.length ? history.map((h, i) => <Info key={i} label={`${h.action} · ${h.operator}`} value={when(h.created_at)} />) : <p className="fg-note">None</p>}
        </div>
      </>
    )
  }

  function renderGroups() {
    return (
      <>
        <form className="fg-search" onSubmit={e => { e.preventDefault(); load() }}>
          <input value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Group, member name or email" />
          <button type="submit">Search</button>
        </form>
        <div className="fg-list">
          {circles.map(c => (
            <button key={c.id} className="fg-row" onClick={() => openGroup(c.id)}>
              <div>
                <strong>{c.name}</strong>
                <span className="fg-meta">{c.members} member{c.members === 1 ? '' : 's'} · owner {c.owner_name || c.owner_email || '—'}</span>
                <span className="fg-meta">Created {when(c.created_at)}</span>
              </div>
              <Icon name="chevron-right" size={18} color="var(--mobile-text-secondary)" />
            </button>
          ))}
          {!circles.length && <p className="fg-note">No groups found.</p>}
        </div>
      </>
    )
  }

  function renderGroup() {
    const { circle, members = [], places = [] } = group
    return (
      <>
        <h3 className="fg-h">Rename</h3>
        <div className="fg-inline">
          <input value={renameDraft} maxLength={40} onChange={e => setRenameDraft(e.target.value)} />
          <button disabled={busy || !renameDraft.trim() || renameDraft.trim() === circle.name} onClick={async () => {
            if (await act('Renamed.', () => call(`/circles/${circle.id}`, { method: 'PATCH', body: JSON.stringify({ name: renameDraft }) }))) openGroup(circle.id)
          }}>Save</button>
        </div>

        <h3 className="fg-h">Members ({members.length})</h3>
        <div className="fg-list">
          {members.map(m => (
            <div key={m.user_id} className="fg-card">
              <button className="fg-row flat" onClick={() => { setGroup(null); openProfile(m.user_id) }}>
                <div>
                  <strong>{m.display_name || m.email}</strong>
                  <span className="fg-meta">{m.email}</span>
                  <span className="fg-meta">{m.role} · sharing {m.sharing} · last location {ago(m.last_location_at)}</span>
                </div>
                <Icon name="chevron-right" size={18} color="var(--mobile-text-secondary)" />
              </button>
              <button className="warn" disabled={busy} onClick={async () => {
                if (await act(`${m.display_name || m.email} removed from ${circle.name}.`, () => call(`/circles/${circle.id}/members/${m.user_id}`, { method: 'DELETE' }))) {
                  if (members.length === 1) { setGroup(null); load() } else openGroup(circle.id)
                }
              }}>Remove from group</button>
            </div>
          ))}
        </div>

        <h3 className="fg-h">Places</h3>
        <div className="fg-card">{places.length ? places.map(p => p.name).join(', ') : <span className="fg-note">None</span>}</div>

        <h3 className="fg-h">Delete</h3>
        {!deletingGroup ? (
          <button className="danger" onClick={() => setDeletingGroup(true)}>Delete group…</button>
        ) : (
          <div className="fg-card danger">
            <p>Deletes {circle.name}, its places and invites. The members keep their accounts.</p>
            <button className="danger" disabled={busy} onClick={async () => {
              if (await act('Group deleted.', () => call(`/circles/${circle.id}`, { method: 'DELETE' }))) { setGroup(null); load() }
            }}>Delete for good</button>
          </div>
        )}
        <p className="fg-note">Created {when(circle.created_at)}</p>
      </>
    )
  }

  function renderMessage() {
    const toggle = id => setChosen(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
    const send = () => act(
      r => `Sent${msg.push ? ` to ${r.phones} phone${r.phones === 1 ? '' : 's'}` : ''}${msg.in_app ? `${msg.push ? ' and' : ''} in the app` : ''}.`,
      async () => {
        const r = await call('/notify', {
          method: 'POST',
          body: JSON.stringify({ ...msg, user_ids: audience === 'everyone' ? null : [...chosen] }),
        })
        setMsg(m => ({ ...m, title: '', body: '' }))
        return r
      })
    const ready = msg.title.trim() && msg.body.trim() && (msg.push || msg.in_app) && (audience === 'everyone' || chosen.size)
    return (
      <div className="fg-form">
        <label>Title<input value={msg.title} maxLength={80} onChange={e => setMsg({ ...msg, title: e.target.value })} /></label>
        <label>Message<textarea rows={4} value={msg.body} maxLength={600} onChange={e => setMsg({ ...msg, body: e.target.value })} /></label>
        <div className="fg-check"><input type="checkbox" checked={msg.push} onChange={e => setMsg({ ...msg, push: e.target.checked })} id="fg-push" /><label htmlFor="fg-push">Push notification to their phone</label></div>
        <div className="fg-check"><input type="checkbox" checked={msg.in_app} onChange={e => setMsg({ ...msg, in_app: e.target.checked })} id="fg-inapp" /><label htmlFor="fg-inapp">Also show it in the app (for 7 days)</label></div>
        {msg.in_app && (
          <div className="fg-seg">
            {['banner', 'popup'].map(s => <button key={s} className={msg.style === s ? 'active' : ''} onClick={() => setMsg({ ...msg, style: s })}>{s === 'banner' ? 'Banner' : 'Pop-up'}</button>)}
          </div>
        )}
        <div className="fg-seg">
          <button className={audience === 'everyone' ? 'active' : ''} onClick={() => setAudience('everyone')}>Everyone</button>
          <button className={audience === 'some' ? 'active' : ''} onClick={() => setAudience('some')}>Choose people{chosen.size ? ` (${chosen.size})` : ''}</button>
        </div>
        {audience === 'some' && (
          <div className="fg-list">
            {users.map(u => (
              <div key={u.id} className="fg-check">
                <input type="checkbox" id={`fg-u-${u.id}`} checked={chosen.has(u.id)} onChange={() => toggle(u.id)} />
                <label htmlFor={`fg-u-${u.id}`}>{u.display_name || u.email} <span className="fg-meta">{u.devices ? 'push on' : 'no push'}</span></label>
              </div>
            ))}
          </div>
        )}
        <button className="fg-primary" disabled={busy || !ready} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
      </div>
    )
  }

  function renderBanners() {
    const create = () => act('Published.', async () => {
      const days = Number(draft.days)
      await call('/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: draft.title, body: draft.body, style: draft.style, link_url: draft.link_url.trim() || null,
          ends_at: days > 0 ? new Date(Date.now() + days * 864e5).toISOString() : null,
        }),
      })
      setDraft({ title: '', body: '', style: 'banner', link_url: '', days: '7' })
      setAnnouncements((await call('/announcements')).announcements || [])
    })
    const setActive = (a, active) => act(active ? 'Showing again.' : 'Hidden.', async () => {
      await call(`/announcements/${a.id}`, { method: 'PATCH', body: JSON.stringify({ active }) })
      setAnnouncements((await call('/announcements')).announcements || [])
    })
    const remove = a => act('Deleted.', async () => {
      await call(`/announcements/${a.id}`, { method: 'DELETE' })
      setAnnouncements(list => list.filter(x => x.id !== a.id))
    })
    return (
      <>
        <div className="fg-form">
          <label>Title<input value={draft.title} maxLength={80} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
          <label>Text<textarea rows={3} value={draft.body} maxLength={600} onChange={e => setDraft({ ...draft, body: e.target.value })} /></label>
          <label>Link (optional, https://…)<input value={draft.link_url} onChange={e => setDraft({ ...draft, link_url: e.target.value })} /></label>
          <div className="fg-seg">
            {['banner', 'popup'].map(s => <button key={s} className={draft.style === s ? 'active' : ''} onClick={() => setDraft({ ...draft, style: s })}>{s === 'banner' ? 'Banner' : 'Pop-up'}</button>)}
          </div>
          <label>Show for
            <select value={draft.days} onChange={e => setDraft({ ...draft, days: e.target.value })}>
              <option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="0">Until I hide it</option>
            </select>
          </label>
          <button className="fg-primary" disabled={busy || !draft.title.trim() || (draft.link_url && !/^https:\/\//.test(draft.link_url))} onClick={create}>Publish to everyone</button>
        </div>
        <h3 className="fg-h">Published</h3>
        <div className="fg-list">
          {announcements.map(a => {
            const live = a.active && (!a.ends_at || new Date(a.ends_at) > new Date())
            return (
              <div key={a.id} className={`fg-card ${live ? '' : 'off'}`}>
                <strong>{a.title}</strong> <span className={`fg-pill ${live ? 'ok' : ''}`}>{live ? 'Live' : 'Off'}</span> <span className="fg-pill">{a.style === 'popup' ? 'Pop-up' : 'Banner'}</span>
                {a.body && <p className="fg-meta">{a.body}</p>}
                <p className="fg-meta">{a.user_ids ? `${a.user_ids.length} people` : 'Everyone'} · {a.ends_at ? `until ${when(a.ends_at)}` : 'no end'} · by {a.created_by}</p>
                <div className="fg-inline">
                  <button disabled={busy} onClick={() => setActive(a, !a.active)}>{a.active ? 'Hide' : 'Show'}</button>
                  <button className="danger" disabled={busy} onClick={() => remove(a)}>Delete</button>
                </div>
              </div>
            )
          })}
          {!announcements.length && <p className="fg-note">Nothing published yet.</p>}
        </div>
      </>
    )
  }

  function renderSettings() {
    const save = () => act('Saved. Phones pick it up next time the app opens.', () => call('/settings', {
      method: 'PUT',
      body: JSON.stringify({
        min_build: Number(settings.min_build) || 0,
        maintenance: { on: settings.maintenanceOn, message: settings.maintenanceMessage },
      }),
    }))
    return (
      <div className="fg-form">
        <h3 className="fg-h">Maintenance notice</h3>
        <div className="fg-check">
          <input type="checkbox" id="fg-maint" checked={settings.maintenanceOn} onChange={e => setSettings({ ...settings, maintenanceOn: e.target.checked })} />
          <label htmlFor="fg-maint">Show a maintenance notice at the top of the app</label>
        </div>
        <label>Notice text<input value={settings.maintenanceMessage} maxLength={300} placeholder="Some things may not work for a little while."
          onChange={e => setSettings({ ...settings, maintenanceMessage: e.target.value })} /></label>
        <p className="fg-note">The app keeps working underneath, so SOS and location sharing never stop.</p>

        <h3 className="fg-h">Oldest build allowed</h3>
        <label>Build number<input inputMode="numeric" value={settings.min_build} onChange={e => setSettings({ ...settings, min_build: e.target.value.replace(/\D/g, '') })} /></label>
        <p className="fg-note">Anyone on an older build sees "Update FindMyGang" with an App Store button instead of the app. 0 lets every build in. Only raise this once the new build is live on the App Store.</p>

        <button className="fg-primary" disabled={busy} onClick={save}>Save</button>
      </div>
    )
  }

  function renderLog() {
    return (
      <div className="fg-list">
        {log.map(l => (
          <div key={l.id} className="fg-card">
            <strong>{l.action}</strong>
            <p className="fg-meta">{l.operator} · {when(l.created_at)}{l.target ? ` · ${l.target}` : ''}</p>
            {l.detail && Object.keys(l.detail).length > 0 && <p className="fg-meta">{JSON.stringify(l.detail)}</p>}
          </div>
        ))}
        {!log.length && <p className="fg-note">No staff actions yet.</p>}
      </div>
    )
  }
}

function Info({ label, value }) {
  return <div className="fg-info"><span>{label}</span><strong>{value}</strong></div>
}

const isBanned = u => u.banned_until && new Date(u.banned_until) > new Date()

function when(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function ago(iso) {
  if (!iso) return 'never'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

const FG_CSS = `
  .fg { padding: 16px 16px 60px; overflow-x: hidden; }
  .fg * { max-width: 100%; box-sizing: border-box; }
  .fg-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .fg-head h1 { margin: 0; flex: 1; font-size: 22px; font-weight: 700; color: var(--mobile-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fg-back { background: none; border: none; padding: 6px; color: var(--mobile-accent); cursor: pointer; display: grid; place-items: center; }
  .fg-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 14px; }
  .fg-tabs button, .fg-seg button {
    min-width: 0; padding: 9px 4px; border-radius: 10px; border: 1px solid var(--mobile-border);
    background: var(--mobile-card); font-size: 12.5px; font-weight: 600; color: var(--mobile-text-secondary); cursor: pointer;
  }
  .fg-tabs button.active, .fg-seg button.active { background: var(--mobile-accent); border-color: var(--mobile-accent); color: var(--mobile-on-accent); }
  .fg-seg { display: flex; gap: 6px; }
  .fg-seg button { flex: 1; }
  .fg-stats { display: flex; gap: 10px; margin-bottom: 10px; }
  .fg-stat { flex: 1; background: var(--mobile-card); border: 1px solid var(--mobile-border); border-radius: 12px; padding: 14px 12px; text-align: center; }
  .fg-stat strong { display: block; font-size: 26px; font-weight: 700; color: var(--mobile-text); font-variant-numeric: tabular-nums; }
  .fg-stat span { font-size: 11.5px; color: var(--mobile-text-secondary); }
  .fg-stat.alarm { border-color: #c0392b; } .fg-stat.alarm strong { color: #c0392b; }
  .fg-list { display: flex; flex-direction: column; gap: 10px; }
  .fg-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; text-align: left;
    background: var(--mobile-card); border: 1px solid var(--mobile-border); border-radius: 12px; padding: 12px 14px; cursor: pointer; color: var(--mobile-text); }
  .fg-row > div { min-width: 0; }
  .fg-row strong { display: block; font-size: 15px; }
  .fg .fg-row.flat { border: none; padding: 6px 0; background: none; }
  .fg-device { border-bottom: 1px solid var(--mobile-border); padding-bottom: 8px; margin-bottom: 8px; }
  .fg-device:last-child { border-bottom: none; margin-bottom: 0; }
  .fg-device button { width: 100%; }
  .fg-card > button.warn { width: 100%; margin-top: 6px; }
  .fg-meta { display: block; font-size: 12.5px; color: var(--mobile-text-secondary); overflow-wrap: anywhere; margin: 2px 0; }
  .fg-card { background: var(--mobile-card); border: 1px solid var(--mobile-border); border-radius: 12px; padding: 12px 14px; color: var(--mobile-text); }
  .fg-card.off { opacity: 0.55; }
  .fg-card.danger { border-color: #c0392b; }
  .fg-info { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: 13.5px; }
  .fg-info span { color: var(--mobile-text-secondary); flex: none; }
  .fg-info strong { text-align: right; overflow-wrap: anywhere; font-weight: 600; }
  .fg-h { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--mobile-text-secondary); margin: 18px 0 8px; }
  .fg-note { font-size: 13px; color: var(--mobile-text-secondary); }
  .fg-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: var(--mobile-border); color: var(--mobile-text-secondary); }
  .fg-pill.ok { background: #e3efe8; color: #1f7a4d; } .fg-pill.bad { background: #fbe9e7; color: #c0392b; }
  .fg-outcome { padding: 10px 12px; border-radius: 10px; font-size: 13.5px; margin-bottom: 12px; }
  .fg-outcome.ok { background: #e3efe8; color: #1f7a4d; } .fg-outcome.bad { background: #fbe9e7; color: #c0392b; }
  .fg-search { display: flex; gap: 8px; margin-bottom: 12px; }
  .fg-search input { flex: 1; min-width: 0; }
  .fg input, .fg textarea, .fg select { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--mobile-border);
    background: var(--mobile-card); color: var(--mobile-text); font-size: 15px; font-family: inherit; }
  .fg-form { display: flex; flex-direction: column; gap: 12px; }
  .fg-form label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: var(--mobile-text-secondary); }
  .fg-check { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--mobile-text); }
  .fg-check input { width: 20px; height: 20px; flex: none; }
  .fg-check label { flex-direction: row; font-weight: 500; color: var(--mobile-text); }
  .fg-actions { display: flex; flex-direction: column; gap: 8px; }
  .fg-inline { display: flex; gap: 8px; margin-top: 8px; }
  .fg-inline > * { flex: 1; }
  .fg button:not(.fg-back):not(.fg-row) { padding: 11px 14px; border-radius: 10px; border: 1px solid var(--mobile-border);
    background: var(--mobile-card); color: var(--mobile-text); font-weight: 600; font-size: 14px; cursor: pointer; }
  .fg .fg-tabs button, .fg .fg-seg button { padding: 9px 4px; font-size: 12.5px; color: var(--mobile-text-secondary); }
  .fg .fg-tabs button.active, .fg .fg-seg button.active { color: var(--mobile-on-accent); background: var(--mobile-accent); }
  .fg button.fg-primary { background: var(--mobile-accent); border-color: var(--mobile-accent); color: var(--mobile-on-accent); padding: 14px; font-size: 15px; }
  .fg button.warn { color: #b9770e; border-color: #b9770e; }
  .fg button.danger { color: #c0392b; border-color: #c0392b; }
  .fg button:disabled { opacity: 0.45; cursor: default; }
`
