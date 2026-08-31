/**
 * Every kind of notification the portal can send.
 *
 * **One list, imported by both sides.** The app reads it to draw the
 * preferences screen; the Cloudflare Functions read it to decide whether to
 * send. A type that existed in only one of those places would be a setting
 * that silently does nothing, or a notification nobody can turn off.
 *
 * The keys are written to `user_preferences.notification_prefs` and to
 * `notifications.type`, so **renaming one orphans existing rows**. Add, don't
 * rename.
 */

export const NOTIFICATION_EVENTS = [
  {
    key: 'shift_published',
    label: 'New shifts',
    description: 'When a rota you are on is published',
    audience: 'staff',
  },
  {
    key: 'shift_changed',
    label: 'Shift changes',
    description: 'When the time, date or role of one of your shifts changes',
    audience: 'staff',
  },
  {
    key: 'shift_cancelled',
    label: 'Cancelled shifts',
    description: 'When one of your shifts is removed',
    audience: 'staff',
  },
  {
    key: 'shift_start_reminder',
    label: 'Before a shift',
    description: 'A reminder shortly before you are due to start',
    audience: 'staff',
  },
  {
    key: 'clock_in_reminder',
    label: 'Clock-in reminders',
    description: 'A nudge if you have not clocked in',
    audience: 'staff',
  },
  {
    key: 'leave_approved',
    label: 'Leave decisions',
    description: 'When a request you made is approved or declined',
    audience: 'staff',
  },
  {
    key: 'leave_requested',
    label: 'Leave requests',
    description: 'When somebody asks for time off',
    audience: 'manager',
  },
  {
    key: 'timesheet_ready',
    label: 'Timesheets',
    description: 'When a timesheet is ready to check',
    audience: 'staff',
  },
  {
    key: 'payslip_available',
    label: 'Payslips',
    description: 'When a new payslip is available',
    audience: 'staff',
  },
  {
    key: 'document_expiring',
    label: 'Expiring documents',
    description: 'When a document on your record is close to expiring',
    audience: 'both',
  },
  {
    key: 'announcement',
    label: 'Announcements',
    description: 'Messages sent to you by the office',
    audience: 'both',
    // Deliberately cannot be switched off: this is the channel used to tell
    // people the office is shut or a shift has moved at short notice. A staff
    // announcement nobody receives is worse than no channel at all.
    required: true,
  },
]

/** Lookup by key, for the send path. */
export const EVENT_BY_KEY = Object.fromEntries(
  NOTIFICATION_EVENTS.map(event => [event.key, event]),
)

/**
 * Whether this person wants this kind of notification.
 *
 * Three gates, in order:
 *   1. Required events always send.
 *   2. The existing master switch, `user_preferences.push_notifications`,
 *      still silences everything — it predates this and code elsewhere
 *      already reads it.
 *   3. The per-event map. **A missing key means yes**, so somebody who has
 *      never opened the settings screen gets everything, and adding a new
 *      event does not require backfilling every row.
 */
export function wantsNotification(preferences, key) {
  if (EVENT_BY_KEY[key]?.required) return true
  if (!preferences) return true
  if (preferences.push_notifications === false) return false

  const perEvent = preferences.notification_prefs
  if (!perEvent || typeof perEvent !== 'object') return true
  return perEvent[key] !== false
}

/**
 * The events worth showing this person on the settings screen.
 *
 * A manager is also somebody who works shifts, so they see everything. A shift
 * worker is not shown manager-only events — a toggle for "when somebody asks
 * for time off" is noise to somebody who will never receive one.
 */
export function eventsFor({ isManager }) {
  if (isManager) return NOTIFICATION_EVENTS
  return NOTIFICATION_EVENTS.filter(event => event.audience !== 'manager')
}
