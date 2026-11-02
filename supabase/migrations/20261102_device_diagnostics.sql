-- Remote diagnostics for staff iPhones.
--
-- A person opts their phone in from the app (Settings > Diagnostics). An admin
-- can then ask that phone to run a check: the API sends a silent push, the app
-- wakes in the background, runs the checks and posts a report back using the
-- one-time key that came in the push. Nothing is collected from a phone that
-- has not opted in, and opting out stops new requests straight away.
--
-- Both tables are reached only through functions/api/diagnostics (service
-- role). RLS is on with no policies, so the browser's anon key can't read them.

alter table public.user_devices
  add column if not exists diagnostics_consent boolean not null default false,
  add column if not exists diagnostics_consent_at timestamptz;

create table if not exists public.device_diagnostics (
  id uuid primary key default gen_random_uuid(),
  device_token text not null,
  user_email text not null,
  device_name text,
  trigger text not null check (trigger in ('remote', 'manual')),
  status text not null default 'requested' check (status in ('requested', 'nudged', 'done', 'expired')),
  requested_by text,
  -- One-time key the phone presents with its report. Cleared once used.
  upload_key text,
  requested_at timestamptz not null default now(),
  nudged_at timestamptz,
  completed_at timestamptz,
  report jsonb
);

create index if not exists device_diagnostics_device_time on public.device_diagnostics (device_token, requested_at desc);
create index if not exists device_diagnostics_user_time on public.device_diagnostics (user_email, requested_at desc);

alter table public.device_diagnostics enable row level security;
