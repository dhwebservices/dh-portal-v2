import { useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SidePanel from './SidePanel'
import { staff } from '../exampleData'
import { addLead, addNote, useHQStore } from '../sessionStore'
import useMe from '../useMe'

// The two small forms behind the New menu: "New lead" and "Note to someone".
// Shown in a side panel on whichever page you're on (?create=lead / ?create=note).
// On screen only, until the page is refreshed (see sessionStore.js).

function NewLead({ me, onClose, onDone }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [town, setTown] = useState('')
  const [owner, setOwner] = useState(me?.id || '')
  const [error, setError] = useState('')

  const submit = (event) => {
    event.preventDefault()
    if (!name.trim()) { setError('Give the business a name.'); return }
    const id = addLead({ name, type, town, owner })
    onDone(`/hq/clients/${id}`)
  }

  return (
    <SidePanel
      title="New lead"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="hq-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="hq-new-lead" className="hq-btn hq-btn-primary">Add lead</button>
        </>
      }
    >
      <form id="hq-new-lead" onSubmit={submit} noValidate>
        <div className="hq-field">
          <label htmlFor="hq-lead-name">Business</label>
          <input id="hq-lead-name" type="text" value={name} autoComplete="off" onChange={(e) => { setName(e.target.value); setError('') }} placeholder="e.g. The Bluebell Café" />
        </div>
        <div className="hq-field">
          <label htmlFor="hq-lead-type">Type of business</label>
          <input id="hq-lead-type" type="text" value={type} autoComplete="off" onChange={(e) => setType(e.target.value)} placeholder="e.g. Café, Plumber, Salon" />
        </div>
        <div className="hq-field">
          <label htmlFor="hq-lead-town">Town</label>
          <input id="hq-lead-town" type="text" value={town} autoComplete="off" onChange={(e) => setTown(e.target.value)} placeholder="e.g. Pontypridd" />
        </div>
        <div className="hq-field">
          <label htmlFor="hq-lead-owner">Who looks after it</label>
          <select id="hq-lead-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">No one yet</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <p className="hq-muted">It goes into Clients as a Lead. Add people and details from its page.</p>
        {error ? <p className="hq-error" role="alert">{error}</p> : null}
      </form>
    </SidePanel>
  )
}

function NoteToSomeone({ me, onClose, onDone }) {
  const { clients } = useHQStore()
  // Default to the other person: you rarely leave a note for yourself.
  const [to, setTo] = useState(staff.find((s) => s.id !== me?.id)?.id || staff[0].id)
  const [clientId, setClientId] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')

  const submit = (event) => {
    event.preventDefault()
    if (!body.trim()) { setError('Write the note first.'); return }
    const from = me ? me.name.split(' ')[0] : 'You'
    const id = addNote({ to, from, clientId, body })
    onDone(`/hq/inbox?item=${id}&view=${me && to === me.id ? 'mine' : 'open'}`)
  }

  return (
    <SidePanel
      title="Note to someone"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="hq-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="hq-new-note" className="hq-btn hq-btn-primary">Add note</button>
        </>
      }
    >
      <form id="hq-new-note" onSubmit={submit} noValidate>
        <div className="hq-field">
          <label htmlFor="hq-note-to">For</label>
          <select id="hq-note-to" value={to} onChange={(e) => setTo(e.target.value)}>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{me && s.id === me.id ? ' (you)' : ''}</option>)}
          </select>
        </div>
        <div className="hq-field">
          <label htmlFor="hq-note-client">About a client</label>
          <select id="hq-note-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client</option>
            {clients.filter((c) => c.status !== 'past').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="hq-field">
          <label htmlFor="hq-note-body">Note</label>
          <textarea id="hq-note-body" rows={5} value={body} onChange={(e) => { setBody(e.target.value); setError('') }} placeholder="e.g. Can you call Megan back about the menu photos?" />
        </div>
        <p className="hq-muted">It goes into their Inbox as an internal note. Only the team sees it.</p>
        {error ? <p className="hq-error" role="alert">{error}</p> : null}
      </form>
    </SidePanel>
  )
}

export default function QuickCreate() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const me = useMe()
  const kind = params.get('create')

  const close = useCallback(() => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('create')
      return next
    }, { replace: true })
  }, [setParams])

  // Replace the "?create=" step in history, so Back doesn't reopen the form.
  const done = (to) => navigate(to, { replace: true })

  if (kind === 'lead') return <NewLead me={me} onClose={close} onDone={done} />
  if (kind === 'note') return <NoteToSomeone me={me} onClose={close} onDone={done} />
  return null
}
