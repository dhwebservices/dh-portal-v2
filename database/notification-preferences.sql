-- Per-event notification preferences.
--
-- ADDITIVE ONLY. Nothing existing is altered or dropped:
--
--   * `user_preferences.push_notifications` stays exactly as it is and keeps
--     working as the master switch. Code already reads it, and this migration
--     does not change what it means.
--   * The new column is nullable with no default, so every existing row stays
--     valid and untouched. A NULL means "wants everything", which is what
--     those people get today.
--
-- Shape: { "shift_published": true, "clock_in_reminder": false, ... }
-- Keys come from src/shared/notificationEvents.js. A key that is absent means
-- yes, so adding a new event never needs a backfill.

alter table user_preferences
  add column if not exists notification_prefs jsonb;

comment on column user_preferences.notification_prefs is
  'Per-event push preferences, keyed by the event keys in src/shared/notificationEvents.js. NULL or a missing key means the person wants that notification. The older push_notifications boolean remains the master switch.';
