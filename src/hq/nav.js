import { openConversations, jobsDueThisWeek, appsNeedingAttention } from './exampleData'

// The HQ menu, in order. `old: true` links leave HQ for an existing portal page
// until that section is rebuilt in HQ.
// countTone: 'alert' is the red count (needs a reply), 'quiet' is the grey one.
export const mainNav = [
  { id: 'today', label: 'Today', to: '/hq', end: true },
  { id: 'inbox', label: 'Inbox', to: '/hq/inbox', count: () => openConversations().length, countTone: 'alert' },
  { id: 'clients', label: 'Clients', to: '/hq/clients' },
  { id: 'jobs', label: 'Jobs', to: '/hq/jobs', count: () => jobsDueThisWeek().length, countTone: 'quiet' },
  { id: 'money', label: 'Money', to: '/hq/money' },
  { id: 'apps', label: 'Apps', to: '/hq/apps', count: () => appsNeedingAttention().length, countTone: 'quiet' },
]

export const businessNav = [
  { id: 'phone', label: 'Phone', to: '/hq/phone' },
  { id: 'team', label: 'Team', to: '/people', old: true },
  { id: 'library', label: 'Library', to: '/knowledge-base', old: true },
  { id: 'settings', label: 'Settings', to: '/settings', old: true },
]
