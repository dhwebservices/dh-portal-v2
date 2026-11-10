import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StatStrip from '../components/StatStrip'
import Panel, { PanelEmpty } from '../components/Panel'
import Row from '../components/Row'
import StatusTag from '../components/StatusTag'
import SourceTag from '../components/SourceTag'
import Avatar from '../components/Avatar'
import SidePanel from '../components/SidePanel'
import {
  EXAMPLE_TODAY,
  findStaff,
  isOverADay,
  maskNumber,
  clientForNumber,
  contactForNumber,
  phoneHours,
  phoneAnswering,
} from '../exampleData'
import { addDays, dayShort, dayTime, longDate } from '../format'
import { useHQStore, setCalls, setConversations, setJobs, nowIso } from '../sessionStore'
import useMe from '../useMe'

// Phone: the DH line's calls, voicemails and texts. Same layout as Today: a thin
// strip of four, the main "Calls" panel on the left, and a right-hand column.
// Example data; every button works on screen only. Nothing is dialled or sent.
// A call linked to an Inbox item (conversationId) shares its "Done" with the
// Inbox, so the two always agree.

const TABS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'missed', label: 'Missed', test: (c) => c.kind !== 'text' && c.outcome === 'missed' },
  { id: 'voicemail', label: 'Voicemail', test: (c) => c.kind === 'voicemail' },
  { id: 'texts', label: 'Texts', test: (c) => c.kind === 'text' },
]

const firstName = (person) => (person ? person.name.split(' ')[0] : 'You')
const isMissed = (c) => c.kind !== 'text' && c.outcome === 'missed'

// Who: the client (and person) if we know the number, otherwise the part-hidden number.
const whoFor = (c) => {
  const client = clientForNumber(c.number)
  const person = contactForNumber(c.number)
  if (client) return { name: person ? `${person.name.split(' ')[0]}, ${client.name}` : client.name, client }
  // Not a client, but the Inbox may already know a name ("Dylan, Treforest").
  if (c.fromName) return { name: c.fromName, client: null }
  return { name: maskNumber(c.number), client: null }
}

// What happened, in plain words.
const whatFor = (c) => {
  if (c.kind === 'text') return c.direction === 'in' ? `text: "${c.body}"` : `text sent: "${c.body}"`
  if (c.kind === 'voicemail') return `missed, left a voicemail (0:${String(c.seconds).padStart(2, '0')})`
  if (c.outcome === 'missed') return c.note ? `missed · ${c.note}` : 'missed, no voicemail'
  const person = findStaff(c.by)
  const verb = c.direction === 'out' ? 'called by' : 'answered by'
  return `${verb} ${firstName(person)}, ${c.minutes} min`
}

// The word beside a row. Missed calls not yet dealt with: "Today" or "Over a day".
function RowTag({ c }) {
  if (c.status === 'done') return isMissed(c) || (c.kind === 'text' && c.direction === 'in') ? <StatusTag tone="ok">Done</StatusTag> : null
  if (isMissed(c)) {
    if (c.at.slice(0, 10) === EXAMPLE_TODAY) return <StatusTag tone="warn">Today</StatusTag>
    if (isOverADay(c.at)) return <StatusTag tone="bad">Over a day</StatusTag>
    return <StatusTag tone="warn">Yesterday</StatusTag>
  }
  if (c.kind === 'text' && c.direction === 'in') return <StatusTag tone="info">To answer</StatusTag>
  return null
}

// Is the line open right now (real clock)? Returns { open, label, note }.
function lineStatus(now = new Date()) {
  const today = phoneHours.find((h) => h.day === now.getDay())
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  if (today?.open && hhmm >= today.open && hhmm < today.close) {
    return { open: true, label: 'Open', note: `until ${today.close}` }
  }
  // Next opening time.
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    const h = phoneHours.find((x) => x.day === d.getDay())
    if (h?.open && (i > 0 || hhmm < h.open)) {
      return { open: false, label: 'Closed', note: i === 0 ? `opens ${h.open}` : `opens ${h.label.slice(0, 3)} ${h.open}` }
    }
  }
  return { open: false, label: 'Closed', note: null }
}

/* ---------------- Side panel ---------------- */

function CallDetail({ c, me, onClose, onDone, onMakeJob, onLog }) {
  const { name, client } = whoFor(c)
  const person = findStaff(c.by)
  const [texting, setTexting] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const sendText = (event) => {
    event.preventDefault()
    if (!text.trim()) { setError('Write the text first.'); return }
    onLog(c.id, `Text sent by ${firstName(me)} (on screen only, not really sent): "${text.trim()}"`)
    setText('')
    setTexting(false)
    setError('')
  }

  const kindLabel = c.kind === 'text' ? 'Text' : c.kind === 'voicemail' ? 'Voicemail' : c.direction === 'out' ? 'Call out' : 'Call'

  return (
    <SidePanel
      title={`${kindLabel} · ${name}`}
      onClose={onClose}
      footer={
        <div className="hq-call-actions">
          <button type="button" className="hq-btn" onClick={() => onLog(c.id, `${firstName(me)} pressed Call back (on screen only, nothing was dialled)`)}>Call back</button>
          <button type="button" className="hq-btn" onClick={() => { setTexting((v) => !v); setError('') }} aria-expanded={texting}>Text back</button>
          <button type="button" className="hq-btn" onClick={() => onMakeJob(c.id)} disabled={!!c.jobId}>{c.jobId ? 'Job made' : 'Make a job'}</button>
          <button type="button" className={`hq-btn${c.status === 'done' ? '' : ' hq-btn-primary'}`} onClick={() => onDone(c.id)}>
            {c.status === 'done' ? 'Reopen' : 'Done'}
          </button>
        </div>
      }
    >
      <dl className="hq-kv">
        <dt>From</dt>
        <dd>{client ? <Link to={`/hq/clients/${client.id}`} className="hq-text-link">{name}</Link> : name}</dd>
        <dt>Number</dt>
        <dd className="hq-mono-sm">{maskNumber(c.number)}</dd>
        <dt>When</dt>
        <dd>{dayTime(c.at)}{c.at.slice(0, 10) === EXAMPLE_TODAY ? ' (today)' : ''}</dd>
        <dt>What happened</dt>
        <dd>{c.kind === 'text' ? (c.direction === 'in' ? 'Text received' : 'Text sent') : whatFor(c)}</dd>
        {person && c.kind === 'call' && c.outcome === 'answered' ? (
          <><dt>{c.direction === 'out' ? 'Called by' : 'Answered by'}</dt><dd><span className="hq-person"><Avatar name={person.name} initials={person.initials} tone={person.tone} />{person.name}</span></dd></>
        ) : null}
        <dt>Status</dt>
        <dd>{isMissed(c) || (c.kind === 'text' && c.direction === 'in') ? <RowTag c={c} /> : <span className="hq-muted">Nothing to do</span>}</dd>
        {c.conversationId ? <><dt>Inbox</dt><dd><Link to={`/hq/inbox?item=${c.conversationId}`} className="hq-text-link">Open in the Inbox</Link></dd></> : null}
      </dl>

      {c.kind === 'voicemail' ? (
        <section className="hq-field">
          <h3 className="hq-field-label">Voicemail, 0:{String(c.seconds).padStart(2, '0')}</h3>
          <button type="button" className="hq-btn hq-play" aria-disabled="true" title="Playing voicemails comes when DH Phone is connected">▶ Play</button>
          <p className="hq-transcript">{c.transcript}</p>
          <p className="hq-muted hq-small">Written out automatically, so it may have small mistakes.</p>
        </section>
      ) : null}

      {c.kind === 'text' ? (
        <section className="hq-field">
          <h3 className="hq-field-label">{c.direction === 'in' ? 'Their text' : 'Our text'}</h3>
          <div className="hq-bubble is-in">{c.body}</div>
          {c.reply ? <div className="hq-bubble is-out">{c.reply}</div> : null}
        </section>
      ) : null}

      {texting ? (
        <form className="hq-field" onSubmit={sendText}>
          <label htmlFor="hq-call-text">Text to {maskNumber(c.number)}</label>
          <textarea id="hq-call-text" rows={3} value={text} onChange={(e) => { setText(e.target.value); setError('') }} placeholder="Write a text…" />
          {error ? <p className="hq-error" role="alert">{error}</p> : null}
          <div className="hq-call-send">
            <span className="hq-example-tag">Example: not really sent</span>
            <button type="submit" className="hq-btn hq-btn-primary">Send text</button>
          </div>
        </form>
      ) : null}

      {c.log.length ? (
        <section className="hq-field">
          <h3 className="hq-field-label">What's been done</h3>
          <ul className="hq-call-log">
            {c.log.map((entry) => (
              <li key={entry.id}>
                <span className="hq-row-when">{dayTime(entry.at)}</span> {entry.text}
                {entry.jobId ? <> · <Link to={`/hq/jobs?job=${entry.jobId}`} className="hq-text-link">Open job</Link></> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </SidePanel>
  )
}

/* ---------------- Page ---------------- */

export default function Phone() {
  const me = useMe()
  const { calls: rawCalls, conversations } = useHQStore()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'all'
  const openId = params.get('call')

  useEffect(() => { document.title = 'Phone · DH HQ' }, [])

  // A call linked to an Inbox item takes its open/done from there.
  const calls = useMemo(() => rawCalls.map((c) => {
    const conv = c.conversationId ? conversations.find((x) => x.id === c.conversationId) : null
    if (!conv) return c
    const fromName = /\d/.test(conv.from) ? null : conv.from
    return { ...c, status: conv.status === 'done' ? 'done' : 'open', fromName }
  }), [rawCalls, conversations])

  const list = useMemo(
    () => calls.filter(TABS.find((t) => t.id === tab).test).sort((a, b) => b.at.localeCompare(a.at)),
    [calls, tab],
  )
  const open = calls.find((c) => c.id === openId) || null

  const setParam = useCallback((changes) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
      return next
    })
  }, [setParams])
  const close = useCallback(() => setParam({ call: null }), [setParam])

  const log = (id, text, extra = {}) => setCalls((all) => all.map((c) => (
    c.id === id ? { ...c, log: [...c.log, { id: `l-${Date.now()}`, at: nowIso(), text, ...extra }] } : c
  )))

  const onDone = (id) => {
    const c = calls.find((x) => x.id === id)
    const doneNow = c.status !== 'done'
    const words = doneNow ? `Marked done by ${firstName(me)}` : `Reopened by ${firstName(me)}`
    if (c.conversationId) {
      setConversations((all) => all.map((x) => (x.id === c.conversationId ? {
        ...x,
        status: doneNow ? 'done' : 'open',
        messages: [...x.messages, { id: `e-${Date.now()}`, kind: 'event', at: nowIso(), body: `${words} from Phone` }],
      } : x)))
    } else {
      setCalls((all) => all.map((x) => (x.id === id ? { ...x, status: doneNow ? 'done' : 'open' } : x)))
    }
    log(id, words)
  }

  const onMakeJob = (id) => {
    const c = calls.find((x) => x.id === id)
    const { name, client } = whoFor(c)
    const jobId = `job-${Date.now()}`
    setJobs((all) => [...all, {
      id: jobId,
      title: c.kind === 'text' ? `Answer ${name}'s text` : `Call back ${name}`,
      clientId: client?.id || null,
      assignee: me?.id || null,
      due: addDays(EXAMPLE_TODAY, 1),
      done: false,
      visibleToClient: false,
      notes: c.kind === 'voicemail' ? `Voicemail: ${c.transcript}` : c.kind === 'text' ? `Text: ${c.body}` : `Missed call from ${maskNumber(c.number)}`,
      checklist: [],
    }])
    setCalls((all) => all.map((x) => (x.id === id ? { ...x, jobId } : x)))
    log(id, `Job made by ${firstName(me)}, due tomorrow`, { jobId })
  }

  // The strip of four.
  const missedToday = calls.filter((c) => isMissed(c) && c.at.slice(0, 10) === EXAMPLE_TODAY && c.status !== 'done')
  const voicemails = calls.filter((c) => c.kind === 'voicemail' && c.status !== 'done')
  const texts = calls.filter((c) => c.kind === 'text' && c.direction === 'in' && c.status !== 'done')
  const line = lineStatus()
  const todayDay = new Date().getDay()

  return (
    <>
      <PageHeader title="Phone" sub={longDate(EXAMPLE_TODAY)} />
      <StatStrip
        items={[
          { label: 'Missed today', phoneLabel: 'missed', value: missedToday.length, tone: missedToday.length ? 'bad' : null, note: missedToday.length ? 'not dealt with' : null },
          { label: 'Voicemails to listen to', phoneLabel: 'voicemails', value: voicemails.length },
          { label: 'Texts to answer', phoneLabel: 'texts', value: texts.length },
          { label: 'Line', phoneLabel: 'line', value: line.label, note: line.note },
        ]}
      />

      <div className="hq-today-grid">
        <Panel title="Calls" className="hq-phone-calls">
          <nav className="hq-panel-tabs" aria-label="Show">
            {TABS.map((t) => {
              const count = calls.filter(t.test).length
              return (
                <Link
                  key={t.id}
                  to={{ search: t.id === 'all' ? '' : `?tab=${t.id}` }}
                  replace
                  className={tab === t.id ? 'is-on' : undefined}
                  aria-current={tab === t.id ? 'page' : undefined}
                >
                  {t.label} <span className="hq-tab-count">{count}</span>
                </Link>
              )
            })}
          </nav>
          {list.length === 0 ? <PanelEmpty>Nothing here.</PanelEmpty> : null}
          {list.map((c) => {
            const { name } = whoFor(c)
            const search = new URLSearchParams()
            if (tab !== 'all') search.set('tab', tab)
            search.set('call', c.id)
            return (
              <Row
                key={c.id}
                to={`?${search.toString()}`}
                lead={<SourceTag source={c.kind} />}
                title={name}
                detail={whatFor(c)}
                meta={<RowTag c={c} />}
                when={dayTime(c.at)}
                whenShort={dayShort(c.at)}
                label={`${name}: ${whatFor(c)}`}
              />
            )
          })}
        </Panel>

        <div className="hq-stack">
          <Panel title="Who's answering">
            {phoneAnswering.map((a) => {
              const person = findStaff(a.staffId)
              return (
                <Row
                  key={a.staffId}
                  lead={<Avatar name={person.name} initials={person.initials} tone={person.tone} />}
                  title={person.name}
                  detail={a.note || null}
                  meta={a.available ? <StatusTag tone="ok">Available</StatusTag> : <StatusTag tone="mute">Off</StatusTag>}
                />
              )
            })}
          </Panel>
          <Panel title="Opening hours">
            <Row
              title="Monday to Friday"
              meta={<span className="hq-mono-sm">9:00 to 17:00</span>}
              detail={todayDay >= 1 && todayDay <= 5 ? '(today)' : null}
            />
            <Row
              title="Saturday and Sunday"
              meta={<span className="hq-muted">Closed</span>}
              detail={todayDay === 0 || todayDay === 6 ? '(today)' : null}
            />
          </Panel>
          <p className="hq-muted hq-small">
            <Link to="/phone" className="hq-text-link">Open the full phone screen</Link>
          </p>
        </div>
      </div>

      {open ? (
        <CallDetail
          key={open.id}
          c={open}
          me={me}
          onClose={close}
          onDone={onDone}
          onMakeJob={onMakeJob}
          onLog={(id, text) => log(id, text)}
        />
      ) : null}
    </>
  )
}
