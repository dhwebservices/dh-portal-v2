import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apps, findClient, findStaff, stageFor } from '../exampleData'
import { useHQStore } from '../sessionStore'
import useMe from '../useMe'
import SourceTag from './SourceTag'
import StatusTag from './StatusTag'

// Top-bar search. Ctrl K (Cmd K on a Mac) or clicking the box opens a list
// under it; on phones it opens full screen. Finds clients, inbox conversations,
// jobs and apps (at most 5 of each). Up/Down move, Enter opens, Esc closes.
// Searches the on-screen lists, so new leads, notes and jobs are found too.

const PER_GROUP = 5
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '')

// Every word typed must appear somewhere in the item.
const matches = (words, ...fields) => {
  const text = fields.flat().filter(Boolean).join(' ').toLowerCase()
  return words.every((w) => text.includes(w))
}

function useResults(query) {
  const { clients, conversations, jobs } = useHQStore()
  const me = useMe()

  return useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []

    const clientHits = clients
      .filter((c) => matches(words, c.name, c.type, c.town, c.domain, c.contacts.map((p) => p.name)))
      .slice(0, PER_GROUP)
      .map((c) => {
        const stage = stageFor(c.status)
        return {
          key: `client-${c.id}`,
          to: `/hq/clients/${c.id}`,
          title: c.name,
          detail: `${c.type} · ${c.town}`,
          tag: <StatusTag tone={stage.tone}>{stage.label}</StatusTag>,
        }
      })

    const inboxHits = [...conversations]
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .filter((c) => matches(words, c.from, c.subject, c.preview, findClient(c.clientId)?.name))
      .slice(0, PER_GROUP)
      .map((c) => ({
        key: `inbox-${c.id}`,
        to: `/hq/inbox?item=${c.id}`,
        title: c.from,
        detail: c.subject,
        lead: <SourceTag source={c.source} />,
        tag: c.status === 'done' ? <StatusTag tone="ok">Done</StatusTag> : c.status === 'snoozed' ? <StatusTag tone="warn">Snoozed</StatusTag> : null,
      }))

    const jobHits = [...jobs]
      .sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due))
      .filter((j) => matches(words, j.title, j.template, j.notes, findClient(j.clientId)?.name, findStaff(j.assignee)?.name))
      .slice(0, PER_GROUP)
      .map((j) => ({
        key: `job-${j.id}`,
        // Jobs opens on "Mine": show everyone's when the job is someone else's.
        to: `/hq/jobs?job=${j.id}${me && j.assignee !== me.id ? '&who=everyone' : ''}`,
        title: j.title,
        detail: findClient(j.clientId)?.name || 'No client',
        tag: j.done ? <StatusTag tone="ok">Done</StatusTag> : null,
      }))

    const appHits = apps
      .filter((a) => matches(words, a.name, a.platforms))
      .slice(0, PER_GROUP)
      .map((a) => ({
        key: `app-${a.id}`,
        to: '/hq/apps',
        title: a.name,
        detail: a.platforms,
        tag: a.storeStatus === 'waiting' ? <StatusTag tone="warn">Waiting</StatusTag> : <StatusTag tone="ok">Live</StatusTag>,
      }))

    return [
      { id: 'clients', label: 'Clients', items: clientHits },
      { id: 'inbox', label: 'Inbox', items: inboxHits },
      { id: 'jobs', label: 'Jobs', items: jobHits },
      { id: 'apps', label: 'Apps', items: appHits },
    ].filter((g) => g.items.length)
  }, [query, clients, conversations, jobs, me])
}

export default function SearchBox({ onOpenChange }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listId = useId()

  const groups = useResults(query)
  const flat = groups.flatMap((g) => g.items)
  const optionId = (i) => `${listId}-opt-${i}`

  const show = (value) => { setOpen(value); onOpenChange?.(value) }
  const close = () => { show(false); inputRef.current?.blur() }

  // Ctrl K / Cmd K opens search from anywhere in HQ.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'k') {
        event.preventDefault()
        show(true)
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Clicking anywhere else closes the list.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (event) => { if (!wrapRef.current?.contains(event.target)) show(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setActive(0) }, [query])

  // Keep the highlighted result in view.
  useEffect(() => {
    if (open && flat.length) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' })
  }, [active, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (item) => {
    if (!item) return
    navigate(item.to)
    setQuery('')
    close()
  }

  const onKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    if (!open) show(true)
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => (flat.length ? (i + 1) % flat.length : 0)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0)) }
    if (event.key === 'Enter') { event.preventDefault(); go(flat[active]) }
  }

  let index = -1
  const trimmed = query.trim()

  return (
    <div ref={wrapRef} className={`hq-searchwrap${open ? ' is-open' : ''}`}>
      <div className="hq-search">
        <label className="hq-visually-hidden" htmlFor={`${listId}-input`}>Search clients, messages, jobs and apps</label>
        <input
          id={`${listId}-input`}
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && flat.length ? optionId(active) : undefined}
          placeholder="Search clients, messages, invoices"
          autoComplete="off"
          value={query}
          onChange={(e) => { setQuery(e.target.value); show(true) }}
          onFocus={() => show(true)}
          onClick={() => show(true)}
          onKeyDown={onKeyDown}
        />
        <span className="hq-kbd" aria-hidden="true">{IS_MAC ? '⌘ K' : 'Ctrl K'}</span>
        <button type="button" className="hq-search-cancel" onClick={() => { setQuery(''); close() }}>Cancel</button>
      </div>

      {open ? (
        <div className="hq-search-results" id={`${listId}-list`} role="listbox" aria-label="Search results">
          {!trimmed ? (
            <p className="hq-search-hint">Type to find clients, messages, jobs and apps.</p>
          ) : flat.length === 0 ? (
            <p className="hq-search-hint" role="status">Nothing found for "{trimmed}". Try a business name, a town or a person.</p>
          ) : (
            groups.map((g) => (
              <div key={g.id} role="group" aria-labelledby={`${listId}-${g.id}`} className="hq-search-group">
                <h2 id={`${listId}-${g.id}`} className="hq-search-head">{g.label}</h2>
                {g.items.map((item) => {
                  index += 1
                  const i = index
                  return (
                    <div
                      key={item.key}
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === active}
                      className={`hq-search-item${i === active ? ' is-active' : ''}`}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(item)}
                    >
                      {item.lead}
                      <span className="hq-row-text"><b>{item.title}</b> <span className="hq-row-detail">{item.detail}</span></span>
                      {item.tag}
                    </div>
                  )
                })}
              </div>
            ))
          )}
          {flat.length ? <p className="hq-search-keys hq-hide-phone">↑ ↓ to move · Enter to open · Esc to close</p> : null}
        </div>
      ) : null}
    </div>
  )
}
