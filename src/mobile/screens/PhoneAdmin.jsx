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

  const [editing, setEditing] = useState(null)   // option being edited, or null
  const [addingUser, setAddingUser] = useState(false)
  const [userForm, setUserForm] = useState({ name: '', email: '', sip_username: '', forward_to: '' })
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState(null)

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
        {[['calls', 'Calls'], ['menu', 'Menu'], ['team', 'Team']].map(([id, label]) => (
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
                </div>
              </div>
            ))}
          </div>
        </>
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

  .ph-tabs { display: flex; gap: 8px; margin-bottom: 14px; }
  .ph-tabs button {
    flex: 1; padding: 9px; border-radius: 10px; border: 1px solid var(--mobile-border);
    background: var(--mobile-card); font-size: 13.5px; font-weight: 600;
    color: var(--mobile-text-secondary); cursor: pointer;
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
`
