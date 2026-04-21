alter table if exists staff_meetings
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists reminder_last_checked_at timestamptz;
