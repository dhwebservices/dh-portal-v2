// Dev-only (mobile-preview.html?mock=1): canned answers for every API the
// phone app calls, so signed-in screens can be checked in a browser. Imported
// first by mobilePreview.jsx so the fetch patch is in place before the
// Supabase client captures fetch. Never part of the production build.
const on = new URLSearchParams(window.location.search).get('mock')
const day = 86_400_000
const now = Date.now()
const iso = (ms) => new Date(ms).toISOString()
const dateOnly = (ms) => iso(ms).slice(0, 10)

const staff = [
  { id: 1, user_email: 'david@dhwebsiteservices.co.uk', email: 'david@dhwebsiteservices.co.uk', full_name: 'David Hooper', name: 'David Hooper', display_name: 'David Hooper', role: 'Director', department: 'Leadership', job_title: 'Director', phone: '01443 805303', status: 'active', start_date: '2024-01-01', created_at: iso(now - 400 * day) },
  { id: 2, user_email: 'jack@dhwebsiteservices.co.uk', email: 'jack@dhwebsiteservices.co.uk', full_name: 'Jack Deane', name: 'Jack Deane', display_name: 'Jack Deane', role: 'Assistant', department: 'Sales', job_title: 'Sales assistant', phone: '07700 900123', status: 'active', start_date: '2025-03-01', created_at: iso(now - 200 * day) },
]

const tables = {
  hr_profiles: staff,
  staff_profiles: staff,
  user_permissions: [{ user_email: 'jack@dhwebsiteservices.co.uk', permissions: { app_phone: true, rota: true } }],
  hr_leave: [
    { id: 1, user_email: 'jack@dhwebsiteservices.co.uk', user_name: 'Jack Deane', staff_name: 'Jack Deane', leave_type: 'Annual leave', type: 'annual', start_date: dateOnly(now + 9 * day), end_date: dateOnly(now + 11 * day), days: 3, status: 'pending', reason: 'Family trip', created_at: iso(now - 2 * day) },
    { id: 2, user_email: 'david@dhwebsiteservices.co.uk', user_name: 'David Hooper', staff_name: 'David Hooper', leave_type: 'Annual leave', type: 'annual', start_date: dateOnly(now - 20 * day), end_date: dateOnly(now - 19 * day), days: 2, status: 'approved', created_at: iso(now - 30 * day) },
  ],
  rota_shifts: [0, 1, 2, 3].map(i => ({ id: i + 1, user_email: i % 2 ? 'jack@dhwebsiteservices.co.uk' : 'david@dhwebsiteservices.co.uk', staff_name: i % 2 ? 'Jack Deane' : 'David Hooper', shift_date: dateOnly(now + i * day), date: dateOnly(now + i * day), start_time: '09:00', end_time: '17:00', role: 'Office', notes: '', status: 'published' })),
  shifts: [],
  timesheets: [0, 1, 2].map(i => ({ id: i + 1, user_email: 'david@dhwebsiteservices.co.uk', clock_in: iso(now - i * day - 8 * 3600e3), clock_out: iso(now - i * day), date: dateOnly(now - i * day), hours: 8, status: 'approved' })),
  clock_events: [],
  attendance: [],
  payslips: [{ id: 1, user_email: 'david@dhwebsiteservices.co.uk', period_start: dateOnly(now - 35 * day), period_end: dateOnly(now - 5 * day), pay_date: dateOnly(now - 3 * day), gross: 2100, net: 1730.5, tax: 250, ni: 119.5, status: 'issued', created_at: iso(now - 3 * day) }],
  notifications: [
    { id: 1, user_email: 'david@dhwebsiteservices.co.uk', title: 'Leave request', message: 'Jack asked for 3 days off', body: 'Jack asked for 3 days off', type: 'leave', read: false, created_at: iso(now - 3600e3) },
    { id: 2, user_email: 'david@dhwebsiteservices.co.uk', title: 'Shift published', message: 'Next week’s rota is out', body: 'Next week’s rota is out', type: 'rota', read: true, created_at: iso(now - 2 * day) },
  ],
  push_tokens: [{ id: 1, user_email: 'david@dhwebsiteservices.co.uk', platform: 'ios', device_name: 'iPhone', token: 'x', last_used: iso(now), created_at: iso(now - 30 * day) }],
  device_tokens: [{ id: 1, user_email: 'david@dhwebsiteservices.co.uk', platform: 'ios', device_name: 'iPhone', token: 'x', updated_at: iso(now), created_at: iso(now - 30 * day) }],
  onboarding_submissions: new URLSearchParams(window.location.search).get('only') === 'onboarding' ? [] : [{ id: 1, user_email: 'jack@dhwebsiteservices.co.uk', full_name: 'Jack Deane', status: 'submitted', submitted_at: iso(now - 5 * day), created_at: iso(now - 5 * day), data: {} }],
  user_preferences: [],
  user_devices: [{ id: 1, user_email: 'david@dhwebsiteservices.co.uk', device_name: 'iPhone', device_model: 'iPhone 16 Pro', app_version: '1.1', last_active: iso(now) }, { id: 2, user_email: 'david@dhwebsiteservices.co.uk', device_name: 'Old iPhone', device_model: 'iPhone 13', last_active: iso(now - 90 * day) }],
  outreach: [
    { id: 1, business_name: 'RCT Pride', contact_name: 'Natalie', status: 'interested', email: 'hello@example.org', phone: '', notes: '{"follow_up_date":"' + dateOnly(now) + '"}', created_at: iso(now - 6 * day), updated_at: iso(now - day) },
    { id: 2, business_name: 'Cwtch Bakery', contact_name: '', status: 'call', notes: '', created_at: iso(now - 9 * day) },
  ],
}

const mdmDevice = { udid: 'U1', name: 'iPhone (2)', model: 'iPhone 16 Pro', product: 'iPhone17,1', osVersion: '27.2.1', owner: 'David Hooper', email: 'david@dhwebsiteservices.co.uk', status: 'enrolled', supervised: false, infoAt: now - 3600e3, lastSeen: now - 1800e3, battery: 28, freeGB: 81.5, capacityGB: 256, serial: 'F2LXXXXXXX', passcode: true, encrypted: true, findMy: true, icloudBackup: true, lastBackup: now - day, securityAt: now - 3600e3, enrolledAt: now - 20 * day, apps: [{ id: 'a', name: 'DH Staff Portal', version: '1.1' }, { id: 'b', name: 'Fish Tank', version: '1.1' }], appsAt: now - day }
const mdm = {
  '/api/me': { isAdmin: true, pushReady: true, devices: [mdmDevice] },
  '/api/devices/U1': { device: mdmDevice, health: { worst: 'ok', checkedAt: now - 3600e3, checks: [{ key: 'os', status: 'ok', title: 'iOS is up to date' }, { key: 'pc', status: 'ok', title: 'Passcode set' }], largestApps: [{ name: 'Photos', sizeMB: 4200 }] }, commands: [{ uuid: 'c1', request_type: 'DeviceInformation', status: 'done', queued_at: now - 3600e3, queued_by: 'auto-refresh' }, { uuid: 'c2', request_type: 'DeviceLock', status: 'sent', queued_at: now - 7200e3, queued_by: 'david@dhwebsiteservices.co.uk' }] },
  '/api/devices': { devices: [mdmDevice, { ...mdmDevice, udid: 'U2', name: 'iPhone', owner: 'jack@dhwebsiteservices.co.uk', osVersion: '27.3', battery: 33, freeGB: 30.8, infoAt: now - 4 * 3600e3 }] },
}

const players = Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, username: `Player${i}`, platform: i % 2 ? 'ios' : 'android', created_at: now - i * day * 0.9, seen_at: now - (i % 7) * day, best_score: 100 * i, wins: 0, kills: 0, unclaimed: 0 }))
const fish = {
  '/operator/overview': { totals: { total: 14, banned: 0, new_24h: 1, new_7d: 6, active_24h: 1, active_7d: 12 }, platforms: [{ platform: 'ios', n: 7 }, { platform: 'android', n: 7 }], top: [], newest: [], crashes_7d: 0, push_devices: 9, stale: 2 },
  '/operator/players': players,
  '/operator/maintenance': { on: false, message: 'Due to a critical PHP code vulnerability affecting our servers we are closing the game for a short while' },
  '/operator/active': { counts: { last_hour: 0, today: 1, this_week: 12 }, recent: [] },
  '/operator/flags': { multiplayer: true, daily: true, leaderboard: true },
  '/operator/leaderboard': { board: 'alltime', rows: players.slice(0, 5).map((p, i) => ({ ...p, best_score: 5000 - i * 700 })) },
  '/operator/stale': players.slice(10, 12),
  '/operator/crashes': [{ id: 'c1', username: 'Player2', created_at: now - day, platform: 'android', app_version: '1.1.1', message: 'NullPointerException in TankView.onDraw', stack: 'at TankView.onDraw(TankView.kt:120)' }],
  '/operator/blocklist': { words: ['badword', 'another'] },
  '/operator/schedule': [{ id: 's1', title: 'Weekend tournament', body: 'Double coins all weekend', send_at: now + 2 * day, sent_at: null, player_ids: null }],
  '/operator/grants': [{ id: 'g1', kind: 'coins', amount: 500, username: 'Player3', created_at: now - day, claimed_at: now - 3600e3 }, { id: 'g2', kind: 'item', item_id: 'goldfish', username: 'Player5', created_at: now - 3600e3, claimed_at: null, note: 'Sorry for the bug' }],
  '/operator/catalogue': { fish: [{ id: 'goldfish', name: 'Goldfish', price: 100 }], upgrades: [{ id: 'filter', name: 'Better filter', price: 500 }] },
  '/operator/min-version': { ios: '', android: '' },
  '/operator/versions': [{ platform: 'ios', version: '1.1', players: 7 }, { platform: 'android', version: '1.1.1', players: 6 }, { platform: 'android', version: 'unknown', players: 1 }],
  '/operator/log': [{ id: 1, action: 'grant coins', operator: 'david@dhwebsiteservices.co.uk', created_at: now - day }],
}

// Portal API and Worker answers, matched on the end of the path.
const phoneUsers = [
  { id: 'u1', name: 'David Hooper', email: 'david@dhwebsiteservices.co.uk', sip_username: 'david', forward_to: '+447700900001', extension: '201', active: true, has_dialout_pin: true },
  { id: 'u2', name: 'Jack Deane', email: 'jack@dhwebsiteservices.co.uk', sip_username: 'jack', forward_to: '+447700900002', extension: '202', active: true },
]
const api = {
  '/api/billpal/overview': { pendingBills: 1, unreadChats: 2, liveBills: 4, clearedBills: 9, users: 37, suspended: 0, paidPence: 48250, paidCount: 6, reports: 0, betaSignups: 12, signups: 15, payments: 'on' },
  '/api/billpal/bills': { bills: [{ id: 'b1', firstName: 'Sam', kind: 'energy', supplier: 'Octopus', totalPence: 12450, paidPence: 3000, dueDate: '2026-12-10', reference: 'A-1234', area: 'Pontypridd', household: 3, posterEmail: 'sam@example.com', payeeVerified: true, hasImage: true, userId: 'u1' }] },
  '/api/findmygang/overview': { users: 128, new_7d: 9, active_24h: 41, circles: 33, devices: 96, sos_active: 0, push_pending: 0, push_failed_24h: 1 },
  'dh-phone/api/stats': { missed: 2, answered: 14, total: 16, outgoing: 9 },
  'dh-phone/api/calls': [
    { id: 1, direction: 'inbound', from_number: '07700 900456', option_label: 'New website', status: 'missed', started_at: now - 2 * 3600e3, recording_url: 'x' },
    { id: 2, direction: 'inbound', from_number: '01443 123456', option_label: 'Support', answered_by_name: 'Jack Deane', duration: 190, status: 'completed', started_at: now - 5 * 3600e3 },
    { id: 3, direction: 'outbound', to_number: '07700 900789', placed_by_name: 'David Hooper', duration: 62, status: 'completed', started_at: now - day },
  ],
  'dh-phone/api/users': phoneUsers,
  'dh-phone/api/flows': { flows: [{ id: 'f1', greeting: 'Thanks for calling DH Website Services.', closed_greeting: 'We are closed at the moment.', hold_message: 'Thanks for holding.' }], options: [{ id: 'o1', flow_id: 'f1', digit: 1, label: 'New website', strategy: 'sequential', ring_seconds: 20, members: JSON.stringify([{ id: 'u1', name: 'David Hooper', priority: 1 }, { id: 'u2', name: 'Jack Deane', priority: 2 }]) }, { id: 'o2', flow_id: 'f1', digit: 2, label: 'Support', strategy: 'simultaneous', ring_seconds: 25, members: '[]' }], hours: [1, 2, 3, 4, 5].map(d => ({ flow_id: 'f1', weekday: d, open_minute: 540, close_minute: 1020 })) },
  'dh-phone/api/hold-music': { present: true, name: 'hold.mp3', size: 2400000 },
  'dh-phone/api/sms': [{ id: 1, to_number: '+447700900456', body: 'Hi, thanks for calling earlier. Ring us back on 01443 805303.', sent_by_name: 'Jack Deane', status: 'sent', created_at: iso(now - day) }],
  '/api/diagnostics/devices': { devices: [
    { fcm_token: 't1', user_email: 'david@dhwebsiteservices.co.uk', device_model: 'iPhone17,1', os_version: '27.2.1', diagnostics_consent: true, last: { completed_at: now - 3600e3, summary: { issues: [] } } },
    { fcm_token: 't2', user_email: 'jack@dhwebsiteservices.co.uk', device_model: 'iPhone15,2', os_version: '27.3', diagnostics_consent: false, last: null },
  ] },
}

export const extraMocks = [] // [substring, json] pairs screens' mocks can add

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

if (on && import.meta.env.DEV) {
  localStorage.setItem('fishtank.operatorKey', 'x'.repeat(64))
  const real = window.fetch.bind(window)
  window.fetch = async (url, opts = {}) => {
    const u = String(url?.url || url)
    const path = u.split('?')[0]
    for (const [k, v] of extraMocks) if (u.includes(k)) return json(typeof v === 'function' ? v(u, opts) : v)
    if (u.includes('/rest/v1/')) {
      const t = path.split('/rest/v1/')[1]
      const rows = tables[t] || []
      const method = (opts.method || 'GET').toUpperCase()
      if (method !== 'GET' && method !== 'HEAD') return json(rows.slice(0, 1))
      const accept = new Headers(opts.headers || {}).get('accept') || ''
      if (accept.includes('vnd.pgrst.object')) return json(rows[0] || null)
      return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json', 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } })
    }
    if (u.includes('fishtank')) {
      const pm = path.match(/\/operator\/players\/(p\d+)$/)
      if (pm) {
        const player = { ...players.find(p => p.id === pm[1]), best_container: 'Pond', coins_granted: 1500, device_id: 'abcdef1234567890' }
        return json({ player, devices: [{}], grants: [{ id: 'g1', kind: 'coins', amount: 500, created_at: now - day, claimed_at: now - 3600e3 }], daily: [{ day: dateOnly(now), score: 1200, tide: 'high' }], crashes: [], friends: 3, siblings: [{ id: 'p9', username: 'Player9', created_at: now - 40 * day }] })
      }
      const k = Object.keys(fish).find(k => path.endsWith(k))
      return json(k ? fish[k] : [])
    }
    if (u.includes('dh-mdm')) {
      const k = Object.keys(mdm).sort((a, b) => b.length - a.length).find(k => path.endsWith(k))
      return json(k ? mdm[k] : { ok: true })
    }
    const ak = Object.keys(api).sort((a, b) => b.length - a.length).find(k => k.includes('/') && !k.startsWith('/') ? u.includes(k.split('/')[0]) && path.endsWith(k.slice(k.indexOf('/'))) : path.endsWith(k))
    if (ak) return json(typeof api[ak] === 'function' ? api[ak](u, opts) : api[ak])
    if (u.includes('/api/') || u.includes('workers.dev')) return json({})
    return real(url, opts)
  }
}
