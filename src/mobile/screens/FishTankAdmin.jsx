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
  const [keyError, setKeyError] = useState('')
  const [checkingKey, setCheckingKey] = useState(false)
  const [players, setPlayers] = useState([])
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('players')
  const [isKeyRejected, setIsKeyRejected] = useState(false)

  // The grant being composed, or null.
  const [granting, setGranting] = useState(null)
  const [form, setForm] = useState({
    kind: 'coins',
    direction: 'give',   // 'give' | 'take' — only meaningful for coins
    amount: '',
    itemId: '',
    note: '',
    pushBody: '',
  })
  const [catalogue, setCatalogue] = useState({ fish: [], upgrades: [] })
  const [itemSearch, setItemSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState(null)

  // Announcements
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState('everyone')   // 'everyone' | 'some'
  const [chosen, setChosen] = useState(new Set())
  const [channels, setChannels] = useState({ inGame: true, push: true })

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
    setIsKeyRejected(false)
    try {
      const [people, history, shop] = await Promise.all([
        call('/operator/players'),
        call('/operator/grants'),
        call('/operator/catalogue'),
      ])
      setPlayers(Array.isArray(people) ? people : [])
      setGrants(Array.isArray(history) ? history : [])
      if (shop?.fish) setCatalogue(shop)
    } catch (err) {
      // Say which of the two things went wrong, because the fix is different.
      // "Load failed" is all WebKit gives you for a fetch that never
      // completed, and on its own it sends you looking at the key when the
      // problem is the network.
      if (/403|No\./.test(err.message)) {
        setError('That operator key was not accepted.')
        setIsKeyRejected(true)
      } else if (/Load failed|NetworkError|Failed to fetch/i.test(err.message)) {
        setError("Couldn't reach the game's server. Check your connection and try again.")
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  /**
   * Takes the key, checks it, and only then keeps it.
   *
   * Storing first and discovering later is how somebody ends up on a screen
   * that says the key is wrong with no way to tell whether they mistyped it
   * or the server moved. Whitespace is stripped from anywhere in the string,
   * not just the ends: 64 characters pasted out of a wrapped line arrives
   * with a space or a newline through the middle of it, which is invisible
   * in a password field.
   */
  const saveKey = async () => {
    const candidate = keyDraft.replace(/\s+/g, '')
    if (!candidate) return

    if (!/^[0-9a-f]{64}$/i.test(candidate)) {
      setKeyError(
        candidate.length === 64
          ? 'That is the right length but contains characters the key cannot have. It is 64 letters a–f and digits.'
          : `That is ${candidate.length} character${candidate.length === 1 ? '' : 's'}; the key is 64.`
      )
      return
    }

    setCheckingKey(true)
    setKeyError('')
    try {
      const response = await fetch(`${API}/operator/players`, {
        headers: { Authorization: `Bearer ${candidate}` },
      })
      if (response.status === 403 || response.status === 401) {
        setKeyError('The server did not accept that key.')
        return
      }
      if (!response.ok) {
        setKeyError(`The server answered ${response.status}. Try again in a moment.`)
        return
      }
      localStorage.setItem(KEY_STORAGE, candidate)
      setKey(candidate)
      setKeyDraft('')
    } catch {
      setKeyError("Couldn't reach the game's server. Check your connection.")
    } finally {
      setCheckingKey(false)
    }
  }

  const forgetKey = () => {
    localStorage.removeItem(KEY_STORAGE)
    setKey('')
    setPlayers([])
    setGrants([])
  }

  const submitGrant = async () => {
    if (!granting || busy) return
    // The sign comes from the Give/Take control, not from the operator
    // remembering to type a minus. Whichever they type, the control decides.
    const typed = Math.abs(parseInt(form.amount, 10))
    const amount = form.direction === 'take' ? -typed : typed

    if (form.kind === 'coins' && (!Number.isFinite(typed) || typed === 0)) {
      setOutcome({ ok: false, text: 'Enter an amount.' })
      return
    }
    if (form.kind !== 'coins' && !form.itemId) {
      setOutcome({ ok: false, text: 'Choose something to give.' })
      return
    }

    await Haptics.impact({ style: ImpactStyle.Medium })
    setBusy(true)
    setOutcome(null)
    try {
      const result = await call('/operator/grants', {
        method: 'POST',
        body: JSON.stringify({
          player_id: granting.id,
          kind: form.kind,
          amount: form.kind === 'coins' ? amount : 1,
          item_id: form.kind === 'coins' ? null : form.itemId.trim(),
          note: form.note.trim() || null,
          created_by: user?.name || user?.email || 'operator',
          push: form.pushBody.trim()
            ? { title: 'Fish Tank', body: form.pushBody.trim() }
            : undefined,
        }),
      })

      const landed = result?.pushed
        ? ` Notified ${result.pushed.sent} device${result.pushed.sent === 1 ? '' : 's'}.`
        : ' They see it as soon as they open the game.'
      setOutcome({
        ok: true,
        text: `${form.direction === 'take' && form.kind === 'coins' ? 'Taken from' : 'Sent to'} ${granting.username}.${landed}`,
      })
      setForm({ kind: 'coins', direction: 'give', amount: '', itemId: '', note: '', pushBody: '' })
      setItemSearch('')
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

  const toggleRecipient = (id) => {
    setChosen(previous => {
      const next = new Set(previous)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const announce = async () => {
    if (!title.trim() && !message.trim()) return
    if (!channels.inGame && !channels.push) {
      setOutcome({ ok: false, text: 'Pick at least one way to send it.' })
      return
    }
    if (audience === 'some' && chosen.size === 0) {
      setOutcome({ ok: false, text: 'Choose who it goes to.' })
      return
    }

    await Haptics.impact({ style: ImpactStyle.Medium })
    setBusy(true)
    setOutcome(null)
    try {
      const result = await call('/operator/announce', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          body: message.trim(),
          player_ids: audience === 'some' ? [...chosen] : undefined,
          inGame: channels.inGame,
          push: channels.push,
          created_by: user?.name || user?.email || 'operator',
        }),
      })

      // Two numbers, because they mean different things: devices a
      // notification actually reached, and players the in-game message is
      // waiting for. Reporting one as the other is how "sent to 3" comes to
      // mean nothing.
      const parts = []
      if (channels.push) {
        parts.push(`${result.sent} device${result.sent === 1 ? '' : 's'} notified`)
        if (result.failed) parts.push(`${result.failed} failed`)
      }
      if (channels.inGame) {
        parts.push(`waiting in-game for ${result.queued} player${result.queued === 1 ? '' : 's'}`)
      }
      setOutcome({
        ok: result.sent > 0 || result.queued > 0,
        text: parts.join(', ') + '.'
          + (channels.push && result.sent === 0 ? ' Nobody in that group has notifications turned on.' : ''),
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
            className="fta-field fta-key"
            type="text"
            value={keyDraft}
            onChange={e => { setKeyDraft(e.target.value); setKeyError('') }}
            placeholder="Operator key"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="fta-count">
            {keyDraft.replace(/\s+/g, '').length} of 64 characters
          </p>
          {keyError && <p className="fta-error">{keyError}</p>}
          <button
            className="fta-primary"
            onClick={saveKey}
            disabled={!keyDraft.trim() || checkingKey}
          >
            {checkingKey ? 'Checking…' : 'Unlock'}
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
          {/* A rejected key cannot be retried into working, so offer the only
              thing that helps: entering a different one. Retrying is right for
              everything else. */}
          {isKeyRejected ? (
            <button className="fta-retry" onClick={forgetKey}>Re-enter key</button>
          ) : (
            <button className="fta-retry" onClick={load}>Try again</button>
          )}
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
          <SectionHeader title="Who gets it" />
          <div className="fta-kinds">
            <button
              className={audience === 'everyone' ? 'on' : ''}
              onClick={() => setAudience('everyone')}
            >Everyone</button>
            <button
              className={audience === 'some' ? 'on' : ''}
              onClick={() => setAudience('some')}
            >Choose players</button>
          </div>

          {audience === 'some' && (
            <div className="fta-catalogue">
              {players.map(person => (
                <button
                  key={person.id}
                  className={`fta-item${chosen.has(person.id) ? ' on' : ''}`}
                  onClick={() => toggleRecipient(person.id)}
                >
                  <span>{person.username}</span>
                  {chosen.has(person.id) && <Icon name="check" size={16} />}
                </button>
              ))}
              {players.length === 0 && <p className="fta-note">No players yet.</p>}
            </div>
          )}

          <SectionHeader title="How it reaches them" />
          <div className="fta-kinds">
            <button
              className={channels.push ? 'on' : ''}
              onClick={() => setChannels(c => ({ ...c, push: !c.push }))}
            >Phone notification</button>
            <button
              className={channels.inGame ? 'on' : ''}
              onClick={() => setChannels(c => ({ ...c, inGame: !c.inGame }))}
            >In the game</button>
          </div>
          <p className="fta-note">
            {/* Said plainly because the two behave differently, and the
                difference decides which one is the right choice. */}
            A phone notification arrives now, for anyone who allowed them. The
            in-game message waits until they next open Fish Tank, so it reaches
            people a notification would not.
          </p>

          <SectionHeader title="Message" />
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
              {[['coins', 'Coins'], ['item', 'Fish'], ['prize', 'Upgrade']].map(([id, label]) => (
                <button
                  key={id}
                  className={form.kind === id ? 'on' : ''}
                  onClick={() => {
                    setForm(f => ({ ...f, kind: id, itemId: '' }))
                    setItemSearch('')
                  }}
                >{label}</button>
              ))}
            </div>

            {form.kind === 'coins' ? (
              <>
                {/* Give or take, chosen explicitly. Relying on somebody
                    typing a minus sign makes taking coins back a hidden
                    feature, and a mistyped sign the wrong way is a player
                    waking up richer than intended. */}
                <div className="fta-kinds fta-direction">
                  <button
                    className={form.direction === 'give' ? 'on' : ''}
                    onClick={() => setForm(f => ({ ...f, direction: 'give' }))}
                  >Give</button>
                  <button
                    className={form.direction === 'take' ? 'on take' : ''}
                    onClick={() => setForm(f => ({ ...f, direction: 'take' }))}
                  >Take away</button>
                </div>
                <input
                  className="fta-field"
                  type="number"
                  inputMode="numeric"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="How many coins"
                />
                <p className="fta-note">
                  {form.direction === 'take'
                    ? 'Their balance floors at zero — nobody goes into debt.'
                    : 'Up to 1,000,000 at a time.'}
                </p>
              </>
            ) : (
              <>
                {(() => {
                  const list = form.kind === 'item' ? catalogue.fish : catalogue.upgrades
                  const query = itemSearch.trim().toLowerCase()
                  const shown = query
                    ? list.filter(entry => entry.name.toLowerCase().includes(query))
                    : list
                  return (
                    <>
                      {list.length > 8 && (
                        <input
                          className="fta-field"
                          value={itemSearch}
                          onChange={e => setItemSearch(e.target.value)}
                          placeholder={`Search ${list.length} ${form.kind === 'item' ? 'fish' : 'upgrades'}`}
                          autoCapitalize="none"
                        />
                      )}
                      <div className="fta-catalogue">
                        {shown.map(entry => (
                          <button
                            key={entry.id}
                            className={`fta-item${form.itemId === entry.id ? ' on' : ''}`}
                            onClick={() => setForm(f => ({ ...f, itemId: entry.id }))}
                          >
                            <span>{entry.name}</span>
                            {entry.price > 0 && (
                              <span className="fta-price">{entry.price.toLocaleString()}</span>
                            )}
                          </button>
                        ))}
                        {shown.length === 0 && (
                          <p className="fta-note">Nothing matches "{itemSearch}".</p>
                        )}
                        {list.length === 0 && (
                          <p className="fta-note">
                            Couldn't load the catalogue. Pull back and refresh.
                          </p>
                        )}
                      </div>
                    </>
                  )
                })()}
              </>
            )}

            <input
              className="fta-field"
              value={form.pushBody}
              onChange={e => setForm(f => ({ ...f, pushBody: e.target.value }))}
              placeholder="Tell them on their phone (optional)"
              maxLength={140}
            />

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

        /* Shown, not masked. A masked field hides exactly the paste damage
           that stops the key working, and there is nobody to shoulder-surf a
           key you are typing into your own phone. */
        .fta-key {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 13px;
          letter-spacing: 0.02em;
          word-break: break-all;
        }

        .fta-count {
          margin: 6px 2px 0;
          font-size: 12.5px;
          font-variant-numeric: tabular-nums;
          color: var(--mobile-text-secondary);
        }

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
          max-height: 78vh;
          overflow-y: auto;
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

        /* Taking coins away is coloured differently from giving them. The two
           are one tap apart and they are not the same act. */
        .fta-kinds button.on.take {
          border-color: #c0392b;
          background: rgba(192, 57, 43, 0.1);
          color: #c0392b;
        }

        .fta-direction { margin-top: 12px; }

        .fta-catalogue {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 10px;
          max-height: 220px;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .fta-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 11px 14px;
          border-radius: 10px;
          border: 1px solid var(--mobile-border);
          background: none;
          font-size: 15px;
          font-weight: 500;
          color: var(--mobile-text);
          text-align: left;
          cursor: pointer;
        }

        .fta-item.on {
          border-color: var(--mobile-accent);
          background: var(--mobile-accent-soft);
          color: var(--mobile-accent);
          font-weight: 700;
        }

        .fta-price {
          flex: none;
          font-size: 13px;
          font-variant-numeric: tabular-nums;
          color: var(--mobile-text-secondary);
        }

        .fta-item.on .fta-price { color: var(--mobile-accent); }

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
