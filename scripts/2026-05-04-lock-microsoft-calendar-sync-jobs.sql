alter table if exists public.microsoft_calendar_sync_jobs
  enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'microsoft_calendar_sync_jobs'
      and policyname = 'allow_all'
  ) then
    drop policy "allow_all" on public.microsoft_calendar_sync_jobs;
  end if;
end $$;

-- Intentionally leave the table with no anon/authenticated policies.
-- Browser queue writes now go through the Cloudflare Pages function
-- `functions/api/enqueue-calendar-sync.js`, while the Supabase service role
-- used by Workers bypasses RLS for internal processing.
