import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'
import SectionHeader from '../components/SectionHeader'
import InfoRow from '../components/InfoRow'

/**
 * Running Fish Tank from the staff portal.
 *
 * The game itself used to carry its own operator tools — a "Present from
 * Jack" code that minted coins, and a PIN-gated message sender. Both are gone
 * from the game and live here instead, because a tool that can create currency
 * has no business shipping inside the thing it creates currency for: anybody
 * can read a PIN out of an App Store binary.
 *
 * **Coins are not a server balance.** Fish Tank keeps its balance on the
 * device so it plays with no connection. What this screen creates is a
 * *grant* — a thing given to somebody, which their game claims next time it
 * is online and adds to its own total. So a grant is a promise, not an
 * instant edit, and the screen says so rather than implying otherwise.
 *
 * The operator key is a real secret, entered once and kept on this device. It
 * is not shipped in the app.
 */

const API = 'https://fishtank.aged-silence-66a7.workers.dev/v1'
const KEY_STORAGE = 'fishtank.operatorKey'

export default function MobileFishTankAdmin({ goBack, user, isAdmin }) {
  const [key, setKey] = useState(() => localStorage.getItem(KEY_STORAGE) || '')
  const [keyDraft, setKeyDraft] = useState('')
  const [players, setPlayers] = useState([])
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('players')

  // The grant being composed, or null.
  const [granting, setGranting] = useState(null)
  const [form, setForm] = useState({ kind: 'coins', amount: '', itemId: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState(null)

  // Announcements
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (key) load()
  }, [key])

  if (!isAdmin) {
    return <div className="fta"><p className="fta-note">Managers only.</p></div>
  }

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
    if (!response.ok) throw new Error(payload?.error?.message || `Failed (${response.status})`)
    return payload
  }

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [people, history] = await Promise.all([
        call('/operator/players'),
        call('/operator/grants'),
      ])
      setPlayers(Array.isArray(people) ? people : [])
      setGrants(Array.isArray(history) ? history : [])
    } catch (err) {
      // Say which of the two things went wrong, because the fix is different.
      // "Load failed" is all WebKit gives you for a fetch that never
      // completed, and on its own it sends you looking at the key when the
      // problem is the network.
      if (/403|No\./.test(err.message)) {
        setError('That operator key was not accepted.')
      } else if (/Load failed|NetworkError|Failed to fetch/i.test(err.message)) {
        setError("Couldn't reach the game's server. Check your connection and try again.")
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const saveKey = () => {
    const trimmed = keyDraft.trim()
    if (!trimmed) return
    localStorage.setItem(KEY_STORAGE, trimmed)
    setKey(trimmed)
    setKeyDraft('')
  }

  const forgetKey = () => {
    localStorage.removeItem(KEY_STORAGE)
    setKey('')
    setPlayers([])
    setGrants([])
  }

  const submitGrant = async () => {
    if (!granting || busy) return
    const amount = parseInt(form.amount, 10)

    if (form.kind === 'coins' && (!Number.isFinite(amount) || amount === 0)) {
      setOutcome({ ok: false, text: 'Enter an amount. Negative takes coins away.' })
      return
    }
    if (form.kind !== 'coins' && !form.itemId.trim()) {
      setOutcome({ ok: false, text: 'Enter the item or prize id.' })
      return
    }

    await Haptics.impact({ style: ImpactStyle.Medium })
    setBusy(true)
    setOutcome(null)
    try {
      await call('/operator/grants', {
        method: 'POST',
        body: JSON.stringify({
          player_id: granting.id,
          kind: form.kind,
          amount: form.kind === 'coins' ? amount : 1,
          item_id: form.kind === 'coins' ? null : form.itemId.trim(),
          note: form.note.trim() || null,
          created_by: user?.name || user?.email || 'operator',
        }),
      })
      setOutcome({
        ok: true,
        text: `Sent to ${granting.username}. It lands next time they open the game.`,
      })
      setForm({ kind: 'coins', amount: '', itemId: '', note: '' })
      setGranting(null)
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (grant) => {
    if (!confirm(`Take back ${grant.kind === 'coins' ? `${grant.amount} coins` : grant.item_id} from ${grant.username}?`)) return
    try {
      await call(`/operator/grants/${grant.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const announce = async () => {
    if (!title.trim() && !message.trim()) return
    setBusy(true)
    setOutcome(null)
    try {
      const result = await call('/operator/announce', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          body: message.trim(),
          created_by: user?.name || user?.email || 'operator',
        }),
      })
      setOutcome({
        ok: true,
        text: `Waiting for ${result.queued} player${result.queued === 1 ? '' : 's'}. Anyone playing sees it now; everyone else the next time they open the game.`,
      })
      setTitle('')
      setMessage('')
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  // ---------------------------------------------------------------- key gate

  if (!key) {
    return (
      <div className="fta">
        <div className="fta-head">
          <button className="fta-back" onClick={goBack} aria-label="Back">
            <Icon name="chevron-left" size={20} />
          </button>
          <h1>Fish Tank</h1>
        </div>

        <MobileCard>
          <SectionHeader title="Operator key" />
          <p className="fta-note">
            These controls can create currency, so they are behind a real
            secret rather than a code stored in the app. Paste the operator key
            once and this device remembers it.
          </p>
          <input
            className="fta-field"
            type="password"
            value={keyDraft}
            onChange={e => setKeyDraft(e.target.value)}
            placeholder="Operator key"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button className="fta-primary" onClick={saveKey} disabled={!keyDraft.trim()}>
            Unlock
          </button>
        </MobileCard>
      </div>
    )
  }

  // ------------------------------------------------------------------ panel

  return (
    <div className="fta">
      <div className="fta-head">
        <button className="fta-back" onClick={goBack} aria-label="Back">
          <Icon name="chevron-left" size={20} />
        </button>
        <h1>Fish Tank</h1>
        <button className="fta-refresh" onClick={load} aria-label="Refresh">
          <Icon name="refresh" size={18} />
        </button>
      </div>

      <div className="fta-tabs">
        {[['players', 'Players'], ['grants', 'History'], ['message', 'Message']].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >{label}</button>
        ))}
      </div>

      {error && (
        <div className="fta-failure">
          <p className="fta-error">{error}</p>
          <button className="fta-retry" onClick={load}>Try again</button>
        </div>
      )}
      {loading && <p className="fta-note">Loading…</p>}

      {outcome && (
        <p className={`fta-outcome ${outcome.ok ? 'ok' : 'bad'}`}>{outcome.text}</p>
      )}

      {tab === 'players' && (
        <div className="fta-list">
          {players.length === 0 && !loading && !error && (
            <p className="fta-note">
              No players yet. Somebody appears here once they take a name in the
              game's multiplayer.
            </p>
          )}
          {players.map(person => (
            <div key={person.id} className="fta-player">
              <div className="fta-player-top">
                <div>
                  <strong>{person.username}</strong>
                  <span className="fta-platform">{person.platform}</span>
                </div>
                <button className="fta-give" onClick={() => { setGranting(person); setOutcome(null) }}>
                  Give
                </button>
              </div>
              <div className="fta-player-stats">
                Tank {person.best_container} · {person.best_score.toLocaleString()} pts ·
                {' '}{person.wins}W · {person.kills} eaten
                {person.coins_granted ? ` · ${person.coins_granted.toLocaleString()} granted` : ''}
                {person.unclaimed ? ` · ${person.unclaimed} waiting` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'grants' && (
        <div className="fta-list">
          {grants.length === 0 && !loading && !error && (
            <p className="fta-note">Nothing given yet.</p>
          )}
          {grants.map(grant => (
            <InfoRow
              key={grant.id}
              icon={grant.kind === 'coins' ? 'pound' : grant.kind === 'message' ? 'bell' : 'gift'}
              tone={grant.claimed_at ? 'neutral' : 'accent'}
              title={grant.kind === 'coins'
                ? `${grant.amount > 0 ? '+' : ''}${grant.amount.toLocaleString()} coins`
                : grant.kind === 'message'
                  ? (grant.title || 'Message')
                  : `${grant.item_id}`}
              subtitle={[
                grant.username || 'unknown',
                grant.claimed_at ? 'claimed' : 'waiting',
                grant.note,
              ].filter(Boolean).join(' · ')}
              onPress={grant.claimed_at ? undefined : () => revoke(grant)}
            />
          ))}
        </div>
      )}

      {tab === 'message' && (
        <MobileCard>
          <SectionHeader title="Message every player" />
          <input
            className="fta-field"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            maxLength={60}
          />
          <textarea
            className="fta-field fta-textarea"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="What do you want to tell them?"
            rows={4}
            maxLength={300}
          />
          <p className="fta-note">
            Shows inside the game, not as a phone notification. It waits for
            anyone who is not playing right now, so everybody sees it
            eventually.
          </p>
          <button
            className="fta-primary"
            onClick={announce}
            disabled={busy || (!title.trim() && !message.trim())}
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
        </MobileCard>
      )}

      {granting && (
        <>
          <div className="fta-scrim" onClick={() => setGranting(null)} />
          <div className="fta-sheet">
            <h2>Give to {granting.username}</h2>

            <div className="fta-kinds">
              {[['coins', 'Coins'], ['item', 'Shop item'], ['prize', 'Prize']].map(([id, label]) => (
                <button
                  key={id}
                  className={form.kind === id ? 'on' : ''}
                  onClick={() => setForm(f => ({ ...f, kind: id }))}
                >{label}</button>
              ))}
            </div>

            {form.kind === 'coins' ? (
              <>
                <input
                  className="fta-field"
                  type="number"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="Amount"
                />
                <p className="fta-note">
                  A negative number takes coins away. Up to 1,000,000 either way.
                </p>
              </>
            ) : (
              <input
                className="fta-field"
                value={form.itemId}
                onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))}
                placeholder={form.kind === 'item' ? 'Shop item id' : 'Prize id'}
              />
            )}

            <input
              className="fta-field"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Note (optional, for your records)"
            />

            <button className="fta-primary" onClick={submitGrant} disabled={busy}>
              {busy ? 'Sending…' : 'Give it'}
            </button>
            <button className="fta-secondary" onClick={() => setGranting(null)}>Cancel</button>
          </div>
        </>
      )}

      <button className="fta-forget" onClick={forgetKey}>Forget operator key on this device</button>

      <style>{`
        .fta { padding: 16px 16px 60px; }

        .fta-head {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }

        .fta-head h1 {
          margin: 0;
          flex: 1;
          font-size: 22px;
          font-weight: 700;
          color: var(--mobile-text);
        }

        .fta-back, .fta-refresh {
          background: none;
          border: none;
          padding: 6px;
          color: var(--mobile-accent);
          cursor: pointer;
          display: grid;
          place-items: center;
        }

        .fta-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 14px;
        }

        .fta-tabs button {
          flex: 1;
          padding: 9px;
          border-radius: 10px;
          border: 1px solid var(--mobile-border);
          background: var(--mobile-card);
          font-size: 13.5px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
          cursor: pointer;
        }

        .fta-tabs button.active {
          background: var(--mobile-accent);
          border-color: var(--mobile-accent);
          color: var(--mobile-on-accent);
        }

        .fta-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .fta-player {
          background: var(--mobile-card);
          border-radius: 14px;
          padding: 14px 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
        }

        .fta-player-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .fta-player-top strong {
          font-size: 16px;
          color: var(--mobile-text);
        }

        .fta-platform {
          margin-left: 8px;
          font-size: 11.5px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--mobile-text-secondary);
        }

        .fta-player-stats {
          margin-top: 6px;
          font-size: 13px;
          color: var(--mobile-text-secondary);
        }

        .fta-give {
          padding: 8px 16px;
          border-radius: 999px;
          border: none;
          background: var(--mobile-accent-soft);
          color: var(--mobile-accent);
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
        }

        .fta-field {
          width: 100%;
          margin-top: 10px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid var(--mobile-border);
          background: var(--mobile-bg);
          color: var(--mobile-text);
          font-size: 15px;
          font-family: inherit;
        }

        .fta-textarea { resize: vertical; }

        .fta-note {
          margin: 10px 2px 0;
          font-size: 13px;
          line-height: 1.45;
          color: var(--mobile-text-secondary);
        }

        .fta-failure {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }

        .fta-retry {
          flex: none;
          padding: 7px 14px;
          border-radius: 999px;
          border: none;
          background: var(--mobile-accent-soft);
          color: var(--mobile-accent);
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
        }

        .fta-error {
          margin: 4px 2px;
          font-size: 13.5px;
          font-weight: 600;
          color: #c0392b;
        }

        .fta-outcome {
          margin: 4px 2px 12px;
          font-size: 13.5px;
          font-weight: 600;
        }

        .fta-outcome.ok { color: #1f7a4d; }
        .fta-outcome.bad { color: #c0392b; }

        .fta-primary {
          width: 100%;
          margin-top: 14px;
          padding: 14px;
          border: none;
          border-radius: 12px;
          background: var(--mobile-accent);
          color: var(--mobile-on-accent);
          font-size: 15.5px;
          font-weight: 700;
          cursor: pointer;
        }

        .fta-primary:disabled { opacity: 0.45; cursor: default; }

        .fta-secondary {
          width: 100%;
          margin-top: 8px;
          padding: 12px;
          border: none;
          border-radius: 12px;
          background: none;
          color: var(--mobile-text-secondary);
          font-size: 14.5px;
          font-weight: 600;
          cursor: pointer;
        }

        .fta-scrim {
          position: fixed;
          inset: 0;
          background: rgba(10, 20, 30, 0.4);
          z-index: 8;
        }

        .fta-sheet {
          position: fixed;
          left: 12px;
          right: 12px;
          bottom: 90px;
          z-index: 9;
          background: var(--mobile-card);
          border-radius: 18px;
          padding: 20px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
        }

        .fta-sheet h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: var(--mobile-text);
        }

        .fta-kinds {
          display: flex;
          gap: 8px;
          margin-top: 14px;
        }

        .fta-kinds button {
          flex: 1;
          padding: 9px;
          border-radius: 10px;
          border: 1px solid var(--mobile-border);
          background: none;
          font-size: 13.5px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
          cursor: pointer;
        }

        .fta-kinds button.on {
          border-color: var(--mobile-accent);
          background: var(--mobile-accent-soft);
          color: var(--mobile-accent);
        }

        .fta-forget {
          width: 100%;
          margin-top: 26px;
          padding: 12px;
          border: none;
          background: none;
          font-size: 13px;
          color: var(--mobile-text-secondary);
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
