-- Payslips generated from the rota.
--
-- The portal talks to Supabase with the public anon key and no Supabase
-- session, so any table a browser can read is readable by anyone holding
-- that key. NI numbers, tax codes and full pay breakdowns therefore live in
-- tables the browser cannot touch at all (RLS on, no policies, no grants):
-- only the /api/payroll Pages Function, using the service role after
-- checking the caller's Microsoft sign-in, reads or writes them. The PDFs
-- go in a private bucket and are opened through short-lived signed links.

create table if not exists public.payroll_details (
  user_email        text primary key,
  ni_number         text check (ni_number is null or ni_number ~ '^[A-Z]{2}[0-9]{6}[A-D]$'),
  tax_code          text not null default '1257L',
  ni_category       text not null default 'A' check (ni_category ~ '^[A-Z]$'),
  pay_frequency     text not null default 'monthly' check (pay_frequency in ('weekly','fortnightly','four_weekly','monthly')),
  employee_number   text,
  -- Pay and tax this tax year from before the portal made payslips (BPT, a P45).
  prior_tax_year    text,
  prior_gross       numeric(12,2) not null default 0,
  prior_tax         numeric(12,2) not null default 0,
  prior_ni          numeric(12,2) not null default 0,
  updated_by        text,
  updated_at        timestamptz not null default now()
);

create table if not exists public.payroll_runs (
  id               uuid primary key default gen_random_uuid(),
  payslip_id       uuid references public.payslips(id) on delete set null,
  user_email       text not null,
  user_name        text,
  tax_year         text not null,
  frequency        text not null,
  tax_period       int  not null,
  period_start     date not null,
  period_end       date not null,
  pay_date         date not null,
  hours            numeric(10,2) not null,
  hourly_rate      numeric(10,2) not null,
  gross            numeric(12,2) not null,
  income_tax       numeric(12,2) not null,
  employee_ni      numeric(12,2) not null,
  pension          numeric(12,2) not null default 0,
  student_loan     numeric(12,2) not null default 0,
  other_deductions jsonb not null default '[]',
  net              numeric(12,2) not null,
  tax_code         text,
  ni_category      text,
  shifts           jsonb not null default '[]',
  file_path        text,
  created_by       text,
  created_at       timestamptz not null default now()
);
create index if not exists payroll_runs_user_year on public.payroll_runs(user_email, tax_year);

alter table public.payroll_details enable row level security;
alter table public.payroll_runs enable row level security;
revoke all on public.payroll_details, public.payroll_runs from anon, authenticated;

insert into storage.buckets (id, name, public) values ('payroll', 'payroll', false)
on conflict (id) do update set public = false;
