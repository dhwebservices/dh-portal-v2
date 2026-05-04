alter table if exists public.audit_log
  enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_log'
      and policyname = 'allow_all'
  ) then
    drop policy "allow_all" on public.audit_log;
  end if;
end $$;

-- Browser reads, writes, and retention clears now go through
-- `functions/api/audit-log.js`. No anon/authenticated policy is left.
