import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { getPortalIdToken } from '../../utils/portalApi'
import { apiUrl } from '../../utils/apiBase'
import Icon from '../components/Icon'
import { FG_CSS } from './FindMyGangAdmin'

/**
 * Running Bill Pal from the staff portal. Same shape as Fam & a Half:
 * on the web, calls go through `/api/billpal/*`, which checks the Entra token
 * and adds the admin key (a Pages secret). The native app has no Entra token,
 * so the admin key is entered once and kept on this phone, and calls go
 * straight to billpal-api with the signed-in email as X-Operator, which
 * Bill Pal's admin_log records against every change.
 *
 * Removing a bill takes it off the feed and tells the person why. Suspending
 * someone signs them out, takes their open bill down and stops them signing
 * back in until it ends. Deleting an account removes their email and name.
 */

const DIRECT = 'https://billpal-api.aged-silence-66a7.workers.dev'
const KEY_STORAGE = 'billpal.adminKey'

const TABS = [
  ['overview', 'Overview'],
  ['bills', 'Bills'],
  ['support', 'Support'],
  ['people', 'People'],
  ['message', 'Message'],
  ['suppliers', 'Suppliers'],
  ['signups', 'Sign-ups'],
  ['reports', 'Reports'],
  ['log', 'Log'],
]

const gbp = p => `£${((p || 0) / 100).toFixed(2)}`
const when = t => (t ? new Date(t * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

export default function MobileBillPalAdmin({ goBack, isAdmin, user }) {
  const { instance, accounts } = useMsal()
  const viaPortal = !!accounts?.[0]
  const [key, setKey] = useState(() => localStorage.getItem(KEY_STORAGE) || '')
  const [keyDraft, setKeyDraft] = useState('')
  const [keyError, setKeyError] = useState('')
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [outcome, setOutcome] = useState(null)
  const [busy, setBusy] = useState(false)

  const [overview, setOverview] = useState(null)
  const [billStatus, setBillStatus] = useState('pending')
  const [bills, setBills] = useState([])
  const [photo, setPhoto] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [reason, setReason] = useState('')
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [profile, setProfile] = useState(null)
  const [suspendDays, setSuspendDays] = useState(7)
  const [suspendReason, setSuspendReason] = useState('')
  const [deleteWord, setDeleteWord] = useState('')
  const [threadStatus, setThreadStatus] = useState('open')
  const [threads, setThreads] = useState([])
  const [chat, setChat] = useState(null)
  const [chatMessages, setChatMessages] = useState([])
  const [chatDraft, setChatDraft] = useState('')
  const [chatStart, setChatStart] = useState('')
  const [msg, setMsg] = useState({ title: '', body: '' })
  const [payees, setPayees] = useState([])
  const [signups, setSignups] = useState([])
  const [reports, setReports] = useState([])
  const [log, setLog] = useState([])

  useEffect(() => { if (viaPortal || key) load() }, [tab, key, billStatus, threadStatus])

  // Live support chat: re-read the open conversation every 3 s, the list
  // every 10 s, and tell Bill Pal the team is online while this is open.
  useEffect(() => {
    if (tab !== 'support' || !(viaPortal || key)) return
    let stopped = false
    const tick = async () => {
      try {
        await call('/support/live', { method: 'POST', body: '{}' })
        if (chat) {
          const r = await call(`/support/${chat.id}/messages`)
          if (!stopped) setChatMessages(r.messages || [])
        } else {
          const r = await call(`/support?status=${threadStatus}`)
          if (!stopped) setThreads(r.threads || [])
        }
      } catch { /* keep the last good state */ }
    }
    tick()
    const t = setInterval(tick, chat ? 3000 : 10000)
    return () => { stopped = true; clearInterval(t) }
  }, [tab, chat?.id, threadStatus, key])

  if (!isAdmin) return <div className="fg"><p className="fg-note">Managers only.</p></div>

  async function call(path, options = {}) {
    let response
    if (viaPortal) {
      const token = await getPortalIdToken(instance, accounts[0])
      response = await fetch(apiUrl(`/api/billpal${path}`), {
        ...options,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
      })
    } else {
      response = await fetch(`${DIRECT}/admin${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'X-Operator': (user?.email || '').toLowerCase(), ...(options.headers || {}) },
      })
      if (response.status === 401) {
        localStorage.removeItem(KEY_STORAGE)
        setKey('')
        setKeyError('That key was not accepted. Check it and try again.')
        throw new Error('That key was not accepted.')
      }
    }
    if (options.raw) return response
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || payload?.error || `Bill Pal said no (${response.status}).`)
    return payload
  }

  if (!viaPortal && !key) {
    const saveKey = () => {
      const candidate = keyDraft.replace(/\s+/g, '')
      if (!candidate) return
      localStorage.setItem(KEY_STORAGE, candidate)
      setKeyDraft('')
      setKeyError('')
      setKey(candidate)
    }
    return (
      <div className="fg">
        <style>{FG_CSS}</style>
        <div className="fg-head">
          <button className="fg-back" onClick={goBack} aria-label="Back"><Icon name="chevron-left" size={22} /></button>
          <h1>Bill Pal</h1>
        </div>
        <div className="fg-form">
          <p className="fg-note">
            This screen can remove bills and suspend accounts, so it is behind a real secret.
            Enter the Bill Pal admin key once; it stays on this phone.
          </p>
          <input value={keyDraft} onChange={e => { setKeyDraft(e.target.value); setKeyError('') }} placeholder="Admin key"
            autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} />
          {keyError && <div className="fg-outcome bad">{keyError}</div>}
          <button className="fg-primary" disabled={!keyDraft.trim()} onClick={saveKey}>Unlock</button>
        </div>
      </div>
    )
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      if (tab === 'overview') setOverview(await call('/overview'))
      if (tab === 'bills') setBills((await call(`/bills?status=${billStatus}`)).bills || [])
      if (tab === 'support' && !chat) setThreads((await call(`/support?status=${threadStatus}`)).threads || [])
      if (tab === 'people' || tab === 'message') setUsers((await call(`/users?q=${encodeURIComponent(search)}`)).users || [])
      if (tab === 'suppliers') setPayees((await call('/payees')).payees || [])
      if (tab === 'signups') setSignups((await call('/signups')).signups || [])
      if (tab === 'reports') setReports((await call('/reports')).reports || [])
      if (tab === 'log') setLog((await call('/log')).log || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function act(label, fn) {
    setBusy(true)
    setOutcome(null)
    try {
      const result = await fn()
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      setOutcome({ ok: true, text: typeof label === 'function' ? label(result) : label })
      return result || true
    } catch (e) {
      setOutcome({ ok: false, text: e.message })
      return null
    } finally {
      setBusy(false)
    }
  }

  async function openProfile(id) {
    setOutcome(null)
    setDeleteWord('')
    try { setProfile(await call(`/users/${id}`)) } catch (e) { setError(e.message) }
  }

  async function openPhoto(id) {
    try {
      const r = await call(`/bills/${id}/image`, { raw: true })
      if (!r.ok) throw new Error('No photo for this bill.')
      setPhoto(URL.createObjectURL(await r.blob()))
    } catch (e) { setOutcome({ ok: false, text: e.message }) }
  }

  async function openChat(t) {
    setChat(t); setChatMessages([]); setChatDraft('')
    try { setChatMessages((await call(`/support/${t.id}/messages`)).messages || []) } catch (e) { setError(e.message) }
  }

  const header = (
    <>
      <style>{FG_CSS}</style>
      <div className="fg-head">
        <button className="fg-back" onClick={photo ? () => setPhoto(null) : profile ? () => setProfile(null) : goBack} aria-label="Back">
          <Icon name="chevron-left" size={22} />
        </button>
        <h1>{photo ? 'Bill photo' : profile ? (profile.user.firstName || profile.user.email || 'Member') : 'Bill Pal'}</h1>
        <button className="fg-back" onClick={profile ? () => openProfile(profile.user.id) : load} aria-label="Refresh">
          <Icon name="refresh" size={18} />
        </button>
      </div>
      {outcome && <div className={`fg-outcome ${outcome.ok ? 'ok' : 'bad'}`}>{outcome.text}</div>}
    </>
  )

  if (photo) return <div className="fg">{header}<img src={photo} alt="Uploaded bill" style={{ width: '100%', borderRadius: 12 }} /></div>
  if (profile) return <div className="fg">{header}{renderProfile()}</div>

  return (
    <div className="fg">
      {header}
      <div className="fg-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => { setTab(k); setOutcome(null); setChat(null) }}>{label}</button>
        ))}
      </div>
      {error && <div className="fg-outcome bad">{error}</div>}
      {loading && <p className="fg-note">Loading…</p>}
      {!loading && tab === 'overview' && renderOverview()}
      {!loading && tab === 'bills' && renderBills()}
      {tab === 'support' && renderSupport()}
      {!loading && tab === 'people' && renderPeople()}
      {!loading && tab === 'message' && renderMessage()}
      {!loading && tab === 'suppliers' && renderSuppliers()}
      {!loading && tab === 'signups' && renderSignups()}
      {!loading && tab === 'reports' && renderReports()}
      {!loading && tab === 'log' && renderLog()}
    </div>
  )

  function renderOverview() {
    if (!overview) return null
    const o = overview
    const stat = (value, label, alarm) => <div className={`fg-stat ${alarm ? 'alarm' : ''}`}><strong>{value ?? '–'}</strong><span>{label}</span></div>
    return (
      <>
        <div className="fg-stats">{stat(o.pendingBills, 'Bills to review', o.pendingBills > 0)}{stat(o.unreadChats, 'Unread chats', o.unreadChats > 0)}</div>
        <div className="fg-stats">{stat(o.liveBills, 'Live bills')}{stat(o.clearedBills, 'Bills cleared')}</div>
        <div className="fg-stats">{stat(o.users, 'Members')}{stat(o.suspended, 'Suspended')}</div>
        <div className="fg-stats">{stat(gbp(o.paidPence), `Paid to suppliers (${o.paidCount})`)}{stat(o.reports, 'Bill reports', o.reports > 0)}</div>
        <div className="fg-stats">{stat(o.betaSignups, 'Beta sign-ups')}{stat(o.signups - o.betaSignups, 'Helpers')}</div>
        <p className="fg-meta">Payments: {o.payments}</p>
      </>
    )
  }

  function renderBills() {
    const setStatus = (id, status, why = '') => act(status === 'live' ? 'Approved. It is live now.' : 'Removed. They have been told why.', async () => {
      await call(`/bills/${id}/status`, { method: 'POST', body: JSON.stringify({ status, reason: why }) })
      setRemoving(null); setReason('')
      setBills((await call(`/bills?status=${billStatus}`)).bills || [])
    })
    return (
      <>
        <div className="fg-seg" style={{ marginBottom: 12 }}>
          {[['pending', 'To review'], ['live', 'Live'], ['rejected', 'Removed']].map(([st, label]) => (
            <button key={st} className={billStatus === st ? 'active' : ''} onClick={() => setBillStatus(st)}>{label}</button>
          ))}
        </div>
        {bills.map(b => (
          <div key={b.id} className="fg-card">
            <strong>{b.firstName}'s {b.kind} bill · {b.supplier}</strong>
            <Info label="Amount" value={`${gbp(b.totalPence)} (${gbp(b.paidPence)} paid)`} />
            <Info label="Due" value={b.dueDate} />
            <Info label="Reference" value={b.reference} />
            <Info label="Area" value={`${b.area} · ${b.household} at home`} />
            <Info label="Posted by" value={b.posterEmail || 'Deleted account'} />
            <Info label="Supplier bank details" value={b.payeeVerified ? 'Checked' : 'Not checked yet'} />
            {b.reports > 0 && <Info label="Reports" value={b.reports} />}
            {b.note && <p className="fg-meta">“{b.note}”</p>}
            {b.removedReason && <p className="fg-meta">Removed: {b.removedReason}</p>}
            <div className="fg-inline">
              {b.hasImage && <button onClick={() => openPhoto(b.id)}>See photo</button>}
              {b.userId && <button onClick={() => openProfile(b.userId)}>Their account</button>}
              {billStatus !== 'live' && <button disabled={busy} onClick={() => setStatus(b.id, 'live')}>Approve, go live</button>}
              {billStatus !== 'rejected' && <button className="warn" onClick={() => { setRemoving(b.id); setReason('') }}>Remove</button>}
            </div>
            {removing === b.id && (
              <div className="fg-form" style={{ marginTop: 8 }}>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why? They see this (e.g. the reference doesn't match the photo)" />
                <button className="fg-primary" disabled={busy || !reason.trim()} onClick={() => setStatus(b.id, 'rejected', reason.trim())}>Remove bill</button>
              </div>
            )}
          </div>
        ))}
        {!bills.length && <p className="fg-note">{billStatus === 'pending' ? 'Nothing waiting for review.' : 'None here.'}</p>}
      </>
    )
  }

  function renderSupport() {
    if (chat) return renderChat()
    return (
      <>
        <div className="fg-seg" style={{ marginBottom: 12 }}>
          {['open', 'closed'].map(st => (
            <button key={st} className={threadStatus === st ? 'active' : ''} onClick={() => setThreadStatus(st)}>{st === 'open' ? 'Open' : 'Closed'}</button>
          ))}
        </div>
        <div className="fg-list">
          {threads.map(t => (
            <button key={t.id} className="fg-row" onClick={() => openChat(t)}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong>{t.firstName || t.email || 'Member'}</strong>
                <span className="fg-meta">{when(t.updatedAt)}</span>
                <span className="fg-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.lastSender === 'staff' ? 'You: ' : ''}{t.lastMessage}</span>
              </div>
              {t.unread && <span className="fg-unread">New</span>}
            </button>
          ))}
          {!threads.length && <p className="fg-note">{threadStatus === 'open' ? 'No open conversations. You show as online in the app while this tab is open.' : 'Nothing closed yet.'}</p>}
        </div>
      </>
    )
  }

  function renderChat() {
    const t = chat
    const quick = [
      'Thanks for getting in touch! Let me look into this for you.',
      'Could you send a clear photo of the whole first page of your bill?',
      'The reference on your bill does not match what was entered. Could you check it?',
      'Your bill is live now. People can chip in straight away.',
      'That should be sorted now. Let me know if anything else comes up!',
    ]
    const send = async () => {
      const text = chatDraft.trim()
      if (!text) return
      setBusy(true)
      try {
        await call(`/support/${t.id}/messages`, { method: 'POST', body: JSON.stringify({ body: text }) })
        setChatDraft('')
        setChatMessages((await call(`/support/${t.id}/messages`)).messages || [])
      } catch (e) { setOutcome({ ok: false, text: e.message }) } finally { setBusy(false) }
    }
    const name = t.firstName || t.email || '?'
    return (
      <div className="fg-chat">
        <button className="fg-link" onClick={() => setChat(null)}>‹ All conversations</button>
        <div className="fg-chathead">
          <div className="fg-avatar big">{name.trim().slice(0, 1).toUpperCase()}</div>
          <div style={{ minWidth: 0, flex: 1 }}><strong>{name}</strong><span className="fg-meta">{t.email}</span></div>
        </div>
        <div className="fg-inline"><button onClick={() => openProfile(t.userId)}>Their account</button></div>
        <div className="fg-thread">
          {chatMessages.map((m, i) => {
            const next = chatMessages[i + 1]
            const lastInGroup = !next || next.sender !== m.sender || next.createdAt - m.createdAt > 300
            const mine = m.sender === 'staff'
            return (
              <div key={m.id} className={`fg-msg ${mine ? 'mine' : ''} ${lastInGroup ? 'last' : ''}`}>
                {!mine && <div className="fg-avatar">{lastInGroup ? name.trim().slice(0, 1).toUpperCase() : ''}</div>}
                <div className="fg-msg-col">
                  <div className="fg-bubble"><p>{m.body}</p></div>
                  {lastInGroup && <span className="fg-time">{mine ? `${(m.staff || '').split('@')[0]} · ` : ''}{new Date(m.createdAt * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              </div>
            )
          })}
          {!chatMessages.length && <p className="fg-note">No messages yet.</p>}
        </div>
        <div className="fg-quick">{quick.map(q => <button key={q} onClick={() => setChatDraft(q)}>{q}</button>)}</div>
        <div className="fg-composer">
          <textarea rows={1} placeholder="Reply… (they get a notification)" maxLength={2000} value={chatDraft}
            onChange={e => { setChatDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button className="fg-send" aria-label="Send" disabled={busy || !chatDraft.trim()} onClick={send}>↑</button>
        </div>
        <div className="fg-inline" style={{ marginTop: 8 }}>
          <button onClick={async () => { if (await act(threadStatus === 'closed' ? 'Reopened.' : 'Closed.', () => call(`/support/${t.id}/status`, { method: 'POST', body: JSON.stringify({ status: threadStatus === 'closed' ? 'open' : 'closed' }) }))) setChat(null) }}>
            {threadStatus === 'closed' ? 'Reopen' : 'Close conversation'}
          </button>
        </div>
      </div>
    )
  }

  function renderPeople() {
    return (
      <>
        <form className="fg-search" onSubmit={e => { e.preventDefault(); load() }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email" />
          <button type="submit">Search</button>
        </form>
        <div className="fg-list">
          {users.map(u => (
            <button key={u.id} className="fg-row" onClick={() => openProfile(u.id)}>
              <div>
                <strong>{u.firstName || '(no name)'} {u.suspendedUntil && <span className="fg-pill bad">Suspended</span>}</strong>
                <span className="fg-meta">{u.email || (u.apple ? 'Sign in with Apple, email hidden' : '')}</span>
                <span className="fg-meta">{u.bills} bill{u.bills === 1 ? '' : 's'} · gave {gbp(u.givenPence)} · joined {when(u.createdAt)}</span>
              </div>
              <Icon name="chevron-right" size={18} color="var(--mobile-text-secondary)" />
            </button>
          ))}
          {!users.length && <p className="fg-note">Nobody found.</p>}
        </div>
      </>
    )
  }

  function renderProfile() {
    const { user: u, bills: theirBills = [], pledges = [] } = profile
    const reload = () => openProfile(u.id)
    return (
      <>
        <div className="fg-card">
          <Info label="Email" value={u.email || 'Hidden by Apple'} />
          <Info label="Joined" value={when(u.createdAt)} />
          <Info label="Sign in" value={u.apple ? 'Apple' : 'Email code'} />
          <Info label="Phones with notifications" value={u.devices} />
          {u.suspendedUntil && <Info label="Suspended until" value={when(u.suspendedUntil)} />}
          {u.suspendedReason && <p className="fg-meta">Reason: {u.suspendedReason}</p>}
        </div>

        <h3 className="fg-h">Message them</h3>
        <div className="fg-form">
          <textarea rows={2} value={chatStart} onChange={e => setChatStart(e.target.value)} placeholder="Starts or continues their support chat" />
          <button className="fg-primary" disabled={busy || !chatStart.trim()} onClick={async () => {
            const r = await act('Sent. It is in the Support tab.', () => call('/support/start', { method: 'POST', body: JSON.stringify({ userId: u.id, body: chatStart.trim() }) }))
            if (r) setChatStart('')
          }}>Send</button>
        </div>

        <h3 className="fg-h">Bills</h3>
        {theirBills.map(b => (
          <div key={b.id} className="fg-card">
            <strong>{b.supplier} · {gbp(b.totalPence)} · {b.status}</strong>
            <p className="fg-meta">Ref {b.reference} · due {b.dueDate}{b.removedReason ? ` · ${b.removedReason}` : ''}</p>
            {(b.status === 'live' || b.status === 'pending') && (
              <div className="fg-inline"><button className="warn" disabled={busy} onClick={async () => {
                if (await act('Bill removed.', () => call(`/bills/${b.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'rejected', reason: 'Removed by the Bill Pal team. Message us in the app if you have questions.' }) }))) reload()
              }}>Remove bill</button></div>
            )}
          </div>
        ))}
        {!theirBills.length && <p className="fg-note">No bills posted.</p>}

        <h3 className="fg-h">Chipped in</h3>
        <div className="fg-card">
          {pledges.map(p => <Info key={p.id} label={`${p.bill} · ${when(p.createdAt)}`} value={`${gbp(p.amountPence)} ${p.status}`} />)}
          {!pledges.length && <p className="fg-meta">Nothing yet.</p>}
        </div>

        <h3 className="fg-h">Account</h3>
        <div className="fg-card">
          {u.suspendedUntil ? (
            <button disabled={busy} onClick={async () => { if (await act('Suspension lifted.', () => call(`/users/${u.id}/suspend`, { method: 'POST', body: JSON.stringify({ days: 0 }) }))) reload() }}>Lift suspension</button>
          ) : (
            <div className="fg-form">
              <div className="fg-seg">
                {[1, 7, 30, 365].map(d => <button key={d} className={suspendDays === d ? 'active' : ''} onClick={() => setSuspendDays(d)}>{d === 365 ? '1 year' : `${d} day${d === 1 ? '' : 's'}`}</button>)}
              </div>
              <input value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="Reason (kept in the log)" />
              <button className="fg-primary" disabled={busy} onClick={async () => { if (await act('Suspended. They are signed out and their bills are down.', () => call(`/users/${u.id}/suspend`, { method: 'POST', body: JSON.stringify({ days: suspendDays, reason: suspendReason }) }))) reload() }}>Suspend</button>
            </div>
          )}
          <div className="fg-form" style={{ marginTop: 12 }}>
            <p className="fg-meta">Deleting removes their email and name, signs them out and takes their bills down. Type DELETE to confirm.</p>
            <input value={deleteWord} onChange={e => setDeleteWord(e.target.value)} placeholder="DELETE" autoCapitalize="characters" />
            <button className="fg-primary danger" disabled={busy || deleteWord !== 'DELETE'} onClick={async () => { if (await act('Account deleted.', () => call(`/users/${u.id}`, { method: 'DELETE' }))) setProfile(null) }}>Delete account</button>
          </div>
        </div>
      </>
    )
  }

  function renderMessage() {
    const send = () => act(r => r.note || `Sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}.`, () => call('/notify', { method: 'POST', body: JSON.stringify(msg) }))
    return (
      <div className="fg-form">
        <p className="fg-note">Sends a notification to everyone who allowed notifications in Bill Pal. To message one person, open them in People.</p>
        <input value={msg.title} maxLength={80} onChange={e => setMsg({ ...msg, title: e.target.value })} placeholder="Title" />
        <textarea rows={3} value={msg.body} maxLength={300} onChange={e => setMsg({ ...msg, body: e.target.value })} placeholder="Message" />
        <button className="fg-primary" disabled={busy || !msg.title.trim() || !msg.body.trim()} onClick={send}>Send to everyone</button>
      </div>
    )
  }

  function renderSuppliers() {
    const sc = c => (c ? c.replace(/(\d{2})(\d{2})(\d{2})/, '$1-$2-$3') : '')
    return (
      <>
        <p className="fg-note">Bill Pal only pays a supplier once its bank details are ticked here. Check them on the supplier's own website or by phone. Never use details from a customer's photo.</p>
        {payees.map(p => p.id ? (
          <div key={p.id} className="fg-card">
            <strong>{p.supplier}{p.ref_prefix ? ` · accounts starting ${p.ref_prefix}` : ''}</strong> {p.verified ? <span className="fg-pill">Checked</span> : <span className="fg-pill bad">Not checked</span>}
            <Info label="Account name" value={p.account_name} />
            <Info label="Sort code" value={sc(p.sort_code)} />
            <Info label="Account number" value={p.account_number} />
            <Info label="Reference" value={p.ref_label} />
            <p className="fg-meta">{p.source_note}</p>
            <p className="fg-meta" style={{ overflowWrap: 'anywhere' }}>{p.source_url}</p>
            <div className="fg-inline">
              <button disabled={busy} onClick={async () => { if (await act(p.verified ? 'Unticked.' : 'Ticked. This supplier can take payments.', () => call(`/payees/${p.id}/verify`, { method: 'POST', body: JSON.stringify({ verified: !p.verified }) }))) load() }}>
                {p.verified ? 'Untick' : "I've checked these details"}
              </button>
            </div>
          </div>
        ) : (
          <div key={p.sid} className="fg-card"><strong>{p.supplier}</strong> <span className="fg-pill bad">{p.active ? 'No bank details' : "Can't be paid"}</span><p className="fg-meta">{p.pay_note || 'No published bank transfer details.'}</p></div>
        ))}
      </>
    )
  }

  function renderSignups() {
    return (
      <div className="fg-list">
        {signups.map(s => (
          <div key={s.id} className="fg-card">
            <strong>{s.name || 'No name'} · {s.kind === 'beta' ? 'Beta' : 'Helper'}{s.role ? ` · ${s.role}` : ''}</strong>
            <p className="fg-meta">{s.email} · {when(s.created_at)}</p>
            {s.note && <p className="fg-meta">{s.note}</p>}
            <div className="fg-inline"><button className="warn" disabled={busy} onClick={async () => { if (await act('Removed.', () => call(`/signups/${s.id}`, { method: 'DELETE' }))) load() }}>Remove</button></div>
          </div>
        ))}
        {!signups.length && <p className="fg-note">No sign-ups yet. They come from billpal.dhwebsiteservices.co.uk.</p>}
      </div>
    )
  }

  function renderReports() {
    return (
      <div className="fg-list">
        {reports.map((r, i) => (
          <div key={i} className="fg-card">
            <strong>{r.first_name}'s bill · {r.supplier} · {r.status}</strong>
            <p className="fg-meta">{r.reason} · {when(r.created_at)}</p>
          </div>
        ))}
        {!reports.length && <p className="fg-note">No bills have been reported.</p>}
      </div>
    )
  }

  function renderLog() {
    return (
      <div className="fg-list">
        {log.map(l => (
          <div key={l.id} className="fg-card">
            <strong>{l.action}</strong>
            <p className="fg-meta">{l.operator} · {when(l.created_at)}{l.target ? ` · ${l.target}` : ''}</p>
            {l.detail && <p className="fg-meta">{l.detail}</p>}
          </div>
        ))}
        {!log.length && <p className="fg-note">No staff actions yet.</p>}
      </div>
    )
  }
}

function Info({ label, value }) {
  return <div className="fg-info"><span>{label}</span><strong>{value}</strong></div>
}
