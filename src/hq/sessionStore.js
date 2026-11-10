import { useSyncExternalStore } from 'react'
import {
  jobs as exampleJobs,
  jobNotes,
  conversations as exampleConversations,
  clients as exampleClients,
  phoneCalls,
} from './exampleData'

// On-screen state shared by HQ pages so that, for example, "Make a job" in the
// Inbox shows up on the Jobs screen, and a lead added from the New menu shows
// up in Clients and in search.
//
// It lives in memory only: it survives moving between HQ pages, and resets
// when the page is refreshed. Nothing here is saved or sent anywhere.
// Phase 0 replaces this with the HQ API (/api/hq/*).

// Turn the example conversation into a list of messages for the thread view.
const messagesFor = (c) => {
  if (c.messages?.length) {
    return c.messages.map((m) => ({
      ...m,
      kind: m.kind === 'event' ? 'event' : m.direction === 'out' ? 'out' : 'in',
    }))
  }
  return [{ id: `${c.id}-1`, kind: 'in', who: c.from.split(',')[0], at: c.receivedAt, body: c.preview }]
}

let state = {
  jobs: exampleJobs.map((j) => ({
    ...j,
    notes: jobNotes[j.id] || '',
    checklist: j.checklist.map((item) => ({ ...item })),
  })),
  conversations: exampleConversations.map((c) => ({ ...c, messages: messagesFor(c) })),
  clients: [...exampleClients],
  calls: phoneCalls.map((c) => ({ ...c, log: [] })),
}

const listeners = new Set()
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener) }
const getState = () => state

export function updateStore(change) {
  state = { ...state, ...change(state) }
  listeners.forEach((listener) => listener())
}

export function useHQStore() {
  return useSyncExternalStore(subscribe, getState)
}

export const setJobs = (fn) => updateStore((s) => ({ jobs: fn(s.jobs) }))
export const setConversations = (fn) => updateStore((s) => ({ conversations: fn(s.conversations) }))

// The time now as '2026-11-10T09:30:00', the format the example data uses.
export const nowIso = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

const slug = (text) => String(text).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lead'

// Add a lead to the Clients list. Returns the new client's id.
// It is also added to the example clients list itself, so every screen that
// looks a client up by id (findClient) finds it too.
export function addLead({ name, type, town, owner }) {
  let id = slug(name)
  let n = 2
  while (state.clients.some((c) => c.id === id)) id = `${slug(name)}-${n++}`
  const lead = {
    id,
    name: name.trim(),
    type: type.trim() || 'Business',
    town: town.trim() || 'Town not known yet',
    domain: null,
    status: 'lead',
    plan: null,
    monthly: null,
    clientSince: null,
    owner: owner || null,
    site: null,
    visitors30d: null,
    owes: 0,
    nextCharge: null,
    contacts: [],
    addedOnScreen: true,
  }
  exampleClients.push(lead)
  updateStore((s) => ({ clients: [...s.clients, lead] }))
  return id
}

// Add an internal note to the Inbox, for one person. Returns its id.
export function addNote({ to, from, clientId, body }) {
  const at = nowIso()
  const text = body.trim()
  const firstLine = text.split('\n')[0]
  const id = `note-${Date.now()}`
  const note = {
    id,
    source: 'note',
    clientId: clientId || null,
    from: `Note from ${from}`,
    subject: firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine,
    preview: text,
    receivedAt: at,
    assignee: to,
    status: 'open',
    messages: [{ id: `${id}-1`, kind: 'note', who: from, at, body: text }],
  }
  updateStore((s) => ({ conversations: [...s.conversations, note] }))
  return id
}

export const setCalls = (fn) => updateStore((s) => ({ calls: fn(s.calls) }))
