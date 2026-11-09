import { EXAMPLE_TODAY } from './exampleData'
import { endOfWeek } from './format'

// One set of rules for "how many", used by Today, the menu, Inbox and Jobs,
// so the numbers always agree. Each takes the on-screen lists from
// sessionStore (so ticks and "Done" show up straight away) and the signed-in
// person from useMe(). With no match for the signed-in person (me = null),
// "mine" falls back to everyone's, as the Inbox and Jobs screens do.

export const WEEK_END = endOfWeek(EXAMPLE_TODAY)

const isMine = (item, me) => !me || item.assignee === me.id

// Inbox "Mine": open and assigned to me.
export const myOpenConversations = (conversations, me) =>
  conversations.filter((c) => c.status === 'open' && isMine(c, me))

export const openConversationsOf = (conversations) => conversations.filter((c) => c.status === 'open')

const isCall = (c) => c.source === 'call' || c.source === 'voicemail'

// Inbox "Mine" with the "Calls & voicemail" source.
export const myMissedCalls = (conversations, me) => myOpenConversations(conversations, me).filter(isCall)

// Missed calls no one has picked up yet (shown as a note beside "mine").
export const unassignedMissedCalls = (conversations) =>
  openConversationsOf(conversations).filter((c) => isCall(c) && !c.assignee)

// Jobs "Mine": the Overdue and This week groups (not done, due by Sunday).
export const myJobsDueThisWeek = (jobs, me) =>
  jobs.filter((j) => !j.done && j.due <= WEEK_END && isMine(j, me))

export const isOverdue = (job) => !job.done && job.due < EXAMPLE_TODAY
