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
  {
    id: 'taff-street-tattoo',
    name: 'Taff Street Tattoo',
    type: 'Tattoo studio',
    town: 'Pontypridd',
    domain: 'taffstreettattoo.example.com',
    status: 'client',
    plan: 'dh-local',
    monthly: 89,
    clientSince: '2026-08-01',
    owner: 'jd',
    site: { status: 'up', checkedMinutesAgo: 3, sslExpires: '2027-02-10' },
    visitors30d: 531,
    owes: 220,
    nextCharge: '2026-12-01',
    contacts: [
      { id: 'c8', name: 'Lowri Price', role: 'owner', email: 'lowri@example.com', phone: '01632 960109', clientArea: true },
    ],
  },
  {
    id: 'cefn-plumbing',
    name: 'Cefn Plumbing & Heating',
    type: 'Plumber',
    town: 'Caerphilly',
    domain: 'cefnplumbing.example.com',
    status: 'client',
    plan: 'care-plan',
    monthly: 42,
    clientSince: '2026-04-15',
    owner: 'dh',
    site: { status: 'up', checkedMinutesAgo: 5, sslExpires: '2027-04-01' },
    visitors30d: 189,
    owes: 120,
    nextCharge: '2026-12-01',
    contacts: [
      { id: 'c9', name: 'Huw Davies', role: 'owner', email: 'huw@example.com', phone: '01632 960110', clientArea: false },
    ],
  },
  {
    id: 'bracken-florist',
    name: 'Bracken & Bloom',
    type: 'Florist',
    town: 'Aberdare',
    domain: 'brackenandbloom.example.com',
    status: 'client',
    plan: 'care-plan',
    monthly: 42,
    clientSince: '2026-11-03',
    owner: 'jd',
    site: { status: 'up', checkedMinutesAgo: 2, sslExpires: '2027-11-03' },
    visitors30d: 74,
    owes: 0,
    nextCharge: '2026-12-03',
    contacts: [
      { id: 'c10', name: 'Nia Edwards', role: 'owner', email: 'nia@example.com', phone: '01632 960111', clientArea: true },
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

// Invoices and receipts. date: when it was sent. due: when it's due.
// status: 'paid' | 'due' | 'overdue'
export const invoices = [
  { id: 'INV-1048', clientId: 'cefn-plumbing', date: '2026-11-06', due: '2026-11-13', description: 'Extra page: emergency call-outs', amount: 120, status: 'due' },
  { id: 'INV-1047', clientId: 'cwm-coffee', date: '2026-11-06', due: '2026-11-16', description: 'DH Local set-up', amount: 199, status: 'due' },
  { id: 'INV-1046', clientId: 'taff-street-tattoo', date: '2026-11-04', due: '2026-11-18', description: 'Logo and signage artwork', amount: 220, status: 'due' },
  { id: 'INV-1045', clientId: 'glow-beauty', date: '2026-11-05', due: '2026-11-05', description: 'DH Local, November', amount: 89, status: 'overdue' },
  { id: 'INV-1044', clientId: 'bracken-florist', date: '2026-11-03', due: '2026-11-03', description: 'Care plan, November', amount: 42, status: 'paid' },
  { id: 'INV-1043', clientId: 'bracken-florist', date: '2026-11-03', due: '2026-11-03', description: 'Website build, balance', amount: 650, status: 'paid' },
  { id: 'INV-1042', clientId: 'red-kite-inn', date: '2026-11-02', due: '2026-11-02', description: 'Care plan, November', amount: 42, status: 'paid' },
  { id: 'INV-1041', clientId: 'taff-street-tattoo', date: '2026-11-01', due: '2026-11-01', description: 'DH Local, November', amount: 89, status: 'paid' },
  { id: 'INV-1040', clientId: 'cefn-plumbing', date: '2026-11-01', due: '2026-11-01', description: 'Care plan, November', amount: 42, status: 'paid' },
  { id: 'INV-1036', clientId: 'glow-beauty', date: '2026-10-05', due: '2026-10-05', description: 'DH Local, October', amount: 89, status: 'paid' },
  { id: 'INV-1031', clientId: 'red-kite-inn', date: '2026-10-23', due: '2026-10-23', description: 'Website build, balance', amount: 450, status: 'paid' },
  { id: 'INV-1019', clientId: 'red-kite-inn', date: '2026-10-01', due: '2026-10-01', description: 'Website build, deposit', amount: 300, status: 'paid' },
  { id: 'INV-0870', clientId: 'hilltop-grooming', date: '2025-03-04', due: '2025-03-04', description: 'Website build', amount: 600, status: 'paid' },
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
  { id: 'h18', clientId: 'taff-street-tattoo', at: '2026-11-04T12:30:00', source: 'email', text: 'Lowri approved the signage artwork' },
  { id: 'h19', clientId: 'taff-street-tattoo', at: '2026-11-01T06:00:00', source: 'payment', text: 'DH Local paid · £89.00' },
  { id: 'h20', clientId: 'cefn-plumbing', at: '2026-11-06T10:15:00', source: 'call', text: 'Huw asked for an emergency call-outs page' },
  { id: 'h21', clientId: 'cefn-plumbing', at: '2026-11-01T06:00:00', source: 'payment', text: 'Care plan paid · £42.00' },
  { id: 'h22', clientId: 'bracken-florist', at: '2026-11-03T15:00:00', source: 'job', text: 'Site launched on brackenandbloom.example.com' },
  { id: 'h23', clientId: 'bracken-florist', at: '2026-11-03T15:20:00', source: 'payment', text: 'Build paid in full' },
  { id: 'h24', clientId: 'bracken-florist', at: '2026-11-02T11:00:00', source: 'email', text: 'Nia signed off the final pages' },
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
    from: '01632 9·· ···',
    phone: '01632 960199',
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
    phone: '01632 960108',
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
    phone: '01632 960105',
    subject: 'Text',
    preview: 'Still on for 11 today?',
    receivedAt: '2026-11-09T08:15:00',
    assignee: 'jd',
    status: 'done',
  },
  {
    id: 'm9',
    source: 'call',
    clientId: null,
    from: '01632 9·· ···',
    phone: '01632 960150',
    subject: 'Missed call',
    preview: 'Missed call, 5 rings, no voicemail. Not a known number.',
    receivedAt: '2026-11-09T08:12:00',
    assignee: null,
    status: 'open',
  },
  {
    id: 'm10',
    source: 'voicemail',
    clientId: 'red-kite-inn',
    from: 'Gareth, The Red Kite Inn',
    phone: '01632 960101',
    subject: 'Voicemail, 0:28',
    preview: '"Morning, it\'s Gareth. The quiz poster has the wrong date on it…"',
    receivedAt: '2026-11-09T08:40:00',
    assignee: 'jd',
    status: 'open',
  },
  {
    id: 'm11',
    source: 'text',
    clientId: 'cefn-plumbing',
    from: 'Huw, Cefn Plumbing & Heating',
    phone: '01632 960110',
    subject: 'Text',
    preview: 'Can you add our new Gas Safe number to the site? It\'s on the van.',
    receivedAt: '2026-11-09T08:52:00',
    assignee: 'dh',
    status: 'open',
  },
]

// ---- DH Phone ----
// The phone log: calls in and out, voicemails and texts. Numbers are made up
// (Ofcom's 01632 960xxx drama range) and are always shown part-hidden.
//   kind: 'call' | 'voicemail' | 'text'
//   direction: 'in' | 'out'
//   outcome (calls): 'missed' | 'answered'
//   by / minutes: who answered or made the call, and how long it took
//   conversationId: the matching item in the Inbox, kept in step on screen
//   status: 'open' (still to deal with) | 'done'
export const phoneCalls = [
  { id: 'p1', kind: 'call', direction: 'in', number: '01632 960150', at: '2026-11-09T08:12:00', outcome: 'missed', rings: 5, status: 'open', conversationId: 'm9' },
  {
    id: 'p2', kind: 'voicemail', direction: 'in', number: '01632 960101', at: '2026-11-09T08:40:00', outcome: 'missed', status: 'open', conversationId: 'm10', seconds: 28,
    transcript: 'Morning, it\'s Gareth from the Red Kite. The quiz poster on the website has the wrong date on it, it says Wednesday but it\'s every Thursday. Can someone fix it before tonight? Cheers.',
  },
  { id: 'p3', kind: 'text', direction: 'in', number: '01632 960110', at: '2026-11-09T08:52:00', body: 'Can you add our new Gas Safe number to the site? It\'s on the van.', status: 'open', conversationId: 'm11' },
  { id: 'p4', kind: 'text', direction: 'in', number: '01632 960105', at: '2026-11-09T08:15:00', body: 'Still on for 11 today?', status: 'done', conversationId: 'm8', reply: 'Yes, see you at 11. Jack' },
  { id: 'p5', kind: 'call', direction: 'in', number: '01632 960109', at: '2026-11-07T10:20:00', outcome: 'answered', by: 'jd', minutes: 4, status: 'done' },
  {
    id: 'p6', kind: 'voicemail', direction: 'in', number: '01632 960108', at: '2026-11-08T10:31:00', outcome: 'missed', status: 'open', conversationId: 'm4', seconds: 41,
    transcript: 'Hi, ringing about the eighty-nine pound website, can you call me back? It\'s Dylan, I\'ve got a small gardening business in Treforest. Thanks.',
  },
  { id: 'p7', kind: 'call', direction: 'out', number: '01632 960106', at: '2026-11-06T15:05:00', outcome: 'answered', by: 'dh', minutes: 12, status: 'done' },
  { id: 'p8', kind: 'call', direction: 'in', number: '01632 960199', at: '2026-11-06T17:42:00', outcome: 'missed', rings: 2, status: 'open', conversationId: 'm1' },
  { id: 'p9', kind: 'call', direction: 'in', number: '01632 960104', at: '2026-11-05T11:48:00', outcome: 'answered', by: 'dh', minutes: 7, status: 'done' },
  { id: 'p10', kind: 'call', direction: 'in', number: '01632 960170', at: '2026-11-05T09:03:00', outcome: 'missed', rings: 3, status: 'done', note: 'Called back by David, wrong number' },
]

// Opening hours for the DH line. day: 0 = Sunday … 6 = Saturday.
export const phoneHours = [
  { day: 1, label: 'Monday', open: '09:00', close: '17:00' },
  { day: 2, label: 'Tuesday', open: '09:00', close: '17:00' },
  { day: 3, label: 'Wednesday', open: '09:00', close: '17:00' },
  { day: 4, label: 'Thursday', open: '09:00', close: '17:00' },
  { day: 5, label: 'Friday', open: '09:00', close: '17:00' },
  { day: 6, label: 'Saturday', open: null, close: null },
  { day: 0, label: 'Sunday', open: null, close: null },
]

// Who the line rings. available: true = Available, false = Off.
export const phoneAnswering = [
  { staffId: 'dh', available: true },
  { staffId: 'jd', available: false, note: 'Back at 11:00' },
]

// "01632 960150" → "01632 9·· ···". Numbers are never shown in full.
export const maskNumber = (number) => {
  const digits = String(number || '').replace(/\D/g, '')
  if (digits.length < 7) return '·· ···'
  return `${digits.slice(0, 5)} ${digits[5]}·· ···`
}

// The client a number belongs to, if we know it.
export const clientForNumber = (number) => {
  const digits = String(number || '').replace(/\D/g, '')
  return clients.find((c) => c.contacts.some((p) => String(p.phone).replace(/\D/g, '') === digits)) || null
}
export const contactForNumber = (number) => {
  const digits = String(number || '').replace(/\D/g, '')
  for (const c of clients) {
    const person = c.contacts.find((p) => String(p.phone).replace(/\D/g, '') === digits)
    if (person) return person
  }
  return null
}

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

// Money, in pounds. Everything is worked out from `invoices` above so the
// Money screen and the Today strip always agree.
const THIS_MONTH = EXAMPLE_TODAY.slice(0, 7) // '2026-11'
export const money = {
  month: 'November',
  // Paid invoices dated this month.
  paidIn: () => invoices.filter((i) => i.status === 'paid' && i.date.startsWith(THIS_MONTH)).reduce((s, i) => s + i.amount, 0),
  // Everything due this month, paid or not.
  dueThisMonth: () => invoices.filter((i) => i.due.startsWith(THIS_MONTH)).reduce((s, i) => s + i.amount, 0),
  owed: () => invoices.filter((i) => i.status !== 'paid'),
  overdue: () => invoices.filter((i) => i.status === 'overdue'),
}

// Monthly plans across clients (not past ones).
export const monthlyPlans = (plan) => clients.filter((c) => c.status === 'client' && c.plan === plan)

// Our apps. storeStatus: 'live' | 'waiting' | 'rejected'
//   waitingAt / waitingDays: which store has it and for how long
//   admin: where it's managed. 'iphone' = a screen in the staff iPhone app;
//          a path = a web page in the portal.
//   storeUrl: the public store page. Left empty in the example data: add the
//          real App Store / Google Play addresses with the real data.
export const apps = [
  { id: 'bill-pal', name: 'Bill Pal', platforms: 'iPhone and Android', version: '2.3.1', build: 87, builtAt: '2026-11-03', storeStatus: 'live', rating: 4.4, newReviews: 1, admin: 'iphone', storeUrl: null },
  { id: 'fam-and-a-half', name: 'Fam & a Half', platforms: 'iPhone', version: '1.8.0', build: 52, builtAt: '2026-10-28', storeStatus: 'live', rating: 4.7, newReviews: 0, admin: 'iphone', storeUrl: null },
  { id: 'fish-tank', name: 'Fish Tank', platforms: 'iPhone', version: '1.2.4', build: 31, builtAt: '2026-10-20', storeStatus: 'live', rating: 4.2, newReviews: 0, admin: 'iphone', storeUrl: null },
  { id: 'case-files', name: 'Case Files', platforms: 'iPhone', version: '1.0.0', build: 12, builtAt: '2026-11-02', storeStatus: 'waiting', waitingAt: 'Apple', waitingDays: 7, rating: null, newReviews: 0, admin: null, storeUrl: null },
  { id: 'staff-portal', name: 'Staff Portal', platforms: 'Web and iPhone', version: '3.4.0', build: 214, builtAt: '2026-11-08', storeStatus: 'live', rating: null, newReviews: 0, admin: '/dashboard', storeUrl: null, note: 'Staff only' },
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

// ---- Library ----
// How we do things. Example notes, written as general how-tos: no client names,
// phone numbers, emails, addresses or passwords, because the code is public.
// Note text uses a small, plain format:
//   ## Heading     ### Smaller heading
//   1. Numbered step
//   - Bullet point
//   **bold words**
//   A blank line starts a new paragraph.

export const libraryGroups = [
  { id: 'build', label: 'How we build' },
  { id: 'clients', label: 'Clients and support' },
  { id: 'phone', label: 'Phone and bookings' },
  { id: 'apps', label: 'Apps' },
  { id: 'office', label: 'Office' },
]

export const libraryNotes = [
  {
    id: 'n1',
    groupId: 'build',
    title: 'DH Local build, step by step',
    author: 'dh',
    updatedAt: '2026-11-03T16:20:00',
    body: `A DH Local site takes seven working days. Each day is its own job, so start it from the **DH Local build, 7 days** template on the Jobs screen.

## Before day 1
1. Check the agreement is signed and the set-up payment is in.
2. Book the kick-off call for the morning of day 1.

## The seven days
1. **Kick-off call.** Agree the pages, then ask for words and photos. If they have none, offer to write the words.
2. **Domain and Google listing.** Buy or move the domain, and claim or tidy their Google listing.
3. **Build pages.** Home, About and Contact first.
4. **Build pages.** The rest of the pages, then forms and the map.
5. **Client check.** Send the preview link and ask for one list of changes.
6. **Changes.** Make the changes from their list. Anything new becomes a separate job.
7. **Go live.** Follow the going-live checklist, then send the review link.

## Good to know
- Keep the client in the loop: they can see these jobs in the client area.
- Don't start day 3 until the words are in. Move the dates instead.`,
  },
  {
    id: 'n2',
    groupId: 'build',
    title: 'Going live checklist',
    author: 'jd',
    updatedAt: '2026-10-28T11:05:00',
    body: `Do these in order on go-live day. Tick each one off in the job.

1. Point the domain at the site and wait until it loads on your phone using mobile data.
2. Check the padlock shows (SSL) on the plain address and the www one.
3. Send a test message through every form and check it arrives.
4. Turn on visitor numbers so they show on the client's page in HQ.
5. Add the site to uptime checks.
6. Click every link on every page, on a phone and a laptop.
7. Send the client the review link and the handover pack.

## If something goes wrong
- Domain not loading after an hour: ask David before changing anything else.
- Form not arriving: check the spam folder first.`,
  },
  {
    id: 'n3',
    groupId: 'clients',
    title: 'Handling a change request',
    author: 'jd',
    updatedAt: '2026-11-05T09:40:00',
    body: `Change requests come in through the Inbox: from the client area, email, a text or a call.

## Steps
1. Assign it to yourself in the Inbox so no one else picks it up.
2. Reply the same day, even if it's only to say when it will be done.
3. If it takes more than ten minutes, press **Make a job** so it's on the Jobs screen.
4. Make the change, check it on a phone, then reply with what you changed.
5. Mark the Inbox item **Done**.

## What counts as a change
- Care plan and DH Local: small edits like text, photos, opening hours and events are included.
- New pages or new features: tell David before agreeing a price.`,
  },
  {
    id: 'n4',
    groupId: 'clients',
    title: 'When a card payment fails',
    author: 'dh',
    updatedAt: '2026-10-19T14:10:00',
    body: `Stripe tries a failed card again on its own over a few days. Most sort themselves out.

1. Wait two days after the first failure.
2. If it's still failing, send the friendly reminder email from the Money screen.
3. After a week, ring the client. Be kind: it's usually an expired card.
4. Never turn a site off without David agreeing first.

The client can update their card themselves from the Billing page in the client area.`,
  },
  {
    id: 'n5',
    groupId: 'phone',
    title: 'Answering the DH line',
    author: 'dh',
    updatedAt: '2026-11-02T10:00:00',
    body: `The line rings whoever is set to **Available** on the Phone screen, between 9:00 and 17:00 on weekdays.

## Answering
1. Say "DH Website Services, it's [your name] speaking".
2. Ask for their name and business, and check the Clients list while you talk.
3. If you can't help there and then, promise a time to call back and make a job.

## Missed calls and voicemails
- Missed calls land in the Inbox. Call back the same day.
- Voicemails are written out for you on the Phone screen. Listen as well if the words look odd.
- Unknown numbers: call back once. If no answer, send a short text.`,
  },
  {
    id: 'n6',
    groupId: 'phone',
    title: 'Booking a free call',
    author: 'jd',
    updatedAt: '2026-10-22T15:30:00',
    body: `Free calls are 30 minutes and are booked through the public booking page.

1. Send the person the booking link instead of picking a time for them.
2. When it's booked, it shows on Today under **Bookings today**.
3. Before the call, look the business up and note what their current site (if any) is missing.
4. After the call, add them as a lead with **New ▾ → New lead** if they're not already in Clients.
5. Send a short follow-up the same day.`,
  },
  {
    id: 'n7',
    groupId: 'apps',
    title: 'Releasing an app update',
    author: 'dh',
    updatedAt: '2026-11-01T18:45:00',
    body: `## Before you build
1. Put the version number up, and the build number up by one.
2. Write the "What's new" text in plain words.

## Sending it to Apple
1. Upload the build and wait for it to finish processing.
2. Test it on a real phone through TestFlight.
3. Submit it for review with the "What's new" text.
4. Apple usually takes one to three days. It shows as **Waiting** on the Apps screen.

## After it's live
- Check new reviews in the Inbox every day for a week.
- Reply to every review under three stars, politely, within two days.`,
  },
  {
    id: 'n8',
    groupId: 'office',
    title: 'Where logins live',
    author: 'dh',
    updatedAt: '2026-10-15T09:00:00',
    body: `Logins are never written in HQ, in notes, in jobs or in messages.

1. Every login lives in the team password manager.
2. If you need one you can't see, ask David to share it with you there.
3. In notes, write **where** the login lives, for example "Domain account: in the password manager, under Domains".
4. If you think a login has been seen by someone it shouldn't have, tell David straight away so it can be changed.`,
  },
  {
    id: 'n9',
    groupId: 'office',
    title: 'Start and end of the day',
    author: 'jd',
    updatedAt: '2026-11-04T08:30:00',
    body: `## Start of the day
1. Open Today in HQ.
2. Work through **Needs a reply**, oldest first.
3. Check **Bookings today** and get ready for each one.

## End of the day
1. Make sure nothing assigned to you is over a day old in the Inbox.
2. Tick off finished jobs.
3. Set yourself to **Off** on the Phone screen.`,
  },
]
