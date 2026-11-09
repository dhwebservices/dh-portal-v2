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
// "Now" for the example data: 9am on EXAMPLE_TODAY. Used for "Over a day" and similar.
export const EXAMPLE_NOW = '2026-11-09T09:00:00'

// Our side. Ids match the `assignee` fields below.
// tone picks the avatar colour (see Avatar.jsx).
export const staff = [
  { id: 'dh', name: 'David Hooper', initials: 'DH', tone: 'ink' },
  { id: 'jd', name: 'Jack Deane', initials: 'JD', tone: 'blue' },
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
  {
    id: 'hilltop-grooming',
    name: 'Hilltop Dog Grooming',
    type: 'Dog groomer',
    town: 'Llantrisant',
    domain: 'hilltopgrooming.example.com',
    status: 'past',
    plan: null,
    monthly: null,
    clientSince: '2025-03-04',
    owner: 'dh',
    site: null,
    visitors30d: null,
    owes: 0,
    nextCharge: null,
    contacts: [
      { id: 'c7', name: 'Sian Thomas', role: 'owner', email: 'sian@example.com', phone: '01632 960107', clientArea: false },
    ],
  },
]

// Stage names and colours for client.status. Always shown as a word.
export const STAGES = [
  { id: 'lead', label: 'Lead', tone: 'info' },
  { id: 'proposal', label: 'Proposal sent', tone: 'warn' },
  { id: 'client', label: 'Client', tone: 'ok' },
  { id: 'past', label: 'Past', tone: 'mute' },
]
export const stageFor = (status) => STAGES.find((s) => s.id === status) || { id: status, label: status, tone: 'mute' }

export const PLAN_LABELS = {
  'dh-local': 'DH Local',
  'care-plan': 'Care plan',
  'build-only': 'Build only',
}

// Visitors per day for the last 30 days (oldest first), for sites we look after.
// Made up, but steady enough to look like a small local business.
const dailyVisitors = (total, seed) => {
  const raw = Array.from({ length: 30 }, (_, i) => {
    const weekend = [5, 6].includes((i + 2) % 7) ? 1.35 : 1
    const wobble = 0.75 + (((i * 37 + seed * 11) % 23) / 23) * 0.5
    const growth = 0.8 + (i / 29) * 0.4
    return weekend * wobble * growth
  })
  const sum = raw.reduce((a, b) => a + b, 0)
  const days = raw.map((v) => Math.max(1, Math.round((v / sum) * total)))
  days[29] += total - days.reduce((a, b) => a + b, 0)
  return days
}
export const visitorsDaily = {
  'red-kite-inn': dailyVisitors(412, 3),
  'glow-beauty': dailyVisitors(268, 7),
}

// Change requests from clients (from the client area, email or a call).
// status: 'new' | 'being-done' | 'done'
export const requests = [
  { id: 'r1', clientId: 'red-kite-inn', title: 'Quiz night on What\'s on', askedBy: 'Ffion Lewis', askedAt: '2026-11-07T11:05:00', status: 'being-done', conversationId: 'm2' },
  { id: 'r2', clientId: 'red-kite-inn', title: 'New Sunday opening hours', askedBy: 'Gareth Pryce', askedAt: '2026-10-30T09:40:00', status: 'done' },
  { id: 'r3', clientId: 'glow-beauty', title: 'Add the Christmas gift vouchers page', askedBy: 'Carys Morgan', askedAt: '2026-11-04T15:20:00', status: 'new' },
]

// Invoices and receipts. status: 'paid' | 'due' | 'overdue'
export const invoices = [
  { id: 'INV-1042', clientId: 'red-kite-inn', date: '2026-11-02', description: 'Care plan, November', amount: 42, status: 'paid' },
  { id: 'INV-1031', clientId: 'red-kite-inn', date: '2026-10-23', description: 'Website build, balance', amount: 450, status: 'paid' },
  { id: 'INV-1019', clientId: 'red-kite-inn', date: '2026-10-01', description: 'Website build, deposit', amount: 300, status: 'paid' },
  { id: 'INV-1045', clientId: 'glow-beauty', date: '2026-11-05', description: 'DH Local, November', amount: 89, status: 'overdue' },
  { id: 'INV-1036', clientId: 'glow-beauty', date: '2026-10-05', description: 'DH Local, October', amount: 89, status: 'paid' },
  { id: 'INV-0870', clientId: 'hilltop-grooming', date: '2025-03-04', description: 'Website build', amount: 600, status: 'paid' },
]

// Files we keep for a client (stored in R2 later).
export const files = [
  { id: 'f1', clientId: 'red-kite-inn', name: 'red-kite-logo.svg', size: '24 KB', addedAt: '2026-10-02', addedBy: 'Gareth Pryce' },
  { id: 'f2', clientId: 'red-kite-inn', name: 'quiz-poster.jpg', size: '1.2 MB', addedAt: '2026-11-07', addedBy: 'Ffion Lewis' },
  { id: 'f3', clientId: 'red-kite-inn', name: 'handover-pack.pdf', size: '860 KB', addedAt: '2026-10-28', addedBy: 'Jack Deane' },
  { id: 'f4', clientId: 'glow-beauty', name: 'salon-photos.zip', size: '14 MB', addedAt: '2026-06-15', addedBy: 'Carys Morgan' },
]

// Proposals and agreements. status: 'draft' | 'sent' | 'signed'
export const agreements = [
  { id: 'a1', clientId: 'red-kite-inn', title: 'Website proposal and care plan', sentAt: '2026-09-03', status: 'signed', signedBy: 'Gareth Pryce', signedAt: '2026-09-20' },
  { id: 'a2', clientId: 'glow-beauty', title: 'DH Local agreement', sentAt: '2026-06-08', status: 'signed', signedBy: 'Carys Morgan', signedAt: '2026-06-12' },
  { id: 'a3', clientId: 'bay-caravans', title: 'Website proposal: booking calendar', sentAt: '2026-11-03', status: 'sent' },
]

// Client history, newest first per client. source uses the same names as SourceTag.
export const activity = [
  { id: 'h1', clientId: 'red-kite-inn', at: '2026-11-07T11:05:00', source: 'client', text: 'Ffion asked for the quiz night on What\'s on' },
  { id: 'h2', clientId: 'red-kite-inn', at: '2026-11-02T08:00:00', source: 'payment', text: 'Care plan paid · £42.00' },
  { id: 'h3', clientId: 'red-kite-inn', at: '2026-10-30T09:40:00', source: 'email', text: 'Gareth asked for new Sunday opening hours' },
  { id: 'h4', clientId: 'red-kite-inn', at: '2026-10-28T16:00:00', source: 'job', text: 'Site launched on redkiteinn.example.com' },
  { id: 'h5', clientId: 'red-kite-inn', at: '2026-10-23T10:12:00', source: 'payment', text: 'Build paid in full' },
  { id: 'h6', clientId: 'red-kite-inn', at: '2026-09-20T19:30:00', source: 'agreement', text: 'Proposal accepted, signed online' },
  { id: 'h7', clientId: 'red-kite-inn', at: '2026-09-03T14:00:00', source: 'email', text: 'Proposal sent' },
  { id: 'h8', clientId: 'glow-beauty', at: '2026-11-07T09:12:00', source: 'payment', text: 'DH Local payment failed: card declined' },
  { id: 'h9', clientId: 'glow-beauty', at: '2026-11-04T15:20:00', source: 'client', text: 'Carys asked for a gift vouchers page' },
  { id: 'h10', clientId: 'glow-beauty', at: '2026-06-20T12:00:00', source: 'job', text: 'Site launched on glowbeautyrooms.example.com' },
  { id: 'h11', clientId: 'cwm-coffee', at: '2026-11-08T20:14:00', source: 'website', text: 'New brief from the website' },
  { id: 'h12', clientId: 'valley-barbers', at: '2026-11-09T08:15:00', source: 'text', text: 'Rhys texted to check today\'s free call' },
  { id: 'h13', clientId: 'valley-barbers', at: '2026-11-02T13:30:00', source: 'call', text: 'Rhys rang about a website, booked a free call' },
  { id: 'h14', clientId: 'bay-caravans', at: '2026-11-07T16:40:00', source: 'email', text: 'Owen replied to the quote' },
  { id: 'h15', clientId: 'bay-caravans', at: '2026-11-03T11:00:00', source: 'agreement', text: 'Proposal sent' },
  { id: 'h16', clientId: 'hilltop-grooming', at: '2026-08-14T10:00:00', source: 'email', text: 'Sian closed the business; site taken down' },
  { id: 'h17', clientId: 'hilltop-grooming', at: '2025-03-20T10:00:00', source: 'job', text: 'Site launched' },
]

// Sources that count as talking to the client, for "Last contact".
const CONTACT_SOURCES = ['client', 'email', 'call', 'voicemail', 'text', 'website', 'booking']

export const historyFor = (clientId) =>
  activity.filter((a) => a.clientId === clientId).sort((a, b) => b.at.localeCompare(a.at))

export const lastContactFor = (clientId) => {
  const times = historyFor(clientId).filter((a) => CONTACT_SOURCES.includes(a.source)).map((a) => a.at)
  return times.sort().pop() || null
}

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

// Notes on jobs, by job id. Kept apart so the job list above stays easy to read.
export const jobNotes = {
  j1: 'Poster is in Files. Thursdays from 8pm, every week until Christmas.',
  j2: 'Menu and opening hours came in with the brief. Photos still to come from Megan.',
  j4: 'Owen wants to start in January. Price the booking calendar as an extra.',
}

// Templates for repeat work. Each step becomes its own job, one day apart,
// starting on the day you pick.
export const jobTemplates = [
  {
    id: 'dh-local-7-days',
    name: 'DH Local build, 7 days',
    steps: [
      'Kick-off call and get words and photos',
      'Domain and Google listing',
      'Build pages',
      'Build pages',
      'Client check',
      'Changes',
      'Go live and send the review link',
    ],
  },
]

export const bookings = [
  { id: 'b1', date: '2026-11-09', time: '11:00', title: 'Free call', clientId: 'valley-barbers', clientName: 'Valley Barbers', minutes: 30, assignee: 'jd' },
  { id: 'b2', date: '2026-11-09', time: '14:30', title: 'Handover', clientId: 'cwm-coffee', clientName: 'Cwm Coffee House', minutes: 45, assignee: 'dh' },
  { id: 'b3', date: '2026-11-10', time: '10:00', title: 'Free call', clientId: 'bay-caravans', clientName: 'Bayview Caravan Hire', minutes: 30, assignee: 'dh' },
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

// Waiting more than 24 hours at EXAMPLE_NOW.
export const isOverADay = (iso) => new Date(EXAMPLE_NOW) - new Date(iso) > 24 * 60 * 60 * 1000

// Missed calls and voicemails still open.
export const missedCalls = () => openConversations().filter((c) => c.source === 'call' || c.source === 'voicemail')

export const bookingsOn = (date) => bookings.filter((b) => b.date === date).sort((a, b) => a.time.localeCompare(b.time))
