alter table if exists public.hr_profiles
  add column if not exists manager_email text;

alter table if exists public.hr_profiles
  add column if not exists bio text;

alter table if exists public.hr_profiles
  add column if not exists skills text;

alter table if exists public.hr_profiles
  add column if not exists location text;

alter table if exists public.hr_profiles
  add column if not exists bookable boolean default false;

alter table if exists public.user_permissions
  add column if not exists bookable_staff boolean default false;

alter table if exists public.user_permissions
  add column if not exists created_at timestamptz default now();

alter table if exists public.audit_log
  add column if not exists target text;

alter table if exists public.audit_log
  add column if not exists target_id text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audit_log'
      and column_name = 'entity'
  ) then
    execute '
      update public.audit_log
      set target = coalesce(target, entity)
      where entity is not null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audit_log'
      and column_name = 'entity_id'
  ) then
    execute '
      update public.audit_log
      set target_id = coalesce(target_id, entity_id)
      where entity_id is not null
    ';
  end if;
end $$;
