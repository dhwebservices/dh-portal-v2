import { useSyncExternalStore } from 'react'
import { jobs as exampleJobs, jobNotes, conversations as exampleConversations } from './exampleData'

// On-screen state shared by HQ pages (Inbox, Jobs) so that, for example,
// "Make a job" in the Inbox shows up on the Jobs screen.
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
