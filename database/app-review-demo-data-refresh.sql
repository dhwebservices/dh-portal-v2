-- Rolls the App Store review account's demo data forward from whatever "today" is.
--
-- Why this exists: the 2026-08-14 seed used fixed dates, and the screens that
-- matter read *moving* windows:
--   * Rota (src/mobile/screens/Rota.jsx) reads the CURRENT week only, published = true.
--   * Timesheet (src/mobile/screens/Timesheet.jsx) reads this week .. 3 weeks ahead.
-- So the original seed went blank on its own: by 2026-08-18 the timesheet was
-- already empty (its newest row was 2026-08-14, in the past) and the rota was
-- due to empty out on 2026-08-24. An empty demo account is the likely reason
-- 1.0 (build 2) was rejected under Guideline 2.1 in the first place.
--
-- Safe to re-run: every insert is guarded by NOT EXISTS, so running it weekly
-- while the app is in review just tops the window back up.
--
-- Scoped entirely to app-review@dhwebsiteservices.co.uk. No real staff records
-- are touched. Remove it all with app-review-demo-data-cleanup.sql AFTER approval.

-- Rota: weekdays for this week and the next 8, so any review date lands on a
-- populated week. 09:00-17:30 with an hour's break, matching the seeded rows.
insert into shifts (
  employee_email, employee_name, shift_date, start_time, end_time,
  break_minutes, role, note, published, source, created_by
)
select
  'app-review@dhwebsiteservices.co.uk',
  'App Store Review',
  d::date,
  '09:00',
  '17:30',
  60,
  'Business Services',
  case when extract(isodow from d) = 3 then 'Team meeting 10:00' end,
  true,
  'roster',
  'david@dhwebsiteservices.co.uk'
from generate_series(
  date_trunc('week', current_date)::date,
  (date_trunc('week', current_date) + interval '8 weeks' + interval '4 days')::date,
  interval '1 day'
) as d
where extract(isodow from d) <= 5
  and not exists (
    select 1 from shifts s
    where s.employee_email = 'app-review@dhwebsiteservices.co.uk'
      and s.shift_date = d::date
  );

-- Timesheet: 8h Mon-Thu, 6.5h Fri = the 38.5h week the review recording shows.
-- Covers the screen's full window (this week .. 3 weeks ahead) plus a margin.
insert into work_schedule (user_email, user_name, date, hours, notes)
select
  'app-review@dhwebsiteservices.co.uk',
  'App Store Review',
  d::date,
  case when extract(isodow from d) = 5 then 6.5 else 8 end,
  case when extract(isodow from d) = 5 then 'Working from home' end
from generate_series(
  date_trunc('week', current_date)::date,
  (date_trunc('week', current_date) + interval '4 weeks' + interval '4 days')::date,
  interval '1 day'
) as d
where extract(isodow from d) <= 5
  and not exists (
    select 1 from work_schedule w
    where w.user_email = 'app-review@dhwebsiteservices.co.uk'
      and w.date = d::date
  );

-- The OLD rota table. Seeded on purpose as insurance: build 2 (archived 8 Aug)
-- still reads `schedules`, and only build 3 reads `shifts`. If build 3 is not
-- the build attached to the version Apple reviews, this is what the phone shows.
insert into schedules (
  user_email, user_name, week_start, week_data, submitted, submitted_at, manager_edited
)
select
  'app-review@dhwebsiteservices.co.uk',
  'App Store Review',
  w::date,
  jsonb_build_object(
    'Monday',    jsonb_build_object('start', '09:00', 'end', '17:30'),
    'Tuesday',   jsonb_build_object('start', '09:00', 'end', '17:30'),
    'Wednesday', jsonb_build_object('start', '09:00', 'end', '17:30'),
    'Thursday',  jsonb_build_object('start', '09:00', 'end', '17:30'),
    'Friday',    jsonb_build_object('start', '09:00', 'end', '16:00'),
    'Saturday',  '{}'::jsonb,
    'Sunday',    '{}'::jsonb
  ),
  true,
  now(),
  false
from generate_series(
  date_trunc('week', current_date)::date,
  (date_trunc('week', current_date) + interval '8 weeks')::date,
  interval '1 week'
) as w
where not exists (
  select 1 from schedules s
  where s.user_email = 'app-review@dhwebsiteservices.co.uk'
    and s.week_start = w::date
);
