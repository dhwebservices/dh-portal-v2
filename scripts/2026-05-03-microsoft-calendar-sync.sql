create table if not exists microsoft_calendar_connections (
  id uuid default gen_random_uuid() primary key,
  staff_email text not null unique,
  microsoft_user_id text,
  microsoft_user_principal_name text,
  calendar_id text,
  calendar_name text,
  sync_enabled boolean default false,
  sync_direction text default 'bidirectional',
  sync_portal_to_microsoft boolean default true,
  sync_microsoft_to_portal boolean default true,
  sync_rota boolean default true,
  sync_meetings boolean default true,
  last_delta_token text,
  last_synced_at timestamptz,
  last_pull_started_at timestamptz,
  last_push_at timestamptz,
  last_error text,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists microsoft_calendar_sync_jobs (
  id uuid default gen_random_uuid() primary key,
  staff_email text not null,
  job_type text not null,
  direction text default 'portal_to_microsoft',
  source_table text not null,
  source_id text not null,
  payload jsonb default '{}',
  status text default 'pending',
  attempts integer default 0,
  last_error text,
  available_at timestamptz default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists microsoft_calendar_sync_jobs_status_idx
  on microsoft_calendar_sync_jobs (status, available_at, created_at);

create index if not exists microsoft_calendar_sync_jobs_staff_idx
  on microsoft_calendar_sync_jobs (staff_email, status);

create table if not exists microsoft_calendar_sync_links (
  id uuid default gen_random_uuid() primary key,
  connection_id uuid references microsoft_calendar_connections(id) on delete set null,
  staff_email text not null,
  source_table text not null,
  source_id text not null,
  microsoft_event_id text not null unique,
  microsoft_calendar_id text,
  source_hash text,
  sync_direction text default 'bidirectional',
  portal_last_seen_at timestamptz,
  microsoft_last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (source_table, source_id)
);

alter table if exists staff_meetings
  add column if not exists sync_source text default 'portal',
  add column if not exists microsoft_event_id text,
  add column if not exists microsoft_calendar_id text,
  add column if not exists sync_status text,
  add column if not exists sync_updated_at timestamptz;

alter table if exists microsoft_calendar_connections enable row level security;
alter table if exists microsoft_calendar_sync_jobs enable row level security;
alter table if exists microsoft_calendar_sync_links enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'microsoft_calendar_connections'
      and policyname = 'allow_all'
  ) then
    create policy "allow_all" on microsoft_calendar_connections for all using (true) with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'microsoft_calendar_sync_jobs'
      and policyname = 'allow_all'
  ) then
    create policy "allow_all" on microsoft_calendar_sync_jobs for all using (true) with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'microsoft_calendar_sync_links'
      and policyname = 'allow_all'
  ) then
    create policy "allow_all" on microsoft_calendar_sync_links for all using (true) with check (true);
  end if;
end $$;
