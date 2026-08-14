-- Demo data for the App Store review account (app-review@dhwebsiteservices.co.uk).
--
-- Seeded 2026-08-14 so Apple's reviewer sees populated Rota / Timesheet / Leave /
-- Payslips screens instead of empty ones. The 1.0 (build 2) submission was rejected
-- under Guideline 2.1 (Information Needed) and the empty demo account was the likely
-- reason review could not assess the app.
--
-- RUN THIS ONCE THE APP IS APPROVED. Leaving it in place until then is deliberate --
-- the reviewer signs in to this account after submission, so clearing it early
-- reproduces the original problem.
--
-- Everything below is scoped to the single review account. No real staff records
-- are touched.

delete from shifts        where employee_email = 'app-review@dhwebsiteservices.co.uk';
delete from schedules     where user_email     = 'app-review@dhwebsiteservices.co.uk';
delete from work_schedule where user_email     = 'app-review@dhwebsiteservices.co.uk';
delete from hr_leave      where user_email     = 'app-review@dhwebsiteservices.co.uk';
delete from payslips      where user_email     = 'app-review@dhwebsiteservices.co.uk';

-- Note: BOTH `shifts` and `schedules` are seeded on purpose. Current HEAD reads
-- `shifts` (commit 056bca8, 11 Aug), but the submitted build 2 was archived 8 Aug
-- and still reads the older `schedules` table. Seeding only `shifts` leaves the
-- Rota empty in the build Apple is actually reviewing.

-- Verify it is gone (all counts should be 0):
--
-- with e as (select 'app-review@dhwebsiteservices.co.uk'::text as em)
-- select 'shifts', count(*) from shifts, e where employee_email = e.em
-- union all select 'work_schedule', count(*) from work_schedule, e where user_email = e.em
-- union all select 'hr_leave',      count(*) from hr_leave,      e where user_email = e.em
-- union all select 'payslips',      count(*) from payslips,      e where user_email = e.em;
--
-- The hr_profiles row for this account is NOT removed by the above -- it predates
-- this seed (created 2026-08-08) and the account needs it to sign in at all.
