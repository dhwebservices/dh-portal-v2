-- Migration: Add Stripe Payment System
-- Run this in Supabase SQL Editor

-- Create proposals table
create table if not exists proposals (
  id uuid default gen_random_uuid() primary key,

  -- Client details
  client_business text not null,
  client_name text not null,
  client_email text not null,
  client_phone text,
  client_industry text,

  -- Proposal details
  timeline text,
  requirements text,
  prepared_by text,
  valid_until date,

  -- Package selection (stored as JSONB for flexibility)
  selected_build jsonb,
  pay_monthly boolean default false,
  selected_hosting jsonb,
  selected_extras jsonb default '[]',

  -- Pricing
  build_price numeric default 0,
  monthly_total numeric default 0,
  one_off_total numeric default 0,
  first_year_total numeric default 0,

  -- Status tracking
  status text default 'draft',

  -- Payment integration
  stripe_payment_link_id text,
  stripe_payment_link_url text,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  stripe_customer_id text,
  payment_amount numeric,

  -- Staff tracking
  created_by_email text,
  created_by_name text,
  assigned_to_email text,
  assigned_to_name text,

  -- Timestamps
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS and create policy
alter table proposals enable row level security;
drop policy if exists "allow_all" on proposals;
create policy "allow_all" on proposals for all using (true) with check (true);

-- Create stripe_events table
create table if not exists stripe_events (
  id uuid default gen_random_uuid() primary key,
  event_id text unique not null,
  event_type text not null,
  payment_intent_id text,
  payment_link_id text,
  proposal_id uuid references proposals(id),
  amount numeric,
  currency text,
  customer_email text,
  status text,
  raw_event jsonb,
  processed boolean default false,
  processed_at timestamptz,
  created_at timestamptz default now()
);

-- Enable RLS and create policy
alter table stripe_events enable row level security;
drop policy if exists "allow_all" on stripe_events;
create policy "allow_all" on stripe_events for all using (true) with check (true);

-- Backup and drop old GoCardless tables (optional - uncomment if ready to migrate)
-- create table if not exists _backup_client_payments as select * from client_payments;
-- create table if not exists _backup_gocardless_mandates as select * from gocardless_mandates;
-- create table if not exists _backup_gc_events as select * from gc_events;
-- drop table if exists client_payments;
-- drop table if exists gocardless_mandates;
-- drop table if exists gc_events;
