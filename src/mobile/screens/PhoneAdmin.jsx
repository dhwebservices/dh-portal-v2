import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'
import SectionHeader from '../components/SectionHeader'

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
 * The admin key is a real secret, entered once and kept on this device. It is
 * never shipped in the bundle.
 */

const API = 'https://dh-phone.aged-silence-66a7.workers.dev'
const KEY_STORAGE = 'dhphone.adminKey'

export default function MobilePhoneAdmin({ goBack, isAdmin }) {
  const [key, setKey] = useState(() => localStorage.getItem(KEY_STORAGE) || '')
  const [keyDraft, setKeyDraft] = useState('')
  const [keyError, setKeyError] = useState('')
  const [checkingKey, setCheckingKey] = useState(false)

  const [tab, setTab] = useState('calls')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [keyRejected, setKeyRejected] = useState(false)

  const [stats, setStats] = useState(null)
  const [calls, setCalls] = useState([])
  const [users, setUsers] = useState([])
  const [flows, setFlows] = useState([])
  const [options, setOptions] = useState([])
  const [hours, setHours] = useState([])

  const [editing, setEditing] = useState(null)   // option being edited, or null
  const [addingUser, setAddingUser] = useState(false)
  const [userForm, setUserForm] = useState({ name: '', email: '', sip_username: '', forward_to: '' })
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState(null)

  // Greeting, out-of-hours message and hold music, edited as one form so the
  // whole of what a caller hears can be changed in a single save.
  const [setup, setSetup] = useState(null)
  const [week, setWeek] = useState(null)

  // Which voicemail is playing, and the blob it is playing from. The audio
  // cannot be given a plain URL — it needs the admin key in a header — so it
  // is fetched, turned into a blob and revoked when the next one starts.
  const [playing, setPlaying] = useState(null)

  // The uploaded hold music: what is on the server, and whether we are in the
  // middle of replacing it.
  const [holdFile, setHoldFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => { if (key) load() }, [key])

  if (!isAdmin) return <div className="ph"><p className="ph-note">Managers only.</p></div>

  const call = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
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
    setKeyRejected(false)
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
      if (err.status === 403) {
        setError('That admin key was not accepted.')
        setKeyRejected(true)
      } else if (/Load failed|NetworkError|Failed to fetch/i.test(err.message)) {
        setError("Couldn't reach the phone system. Check your connection.")
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  /**
   * Checks the key before storing it, rather than storing it and finding out
   * on the next screen. Whitespace is stripped from anywhere in the string —
   * 64 characters pasted from a wrapped line arrives with a space through the
   * middle, and that is invisible in a masked field.
   */
  const saveKey = async () => {
    const candidate = keyDraft.replace(/\s+/g, '')
    if (!candidate) return
    if (!/^[0-9a-f]{64}$/i.test(candidate)) {
      setKeyError(
        candidate.length === 64
          ? 'Right length, but it contains characters the key cannot have.'
          : `That is ${candidate.length} character${candidate.length === 1 ? '' : 's'}; the key is 64.`
      )
      return
    }
    setCheckingKey(true)
    setKeyError('')
    try {
      const response = await fetch(`${API}/api/stats`, {
        headers: { Authorization: `Bearer ${candidate}` },
      })
      if (response.status === 403 || response.status === 401) {
        setKeyError('The phone system did not accept that key.')
        return
      }
      if (!response.ok) {
        setKeyError(`It answered ${response.status}. Try again shortly.`)
        return
      }
      localStorage.setItem(KEY_STORAGE, candidate)
      setKey(candidate)
      setKeyDraft('')
    } catch {
      setKeyError("Couldn't reach the phone system.")
    } finally {
      setCheckingKey(false)
    }
  }

  const forgetKey = () => {
    localStorage.removeItem(KEY_STORAGE)
    setKey('')
    setStats(null); setCalls([]); setUsers([]); setOptions([])
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
      setUserForm({ name: '', email: '', sip_username: '', forward_to: '' })
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
            Authorization: `Bearer ${key}`,
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
   * Worker fetches it for us. The admin key travels in a header and the audio
   * comes back as a blob — putting the key in the URL of an <audio> tag would
   * leak it into logs and browser history.
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
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!response.ok) throw new Error(`Could not fetch that recording (${response.status}).`)
      const url = URL.createObjectURL(await response.blob())
      setPlaying({ id: callId, url, loading: false })
    } catch (err) {
      setPlaying(null)
      setOutcome({ ok: false, text: err.message })
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

  // -------------------------------------------------------------- key gate

  if (!key) {
    return (
      <div className="ph">
        <div className="ph-head">
          <button className="ph-back" onClick={goBack} aria-label="Back">
            <Icon name="chevron-left" size={20} />
          </button>
          <h1>Phone</h1>
        </div>
        <MobileCard>
          <SectionHeader title="Admin key" />
          <p className="ph-note">
            This screen can change who your business number rings, so it is
            behind a real secret rather than a code stored in the app.
          </p>
          <input
            className="ph-field ph-key"
            type="text"
            value={keyDraft}
            onChange={e => { setKeyDraft(e.target.value); setKeyError('') }}
            placeholder="Admin key"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="ph-count">{keyDraft.replace(/\s+/g, '').length} of 64 characters</p>
          {keyError && <p className="ph-error">{keyError}</p>}
          <button className="ph-primary" onClick={saveKey} disabled={!keyDraft.trim() || checkingKey}>
            {checkingKey ? 'Checking…' : 'Unlock'}
          </button>
        </MobileCard>
        <style>{PHONE_CSS}</style>
      </div>
    )
  }

  // ------------------------------------------------------------------ panel

  return (
    <div className="ph">
      <div className="ph-head">
        <button className="ph-back" onClick={goBack} aria-label="Back">
          <Icon name="chevron-left" size={20} />
        </button>
        <h1>Phone</h1>
        <button className="ph-refresh" onClick={load} aria-label="Refresh">
          <Icon name="refresh" size={18} />
        </button>
      </div>

      <div className="ph-tabs">
        {[['calls', 'Calls'], ['menu', 'Menu'], ['team', 'Team'],
          ['hours', 'Hours'], ['setup', 'Setup']].map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="ph-failure">
          <p className="ph-error">{error}</p>
          <button className="ph-retry" onClick={keyRejected ? forgetKey : load}>
            {keyRejected ? 'Re-enter key' : 'Try again'}
          </button>
        </div>
      )}
      {loading && <p className="ph-note">Loading…</p>}
      {outcome && <p className={`ph-outcome ${outcome.ok ? 'ok' : 'bad'}`}>{outcome.text}</p>}

      {/* ---------------------------------------------------------- calls */}
      {tab === 'calls' && (
        <>
          {stats && (
            <div className="ph-stats">
              {/* Missed is the headline. It is the number the old system
                  billed for thirty days and never showed. */}
              <div className={`ph-stat ${Number(stats.missed) > 0 ? 'alarm' : ''}`}>
                <strong>{stats.missed ?? 0}</strong>
                <span>missed, 30 days</span>
              </div>
              <div className="ph-stat">
                <strong>{stats.answered ?? 0}</strong>
                <span>answered</span>
              </div>
              <div className="ph-stat">
                <strong>{stats.total ?? 0}</strong>
                <span>total calls</span>
              </div>
            </div>
          )}

          <div className="ph-list">
            {calls.length === 0 && !loading && !error && (
              <p className="ph-note">No calls yet.</p>
            )}
            {calls.map(c => (
              <div key={c.id} className={`ph-call ${c.status === 'missed' ? 'missed' : ''}`}>
                <div className="ph-call-main">
                  <strong>{c.from_number || 'Unknown'}</strong>
                  <span className="ph-call-meta">
                    {c.option_label || 'no option'}
                    {c.answered_by_name ? ` · ${c.answered_by_name}` : ''}
                    {c.duration ? ` · ${c.duration}s` : ''}
                  </span>
                </div>
                <div className="ph-call-side">
                  <span className={`ph-pill ${c.status}`}>{c.status}</span>
                  <span className="ph-when">{when(c.started_at)}</span>
                  {c.recording_url && (
                    <button
                      className={`ph-play${playing?.id === c.id ? ' on' : ''}`}
                      onClick={() => playRecording(c.id)}
                    >
                      {playing?.id === c.id
                        ? (playing.loading ? 'Loading…' : 'Close')
                        : 'Listen'}
                    </button>
                  )}
                </div>
                {playing?.id === c.id && playing.url && (
                  /* eslint-disable-next-line jsx-a11y/media-has-caption */
                  <audio className="ph-audio" src={playing.url} controls autoPlay />
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---------------------------------------------------------- hours */}
      {tab === 'hours' && week && (
        <div className="ph-list">
          <p className="ph-note">
            Outside these hours callers hear the closed message and go straight
            to voicemail — no mobile rings. Times are UK time and follow the
            clocks, so British Summer Time takes care of itself.
          </p>
          {week.map((day, weekday) => (
            <div key={weekday} className={`ph-day${day.open ? '' : ' shut'}`}>
              <button
                className="ph-day-name"
                onClick={() => setWeek(w => w.map((d, i) => (
                  i === weekday ? { ...d, open: !d.open } : d
                )))}
              >
                <span>{DAYS[weekday]}</span>
                <span className="ph-day-state">{day.open ? 'Open' : 'Closed'}</span>
              </button>
              {day.open && (
                <div className="ph-day-times">
                  {['from', 'to'].map(edge => (
                    <input
                      key={edge}
                      className="ph-field ph-time"
                      type="time"
                      value={day[edge]}
                      onChange={e => setWeek(w => w.map((d, i) => (
                        i === weekday ? { ...d, [edge]: e.target.value } : d
                      )))}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          <button className="ph-primary" onClick={saveHours} disabled={busy}>
            {busy ? 'Saving…' : 'Save opening hours'}
          </button>
        </div>
      )}

      {/* ---------------------------------------------------------- setup */}
      {tab === 'setup' && setup && (
        <div className="ph-list">
          <MobileCard>
            <SectionHeader title="What callers hear" />
            {[
              ['greeting', 'Greeting', 'Thanks for calling…'],
              ['closed_greeting', 'When closed', 'We are closed at the moment…'],
              ['hold_message', 'Before the hold music', 'Thanks for holding…'],
            ].map(([field, label, placeholder]) => (
              <div key={field} className="ph-labelled">
                <label>{label}</label>
                <textarea
                  className="ph-field ph-textarea"
                  value={setup[field]}
                  onChange={e => setSetup(s => ({ ...s, [field]: e.target.value }))}
                  placeholder={placeholder}
                  rows={2}
                />
              </div>
            ))}
            <p className="ph-note">
              The recording notice is added automatically after the greeting.
              It is a legal requirement, so it is not editable here.
            </p>
          </MobileCard>

          <MobileCard>
            <SectionHeader title="Hold music" />

            {holdFile?.present ? (
              <div className="ph-file">
                <div>
                  <strong>{holdFile.name}</strong>
                  <span className="ph-call-meta">
                    {holdFile.size ? `${(holdFile.size / 1048576).toFixed(1)} MB` : ''} · playing on a loop
                  </span>
                </div>
                <button className="ph-toggle" onClick={removeHoldMusic} disabled={uploading}>
                  Remove
                </button>
              </div>
            ) : (
              <p className="ph-note">
                Twilio’s own hold music is playing at the moment. Upload a file
                to use your own.
              </p>
            )}

            <label className={`ph-upload${uploading ? ' busy' : ''}`}>
              {uploading
                ? 'Uploading…'
                : holdFile?.present ? 'Replace file' : 'Choose a file'}
              <input
                type="file"
                accept="audio/mpeg,audio/wav,.mp3,.wav"
                disabled={uploading}
                onChange={e => {
                  const file = e.target.files?.[0]
                  // Cleared so picking the same file twice still fires.
                  e.target.value = ''
                  uploadHoldMusic(file)
                }}
              />
            </label>

            <p className="ph-note">
              MP3 or WAV, up to 20 MB. Check you are allowed to play it to
              callers — plenty of music is fine to listen to and not fine to
              put on a phone line.
            </p>
          </MobileCard>

          <button className="ph-primary" onClick={saveSetup} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {/* ----------------------------------------------------------- menu */}
      {tab === 'menu' && (
        <div className="ph-list">
          {flows.map(f => (
            <p key={f.id} className="ph-note">“{f.greeting}”</p>
          ))}
          {options.map(o => {
            const members = membersOf(o)
            return (
              <button
                key={o.id}
                className="ph-option"
                onClick={() => setEditing({
                  ...o,
                  member_ids: members.sort((a, b) => a.priority - b.priority).map(m => m.id),
                })}
              >
                <div className="ph-digit">{o.digit}</div>
                <div className="ph-option-body">
                  <strong>{o.label}</strong>
                  <span>
                    {o.strategy === 'sequential' ? 'One at a time' : 'All at once'} · {o.ring_seconds}s
                  </span>
                  <span className="ph-members">
                    {members.length
                      ? members.sort((a, b) => a.priority - b.priority).map(m => m.name).join(' → ')
                      : 'Nobody — goes to voicemail'}
                  </span>
                </div>
                <Icon name="chevron-right" size={18} />
              </button>
            )
          })}
        </div>
      )}

      {/* ----------------------------------------------------------- team */}
      {tab === 'team' && (
        <div className="ph-list">
          {users.map(u => (
            <div key={u.id} className={`ph-user ${u.active ? '' : 'off'}`}>
              <div>
                <strong>{u.name}</strong>
                <span className="ph-call-meta">
                  {u.sip_username ? `app: ${u.sip_username}` : u.forward_to ? `rings ${u.forward_to}` : 'no phone set'}
                </span>
              </div>
              <button className="ph-toggle" onClick={() => toggleUser(u)}>
                {u.active ? 'On' : 'Off'}
              </button>
            </div>
          ))}

          {addingUser ? (
            <MobileCard>
              <SectionHeader title="Add someone" />
              {[
                ['name', 'Name'],
                ['email', 'Email (optional)'],
                ['sip_username', 'App username, e.g. jack'],
                ['forward_to', 'Or a mobile, e.g. +447700900123'],
              ].map(([field, placeholder]) => (
                <input
                  key={field}
                  className="ph-field"
                  value={userForm[field]}
                  onChange={e => setUserForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder={placeholder}
                  autoCapitalize={field === 'name' ? 'words' : 'none'}
                />
              ))}
              <p className="ph-note">
                Set an app username for the softphone, or a mobile number to
                ring instead. A mobile always works, which is why it is there.
              </p>
              <button className="ph-primary" onClick={addUser} disabled={busy || !userForm.name.trim()}>
                {busy ? 'Adding…' : 'Add'}
              </button>
              <button className="ph-secondary" onClick={() => setAddingUser(false)}>Cancel</button>
            </MobileCard>
          ) : (
            <button className="ph-primary" onClick={() => setAddingUser(true)}>Add someone</button>
          )}
        </div>
      )}

      {/* ------------------------------------------------- edit an option */}
      {editing && (
        <>
          <div className="ph-scrim" onClick={() => setEditing(null)} />
          <div className="ph-sheet">
            <h2>Press {editing.digit}</h2>

            <input
              className="ph-field"
              value={editing.label}
              onChange={e => setEditing(v => ({ ...v, label: e.target.value }))}
              placeholder="What this option is for"
            />

            <div className="ph-kinds">
              {[['simultaneous', 'All at once'], ['sequential', 'One at a time']].map(([id, label]) => (
                <button
                  key={id}
                  className={editing.strategy === id ? 'on' : ''}
                  onClick={() => setEditing(v => ({ ...v, strategy: id }))}
                >{label}</button>
              ))}
            </div>

            <input
              className="ph-field"
              type="number"
              inputMode="numeric"
              value={editing.ring_seconds}
              onChange={e => setEditing(v => ({ ...v, ring_seconds: e.target.value }))}
              placeholder="Seconds to ring"
            />

            <p className="ph-note">
              {editing.strategy === 'sequential'
                ? 'Rings in the order below, each getting the full time before the next.'
                : 'Rings everyone at once. First to answer takes it.'}
            </p>

            <SectionHeader title="Who answers" />
            <div className="ph-picker">
              {users.filter(u => u.active).map(u => {
                const index = editing.member_ids.indexOf(u.id)
                const on = index !== -1
                return (
                  <button
                    key={u.id}
                    className={`ph-pick${on ? ' on' : ''}`}
                    onClick={() => setEditing(v => ({
                      ...v,
                      member_ids: on
                        ? v.member_ids.filter(id => id !== u.id)
                        : [...v.member_ids, u.id],
                    }))}
                  >
                    <span>{u.name}</span>
                    {/* The order is the ring order, so it has to be visible. */}
                    {on && <span className="ph-order">{index + 1}</span>}
                  </button>
                )
              })}
            </div>
            {editing.member_ids.length === 0 && (
              <p className="ph-note">Nobody selected — callers go straight to voicemail.</p>
            )}

            <SectionHeader title="Voicemail message" />
            <textarea
              className="ph-field ph-textarea"
              value={editing.voicemail || ''}
              onChange={e => setEditing(v => ({ ...v, voicemail: e.target.value }))}
              placeholder="Left empty, callers hear the standard message"
              rows={2}
            />
            <p className="ph-note">
              What this option says when nobody picks up. Worth setting for
              accounts, where “leave your invoice number” saves a call back.
            </p>

            <button className="ph-primary" onClick={saveOption} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button className="ph-secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </>
      )}

      <button className="ph-forget" onClick={forgetKey}>Forget admin key on this device</button>

      <style>{PHONE_CSS}</style>
    </div>
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

/* Kept out of the component so the key gate and the panel cannot drift apart
   visually — they are the same screen at two moments. */
const PHONE_CSS = `
  .ph { padding: 16px 16px 60px; }

  .ph-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .ph-head h1 { margin: 0; flex: 1; font-size: 22px; font-weight: 700; color: var(--mobile-text); }
  .ph-back, .ph-refresh {
    background: none; border: none; padding: 6px; color: var(--mobile-accent);
    cursor: pointer; display: grid; place-items: center;
  }

  /* Five tabs now rather than three, so they are allowed to shrink and the
     labels are kept short enough to survive a small phone. */
  .ph-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
  .ph-tabs button {
    flex: 1; min-width: 0; padding: 9px 4px; border-radius: 10px;
    border: 1px solid var(--mobile-border);
    background: var(--mobile-card); font-size: 12.5px; font-weight: 600;
    color: var(--mobile-text-secondary); cursor: pointer; white-space: nowrap;
  }
  .ph-tabs button.active {
    background: var(--mobile-accent); border-color: var(--mobile-accent);
    color: var(--mobile-on-accent);
  }

  .ph-stats { display: flex; gap: 10px; margin-bottom: 14px; }
  .ph-stat {
    flex: 1; background: var(--mobile-card); border: 1px solid var(--mobile-border);
    border-radius: 12px; padding: 14px 12px; text-align: center;
  }
  .ph-stat strong {
    display: block; font-size: 26px; font-weight: 700; letter-spacing: -0.02em;
    color: var(--mobile-text); font-variant-numeric: tabular-nums;
  }
  .ph-stat span { font-size: 11.5px; color: var(--mobile-text-secondary); }
  .ph-stat.alarm { border-color: #c0392b; }
  .ph-stat.alarm strong { color: #c0392b; }

  .ph-list { display: flex; flex-direction: column; gap: 10px; }

  .ph-call, .ph-user {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    background: var(--mobile-card); border: 1px solid var(--mobile-border);
    border-radius: 12px; padding: 12px 14px;
  }
  .ph-call.missed { border-left: 3px solid #c0392b; }
  .ph-call-main strong, .ph-user strong {
    display: block; font-size: 15px; color: var(--mobile-text);
  }
  .ph-call-meta { font-size: 12.5px; color: var(--mobile-text-secondary); }
  .ph-call-side { text-align: right; flex: none; }
  .ph-when { display: block; font-size: 11.5px; color: var(--mobile-text-secondary); }
  .ph-pill {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  }
  .ph-pill.answered { background: #e3efe8; color: #1f7a4d; }
  .ph-pill.missed { background: #fbe9e7; color: #c0392b; }
  .ph-pill.ringing { background: var(--mobile-accent-soft); color: var(--mobile-accent); }

  .ph-user.off { opacity: 0.5; }
  .ph-toggle {
    flex: none; padding: 7px 16px; border-radius: 999px; border: none;
    background: var(--mobile-accent-soft); color: var(--mobile-accent);
    font-size: 13px; font-weight: 700; cursor: pointer;
  }

  .ph-option {
    display: flex; align-items: center; gap: 14px; width: 100%; text-align: left;
    background: var(--mobile-card); border: 1px solid var(--mobile-border);
    border-radius: 12px; padding: 14px; cursor: pointer; color: var(--mobile-text);
  }
  .ph-digit {
    flex: none; width: 38px; height: 38px; border-radius: 10px;
    background: var(--mobile-accent); color: var(--mobile-on-accent);
    display: grid; place-items: center; font-size: 18px; font-weight: 700;
  }
  .ph-option-body { flex: 1; }
  .ph-option-body strong { display: block; font-size: 15.5px; }
  .ph-option-body span { display: block; font-size: 12.5px; color: var(--mobile-text-secondary); }
  .ph-members { margin-top: 2px; font-weight: 600; }

  .ph-field {
    width: 100%; margin-top: 10px; padding: 12px 14px; border-radius: 10px;
    border: 1px solid var(--mobile-border); background: var(--mobile-bg);
    color: var(--mobile-text); font-size: 15px; font-family: inherit;
  }
  .ph-key {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px; word-break: break-all;
  }
  .ph-count {
    margin: 6px 2px 0; font-size: 12.5px; font-variant-numeric: tabular-nums;
    color: var(--mobile-text-secondary);
  }

  .ph-note { margin: 10px 2px 0; font-size: 13px; line-height: 1.45; color: var(--mobile-text-secondary); }
  .ph-error { margin: 4px 2px; font-size: 13.5px; font-weight: 600; color: #c0392b; }
  .ph-outcome { margin: 4px 2px 12px; font-size: 13.5px; font-weight: 600; }
  .ph-outcome.ok { color: #1f7a4d; }
  .ph-outcome.bad { color: #c0392b; }

  .ph-failure {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; margin-bottom: 10px;
  }
  .ph-retry {
    flex: none; padding: 7px 14px; border-radius: 999px; border: none;
    background: var(--mobile-accent-soft); color: var(--mobile-accent);
    font-size: 13.5px; font-weight: 700; cursor: pointer;
  }

  .ph-primary {
    width: 100%; margin-top: 14px; padding: 14px; border: none; border-radius: 10px;
    background: var(--mobile-accent); color: var(--mobile-on-accent);
    font-size: 15.5px; font-weight: 700; cursor: pointer;
  }
  .ph-primary:disabled { opacity: 0.45; cursor: default; }
  .ph-secondary {
    width: 100%; margin-top: 8px; padding: 12px; border: none; border-radius: 10px;
    background: none; color: var(--mobile-text-secondary);
    font-size: 14.5px; font-weight: 600; cursor: pointer;
  }

  .ph-scrim { position: fixed; inset: 0; background: rgba(10,20,30,0.4); z-index: 8; }
  .ph-sheet {
    position: fixed; left: 12px; right: 12px; bottom: 78px; z-index: 9;
    background: var(--mobile-card); border-radius: 16px; padding: 20px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.28); max-height: 80vh; overflow-y: auto;
  }
  .ph-sheet h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--mobile-text); }

  .ph-kinds { display: flex; gap: 8px; margin-top: 12px; }
  .ph-kinds button {
    flex: 1; padding: 9px; border-radius: 10px; border: 1px solid var(--mobile-border);
    background: none; font-size: 13.5px; font-weight: 600;
    color: var(--mobile-text-secondary); cursor: pointer;
  }
  .ph-kinds button.on {
    border-color: var(--mobile-accent); background: var(--mobile-accent-soft);
    color: var(--mobile-accent);
  }

  .ph-picker { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
  .ph-pick {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 11px 14px; border-radius: 10px; border: 1px solid var(--mobile-border);
    background: none; font-size: 15px; color: var(--mobile-text);
    cursor: pointer; text-align: left;
  }
  .ph-pick.on {
    border-color: var(--mobile-accent); background: var(--mobile-accent-soft);
    color: var(--mobile-accent); font-weight: 600;
  }
  .ph-order {
    flex: none; width: 22px; height: 22px; border-radius: 999px;
    background: var(--mobile-accent); color: var(--mobile-on-accent);
    display: grid; place-items: center; font-size: 12px; font-weight: 700;
  }

  .ph-forget {
    width: 100%; margin-top: 26px; padding: 12px; border: none; background: none;
    font-size: 13px; color: var(--mobile-text-secondary); cursor: pointer;
  }

  /* Opening hours ------------------------------------------------------- */
  .ph-day {
    background: var(--mobile-card); border: 1px solid var(--mobile-border);
    border-radius: 12px; padding: 4px 14px 12px;
  }
  .ph-day.shut { opacity: 0.62; padding-bottom: 4px; }
  .ph-day-name {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    gap: 10px; padding: 12px 0; background: none; border: none; cursor: pointer;
    font-size: 15px; font-weight: 600; color: var(--mobile-text); text-align: left;
  }
  .ph-day-state { font-size: 12.5px; font-weight: 600; color: var(--mobile-accent); }
  .ph-day.shut .ph-day-state { color: var(--mobile-text-secondary); }
  .ph-day-times { display: flex; gap: 10px; }
  .ph-time { flex: 1; margin: 0; font-variant-numeric: tabular-nums; }

  /* Setup ---------------------------------------------------------------- */
  .ph-labelled { margin-bottom: 12px; }
  .ph-labelled label {
    display: block; margin-bottom: 5px; font-size: 12.5px; font-weight: 600;
    color: var(--mobile-text-secondary);
  }
  .ph-textarea { resize: vertical; min-height: 56px; line-height: 1.4; font: inherit; }

  /* Voicemail playback --------------------------------------------------- */
  /* The row has to wrap: the player is a second line under the call, not
     something squeezed in beside the timestamp. */
  .ph-call { flex-wrap: wrap; }
  .ph-play {
    padding: 5px 11px; border-radius: 999px; border: 1px solid var(--mobile-accent);
    background: none; color: var(--mobile-accent); font-size: 12px; font-weight: 600;
    cursor: pointer;
  }
  .ph-play.on { background: var(--mobile-accent); color: var(--mobile-on-accent); }
  .ph-audio { width: 100%; margin-top: 10px; height: 34px; }

  /* Hold music upload ---------------------------------------------------- */
  .ph-file {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 11px 0 13px;
  }
  .ph-file strong { display: block; font-size: 15px; color: var(--mobile-text); }

  /* A label wrapping a hidden input, because a bare file input cannot be
     styled and looks like a form from 2003 next to everything else here. */
  .ph-upload {
    display: block; width: 100%; padding: 12px; border-radius: 10px;
    border: 1px dashed var(--mobile-border); background: none;
    font-size: 14.5px; font-weight: 600; color: var(--mobile-accent);
    text-align: center; cursor: pointer;
  }
  .ph-upload.busy { opacity: 0.6; cursor: default; }
  .ph-upload input { display: none; }
`
