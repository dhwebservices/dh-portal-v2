import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { getPortalIdToken } from '../../utils/portalApi'
import { apiUrl } from '../../utils/apiBase'
import Icon from '../components/Icon'
import { Chip } from '../components/DH'
import { Screen, HeaderButton, Card, Sec, KV, Field, ToggleRow, Seg, Pills, Pill, Btn, Btns, Hero, Note, Empty, Sheet, Loading } from '../components/UI'

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

export default function MobileFishTankAdmin({ goBack, user, isAdmin: isAdminProp, can }) {
  // Admins, or staff given the "app_fishtank" permission.
  const isAdmin = isAdminProp || !!can?.('app_fishtank')
  const { instance, accounts } = useMsal()
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
  const [minVersion, setMinVersion] = useState({ ios: '', android: '' })
  const [versions, setVersions] = useState([])
  const [active, setActive] = useState(null)
  const [flags, setFlags] = useState({ multiplayer: true, daily: true, leaderboard: true })
  const [opLog, setOpLog] = useState([])
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
  const [playerSearch, setPlayerSearch] = useState('')
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

  /**
   * Prefers the portal's own proxy, which authenticates the signed-in staff
   * member with Entra, keeps the operator key server-side, and passes the
   * verified email on so the game's operator log can say who did what.
   *
   * Falls back to calling the Worker directly with the stored key, because the
   * proxy only works once FISHTANK_OPERATOR_KEY is set as a Pages secret — and
   * losing the admin screen in the meantime would be worse than the key
   * lingering in this device's storage a little longer.
   */
  const callViaProxy = async (path, options) => {
    const account = accounts?.[0]
    if (!account) throw Object.assign(new Error('proxy-unavailable'), { fallback: true })
    let token
    try {
      token = await getPortalIdToken(instance, account)
    } catch {
      throw Object.assign(new Error('proxy-unavailable'), { fallback: true })
    }
    const response = await fetch(apiUrl(`/api/fishtank${path}`), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    })
    // A misconfigured proxy must not look like a refusal from the game.
    if (response.status === 404 || response.status === 500) {
      throw Object.assign(new Error('proxy-unavailable'), { fallback: true })
    }
    return response
  }

  const call = async (path, options = {}) => {
    let response
    try {
      try {
        response = await callViaProxy(path, options)
      } catch (proxyError) {
        if (!proxyError?.fallback) throw proxyError
        response = await fetch(`${API}${path}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
            ...(options.headers || {}),
          },
        })
      }
    } catch (err) {
      if (err?.fallback === undefined && err instanceof Error && !/Load failed|NetworkError|Failed to fetch/i.test(err.message)) {
        throw err
      }
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
      const [people, history, shop, stats, maint, minimums, vers, act, flg, log] = await Promise.all([
        call('/operator/players'),
        call('/operator/grants'),
        call('/operator/catalogue'),
        call('/operator/overview').catch(() => null),
        call('/operator/maintenance').catch(() => null),
        call('/operator/min-version').catch(() => null),
        call('/operator/versions').catch(() => null),
        call('/operator/active').catch(() => null),
        call('/operator/flags').catch(() => null),
        call('/operator/log').catch(() => null),
      ])
      setPlayers(Array.isArray(people) ? people : [])
      setGrants(Array.isArray(history) ? history : [])
      if (shop?.fish) setCatalogue(shop)
      if (stats) setOverview(stats)
      if (maint) { setMaintenance(maint); setMaintenanceDraft(maint.message || '') }
      if (minimums) setMinVersion({ ios: minimums.ios || '', android: minimums.android || '' })
      if (Array.isArray(vers)) setVersions(vers)
      if (act) setActive(act)
      if (flg) setFlags(flg)
      if (Array.isArray(log)) setOpLog(log)
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

  const toggleFlag = async (name) => {
    const next = { ...flags, [name]: !flags[name] }
    setBusy(true)
    setOutcome(null)
    try {
      const result = await call('/operator/flags', { method: 'PUT', body: JSON.stringify(next) })
      setFlags(result)
      setOutcome({
        ok: true,
        text: result[name] ? `${name} is back on.` : `${name} is off for every player.`,
      })
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const resetEverything = async (playerId, username) => {
    setBusy(true)
    setOutcome(null)
    try {
      await call('/operator/leaderboard', {
        method: 'DELETE',
        body: JSON.stringify({ board: 'all', player_id: playerId }),
      })
      setOutcome({ ok: true, text: `${username}'s scores, tank, wins and kills are back to nothing.` })
      await load()
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const saveMinVersion = async () => {
    setBusy(true)
    setOutcome(null)
    try {
      const result = await call('/operator/min-version', {
        method: 'PUT',
        body: JSON.stringify({ ios: minVersion.ios.trim(), android: minVersion.android.trim() }),
      })
      setMinVersion({ ios: result.ios || '', android: result.android || '' })
      const none = !result.ios && !result.android
      setOutcome({
        ok: true,
        text: none
          ? 'Update gate lifted. Every build can play.'
          : `Anything below iOS ${result.ios || '—'} / Android ${result.android || '—'} must update before playing.`,
      })
    } catch (err) {
      setOutcome({ ok: false, text: err.message })
    } finally {
      setBusy(false)
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
      <Screen title="Fish Tank" onBack={goBack}>
        <Card pad>
          <span className="dh-t">Operator key</span>
          <span className="dh-sub">
            These controls can create currency, so they are behind a real
            secret rather than a code stored in the app. Paste the operator key
            once and this device remembers it.
          </span>
          <input
            className="dh-input"
            style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}
            type="text"
            value={keyDraft}
            onChange={e => { setKeyDraft(e.target.value); setKeyError('') }}
            placeholder="Operator key"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="dh-sub">{keyDraft.replace(/\s+/g, '').length} of 64 characters</span>
          <Note tone="error">{keyError}</Note>
          <Btn onPress={saveKey} disabled={!keyDraft.trim() || checkingKey}>
            {checkingKey ? 'Checking…' : 'Unlock'}
          </Btn>
        </Card>
      </Screen>
    )
  }

  // ------------------------------------------------------------------ panel

  const VIEW_TITLES = {
    housekeeping: 'Housekeeping',
    crashes: 'Crashes',
    leaderboard: 'Leaderboards',
    blocklist: 'Username blocklist',
    schedule: 'Scheduled messages',
    history: 'Grant history',
  }
  const inView = !profileId && tab === 'overview' && view !== null
  const screenTitle = profileId ? 'Player' : inView ? (VIEW_TITLES[view] || 'Fish Tank') : 'Fish Tank'
  const screenBack = profileId ? closeProfile : inView ? () => setView(null) : goBack
  const versionLine = (() => {
    const top = {}
    for (const v of versions) {
      if (!v.version || v.version === 'unknown') continue
      if (!top[v.platform] || v.players > top[v.platform].players) top[v.platform] = v
    }
    return Object.values(top).map(v => `${v.platform === 'ios' ? 'iOS' : v.platform === 'android' ? 'Android' : v.platform} ${v.version}`).join(' · ')
  })()
  const shownPlayers = playerSearch.trim()
    ? players.filter(p => (p.username || '').toLowerCase().includes(playerSearch.trim().toLowerCase()))
    : players
  const initials = (name) => (name || '?').slice(0, 2).toUpperCase()
  const chev = <span className="dh-chev"><Icon name="chevron-right" size={18} /></span>

  return (
    <Screen
      title={screenTitle}
      onBack={screenBack}
      action={<HeaderButton onPress={profileId ? refreshProfile : load} label="Refresh"><Icon name="refresh" size={18} /></HeaderButton>}
    >
      {!profileId && !inView && (
        <>
          <Hero className="ft-hero">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span className="dh-sub">{versionLine || 'iPhone and Android'}</span>
              <Chip tone={maintenance.on ? 'red' : 'green'}>{maintenance.on ? 'Closed' : 'Live'}</Chip>
            </div>
            <div className="ft-hero-nums">
              <div><span className="dh-num">{overview?.totals?.total ?? '–'}</span><span className="dh-sub">Players</span></div>
              <div><span className="dh-num">{active?.counts?.today ?? overview?.totals?.active_24h ?? '–'}</span><span className="dh-sub">Played today</span></div>
              <div><span className="dh-num">{active?.counts?.last_hour ?? '–'}</span><span className="dh-sub">Last hour</span></div>
            </div>
          </Hero>

          <Seg
            value={tab}
            onChange={(id) => { setTab(id); setView(null) }}
            options={[{ value: 'overview', label: 'Overview' }, { value: 'players', label: 'Players' }, { value: 'message', label: 'Message' }]}
          />
        </>
      )}

      {error && (
        <Card pad tone="danger">
          <Note tone="error">{error}</Note>
          {/* A rejected key cannot be retried into working, so offer the only
              thing that helps: entering a different one. Retrying is right for
              everything else. */}
          {isKeyRejected
            ? <Btn variant="outline" small onPress={forgetKey}>Re-enter key</Btn>
            : <Btn variant="outline" small onPress={load}>Try again</Btn>}
        </Card>
      )}
      {loading && <Loading />}

      {outcome && <Note tone={outcome.ok ? 'ok' : 'error'}>{outcome.text}</Note>}

      {profileId && profile && (() => {
        const person = profile.player
        const isStale = looksStale(person)
        return (
          <>
            <div className="dh-card">
              <div className="dh-row">
                <span className="dh-av round" style={{ width: 52, height: 52, borderRadius: 26, fontSize: 17 }}>{initials(person.username)}</span>
                <span className="dh-g">
                  <span className="dh-t" style={{ fontSize: 17 }}>{person.username}</span>
                  <span className="dh-sub">Joined {fullDate(person.created_at)} · last seen {ago(person.seen_at)}</span>
                  <span className="dh-sub">{person.platform === 'ios' ? 'iPhone' : person.platform === 'android' ? 'Android' : person.platform}</span>
                </span>
                {person.banned_at ? <Chip tone="red">Banned</Chip> : isStale ? <Chip>Inactive</Chip> : null}
              </div>
            </div>

            <Note tone="error">{profileError}</Note>

            {isStale && (
              <Note tone="warn">
                Signed up {ago(person.created_at)} and never played — likely an
                abandoned or duplicate registration. Removing it frees the name.
              </Note>
            )}

            {person.banned_at && (
              <Note tone="error">
                Banned {ago(person.banned_at)}{person.banned_by ? ` by ${person.banned_by}` : ''}.
                {person.ban_reason ? ` "${person.ban_reason}"` : ' No reason recorded.'}
              </Note>
            )}

            <div className="dh-tiles">
              <div className="dh-tile"><span className="dh-num sm">{(person.coins_granted ?? 0).toLocaleString()}</span><span className="dh-sub">Coins granted</span></div>
              <div className="dh-tile"><span className="dh-num sm">{(person.best_score ?? 0).toLocaleString()}</span><span className="dh-sub">Best score</span></div>
              <div className="dh-tile"><span className="dh-num sm">{person.wins ?? 0}</span><span className="dh-sub">Matches won</span></div>
              <div className="dh-tile"><span className="dh-num sm">{person.kills ?? 0}</span><span className="dh-sub">Fish eaten (versus)</span></div>
            </div>

            <Sec>Their game</Sec>
            <div className="dh-card">
              <KV k="Tank reached" v={person.best_container} />
              <KV k="Friends" v={profile.friends} />
              {/* Not "older app": the device is written at signup, so an
                  account made before device binding shipped stays without
                  one however new the player's app is. It is adopted the
                  next time that build registers for push. */}
              <KV k="Device" v={person.device_id ? `…${person.device_id.slice(-8)}` : 'not recorded (account predates binding)'} />
              <KV k="Notifications" v={profile.devices.length ? `${profile.devices.length} device${profile.devices.length === 1 ? '' : 's'}` : 'none registered'} />
            </div>

            {profile.daily.length > 0 && (
              <>
                <Sec>Recent daily runs</Sec>
                <div className="dh-card">
                  {profile.daily.map(day => (
                    <KV key={day.day} k={day.day} v={`${day.score.toLocaleString()} pts · ${day.tide} tide`} />
                  ))}
                </div>
              </>
            )}

            <Sec>Actions</Sec>
            <Pills>
              {!person.banned_at && <Pill onPress={() => { setGranting(person); setOutcome(null) }}>Give or take</Pill>}
              <Pill disabled={busy} onPress={() => { setRenaming(person); setRenameDraft(person.username) }}>Rename</Pill>
              {/* Offered for a banned player too: a ban stops them playing, it
                  does not take an inflated score off the board. */}
              <Pill disabled={busy} onPress={() => resetEverything(person.id, person.username)}>Reset their scores</Pill>
              {person.banned_at && <Pill disabled={busy} onPress={async () => { await unbanPlayer(person); await refreshProfile() }}>Unban</Pill>}
              <Pill tone="danger" disabled={busy} onPress={() => setRemoving(person)}>Remove account</Pill>
            </Pills>
            <span className="dh-sub">
              Reset clears the score, tank, wins, kills and coin record — everything the boards
              read. Their account, coins and fish are untouched.
            </span>

            {profile.siblings?.length > 0 && (
              <>
                <Sec>Same device</Sec>
                <span className="dh-sub">
                  These accounts were created on the same physical device.
                  Duplicates from before one-account-per-device are usually
                  safe to remove.
                </span>
                <div className="dh-card">
                  {profile.siblings.map(sib => (
                    <button key={sib.id} type="button" className="dh-row" onClick={() => openProfile(sib)}>
                      <span className="dh-av round">{initials(sib.username)}</span>
                      <span className="dh-g">
                        <span className="dh-t">{sib.username}</span>
                        <span className="dh-sub">Joined {ago(sib.created_at)}</span>
                      </span>
                      {sib.banned_at ? <Chip tone="red">Banned</Chip> : looksStale(sib) ? <Chip>Inactive</Chip> : null}
                      {chev}
                    </button>
                  ))}
                </div>
              </>
            )}

            <Sec>Crashes</Sec>
            {profile.partial ? <Loading /> : profile.crashes.length === 0 ? (
              <div className="dh-card"><div className="dh-row"><span className="dh-g"><span className="dh-sub">No crashes reported from their game.</span></span></div></div>
            ) : (
              <div className="dh-card">
                {profile.crashes.map((crash, index) => (
                  <CrashRow key={index} crash={crash} open={expandedCrash === index} onToggle={() => setExpandedCrash(expandedCrash === index ? null : index)} ago={ago} />
                ))}
              </div>
            )}

            {profile.grants.length > 0 && (
              <>
                <Sec>Grant history</Sec>
                <div className="dh-card">
                  {profile.grants.map(grant => (
                    <div className="dh-row" key={grant.id}>
                      <span className="dh-g">
                        <span className="dh-t">
                          {grant.kind === 'coins'
                            ? `${grant.amount > 0 ? '+' : ''}${grant.amount.toLocaleString()} coins`
                            : grant.item_id || grant.kind}
                        </span>
                        <span className="dh-sub">{ago(grant.created_at)}</span>
                      </span>
                      <Chip tone={grant.claimed_at ? 'green' : 'amber'}>{grant.claimed_at ? 'Claimed' : 'Waiting'}</Chip>
                    </div>
                  ))}
                </div>
              </>
            )}

            {!person.banned_at && (
              <Btn
                variant="danger"
                disabled={busy}
                onPress={() => {
                  setBanning(person)
                  setBanReason('')
                  setBanDays(0)
                  setNotifyOnBan(true)
                  setOutcome(null)
                }}
              >Ban this player</Btn>
            )}
          </>
        )
      })()}

      {!profileId && tab === 'overview' && view === null && (
        <>
          <Sec>Maintenance</Sec>
          <div className="dh-card">
            <div className="dh-row">
              <span className="dh-g">
                <span className="dh-t">{maintenance.on ? 'The game is closed' : 'The game is open'}</span>
                <span className="dh-sub">
                  {maintenance.on
                    ? 'Every player sees the wall until you lift it.'
                    : 'Closing it walls every player on the next launch or resume.'}
                </span>
              </span>
              <Chip tone={maintenance.on ? 'red' : 'green'}>{maintenance.on ? 'Closed' : 'Open'}</Chip>
            </div>
            <Field label="What the wall says (optional)" htmlFor="ft-wall" hint={`${maintenanceDraft.length} of 200`}>
              <textarea
                id="ft-wall"
                rows={3}
                value={maintenanceDraft}
                onChange={e => setMaintenanceDraft(e.target.value)}
                placeholder="e.g. We're updating the game. Back in about an hour."
                maxLength={200}
              />
            </Field>
            <div style={{ padding: '4px 16px 16px' }}>
              <Btn
                variant={maintenance.on ? 'primary' : 'danger'}
                className={maintenance.on ? '' : 'solid'}
                disabled={busy}
                onPress={() => setMaintenanceMode(!maintenance.on)}
              >
                {maintenance.on ? 'Lift maintenance — open the game' : 'Close the game for maintenance'}
              </Btn>
            </div>
          </div>

          {(overview || active) && (
            <>
              <Sec>Players</Sec>
              <div className="dh-tiles t3">
                <div className="dh-tile"><span className="dh-num">{overview?.totals?.new_24h ?? 0}</span><span className="dh-sub">New today</span></div>
                <div className="dh-tile"><span className="dh-num">{overview?.totals?.new_7d ?? 0}</span><span className="dh-sub">New this week</span></div>
                <div className="dh-tile"><span className="dh-num">{active?.counts?.this_week ?? overview?.totals?.active_7d ?? 0}</span><span className="dh-sub">Played this week</span></div>
              </div>
              <span className="dh-sub">Played counts come from the last time each app checked in — opened the game, not mid-run.</span>
            </>
          )}

          <Sec>Tools</Sec>
          <div className="dh-card">
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
              <button key={id} type="button" className="dh-row" onClick={() => openView(id)}>
                <span className="dh-g"><span className="dh-t">{label}</span><span className="dh-sub">{hint}</span></span>
                {id === 'crashes' && overview?.crashes_7d ? <Chip tone="amber">{overview.crashes_7d}</Chip> : null}
                {chev}
              </button>
            ))}
          </div>

          <Btn onPress={() => { setGivingAll(true); setOutcome(null) }}>Give coins to everyone</Btn>

          <Sec>Switches</Sec>
          <span className="dh-sub">
            Turn a part of the game off for everyone without shipping a release. Takes effect
            on each player's next launch or resume.
          </span>
          <div className="dh-card">
            {['multiplayer', 'daily', 'leaderboard'].map(name => (
              <ToggleRow
                key={name}
                title={name === 'daily' ? "Today's Tank" : name === 'multiplayer' ? 'Multiplayer' : 'Leaderboard'}
                on={!!flags[name]}
                disabled={busy}
                onChange={() => toggleFlag(name)}
              />
            ))}
          </div>

          <Sec>Required version</Sec>
          <div className="dh-card">
            <div className="dh-row">
              <span className="dh-g">
                <span className="dh-sub">
                  {minVersion.ios || minVersion.android
                    ? 'Anything older is walled and sent to the store. Blank a field to lift it for that platform.'
                    : 'No gate. Every build can play. Set a version to force older ones to update first.'}
                </span>
              </span>
              <Chip tone={minVersion.ios || minVersion.android ? 'amber' : 'green'}>{minVersion.ios || minVersion.android ? 'Gate on' : 'Gate lifted'}</Chip>
            </div>
            <Field label="iPhone required version" htmlFor="ft-ios">
              <input id="ft-ios" value={minVersion.ios} onChange={e => setMinVersion(v => ({ ...v, ios: e.target.value }))} placeholder="Any (e.g. 1.5)" inputMode="decimal" maxLength={20} />
            </Field>
            <Field label="Android required version" htmlFor="ft-android">
              <input id="ft-android" value={minVersion.android} onChange={e => setMinVersion(v => ({ ...v, android: e.target.value }))} placeholder="Any (e.g. 1.2.1)" inputMode="decimal" maxLength={20} />
            </Field>
            <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className="dh-sub">
                Set each one only to a version that is actually live on that store — a build
                nobody can download is a wall with no door.
              </span>
              <Btn variant="outline" disabled={busy} onPress={saveMinVersion}>Save required version</Btn>
            </div>
          </div>

          {versions.length > 0 && (
            <>
              <Sec>App versions</Sec>
              <span className="dh-sub">
                What people are actually running. Set the required version to something
                most of them already have, or you are walling the difference.
              </span>
              <div className="dh-card">
                {versions.map(v => (
                  <KV key={`${v.platform}-${v.version}`} k={`${v.platform} ${v.version}`} v={v.players} />
                ))}
              </div>
              <span className="dh-sub">
                "unknown" is an account that has not opened the game since version reporting
                shipped — an older build, not a missing player.
              </span>
            </>
          )}

          {overview && (
            <>
              <Sec>Platforms</Sec>
              <div className="dh-card">
                {(overview.platforms || []).map(row => <KV key={row.platform} k={row.platform} v={row.n} />)}
                {(overview.totals?.banned ?? 0) > 0 && <KV k="banned" v={overview.totals.banned} />}
                <KV k="Push devices" v={overview.push_devices ?? 0} />
              </div>

              {(overview.top || []).length > 0 && (
                <>
                  <Sec>Top scores</Sec>
                  <div className="dh-card">
                    {overview.top.map((row, i) => (
                      <div className="dh-row" key={row.username}>
                        <span className="dh-num" style={{ fontSize: 18, width: 28 }}>{i + 1}</span>
                        <span className="dh-g"><span className="dh-t">{row.username}</span></span>
                        <span className="dh-val">{row.best_score.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {opLog.length > 0 && (
            <>
              <Sec>Recent admin actions</Sec>
              <div className="dh-card">
                {opLog.slice(0, 12).map(entry => (
                  <div className="dh-row" key={entry.id}>
                    <span className="dh-g"><span className="dh-t">{entry.action}</span><span className="dh-sub">{entry.operator}</span></span>
                    <span className="dh-sub">{ago(entry.created_at)}</span>
                  </div>
                ))}
              </div>
              <span className="dh-sub">
                "unknown" means the game's operator key was used directly rather than through
                a signed-in portal session.
              </span>
            </>
          )}

          <div className="dh-card">
            <div className="dh-row">
              <span className="dh-g"><span className="dh-t">Operator key</span><span className="dh-sub">Saved on this device</span></span>
              <button type="button" className="dh-sec-act" style={{ color: '#B42318' }} onClick={forgetKey}>Forget</button>
            </div>
          </div>
        </>
      )}

      {!profileId && tab === 'overview' && view === 'housekeeping' && (
        <>
          <span className="dh-sub">
            Signed up, never played, older than a day. Removing frees their
            names; nothing else is lost because nothing was ever played.
          </span>
          {stale.length === 0 && <Empty icon="checkCircle" title="No ghosts" sub="Clean tank." />}
          {stale.length > 0 && (
            <div className="dh-card">
              {stale.map(person => (
                <button key={person.id} type="button" className="dh-row" onClick={() => toggleStale(person.id)}>
                  <span className="dh-g">
                    <span className="dh-t">{person.username}</span>
                    <span className="dh-sub">{person.platform} · joined {ago(person.created_at)}</span>
                  </span>
                  <span className={`ft-check${staleChosen.has(person.id) ? ' on' : ''}`}>{staleChosen.has(person.id) && <Icon name="check" size={14} />}</span>
                </button>
              ))}
            </div>
          )}
          {stale.length > 0 && (
            <>
              <Btn variant="outline" onPress={() => setStaleChosen(new Set(stale.map(p => p.id)))}>Select all {stale.length}</Btn>
              <Btn variant="danger" className="solid" disabled={busy || staleChosen.size === 0} onPress={removeStale}>
                {busy ? 'Removing…' : `Remove ${staleChosen.size || ''} selected`}
              </Btn>
            </>
          )}
        </>
      )}

      {!profileId && tab === 'overview' && view === 'crashes' && (
        crashes.length === 0
          ? <Empty icon="checkCircle" title="No crashes reported" sub="Long may it last." />
          : (
            <div className="dh-card">
              {crashes.map((crash, index) => (
                <CrashRow key={crash.id} crash={crash} who={crash.username || 'before sign-in'} open={expandedCrash === index} onToggle={() => setExpandedCrash(expandedCrash === index ? null : index)} ago={ago} />
              ))}
            </div>
          )
      )}

      {!profileId && tab === 'overview' && view === 'leaderboard' && (
        <>
          <Pills>
            <Pill on={board.board === 'alltime'} onPress={async () => setBoard(await call('/operator/leaderboard?board=alltime'))}>All time</Pill>
            <Pill on={board.board === 'daily'} onPress={async () => setBoard(await call('/operator/leaderboard?board=daily'))}>Today's daily</Pill>
          </Pills>
          <span className="dh-sub">Tap a row to remove that score from the board.</span>
          {board.rows.length === 0 ? <Empty title="Empty board" /> : (
            <div className="dh-card">
              {board.rows.map((row, i) => (
                <button key={`${row.id}-${i}`} type="button" className="dh-row" onClick={() => removeScore(row)}>
                  <span className="dh-num" style={{ fontSize: 18, width: 28 }}>{i + 1}</span>
                  <span className="dh-g">
                    <span className="dh-t">{row.username || 'deleted player'}</span>
                    {row.banned_at && <span className="dh-sub">banned</span>}
                  </span>
                  <span className="dh-val">{(row.best_score ?? row.score ?? 0).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {!profileId && tab === 'overview' && view === 'blocklist' && (
        <>
          <span className="dh-sub">
            One word per line. A new name containing any of them is refused at
            signup — the player just sees "that name isn't available". Existing
            names are untouched; rename or ban those from their profile.
          </span>
          <div className="dh-card">
            <Field label="Blocked words" htmlFor="ft-block">
              <textarea
                id="ft-block"
                rows={8}
                value={blockWords}
                onChange={e => setBlockWords(e.target.value)}
                placeholder={'one\nword\nper\nline'}
                autoCapitalize="none"
              />
            </Field>
          </div>
          <Btn disabled={busy} onPress={saveBlocklist}>{busy ? 'Saving…' : 'Save blocklist'}</Btn>
        </>
      )}

      {!profileId && tab === 'overview' && view === 'schedule' && (
        <>
          <span className="dh-sub">
            Written in the Message tab with "send later". Delivery is checked
            about once a minute.
          </span>
          {schedule.length === 0 ? <Empty icon="bell" title="Nothing scheduled" sub="Scheduled messages show here. Tap Cancel to stop one." /> : (
            <div className="dh-card">
              {schedule.map(row => (
                <div className="dh-row top" key={row.id}>
                  <span className="dh-g">
                    <span className="dh-t">{row.title || '(no title)'}</span>
                    {row.body && <span className="dh-sub">{row.body}</span>}
                    <span className="dh-sub">
                      {row.sent_at
                        ? `went ${ago(row.sent_at)}`
                        : `due ${new Date(row.send_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`}
                      {' '}· {row.player_ids ? 'chosen players' : 'everyone'}
                    </span>
                  </span>
                  {row.sent_at
                    ? <Chip>Sent</Chip>
                    : <button type="button" className="dh-sec-act" style={{ color: '#B42318' }} onClick={() => cancelScheduled(row)}>Cancel</button>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!profileId && tab === 'players' && (
        <>
          <div className="dh-search">
            <Icon name="search" size={18} />
            <input value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} placeholder="Search players" autoCapitalize="none" autoCorrect="off" />
          </div>
          {players.length === 0 && !loading && !error && (
            <Empty icon="users" title="No players yet" sub="Somebody appears here once they take a name in the game's multiplayer." />
          )}
          {players.length > 0 && shownPlayers.length === 0 && <Note>Nobody matches "{playerSearch}".</Note>}
          {shownPlayers.length > 0 && (
            <div className="dh-card">
              {shownPlayers.map(person => (
                <button key={person.id} type="button" className="dh-row" onClick={() => openProfile(person)}>
                  <span className="dh-av round" style={person.platform === 'android' ? { background: '#FFE6CC', color: '#8A4A00' } : undefined}>{initials(person.username)}</span>
                  <span className="dh-g">
                    <span className="dh-t">{person.username}</span>
                    <span className="dh-sub">
                      Tank {person.best_container} · {(person.best_score ?? 0).toLocaleString()} pts · {person.platform === 'ios' ? 'iPhone' : person.platform === 'android' ? 'Android' : person.platform}
                    </span>
                    <span className="dh-sub">Last played {ago(person.seen_at)}{person.unclaimed ? ` · ${person.unclaimed} waiting` : ''}</span>
                  </span>
                  {person.banned_at ? <Chip tone="red">Banned</Chip> : looksStale(person) ? <Chip>Inactive</Chip> : null}
                  {chev}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {!profileId && tab === 'overview' && view === 'history' && (
        <>
          {grants.length === 0 && !loading && !error && <Empty icon="gift" title="Nothing given yet" />}
          {grants.length > 0 && (
            <>
              <span className="dh-sub">Tap something still waiting to take it back.</span>
              <div className="dh-card">
                {grants.map(grant => {
                  const Tag = grant.claimed_at ? 'div' : 'button'
                  return (
                    <Tag key={grant.id} type={grant.claimed_at ? undefined : 'button'} className="dh-row" onClick={grant.claimed_at ? undefined : () => revoke(grant)}>
                      <span className={`dh-ic${grant.claimed_at ? ' muted' : ''}`}><Icon name={grant.kind === 'coins' ? 'pound' : grant.kind === 'message' ? 'bell' : 'gift'} size={18} /></span>
                      <span className="dh-g">
                        <span className="dh-t">
                          {grant.kind === 'coins'
                            ? `${grant.amount > 0 ? '+' : ''}${grant.amount.toLocaleString()} coins`
                            : grant.kind === 'message'
                              ? (grant.title || 'Message')
                              : `${grant.item_id}`}
                        </span>
                        <span className="dh-sub">{[grant.username || 'unknown', grant.note].filter(Boolean).join(' · ')}</span>
                      </span>
                      <Chip tone={grant.claimed_at ? 'green' : 'amber'}>{grant.claimed_at ? 'Claimed' : 'Waiting'}</Chip>
                    </Tag>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {!profileId && tab === 'message' && (
        <>
          <Sec>Who gets it</Sec>
          <Seg value={audience} onChange={setAudience} options={[{ value: 'everyone', label: 'Everyone' }, { value: 'some', label: 'Choose players' }]} />
          {audience === 'some' && (
            players.length === 0 ? <Note>No players yet.</Note> : (
              <div className="dh-card ft-pick">
                {players.map(person => (
                  <button key={person.id} type="button" className="dh-row" onClick={() => toggleRecipient(person.id)}>
                    <span className="dh-av round">{initials(person.username)}</span>
                    <span className="dh-g"><span className="dh-t">{person.username}</span></span>
                    <span className={`ft-check${chosen.has(person.id) ? ' on' : ''}`}>{chosen.has(person.id) && <Icon name="check" size={14} />}</span>
                  </button>
                ))}
              </div>
            )
          )}

          <Sec>How it reaches them</Sec>
          <div className="dh-card">
            <ToggleRow title="Phone notification" sub="Arrives now, for anyone who allowed them" on={channels.push} onChange={() => setChannels(c => ({ ...c, push: !c.push }))} />
            <ToggleRow title="In the game" sub="Waits until they next open Fish Tank" on={channels.inGame} onChange={() => setChannels(c => ({ ...c, inGame: !c.inGame }))} />
          </div>

          <Sec>Message</Sec>
          <div className="dh-card">
            <Field label="Title" htmlFor="ft-title">
              <input id="ft-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" maxLength={60} />
            </Field>
            <Field label="Message" htmlFor="ft-msg">
              <textarea id="ft-msg" value={message} onChange={e => setMessage(e.target.value)} placeholder="What do you want to tell them?" rows={4} maxLength={300} />
            </Field>
          </div>

          <div className="dh-card">
            <ToggleRow title="Schedule it" sub="Written now, sent later" on={sendLater} onChange={setSendLater} />
            {sendLater && (
              <Field label="Send at" htmlFor="ft-at">
                <input id="ft-at" type="datetime-local" value={sendAt} onChange={e => setSendAt(e.target.value)} />
              </Field>
            )}
          </div>

          <Btn onPress={announce} disabled={busy || (!title.trim() && !message.trim()) || (sendLater && !sendAt)}>
            {busy ? 'Sending…' : sendLater ? 'Schedule it' : 'Send'}
          </Btn>
        </>
      )}

      {banning && (
        <Sheet
          title={`Ban ${banning.username}?`}
          sub="They will be signed out, removed from the leaderboards, and told why. Their name stays taken so nobody else can claim it. Any unclaimed grants are withdrawn."
          onClose={() => !busy && setBanning(null)}
        >
          <Seg value={banDays} onChange={setBanDays} options={[{ value: 3, label: '3 days' }, { value: 7, label: '7 days' }, { value: 0, label: 'Forever' }]} />
          <span className="dh-sub">
            {banDays > 0
              ? `Lifts itself after ${banDays} days — the next time their game talks to the server.`
              : 'Stays until you unban them.'}
          </span>
          <div className="dh-card">
            <Field label="Reason — they will be shown this" htmlFor="fta-ban-reason">
              <textarea id="fta-ban-reason" rows={3} maxLength={300} placeholder="Offensive username." value={banReason} onChange={event => setBanReason(event.target.value)} />
            </Field>
            <ToggleRow title="Send a notification to their phone" on={notifyOnBan} onChange={setNotifyOnBan} />
          </div>
          <Btns>
            <Btn variant="outline" disabled={busy} onPress={() => setBanning(null)}>Cancel</Btn>
            <Btn variant="danger" className="solid" disabled={busy} onPress={banPlayer}>{busy ? 'Banning…' : 'Ban'}</Btn>
          </Btns>
        </Sheet>
      )}

      {givingAll && (
        <Sheet
          title="Give coins to everyone"
          sub="Every player who isn't banned gets the same grant, claimed next time they open the game. Good for apologies and celebrations."
          onClose={() => !busy && setGivingAll(false)}
        >
          <div className="dh-card">
            <Field label="Coins each" htmlFor="ft-all-amt">
              <input id="ft-all-amt" type="number" inputMode="numeric" value={giveAllForm.amount} onChange={e => setGiveAllForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 500" />
            </Field>
            <Field label="Tell everyone on their phones (optional)" htmlFor="ft-all-push">
              <input id="ft-all-push" value={giveAllForm.pushBody} onChange={e => setGiveAllForm(f => ({ ...f, pushBody: e.target.value }))} placeholder="Optional" maxLength={140} />
            </Field>
            <Field label="Note (for your records)" htmlFor="ft-all-note">
              <input id="ft-all-note" value={giveAllForm.note} onChange={e => setGiveAllForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional" />
            </Field>
          </div>
          <Btns>
            <Btn variant="outline" onPress={() => setGivingAll(false)}>Cancel</Btn>
            <Btn disabled={busy} onPress={giveToEveryone}>{busy ? 'Sending…' : 'Give it'}</Btn>
          </Btns>
        </Sheet>
      )}

      {renaming && (
        <Sheet
          title={`Rename ${renaming.username}`}
          sub="For names that are wrong but not ban-worthy. They keep their account, scores and friends; they're told the new name on their phone."
          onClose={() => !busy && setRenaming(null)}
        >
          <div className="dh-card">
            <Field label="New name" htmlFor="ft-rename">
              <input id="ft-rename" value={renameDraft} onChange={e => setRenameDraft(e.target.value)} placeholder="New name" maxLength={16} autoCapitalize="none" />
            </Field>
          </div>
          <Btns>
            <Btn variant="outline" onPress={() => setRenaming(null)}>Cancel</Btn>
            <Btn disabled={busy || !renameDraft.trim()} onPress={renamePlayer}>{busy ? 'Renaming…' : 'Rename'}</Btn>
          </Btns>
        </Sheet>
      )}

      {removing && (
        <Sheet
          title={`Remove ${removing.username}?`}
          sub="This deletes the account outright — their name becomes free to claim, their grants, scores and friendships go with it, and it cannot be undone. Use ban for people who broke the rules; use this for duplicates and abandoned sign-ups."
          onClose={() => !busy && setRemoving(null)}
        >
          <Btns>
            <Btn variant="outline" disabled={busy} onPress={() => setRemoving(null)}>Keep it</Btn>
            <Btn variant="danger" className="solid" disabled={busy} onPress={removePlayer}>{busy ? 'Removing…' : 'Remove forever'}</Btn>
          </Btns>
        </Sheet>
      )}

      {granting && (
        <Sheet title={`Give to ${granting.username}`} onClose={() => setGranting(null)}>
          <Sec>What</Sec>
          <Seg
            value={form.kind}
            onChange={(id) => { setForm(f => ({ ...f, kind: id, itemId: '' })); setItemSearch('') }}
            options={[{ value: 'coins', label: 'Coins' }, { value: 'item', label: 'Fish' }, { value: 'prize', label: 'Upgrade' }]}
          />

          {form.kind === 'coins' ? (
            <>
              {/* Give or take, chosen explicitly. Relying on somebody
                  typing a minus sign makes taking coins back a hidden
                  feature, and a mistyped sign the wrong way is a player
                  waking up richer than intended. */}
              <Seg value={form.direction} onChange={(d) => setForm(f => ({ ...f, direction: d }))} options={[{ value: 'give', label: 'Give' }, { value: 'take', label: 'Take away' }]} />
              <div className="dh-card">
                <Field
                  label="How many coins"
                  htmlFor="ft-amt"
                  hint={form.direction === 'take' ? 'Their balance floors at zero — nobody goes into debt.' : 'Up to 1,000,000 at a time.'}
                >
                  <input id="ft-amt" type="number" inputMode="numeric" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="How many coins" />
                </Field>
              </div>
            </>
          ) : (
            (() => {
              const list = form.kind === 'item' ? catalogue.fish : catalogue.upgrades
              const query = itemSearch.trim().toLowerCase()
              const shown = query
                ? list.filter(entry => entry.name.toLowerCase().includes(query))
                : list
              return (
                <>
                  {list.length > 8 && (
                    <input
                      className="dh-input"
                      value={itemSearch}
                      onChange={e => setItemSearch(e.target.value)}
                      placeholder={`Search ${list.length} ${form.kind === 'item' ? 'fish' : 'upgrades'}`}
                      autoCapitalize="none"
                    />
                  )}
                  <div className="dh-card ft-pick">
                    {shown.map(entry => (
                      <button key={entry.id} type="button" className="dh-row" onClick={() => setForm(f => ({ ...f, itemId: entry.id }))}>
                        <span className="dh-g"><span className="dh-t">{entry.name}</span></span>
                        {entry.price > 0 && <span className="dh-sub">{entry.price.toLocaleString()}</span>}
                        <span className={`ft-check${form.itemId === entry.id ? ' on' : ''}`}>{form.itemId === entry.id && <Icon name="check" size={14} />}</span>
                      </button>
                    ))}
                    {list.length > 0 && shown.length === 0 && (
                      <div className="dh-row"><span className="dh-sub">Nothing matches "{itemSearch}".</span></div>
                    )}
                    {list.length === 0 && (
                      <div className="dh-row"><span className="dh-sub">Couldn't load the catalogue. Go back and refresh.</span></div>
                    )}
                  </div>
                </>
              )
            })()
          )}

          <Sec>How it reaches them</Sec>
          <div className="dh-card">
            <Field label="Tell them on their phone (optional)" htmlFor="ft-push">
              <input id="ft-push" value={form.pushBody} onChange={e => setForm(f => ({ ...f, pushBody: e.target.value }))} placeholder="Optional" maxLength={140} />
            </Field>
            <Field label="Note (for your records)" htmlFor="ft-note">
              <input id="ft-note" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional" />
            </Field>
          </div>

          <Btns>
            <Btn variant="outline" onPress={() => setGranting(null)}>Cancel</Btn>
            <Btn onPress={submitGrant} disabled={busy}>{busy ? 'Sending…' : 'Give it'}</Btn>
          </Btns>
        </Sheet>
      )}

      <style>{`
        .ft-hero { background: #0e7490; }
        .ft-hero .dh-sub { color: #cff3fa; }
        .ft-hero-nums { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
        .ft-hero-nums > div { display: flex; flex-direction: column; }
        .ft-hero-nums .dh-num { color: #fff; font-size: 26px; }
        .ft-check { width: 24px; height: 24px; flex: none; border-radius: 12px; border: 1.5px solid var(--mobile-border); display: flex; align-items: center; justify-content: center; color: #fff; }
        .ft-check.on { background: var(--mobile-accent); border-color: var(--mobile-accent); }
        .ft-pick { max-height: 320px; overflow-y: auto; }
        .ft-crash-stack { margin: 6px 0 0; padding: 10px; border-radius: 10px; background: var(--mobile-bg); font-size: 11px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 260px; overflow-y: auto; }
      `}</style>
    </Screen>
  )
}

function CrashRow({ crash, who, open, onToggle, ago }) {
  return (
    <button type="button" className="dh-row top" onClick={onToggle}>
      <span className="dh-ic muted"><Icon name="alertTriangle" size={18} /></span>
      <span className="dh-g">
        <span className="dh-t" style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{crash.message}</span>
        <span className="dh-sub">
          {[who, ago(crash.created_at), crash.platform, crash.app_version ? `v${crash.app_version}` : null].filter(Boolean).join(' · ')}
        </span>
        {open && crash.stack && <pre className="ft-crash-stack">{crash.stack}</pre>}
      </span>
    </button>
  )
}
