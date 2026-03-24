-- ============================================================
-- DH Portal v2 — Full Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Audit log
create table if not exists audit_log (
  id uuid default gen_random_uuid() primary key,
  user_email text,
  user_name text,
  action text,
  target text,
  target_id text,
  details jsonb default '{}',
  created_at timestamptz default now()
);

-- User permissions
create table if not exists user_permissions (
  id uuid default gen_random_uuid() primary key,
  user_email text unique,
  permissions jsonb default '{}',
  onboarding boolean default false,
  updated_at timestamptz default now()
);

-- HR Profiles
create table if not exists hr_profiles (
  id uuid default gen_random_uuid() primary key,
  user_email text unique,
  user_name text,
  full_name text,
  role text,
  department text,
  contract_type text,
  start_date date,
  phone text,
  personal_email text,
  address text,
  manager_name text,
  hr_notes text,
  bank_name text,
  account_name text,
  sort_code text,
  account_number text,
  contract_url text,
  contract_path text,
  bio text,
  skills text,
  location text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Outreach
create table if not exists outreach (
  id uuid default gen_random_uuid() primary key,
  business_name text,
  contact_name text,
  phone text,
  email text,
  website text,
  status text default 'new',
  notes text,
  added_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Clients
create table if not exists clients (
  id uuid default gen_random_uuid() primary key,
  name text,
  contact text,
  email text,
  phone text,
  plan text,
  status text default 'active',
  value numeric,
  invoice_paid boolean default false,
  deployment_status text default 'accepted',
  website_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Support tickets
create table if not exists support_tickets (
  id uuid default gen_random_uuid() primary key,
  client_email text,
  client_name text,
  subject text,
  message text,
  priority text default 'medium',
  status text default 'open',
  staff_reply text,
  replied_by text,
  replied_at timestamptz,
  created_at timestamptz default now()
);

-- Tasks
create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  title text,
  description text,
  assigned_to_email text,
  assigned_to_name text,
  due_date date,
  priority text default 'medium',
  status text default 'todo',
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Schedules
create table if not exists schedules (
  id uuid default gen_random_uuid() primary key,
  user_email text,
  user_name text,
  week_start date,
  week_data jsonb default '{}',
  submitted boolean default false,
  submitted_at timestamptz,
  unique(user_email, week_start)
);

-- Staff & commissions
create table if not exists staff (
  id uuid default gen_random_uuid() primary key,
  name text,
  email text unique,
  role text,
  commission_rate numeric default 10,
  status text default 'active',
  total_earned numeric default 0,
  pending_payout numeric default 0,
  sales_count int default 0
);

create table if not exists commissions (
  id uuid default gen_random_uuid() primary key,
  staff_name text,
  staff_email text,
  client text,
  sale_value numeric,
  commission_amount numeric,
  date date,
  status text default 'pending',
  created_at timestamptz default now()
);

-- Email templates
create table if not exists email_templates (
  id uuid default gen_random_uuid() primary key,
  name text,
  subject text,
  body text,
  created_at timestamptz default now()
);

-- Banners
create table if not exists banners (
  id uuid default gen_random_uuid() primary key,
  title text,
  message text,
  type text default 'info',
  display_type text default 'banner',
  target text default 'all',
  target_email text,
  target_page text default 'all',
  active boolean default true,
  dismissible boolean default true,
  starts_at timestamptz default now(),
  ends_at timestamptz,
  created_by text,
  created_at timestamptz default now()
);

-- Maintenance systems
create table if not exists maintenance_systems (
  id uuid default gen_random_uuid() primary key,
  name text,
  status text default 'operational',
  note text,
  url text,
  updated_at timestamptz default now()
);

-- Portal settings
create table if not exists portal_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

-- HR Leave requests
create table if not exists leave_requests (
  id uuid default gen_random_uuid() primary key,
  user_email text,
  user_name text,
  type text,
  start_date date,
  end_date date,
  days int,
  reason text,
  status text default 'pending',
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz default now()
);

-- Leave balances
create table if not exists leave_balances (
  id uuid default gen_random_uuid() primary key,
  user_email text unique,
  annual_remaining int default 25,
  annual_total int default 25,
  sick_remaining int default 10,
  sick_total int default 10,
  carried_over int default 0
);

-- Timesheets
create table if not exists timesheets (
  id uuid default gen_random_uuid() primary key,
  user_email text,
  user_name text,
  clock_in timestamptz,
  clock_out timestamptz,
  hours numeric,
  note text,
  created_at timestamptz default now()
);

-- Payslips
create table if not exists payslips (
  id uuid default gen_random_uuid() primary key,
  user_email text,
  user_name text,
  period text,
  file_url text,
  file_path text,
  uploaded_by text,
  uploaded_at timestamptz default now(),
  created_at timestamptz default now()
);

-- HR Policies
create table if not exists hr_policies (
  id uuid default gen_random_uuid() primary key,
  title text,
  description text,
  file_url text,
  file_path text,
  uploaded_by text,
  created_at timestamptz default now()
);

-- Policy acknowledgements
create table if not exists policy_acknowledgements (
  id uuid default gen_random_uuid() primary key,
  policy_id uuid references hr_policies(id) on delete cascade,
  user_email text,
  user_name text,
  acknowledged_at timestamptz default now(),
  unique(policy_id, user_email)
);

-- Onboarding submissions
create table if not exists onboarding_submissions (
  id uuid default gen_random_uuid() primary key,
  user_email text unique,
  user_name text,
  full_name text,
  dob date,
  ni_number text,
  address text,
  emergency_name text,
  emergency_phone text,
  bank_name text,
  account_number text,
  sort_code text,
  right_to_work text,
  contract_signed boolean default false,
  status text default 'submitted',
  submitted_at timestamptz,
  decided_by text,
  decided_at timestamptz
);

-- Client invoices
create table if not exists client_invoices (
  id uuid default gen_random_uuid() primary key,
  client_email text,
  client_name text,
  invoice_number text,
  description text,
  amount numeric,
  due_date date,
  status text default 'unpaid',
  payment_type text default 'one_off',
  plan_id text,
  paid_at timestamptz,
  created_by text,
  created_at timestamptz default now()
);

-- Client documents
create table if not exists client_documents (
  id uuid default gen_random_uuid() primary key,
  client_email text,
  name text,
  type text,
  file_url text,
  created_at timestamptz default now()
);

-- Client activity
create table if not exists client_activity (
  id uuid default gen_random_uuid() primary key,
  client_email text,
  event_type text,
  description text,
  created_at timestamptz default now()
);

-- Deployment updates
create table if not exists deployment_updates (
  id uuid default gen_random_uuid() primary key,
  client_email text,
  title text,
  message text,
  staff_name text,
  created_at timestamptz default now()
);

-- Notifications
create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  user_email text,
  title text,
  message text,
  type text default 'info',
  link text,
  read boolean default false,
  created_at timestamptz default now()
);

-- Client payments
create table if not exists client_payments (
  id uuid default gen_random_uuid() primary key,
  client_email text,
  client_name text,
  amount numeric,
  payment_type text,
  status text default 'pending',
  gocardless_id text,
  created_at timestamptz default now()
);

-- GoCardless mandates
create table if not exists gocardless_mandates (
  id uuid default gen_random_uuid() primary key,
  client_email text unique,
  client_name text,
  mandate_id text,
  customer_id text,
  status text default 'active',
  created_at timestamptz default now()
);

-- ============================================================
-- RLS Policies (enable row level security)
-- ============================================================

alter table audit_log             enable row level security;
alter table user_permissions      enable row level security;
alter table hr_profiles           enable row level security;
alter table outreach              enable row level security;
alter table clients               enable row level security;
alter table support_tickets       enable row level security;
alter table tasks                 enable row level security;
alter table schedules             enable row level security;
alter table staff                 enable row level security;
alter table commissions           enable row level security;
alter table email_templates       enable row level security;
alter table banners               enable row level security;
alter table maintenance_systems   enable row level security;
alter table portal_settings       enable row level security;
alter table leave_requests        enable row level security;
alter table leave_balances        enable row level security;
alter table timesheets            enable row level security;
alter table payslips              enable row level security;
alter table hr_policies           enable row level security;
alter table policy_acknowledgements enable row level security;
alter table onboarding_submissions enable row level security;
alter table client_invoices       enable row level security;
alter table client_documents      enable row level security;
alter table client_activity       enable row level security;
alter table deployment_updates    enable row level security;
alter table notifications         enable row level security;
alter table client_payments       enable row level security;
alter table gocardless_mandates   enable row level security;

-- Allow anon/authenticated full access via service key (portal uses anon key)
-- These policies allow the anon key to read/write everything
-- Tighten these later once you add proper auth

create policy "allow_all" on audit_log              for all using (true) with check (true);
create policy "allow_all" on user_permissions       for all using (true) with check (true);
create policy "allow_all" on hr_profiles            for all using (true) with check (true);
create policy "allow_all" on outreach               for all using (true) with check (true);
create policy "allow_all" on clients                for all using (true) with check (true);
create policy "allow_all" on support_tickets        for all using (true) with check (true);
create policy "allow_all" on tasks                  for all using (true) with check (true);
create policy "allow_all" on schedules              for all using (true) with check (true);
create policy "allow_all" on staff                  for all using (true) with check (true);
create policy "allow_all" on commissions            for all using (true) with check (true);
create policy "allow_all" on email_templates        for all using (true) with check (true);
create policy "allow_all" on banners                for all using (true) with check (true);
create policy "allow_all" on maintenance_systems    for all using (true) with check (true);
create policy "allow_all" on portal_settings        for all using (true) with check (true);
create policy "allow_all" on leave_requests         for all using (true) with check (true);
create policy "allow_all" on leave_balances         for all using (true) with check (true);
create policy "allow_all" on timesheets             for all using (true) with check (true);
create policy "allow_all" on payslips               for all using (true) with check (true);
create policy "allow_all" on hr_policies            for all using (true) with check (true);
create policy "allow_all" on policy_acknowledgements for all using (true) with check (true);
create policy "allow_all" on onboarding_submissions for all using (true) with check (true);
create policy "allow_all" on client_invoices        for all using (true) with check (true);
create policy "allow_all" on client_documents       for all using (true) with check (true);
create policy "allow_all" on client_activity        for all using (true) with check (true);
create policy "allow_all" on deployment_updates     for all using (true) with check (true);
create policy "allow_all" on notifications          for all using (true) with check (true);
create policy "allow_all" on client_payments        for all using (true) with check (true);
create policy "allow_all" on gocardless_mandates    for all using (true) with check (true);

-- ============================================================
-- Storage bucket for HR documents
-- ============================================================
insert into storage.buckets (id, name, public)
values ('hr-documents', 'hr-documents', true)
on conflict (id) do nothing;

create policy "allow_all" on storage.objects
  for all using (bucket_id = 'hr-documents') with check (bucket_id = 'hr-documents');


-- Staff documents (uploaded by admins, visible to staff in My Profile)
create table if not exists staff_documents (
  id uuid default gen_random_uuid() primary key,
  staff_email text,
  staff_name text,
  name text,
  type text default 'Document',
  file_url text,
  file_path text,
  uploaded_by text,
  created_at timestamptz default now()
);
alter table staff_documents enable row level security;
create policy "allow_all" on staff_documents for all using (true) with check (true);

-- GoCardless webhook events (written by Cloudflare Worker)
create table if not exists gc_events (
  id uuid default gen_random_uuid() primary key,
  type text,
  payment_id text,
  mandate_id text,
  customer_id text,
  subscription_id text,
  billing_request_id text,
  details jsonb default '{}',
  created_at timestamptz default now()
);
alter table gc_events enable row level security;
create policy "allow_all" on gc_events for all using (true) with check (true);

-- Website CMS content
create table if not exists website_content (
  id uuid default gen_random_uuid() primary key,
  page text not null,
  section text not null,
  field text not null,
  value text,
  updated_at timestamptz default now(),
  updated_by text,
  unique(page, section, field)
);
alter table website_content enable row level security;
create policy "allow_all" on website_content for all using (true) with check (true);
