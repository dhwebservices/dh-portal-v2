-- DH Portal onboarding-mode repair
-- Run in Supabase SQL Editor if onboarding mode is missing or users are not being routed into onboarding.

-- 1) Ensure the legacy onboarding flag exists on user_permissions.
alter table public.user_permissions
  add column if not exists onboarding boolean default false;

alter table public.user_permissions
  add column if not exists updated_at timestamptz default now();

-- 2) Ensure the key/value table used for lifecycle and onboarding payloads exists.
create table if not exists public.portal_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

-- 3) Backfill lifecycle rows for users already marked as onboarding.
insert into public.portal_settings (key, value, updated_at)
select
  'staff_lifecycle:' || lower(trim(user_email)) as key,
  jsonb_build_object(
    'value',
    jsonb_build_object(
      'state', 'onboarding',
      'notes', 'Backfilled from user_permissions.onboarding',
      'updated_at', now()
    )
  ) as value,
  now() as updated_at
from public.user_permissions
where onboarding is true
  and nullif(trim(user_email), '') is not null
on conflict (key) do update
set
  value = jsonb_set(
    coalesce(public.portal_settings.value, '{"value":{}}'::jsonb),
    '{value,state}',
    '"onboarding"'::jsonb,
    true
  ),
  updated_at = now();

-- 4) Optional check: shows users currently in onboarding by either source.
select
  p.user_email,
  p.onboarding as permission_onboarding,
  s.value #>> '{value,state}' as lifecycle_state
from public.user_permissions p
left join public.portal_settings s
  on s.key = 'staff_lifecycle:' || lower(trim(p.user_email))
where p.onboarding is true
   or s.value #>> '{value,state}' = 'onboarding'
order by p.user_email;
