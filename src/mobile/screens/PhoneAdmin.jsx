import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import Icon from '../components/Icon'
import { Chip } from '../components/DH'
import { Screen, HeaderButton, Card, Sec, Field, Toggle, Seg, Btn, Btns, Hero, Note, Empty, Sheet, Loading } from '../components/UI'
import { getStaffIdToken, SignInNeeded } from '../../utils/staffToken'

/**
 * The phone system, managed from the phone.
 *
 * DH pays a hosted PBX £200 a month for a number, a menu and two extensions.
 * dh-phone does the same job on Twilio for about a tenth of that, and this is
 * the screen that makes it usable: without somewhere to change who answers
 * what, it is a config file that only one person can edit.
 *
 * **The missed-call count is the point of the whole thing.** A hosted PBX
 * bills monthly and never volunteers how many callers hung up on a phone
 * nobody reached. At a two-person business each of those is a lost job, so it
 * gets the largest number on the screen rather than being buried in a report.
 *
 * Access is your Microsoft sign-in: every request carries your ID token,
 * and the phone system lets you in if your email belongs to someone on it.
 * There is no shared key to type in, lose or hand round.
 */

const API = 'https://dh-phone.aged-silence-66a7.workers.dev'
// Where the old shared key used to be kept. Cleared on sight; nothing reads it.
const OLD_KEY_STORAGE = 'dhphone.adminKey'

export default function MobilePhoneAdmin({ goBack, isAdmin: isAdminProp, user, can }) {
  // Admins, or staff given the "app_phone" permission.
  const isAdmin = isAdminProp || !!can?.('app_phone')
  const { instance, accounts } = useMsal()
  // 'checking' until the first silent attempt, then 'ok' or 'needed'.
  const [auth, setAuth] = useState('checking')
  const [authError, setAuthError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  const [tab, setTab] = useState('calls')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notOnSystem, setNotOnSystem] = useState(false)

  const [stats, setStats] = useState(null)
  const [calls, setCalls] = useState([])
  const [users, setUsers] = useState([])
  const [flows, setFlows] = useState([])
  const [options, setOptions] = useState([])
  const [hours, setHours] = useState([])

  const [editing, setEditing] = useState(null)   // option being edited, or null
  const [addingUser, setAddingUser] = useState(false)
  const [userForm, setUserForm] = useState({ name: '', email: '', sip_username: '', forward_to: '', extension: '' })
  const [busy, setBusy] = useState(false)
  // The extension being edited inline on the Team tab: { id, value } or null.
  const [extEdit, setExtEdit] = useState(null)
  const [outcome, setOutcome] = useState(null)

  // Greeting, out-of-hours message and hold music, edited as one form so the
  // whole of what a caller hears can be changed in a single save.
  const [setup, setSetup] = useState(null)
  const [week, setWeek] = useState(null)

  // Which voicemail is playing, and the blob it is playing from. The audio
  // cannot be given a plain URL — it needs your sign-in in a header — so it
  // is fetched, turned into a blob and revoked when the next one starts.
  const [playing, setPlaying] = useState(null)

  // The uploaded hold music: what is on the server, and whether we are in the
  // middle of replacing it.
  const [holdFile, setHoldFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  // Dialling out. `dialAs` is the phone-system user whose mobile rings first;
  // it defaults to whoever is signed in to the portal, matched by email.
  const [dialAs, setDialAs] = useState('')
  const [dialTo, setDialTo] = useState('')
  const [pinDraft, setPinDraft] = useState('')
  // Texts sent as "DH Website". One-way: customers can't reply to a name.
  const [smsTo, setSmsTo] = useState('')
  const [smsBody, setSmsBody] = useState('')
  const [smsLog, setSmsLog] = useState([])

  useEffect(() => {
    try { localStorage.removeItem(OLD_KEY_STORAGE) } catch { /* nothing to clear */ }
    load()
  }, [])

  if (!isAdmin) return <Screen title="Phone" onBack={goBack}><Note>Managers only.</Note></Screen>

  // Fetched per request: the token lasts an hour and is refreshed quietly.
  const authHeader = async (interactive = false) => ({
    Authorization: `Bearer ${await getStaffIdToken({ instance, account: accounts?.[0], interactive })}`,
  })

  const call = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeader()),
        ...(options.headers || {}),
      },
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const err = new Error(payload?.error?.message || `Failed (${response.status})`)
      err.status = response.status
      throw err
    }
    return payload
  }

  const load = async () => {
    setLoading(true)
    setError('')
    setNotOnSystem(false)
    try {
      const [s, c, u, f] = await Promise.all([
        call('/api/stats'),
        call('/api/calls?limit=60'),
        call('/api/users'),
        call('/api/flows'),
      ])
      setStats(s)
      setCalls(Array.isArray(c) ? c : [])
      setUsers(Array.isArray(u) ? u : [])
      const me = (Array.isArray(u) ? u : []).find(x =>
        x.email && user?.email && x.email.toLowerCase() === user.email.toLowerCase())
      setDialAs(prev => prev || me?.id || '')
      setAuth('ok')
      setFlows(f?.flows ?? [])
      setOptions(f?.options ?? [])
      setHours(f?.hours ?? [])

      // The forms are seeded from the server once, then owned by the user
      // until they save. Re-seeding on every refresh would wipe half-typed
      // edits the moment a background reload landed.
      const flow = (f?.flows ?? [])[0]
      if (flow) {
        setSetup(prev => prev ?? {
          id: flow.id,
          greeting: flow.greeting ?? '',
          closed_greeting: flow.closed_greeting ?? '',
          hold_message: flow.hold_message ?? '',
          hold_music_url: flow.hold_music_url ?? '',
        })
        setWeek(prev => prev ?? weekFrom(f?.hours ?? [], flow.id))
        try {
          setHoldFile(await call(`/api/hold-music?flow_id=${encodeURIComponent(flow.id)}`))
        } catch {
          // Not worth failing the whole screen over; the card just shows
          // nothing uploaded, which is recoverable by uploading something.
          setHoldFile({ present: false })
        }
      }
    } catch (err) {
      if (err instanceof SignInNeeded) {
        setAuth('needed')
      } else if (err.status === 403) {
        setAuth('ok')
        setNotOnSystem(true)
        setError(`${user?.email || 'Your account'} is not on the phone system. Ask David to add you under Team with this email.`)
      } else if (/Load failed|NetworkError|Failed to fetch/i.test(err.message)) {
        setError("Couldn't reach the phone system. Check your connection.")
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  /** Opens the Microsoft sign-in, only ever from a tap. */
  const signIn = async () => {
    setSigningIn(true)
    setAuthError('')
    try {
      await getStaffIdToken({ instance, account: accounts?.[0], interactive: true })
      await load()
    } catch (err) {
      setAuthError(err?.message || 'Sign-in did not finish. Try again.')
    } finally {
      setSigningIn(false)
    }
  }

  // ------------------------------------------------------------- mutations

  const saveOption = async () => {
    if (!editing || busy) return
    await Haptics.impact({ style: ImpactStyle.Medium })
    setBusy(true)
    setOutcome(null)
    try {
      await call('/api/options', {
        method: 'POST',
        body: JSON.stringify({
          flow_id: editing.flow_id,
          digit: editing.digit,
          label: editing.label,
          strategy: editing.strategy,
          ring_seconds: Number(editing.ring_seconds) || 20,
          voicemail: editing.voicemail || '',
        }),
      })
      await call('/api/option-members', {
        method: 'POST',
        body: JSON.stringify({ option_id: editing.id, user_ids: editing.member_ids }),
      })
      setOutcome({ ok: true, text: `Press ${editing.digit} updated.` })
      setEditing(null)
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const addUser = async () => {
    if (busy || !userForm.name.trim()) return
    setBusy(true)
    setOutcome(null)
    try {
      await call('/api/users', { method: 'POST', body: JSON.stringify(userForm) })
      setOutcome({ ok: true, text: `${userForm.name} added.` })
      setUserForm({ name: '', email: '', sip_username: '', forward_to: '', extension: '' })
      setAddingUser(false)
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  /** Everything the caller hears: greeting, closed message, hold. */
  const saveSetup = async () => {
    if (!setup || busy) return
    await Haptics.impact({ style: ImpactStyle.Medium })
    setBusy(true)
    setOutcome(null)
    try {
      await call(`/api/flows/${setup.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          greeting: setup.greeting,
          closed_greeting: setup.closed_greeting,
          hold_message: setup.hold_message,
          // Sent even when empty — clearing it is how you hand hold music
          // back to Twilio's own, and that has to be undoable.
          hold_music_url: setup.hold_music_url.trim(),
        }),
      })
      setOutcome({ ok: true, text: 'Saved. New calls will hear it.' })
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const saveHours = async () => {
    if (!week || !setup || busy) return
    await Haptics.impact({ style: ImpactStyle.Medium })
    setBusy(true)
    setOutcome(null)
    try {
      await call('/api/hours', {
        method: 'POST',
        body: JSON.stringify({
          flow_id: setup.id,
          days: week
            .map((d, weekday) => (d.open
              ? { weekday, open_minute: toMinutes(d.from), close_minute: toMinutes(d.to) }
              : null))
            .filter(Boolean),
        }),
      })
      setOutcome({ ok: true, text: 'Opening hours saved.' })
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  /**
   * Uploads a hold music file.
   *
   * Sent as the raw body rather than a form: it is one file and nothing else.
   * The type is checked here as well as on the server so that picking a .m4a
   * from the Files app fails immediately with a sentence you can act on,
   * rather than after waiting for a few megabytes to upload.
   */
  const uploadHoldMusic = async (file) => {
    if (!file || !setup || uploading) return
    const ok = /^audio\/(mpeg|mp3|wav|wave|x-wav)$/i.test(file.type)
      || /\.(mp3|wav)$/i.test(file.name)
    if (!ok) {
      setOutcome({ ok: false, text: 'Twilio can only play MP3 or WAV files.' })
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setOutcome({ ok: false, text: `That is ${Math.round(file.size / 1048576)} MB; the limit is 20 MB.` })
      return
    }

    setUploading(true)
    setOutcome(null)
    try {
      const response = await fetch(
        `${API}/api/hold-music?flow_id=${encodeURIComponent(setup.id)}`,
        {
          method: 'POST',
          headers: {
            ...(await authHeader()),
            'Content-Type': /\.wav$/i.test(file.name) ? 'audio/wav' : (file.type || 'audio/mpeg'),
            'X-Filename': encodeURIComponent(file.name),
          },
          body: file,
        },
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error?.message || `Upload failed (${response.status})`)
      setOutcome({ ok: true, text: `${file.name} is now the hold music.` })
      setSetup(s => ({ ...s, hold_music_url: payload.url }))
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setUploading(false)
    }
  }

  const removeHoldMusic = async () => {
    if (!setup || uploading) return
    setUploading(true)
    try {
      await call(`/api/hold-music?flow_id=${encodeURIComponent(setup.id)}`, { method: 'DELETE' })
      setSetup(s => ({ ...s, hold_music_url: '' }))
      setHoldFile({ present: false })
      setOutcome({ ok: true, text: 'Back to Twilio’s hold music.' })
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setUploading(false)
    }
  }

  /**
   * Plays a voicemail.
   *
   * The recording lives on Twilio behind the account credentials, so the
   * Worker fetches it for us. The sign-in travels in a header and the audio
   * comes back as a blob — putting the token in the URL of an <audio> tag
   * would leak it into logs and browser history.
   */
  const playRecording = async (callId) => {
    if (playing?.id === callId) {
      URL.revokeObjectURL(playing.url)
      setPlaying(null)
      return
    }
    if (playing) URL.revokeObjectURL(playing.url)
    setPlaying({ id: callId, url: '', loading: true })
    try {
      const response = await fetch(`${API}/api/recordings/${callId}`, {
        headers: await authHeader(),
      })
      if (!response.ok) throw new Error(`Could not fetch that recording (${response.status}).`)
      const url = URL.createObjectURL(await response.blob())
      setPlaying({ id: callId, url, loading: false })
    } catch (err) {
      setPlaying(null)
      setOutcome({ ok: false, text: err.message })
    }
  }

  /**
   * Click-to-call. The Worker rings the chosen person's own mobile from the
   * office number; they answer, press 1, and the customer sees the office.
   * Nothing is dialled from this device, so it works the same from a laptop.
   */
  const loadTexts = async () => {
    try {
      const rows = await call('/api/sms?limit=50')
      setSmsLog(Array.isArray(rows) ? rows : [])
    } catch {
      // The log is a nice-to-have; sending still works without it.
    }
  }

  const sendText = async () => {
    if (busy || !dialAs || !smsTo.trim() || !smsBody.trim()) return
    await Haptics.impact({ style: ImpactStyle.Medium })
    setBusy(true)
    setOutcome(null)
    try {
      await call('/api/sms', {
        method: 'POST',
        body: JSON.stringify({ user_id: dialAs, to: smsTo, body: smsBody }),
      })
      setOutcome({ ok: true, text: `Text sent to ${smsTo.trim()} from DH Website.` })
      setSmsTo('')
      setSmsBody('')
      await loadTexts()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const placeCall = async () => {
    if (busy || !dialAs || !dialTo.trim()) return
    await Haptics.impact({ style: ImpactStyle.Medium })
    setBusy(true)
    setOutcome(null)
    try {
      const r = await call('/api/dialout', {
        method: 'POST',
        body: JSON.stringify({ user_id: dialAs, to: dialTo }),
      })
      setOutcome({
        ok: true,
        text: `Ringing your mobile now. Answer, then press 1 to be connected to ${dialTo.trim() || r.to}.`,
      })
      setDialTo('')
      // The row exists straight away; reloading shows it as "calling".
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  /** Dial-in PIN: setting one also clears a lockout. */
  const savePin = async () => {
    if (busy || !dialAs || !pinDraft) return
    setBusy(true)
    setOutcome(null)
    try {
      await call(`/api/users/${encodeURIComponent(dialAs)}/dialout-pin`, {
        method: 'POST',
        body: JSON.stringify({ pin: pinDraft }),
      })
      setPinDraft('')
      setOutcome({ ok: true, text: 'PIN saved. Ring the office from that mobile to use it.' })
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const removePin = async () => {
    if (busy || !dialAs) return
    setBusy(true)
    try {
      await call(`/api/users/${encodeURIComponent(dialAs)}/dialout-pin`, { method: 'DELETE' })
      setOutcome({ ok: true, text: 'PIN removed. That mobile now hears the normal menu.' })
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const toggleUser = async (user) => {
    try {
      await call(`/api/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: user.active ? 0 : 1 }),
      })
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    }
  }

  /** A direct extension: callers dial it during the greeting. Blank removes it. */
  const saveExtension = async () => {
    if (!extEdit || busy) return
    setBusy(true)
    setOutcome(null)
    try {
      await call(`/api/users/${extEdit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ extension: extEdit.value.trim() }),
      })
      setOutcome({ ok: true, text: extEdit.value.trim() ? `Extension ${extEdit.value.trim()} saved.` : 'Extension removed.' })
      setExtEdit(null)
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  // ---------------------------------------------------------------- helpers

  const membersOf = (option) => {
    try { return JSON.parse(option.members || '[]') } catch { return [] }
  }

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const when = (ms) => {
    if (!ms) return ''
    const d = new Date(Number(ms))
    const mins = Math.floor((Date.now() - d.getTime()) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  // ------------------------------------------------------------ sign-in gate

  if (auth !== 'ok') {
    return (
      <Screen title="Phone" onBack={goBack}>
        {auth === 'checking' ? <Loading>Checking your sign-in…</Loading> : (
          <Card pad>
            <span className="dh-t">Confirm it's you</span>
            <span className="dh-sub">
              This screen can change who your business number rings, so the
              phone system checks your Microsoft sign-in. You'll only be
              asked once on this device.
            </span>
            <Note tone="error">{authError || error}</Note>
            <Btn onPress={signIn} disabled={signingIn}>
              {signingIn ? 'Opening Microsoft…' : 'Continue with Microsoft'}
            </Btn>
          </Card>
        )}
      </Screen>
    )
  }

  // ------------------------------------------------------------------ panel

  const TITLES = { calls: 'Phone', dial: 'Call as the business', text: 'Text as DH Website', menu: 'What callers hear', team: 'Who answers', hours: 'Opening hours', setup: 'Greetings and hold music' }
  const open = (id) => { setTab(id); if (id === 'text') loadTexts() }
  const chev = <span className="dh-chev"><Icon name="chevron-right" size={18} /></span>
  const STATUS_TONE = { missed: 'red', completed: 'green', answered: 'green', voicemail: 'amber', 'in-progress': 'blue', ringing: 'blue' }
  const activeTeam = users.filter(u => u.active)

  return (
    <Screen
      title={TITLES[tab] || 'Phone'}
      onBack={tab === 'calls' ? goBack : () => setTab('calls')}
      action={tab === 'calls' ? <HeaderButton onPress={load} label="Refresh"><Icon name="refresh" size={18} /></HeaderButton> : null}
    >
      {error && (
        <Card pad tone="danger">
          <Note tone="error">{error}</Note>
          {!notOnSystem && <Btn variant="outline" small onPress={load}>Try again</Btn>}
        </Card>
      )}
      {loading && <Loading />}
      <Note tone={outcome?.ok ? 'ok' : 'error'}>{outcome?.text}</Note>

      {/* ---------------------------------------------------------- calls */}
      {tab === 'calls' && (
        <>
          <Hero dark>
            <span className="dh-sub">Business line</span>
            <span className="dh-big">01443 805303</span>
            <Btns>
              <Btn small className="ph-hero-btn" onPress={() => open('dial')}>Call as the business</Btn>
              <Btn small variant="ghost" className="ph-hero-btn" onPress={() => open('text')}>Text as DH</Btn>
            </Btns>
          </Hero>

          {stats && (
            <div className={`dh-tiles ${stats.outgoing != null ? '' : 't3'}`}>
              {/* Missed is the headline. It is the number the old system
                  billed for thirty days and never showed. */}
              <div className="dh-tile"><span className="dh-num" style={Number(stats.missed) > 0 ? { color: '#B42318' } : undefined}>{stats.missed ?? 0}</span><span className="dh-sub">Missed, 30 days</span></div>
              <div className="dh-tile"><span className="dh-num">{stats.answered ?? 0}</span><span className="dh-sub">Answered</span></div>
              <div className="dh-tile"><span className="dh-num">{stats.total ?? 0}</span><span className="dh-sub">Incoming</span></div>
              {stats.outgoing != null && <div className="dh-tile"><span className="dh-num">{stats.outgoing ?? 0}</span><span className="dh-sub">Outgoing</span></div>}
            </div>
          )}

          <Sec>Recent calls</Sec>
          {calls.length === 0 && !loading && !error && <Empty icon="smartphone" title="No calls yet" />}
          {calls.length > 0 && (
            <div className="dh-card">
              {calls.map(c => (
                <div key={c.id} className="dh-row top" style={{ flexWrap: 'wrap' }}>
                  <span className={`dh-ic${c.direction === 'outbound' ? ' muted' : ''}`}>
                    <Icon name="smartphone" size={18} />
                  </span>
                  <span className="dh-g">
                    <span className="dh-t">
                      {c.direction === 'outbound' ? (c.to_number || 'No number dialled') : (c.from_number || 'Unknown')}
                    </span>
                    <span className="dh-sub">
                      {c.direction === 'outbound'
                        ? <>Outgoing{c.placed_by_name ? ` · ${c.placed_by_name}` : ''}{c.via === 'dial-in' ? ' · dialled in' : ''}{c.duration ? ` · ${c.duration}s` : ''}</>
                        : <>{c.option_label || 'no option'}{c.answered_by_name ? ` · ${c.answered_by_name}` : ''}{c.duration ? ` · ${c.duration}s` : ''}</>}
                    </span>
                    <span className="dh-sub">{when(c.started_at)}</span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <Chip tone={STATUS_TONE[c.status] || 'neutral'}>{c.status ? c.status[0].toUpperCase() + c.status.slice(1) : '—'}</Chip>
                    {c.recording_url && (
                      <button type="button" className="dh-sec-act" onClick={() => playRecording(c.id)}>
                        {playing?.id === c.id ? (playing.loading ? 'Loading…' : 'Close') : 'Listen'}
                      </button>
                    )}
                  </span>
                  {playing?.id === c.id && playing.url && (
                    /* eslint-disable-next-line jsx-a11y/media-has-caption */
                    <audio src={playing.url} controls autoPlay style={{ width: '100%', marginTop: 4 }} />
                  )}
                </div>
              ))}
            </div>
          )}

          <Sec>Set-up</Sec>
          <div className="dh-card">
            <button type="button" className="dh-row" onClick={() => open('team')}>
              <span className="dh-g"><span className="dh-t">Who answers</span><span className="dh-sub">{activeTeam.length ? activeTeam.map(u => u.name).join(', ') : 'Nobody switched on'}</span></span>{chev}
            </button>
            <button type="button" className="dh-row" onClick={() => open('menu')}>
              <span className="dh-g"><span className="dh-t">What callers hear</span><span className="dh-sub">Call menu and options</span></span>{chev}
            </button>
            <button type="button" className="dh-row" onClick={() => open('hours')}>
              <span className="dh-g"><span className="dh-t">Opening hours</span><span className="dh-sub">When the phones ring</span></span>{chev}
            </button>
            <button type="button" className="dh-row" onClick={() => open('setup')}>
              <span className="dh-g"><span className="dh-t">Greetings and hold music</span><span className="dh-sub">What callers hear first, and while they wait</span></span>{chev}
            </button>
            <button type="button" className="dh-row" onClick={() => open('dial')}>
              <span className="dh-g"><span className="dh-t">Dial in from your mobile</span><span className="dh-sub">PIN for calling out as the business</span></span>{chev}
            </button>
          </div>
        </>
      )}

      {/* ----------------------------------------------------------- dial */}
      {tab === 'dial' && (() => {
        const me = users.find(u => u.id === dialAs)
        return (
          <>
            <Card pad>
              <span className="dh-t">Call someone from 01443 805303</span>
              <span className="dh-sub">
                Your mobile rings from 01443 805303. Answer, press 1, and you
                are connected — the customer sees the office number, never
                yours. Outgoing calls are not recorded.
              </span>
            </Card>
            <div className="dh-card">
              <Field label="Ring this mobile first" htmlFor="ph-as">
                <select id="ph-as" value={dialAs} onChange={e => setDialAs(e.target.value)}>
                  <option value="">Choose who is calling…</option>
                  {users.filter(u => u.active && u.forward_to).map(u => (
                    <option key={u.id} value={u.id}>{u.name} — {u.forward_to}</option>
                  ))}
                </select>
              </Field>
              <Field label="Number to call" htmlFor="ph-to">
                <input
                  id="ph-to"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={dialTo}
                  onChange={e => setDialTo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') placeCall() }}
                  placeholder="e.g. 07700 900123"
                  style={{ fontSize: 20, fontWeight: 600 }}
                />
              </Field>
            </div>
            <Btn onPress={placeCall} disabled={busy || !dialAs || !dialTo.trim()}>
              {busy ? 'Ringing you…' : 'Call'}
            </Btn>
            <span className="dh-sub">
              UK landlines, mobiles, 03 and 0800 only. Premium-rate,
              international and 999 can’t be called from here — for an
              emergency, dial 999 from your own phone.
            </span>

            {me && (
              <>
                <Sec>Dial in from your mobile</Sec>
                <div className="dh-card">
                  <div className="dh-row">
                    <span className="dh-g"><span className="dh-t">{me.name}</span><span className="dh-sub">{me.forward_to}</span></span>
                    <Chip tone={me.dialout_locked ? 'red' : me.has_dialout_pin ? 'green' : 'neutral'}>
                      {me.dialout_locked ? 'Locked' : me.has_dialout_pin ? 'PIN set' : 'No PIN'}
                    </Chip>
                  </div>
                  <div className="dh-row">
                    <span className="dh-g">
                      <span className="dh-sub">
                        {me.dialout_locked
                          ? 'Locked after too many wrong PINs. Set a new one to unlock.'
                          : <>With a PIN set, ringing 01443 805303 from {me.forward_to} says “Staff line”. Key the PIN and #, then the number and #. Do nothing and you get the normal menu.</>}
                      </span>
                    </span>
                  </div>
                  <Field label="New PIN" htmlFor="ph-pin">
                    <input
                      id="ph-pin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      value={pinDraft}
                      onChange={e => setPinDraft(e.target.value.replace(/\D/g, ''))}
                      placeholder="6 to 12 digits"
                    />
                  </Field>
                </div>
                <Btns>
                  {me.has_dialout_pin
                    ? <Btn variant="danger" onPress={removePin} disabled={busy}>Remove PIN</Btn>
                    : <span />}
                  <Btn onPress={savePin} disabled={busy || pinDraft.length < 6}>{me.has_dialout_pin ? 'Change PIN' : 'Set PIN'}</Btn>
                </Btns>
              </>
            )}
          </>
        )
      })()}

      {/* ----------------------------------------------------------- text */}
      {tab === 'text' && (
        <>
          <span className="dh-sub">
            The customer sees the text from “DH Website”. They can’t reply to
            it, so say how to reach you — ring 01443 805303 or email.
          </span>
          <div className="dh-card">
            <Field label="Sent by" htmlFor="ph-by">
              <select id="ph-by" value={dialAs} onChange={e => setDialAs(e.target.value)}>
                <option value="">Choose who is sending…</option>
                {users.filter(u => u.active).map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </Field>
            <Field label="To" htmlFor="ph-sms-to">
              <input id="ph-sms-to" type="tel" inputMode="tel" autoComplete="off" value={smsTo} onChange={e => setSmsTo(e.target.value)} placeholder="Mobile number, e.g. 07700 900123" />
            </Field>
            <Field label="Your message" htmlFor="ph-sms-body" hint={`${smsBody.length}/306 · ${smsBody.length > 160 ? 'two texts' : 'one text'}`}>
              <textarea id="ph-sms-body" rows={4} maxLength={306} value={smsBody} onChange={e => setSmsBody(e.target.value)} placeholder="Shows as from DH Website" />
            </Field>
          </div>
          <span className="dh-sub">UK mobiles only. Up to 50 texts per person a day. Replies aren't received.</span>
          <Btn onPress={sendText} disabled={busy || !dialAs || !smsTo.trim() || !smsBody.trim()}>
            {busy ? 'Sending…' : 'Send text'}
          </Btn>

          <Sec>Sent texts</Sec>
          {smsLog.length === 0 ? <Empty icon="mail" title="Nothing sent yet" /> : (
            <div className="dh-card">
              {smsLog.map(m => (
                <div key={m.id} className="dh-row top">
                  <span className="dh-g">
                    <span className="dh-t">{m.to_number.replace(/^\+44/, '0')}</span>
                    <span className="dh-sub" style={{ whiteSpace: 'pre-wrap', color: 'var(--mobile-text)' }}>{m.body}</span>
                    <span className="dh-sub">
                      {m.sent_by_name || 'Unknown'} · {new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {m.status === 'failed' && m.error ? ` · ${m.error}` : ''}
                    </span>
                  </span>
                  <Chip tone={m.status === 'sent' ? 'green' : m.status === 'failed' ? 'red' : 'amber'}>{m.status === 'sent' ? 'Sent' : m.status === 'failed' ? 'Failed' : 'Sending'}</Chip>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ---------------------------------------------------------- hours */}
      {tab === 'hours' && week && (
        <>
          <span className="dh-sub">
            Outside these hours callers hear the closed message and go straight
            to voicemail — no mobile rings. Times are UK time and follow the
            clocks, so British Summer Time takes care of itself.
          </span>
          <div className="dh-card">
            {week.map((day, weekday) => (
              <div key={weekday} className="dh-row" style={{ flexWrap: 'wrap' }}>
                <span className="dh-g"><span className="dh-t">{DAYS[weekday]}</span></span>
                {day.open ? (
                  <span className="ph-times">
                    {['from', 'to'].map(edge => (
                      <input
                        key={edge}
                        className="dh-input"
                        type="time"
                        aria-label={`${DAYS[weekday]} ${edge}`}
                        value={day[edge]}
                        onChange={e => setWeek(w => w.map((d, i) => (
                          i === weekday ? { ...d, [edge]: e.target.value } : d
                        )))}
                      />
                    ))}
                  </span>
                ) : <Chip>Closed</Chip>}
                <Toggle
                  on={day.open}
                  label={`${DAYS[weekday]} open`}
                  onChange={() => setWeek(w => w.map((d, i) => (
                    i === weekday ? { ...d, open: !d.open } : d
                  )))}
                />
              </div>
            ))}
          </div>
          <Btn onPress={saveHours} disabled={busy}>{busy ? 'Saving…' : 'Save opening hours'}</Btn>
        </>
      )}

      {/* ---------------------------------------------------------- setup */}
      {tab === 'setup' && setup && (
        <>
          <Sec>Greetings</Sec>
          <div className="dh-card">
            {[
              ['greeting', 'Greeting', 'Thanks for calling…'],
              ['closed_greeting', 'When closed', 'We are closed at the moment…'],
              ['hold_message', 'Before the hold music', 'Thanks for holding…'],
            ].map(([field, label, placeholder]) => (
              <Field key={field} label={label} htmlFor={`ph-${field}`}>
                <textarea
                  id={`ph-${field}`}
                  value={setup[field]}
                  onChange={e => setSetup(s => ({ ...s, [field]: e.target.value }))}
                  placeholder={placeholder}
                  rows={2}
                />
              </Field>
            ))}
          </div>
          <span className="dh-sub">
            The recording notice is added automatically after the greeting.
            It is a legal requirement, so it is not editable here.
          </span>
          <Btn onPress={saveSetup} disabled={busy}>{busy ? 'Saving…' : 'Save greetings'}</Btn>

          <Sec>Hold music</Sec>
          <div className="dh-card">
            <div className="dh-row">
              <span className="dh-g">
                <span className="dh-t">{holdFile?.present ? holdFile.name : 'Twilio’s own hold music'}</span>
                <span className="dh-sub">
                  {holdFile?.present
                    ? `${holdFile.size ? `${(holdFile.size / 1048576).toFixed(1)} MB · ` : ''}playing on a loop`
                    : 'Upload a file to use your own'}
                </span>
              </span>
              {holdFile?.present && (
                <button type="button" className="dh-sec-act" style={{ color: '#B42318' }} onClick={removeHoldMusic} disabled={uploading}>Remove</button>
              )}
            </div>
            <label className="dh-row" style={{ cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
              <span className="dh-ic"><Icon name="download" size={18} /></span>
              <span className="dh-g"><span className="dh-t" style={{ color: 'var(--mobile-accent)' }}>
                {uploading ? 'Uploading…' : holdFile?.present ? 'Replace file' : 'Choose a file'}
              </span><span className="dh-sub">MP3 or WAV, up to 20 MB</span></span>
              <input
                type="file"
                accept="audio/mpeg,audio/wav,.mp3,.wav"
                disabled={uploading}
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  // Cleared so picking the same file twice still fires.
                  e.target.value = ''
                  uploadHoldMusic(file)
                }}
              />
            </label>
          </div>
          <span className="dh-sub">
            Check you are allowed to play it to callers — plenty of music is
            fine to listen to and not fine to put on a phone line.
          </span>
        </>
      )}

      {/* ----------------------------------------------------------- menu */}
      {tab === 'menu' && (
        <>
          <Sec>Greeting and menu</Sec>
          <div className="dh-card">
            {flows.map(f => (
              <div key={f.id} className="dh-row top">
                <span className="dh-g"><span className="dh-t">Greeting</span><span className="dh-sub">“{f.greeting}”</span></span>
              </div>
            ))}
            {options.map(o => {
              const members = membersOf(o).sort((a, b) => a.priority - b.priority)
              return (
                <button
                  key={o.id}
                  type="button"
                  className="dh-row"
                  onClick={() => setEditing({ ...o, member_ids: members.map(m => m.id) })}
                >
                  <Chip tone="blue">{o.digit}</Chip>
                  <span className="dh-g">
                    <span className="dh-t">{o.label}</span>
                    <span className="dh-sub">{o.strategy === 'sequential' ? 'One at a time' : 'All at once'} · {o.ring_seconds}s</span>
                    <span className="dh-sub">{members.length ? members.map(m => m.name).join(' → ') : 'Nobody — goes to voicemail'}</span>
                  </span>
                  {chev}
                </button>
              )
            })}
          </div>
          <span className="dh-sub">Tap an option to change who it rings, how long for, and its voicemail message.</span>
        </>
      )}

      {/* ----------------------------------------------------------- team */}
      {tab === 'team' && (
        <>
          <span className="dh-sub">Everyone who can take calls. Switch someone off and no option rings them. Which option rings whom is set in What callers hear.</span>
          {users.length > 0 && (
            <div className="dh-card">
              {users.map(u => (
                <div key={u.id}>
                  <div className="dh-row">
                    <span className="dh-av round" style={u.active ? undefined : { opacity: 0.5 }}>{(u.name || '?').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()}</span>
                    <span className="dh-g">
                      <span className="dh-t">{u.name}</span>
                      <span className="dh-sub">
                        {u.sip_username ? `App · ${u.sip_username}` : u.forward_to ? `Rings ${u.forward_to}` : 'No phone set'}
                        {u.has_dialout_pin ? ' · dial-in PIN' : ''}
                      </span>
                      <button type="button" className="dh-sec-act" style={{ alignSelf: 'flex-start', marginTop: 2 }} onClick={() => setExtEdit(extEdit?.id === u.id ? null : { id: u.id, value: u.extension || '' })}>
                        {u.extension ? `Ext ${u.extension}` : 'Add extension'}
                      </button>
                    </span>
                    <Toggle on={u.active} label={`${u.name} takes calls`} onChange={() => toggleUser(u)} />
                  </div>
                  {extEdit?.id === u.id && (
                    <>
                      <Field label="Extension" htmlFor="ph-ext" hint={`Callers dial it during the greeting, or save the number as 01443 805303,${extEdit.value || '201'} to go straight through. Leave blank to remove it.`}>
                        <input
                          id="ph-ext"
                          value={extEdit.value}
                          onChange={e => setExtEdit(x => ({ ...x, value: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                          placeholder="e.g. 201"
                          inputMode="numeric"
                        />
                      </Field>
                      <div style={{ padding: '0 16px 14px' }}>
                        <Btn small onPress={saveExtension} disabled={busy || extEdit.value.length === 1}>{busy ? 'Saving…' : 'Save extension'}</Btn>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {addingUser ? (
            <>
              <Sec>Add someone</Sec>
              <div className="dh-card">
                {[
                  ['name', 'Name', 'Name'],
                  ['email', 'Email', 'Optional'],
                  ['sip_username', 'App username', 'e.g. jack'],
                  ['forward_to', 'Or a mobile', 'e.g. +447700900123'],
                  ['extension', 'Extension', 'Optional, e.g. 203'],
                ].map(([field, label, placeholder]) => (
                  <Field key={field} label={label} htmlFor={`ph-new-${field}`}>
                    <input
                      id={`ph-new-${field}`}
                      value={userForm[field]}
                      onChange={e => setUserForm(f => ({ ...f, [field]: e.target.value }))}
                      placeholder={placeholder}
                      autoCapitalize={field === 'name' ? 'words' : 'none'}
                    />
                  </Field>
                ))}
              </div>
              <span className="dh-sub">
                Set an app username for the softphone, or a mobile number to
                ring instead. A mobile always works, which is why it is there.
              </span>
              <Btns>
                <Btn variant="outline" onPress={() => setAddingUser(false)}>Cancel</Btn>
                <Btn onPress={addUser} disabled={busy || !userForm.name.trim()}>{busy ? 'Adding…' : 'Add'}</Btn>
              </Btns>
            </>
          ) : (
            <Btn variant="outline" onPress={() => setAddingUser(true)}>Add someone</Btn>
          )}
        </>
      )}

      {/* ------------------------------------------------- edit an option */}
      {editing && (
        <Sheet title={`Press ${editing.digit}`} onClose={() => setEditing(null)}>
          <div className="dh-card">
            <Field label="What this option is for" htmlFor="ph-opt-label">
              <input id="ph-opt-label" value={editing.label} onChange={e => setEditing(v => ({ ...v, label: e.target.value }))} placeholder="e.g. Website support" />
            </Field>
          </div>

          <Seg
            value={editing.strategy}
            onChange={(id) => setEditing(v => ({ ...v, strategy: id }))}
            options={[{ value: 'sequential', label: 'One at a time' }, { value: 'simultaneous', label: 'All at once' }]}
          />
          <span className="dh-sub">
            {editing.strategy === 'sequential'
              ? 'Rings in the order below, each getting the full time before the next.'
              : 'Rings everyone at once. First to answer takes it.'}
          </span>

          <Sec>Who answers</Sec>
          <div className="dh-card">
            {users.filter(u => u.active).map(u => {
              const index = editing.member_ids.indexOf(u.id)
              const on = index !== -1
              return (
                <div key={u.id} className="dh-row">
                  {/* The order is the ring order, so it has to be visible. */}
                  <span className="dh-num" style={{ fontSize: 18, width: 22 }}>{on ? index + 1 : ''}</span>
                  <span className="dh-g"><span className="dh-t">{u.name}</span>{u.extension && <span className="dh-sub">Ext {u.extension}</span>}</span>
                  <Toggle
                    on={on}
                    label={`${u.name} answers this option`}
                    onChange={() => setEditing(v => ({
                      ...v,
                      member_ids: on ? v.member_ids.filter(id => id !== u.id) : [...v.member_ids, u.id],
                    }))}
                  />
                </div>
              )
            })}
          </div>
          {editing.member_ids.length === 0 && <Note tone="warn">Nobody selected — callers go straight to voicemail.</Note>}

          <div className="dh-card">
            <Field label="Seconds to ring" htmlFor="ph-opt-secs">
              <input id="ph-opt-secs" type="number" inputMode="numeric" value={editing.ring_seconds} onChange={e => setEditing(v => ({ ...v, ring_seconds: e.target.value }))} placeholder="20" />
            </Field>
            <Field
              label="Voicemail message"
              htmlFor="ph-opt-vm"
              hint="What this option says when nobody picks up. Worth setting for accounts, where “leave your invoice number” saves a call back."
            >
              <textarea id="ph-opt-vm" value={editing.voicemail || ''} onChange={e => setEditing(v => ({ ...v, voicemail: e.target.value }))} placeholder="Left empty, callers hear the standard message" rows={2} />
            </Field>
          </div>

          <Btns>
            <Btn variant="outline" onPress={() => setEditing(null)}>Cancel</Btn>
            <Btn onPress={saveOption} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn>
          </Btns>
        </Sheet>
      )}

      <style>{`
        .ph-hero-btn { width: 100%; height: 44px; padding: 0 8px; white-space: nowrap; font-size: 14px; }
        .ph-times { order: 3; flex-basis: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .ph-times .dh-input { padding: 8px 10px; font-size: 15px; }
      `}</style>
    </Screen>
  )
}

/* Minutes from midnight is what the phone system stores, because it is what
   comparing "is it open now" actually needs. A <input type="time"> speaks
   "09:00". These two are the only place that difference exists. */
const toClock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

const toMinutes = (clock) => {
  const [h, m] = String(clock || '09:00').split(':').map(Number)
  return (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 0)
}

/** Seven days, closed unless the server says otherwise. */
function weekFrom(rows, flowId) {
  return Array.from({ length: 7 }, (_, weekday) => {
    const row = rows.find(r => r.flow_id === flowId && r.weekday === weekday)
    return row && row.open_minute != null
      ? { open: true, from: toClock(row.open_minute), to: toClock(row.close_minute) }
      : { open: false, from: '09:00', to: '17:00' }
  })
}

/* Kept out of the component so the sign-in gate and the panel cannot drift apart
   visually — they are the same screen at two moments. */
