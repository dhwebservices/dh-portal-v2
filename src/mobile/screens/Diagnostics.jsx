import { useState, useEffect, useRef } from 'react'
import { useMsal } from '@azure/msal-react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { getStaffIdToken, SignInNeeded } from '../../utils/staffToken'
import { getRegisteredPushToken } from '../../utils/pushNotifications'
import { apiUrl } from '../../utils/apiBase'
import { Chip } from '../components/DH'
import { Screen, Card, Sec, KV, Seg, Btn, Hero, Note, Empty, Loading, ToggleRow } from '../components/UI'

/**
 * Diagnostics: check this iPhone, and (for admins) run checks on staff phones.
 *
 * The checks themselves are native (ios/App/App/Diagnostics.swift) so they can
 * also run when a silent push wakes the app in the background. This screen:
 *   - lets the person switch remote diagnostics on or off for this phone,
 *   - runs a check on demand, with the checklist ticking through,
 *   - finishes a check an admin asked for, when opened from that notification,
 *   - for admins, lists staff phones and asks them for a check remotely.
 */

const NativeDiagnostics = registerPlugin('Diagnostics')
const isNative = Capacitor.isNativePlatform()

const STEPS = [
  ['device', 'Device and iOS'],
  ['battery', 'Battery and power'],
  ['thermal', 'Temperature'],
  ['storage', 'Storage'],
  ['memory', 'Memory'],
  ['restarts', 'Restarts'],
  ['network', 'Network and speed'],
  ['services', 'DH services'],
  ['stability', 'App crashes and freezes'],
]

const MODELS = {
  'iPhone14,5': 'iPhone 13', 'iPhone14,4': 'iPhone 13 mini', 'iPhone14,2': 'iPhone 13 Pro', 'iPhone14,3': 'iPhone 13 Pro Max',
  'iPhone14,7': 'iPhone 14', 'iPhone14,8': 'iPhone 14 Plus', 'iPhone15,2': 'iPhone 14 Pro', 'iPhone15,3': 'iPhone 14 Pro Max',
  'iPhone15,4': 'iPhone 15', 'iPhone15,5': 'iPhone 15 Plus', 'iPhone16,1': 'iPhone 15 Pro', 'iPhone16,2': 'iPhone 15 Pro Max',
  'iPhone17,3': 'iPhone 16', 'iPhone17,4': 'iPhone 16 Plus', 'iPhone17,1': 'iPhone 16 Pro', 'iPhone17,2': 'iPhone 16 Pro Max',
  'iPhone18,3': 'iPhone 17', 'iPhone18,1': 'iPhone 17 Pro', 'iPhone18,2': 'iPhone 17 Pro Max',
}
const modelName = (m) => MODELS[m] || m || 'iPhone'
const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default function MobileDiagnostics({ goBack, isAdmin, diag, diagKey }) {
  const { instance, accounts } = useMsal()
  const account = accounts?.[0]
  const token = getRegisteredPushToken()

  const [consent, setConsent] = useState(false)
  const [consentBusy, setConsentBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [stepDone, setStepDone] = useState(0)
  const [report, setReport] = useState(null)
  const [sendState, setSendState] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState(isAdmin && !diag ? 'team' : 'mine')
  const autoRan = useRef(false)

  const call = async (path, body, { interactive = false, authed = true } = {}) => {
    const headers = { 'Content-Type': 'application/json' }
    if (authed) headers.Authorization = `Bearer ${await getStaffIdToken({ instance, account, interactive })}`
    const res = await fetch(apiUrl(`/api/diagnostics/${path}`), { method: 'POST', headers, body: JSON.stringify(body || {}) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status}).`)
    return data
  }

  useEffect(() => {
    if (!isNative) return
    NativeDiagnostics.getConsent().then((r) => setConsent(!!r.enabled)).catch(() => {})
  }, [])

  // Opened from "Run a quick check?" - finish the check that was asked for.
  useEffect(() => {
    if (diag && diagKey && isNative && !autoRan.current) {
      autoRan.current = true
      setTab('mine')
      runCheck({ id: diag, key: diagKey })
    }
  }, [diag, diagKey])

  const toggleConsent = async () => {
    if (!isNative) return
    setError('')
    if (!token) {
      setError('Allow notifications for DH Staff Portal first (iPhone Settings > Notifications), then reopen the app.')
      return
    }
    const next = !consent
    setConsentBusy(true)
    try {
      await call('consent', { token, consent: next }, { interactive: true })
      await NativeDiagnostics.setConsent({ enabled: next })
      setConsent(next)
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    } catch (e) {
      setError(e instanceof SignInNeeded ? 'Sign in again to change this.' : e.message)
    } finally {
      setConsentBusy(false)
    }
  }

  async function runCheck(requested) {
    if (!isNative || running) return
    setError('')
    setReport(null)
    setSendState('')
    setRunning(true)
    setStepDone(0)
    // Tick through the list while the checks run (they take a few seconds).
    let shown = 0
    const ticker = setInterval(() => { shown = Math.min(shown + 1, STEPS.length - 2); setStepDone(shown) }, 380)
    try {
      const { report: r } = await NativeDiagnostics.run({ trigger: requested ? 'remote' : 'manual' })
      clearInterval(ticker)
      for (let i = shown + 1; i <= STEPS.length; i++) { setStepDone(i); await sleep(140) }
      setReport(r)
      Haptics.notification({ type: (r.issues || []).length ? NotificationType.Warning : NotificationType.Success }).catch(() => {})
      // Send it to DH.
      setSendState('sending')
      try {
        if (requested) await call('report', { id: requested.id, key: requested.key, report: r }, { authed: false })
        else if (token) await call('report', { token, report: r })
        else throw new Error('This iPhone is not registered for notifications yet.')
        setSendState('sent')
      } catch (e) {
        setSendState(e instanceof SignInNeeded ? 'Sign in again to send the report.' : e.message)
      }
    } catch (e) {
      clearInterval(ticker)
      setError(e.message || 'The check could not run.')
    } finally {
      setRunning(false)
    }
  }

  const verdict = report ? ((report.issues || []).length ? `${report.issues.length} thing${report.issues.length === 1 ? '' : 's'} worth a look` : 'All checks passed') : running ? 'Checking this iPhone…' : 'Check this iPhone'
  return (
    <Screen title="Diagnostics" onBack={goBack}>
      {isAdmin && (
        <Seg value={tab} onChange={setTab} options={[{ value: 'mine', label: 'This iPhone' }, { value: 'team', label: 'Staff phones' }]} />
      )}

      {tab === 'mine' && (
        <>
          {!isNative && <Note>Open the DH Staff Portal app on an iPhone to check that phone.</Note>}

          {isNative && (
            <Hero dark>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span className="dh-t">{verdict}</span>
                {report && <Chip tone={(report.issues || []).length ? 'amber' : 'green'}>{(report.issues || []).length ? 'Needs a look' : 'Healthy'}</Chip>}
              </div>
              <span className="dh-sub">
                {report ? `Ran ${when(report.ranAt)}` : 'Device, power, storage, network, DH services and this app.'}
                {report && sendState ? ` · ${sendState === 'sending' ? 'sending to DH…' : sendState === 'sent' ? 'report sent to DH' : `not sent: ${sendState}`}` : ''}
              </span>
              <Btn onPress={() => runCheck(null)} disabled={running}>{running ? 'Checking…' : report ? 'Run again' : 'Run checks'}</Btn>
            </Hero>
          )}

          {running && (
            <div className="dh-card">
              {STEPS.map(([k, label], i) => (
                <div key={k} className="dh-row">
                  <span className="dh-g"><span className="dh-t" style={{ fontWeight: i <= stepDone ? 600 : 500, color: i <= stepDone ? undefined : 'var(--mobile-text-secondary)' }}>{label}</span></span>
                  {i < stepDone ? <Chip tone="green">OK</Chip> : i === stepDone ? <Chip tone="blue">Checking</Chip> : null}
                </div>
              ))}
            </div>
          )}

          <Note tone="error">{error}</Note>

          {report && !running && <ReportView report={report} />}

          {isNative && (
            <>
              <div className="dh-card">
                <ToggleRow title="Allow remote checks" sub={consent ? 'On. DH can ask this iPhone for a check at any time.' : 'Off. Only you can run a check.'} on={consent} onChange={toggleConsent} disabled={consentBusy} />
              </div>
              <Card pad>
                <span className="dh-t">What a check looks at</span>
                <span className="dh-sub">Model and iOS version, battery level and Low Power Mode, temperature, free storage, memory, when the phone last restarted, connection type and speed, whether DH services respond, and this app's own crash and freeze reports from Apple.</span>
                <span className="dh-sub">It can't see your messages, photos, location, other apps or anything you type, and it can't restart or lock the phone. You can switch this off at any time.</span>
              </Card>
            </>
          )}
        </>
      )}

      {tab === 'team' && isAdmin && <TeamDevices call={call} />}
    </Screen>
  )
}

function TeamDevices({ call }) {
  const [devices, setDevices] = useState(null)
  const [error, setError] = useState('')
  const [active, setActive] = useState({}) // token -> { id, phase, report, note }
  const [open, setOpen] = useState(null)

  const load = async () => {
    setError('')
    try {
      const d = await call('devices', {}, { interactive: true })
      setDevices(d.devices || [])
    } catch (e) {
      setError(e.message)
    }
  }
  useEffect(() => { load() }, [])

  const set = (token, patch) => setActive((a) => ({ ...a, [token]: { ...(a[token] || {}), ...patch } }))

  const request = async (device) => {
    const t = device.fcm_token
    set(t, { phase: 'asking', note: 'Waking the phone…', report: null })
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    try {
      const r = await call('request', { token: t })
      set(t, { id: r.id, phase: 'waiting', note: r.pushed ? 'Waiting for the phone to answer…' : `Couldn't wake it (${r.pushError}). Sending a notification instead…` })
      let nudged = false
      for (let i = 0; i < 40; i++) {
        await sleep(3000)
        const s = await call('status', { id: r.id })
        if (s.check?.status === 'done') {
          set(t, { phase: 'done', note: `Checked ${when(s.check.completed_at)}`, report: s.check.report })
          setOpen(t)
          Haptics.notification({ type: NotificationType.Success }).catch(() => {})
          load()
          return
        }
        if (s.check?.status === 'expired') break
        if (!nudged && (i >= 10 || !r.pushed)) {
          nudged = true
          await call('nudge', { id: r.id })
          set(t, { note: 'No answer in the background, so a notification was sent asking them to tap it.' })
        }
      }
      set(t, { phase: 'timeout', note: 'No answer yet. The report will appear here when they open the notification.' })
    } catch (e) {
      set(t, { phase: 'error', note: e.message })
    }
  }

  const showHistory = async (device) => {
    const t = device.fcm_token
    if (open === t) { setOpen(null); return }
    setOpen(t)
    if (active[t]?.report) return
    try {
      const h = await call('history', { token: t })
      const last = (h.history || []).find((x) => x.status === 'done')
      set(t, { report: last?.report || null, note: last ? `Last checked ${when(last.completed_at)}` : 'No reports yet.' })
    } catch (e) {
      set(t, { note: e.message })
    }
  }

  if (error) return <Note tone="error">{error}</Note>
  if (!devices) return <Loading>Loading staff phones…</Loading>
  if (!devices.length) return <Empty icon="smartphone" title="No iPhones registered yet" />

  const initials = (e) => e.split('@')[0].slice(0, 2).toUpperCase()
  return (
    <>
      <span className="dh-sub">A check runs in the background when the phone allows it. If it doesn't answer, they get a notification to tap. Phones only appear as ready once their owner switches checks on.</span>
      {devices.map((d) => {
        const a = active[d.fcm_token] || {}
        const issues = d.last?.summary?.issues || []
        const busy = a.phase === 'asking' || a.phase === 'waiting'
        return (
          <div key={d.fcm_token} className="dh-card">
            <button type="button" className="dh-row" onClick={() => showHistory(d)}>
              <span className="dh-av round">{initials(d.user_email)}</span>
              <span className="dh-g">
                <span className="dh-t">{d.user_email.split('@')[0]} · {modelName(d.device_model)}</span>
                <span className="dh-sub">
                  iOS {d.os_version || '?'} · {d.diagnostics_consent ? 'checks allowed' : 'checks not switched on'}
                  {d.last?.completed_at ? ` · last ${when(d.last.completed_at)}` : ''}
                </span>
              </span>
              {issues.length > 0 ? <Chip tone="amber">{issues.length} issue{issues.length === 1 ? '' : 's'}</Chip> : d.last?.completed_at ? <Chip tone="green">Healthy</Chip> : null}
            </button>
            <div className="dh-row">
              <span className="dh-g"><span className="dh-sub">{a.note || (d.diagnostics_consent ? 'Ready for a check.' : 'They need to switch on remote checks first.')}</span></span>
              <Btn small disabled={!d.diagnostics_consent || busy} onPress={() => request(d)}>{busy ? '…' : 'Run check'}</Btn>
            </div>
            {open === d.fcm_token && a.report && <div style={{ padding: '0 16px 16px' }}><ReportView report={a.report} compact /></div>}
          </div>
        )
      })}
    </>
  )
}

const TONE = { good: 'green', warn: 'amber', bad: 'red' }
function Pill({ tone, children }) {
  return <Chip tone={TONE[tone] || 'neutral'}>{children}</Chip>
}

function ReportView({ report: r, compact }) {
  const issues = r.issues || []
  const b = r.battery || {}, s = r.storage || {}, m = r.memory || {}, re = r.restarts || {}, n = r.network || {}, st = r.stability || {}
  const tempTone = r.thermal === 'normal' ? 'good' : r.thermal === 'fair' ? 'warn' : 'bad'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {(compact || issues.length > 0) && (
        <Card pad tone={issues.length ? 'warn' : undefined}>
          <span className="dh-t" style={{ color: issues.length ? '#8A4A00' : '#1E7B3A' }}>
            {issues.length ? `${issues.length} thing${issues.length === 1 ? '' : 's'} worth a look` : 'All checks look healthy'}
          </span>
          {issues.map((x, i) => <span key={i} className="dh-sub">• {x}</span>)}
        </Card>
      )}

      <Section title="Device">
        <KV k="Model" v={modelName(r.device?.model)} />
        <KV k="iOS" v={r.device?.system} />
        <KV k="App" v={r.device?.appVersion} />
      </Section>
      <Section title="Power">
        <KV k="Battery" v={b.level == null ? 'Unknown' : `${b.level}% · ${b.state}`} />
        <KV k="Low Power Mode" v={<Pill tone={b.lowPowerMode ? 'warn' : 'good'}>{b.lowPowerMode ? 'On' : 'Off'}</Pill>} />
        <KV k="Temperature" v={<Pill tone={tempTone}>{r.thermal}</Pill>} />
      </Section>
      <Section title="Storage and memory">
        <KV k="Free storage" v={<Pill tone={s.freeGB < 2 ? 'bad' : s.freeGB < 5 ? 'warn' : 'good'}>{`${s.freeGB} GB of ${s.totalGB} GB`}</Pill>} />
        <KV k="Memory" v={`${m.physicalGB} GB`} />
      </Section>
      <Section title="Restarts">
        <KV k="Last restart" v={when(re.lastBoot)} />
        <KV k="Up for" v={re.uptimeHours != null ? `${re.uptimeHours} h` : '—'} />
        <KV k="Restarts seen (7 days)" v={<Pill tone={re.seenLast7Days >= 2 ? 'warn' : 'good'}>{String(re.seenLast7Days ?? 0)}</Pill>} />
      </Section>
      <Section title="Network">
        <KV k="Connection" v={n.online ? `${n.type}${n.constrained ? ' (Low Data Mode)' : ''}` : <Pill tone="bad">Offline</Pill>} />
        <KV k="Download" v={n.speed?.downMbps != null ? `${n.speed.downMbps} Mbps` : '—'} />
        {(r.services || []).map((x) => (
          <KV key={x.name} k={x.name} v={<Pill tone={!x.ok ? 'bad' : x.ms > 1500 ? 'warn' : 'good'}>{x.ok ? `${x.ms} ms` : 'Unreachable'}</Pill>} />
        ))}
      </Section>
      <Section title="This app (last 7 days)">
        <KV k="Crashes" v={String(st.appCrashes7d ?? 0)} />
        <KV k="Freezes" v={String(st.appHangs7d ?? 0)} />
        <KV k="Closed for memory" v={String(st.memoryExits7d ?? 0)} />
      </Section>
      <span className="dh-sub">Ran {when(r.ranAt)} · {r.trigger === 'remote' ? 'asked for by DH' : 'run on the phone'}{r.appState === 'background' ? ' · in the background' : ''}</span>
    </div>
  )
}

const Section = ({ title, children }) => (
  <>
    <Sec>{title}</Sec>
    <div className="dh-card">{children}</div>
  </>
)
