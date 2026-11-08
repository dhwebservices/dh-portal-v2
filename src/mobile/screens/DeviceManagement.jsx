import { useState, useEffect, useCallback } from 'react'
import { useMsal } from '@azure/msal-react'
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { getStaffIdToken, SignInNeeded } from '../../utils/staffToken'
import Icon from '../components/Icon'

/**
 * Device management: our own MDM (workers/mdm), not Intune.
 *
 * Everyone can enrol their own iPhone and see what DH can see about it.
 * Device admins (MDM_ADMINS on the Worker) also get the staff phones list,
 * where they can refresh a phone's details, lock it, and - on supervised
 * phones only, because Apple allows nothing else - restart or shut it down.
 *
 * Enrolment hands a one-time link to Safari: iOS only installs a management
 * profile from Safari, never from inside an app.
 */

const MDM_URL = (import.meta.env.VITE_MDM_URL || 'https://dh-mdm.aged-silence-66a7.workers.dev').replace(/\/$/, '')
const isNative = Capacitor.isNativePlatform()

const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
function ago(t) {
  if (!t) return 'never'
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`
  return `${Math.round(h / 24)} days ago`
}
const gb = (v) => (v == null ? '—' : `${Math.round(v * 10) / 10} GB`)
const yesNo = (v, good = true) => (v == null ? <span>—</span> : <span className={`mdm-pill ${good === null ? '' : v === good ? 'good' : 'bad'}`}>{v ? 'Yes' : 'No'}</span>)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const COMMAND_NAMES = {
  DeviceInformation: 'Device details', SecurityInfo: 'Security check', InstalledApplicationList: 'App list',
  DeviceLock: 'Lock', RestartDevice: 'Restart', ShutDownDevice: 'Shut down', RemoveProfile: 'Remove management',
}
const STATUS_NAMES = { queued: 'Waiting for the phone', sent: 'Sent', notnow: 'Phone busy, will retry', done: 'Done', error: 'Failed', cancelled: 'Cancelled' }

export default function MobileDeviceManagement({ goBack }) {
  const { instance, accounts } = useMsal()
  const account = accounts?.[0]
  const [me, setMe] = useState(null)
  const [tab, setTab] = useState('mine')
  const [error, setError] = useState('')
  const [openUdid, setOpenUdid] = useState(null)

  const call = useCallback(async (path, { method = 'GET', body, interactive = false } = {}) => {
    const token = await getStaffIdToken({ instance, account, interactive })
    const res = await fetch(`${MDM_URL}/api/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status}).`)
    return data
  }, [instance, account])

  const loadMe = useCallback(async (interactive = false) => {
    try {
      setMe(await call('me', { interactive }))
    } catch (e) {
      setError(e instanceof SignInNeeded ? 'Sign in again to see device management.' : e.message)
    }
  }, [call])
  useEffect(() => { loadMe(true) }, [loadMe])

  if (openUdid) {
    return <DeviceDetail udid={openUdid} call={call} canAdmin={!!me?.isAdmin} onBack={() => { setOpenUdid(null); loadMe() }} />
  }

  return (
    <div className="mdm-screen">
      <div className="mdm-head">
        <button className="mdm-back" onClick={goBack} aria-label="Back"><Icon name="chevronLeft" size={20} /></button>
        <h1>Device management</h1>
      </div>

      {me?.isAdmin && (
        <div className="mdm-tabs">
          <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My iPhone</button>
          <button className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>Staff phones</button>
        </div>
      )}

      {error && <p className="mdm-error">{error}</p>}
      {!me && !error && <p className="mdm-note">Loading…</p>}
      {me && !me.pushReady && <p className="mdm-note warn">Device management is still being set up: commands will queue but phones can't be woken to collect them yet.</p>}

      {me && tab === 'mine' && <MyPhone me={me} call={call} onOpen={setOpenUdid} />}
      {me && tab === 'team' && me.isAdmin && <TeamPhones call={call} onOpen={setOpenUdid} />}

      <style>{CSS}</style>
    </div>
  )
}

function WhatWeSee() {
  return (
    <details className="mdm-what">
      <summary>What DH can and can't do</summary>
      <p><b>Can:</b> see the model, iOS version, storage, battery and serial number; check a passcode is set and the phone is encrypted; see which apps are installed; lock the screen, or lock it with a message to call us if it's lost.</p>
      <p><b>Can't:</b> erase the phone, read messages, email, photos, files or browsing, or see where the phone is. Restart and shut down only work on company phones set up through Apple Business Manager.</p>
      <p>You can remove it any time in Settings &gt; General &gt; VPN &amp; Device Management.</p>
    </details>
  )
}

function MyPhone({ me, call, onOpen }) {
  const [link, setLink] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const enrol = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await call('enroll', { method: 'POST', body: {}, interactive: true })
      setLink(r.url)
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      // Capacitor hands links outside the app to Safari, which is the only
      // place iOS will install a management profile from.
      if (isNative) window.location.href = r.url
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {me.devices.map((d) => <DeviceRow key={d.udid} d={d} onOpen={onOpen} />)}

      <div className="mdm-card">
        <div className="mdm-label">{me.devices.length ? 'Enrol another iPhone' : 'Add this iPhone to DH device management'}</div>
        <p className="mdm-sub">If your phone is lost or stolen, DH can lock it straight away with a message asking whoever finds it to call us. We can also check it's secure and up to date.</p>
        <WhatWeSee />
        <button className="mdm-run" onClick={enrol} disabled={busy}>{busy ? 'Getting your link…' : 'Enrol this iPhone'}</button>
        {link && (
          <div className="mdm-sub">
            Safari should have opened. If not, open this link in Safari on the iPhone (it works once, for 24 hours):
            <div className="mdm-link">{link}</div>
            <ol className="mdm-steps">
              <li>Tap <b>Allow</b> to download the profile.</li>
              <li>Open <b>Settings</b> and tap <b>Profile Downloaded</b>.</li>
              <li>Tap <b>Install</b>, enter your passcode, and <b>Trust</b> Remote Management.</li>
            </ol>
          </div>
        )}
        {error && <p className="mdm-error">{error}</p>}
      </div>
    </>
  )
}

function DeviceRow({ d, onOpen }) {
  const stale = d.infoAt && Date.now() - d.infoAt > 24 * 3600 * 1000
  return (
    <button className="mdm-card mdm-device" onClick={() => onOpen(d.udid)}>
      <div className="mdm-row">
        <div>
          <div className="mdm-label">{d.name || d.model || 'iPhone'}</div>
          <div className="mdm-sub">
            {[d.owner || d.email, d.model, d.osVersion && `iOS ${d.osVersion}`].filter(Boolean).join(' · ')}
          </div>
          <div className="mdm-sub">
            {d.status === 'enrolled' ? <>Details {d.infoAt ? <span className={stale ? 'mdm-stale' : ''}>{ago(d.infoAt)}</span> : 'not in yet'}</> : d.status === 'enrolling' ? 'Enrolling…' : 'Removed'}
            {d.battery != null && ` · ${d.battery}% battery`}
            {d.freeGB != null && ` · ${gb(d.freeGB)} free`}
          </div>
        </div>
        <div className="mdm-badges">
          {d.status === 'enrolled' && d.passcode === false && <span className="mdm-pill bad">No passcode</span>}
          {d.supervised && <span className="mdm-pill good">Supervised</span>}
          <Icon name="chevron-right" size={18} color="var(--mobile-text-secondary)" />
        </div>
      </div>
    </button>
  )
}

function TeamPhones({ call, onOpen }) {
  const [devices, setDevices] = useState(null)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [link, setLink] = useState(null)

  const load = useCallback(async () => {
    try {
      const d = await call('devices', { interactive: true })
      setDevices(d.devices || [])
    } catch (e) {
      setError(e.message)
    }
  }, [call])
  useEffect(() => { load() }, [load])

  const makeLink = async () => {
    setError('')
    setLink(null)
    try {
      const r = await call('enroll', { method: 'POST', body: { email: email.trim().toLowerCase() } })
      setLink(r.url)
    } catch (e) {
      setError(e.message)
    }
  }

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Enrol your iPhone', text: 'Open this in Safari on your iPhone to add it to DH device management:', url: link })
      else await navigator.clipboard.writeText(link)
    } catch {}
  }

  const active = (devices || []).filter((d) => d.status !== 'removed')
  const removed = (devices || []).filter((d) => d.status === 'removed')

  return (
    <>
      {error && <p className="mdm-error">{error}</p>}
      {!devices && !error && <p className="mdm-note">Loading phones…</p>}
      {devices && !active.length && <p className="mdm-note">No phones enrolled yet.</p>}
      {active.map((d) => <DeviceRow key={d.udid} d={d} onOpen={onOpen} />)}

      <div className="mdm-card">
        <div className="mdm-label">Enrol a staff member's iPhone</div>
        <p className="mdm-sub">Makes a one-time link for them to open in Safari on their phone. Send it to them: it works once, for 24 hours.</p>
        <div className="mdm-inline">
          <input className="mdm-input" type="email" placeholder="name@dhwebsiteservices.co.uk" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="off" autoCorrect="off" />
          <button className="mdm-small" onClick={makeLink} disabled={!email.includes('@')}>Make link</button>
        </div>
        {link && (
          <>
            <div className="mdm-link">{link}</div>
            <button className="mdm-small" onClick={share}>Share link</button>
          </>
        )}
      </div>

      {removed.length > 0 && (
        <details className="mdm-what">
          <summary>Removed phones ({removed.length})</summary>
          {removed.map((d) => <DeviceRow key={d.udid} d={d} onOpen={onOpen} />)}
        </details>
      )}
    </>
  )
}

function DeviceDetail({ udid, call, canAdmin, onBack }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [lockOpen, setLockOpen] = useState(false)
  const [lockMessage, setLockMessage] = useState('')
  const [confirm, setConfirm] = useState(null) // 'restart' | 'shutdown' | 'remove'

  const load = useCallback(async () => {
    try {
      setData(await call(`devices/${encodeURIComponent(udid)}`))
    } catch (e) {
      setError(e.message)
    }
  }, [call, udid])
  useEffect(() => { load() }, [load])

  // Watch the queue until the phone has answered.
  const follow = async () => {
    for (let i = 0; i < 20; i++) {
      await sleep(3000)
      const d = await call(`devices/${encodeURIComponent(udid)}`).catch(() => null)
      if (!d) continue
      setData(d)
      if (!d.commands.some((c) => ['queued', 'sent', 'notnow'].includes(c.status))) {
        setNote('The phone has answered.')
        Haptics.notification({ type: NotificationType.Success }).catch(() => {})
        return
      }
    }
    setNote('The phone hasn\'t answered yet. It will pick the command up next time it\'s online and unlocked.')
  }

  const send = async (type, extra = {}) => {
    setBusy(type)
    setError('')
    setNote('')
    try {
      const r = await call(`devices/${encodeURIComponent(udid)}/command`, { method: 'POST', body: { type, ...extra } })
      setNote(r.pushed ? `${r.queued}: sent. Waiting for the phone…` : `${r.queued}: queued, but the phone couldn't be woken (${r.pushError}). It will pick it up when it next checks in.`)
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
      await load()
      if (r.pushed) follow()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
      setLockOpen(false)
      setConfirm(null)
    }
  }

  const remove = async () => {
    setBusy('remove')
    try {
      await call(`devices/${encodeURIComponent(udid)}/remove`, { method: 'POST', body: {} })
      setNote('Removal sent. The phone drops out of management when it next checks in.')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
      setConfirm(null)
    }
  }

  const d = data?.device
  const enrolled = d?.status === 'enrolled'

  return (
    <div className="mdm-screen">
      <div className="mdm-head">
        <button className="mdm-back" onClick={onBack} aria-label="Back"><Icon name="chevronLeft" size={20} /></button>
        <h1>{d?.name || d?.model || 'iPhone'}</h1>
      </div>
      {error && <p className="mdm-error">{error}</p>}
      {!d && !error && <p className="mdm-note">Loading…</p>}

      {d && (
        <>
          <p className="mdm-note">
            {d.owner || d.email} · {d.status === 'enrolled' ? `details from ${ago(d.infoAt)}` : d.status}
            {d.lastSeen ? ` · last checked in ${ago(d.lastSeen)}` : ''}
          </p>

          {enrolled && (
            <div className="mdm-actions">
              <button className="mdm-run" onClick={() => send('refresh')} disabled={!!busy}>{busy === 'refresh' ? 'Asking…' : 'Refresh details'}</button>
              <div className="mdm-two">
                <button className="mdm-run danger" onClick={() => send('screenlock')} disabled={!!busy}>{busy === 'screenlock' ? 'Locking…' : 'Lock screen'}</button>
                <button className="mdm-run danger" onClick={() => setLockOpen(true)} disabled={!!busy}>Lock with message</button>
              </div>
              {canAdmin && (
                <div className="mdm-two">
                  <button className="mdm-run ghost" onClick={() => setConfirm('restart')} disabled={!!busy || !d.supervised}>Restart</button>
                  <button className="mdm-run ghost" onClick={() => setConfirm('shutdown')} disabled={!!busy || !d.supervised}>Shut down</button>
                </div>
              )}
              {canAdmin && !d.supervised && (
                <p className="mdm-sub">Restart and shut down are greyed out because Apple only allows them on supervised phones (company phones set up through Apple Business Manager). Lock works on every enrolled phone.</p>
              )}
            </div>
          )}

          {note && <p className="mdm-ok">{note}</p>}

          {lockOpen && (
            <div className="mdm-card mdm-confirm">
              <div className="mdm-label">Lock with a message?</div>
              <p className="mdm-sub">The screen locks straight away and needs the passcode to open. The message and our number show on the Lock Screen.</p>
              <textarea className="mdm-input" rows={3} maxLength={200} placeholder="This iPhone belongs to DH Website Services. If found, please call 01443 805303." value={lockMessage} onChange={(e) => setLockMessage(e.target.value)} />
              <div className="mdm-two">
                <button className="mdm-run ghost" onClick={() => setLockOpen(false)}>Cancel</button>
                <button className="mdm-run danger" onClick={() => send('lock', lockMessage.trim() ? { message: lockMessage.trim() } : {})} disabled={!!busy}>{busy === 'lock' ? 'Locking…' : 'Lock it'}</button>
              </div>
            </div>
          )}

          {confirm && confirm !== 'remove' && (
            <div className="mdm-card mdm-confirm">
              <div className="mdm-label">{confirm === 'restart' ? 'Restart' : 'Shut down'} this iPhone?</div>
              <p className="mdm-sub">{confirm === 'restart' ? 'It restarts straight away, and anything unsaved in open apps is lost.' : 'It turns off and stays off until someone holds the side button.'}</p>
              <div className="mdm-two">
                <button className="mdm-run ghost" onClick={() => setConfirm(null)}>Cancel</button>
                <button className="mdm-run danger" onClick={() => send(confirm)} disabled={!!busy}>{confirm === 'restart' ? 'Restart' : 'Shut down'}</button>
              </div>
            </div>
          )}

          <div className="mdm-card">
            <div className="mdm-section-title">Phone</div>
            <Line k="Model" v={d.model || d.product} />
            <Line k="iOS" v={d.osVersion} />
            <Line k="Serial number" v={d.serial} />
            <Line k="Battery" v={d.battery != null ? `${d.battery}%` : null} />
            <Line k="Storage free" v={d.freeGB != null ? `${gb(d.freeGB)} of ${gb(d.capacityGB)}` : null} />
            <Line k="Supervised" v={yesNo(d.supervised, null)} />
            <Line k="Enrolled" v={when(d.enrolledAt)} />
          </div>

          <div className="mdm-card">
            <div className="mdm-section-title">Security {d.securityAt ? <span className="mdm-when">· {ago(d.securityAt)}</span> : null}</div>
            <Line k="Passcode set" v={yesNo(d.passcode)} />
            <Line k="Encrypted" v={yesNo(d.encrypted)} />
            <Line k="Find My on" v={yesNo(d.findMy)} />
            <Line k="iCloud Backup on" v={yesNo(d.icloudBackup)} />
            {d.lastBackup && <Line k="Last iCloud backup" v={when(d.lastBackup)} />}
          </div>

          {d.apps?.length > 0 && (
            <details className="mdm-card mdm-apps">
              <summary className="mdm-section-title">Apps ({d.apps.length}) <span className="mdm-when">· {ago(d.appsAt)}</span></summary>
              {d.apps.map((a) => <Line key={a.id || a.name} k={a.name || a.id} v={a.version ? `v${a.version}` : ''} />)}
            </details>
          )}

          {data.commands?.length > 0 && (
            <div className="mdm-card">
              <div className="mdm-section-title">History</div>
              {data.commands.map((c) => (
                <div key={c.uuid} className="mdm-hist">
                  <div>
                    <div>{COMMAND_NAMES[c.request_type] || c.request_type}</div>
                    <div className="mdm-sub">{when(c.queued_at)} · {c.queued_by === 'auto-refresh' || c.queued_by === 'enrolment' ? 'automatic' : c.queued_by}</div>
                    {c.error && <div className="mdm-sub mdm-bad">{c.error}</div>}
                  </div>
                  <span className={`mdm-pill ${c.status === 'done' ? 'good' : c.status === 'error' ? 'bad' : ''}`}>{STATUS_NAMES[c.status] || c.status}</span>
                </div>
              ))}
            </div>
          )}

          {canAdmin && d.status !== 'removed' && (
            confirm === 'remove' ? (
              <div className="mdm-card mdm-confirm">
                <div className="mdm-label">Take this iPhone out of DH management?</div>
                <p className="mdm-sub">The profile is removed from the phone. Nothing else on it changes. They can enrol again later.</p>
                <div className="mdm-two">
                  <button className="mdm-run ghost" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="mdm-run danger" onClick={remove} disabled={!!busy}>Remove</button>
                </div>
              </div>
            ) : (
              <button className="mdm-run ghost" onClick={() => setConfirm('remove')}>Remove from management</button>
            )
          )}
        </>
      )}
      <style>{CSS}</style>
    </div>
  )
}

function Line({ k, v }) {
  return <div className="mdm-line"><span>{k}</span><span>{v ?? '—'}</span></div>
}

const CSS = `
  .mdm-screen { padding: 16px 16px 48px; color: var(--mobile-text); }
  .mdm-screen *, .mdm-screen *::before, .mdm-screen *::after { box-sizing: border-box; }
  .mdm-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .mdm-head h1 { margin: 0; font-size: 22px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mdm-back { background: none; border: none; padding: 4px; color: var(--mobile-text); display: grid; place-items: center; }
  .mdm-tabs { display: flex; background: var(--mobile-card); border: 1px solid var(--mobile-border); border-radius: 12px; padding: 3px; margin-bottom: 14px; }
  .mdm-tabs button { flex: 1; border: 0; background: none; padding: 9px 0; border-radius: 9px; font-size: 14px; font-weight: 600; color: var(--mobile-text-secondary); }
  .mdm-tabs button.on { background: var(--mobile-accent); color: var(--mobile-on-accent, #fff); }
  .mdm-note { margin: 0 4px 14px; font-size: 14px; line-height: 1.45; color: var(--mobile-text-secondary); }
  .mdm-note.warn { color: #d98a00; }
  .mdm-card { display: block; width: 100%; text-align: left; font: inherit; color: inherit; background: var(--mobile-card); border: 1px solid var(--mobile-border); border-radius: 16px; padding: 14px; margin-bottom: 12px; }
  .mdm-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .mdm-badges { display: flex; align-items: center; gap: 6px; flex: none; }
  .mdm-label { font-size: 15px; font-weight: 600; }
  .mdm-sub { font-size: 13px; color: var(--mobile-text-secondary); line-height: 1.45; margin: 3px 0 0; }
  .mdm-stale { color: #d98a00; font-weight: 600; }
  .mdm-what { margin: 10px 0 4px; font-size: 13px; color: var(--mobile-text-secondary); }
  .mdm-what summary { cursor: pointer; color: var(--mobile-accent); font-weight: 600; margin-bottom: 6px; }
  .mdm-what p { margin: 8px 0 0; line-height: 1.45; }
  .mdm-run { width: 100%; border: 0; border-radius: 14px; padding: 14px; font-size: 16px; font-weight: 700; background: var(--mobile-accent); color: var(--mobile-on-accent, #fff); margin-top: 10px; }
  .mdm-run.danger { background: #dd3333; color: #fff; }
  .mdm-run.ghost { background: none; border: 1px solid var(--mobile-border); color: var(--mobile-text); }
  .mdm-run:disabled { opacity: .45; }
  .mdm-actions { margin-bottom: 12px; }
  .mdm-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .mdm-confirm { border-color: #dd3333; }
  .mdm-error { color: var(--mobile-danger, #d33); font-size: 14px; margin: 0 4px 12px; }
  .mdm-ok { color: #2fb36d; font-size: 14px; font-weight: 600; margin: 0 4px 12px; }
  .mdm-bad { color: #dd3333; }
  .mdm-link { margin: 8px 0; padding: 10px; border-radius: 10px; background: var(--mobile-bg, rgba(0,0,0,.04)); border: 1px solid var(--mobile-border); font-family: ui-monospace, monospace; font-size: 12px; overflow-wrap: anywhere; user-select: all; -webkit-user-select: all; }
  .mdm-steps { margin: 8px 0 0; padding-left: 18px; line-height: 1.6; }
  .mdm-inline { display: flex; gap: 8px; margin-top: 10px; }
  .mdm-input { flex: 1; width: 100%; min-width: 0; border: 1px solid var(--mobile-border); border-radius: 10px; padding: 10px 12px; font: inherit; font-size: 15px; background: var(--mobile-bg, transparent); color: var(--mobile-text); margin-top: 8px; }
  .mdm-inline .mdm-input { margin-top: 0; }
  .mdm-small { flex: none; border: 0; border-radius: 10px; padding: 10px 14px; font-size: 14px; font-weight: 700; background: var(--mobile-accent); color: var(--mobile-on-accent, #fff); }
  .mdm-small:disabled { opacity: .45; }
  .mdm-section-title { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--mobile-text-secondary); margin-bottom: 6px; }
  .mdm-when { font-weight: 500; letter-spacing: 0; text-transform: none; }
  .mdm-apps summary { cursor: pointer; list-style: none; }
  .mdm-line { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; padding: 5px 0; border-top: 1px solid var(--mobile-border); }
  .mdm-line:first-of-type { border-top: 0; }
  .mdm-line span:first-child { color: var(--mobile-text-secondary); }
  .mdm-line span:last-child { text-align: right; font-weight: 500; overflow-wrap: anywhere; }
  .mdm-hist { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; font-size: 14px; padding: 8px 0; border-top: 1px solid var(--mobile-border); }
  .mdm-hist:first-of-type { border-top: 0; }
  .mdm-pill { flex: none; display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 12px; font-weight: 700; background: rgba(127,127,127,.15); color: var(--mobile-text-secondary); white-space: nowrap; }
  .mdm-pill.good { background: rgba(47,179,109,.15); color: #2fb36d; }
  .mdm-pill.bad { background: rgba(221,51,51,.15); color: #dd3333; }
`
