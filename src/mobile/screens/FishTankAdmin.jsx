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
  const [tab, setTab] = useState('overview')

  // The sub-view open inside the Overview tab, or null for the dashboard.
  const [view, setView] = useState(null)
  const [overview, setOverview] = useState(null)
  const [maintenance, setMaintenance] = useState({ on: false, message: '' })
  const [maintenanceDraft, setMaintenanceDraft] = useState('')
  const [stale, setStale] = useState([])
  const [staleChosen, setStaleChosen] = useState(new Set())
  const [crashes, setCrashes] = useState([])
  const [board, setBoard] = useState({ board: 'alltime', rows: [] })
  const [blockWords, setBlockWords] = useState('')
  const [schedule, setSchedule] = useState([])

  // Give-to-everyone sheet.
  const [givingAll, setGivingAll] = useState(false)
  const [giveAllForm, setGiveAllForm] = useState({ amount: '', note: '', pushBody: '' })

  // Renaming sheet (from a profile).
  const [renaming, setRenaming] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')

  // How long a ban lasts: 3, 7, or 0 for permanent.
  const [banDays, setBanDays] = useState(0)

  // Sending later, from the Message tab.
  const [sendLater, setSendLater] = useState(false)
  const [sendAt, setSendAt] = useState('')
  const [isKeyRejected, setIsKeyRejected] = useState(false)

  // The grant being composed, or null.
  const [granting, setGranting] = useState(null)

  // The open profile: the player id, and everything the server knows about
  // them once it arrives. Null id means the list is showing.
  const [profileId, setProfileId] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')
  const [expandedCrash, setExpandedCrash] = useState(null)

  // Removing an account is destructive twice over, so it gets its own sheet.
  const [removing, setRemoving] = useState(null)

  // Banning. `banning` holds the player whose sheet is open; the reason is
  // typed there and travels to the server, because it is what the person is
  // shown when they next open the game.
  const [banning, setBanning] = useState(null)
  const [banReason, setBanReason] = useState('')
  const [notifyOnBan, setNotifyOnBan] = useState(true)
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
    let response
    try {
      response = await fetch(`${API}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          ...(options.headers || {}),
        },
      })
    } catch {
      // A fetch that never completed throws a TypeError whose message is the
      // useless "Load failed" on WebKit. Translated here rather than in each
      // caller, because every action handler used to print it raw and it read
      // as a bug in the button the operator had just pressed.
      throw new Error("Couldn't reach the game's server. Check your connection and try again.")
    }
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || `Failed (${response.status})`)
    return payload
  }

  const load = async () => {
    setLoading(true)
    setError('')
    setIsKeyRejected(false)
    try {
      const [people, history, shop, stats, maint] = await Promise.all([
        call('/operator/players'),
        call('/operator/grants'),
        call('/operator/catalogue'),
        call('/operator/overview').catch(() => null),
        call('/operator/maintenance').catch(() => null),
      ])
      setPlayers(Array.isArray(people) ? people : [])
      setGrants(Array.isArray(history) ? history : [])
      if (shop?.fish) setCatalogue(shop)
      if (stats) setOverview(stats)
      if (maint) { setMaintenance(maint); setMaintenanceDraft(maint.message || '') }
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
      await refreshProfile()
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

  /**
   * Bans somebody, with a reason they will actually be shown.
   *
   * The reason is not optional-in-spirit: an account that simply stops working
   * reads as a bug and teaches the person nothing. It is stored, returned by
   * every request they make afterwards, and pushed to their phone.
   */
  const banPlayer = async () => {
    if (!banning) return
    setBusy(true)
    setOutcome(null)
    try {
      const result = await call(`/operator/players/${banning.id}/ban`, {
        method: 'POST',
        body: JSON.stringify({
          reason: banReason.trim(),
          notify: notifyOnBan,
          created_by: 'portal',
          days: banDays,
        }),
      })
      const pushed = result?.pushed
      const bits = [`${banning.username} is banned.`]
      if (result?.grants_withdrawn) {
        bits.push(`${result.grants_withdrawn} unclaimed grant${result.grants_withdrawn === 1 ? '' : 's'} withdrawn.`)
      }
      if (notifyOnBan) {
        bits.push(pushed?.sent
          ? `Told on ${pushed.sent} device${pushed.sent === 1 ? '' : 's'}.`
          : 'No devices registered, so no notification was delivered.')
      }
      setOutcome({ ok: true, text: bits.join(' ') })
      setBanning(null)
      setBanReason('')
      await load()
      await refreshProfile()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const unbanPlayer = async (person) => {
    setBusy(true)
    setOutcome(null)
    try {
      await call(`/operator/players/${person.id}/ban`, {
        method: 'DELETE',
        body: JSON.stringify({ notify: true }),
      })
      setOutcome({ ok: true, text: `${person.username} can play again.` })
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  /**
   * Opens one player's file. The list row already holds the basics, so it is
   * shown immediately while the full record loads behind it.
   */
  const openProfile = async (person) => {
    setProfileId(person.id)
    setProfile({ player: person, devices: [], grants: [], daily: [], crashes: [], friends: 0, partial: true })
    setProfileError('')
    setExpandedCrash(null)
    setOutcome(null)
    try {
      const full = await call(`/operator/players/${person.id}`)
      setProfile(full)
    } catch (err) {
      setProfileError(err.message)
    }
  }

  const refreshProfile = async () => {
    if (!profileId) return
    try {
      setProfile(await call(`/operator/players/${profileId}`))
    } catch (err) {
      setProfileError(err.message)
    }
  }

  const closeProfile = () => {
    setProfileId(null)
    setProfile(null)
    setProfileError('')
  }

  /**
   * Deletes the account outright. Ban is for people; removal is for rows —
   * duplicates, test accounts, ghosts holding a name. The server cascades
   * everything, so the name genuinely frees up.
   */
  const removePlayer = async () => {
    if (!removing) return
    setBusy(true)
    setOutcome(null)
    try {
      await call(`/operator/players/${removing.id}`, { method: 'DELETE' })
      setOutcome({ ok: true, text: `${removing.username} removed. The name is free again.` })
      setRemoving(null)
      closeProfile()
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const ago = (stamp) => {
    if (!stamp) return 'never'
    const s = Math.floor((Date.now() - stamp) / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
    return new Date(stamp).toLocaleDateString()
  }

  /**
   * "Signed up and never came back." True of an account older than a day
   * whose last sight of the server was within ten minutes of its creation
   * and which never scored a point — the johnnyd/johnnyde/johnnydee shape.
   */
  const looksStale = (person) =>
    person &&
    !person.banned_at &&
    (person.best_score ?? 0) === 0 &&
    person.seen_at - person.created_at < 10 * 60 * 1000 &&
    Date.now() - person.created_at > 24 * 60 * 60 * 1000

  const fullDate = (stamp) =>
    stamp ? new Date(stamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'

  /** Opens a sub-view of the overview and fetches what it shows. */
  const openView = async (which) => {
    setView(which)
    setOutcome(null)
    try {
      if (which === 'housekeeping') {
        setStale(await call('/operator/stale'))
        setStaleChosen(new Set())
      }
      if (which === 'crashes') setCrashes(await call('/operator/crashes'))
      if (which === 'leaderboard') setBoard(await call('/operator/leaderboard?board=alltime'))
      if (which === 'blocklist') {
        const { words } = await call('/operator/blocklist')
        setBlockWords((words || []).join('\n'))
      }
      if (which === 'schedule') setSchedule(await call('/operator/schedule'))
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    }
  }

  const setMaintenanceMode = async (on) => {
    setBusy(true)
    setOutcome(null)
    try {
      const result = await call('/operator/maintenance', {
        method: 'PUT',
        body: JSON.stringify({ on, message: maintenanceDraft.trim() }),
      })
      setMaintenance(result)
      setOutcome({
        ok: true,
        text: on
          ? 'The game is in maintenance. Players see the wall until you lift it.'
          : 'Maintenance lifted. The game is open again.',
      })
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const toggleStale = (id) => {
    setStaleChosen(previous => {
      const next = new Set(previous)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const removeStale = async () => {
    if (staleChosen.size === 0) return
    if (!confirm(`Remove ${staleChosen.size} account${staleChosen.size === 1 ? '' : 's'} forever? Their names become free again.`)) return
    setBusy(true)
    try {
      // The worker takes fifty at a time; the list can hold two hundred.
      // Chunk here so "select all" means all, not silently the first fifty.
      const ids = [...staleChosen]
      let removed = 0
      for (let i = 0; i < ids.length; i += 50) {
        const slice = ids.slice(i, i + 50)
        const result = await call('/operator/players/bulk-remove', {
          method: 'POST',
          body: JSON.stringify({ ids: slice }),
        })
        removed += result.removed || 0
      }
      // Refresh first, outcome second — openView clears the outcome line,
      // and a success message wiped on arrival is a success nobody saw.
      await openView('housekeeping')
      await load()
      setOutcome({ ok: true, text: `${removed} account${removed === 1 ? '' : 's'} removed. Names freed.` })
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const saveBlocklist = async () => {
    setBusy(true)
    try {
      const words = blockWords.split(/\n+/).map(w => w.trim()).filter(Boolean)
      const result = await call('/operator/blocklist', {
        method: 'PUT',
        body: JSON.stringify({ words }),
      })
      setBlockWords((result.words || []).join('\n'))
      setOutcome({ ok: true, text: `${result.words.length} blocked word${result.words.length === 1 ? '' : 's'} saved. New signups are checked against them.` })
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const giveToEveryone = async () => {
    const amount = Math.trunc(Number(giveAllForm.amount))
    if (!Number.isFinite(amount) || amount <= 0) {
      setOutcome({ ok: false, text: 'Enter an amount.' })
      return
    }
    await Haptics.impact({ style: ImpactStyle.Medium })
    setBusy(true)
    try {
      const result = await call('/operator/grants/all', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          note: giveAllForm.note.trim() || null,
          created_by: user?.name || user?.email || 'operator',
          push: giveAllForm.pushBody.trim()
            ? { title: 'Fish Tank', body: giveAllForm.pushBody.trim() }
            : undefined,
        }),
      })
      setOutcome({
        ok: true,
        text: `${amount.toLocaleString()} coins to ${result.players} player${result.players === 1 ? '' : 's'}.`
          + (result.sent ? ` ${result.sent} device${result.sent === 1 ? '' : 's'} notified.` : ''),
      })
      setGivingAll(false)
      setGiveAllForm({ amount: '', note: '', pushBody: '' })
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const renamePlayer = async () => {
    if (!renaming) return
    setBusy(true)
    try {
      const result = await call(`/operator/players/${renaming.id}/rename`, {
        method: 'POST',
        body: JSON.stringify({ username: renameDraft.trim(), notify: true }),
      })
      setOutcome({ ok: true, text: `${result.from} is now ${result.to}.` })
      setRenaming(null)
      await load()
      await refreshProfile()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const removeScore = async (row) => {
    if (!confirm(`Remove ${row.username || 'this player'}'s score from the board?`)) return
    try {
      await call('/operator/leaderboard', {
        method: 'DELETE',
        body: JSON.stringify({
          board: board.board,
          player_id: row.id,
          day: board.day,
        }),
      })
      setBoard(await call(`/operator/leaderboard?board=${board.board}${board.day ? `&day=${board.day}` : ''}`))
      setOutcome({ ok: true, text: 'Score removed.' })
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    }
  }

  const cancelScheduled = async (row) => {
    if (!confirm('Cancel this scheduled message?')) return
    try {
      await call(`/operator/schedule/${row.id}`, { method: 'DELETE' })
      setSchedule(await call('/operator/schedule'))
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
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

    // Written now, sent later: the same message lands in the schedule
    // instead of going out, and the worker delivers it when its time comes.
    if (sendLater) {
      try {
        const when = new Date(sendAt).getTime()
        if (!Number.isFinite(when) || when < Date.now() - 60000) {
          setOutcome({ ok: false, text: 'Pick a time in the future.' })
          return
        }
        await call('/operator/schedule', {
          method: 'POST',
          body: JSON.stringify({
            title: title.trim(),
            body: message.trim(),
            send_at: when,
            player_ids: audience === 'some' ? [...chosen] : undefined,
            inGame: channels.inGame,
            push: channels.push,
            created_by: user?.name || user?.email || 'operator',
          }),
        })
        setOutcome({
          ok: true,
          text: `Scheduled for ${new Date(when).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`,
        })
        setTitle('')
        setMessage('')
        setSendLater(false)
      } catch (err) {
        setOutcome({ ok: false, text: err.message })
      } finally {
        setBusy(false)
      }
      return
    }

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

      {!profileId && <div className="fta-tabs">
        {[['overview', 'Overview'], ['players', 'Players'], ['message', 'Message']].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => { setTab(id); setView(null) }}
          >{label}</button>
        ))}
      </div>}

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

      {profileId && profile && (() => {
        const person = profile.player
        const stale = looksStale(person)
        return (
          <div className="fta-profile">
            <button className="fta-profile-back" onClick={closeProfile}>
              <Icon name="chevron-left" size={18} /> All players
            </button>

            <div className="fta-profile-head">
              <div>
                <h2>{person.username}</h2>
                <div className="fta-profile-chips">
                  <span className="fta-platform">{person.platform}</span>
                  {person.banned_at && <span className="fta-banned-tag">Banned</span>}
                  {stale && <span className="fta-stale-tag">Inactive</span>}
                </div>
              </div>
            </div>

            {profileError && <p className="fta-error">{profileError}</p>}

            {stale && (
              <p className="fta-stale-note">
                Signed up {ago(person.created_at)} and never played — likely an
                abandoned or duplicate registration. Removing it frees the name.
              </p>
            )}

            {person.banned_at && (
              <p className="fta-stale-note">
                Banned {ago(person.banned_at)}{person.banned_by ? ` by ${person.banned_by}` : ''}.
                {person.ban_reason ? ` "${person.ban_reason}"` : ' No reason recorded.'}
              </p>
            )}

            <MobileCard>
              <SectionHeader title="Account" />
              <div className="fta-kv"><span>Joined</span><strong>{fullDate(person.created_at)}</strong></div>
              <div className="fta-kv"><span>Last played</span><strong>{ago(person.seen_at)}</strong></div>
              <div className="fta-kv"><span>Friends</span><strong>{profile.friends}</strong></div>
              <div className="fta-kv">
                <span>Device</span>
                <strong>{person.device_id
                  ? `…${person.device_id.slice(-8)}`
                  : 'not recorded (older app)'}</strong>
              </div>
              <div className="fta-kv">
                <span>Notifications</span>
                <strong>{profile.devices.length
                  ? `${profile.devices.length} device${profile.devices.length === 1 ? '' : 's'}`
                  : 'none registered'}</strong>
              </div>
            </MobileCard>

            {profile.siblings?.length > 0 && (
              <MobileCard>
                <SectionHeader title="Same device" />
                <p className="fta-note">
                  These accounts were created on the same physical device.
                  Duplicates from before one-account-per-device are usually
                  safe to remove.
                </p>
                {profile.siblings.map(sib => (
                  <button key={sib.id} className="fta-sibling" onClick={() => openProfile(sib)}>
                    <span>
                      <strong>{sib.username}</strong>
                      {sib.banned_at ? ' · banned' : looksStale(sib) ? ' · inactive' : ''}
                    </span>
                    <span className="fta-sibling-when">{ago(sib.created_at)}</span>
                  </button>
                ))}
              </MobileCard>
            )}

            <MobileCard>
              <SectionHeader title="Their game" />
              <div className="fta-kv"><span>Tank reached</span><strong>{person.best_container}</strong></div>
              <div className="fta-kv"><span>Best score</span><strong>{(person.best_score ?? 0).toLocaleString()}</strong></div>
              <div className="fta-kv"><span>Matches won</span><strong>{person.wins ?? 0}</strong></div>
              <div className="fta-kv"><span>Fish eaten</span><strong>{person.kills ?? 0}</strong></div>
              <div className="fta-kv"><span>Coins granted</span><strong>{(person.coins_granted ?? 0).toLocaleString()}</strong></div>
              {profile.daily.length > 0 && (
                <>
                  <SectionHeader title="Recent daily runs" />
                  {profile.daily.map(day => (
                    <div className="fta-kv" key={day.day}>
                      <span>{day.day}</span>
                      <strong>{day.score.toLocaleString()} pts · {day.tide} tide</strong>
                    </div>
                  ))}
                </>
              )}
            </MobileCard>

            <MobileCard>
              <SectionHeader title="Crashes" />
              {profile.partial ? (
                <p className="fta-note">Loading…</p>
              ) : profile.crashes.length === 0 ? (
                <p className="fta-note">No crashes reported from their game.</p>
              ) : profile.crashes.map((crash, index) => (
                <button
                  key={index}
                  className="fta-crash"
                  onClick={() => setExpandedCrash(expandedCrash === index ? null : index)}
                >
                  <div className="fta-crash-top">
                    <span>{ago(crash.created_at)}</span>
                    <span>{crash.platform}{crash.app_version ? ` · v${crash.app_version}` : ''}</span>
                  </div>
                  <div className="fta-crash-message">{crash.message}</div>
                  {expandedCrash === index && crash.stack && (
                    <pre className="fta-crash-stack">{crash.stack}</pre>
                  )}
                </button>
              ))}
            </MobileCard>

            {profile.grants.length > 0 && (
              <MobileCard>
                <SectionHeader title="Grant history" />
                {profile.grants.map(grant => (
                  <div className="fta-kv" key={grant.id}>
                    <span>
                      {grant.kind === 'coins'
                        ? `${grant.amount > 0 ? '+' : ''}${grant.amount.toLocaleString()} coins`
                        : grant.item_id || grant.kind}
                    </span>
                    <strong>{grant.claimed_at ? 'claimed' : 'waiting'} · {ago(grant.created_at)}</strong>
                  </div>
                ))}
              </MobileCard>
            )}

            <div className="fta-profile-actions">
              {!person.banned_at && (
                <button
                  className="fta-primary"
                  onClick={() => { setGranting(person); setOutcome(null) }}
                >Give something</button>
              )}
              {person.banned_at ? (
                <button
                  className="fta-unban fta-wide"
                  disabled={busy}
                  onClick={async () => { await unbanPlayer(person); await refreshProfile() }}
                >Unban</button>
              ) : (
                <button
                  className="fta-ban fta-wide"
                  disabled={busy}
                  onClick={() => {
                    setBanning(person)
                    setBanReason('')
                    setBanDays(0)
                    setNotifyOnBan(true)
                    setOutcome(null)
                  }}
                >Ban this player</button>
              )}
              <button
                className="fta-unban fta-wide"
                disabled={busy}
                onClick={() => { setRenaming(person); setRenameDraft(person.username) }}
              >Rename…</button>
              <button
                className="fta-remove"
                disabled={busy}
                onClick={() => setRemoving(person)}
              >Remove account…</button>
            </div>
          </div>
        )
      })()}

      {!profileId && tab === 'overview' && view === null && (
        <div className="fta-list">
          <MobileCard>
            <SectionHeader title="Maintenance" />
            <p className="fta-note">
              {maintenance.on
                ? 'The game is CLOSED. Every player sees the wall until you lift it.'
                : 'The game is open. Closing it walls every player on the next launch or resume.'}
            </p>
            <input
              className="fta-field"
              value={maintenanceDraft}
              onChange={e => setMaintenanceDraft(e.target.value)}
              placeholder="What the wall says (optional)"
              maxLength={200}
            />
            <button
              className={maintenance.on ? 'fta-primary' : 'fta-maintenance-close'}
              disabled={busy}
              onClick={() => setMaintenanceMode(!maintenance.on)}
            >
              {maintenance.on ? 'Lift maintenance — open the game' : 'Close the game for maintenance'}
            </button>
          </MobileCard>

          {overview && (
            <>
              <div className="fta-stat-grid">
                <div className="fta-stat"><strong>{overview.totals?.total ?? 0}</strong><span>players</span></div>
                <div className="fta-stat"><strong>{overview.totals?.new_24h ?? 0}</strong><span>new today</span></div>
                <div className="fta-stat"><strong>{overview.totals?.active_24h ?? 0}</strong><span>played today</span></div>
                <div className="fta-stat"><strong>{overview.totals?.new_7d ?? 0}</strong><span>new this week</span></div>
                <div className="fta-stat"><strong>{overview.totals?.active_7d ?? 0}</strong><span>played this week</span></div>
                <div className="fta-stat"><strong>{overview.push_devices ?? 0}</strong><span>push devices</span></div>
              </div>

              <MobileCard>
                <SectionHeader title="Platforms" />
                {(overview.platforms || []).map(row => (
                  <div className="fta-kv" key={row.platform}>
                    <span>{row.platform}</span><strong>{row.n}</strong>
                  </div>
                ))}
                {(overview.totals?.banned ?? 0) > 0 && (
                  <div className="fta-kv"><span>banned</span><strong>{overview.totals.banned}</strong></div>
                )}
              </MobileCard>

              {(overview.top || []).length > 0 && (
                <MobileCard>
                  <SectionHeader title="Top scores" />
                  {overview.top.map((row, i) => (
                    <div className="fta-kv" key={row.username}>
                      <span>{i + 1}. {row.username}</span>
                      <strong>{row.best_score.toLocaleString()}</strong>
                    </div>
                  ))}
                </MobileCard>
              )}
            </>
          )}

          <MobileCard>
            <SectionHeader title="Tools" />
            {[
              ['housekeeping', 'Housekeeping', overview?.stale
                ? `${overview.stale} inactive account${overview.stale === 1 ? '' : 's'} to review`
                : 'Nothing to clean up'],
              ['crashes', 'Crashes', overview?.crashes_7d
                ? `${overview.crashes_7d} in the last week`
                : 'None reported this week'],
              ['leaderboard', 'Leaderboards', 'See the boards, remove a score'],
              ['blocklist', 'Username blocklist', 'Words new names may not contain'],
              ['schedule', 'Scheduled messages', 'Written now, sent later'],
              ['history', 'Grant history', 'Everything given, and to whom'],
            ].map(([id, label, hint]) => (
              <button key={id} className="fta-tool" onClick={() => openView(id)}>
                <span><strong>{label}</strong><em>{hint}</em></span>
                <Icon name="chevron-right" size={16} />
              </button>
            ))}
          </MobileCard>

          <button
            className="fta-primary"
            onClick={() => { setGivingAll(true); setOutcome(null) }}
          >Give coins to everyone</button>
        </div>
      )}

      {!profileId && tab === 'overview' && view === 'housekeeping' && (
        <div className="fta-list">
          <button className="fta-profile-back" onClick={() => setView(null)}>
            <Icon name="chevron-left" size={18} /> Overview
          </button>
          <p className="fta-note">
            Signed up, never played, older than a day. Removing frees their
            names; nothing else is lost because nothing was ever played.
          </p>
          {stale.length === 0 && <p className="fta-note">No ghosts. Clean tank.</p>}
          {stale.map(person => (
            <button
              key={person.id}
              className={`fta-item${staleChosen.has(person.id) ? ' on' : ''}`}
              onClick={() => toggleStale(person.id)}
            >
              <span>
                <strong>{person.username}</strong>
                {' '}· {person.platform} · joined {ago(person.created_at)}
              </span>
              {staleChosen.has(person.id) && <Icon name="check" size={16} />}
            </button>
          ))}
          {stale.length > 0 && (
            <>
              <button
                className="fta-secondary"
                onClick={() => setStaleChosen(new Set(stale.map(p => p.id)))}
              >Select all {stale.length}</button>
              <button
                className="fta-confirm-ban fta-wide"
                disabled={busy || staleChosen.size === 0}
                onClick={removeStale}
              >
                {busy ? 'Removing…' : `Remove ${staleChosen.size || ''} selected`}
              </button>
            </>
          )}
        </div>
      )}

      {!profileId && tab === 'overview' && view === 'crashes' && (
        <div className="fta-list">
          <button className="fta-profile-back" onClick={() => setView(null)}>
            <Icon name="chevron-left" size={18} /> Overview
          </button>
          {crashes.length === 0 && <p className="fta-note">No crashes reported. Long may it last.</p>}
          {crashes.map((crash, index) => (
            <button
              key={crash.id}
              className="fta-crash fta-crash--card"
              onClick={() => setExpandedCrash(expandedCrash === index ? null : index)}
            >
              <div className="fta-crash-top">
                <span>{crash.username || 'before sign-in'} · {ago(crash.created_at)}</span>
                <span>{crash.platform}{crash.app_version ? ` · v${crash.app_version}` : ''}</span>
              </div>
              <div className="fta-crash-message">{crash.message}</div>
              {expandedCrash === index && crash.stack && (
                <pre className="fta-crash-stack">{crash.stack}</pre>
              )}
            </button>
          ))}
        </div>
      )}

      {!profileId && tab === 'overview' && view === 'leaderboard' && (
        <div className="fta-list">
          <button className="fta-profile-back" onClick={() => setView(null)}>
            <Icon name="chevron-left" size={18} /> Overview
          </button>
          <div className="fta-kinds">
            <button
              className={board.board === 'alltime' ? 'on' : ''}
              onClick={async () => setBoard(await call('/operator/leaderboard?board=alltime'))}
            >All time</button>
            <button
              className={board.board === 'daily' ? 'on' : ''}
              onClick={async () => setBoard(await call('/operator/leaderboard?board=daily'))}
            >Today's daily</button>
          </div>
          <p className="fta-note">Tap a row to remove that score from the board.</p>
          {board.rows.length === 0 && <p className="fta-note">Empty board.</p>}
          {board.rows.map((row, i) => (
            <button key={`${row.id}-${i}`} className="fta-item" onClick={() => removeScore(row)}>
              <span>
                <strong>{i + 1}. {row.username || 'deleted player'}</strong>
                {row.banned_at ? ' · banned' : ''}
              </span>
              <span className="fta-price">{(row.best_score ?? row.score ?? 0).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}

      {!profileId && tab === 'overview' && view === 'blocklist' && (
        <MobileCard>
          <button className="fta-profile-back" onClick={() => setView(null)}>
            <Icon name="chevron-left" size={18} /> Overview
          </button>
          <SectionHeader title="Username blocklist" />
          <p className="fta-note">
            One word per line. A new name containing any of them is refused at
            signup — the player just sees "that name isn't available". Existing
            names are untouched; rename or ban those from their profile.
          </p>
          <textarea
            className="fta-field fta-textarea"
            rows={8}
            value={blockWords}
            onChange={e => setBlockWords(e.target.value)}
            placeholder={'one\nword\nper\nline'}
            autoCapitalize="none"
          />
          <button className="fta-primary" disabled={busy} onClick={saveBlocklist}>
            {busy ? 'Saving…' : 'Save blocklist'}
          </button>
        </MobileCard>
      )}

      {!profileId && tab === 'overview' && view === 'schedule' && (
        <div className="fta-list">
          <button className="fta-profile-back" onClick={() => setView(null)}>
            <Icon name="chevron-left" size={18} /> Overview
          </button>
          <p className="fta-note">
            Written in the Message tab with "send later". Delivery is checked
            about once a minute.
          </p>
          {schedule.length === 0 && <p className="fta-note">Nothing scheduled.</p>}
          {schedule.map(row => (
            <div className="fta-player" key={row.id}>
              <div className="fta-player-top">
                <div>
                  <strong>{row.title || '(no title)'}</strong>
                  {row.sent_at
                    ? <span className="fta-platform">sent</span>
                    : <span className="fta-banned-tag" style={{ background: '#1f7a4d' }}>waiting</span>}
                </div>
                {!row.sent_at && (
                  <button className="fta-unban" onClick={() => cancelScheduled(row)}>Cancel</button>
                )}
              </div>
              <div className="fta-player-stats">
                {row.body}
              </div>
              <div className="fta-player-stats">
                {row.sent_at
                  ? `went ${ago(row.sent_at)}`
                  : `due ${new Date(row.send_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`}
                {' '}· {row.player_ids ? 'chosen players' : 'everyone'}
              </div>
            </div>
          ))}
        </div>
      )}

      {!profileId && tab === 'players' && (
        <div className="fta-list">
          {players.length === 0 && !loading && !error && (
            <p className="fta-note">
              No players yet. Somebody appears here once they take a name in the
              game's multiplayer.
            </p>
          )}
          {players.map(person => (
            <button
              key={person.id}
              className={person.banned_at ? 'fta-player fta-player--banned' : 'fta-player'}
              onClick={() => openProfile(person)}
            >
              <div className="fta-player-top">
                <div>
                  <strong>{person.username}</strong>
                  <span className="fta-platform">{person.platform}</span>
                  {person.banned_at && <span className="fta-banned-tag">Banned</span>}
                  {looksStale(person) && <span className="fta-stale-tag">Inactive</span>}
                </div>
                <span className="fta-chevron"><Icon name="chevron-right" size={18} /></span>
              </div>
              <div className="fta-player-stats">
                Tank {person.best_container} · {person.best_score.toLocaleString()} pts
                {' '}· last played {ago(person.seen_at)}
                {person.unclaimed ? ` · ${person.unclaimed} waiting` : ''}
              </div>
            </button>
          ))}
        </div>
      )}

      {!profileId && tab === 'overview' && view === 'history' && (
        <div className="fta-list">
          <button className="fta-profile-back" onClick={() => setView(null)}>
            <Icon name="chevron-left" size={18} /> Overview
          </button>
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

      {!profileId && tab === 'message' && (
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

          <label className="fta-check">
            <input
              type="checkbox"
              checked={sendLater}
              onChange={e => setSendLater(e.target.checked)}
            />
            Send later
          </label>
          {sendLater && (
            <input
              className="fta-field"
              type="datetime-local"
              value={sendAt}
              onChange={e => setSendAt(e.target.value)}
            />
          )}

          <button
            className="fta-primary"
            onClick={announce}
            disabled={busy || (!title.trim() && !message.trim()) || (sendLater && !sendAt)}
          >
            {busy ? 'Sending…' : sendLater ? 'Schedule it' : 'Send'}
          </button>
        </MobileCard>
      )}

      {banning && (
        <>
          <div className="fta-scrim" onClick={() => !busy && setBanning(null)} />
          <div className="fta-sheet">
            <h2>Ban {banning.username}?</h2>

            <p className="fta-note">
              They will be signed out, removed from the leaderboards, and told
              why. Their name stays taken so nobody else can claim it. Any
              unclaimed grants are withdrawn.
            </p>

            <div className="fta-kinds">
              {[[3, '3 days'], [7, '7 days'], [0, 'Forever']].map(([days, label]) => (
                <button
                  key={days}
                  className={banDays === days ? 'on' : ''}
                  onClick={() => setBanDays(days)}
                >{label}</button>
              ))}
            </div>
            <p className="fta-note">
              {banDays > 0
                ? `Lifts itself after ${banDays} days — the next time their game talks to the server.`
                : 'Stays until you unban them.'}
            </p>

            <label className="fta-label" htmlFor="fta-ban-reason">
              Reason — they will be shown this
            </label>
            <textarea
              id="fta-ban-reason"
              className="fta-field"
              rows={3}
              maxLength={300}
              placeholder="Offensive username."
              value={banReason}
              onChange={event => setBanReason(event.target.value)}
            />

            <label className="fta-check">
              <input
                type="checkbox"
                checked={notifyOnBan}
                onChange={event => setNotifyOnBan(event.target.checked)}
              />
              Send a notification to their phone
            </label>

            <div className="fta-sheet-actions">
              <button
                className="fta-cancel"
                disabled={busy}
                onClick={() => setBanning(null)}
              >
                Cancel
              </button>
              <button
                className="fta-confirm-ban"
                disabled={busy}
                onClick={banPlayer}
              >
                {busy ? 'Banning…' : 'Ban'}
              </button>
            </div>
          </div>
        </>
      )}

      {givingAll && (
        <>
          <div className="fta-scrim" onClick={() => !busy && setGivingAll(false)} />
          <div className="fta-sheet">
            <h2>Give coins to everyone</h2>
            <p className="fta-note">
              Every player who isn't banned gets the same grant, claimed next
              time they open the game. Good for apologies and celebrations.
            </p>
            <input
              className="fta-field"
              type="number"
              inputMode="numeric"
              value={giveAllForm.amount}
              onChange={e => setGiveAllForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="Coins each"
            />
            <input
              className="fta-field"
              value={giveAllForm.pushBody}
              onChange={e => setGiveAllForm(f => ({ ...f, pushBody: e.target.value }))}
              placeholder="Tell everyone on their phones (optional)"
              maxLength={140}
            />
            <input
              className="fta-field"
              value={giveAllForm.note}
              onChange={e => setGiveAllForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Note (for your records)"
            />
            <button className="fta-primary" disabled={busy} onClick={giveToEveryone}>
              {busy ? 'Sending…' : 'Give it to everyone'}
            </button>
            <button className="fta-secondary" onClick={() => setGivingAll(false)}>Cancel</button>
          </div>
        </>
      )}

      {renaming && (
        <>
          <div className="fta-scrim" onClick={() => !busy && setRenaming(null)} />
          <div className="fta-sheet">
            <h2>Rename {renaming.username}</h2>
            <p className="fta-note">
              For names that are wrong but not ban-worthy. They keep their
              account, scores and friends; they're told the new name on their
              phone.
            </p>
            <input
              className="fta-field"
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              placeholder="New name"
              maxLength={16}
              autoCapitalize="none"
            />
            <button
              className="fta-primary"
              disabled={busy || !renameDraft.trim()}
              onClick={renamePlayer}
            >{busy ? 'Renaming…' : 'Rename'}</button>
            <button className="fta-secondary" onClick={() => setRenaming(null)}>Cancel</button>
          </div>
        </>
      )}

      {removing && (
        <>
          <div className="fta-scrim" onClick={() => !busy && setRemoving(null)} />
          <div className="fta-sheet">
            <h2>Remove {removing.username}?</h2>
            <p className="fta-note">
              This deletes the account outright — their name becomes free to
              claim, their grants, scores and friendships go with it, and it
              cannot be undone. Use ban for people who broke the rules; use
              this for duplicates and abandoned sign-ups.
            </p>
            <div className="fta-sheet-actions">
              <button
                className="fta-cancel"
                disabled={busy}
                onClick={() => setRemoving(null)}
              >Keep it</button>
              <button
                className="fta-confirm-ban"
                disabled={busy}
                onClick={removePlayer}
              >{busy ? 'Removing…' : 'Remove forever'}</button>
            </div>
          </div>
        </>
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

        .fta-player-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        /* Destructive, so it does not look like the button beside it. Outlined
           rather than filled: a solid red block next to "Give" is the kind of
           thing that gets pressed by accident on a phone. */
        .fta-ban {
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid var(--mobile-danger, #c0392b);
          background: transparent;
          color: var(--mobile-danger, #c0392b);
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
        }

        .fta-unban {
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid var(--mobile-border);
          background: transparent;
          color: var(--mobile-text, #111);
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
        }

        /* A banned row stays visible and readable — greying it into
           illegibility would hide the very thing an operator came to check. */
        .fta-player--banned {
          border-left: 3px solid var(--mobile-danger, #c0392b);
          opacity: 0.82;
        }

        .fta-banned-tag {
          margin-left: 8px;
          padding: 2px 8px;
          border-radius: 999px;
          background: var(--mobile-danger, #c0392b);
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .fta-ban-note {
          margin-top: 6px;
          font-size: 12.5px;
          font-style: italic;
          color: var(--mobile-muted, #666);
        }

        .fta-label {
          display: block;
          margin-top: 14px;
          font-size: 12.5px;
          font-weight: 700;
          color: var(--mobile-muted, #666);
        }

        .fta-check {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          font-size: 14px;
        }

        .fta-sheet-actions {
          display: flex;
          gap: 10px;
          margin-top: 18px;
        }

        .fta-sheet-actions button {
          flex: 1;
          padding: 14px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
        }

        .fta-cancel {
          border: 1px solid var(--mobile-border);
          background: transparent;
          color: var(--mobile-text, #111);
        }

        .fta-confirm-ban {
          border: none;
          background: var(--mobile-danger, #c0392b);
          color: #fff;
        }

        .fta-sheet-actions button:disabled { opacity: 0.5; cursor: default; }

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

        .fta-chevron { color: var(--mobile-text-secondary); display: grid; place-items: center; }

        /* The row is a button now; keep it looking like the card it was. */
        .fta-player {
          border: none;
          width: 100%;
          text-align: left;
          font: inherit;
          cursor: pointer;
        }

        .fta-stale-tag {
          margin-left: 8px;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(150, 110, 20, 0.14);
          color: #8a6d1a;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .fta-profile-back {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          border: none;
          background: none;
          padding: 4px 0 10px;
          color: var(--mobile-accent);
          font-size: 14.5px;
          font-weight: 600;
          cursor: pointer;
        }

        .fta-profile-head h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          color: var(--mobile-text);
        }

        .fta-profile-chips { margin-top: 4px; }
        .fta-profile-chips .fta-platform { margin-left: 0; }

        .fta-stale-note {
          margin: 10px 2px 0;
          font-size: 13px;
          line-height: 1.45;
          color: #8a6d1a;
        }

        .fta-kv {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
          padding: 7px 0;
          font-size: 14px;
        }

        .fta-kv span { color: var(--mobile-text-secondary); }
        .fta-kv strong { color: var(--mobile-text); font-weight: 600; text-align: right; }

        .fta-sibling {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 0;
          border: none;
          border-top: 1px solid var(--mobile-border);
          background: none;
          font: inherit;
          font-size: 14px;
          color: var(--mobile-text);
          cursor: pointer;
          text-align: left;
        }

        .fta-sibling-when { color: var(--mobile-text-secondary); font-size: 12.5px; flex: none; }

        .fta-crash {
          display: block;
          width: 100%;
          padding: 10px 0;
          border: none;
          border-top: 1px solid var(--mobile-border);
          background: none;
          font: inherit;
          text-align: left;
          cursor: pointer;
        }

        .fta-crash-top {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--mobile-text-secondary);
        }

        .fta-crash-message {
          margin-top: 4px;
          font-size: 13.5px;
          font-weight: 600;
          color: #c0392b;
          word-break: break-word;
        }

        .fta-crash-stack {
          margin: 8px 0 0;
          padding: 10px;
          border-radius: 8px;
          background: var(--mobile-bg);
          font-size: 11px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-all;
          color: var(--mobile-text-secondary);
          max-height: 240px;
          overflow-y: auto;
        }

        .fta-profile-actions { margin-top: 16px; }

        .fta-wide {
          width: 100%;
          margin-top: 8px;
          padding: 14px;
          border-radius: 12px;
          font-size: 15px;
        }

        .fta-remove {
          width: 100%;
          margin-top: 18px;
          padding: 12px;
          border: none;
          background: none;
          color: #c0392b;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
        }

        .fta-stat-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .fta-stat {
          background: var(--mobile-card);
          border-radius: 12px;
          padding: 12px 8px;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
        }

        .fta-stat strong {
          display: block;
          font-size: 22px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          color: var(--mobile-text);
        }

        .fta-stat span {
          display: block;
          margin-top: 2px;
          font-size: 11.5px;
          color: var(--mobile-text-secondary);
        }

        .fta-tool {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          width: 100%;
          padding: 12px 0;
          border: none;
          border-top: 1px solid var(--mobile-border);
          background: none;
          font: inherit;
          text-align: left;
          color: var(--mobile-text);
          cursor: pointer;
        }

        .fta-tool strong { display: block; font-size: 15px; }
        .fta-tool em {
          display: block;
          margin-top: 1px;
          font-size: 12.5px;
          font-style: normal;
          color: var(--mobile-text-secondary);
        }

        /* Closing the whole game is the most consequential button on the
           screen, and it looks like it. */
        .fta-maintenance-close {
          width: 100%;
          margin-top: 12px;
          padding: 14px;
          border: none;
          border-radius: 12px;
          background: var(--mobile-danger, #c0392b);
          color: #fff;
          font-size: 15.5px;
          font-weight: 700;
          cursor: pointer;
        }

        .fta-crash--card {
          background: var(--mobile-card);
          border-radius: 14px;
          border-top: none;
          padding: 12px 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
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
