import { useState, useEffect, useCallback } from 'react'
import { useMsal } from '@azure/msal-react'
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { getStaffIdToken, SignInNeeded } from '../../utils/staffToken'
import Icon from '../components/Icon'
import { Chip } from '../components/DH'
import { Screen, Card, Sec, KV, Field, Seg, Pills, Pill, Btn, Btns, Hero, Note, Empty, Sheet, Loading } from '../components/UI'

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const COMMAND_NAMES = {
  DeviceInformation: 'Device details', SecurityInfo: 'Security check', InstalledApplicationList: 'App list',
  DeviceLock: 'Lock', RestartDevice: 'Restart', ShutDownDevice: 'Shut down', RemoveProfile: 'Remove management',
  ProfileList: 'Profile check', CertificateList: 'Certificate check',
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
    <Screen title="Device management" onBack={goBack}>
      {me?.isAdmin && (
        <Seg value={tab} onChange={setTab} options={[{ value: 'mine', label: 'My iPhone' }, { value: 'team', label: 'Staff phones' }]} />
      )}

      <Note tone="error">{error}</Note>
      {!me && !error && <Loading />}
      {me && !me.pushReady && <Note tone="warn">Device management is still being set up: commands will queue but phones can't be woken to collect them yet.</Note>}

      {me && tab === 'mine' && <MyPhone me={me} call={call} onOpen={setOpenUdid} />}
      {me && tab === 'team' && me.isAdmin && <TeamPhones call={call} onOpen={setOpenUdid} />}
    </Screen>
  )
}

function WhatWeSee() {
  return (
    <Card pad>
      <span className="dh-t">What DH can and can't do</span>
      <span className="dh-sub"><b>Can:</b> see the model, iOS version, storage, battery and serial number; check a passcode is set and the phone is encrypted; see which apps are installed; lock the screen, or lock it with a message to call us if it's lost.</span>
      <span className="dh-sub"><b>Can't:</b> erase the phone, read messages, email, photos, files or browsing, or see where the phone is. Restart and shut down only work on company phones set up through Apple Business Manager.</span>
      <span className="dh-sub">You can remove it any time in Settings &gt; General &gt; VPN &amp; Device Management.</span>
    </Card>
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
      {me.devices.length > 0 && (
        <>
          <Sec>Your iPhone</Sec>
          <div className="dh-card">{me.devices.map((d) => <DeviceRow key={d.udid} d={d} onOpen={onOpen} />)}</div>
        </>
      )}

      <Card pad>
        <span className="dh-t">{me.devices.length ? 'Enrol another iPhone' : 'Add this iPhone to DH device management'}</span>
        <span className="dh-sub">If your phone is lost or stolen, DH can lock it straight away with a message asking whoever finds it to call us. We can also check it's secure and up to date.</span>
        <Btn onPress={enrol} disabled={busy}>{busy ? 'Getting your link…' : 'Enrol this iPhone'}</Btn>
        <Note tone="error">{error}</Note>
      </Card>

      {link && <EnrolSteps link={link} />}

      <WhatWeSee />
    </>
  )
}

function EnrolSteps({ link, email, onShare }) {
  return (
    <>
      <Hero>
        {email && <span className="dh-sub">Link for {email}</span>}
        <span className="dh-t" style={{ fontSize: 17 }}>{email ? "Open this on the iPhone you're adding" : 'Safari should have opened. If not, open this link in Safari'}</span>
        <span className="dh-sub">It works once, for 24 hours.</span>
        <div className="dh-mono" style={{ background: 'rgba(255,255,255,.12)', borderColor: 'rgba(255,255,255,.25)', color: '#fff' }}>{link}</div>
        {onShare && <Btn variant="outline" onPress={onShare}>Share link</Btn>}
      </Hero>
      <Sec>On the iPhone</Sec>
      <div className="dh-card">
        <div className="dh-row"><Chip tone="blue">1</Chip><span className="dh-g"><span className="dh-t">Open the link, tap Allow</span><span className="dh-sub">Safari downloads the DH profile</span></span></div>
        <div className="dh-row"><Chip>2</Chip><span className="dh-g"><span className="dh-t">Settings, Profile Downloaded, Install</span><span className="dh-sub">Enter the phone's passcode</span></span></div>
        <div className="dh-row"><Chip>3</Chip><span className="dh-g"><span className="dh-t">Trust Remote Management</span><span className="dh-sub">Settings, General, VPN and Device Management</span></span></div>
        <div className="dh-row"><Chip>4</Chip><span className="dh-g"><span className="dh-t">Back here</span><span className="dh-sub">It shows as enrolled within a minute</span></span></div>
      </div>
    </>
  )
}

function DeviceRow({ d, onOpen }) {
  const stale = d.infoAt && Date.now() - d.infoAt > 24 * 3600 * 1000
  return (
    <button type="button" className="dh-row" onClick={() => onOpen(d.udid)}>
      <span className={`dh-ic${d.status === 'removed' ? ' muted' : ''}`}><Icon name="smartphone" size={18} /></span>
      <span className="dh-g">
        <span className="dh-t">{d.name || d.model || 'iPhone'}</span>
        <span className="dh-sub">{[d.owner || d.email, d.model, d.osVersion && `iOS ${d.osVersion}`].filter(Boolean).join(' · ')}</span>
        <span className="dh-sub">
          {d.status === 'enrolled' ? <>Details {d.infoAt ? <span style={stale ? { color: '#8A4A00', fontWeight: 600 } : undefined}>{ago(d.infoAt)}</span> : 'not in yet'}</> : d.status === 'enrolling' ? 'Enrolling…' : 'Removed'}
          {d.battery != null && ` · ${d.battery}% battery`}
          {d.freeGB != null && ` · ${gb(d.freeGB)} free`}
        </span>
      </span>
      {d.status === 'enrolled' && d.passcode === false ? <Chip tone="red">No passcode</Chip> : d.supervised ? <Chip tone="green">Supervised</Chip> : null}
      <span className="dh-chev"><Icon name="chevron-right" size={18} /></span>
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
      <Note tone="error">{error}</Note>
      {!devices && !error && <Loading>Loading phones…</Loading>}
      {devices && !active.length && <Empty icon="smartphone" title="No phones enrolled yet" sub="Make a link below for a staff member's iPhone." />}
      {active.length > 0 && (
        <>
          <Sec>Staff phones</Sec>
          <div className="dh-card">{active.map((d) => <DeviceRow key={d.udid} d={d} onOpen={onOpen} />)}</div>
        </>
      )}

      <Card pad>
        <span className="dh-t">Enrol a staff member's iPhone</span>
        <span className="dh-sub">Makes a one-time link for them to open in Safari on their phone. Send it to them: it works once, for 24 hours.</span>
        <input className="dh-input" type="email" placeholder="name@dhwebsiteservices.co.uk" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="off" autoCorrect="off" aria-label="Their work email" />
        <Btn onPress={makeLink} disabled={!email.includes('@')}>Make link</Btn>
      </Card>

      {link && <EnrolSteps link={link} email={email.trim().toLowerCase()} onShare={share} />}

      {removed.length > 0 && (
        <details className="dh-card">
          <summary className="dh-row"><span className="dh-g"><span className="dh-t">Removed phones ({removed.length})</span></span><span className="dh-chev"><Icon name="chevron-down" size={18} /></span></summary>
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
  const [view, setView] = useState('main') // 'main' | 'history' | 'apps'

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
  const title = d?.name || d?.model || 'iPhone'

  if (view === 'history' && data) {
    return (
      <Screen title="History" onBack={() => setView('main')}>
        <span className="dh-sub">Every command sent to this phone and what it said back.</span>
        {data.commands?.length ? (
          <div className="dh-card">
            {data.commands.map((c) => (
              <div key={c.uuid} className="dh-row top">
                <span className="dh-g">
                  <span className="dh-t">{COMMAND_NAMES[c.request_type] || c.request_type}</span>
                  <span className="dh-sub">{when(c.queued_at)} · {c.queued_by === 'auto-refresh' || c.queued_by === 'enrolment' ? 'automatic' : c.queued_by}</span>
                  {c.error && <span className="dh-sub" style={{ color: '#B42318' }}>{c.error}</span>}
                </span>
                <Chip tone={c.status === 'done' ? 'green' : c.status === 'error' ? 'red' : c.status === 'sent' ? 'blue' : c.status === 'notnow' || c.status === 'queued' ? 'amber' : 'neutral'}>{STATUS_NAMES[c.status] || c.status}</Chip>
              </div>
            ))}
          </div>
        ) : <Empty title="Nothing sent yet" />}
      </Screen>
    )
  }

  if (view === 'apps' && d) {
    return (
      <Screen title={`Apps (${d.apps?.length || 0})`} onBack={() => setView('main')}>
        <span className="dh-sub">Installed apps{d.appsAt ? `, as of ${ago(d.appsAt)}` : ''}.</span>
        {data.health?.largestApps?.length > 0 && (
          <>
            <Sec>Biggest apps</Sec>
            <div className="dh-card">
              {data.health.largestApps.map((a) => <KV key={a.name} k={a.name} v={a.sizeMB >= 1000 ? `${(a.sizeMB / 1000).toFixed(1)} GB` : `${a.sizeMB} MB`} />)}
            </div>
          </>
        )}
        <Sec>All apps</Sec>
        <div className="dh-card">
          {(d.apps || []).map((a) => <KV key={a.id || a.name} k={a.name || a.id} v={a.version ? `v${a.version}` : ''} />)}
        </div>
      </Screen>
    )
  }

  const health = data?.health
  const order = { bad: 0, warn: 1, info: 2, ok: 3 }
  const checks = health?.checks?.length ? [...health.checks].sort((a, b) => order[a.status] - order[b.status]) : []
  const healthChip = health?.worst ? <Chip tone={health.worst === 'bad' ? 'red' : health.worst === 'warn' ? 'amber' : 'green'}>{HEALTH_HEAD[health.worst]}</Chip> : null
  const yn = (v, good = true) => (v == null ? <span className="dh-sub">—</span> : <Chip tone={good === null ? 'neutral' : v === good ? 'green' : 'red'}>{v ? 'Yes' : 'No'}</Chip>)

  return (
    <Screen title={title} onBack={onBack}>
      <Note tone="error">{error}</Note>
      {!d && !error && <Loading />}

      {d && (
        <>
          <Hero dark>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span className="dh-t">{[d.model || d.product, d.osVersion && `iOS ${d.osVersion}`].filter(Boolean).join(' · ') || title}</span>
              {healthChip}
            </div>
            <span className="dh-sub">
              {[d.owner || d.email, d.supervised ? 'supervised' : null, d.status === 'enrolled' ? `details from ${ago(d.infoAt)}` : d.status, d.lastSeen ? `last checked in ${ago(d.lastSeen)}` : null].filter(Boolean).join(' · ')}
            </span>
          </Hero>

          <div className="dh-tiles t3">
            <div className="dh-tile"><span className="dh-num">{d.battery != null ? `${d.battery}%` : '–'}</span><span className="dh-sub">Battery</span></div>
            <div className="dh-tile"><span className="dh-num">{d.freeGB != null ? gb(d.freeGB) : '–'}</span><span className="dh-sub">Storage free</span></div>
            <div className="dh-tile"><span className="dh-num">{d.lastBackup ? new Date(d.lastBackup).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '–'}</span><span className="dh-sub">Last backup</span></div>
          </div>

          <Note tone="ok">{note}</Note>

          {enrolled && (
            <Pills>
              <Pill onPress={() => send('refresh')} disabled={!!busy}>{busy === 'refresh' ? 'Asking…' : 'Run health check'}</Pill>
              <Pill onPress={() => send('screenlock')} disabled={!!busy}>{busy === 'screenlock' ? 'Locking…' : 'Lock screen'}</Pill>
              <Pill onPress={() => setLockOpen(true)} disabled={!!busy}>Lock with message</Pill>
              {canAdmin && <Pill onPress={() => setConfirm('restart')} disabled={!!busy || !d.supervised}>Restart</Pill>}
              {canAdmin && <Pill onPress={() => setConfirm('shutdown')} disabled={!!busy || !d.supervised}>Shut down</Pill>}
              {data.commands?.length > 0 && <Pill onPress={() => setView('history')}>History</Pill>}
            </Pills>
          )}
          {enrolled && canAdmin && !d.supervised && (
            <Note>Restart and shut down are greyed out because Apple only allows them on supervised phones (company phones set up through Apple Business Manager). Lock works on every enrolled phone.</Note>
          )}

          {checks.length > 0 && (
            <>
              <Sec>Health check{health.checkedAt ? ` · ${ago(health.checkedAt)}` : ''}</Sec>
              <div className="dh-card">
                {checks.map((c) => (
                  <div key={c.key} className="dh-row top">
                    <span className={`dh-dot ${c.status}`} style={{ marginTop: 6 }} />
                    <span className="dh-g">
                      <span className="dh-t">{c.title}</span>
                      {c.detail ? <span className="dh-sub">{c.detail}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <Sec>Security check{d.securityAt ? ` · ${ago(d.securityAt)}` : ''}</Sec>
          <div className="dh-card">
            <div className="dh-row"><span className="dh-g"><span className="dh-t">Passcode set</span></span>{yn(d.passcode)}</div>
            <div className="dh-row"><span className="dh-g"><span className="dh-t">Encrypted</span></span>{yn(d.encrypted)}</div>
            <div className="dh-row"><span className="dh-g"><span className="dh-t">Find My on</span></span>{yn(d.findMy)}</div>
            <div className="dh-row"><span className="dh-g"><span className="dh-t">iCloud Backup on</span></span>{yn(d.icloudBackup)}</div>
            {d.apps?.length > 0 && (
              <button type="button" className="dh-row" onClick={() => setView('apps')}>
                <span className="dh-g"><span className="dh-t">Apps</span><span className="dh-sub">{d.apps.length} installed{health?.largestApps?.length ? ' · biggest apps' : ''}</span></span>
                <span className="dh-chev"><Icon name="chevron-right" size={18} /></span>
              </button>
            )}
          </div>

          <Sec>Phone</Sec>
          <div className="dh-card">
            <KV k="Model" v={d.model || d.product} />
            <KV k="iOS" v={d.osVersion} />
            <KV k="Serial number" v={d.serial} />
            <KV k="Storage free" v={d.freeGB != null ? `${gb(d.freeGB)} of ${gb(d.capacityGB)}` : null} />
            <KV k="Supervised" v={yn(d.supervised, null)} />
            <KV k="Enrolled" v={when(d.enrolledAt)} />
          </div>

          {canAdmin && d.status !== 'removed' && (
            <Btn variant="danger" onPress={() => setConfirm('remove')}>Remove from management</Btn>
          )}
        </>
      )}

      {lockOpen && (
        <Sheet title="Lock with a message?" sub="The screen locks straight away and needs the passcode to open. The message and our number show on the Lock Screen." onClose={() => setLockOpen(false)}>
          <div className="dh-card">
            <Field label="Message on the lock screen" htmlFor="dm-lock">
              <textarea id="dm-lock" rows={3} maxLength={200} placeholder="This iPhone belongs to DH Website Services. If found, please call 01443 805303." value={lockMessage} onChange={(e) => setLockMessage(e.target.value)} />
            </Field>
          </div>
          <Btns>
            <Btn variant="outline" onPress={() => setLockOpen(false)}>Cancel</Btn>
            <Btn onPress={() => send('lock', lockMessage.trim() ? { message: lockMessage.trim() } : {})} disabled={!!busy}>{busy === 'lock' ? 'Locking…' : 'Lock it'}</Btn>
          </Btns>
        </Sheet>
      )}

      {confirm && confirm !== 'remove' && (
        <Sheet title={`${confirm === 'restart' ? 'Restart' : 'Shut down'} this iPhone?`} sub={confirm === 'restart' ? 'It restarts straight away, and anything unsaved in open apps is lost.' : 'It turns off and stays off until someone holds the side button.'} onClose={() => setConfirm(null)}>
          <Btns>
            <Btn variant="outline" onPress={() => setConfirm(null)}>Cancel</Btn>
            <Btn variant="danger" className="solid" onPress={() => send(confirm)} disabled={!!busy}>{confirm === 'restart' ? 'Restart' : 'Shut down'}</Btn>
          </Btns>
        </Sheet>
      )}

      {confirm === 'remove' && (
        <Sheet title="Take this iPhone out of DH management?" sub="The profile is removed from the phone. Nothing else on it changes. They can enrol again later." onClose={() => setConfirm(null)}>
          <Btns>
            <Btn variant="outline" onPress={() => setConfirm(null)}>Cancel</Btn>
            <Btn variant="danger" className="solid" onPress={remove} disabled={!!busy}>Remove</Btn>
          </Btns>
        </Sheet>
      )}
    </Screen>
  )
}

const HEALTH_HEAD = {
  ok: 'All good',
  info: 'All good',
  warn: 'Needs a look',
  bad: 'Needs fixing',
}
