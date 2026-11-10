import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import NoteBody from '../components/NoteBody'
import { libraryGroups, findStaff } from '../exampleData'
import { fullDate } from '../format'
import { useHQStore, setNotes, nowIso } from '../sessionStore'
import useMe from '../useMe'

// Library: how we do things. Groups on the left, the notes in the group in the
// middle, the open note on the right. Search covers titles and words in every
// group. Edit and New note work on screen only, until the page is refreshed.
// What's open lives in the address: ?group=build&note=n1&q=domain.
// On phones: groups, then the list, then the note full screen with Back.

const PASSWORD_LINE = 'Never put passwords here. Say where the login lives instead.'

// Stops the most obvious slips: "password: …", "pwd=…", "pin 1234".
const looksLikeASecret = (text) =>
  /\b(pass ?word|passwd|pwd|pin|passcode)\b\s*(is|:|=|-)\s*\S+/i.test(text)

const isPhone = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767.98px)').matches

const matches = (note, words) => {
  const text = `${note.title} ${note.body}`.toLowerCase()
  return words.every((w) => text.includes(w))
}

/* ---------------- The open note ---------------- */

function NoteEditor({ note, isNew, onSave, onCancel }) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [error, setError] = useState('')

  const save = (event) => {
    event.preventDefault()
    if (!title.trim()) { setError('Give the note a title.'); return }
    if (looksLikeASecret(`${title}\n${body}`)) {
      setError('This looks like it has a password or PIN in it. Take it out and say where the login lives instead.')
      return
    }
    onSave({ title: title.trim(), body: body.replace(/\s+$/, '') })
  }

  return (
    <form className="hq-note-edit" onSubmit={save}>
      <div className="hq-field">
        <label htmlFor="hq-note-title">Title</label>
        <input id="hq-note-title" type="text" value={title} onChange={(e) => { setTitle(e.target.value); setError('') }} placeholder="e.g. Moving a domain" autoFocus={isNew} />
      </div>
      <div className="hq-field hq-note-edit-body">
        <label htmlFor="hq-note-text">Note</label>
        <textarea
          id="hq-note-text"
          value={body}
          onChange={(e) => { setBody(e.target.value); setError('') }}
          placeholder={'## A heading\n1. A numbered step\n2. The next step\n- A bullet point\n\nA blank line starts a new paragraph. **Two stars** make words bold.'}
          autoFocus={!isNew}
        />
        <p className="hq-muted hq-small">## for a heading · 1. for a step · - for a bullet · **bold** · blank line for a new paragraph</p>
      </div>
      {error ? <p className="hq-error" role="alert">{error}</p> : null}
      <div className="hq-note-edit-actions">
        <button type="button" className="hq-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="hq-btn hq-btn-primary">Save</button>
      </div>
    </form>
  )
}

function NoteView({ note, editing, isNew, groupLabel, onBack, onEdit, onSave, onCancel }) {
  const author = findStaff(note.author)
  const editor = findStaff(note.editedBy)
  return (
    <article className="hq-libnote" aria-label={isNew ? 'New note' : note.title}>
      <header className="hq-note-hd">
        <button type="button" className="hq-btn hq-note-back" onClick={onBack}>← {groupLabel}</button>
        {!editing ? (
          <div className="hq-note-titlebar">
            <h1>{note.title}</h1>
            <button type="button" className="hq-btn" onClick={onEdit}>Edit</button>
          </div>
        ) : (
          <h1>{isNew ? 'New note' : `Editing: ${note.title}`}</h1>
        )}
        {!isNew ? (
          <p className="hq-muted hq-small">
            {groupLabel} · Written by {author ? author.name : 'someone'}
            {' · '}Last changed {fullDate(note.updatedAt)}{editor && note.editedBy !== note.author ? ` by ${editor.name}` : ''}
          </p>
        ) : null}
      </header>
      <p className="hq-note-warning">{PASSWORD_LINE}</p>
      <div className="hq-note-scroll">
        {editing
          ? <NoteEditor key={note.id} note={note} isNew={isNew} onSave={onSave} onCancel={onCancel} />
          : <NoteBody body={note.body} />}
      </div>
    </article>
  )
}

/* ---------------- Page ---------------- */

export default function Library() {
  const me = useMe()
  const { notes } = useHQStore()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState(false)

  const q = params.get('q') || ''
  const groupParam = params.get('group')
  const noteId = params.get('note')
  const isNew = noteId === 'new'
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const searching = words.length > 0

  // Desktop always has a group open; phones start on the list of groups.
  const groupId = libraryGroups.some((g) => g.id === groupParam) ? groupParam : (isPhone() ? null : libraryGroups[0].id)
  const group = libraryGroups.find((g) => g.id === groupId) || null

  useEffect(() => { document.title = 'Library · DH HQ' }, [])

  const setParam = useCallback((changes, replace = false) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
      return next
    }, { replace })
  }, [setParams])

  const list = useMemo(() => {
    const base = searching ? notes.filter((n) => matches(n, words)) : notes.filter((n) => n.groupId === groupId)
    return [...base].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [notes, searching, groupId, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => Object.fromEntries(libraryGroups.map((g) => [g.id, notes.filter((n) => n.groupId === g.id).length])), [notes])

  const blankNote = { id: 'new', groupId: groupId || libraryGroups[0].id, title: '', body: '', author: me?.id || null, updatedAt: nowIso() }
  const open = isNew ? blankNote : notes.find((n) => n.id === noteId) || null

  // Desktop: open the first note in the list when none is chosen.
  useEffect(() => {
    if (!isPhone() && !open && list.length && !isNew) setParam({ note: list[0].id }, true)
  }, [open, list, isNew, setParam])

  // Leaving a note (or opening another) ends editing.
  useEffect(() => { setEditing(isNew) }, [noteId, isNew])

  const save = ({ title, body }) => {
    if (isNew) {
      const id = `note-${Date.now()}`
      setNotes((all) => [...all, { ...blankNote, id, title, body, updatedAt: nowIso() }])
      setParam({ note: id, group: blankNote.groupId, q: null }, true)
    } else {
      setNotes((all) => all.map((n) => (n.id === open.id ? { ...n, title, body, updatedAt: nowIso(), editedBy: me?.id || n.editedBy } : n)))
    }
    setEditing(false)
  }

  const cancel = () => {
    setEditing(false)
    if (isNew) setParam({ note: null }, true)
  }

  const openGroupLabel = open ? libraryGroups.find((g) => g.id === open.groupId)?.label || 'Library' : 'Library'
  const view = open ? 'note' : group || searching ? 'list' : 'groups' // which column phones show

  return (
    <div className={`hq-library is-${view}`}>
      <div className="hq-library-top">
        <label className="hq-search hq-library-search">
          <span className="hq-visually-hidden">Search the library</span>
          <input
            type="search"
            value={q}
            placeholder="Search notes: titles and words"
            onChange={(e) => setParam({ q: e.target.value || null, note: null }, true)}
          />
        </label>
        <button type="button" className="hq-btn" onClick={() => setParam({ note: 'new', group: groupId || libraryGroups[0].id })}>New note</button>
      </div>

      <nav className="hq-library-groups" aria-label="Library groups">
        <h2 className="hq-inbox-lab">Groups</h2>
        {libraryGroups.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`hq-inbox-f${!searching && g.id === groupId ? ' is-on' : ''}`}
            aria-pressed={!searching && g.id === groupId}
            onClick={() => setParam({ group: g.id, note: null, q: null })}
          >
            <span>{g.label}</span><i>{counts[g.id]}</i>
          </button>
        ))}
      </nav>

      <div className="hq-library-list">
        <div className="hq-library-listhd">
          <button type="button" className="hq-btn hq-library-back" onClick={() => setParam({ group: null, note: null, q: null })}>← Groups</button>
          <h2>{searching ? `Notes matching "${q.trim()}"` : group?.label || 'Notes'}</h2>
        </div>
        {list.length === 0 ? (
          <p className="hq-panel-empty">{searching ? `Nothing found for "${q.trim()}". Try fewer or different words.` : 'No notes in this group yet. Press New note to write one.'}</p>
        ) : null}
        <ul aria-label="Notes">
          {list.map((n) => {
            const author = findStaff(n.author)
            return (
              <li key={n.id}>
                <button
                  type="button"
                  className={`hq-msg${open && n.id === open.id ? ' is-on' : ''}`}
                  aria-current={open && n.id === open.id ? 'true' : undefined}
                  onClick={() => setParam({ note: n.id, group: n.groupId })}
                >
                  <span className="hq-msg-l1"><b>{n.title}</b></span>
                  <span className="hq-msg-l2 hq-muted">
                    {author ? author.name : 'Someone'} · changed {fullDate(n.updatedAt)}
                    {searching ? ` · ${libraryGroups.find((g) => g.id === n.groupId)?.label}` : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {open ? (
        <NoteView
          key={open.id}
          note={open}
          isNew={isNew}
          editing={editing || isNew}
          groupLabel={openGroupLabel}
          onBack={() => (editing && !isNew ? setEditing(false) : setParam({ note: null }))}
          onEdit={() => setEditing(true)}
          onSave={save}
          onCancel={cancel}
        />
      ) : (
        <div className="hq-libnote hq-libnote-empty hq-hide-phone"><p className="hq-muted">Pick a note from the list.</p></div>
      )}
    </div>
  )
}
