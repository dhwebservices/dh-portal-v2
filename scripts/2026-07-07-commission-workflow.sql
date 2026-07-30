-- Commission workflow upgrade
-- Run this in Supabase SQL editor before using the new commission request/approval flow.

create table if not exists commission_settings (
  id uuid default gen_random_uuid() primary key,
  staff_email text unique not null,
  staff_name text,
  commission_rate numeric not null default 10,
  enabled boolean not null default true,
  manager_email text,
  manager_name text,
  effective_from date default current_date,
  notes text,
  updated_by_email text,
  updated_by_name text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table commissions add column if not exists client_id uuid;
alter table commissions add column if not exists client_name text;
alter table commissions add column if not exists source_type text;
alter table commissions add column if not exists source_id text;
alter table commissions add column if not exists description text;
alter table commissions add column if not exists commission_rate numeric;
alter table commissions add column if not exists requested_pay_date date;
alter table commissions add column if not exists requested_at timestamptz;
alter table commissions add column if not exists requested_by_email text;
alter table commissions add column if not exists payout_request_id uuid;
alter table commissions add column if not exists approved_by_email text;
alter table commissions add column if not exists approved_by_name text;
alter table commissions add column if not exists approved_at timestamptz;
alter table commissions add column if not exists rejected_by_email text;
alter table commissions add column if not exists rejected_by_name text;
alter table commissions add column if not exists rejected_at timestamptz;
alter table commissions add column if not exists rejection_reason text;
alter table commissions add column if not exists paid_by_email text;
alter table commissions add column if not exists paid_by_name text;
alter table commissions add column if not exists paid_at timestamptz;
alter table commissions add column if not exists statement_file_url text;
alter table commissions add column if not exists statement_file_path text;
alter table commissions add column if not exists metadata jsonb default '{}';
alter table commissions add column if not exists updated_at timestamptz default now();

update commissions
set client_name = coalesce(client_name, client),
    status = case when status in ('pending', '') or status is null then 'available' else status end
where client_name is null or status is null or status = 'pending' or status = '';

create table if not exists commission_payout_requests (
  id uuid default gen_random_uuid() primary key,
  staff_email text not null,
  staff_name text,
  manager_email text,
  manager_name text,
  commission_ids jsonb not null default '[]',
  requested_pay_date date,
  requested_amount numeric default 0,
  approved_amount numeric default 0,
  status text default 'requested',
  notes text,
  manager_notes text,
  requested_at timestamptz default now(),
  decided_by_email text,
  decided_by_name text,
  decided_at timestamptz,
  paid_by_email text,
  paid_by_name text,
  paid_at timestamptz,
  statement_file_url text,
  statement_file_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists commissions_source_unique
  on commissions (source_type, source_id)
  where source_type is not null and source_id is not null;

create index if not exists commissions_staff_status_idx on commissions (lower(staff_email), status);
create index if not exists commission_payout_requests_staff_status_idx on commission_payout_requests (lower(staff_email), status);

alter table commission_settings enable row level security;
alter table commission_payout_requests enable row level security;

drop policy if exists "allow_all" on commission_settings;
drop policy if exists "allow_all" on commission_payout_requests;
create policy "allow_all" on commission_settings for all using (true) with check (true);
create policy "allow_all" on commission_payout_requests for all using (true) with check (true);
