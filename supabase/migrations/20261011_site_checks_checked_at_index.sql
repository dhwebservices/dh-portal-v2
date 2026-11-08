-- The website-checks dashboard sorts every check by time; without this it sorted the whole table on each call.
create index if not exists idx_site_checks_checked_at on public.site_checks (checked_at desc);
