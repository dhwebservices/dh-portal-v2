alter table if exists public.microsoft_calendar_connections
  enable row level security;

alter table if exists public.microsoft_calendar_sync_links
  enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'microsoft_calendar_connections'
      and policyname = 'allow_all'
  ) then
    drop policy "allow_all" on public.microsoft_calendar_connections;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'microsoft_calendar_sync_links'
      and policyname = 'allow_all'
  ) then
    drop policy "allow_all" on public.microsoft_calendar_sync_links;
  end if;
end $$;

-- These tables are worker-only. The frontend does not read or write them.
-- Cloudflare Workers use the Supabase service role and bypass RLS.
