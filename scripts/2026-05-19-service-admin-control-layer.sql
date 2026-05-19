create table if not exists public.service_admin_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null default '',
  enabled boolean not null default false,
  audience_scope text not null default 'all_staff',
  expires_at timestamptz null,
  updated_at timestamptz not null default now(),
  updated_by_email text not null default '',
  updated_by_name text not null default ''
);

create table if not exists public.service_admin_config_history (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null default '',
  actor_name text not null default '',
  category text not null default 'general',
  target_key text not null,
  previous_value jsonb null,
  next_value jsonb null,
  reason text not null default '',
  changed_at timestamptz not null default now()
);

create table if not exists public.service_admin_release_history (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  title text not null default '',
  notes text not null default '',
  mode text not null default 'soft_announce',
  force_refresh boolean not null default false,
  blocked boolean not null default false,
  published_at timestamptz not null default now(),
  published_by_email text not null default '',
  published_by_name text not null default ''
);

create table if not exists public.service_admin_incidents (
  id uuid primary key default gen_random_uuid(),
  system_name text not null,
  status text not null default 'operational',
  severity text not null default 'normal',
  audience text not null default 'staff',
  public_note text not null default '',
  internal_note text not null default '',
  starts_at timestamptz null,
  ends_at timestamptz null,
  changed_at timestamptz not null default now(),
  changed_by_email text not null default '',
  changed_by_name text not null default ''
);

create table if not exists public.service_admin_checks (
  id uuid primary key default gen_random_uuid(),
  check_key text not null,
  status text not null default 'pass',
  detail text not null default '',
  checked_at timestamptz not null default now(),
  checked_by_email text not null default '',
  checked_by_name text not null default ''
);

create index if not exists idx_service_admin_flags_key on public.service_admin_flags(key);
create index if not exists idx_service_admin_config_history_changed_at on public.service_admin_config_history(changed_at desc);
create index if not exists idx_service_admin_release_history_published_at on public.service_admin_release_history(published_at desc);
create index if not exists idx_service_admin_incidents_changed_at on public.service_admin_incidents(changed_at desc);
create index if not exists idx_service_admin_checks_checked_at on public.service_admin_checks(checked_at desc);
