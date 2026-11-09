import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import StatusTag from '../components/StatusTag'
import SourceTag from '../components/SourceTag'
import Avatar from '../components/Avatar'
import {
  EXAMPLE_TODAY,
  staff,
  findClient,
  findStaff,
  isOverADay,
  invoices,
  PLAN_LABELS,
} from '../exampleData'
import { dayTime, addDays } from '../format'
import { useHQStore, setConversations, setJobs } from '../sessionStore'
import useMe from '../useMe'

// Inbox: every message from every source. Matches the "Inbox" mockup in the plan:
// filters | list | conversation | client. Example data; every button works on
// screen only and nothing is sent (see sessionStore.js).
// The open item is in the address (?item=m2) so Today's links land on it.

const VIEWS = [
  { id: 'mine', label: 'Mine' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'open', label: 'All open' },
  { id: 'snoozed', label: 'Snoozed' },
  { id: 'done', label: 'Done' },
]

const SOURCES = [
  { id: 'email', label: 'Email', match: ['email'] },
  { id: 'website', label: 'Website', match: ['website'] },
  { id: 'calls', label: 'Calls & voicemail', match: ['call', 'voicemail'] },
  { id: 'text', label: 'Texts', match: ['text'] },
  { id: 'client', label: 'Clients', match: ['client'] },
  { id: 'app', label: 'Apps', match: ['app'] },
  { id: 'payment', label: 'Payments', match: ['payment'] },
]

const HOW = {
  client: 'from the client area',
  email: 'by email',
  website: 'from the website form',
  call: 'missed call',
  voicemail: 'voicemail',
  text: 'by text',
  app: 'App Store review',
  payment: 'from Stripe',
  booking: 'booking',
}

const inView = (c, view, me) => {
  if (view === 'snoozed') return c.status === 'snoozed'
  if (view === 'done') return c.status === 'done'
  if (c.status !== 'open') return false
  if (view === 'mine') return !!me && c.assignee === me.id
  if (view === 'unassigned') return !c.assignee
  return true
}

const inSource = (c, sourceId) => !sourceId || SOURCES.find((s) => s.id === sourceId)?.match.includes(c.source)

// Which view an item would be found in, for links from other screens.
const viewFor = (c, me) => {
  if (!c) return null
  if (c.status === 'snoozed') return 'snoozed'
  if (c.status === 'done') return 'done'
  if (me && c.assignee === me.id) return 'mine'
  return 'open'
}

const nowIso = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}
const firstName = (person) => (person ? person.name.split(' ')[0] : 'You')

function StaffAvatar({ id }) {
  const person = findStaff(id)
  return person ? <Avatar name={person.name} initials={person.initials} tone={person.tone} /> : null
}

function ItemTag({ c }) {
  if (c.status === 'done') return <StatusTag tone="ok">Done</StatusTag>
  if (c.status === 'snoozed') return <StatusTag tone="warn">Snoozed</StatusTag>
  if (c.tag) return <StatusTag tone={c.tag === 'Action' ? 'warn' : 'info'}>{c.tag}</StatusTag>
  if (!c.assignee && isOverADay(c.receivedAt)) return <StatusTag tone="bad">Over a day</StatusTag>
  if (!c.assignee) return <StatusTag tone="mute">Unassigned</StatusTag>
  return null
}

/* ---------------- Reply box ---------------- */

function ReplyBox({ c, client, me }) {
  const contact = client?.contacts.find((p) => c.from.startsWith(p.name.split(' ')[0])) || client?.contacts[0] || null
  const phone = c.phone || contact?.phone || null
  const canReply = ['email', 'website', 'client', 'app'].includes(c.source)
  const modes = [
    { id: 'reply', label: 'Reply', ok: canReply },
    { id: 'note', label: 'Internal note', ok: true },
    { id: 'text', label: 'Text', ok: !!phone },
  ]
  const firstMode = canReply ? 'reply' : phone ? 'text' : 'note'
  const [mode, setMode] = useState(firstMode)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')

  const where = {
    reply: c.source === 'app'
      ? 'Replies to the review on the App Store'
      : 'Sends from clients@dhwebsiteservices.co.uk',
    note: 'Only the team sees notes. Never sent.',
    text: phone ? `Sends a text to ${phone}` : '',
  }[mode]

  const send = (event) => {
    event.preventDefault()
    if (!body.trim()) { setError(mode === 'note' ? 'Write a note first.' : 'Write a message first.'); return }
    const message = {
      id: `${c.id}-${Date.now()}`,
      kind: mode === 'note' ? 'note' : 'out',
      who: firstName(me),
      at: nowIso(),
      body: body.trim(),
      channel: mode === 'note' ? 'internal note' : mode === 'text' ? 'text, on screen only' : 'reply, on screen only',
    }
    setConversations((list) => list.map((x) => (x.id === c.id ? { ...x, messages: [...x.messages, message] } : x)))
    setBody('')
    setError('')
  }

  return (
    <form className={`hq-reply${mode === 'note' ? ' is-note' : ''}`} onSubmit={send}>
      <div className="hq-reply-tabs" role="tablist" aria-label="How to answer">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            className={mode === m.id ? 'is-on' : undefined}
            disabled={!m.ok}
            title={m.ok ? undefined : m.id === 'text' ? 'No phone number for this one' : 'Can\'t reply to this kind of message'}
            onClick={() => { setMode(m.id); setError('') }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <label className="hq-visually-hidden" htmlFor="hq-reply-body">{modes.find((m) => m.id === mode).label}</label>
      <textarea
        id="hq-reply-body"
        rows={3}
        value={body}
        onChange={(e) => { setBody(e.target.value); setError('') }}
        placeholder={mode === 'note' ? 'Write a note for the team…' : mode === 'text' ? 'Write a text…' : 'Write a reply…'}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e) }}
      />
      <div className="hq-reply-ft">
        <span className="hq-muted">{error ? <span className="hq-error" role="alert">{error}</span> : <>{where} <span className="hq-example-tag">Example: not really sent</span></>}</span>
        <button type="submit" className="hq-btn hq-btn-primary">{mode === 'note' ? 'Add note' : mode === 'text' ? 'Send text' : 'Send'}</button>
      </div>
    </form>
  )
}

/* ---------------- Conversation ---------------- */

function Thread({ c, me, onBack, onAssign, onSnooze, onDone, onMakeJob }) {
  const client = findClient(c.clientId)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [c.id, c.messages.length])

  return (
    <section className="hq-thread" aria-label="Conversation">
      <header className="hq-thread-hd">
        <button type="button" className="hq-btn hq-thread-back" onClick={onBack}>← Inbox</button>
        <div className="hq-thread-title">
          <h1>{c.subject}</h1>
          <p className="hq-muted">{client ? client.name : c.from} · {HOW[c.source] || c.source}</p>
        </div>
        <div className="hq-thread-actions">
          <label className="hq-visually-hidden" htmlFor="hq-assign">Assign to</label>
          <select id="hq-assign" className="hq-select-btn" value={c.assignee || ''} onChange={(e) => onAssign(c.id, e.target.value || null)}>
            <option value="">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" className="hq-btn" onClick={() => onSnooze(c.id)} disabled={c.status === 'done'}>
            {c.status === 'snoozed' ? 'Unsnooze' : 'Snooze'}
          </button>
          <button type="button" className="hq-btn" onClick={() => onMakeJob(c.id)} disabled={!!c.jobId}>
            {c.jobId ? 'Job made' : 'Make a job'}
          </button>
          <button type="button" className={`hq-btn${c.status === 'done' ? '' : ' hq-btn-primary'}`} onClick={() => onDone(c.id)}>
            {c.status === 'done' ? 'Reopen' : 'Done'}
          </button>
        </div>
      </header>

      <div className="hq-bubbles" aria-live="polite">
        {c.messages.map((m) => {
          if (m.kind === 'event') {
            return <p key={m.id} className="hq-event">{m.body} · {dayTime(m.at)}{m.jobId ? <> · <Link to={`/hq/jobs?job=${m.jobId}`} className="hq-text-link">Open job</Link></> : null}</p>
          }
          return (
            <div key={m.id} className={`hq-bubble is-${m.kind}`}>
              <div className="hq-bubble-who">
                {m.who} · {dayTime(m.at)}{m.channel ? ` · ${m.channel}` : ''}{m.kind === 'note' ? ' · only the team sees this' : ''}
              </div>
              <div className="hq-bubble-body">{m.body}</div>
              {m.attachments?.length ? (
                <div className="hq-bubble-files">
                  {m.attachments.map((a) => <StatusTag key={a.name} tone="mute">{a.name} · {a.size}</StatusTag>)}
                </div>
              ) : null}
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <ReplyBox key={c.id} c={c} client={client} me={me} />
    </section>
  )
}

/* ---------------- Client panel ---------------- */

function ClientPanel({ c, jobs }) {
  const client = findClient(c.clientId)
  const person = findStaff(c.assignee)
  if (!client) {
    return (
      <aside className="hq-ctx" aria-label="Who this is from">
        <div>
          <h2 className="hq-ctx-label">From</h2>
          <b>{c.from}</b>
          {c.phone ? <div className="hq-muted hq-mono-sm">{c.phone}</div> : null}
          <p className="hq-muted">Not linked to a client yet.</p>
        </div>
        <div>
          <h2 className="hq-ctx-label">Assigned</h2>
          {person ? <span className="hq-person"><StaffAvatar id={person.id} />{person.name}</span> : <span className="hq-muted">No one yet</span>}
        </div>
      </aside>
    )
  }
  const owes = invoices.filter((i) => i.clientId === client.id && i.status !== 'paid').reduce((sum, i) => sum + i.amount, 0)
  const openJobs = jobs.filter((j) => j.clientId === client.id && !j.done).length
  const site = client.site ? (client.site.status === 'up' ? <b className="hq-ok">Up</b> : <b className="hq-bad">Down</b>) : <span className="hq-muted">None yet</span>
  return (
    <aside className="hq-ctx" aria-label="Client">
      <div>
        <h2 className="hq-ctx-label">Client</h2>
        <Link to={`/hq/clients/${client.id}`} className="hq-ctx-name">{client.name}</Link>
        <div className="hq-muted">{client.domain || `${client.type} · ${client.town}`}</div>
      </div>
      <dl className="hq-kv hq-kv-tight">
        <dt>Site</dt><dd>{site}</dd>
        <dt>Plan</dt><dd><b>{client.plan ? PLAN_LABELS[client.plan] : 'None'}</b></dd>
        <dt>Owes</dt><dd><b className={owes ? 'hq-bad' : undefined}>£{owes}</b></dd>
        <dt>Open jobs</dt><dd><b>{openJobs}</b></dd>
      </dl>
      <div>
        <h2 className="hq-ctx-label">People</h2>
        <ul className="hq-ctx-people">
          {client.contacts.map((p) => <li key={p.id}>{p.name.split(' ')[0]} · {p.role === 'owner' ? 'owner' : 'team'}</li>)}
        </ul>
      </div>
      <div>
        <h2 className="hq-ctx-label">Assigned</h2>
        {person ? <span className="hq-person"><StaffAvatar id={person.id} />{person.name}</span> : <span className="hq-muted">No one yet</span>}
      </div>
    </aside>
  )
}

/* ---------------- Page ---------------- */

export default function Inbox() {
  const me = useMe()
  const { conversations, jobs } = useHQStore()
  const [params, setParams] = useSearchParams()
  const listRef = useRef(null)

  const itemId = params.get('item')
  const selected = conversations.find((c) => c.id === itemId) || null
  const view = params.get('view') || viewFor(selected, me) || (me ? 'mine' : 'open')
  const source = params.get('source') || ''

  useEffect(() => { document.title = 'Inbox · DH HQ' }, [])

  const setParam = useCallback((changes, replace = false) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
      return next
    }, { replace })
  }, [setParams])

  const list = useMemo(
    () => conversations
      .filter((c) => inView(c, view, me) && inSource(c, source))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
    [conversations, view, source, me],
  )

  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, conversations.filter((c) => inView(c, v.id, me)).length])), [conversations, me])

  // Desktop: open the first item when nothing is chosen. Phones show the list first.
  const isPhone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767.98px)').matches
  useEffect(() => {
    if (!isPhone && !selected && list.length) setParam({ item: list[0].id }, true)
  }, [isPhone, selected, list, setParam])

  const select = useCallback((id) => setParam({ item: id, view }), [setParam, view])

  // J / K move down / up the list (not while typing).
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
      const key = e.key.toLowerCase()
      if (key !== 'j' && key !== 'k') return
      if (!list.length) return
      e.preventDefault()
      const at = list.findIndex((c) => c.id === itemId)
      const next = at === -1 ? 0 : Math.max(0, Math.min(list.length - 1, at + (key === 'j' ? 1 : -1)))
      setParam({ item: list[next].id, view }, true)
      listRef.current?.querySelector(`[data-id="${list[next].id}"]`)?.scrollIntoView({ block: 'nearest' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [list, itemId, setParam, view])

  // After an item leaves the current list (done, snoozed, assigned away), open the next one.
  const moveOnFrom = (id, changed) => {
    const at = list.findIndex((c) => c.id === id)
    const still = changed.filter((c) => inView(c, view, me) && inSource(c, source)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    if (still.some((c) => c.id === id)) return
    const next = still[Math.min(Math.max(at, 0), still.length - 1)]
    setParam({ item: isPhone ? null : next?.id || null, view })
  }

  const event = (body, extra = {}) => ({ id: `e-${Date.now()}`, kind: 'event', at: nowIso(), body, ...extra })

  const change = (id, patch, eventText, extra) => {
    let changed = conversations
    setConversations((all) => {
      changed = all.map((c) => (c.id === id ? { ...c, ...patch, messages: eventText ? [...c.messages, event(eventText, extra)] : c.messages } : c))
      return changed
    })
    moveOnFrom(id, changed)
  }

  const onAssign = (id, assignee) => {
    const to = findStaff(assignee)
    change(id, { assignee }, to ? `Assigned to ${firstName(to)} by ${firstName(me)}` : `Unassigned by ${firstName(me)}`)
  }
  const onSnooze = (id) => {
    const c = conversations.find((x) => x.id === id)
    if (c.status === 'snoozed') change(id, { status: 'open' }, `Unsnoozed by ${firstName(me)}`)
    else change(id, { status: 'snoozed' }, `Snoozed until tomorrow 9am by ${firstName(me)}`)
  }
  const onDone = (id) => {
    const c = conversations.find((x) => x.id === id)
    if (c.status === 'done') change(id, { status: 'open' }, `Reopened by ${firstName(me)}`)
    else change(id, { status: 'done' }, `Marked done by ${firstName(me)}`)
  }
  const onMakeJob = (id) => {
    const c = conversations.find((x) => x.id === id)
    const jobId = `job-${Date.now()}`
    setJobs((all) => [...all, {
      id: jobId,
      title: c.subject === 'Missed call' || c.subject.startsWith('Voicemail') ? `Call back ${c.from}` : c.subject,
      clientId: c.clientId || null,
      assignee: c.assignee || me?.id || null,
      due: addDays(EXAMPLE_TODAY, 1),
      done: false,
      visibleToClient: c.source === 'client',
      notes: `Made from the inbox (${c.from}): ${c.preview}`,
      checklist: [],
    }])
    change(id, { jobId }, `Job made by ${firstName(me)}, due tomorrow`, { jobId })
  }

  const back = () => setParam({ item: null, view })

  return (
    <div className={`hq-inbox${selected ? ' has-item' : ''}`}>
      <nav className="hq-inbox-filters" aria-label="Inbox filters">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`hq-inbox-f${view === v.id ? ' is-on' : ''}`}
            aria-pressed={view === v.id}
            disabled={v.id === 'mine' && !me}
            onClick={() => setParam({ view: v.id, item: null })}
          >
            <span>{v.label}</span>
            {v.id !== 'done' && counts[v.id] ? <i>{counts[v.id]}</i> : null}
          </button>
        ))}
        <h2 className="hq-inbox-lab">Source</h2>
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`hq-inbox-f${source === s.id ? ' is-on' : ''}`}
            aria-pressed={source === s.id}
            onClick={() => setParam({ source: source === s.id ? null : s.id, item: null, view })}
          >
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      <div className="hq-inbox-list" ref={listRef}>
        <div className="hq-inbox-phone-filters">
          <label className="hq-visually-hidden" htmlFor="hq-inbox-view">Show</label>
          <select id="hq-inbox-view" value={view} onChange={(e) => setParam({ view: e.target.value, item: null })}>
            {VIEWS.map((v) => <option key={v.id} value={v.id} disabled={v.id === 'mine' && !me}>{v.label}{v.id !== 'done' ? ` (${counts[v.id]})` : ''}</option>)}
          </select>
          <label className="hq-visually-hidden" htmlFor="hq-inbox-source">Source</label>
          <select id="hq-inbox-source" value={source} onChange={(e) => setParam({ source: e.target.value || null, item: null, view })}>
            <option value="">All sources</option>
            {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        {list.length === 0 ? <p className="hq-panel-empty">Nothing here. {view === 'mine' ? 'All your messages are answered.' : ''}</p> : null}
        <ul aria-label="Messages">
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                data-id={c.id}
                className={`hq-msg${c.id === itemId ? ' is-on' : ''}`}
                aria-current={c.id === itemId ? 'true' : undefined}
                onClick={() => select(c.id)}
              >
                <span className="hq-msg-l1"><b>{c.from}</b><span className="hq-row-when">{dayTime(c.receivedAt)}</span></span>
                <span className="hq-msg-l2">{c.preview}</span>
                <span className="hq-msg-l3"><SourceTag source={c.source} /><ItemTag c={c} /><span className="hq-bar-gap" />{c.assignee ? <StaffAvatar id={c.assignee} /> : null}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="hq-inbox-keys hq-hide-phone"><kbd className="hq-kbd">J</kbd> and <kbd className="hq-kbd">K</kbd> move down and up</p>
      </div>

      {selected ? (
        <>
          <Thread c={selected} me={me} onBack={back} onAssign={onAssign} onSnooze={onSnooze} onDone={onDone} onMakeJob={onMakeJob} />
          <ClientPanel c={selected} jobs={jobs} />
        </>
      ) : (
        <div className="hq-thread hq-thread-empty hq-hide-phone"><p className="hq-muted">Pick a message from the list.</p></div>
      )}
    </div>
  )
}
