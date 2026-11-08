import { useState, useEffect, useRef } from 'react'
import { useMsal } from '@azure/msal-react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { getStaffIdToken, SignInNeeded } from '../../utils/staffToken'
import { getRegisteredPushToken } from '../../utils/pushNotifications'
import { apiUrl } from '../../utils/apiBase'
import Icon from '../components/Icon'

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

  return (
    <div className="diag-screen">
      <div className="diag-head">
        <button className="diag-back" onClick={goBack} aria-label="Back"><Icon name="chevronLeft" size={20} /></button>
        <h1>Diagnostics</h1>
      </div>

      {isAdmin && (
        <div className="diag-tabs">
          <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>This iPhone</button>
          <button className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>Staff phones</button>
        </div>
      )}

      {tab === 'mine' && (
        <>
          {!isNative && <p className="diag-note">Open the DH Staff Portal app on an iPhone to check that phone.</p>}

          {isNative && (
            <div className="diag-card">
              <div className="diag-row">
                <div>
                  <div className="diag-label">Allow DH to run checks remotely</div>
                  <div className="diag-sub">{consent ? 'On. DH can ask this iPhone for a check at any time.' : 'Off. Only you can run a check.'}</div>
                </div>
                <button className={`diag-toggle ${consent ? 'on' : ''}`} onClick={toggleConsent} disabled={consentBusy} aria-pressed={consent} aria-label="Allow remote checks"><span /></button>
              </div>
              <details className="diag-what">
                <summary>What a check looks at</summary>
                <p>Model and iOS version, battery level and Low Power Mode, temperature, free storage, memory, when the phone last restarted, connection type and speed, whether DH services respond, and this app's own crash and freeze reports from Apple.</p>
                <p>It can't see your messages, photos, location, other apps or anything you type, and it can't restart or lock the phone. You can switch this off at any time.</p>
              </details>
            </div>
          )}

          {isNative && (
            <button className="diag-run" onClick={() => runCheck(null)} disabled={running}>
              {running ? 'Checking…' : report ? 'Run again' : 'Run diagnostics'}
            </button>
          )}

          {(running || report) && (
            <div className="diag-card diag-steps">
              {STEPS.map(([k, label], i) => (
                <div key={k} className={`diag-step ${i < stepDone ? 'done' : i === stepDone && running ? 'now' : ''}`}>
                  <span className="dot">{i < stepDone ? '✓' : ''}</span>{label}
                </div>
              ))}
            </div>
          )}

          {error && <p className="diag-error">{error}</p>}

          {report && (
            <>
              <p className={`diag-send ${sendState === 'sent' ? 'ok' : ''}`}>
                {sendState === 'sending' ? 'Sending to DH…' : sendState === 'sent' ? 'Report sent to DH.' : sendState ? `Not sent: ${sendState}` : ''}
              </p>
              <ReportView report={report} />
            </>
          )}
        </>
      )}

      {tab === 'team' && isAdmin && <TeamDevices call={call} />}

      <style>{CSS}</style>
    </div>
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

  if (error) return <p className="diag-error">{error}</p>
  if (!devices) return <p className="diag-note">Loading staff phones…</p>
  if (!devices.length) return <p className="diag-note">No iPhones are registered yet.</p>

  return (
    <div className="diag-team">
      <p className="diag-note">A check runs in the background when the phone allows it. If it doesn't answer, they get a notification to tap. Phones only appear as ready once their owner switches checks on.</p>
      {devices.map((d) => {
        const a = active[d.fcm_token] || {}
        const issues = d.last?.summary?.issues || []
        return (
          <div key={d.fcm_token} className="diag-card">
            <div className="diag-row" onClick={() => showHistory(d)} style={{ cursor: 'pointer' }}>
              <div style={{ minWidth: 0 }}>
                <div className="diag-label">{d.user_email.split('@')[0]} · {modelName(d.device_model)}</div>
                <div className="diag-sub">
                  iOS {d.os_version || '?'} · {d.diagnostics_consent ? 'Checks allowed' : 'Checks not switched on'}
                  {d.last?.completed_at ? ` · last ${when(d.last.completed_at)}` : ''}
                </div>
                {issues.length > 0 && <div className="diag-pill warn">{issues.length} issue{issues.length === 1 ? '' : 's'} last time</div>}
              </div>
              <button className="diag-small" disabled={!d.diagnostics_consent || a.phase === 'asking' || a.phase === 'waiting'}
                onClick={(e) => { e.stopPropagation(); request(d) }}>
                {a.phase === 'asking' || a.phase === 'waiting' ? '…' : 'Run check'}
              </button>
            </div>
            {a.note && <p className="diag-sub" style={{ marginTop: 8 }}>{a.note}</p>}
            {open === d.fcm_token && a.report && <ReportView report={a.report} compact />}
          </div>
        )
      })}
    </div>
  )
}

function Pill({ tone, children }) {
  return <span className={`diag-pill ${tone}`}>{children}</span>
}

function ReportView({ report: r, compact }) {
  const issues = r.issues || []
  const b = r.battery || {}, s = r.storage || {}, m = r.memory || {}, re = r.restarts || {}, n = r.network || {}, st = r.stability || {}
  const tempTone = r.thermal === 'normal' ? 'good' : r.thermal === 'fair' ? 'warn' : 'bad'
  return (
    <div className={`diag-report ${compact ? 'compact' : ''}`}>
      <div className={`diag-verdict ${issues.length ? 'warn' : 'good'}`}>
        {issues.length ? `${issues.length} thing${issues.length === 1 ? '' : 's'} worth a look` : 'All checks look healthy'}
      </div>
      {issues.length > 0 && <ul className="diag-issues">{issues.map((x, i) => <li key={i}>{x}</li>)}</ul>}

      <Section title="Device">
        <Line k="Model" v={modelName(r.device?.model)} />
        <Line k="iOS" v={r.device?.system} />
        <Line k="App" v={r.device?.appVersion} />
      </Section>
      <Section title="Power">
        <Line k="Battery" v={b.level == null ? 'Unknown' : `${b.level}% · ${b.state}`} />
        <Line k="Low Power Mode" v={<Pill tone={b.lowPowerMode ? 'warn' : 'good'}>{b.lowPowerMode ? 'On' : 'Off'}</Pill>} />
        <Line k="Temperature" v={<Pill tone={tempTone}>{r.thermal}</Pill>} />
      </Section>
      <Section title="Storage and memory">
        <Line k="Free storage" v={<Pill tone={s.freeGB < 2 ? 'bad' : s.freeGB < 5 ? 'warn' : 'good'}>{`${s.freeGB} GB of ${s.totalGB} GB`}</Pill>} />
        <Line k="Memory" v={`${m.physicalGB} GB`} />
      </Section>
      <Section title="Restarts">
        <Line k="Last restart" v={when(re.lastBoot)} />
        <Line k="Up for" v={re.uptimeHours != null ? `${re.uptimeHours} h` : '—'} />
        <Line k="Restarts seen (7 days)" v={<Pill tone={re.seenLast7Days >= 2 ? 'warn' : 'good'}>{String(re.seenLast7Days ?? 0)}</Pill>} />
      </Section>
      <Section title="Network">
        <Line k="Connection" v={n.online ? `${n.type}${n.constrained ? ' (Low Data Mode)' : ''}` : <Pill tone="bad">Offline</Pill>} />
        <Line k="Download" v={n.speed?.downMbps != null ? `${n.speed.downMbps} Mbps` : '—'} />
        {(r.services || []).map((x) => (
          <Line key={x.name} k={x.name} v={<Pill tone={!x.ok ? 'bad' : x.ms > 1500 ? 'warn' : 'good'}>{x.ok ? `${x.ms} ms` : 'Unreachable'}</Pill>} />
        ))}
      </Section>
      <Section title="This app (last 7 days)">
        <Line k="Crashes" v={String(st.appCrashes7d ?? 0)} />
        <Line k="Freezes" v={String(st.appHangs7d ?? 0)} />
        <Line k="Closed for memory" v={String(st.memoryExits7d ?? 0)} />
      </Section>
      <p className="diag-sub" style={{ marginTop: 6 }}>Ran {when(r.ranAt)} · {r.trigger === 'remote' ? 'asked for by DH' : 'run on the phone'}{r.appState === 'background' ? ' · in the background' : ''}</p>
    </div>
  )
}

const Section = ({ title, children }) => (
  <div className="diag-section"><div className="diag-section-title">{title}</div>{children}</div>
)
const Line = ({ k, v }) => (
  <div className="diag-line"><span>{k}</span><span>{v ?? '—'}</span></div>
)

const CSS = `
  .diag-screen { padding: 16px 16px 48px; color: var(--mobile-text); }
  .diag-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .diag-head h1 { margin: 0; font-size: 22px; font-weight: 700; }
  .diag-back { background: none; border: none; padding: 4px; color: var(--mobile-text); display: grid; place-items: center; }
  .diag-tabs { display: flex; background: var(--mobile-card); border: 1px solid var(--mobile-border); border-radius: 12px; padding: 3px; margin-bottom: 14px; }
  .diag-tabs button { flex: 1; border: 0; background: none; padding: 9px 0; border-radius: 9px; font-size: 14px; font-weight: 600; color: var(--mobile-text-secondary); }
  .diag-tabs button.on { background: var(--mobile-accent); color: var(--mobile-on-accent, #fff); }
  .diag-note { margin: 0 4px 14px; font-size: 14px; line-height: 1.45; color: var(--mobile-text-secondary); }
  .diag-card { background: var(--mobile-card); border: 1px solid var(--mobile-border); border-radius: 16px; padding: 14px; margin-bottom: 12px; }
  .diag-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .diag-label { font-size: 15px; font-weight: 600; }
  .diag-sub { font-size: 13px; color: var(--mobile-text-secondary); line-height: 1.4; margin: 2px 0 0; }
  .diag-toggle { flex: none; width: 50px; height: 30px; border-radius: 15px; border: 0; background: var(--mobile-border); position: relative; transition: background .2s; }
  .diag-toggle span { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .2s; }
  .diag-toggle.on { background: var(--mobile-accent); }
  .diag-toggle.on span { transform: translateX(20px); }
  .diag-what { margin-top: 10px; font-size: 13px; color: var(--mobile-text-secondary); }
  .diag-what summary { cursor: pointer; color: var(--mobile-accent); font-weight: 600; }
  .diag-what p { margin: 8px 0 0; line-height: 1.45; }
  .diag-run { width: 100%; border: 0; border-radius: 14px; padding: 15px; font-size: 16px; font-weight: 700; background: var(--mobile-accent); color: var(--mobile-on-accent, #fff); margin-bottom: 12px; }
  .diag-run:disabled { opacity: .7; }
  .diag-steps { display: grid; gap: 8px; }
  .diag-step { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--mobile-text-secondary); transition: color .2s; }
  .diag-step .dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--mobile-border); display: grid; place-items: center; font-size: 11px; font-weight: 800; color: #fff; transition: all .2s; }
  .diag-step.now { color: var(--mobile-text); }
  .diag-step.now .dot { border-color: var(--mobile-accent); animation: diagPulse 1s infinite; }
  .diag-step.done { color: var(--mobile-text); }
  .diag-step.done .dot { background: #2fb36d; border-color: #2fb36d; }
  @keyframes diagPulse { 50% { transform: scale(1.15); } }
  .diag-error { color: var(--mobile-danger, #d33); font-size: 14px; margin: 0 4px 12px; }
  .diag-send { font-size: 13px; color: var(--mobile-text-secondary); margin: 0 4px 10px; }
  .diag-send.ok { color: #2fb36d; font-weight: 600; }
  .diag-report { background: var(--mobile-card); border: 1px solid var(--mobile-border); border-radius: 16px; padding: 14px; }
  .diag-report.compact { border: 0; padding: 10px 0 0; background: none; }
  .diag-verdict { font-size: 17px; font-weight: 700; margin-bottom: 6px; }
  .diag-verdict.good { color: #2fb36d; }
  .diag-verdict.warn { color: #d98a00; }
  .diag-issues { margin: 0 0 10px; padding-left: 18px; font-size: 14px; line-height: 1.5; }
  .diag-section { border-top: 1px solid var(--mobile-border); padding: 10px 0 4px; }
  .diag-section-title { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--mobile-text-secondary); margin-bottom: 4px; }
  .diag-line { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; padding: 4px 0; }
  .diag-line span:first-child { color: var(--mobile-text-secondary); }
  .diag-line span:last-child { text-align: right; font-weight: 500; }
  .diag-pill { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 12px; font-weight: 700; text-transform: capitalize; }
  .diag-pill.good { background: rgba(47,179,109,.15); color: #2fb36d; }
  .diag-pill.warn { background: rgba(217,138,0,.15); color: #d98a00; margin-top: 6px; }
  .diag-pill.bad { background: rgba(221,51,51,.15); color: #dd3333; }
  .diag-small { flex: none; border: 0; border-radius: 10px; padding: 9px 13px; font-size: 14px; font-weight: 700; background: var(--mobile-accent); color: var(--mobile-on-accent, #fff); }
  .diag-small:disabled { opacity: .45; }
`
