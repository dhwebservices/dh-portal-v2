alter table if exists public.sms_logs
  enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sms_logs'
      and policyname = 'allow_all'
  ) then
    drop policy "allow_all" on public.sms_logs;
  end if;
end $$;

-- Browser reads now go through `functions/api/sms-logs.js`
-- and writes already go through server-side functions/workers.
-- No anon/authenticated policy is left on this table.
