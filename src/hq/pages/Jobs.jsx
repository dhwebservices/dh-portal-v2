import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import PageHeader from '../components/PageHeader'
import Panel from '../components/Panel'
import StatusTag from '../components/StatusTag'
import Avatar from '../components/Avatar'
import SidePanel from '../components/SidePanel'
import {
  EXAMPLE_TODAY,
  staff,
  clients,
  jobTemplates,
  findClient,
  findStaff,
} from '../exampleData'
import { addDays, dayDate, endOfWeek, longDate } from '../format'
import { useHQStore, setJobs } from '../sessionStore'

// Jobs: work to do, grouped Overdue / This week / Later / Done, for me or everyone.
// The open job lives in the address (?job=j1) so Today's links open it here.
// Ticks, notes and new jobs are kept on screen only until the page is refreshed
// (see sessionStore.js; saving comes with the HQ API in phase 0).

const WEEK_END = endOfWeek(EXAMPLE_TODAY)

const groupOf = (job) => {
  if (job.done) return 'done'
  if (job.due < EXAMPLE_TODAY) return 'overdue'
  if (job.due <= WEEK_END) return 'week'
  return 'later'
}

const GROUPS = [
  { id: 'overdue', label: 'Overdue', empty: 'Nothing overdue.' },
  { id: 'week', label: 'This week', empty: 'Nothing else due this week.' },
  { id: 'later', label: 'Later', empty: 'Nothing planned for later.' },
  { id: 'done', label: 'Done', empty: 'Nothing ticked off yet.' },
]

function useMe() {
  const { user } = useAuth()
  const name = String(user?.name || '').trim().toLowerCase()
  return staff.find((s) => s.name.toLowerCase() === name) || null
}

function StaffAvatar({ id }) {
  const person = findStaff(id)
  if (!person) return <StatusTag tone="mute">Unassigned</StatusTag>
  return <Avatar name={person.name} initials={person.initials} tone={person.tone} />
}

/* ---------------- One row ---------------- */

function JobRow({ job, onToggle, onOpen, isOpen }) {
  const client = findClient(job.clientId)
  const dueToday = !job.done && job.due === EXAMPLE_TODAY
  const steps = job.checklist.length
  const stepsDone = job.checklist.filter((c) => c.done).length
  return (
    <div className={`hq-row hq-job-row${isOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className={`hq-check-btn${job.done ? ' is-done' : ''}`}
        aria-pressed={job.done}
        aria-label={job.done ? `Mark "${job.title}" as not done` : `Mark "${job.title}" as done`}
        onClick={() => onToggle(job.id)}
      />
      <button type="button" className="hq-job-open" onClick={() => onOpen(job.id)} aria-label={`Open "${job.title}"`}>
        <span className={`hq-row-text${job.done ? ' is-done' : ''}`}>
          <b>{job.title}</b>
          {client ? <span className="hq-row-detail"> {client.name}</span> : null}
          {client ? <span className="hq-show-phone hq-cell-sub">{client.name}</span> : null}
        </span>
        <span className="hq-row-meta">
          {steps ? <span className="hq-steps hq-hide-phone">{stepsDone}/{steps}</span> : null}
          {dueToday ? <StatusTag tone="bad">Due today</StatusTag> : null}
          <StaffAvatar id={job.assignee} />
        </span>
        <span className="hq-row-when hq-job-due">{dayDate(job.due)}</span>
      </button>
    </div>
  )
}

/* ---------------- Job detail ---------------- */

function JobDetail({ job, onClose, onChange, onToggle }) {
  const client = findClient(job.clientId)
  const person = findStaff(job.assignee)
  const stepsDone = job.checklist.filter((c) => c.done).length

  const setItem = (itemId, done) => onChange(job.id, {
    checklist: job.checklist.map((c) => (c.id === itemId ? { ...c, done } : c)),
  })

  return (
    <SidePanel
      title={job.title}
      onClose={onClose}
      footer={
        <button type="button" className={`hq-btn${job.done ? '' : ' hq-btn-primary'}`} onClick={() => onToggle(job.id)}>
          {job.done ? 'Mark as not done' : 'Mark as done'}
        </button>
      }
    >
      <dl className="hq-kv">
        <dt>Client</dt>
        <dd>{client ? <Link to={`/hq/clients/${client.id}`} className="hq-text-link">{client.name}</Link> : 'No client'}</dd>
        <dt>Who has it</dt>
        <dd>{person ? <span className="hq-person"><StaffAvatar id={job.assignee} />{person.name}</span> : 'Unassigned'}</dd>
        <dt>Status</dt>
        <dd>
          {job.done ? <StatusTag tone="ok">Done</StatusTag>
            : job.due < EXAMPLE_TODAY ? <StatusTag tone="bad">Overdue</StatusTag>
              : job.due === EXAMPLE_TODAY ? <StatusTag tone="bad">Due today</StatusTag>
                : <StatusTag tone="mute">Open</StatusTag>}
        </dd>
        {job.template ? <><dt>Template</dt><dd>{job.template}</dd></> : null}
        {job.visibleToClient ? <><dt>Client sees</dt><dd>Progress, in the client area</dd></> : null}
      </dl>

      <div className="hq-field">
        <label htmlFor="hq-job-due">Due date</label>
        <input
          id="hq-job-due"
          type="date"
          value={job.due}
          onChange={(e) => e.target.value && onChange(job.id, { due: e.target.value })}
        />
      </div>

      <fieldset className="hq-field">
        <legend>
          Checklist {job.checklist.length ? <span className="hq-muted">· {stepsDone} of {job.checklist.length} done</span> : null}
        </legend>
        {job.checklist.length === 0 ? <p className="hq-muted">No checklist for this job.</p> : (
          <ul className="hq-checklist">
            {job.checklist.map((item) => (
              <li key={item.id}>
                <label>
                  <input type="checkbox" checked={item.done} onChange={(e) => setItem(item.id, e.target.checked)} />
                  <span className={item.done ? 'hq-done' : undefined}>{item.text}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="hq-field">
        <label htmlFor="hq-job-notes">Notes</label>
        <textarea
          id="hq-job-notes"
          rows={5}
          value={job.notes}
          placeholder="Anything the next person needs to know"
          onChange={(e) => onChange(job.id, { notes: e.target.value })}
        />
      </div>
    </SidePanel>
  )
}

/* ---------------- New job ---------------- */

function NewJob({ me, onClose, onCreate }) {
  const [templateId, setTemplateId] = useState('')
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [assignee, setAssignee] = useState(me?.id || '')
  const [date, setDate] = useState(EXAMPLE_TODAY)
  const [error, setError] = useState('')

  const template = jobTemplates.find((t) => t.id === templateId) || null
  const client = findClient(clientId)

  const submit = (event) => {
    event.preventDefault()
    if (!template && !title.trim()) {
      setError('Give the job a name.')
      return
    }
    if (!date) {
      setError(template ? 'Pick a start date.' : 'Pick a due date.')
      return
    }
    const stamp = Date.now()
    const base = { clientId: clientId || null, assignee: assignee || null, done: false, visibleToClient: false, notes: '', checklist: [] }
    const created = template
      ? template.steps.map((step, i) => ({
        ...base,
        id: `new-${stamp}-${i + 1}`,
        title: `Day ${i + 1}: ${step}`,
        template: template.name,
        due: addDays(date, i),
        visibleToClient: true,
      }))
      : [{ ...base, id: `new-${stamp}`, title: title.trim(), due: date }]
    onCreate(created)
  }

  return (
    <SidePanel
      title="New job"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="hq-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="hq-new-job" className="hq-btn hq-btn-primary">
            {template ? `Add ${template.steps.length} jobs` : 'Add job'}
          </button>
        </>
      }
    >
      <form id="hq-new-job" onSubmit={submit} noValidate>
        <div className="hq-field">
          <label htmlFor="hq-new-template">Start from</label>
          <select id="hq-new-template" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setError('') }}>
            <option value="">A blank job</option>
            {jobTemplates.map((t) => <option key={t.id} value={t.id}>Template: {t.name}</option>)}
          </select>
        </div>

        {!template ? (
          <div className="hq-field">
            <label htmlFor="hq-new-title">Job name</label>
            <input id="hq-new-title" type="text" value={title} onChange={(e) => { setTitle(e.target.value); setError('') }} placeholder="e.g. Update the Christmas opening hours" />
          </div>
        ) : null}

        <div className="hq-field">
          <label htmlFor="hq-new-client">Client</label>
          <select id="hq-new-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client</option>
            {clients.filter((c) => c.status !== 'past').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="hq-field">
          <label htmlFor="hq-new-who">Who has it</label>
          <select id="hq-new-who" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="hq-field">
          <label htmlFor="hq-new-date">{template ? 'Start date (Day 1)' : 'Due date'}</label>
          <input id="hq-new-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setError('') }} />
        </div>

        {template ? (
          <div className="hq-field">
            <p className="hq-field-label">These jobs will be added{client ? ` for ${client.name}` : ''}</p>
            <ol className="hq-preview-list">
              {template.steps.map((step, i) => (
                <li key={i}>
                  <span className="hq-row-when">{date ? dayDate(addDays(date, i)) : '—'}</span>
                  <span>Day {i + 1}: {step}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {error ? <p className="hq-error" role="alert">{error}</p> : null}
      </form>
    </SidePanel>
  )
}

/* ---------------- Page ---------------- */

export default function Jobs() {
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const { jobs: list } = useHQStore()
  const setList = setJobs
  const [message, setMessage] = useState('')

  const who = params.get('who') === 'everyone' || !me ? 'everyone' : 'mine'
  const openId = params.get('job')
  const creating = params.get('new') === '1'

  useEffect(() => { document.title = 'Jobs · DH HQ' }, [])

  const setParam = useCallback((changes) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
      return next
    })
  }, [setParams])

  const close = useCallback(() => setParam({ job: null, new: null }), [setParam])

  const change = (id, patch) => setList((jobs) => jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)))
  const toggle = (id) => setList((jobs) => jobs.map((j) => (j.id === id ? { ...j, done: !j.done } : j)))

  const create = (created) => {
    setList((jobs) => [...jobs, ...created])
    const client = findClient(created[0].clientId)
    setMessage(created.length > 1
      ? `Added ${created.length} jobs${client ? ` for ${client.name}` : ''}.`
      : `Added "${created[0].title}".`)
    const mineOnly = who === 'mine' && created.some((j) => j.assignee !== me?.id)
    setParam({ new: null, job: null, who: mineOnly ? 'everyone' : params.get('who') })
  }

  const shown = useMemo(
    () => (who === 'mine' ? list.filter((j) => j.assignee === me?.id) : list),
    [list, who, me],
  )
  const grouped = useMemo(() => {
    const out = { overdue: [], week: [], later: [], done: [] }
    shown.forEach((j) => out[groupOf(j)].push(j))
    Object.keys(out).forEach((k) => out[k].sort((a, b) => (k === 'done' ? b.due.localeCompare(a.due) : a.due.localeCompare(b.due))))
    return out
  }, [shown])

  const openJob = list.find((j) => j.id === openId) || null
  const mineCount = me ? list.filter((j) => j.assignee === me.id && !j.done).length : 0
  const allCount = list.filter((j) => !j.done).length

  return (
    <>
      <PageHeader title="Jobs" sub={longDate(EXAMPLE_TODAY)} />

      <div className="hq-toolbar">
        <div className="hq-filters" role="group" aria-label="Whose jobs">
          <button
            type="button"
            className={`hq-filter${who === 'mine' ? ' is-on' : ''}`}
            aria-pressed={who === 'mine'}
            disabled={!me}
            title={me ? undefined : 'We couldn\'t match your sign-in to a team member'}
            onClick={() => setParam({ who: null })}
          >
            Mine <span className="hq-filter-count">{mineCount}</span>
          </button>
          <button
            type="button"
            className={`hq-filter${who === 'everyone' ? ' is-on' : ''}`}
            aria-pressed={who === 'everyone'}
            onClick={() => setParam({ who: 'everyone' })}
          >
            Everyone's <span className="hq-filter-count">{allCount}</span>
          </button>
        </div>
        <button type="button" className="hq-btn" onClick={() => setParam({ new: '1', job: null })}>New job</button>
      </div>

      <p className="hq-note" role="status">{message}</p>

      <div className="hq-job-groups">
        {GROUPS.map((g) => (
          <Panel
            key={g.id}
            title={<>{g.label} <span className="hq-group-count">{grouped[g.id].length}</span></>}
            className={`hq-job-group hq-job-group-${g.id}`}
          >
            {grouped[g.id].length === 0 ? <p className="hq-panel-empty">{g.empty}</p> : null}
            {grouped[g.id].map((job) => (
              <JobRow
                key={job.id}
                job={job}
                isOpen={job.id === openId}
                onToggle={toggle}
                onOpen={(id) => setParam({ job: id, new: null })}
              />
            ))}
          </Panel>
        ))}
      </div>

      {creating ? <NewJob me={me} onClose={close} onCreate={create} /> : null}
      {!creating && openJob ? <JobDetail key={openJob.id} job={openJob} onClose={close} onChange={change} onToggle={toggle} /> : null}
    </>
  )
}
