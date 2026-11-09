// Example data for DH HQ screens.
//
// Everything here is MADE UP. The businesses, people, phone numbers and emails
// are invented: phone numbers use Ofcom's 01632 960xxx drama range and emails
// use example.com, so none of them reach a real person. Never put real client
// details in this file: the repo is public.
//
// Screens read from here until phase 0 adds the HQ API (/api/hq/*). Any screen
// that uses this file must show the small "Example data" label.
//
// Dates are set around Monday 9 November 2026, the "today" of the mockups.

export const EXAMPLE_TODAY = '2026-11-09'

// Our side. Ids match the `assignee` fields below.
export const staff = [
  { id: 'dh', name: 'David Hooper', initials: 'DH' },
  { id: 'jd', name: 'Jack Deane', initials: 'JD' },
]

// status: 'lead' | 'proposal' | 'client' | 'past'
// plan: 'dh-local' (monthly) | 'care-plan' | 'build-only' | null
export const clients = [
  {
    id: 'red-kite-inn',
    name: 'The Red Kite Inn',
    type: 'Pub',
    town: 'Pontypridd',
    domain: 'redkiteinn.example.com',
    status: 'client',
    plan: 'care-plan',
    monthly: 42,
    clientSince: '2026-10-01',
    owner: 'jd',
    site: { status: 'up', checkedMinutesAgo: 4, sslExpires: '2027-01-14' },
    visitors30d: 412,
    owes: 0,
    nextCharge: '2026-12-01',
    contacts: [
      { id: 'c1', name: 'Gareth Pryce', role: 'owner', email: 'gareth@example.com', phone: '01632 960101', clientArea: true },
      { id: 'c2', name: 'Ffion Lewis', role: 'team', email: 'ffion@example.com', phone: '01632 960102', clientArea: true },
    ],
  },
  {
    id: 'cwm-coffee',
    name: 'Cwm Coffee House',
    type: 'Café',
    town: 'Porth',
    domain: null,
    status: 'lead',
    plan: 'dh-local',
    monthly: 89,
    clientSince: null,
    owner: null,
    site: null,
    visitors30d: null,
    owes: 0,
    nextCharge: null,
    contacts: [
      { id: 'c3', name: 'Megan Rees', role: 'owner', email: 'megan@example.com', phone: '01632 960103', clientArea: false },
    ],
  },
  {
    id: 'glow-beauty',
    name: 'Glow Beauty Rooms',
    type: 'Salon',
    town: 'Treforest',
    domain: 'glowbeautyrooms.example.com',
    status: 'client',
    plan: 'dh-local',
    monthly: 89,
    clientSince: '2026-06-12',
    owner: 'dh',
    site: { status: 'up', checkedMinutesAgo: 6, sslExpires: '2027-03-02' },
    visitors30d: 268,
    owes: 89,
    nextCharge: '2026-11-12',
    contacts: [
      { id: 'c4', name: 'Carys Morgan', role: 'owner', email: 'carys@example.com', phone: '01632 960104', clientArea: true },
    ],
  },
  {
    id: 'valley-barbers',
    name: 'Valley Barbers',
    type: 'Barber',
    town: 'Tonypandy',
    domain: null,
    status: 'lead',
    plan: null,
    monthly: null,
    clientSince: null,
    owner: 'jd',
    site: null,
    visitors30d: null,
    owes: 0,
    nextCharge: null,
    contacts: [
      { id: 'c5', name: 'Rhys Evans', role: 'owner', email: 'rhys@example.com', phone: '01632 960105', clientArea: false },
    ],
  },
  {
    id: 'bay-caravans',
    name: 'Bayview Caravan Hire',
    type: 'Holiday lets',
    town: 'Porthcawl',
    domain: null,
    status: 'proposal',
    plan: 'build-only',
    monthly: null,
    clientSince: null,
    owner: 'dh',
    site: null,
    visitors30d: null,
    owes: 0,
    nextCharge: null,
    contacts: [
      { id: 'c6', name: 'Owen Jenkins', role: 'owner', email: 'owen@example.com', phone: '01632 960106', clientArea: false },
    ],
  },
]

// One row per inbox conversation.
// source: 'call' | 'voicemail' | 'text' | 'email' | 'website' | 'client' | 'app' | 'payment' | 'booking'
// status: 'open' | 'snoozed' | 'done'
// assignee: a staff id, or null for Unassigned
export const conversations = [
  {
    id: 'm1',
    source: 'call',
    clientId: null,
    from: '01632 960199',
    subject: 'Missed call',
    preview: 'Missed call, 2 rings, no voicemail. Not a known number.',
    receivedAt: '2026-11-06T17:42:00',
    assignee: null,
    status: 'open',
  },
  {
    id: 'm2',
    source: 'client',
    clientId: 'red-kite-inn',
    from: 'Ffion, The Red Kite Inn',
    subject: 'Quiz night on What\'s on',
    preview: 'Can we add the quiz night to What\'s on? Every Thursday from 8. Poster attached.',
    receivedAt: '2026-11-07T11:05:00',
    assignee: 'jd',
    status: 'open',
    tag: 'Change request',
    messages: [
      { id: 'm2a', who: 'Ffion', direction: 'in', at: '2026-11-07T11:05:00', body: 'Hiya, can we add the quiz night to What\'s on? Every Thursday from 8. Poster attached.', attachments: [{ name: 'quiz-poster.jpg', size: '1.2 MB' }] },
      { id: 'm2b', kind: 'event', at: '2026-11-07T11:20:00', body: 'Assigned to Jack by David' },
      { id: 'm2c', who: 'Jack', direction: 'out', at: '2026-11-07T11:31:00', channel: 'client area and email', body: 'Thanks Ffion, we\'ll have it up by Monday lunchtime.' },
    ],
  },
  {
    id: 'm3',
    source: 'website',
    clientId: 'cwm-coffee',
    from: 'Cwm Coffee House',
    subject: 'New brief',
    preview: 'New brief: menu, opening hours, take bookings by phone. Budget: Monthly (DH Local).',
    receivedAt: '2026-11-08T20:14:00',
    assignee: null,
    status: 'open',
  },
  {
    id: 'm4',
    source: 'voicemail',
    clientId: null,
    from: 'Dylan, Treforest',
    subject: 'Voicemail, 0:41',
    preview: '"Hi, ringing about the eighty-nine pound website, can you call me back…"',
    receivedAt: '2026-11-08T10:31:00',
    assignee: null,
    status: 'open',
  },
  {
    id: 'm5',
    source: 'app',
    clientId: null,
    from: 'Bill Pal review, 2★',
    subject: 'App Store review',
    preview: 'Can\'t add my partner to a bill.',
    receivedAt: '2026-11-08T09:02:00',
    assignee: 'dh',
    status: 'open',
  },
  {
    id: 'm6',
    source: 'email',
    clientId: 'bay-caravans',
    from: 'Owen, Bayview Caravan Hire',
    subject: 'Re: your quote',
    preview: 'Thanks for the quote. Could we start in January instead?',
    receivedAt: '2026-11-07T16:40:00',
    assignee: 'dh',
    status: 'open',
  },
  {
    id: 'm7',
    source: 'payment',
    clientId: 'glow-beauty',
    from: 'Stripe',
    subject: 'Payment failed',
    preview: 'DH Local payment failed: card declined (Glow Beauty Rooms).',
    receivedAt: '2026-11-07T09:12:00',
    assignee: 'dh',
    status: 'snoozed',
    tag: 'Action',
  },
  {
    id: 'm8',
    source: 'text',
    clientId: 'valley-barbers',
    from: 'Rhys, Valley Barbers',
    subject: 'Text',
    preview: 'Still on for 11 today?',
    receivedAt: '2026-11-09T08:15:00',
    assignee: 'jd',
    status: 'done',
  },
]

// Jobs with checklists. visibleToClient: the client can see progress in the client area.
export const jobs = [
  {
    id: 'j1',
    title: 'Quiz night on What\'s on',
    clientId: 'red-kite-inn',
    due: '2026-11-09',
    assignee: 'jd',
    done: false,
    visibleToClient: true,
    checklist: [
      { id: 'j1a', text: 'Add the event to What\'s on', done: false },
      { id: 'j1b', text: 'Add the poster', done: false },
      { id: 'j1c', text: 'Reply to Ffion', done: true },
    ],
  },
  {
    id: 'j2',
    title: 'Day 3: build pages',
    clientId: 'cwm-coffee',
    template: 'DH Local build, 7 days',
    due: '2026-11-11',
    assignee: 'jd',
    done: false,
    visibleToClient: true,
    checklist: [
      { id: 'j2a', text: 'Home page', done: false },
      { id: 'j2b', text: 'Menu page', done: false },
      { id: 'j2c', text: 'Contact and opening hours', done: false },
    ],
  },
  {
    id: 'j3',
    title: 'Send renewal reminder',
    clientId: 'glow-beauty',
    due: '2026-11-06',
    assignee: 'dh',
    done: true,
    visibleToClient: false,
    checklist: [],
  },
  {
    id: 'j4',
    title: 'Write the proposal',
    clientId: 'bay-caravans',
    due: '2026-11-05',
    assignee: 'dh',
    done: false,
    visibleToClient: false,
    checklist: [
      { id: 'j4a', text: 'Price the booking calendar', done: true },
      { id: 'j4b', text: 'Send the proposal', done: false },
    ],
  },
  {
    id: 'j5',
    title: 'Update card details page',
    clientId: 'glow-beauty',
    due: '2026-11-13',
    assignee: 'jd',
    done: false,
    visibleToClient: false,
    checklist: [],
  },
]

export const bookings = [
  { id: 'b1', date: '2026-11-09', time: '11:00', title: 'Free call', clientName: 'Valley Barbers', minutes: 30, assignee: 'jd' },
  { id: 'b2', date: '2026-11-09', time: '14:30', title: 'Handover', clientName: 'Cwm Coffee House', minutes: 45, assignee: 'dh' },
  { id: 'b3', date: '2026-11-10', time: '10:00', title: 'Free call', clientName: 'Bayview Caravan Hire', minutes: 30, assignee: 'dh' },
]

// Money, in pounds. For the Money screen and the Today strip.
export const money = {
  month: 'November',
  paidIn: 1428,
  due: 2206,
  lastMonthPaidIn: 1960,
  subscriptions: { dhLocal: 9, carePlans: 6 },
  overdue: [{ clientId: 'glow-beauty', amount: 89, reason: 'Card declined' }],
}

// storeStatus: 'live' | 'waiting' | 'rejected'
export const apps = [
  { id: 'bill-pal', name: 'Bill Pal', version: '2.3.1', storeStatus: 'live', rating: 4.4, newReviews: 1 },
  { id: 'fam-and-a-half', name: 'Fam & a Half', version: '1.8.0', storeStatus: 'live', rating: 4.7, newReviews: 0 },
  { id: 'fish-tank', name: 'Fish Tank', version: '1.2.4', storeStatus: 'live', rating: 4.2, newReviews: 0 },
  { id: 'crossword', name: 'CrossWord', version: '1.0.0', storeStatus: 'waiting', waitingDays: 7, rating: null, newReviews: 0 },
  { id: 'hush', name: 'Hush', version: '1.1.0', storeStatus: 'live', rating: 4.5, newReviews: 0 },
]

// ---- Helpers for counts in the menu ----

export const findClient = (id) => clients.find((c) => c.id === id) || null
export const findStaff = (id) => staff.find((s) => s.id === id) || null

// Open (not snoozed or done) conversations: the Inbox count.
export const openConversations = () => conversations.filter((c) => c.status === 'open')

// Jobs not done and due within the week of EXAMPLE_TODAY (Mon–Sun), plus overdue ones.
export const jobsDueThisWeek = () => jobs.filter((j) => !j.done && j.due <= '2026-11-15')

// Apps that need someone to look: waiting at a store, or new reviews.
export const appsNeedingAttention = () => apps.filter((a) => a.storeStatus !== 'live' || a.newReviews > 0)
