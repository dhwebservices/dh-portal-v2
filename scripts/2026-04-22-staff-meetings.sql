create table if not exists staff_meetings (
  id uuid default gen_random_uuid() primary key,
  title text,
  meeting_with_name text,
  meeting_type text default 'internal',
  staff_email text,
  staff_name text,
  organizer_email text,
  organizer_name text,
  date date,
  start_time text,
  end_time text,
  notes text,
  location text,
  status text default 'scheduled',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists staff_meetings
  add column if not exists title text,
  add column if not exists meeting_with_name text,
  add column if not exists meeting_type text default 'internal',
  add column if not exists staff_email text,
  add column if not exists staff_name text,
  add column if not exists organizer_email text,
  add column if not exists organizer_name text,
  add column if not exists date date,
  add column if not exists start_time text,
  add column if not exists end_time text,
  add column if not exists notes text,
  add column if not exists location text,
  add column if not exists status text default 'scheduled',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists staff_meetings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_meetings'
      and policyname = 'allow_all'
  ) then
    create policy "allow_all" on staff_meetings for all using (true) with check (true);
  end if;
end $$;
