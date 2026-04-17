alter table if exists sms_logs
  add column if not exists recipient_phone text,
  add column if not exists recipient_name text,
  add column if not exists recipient_email text,
  add column if not exists sender_id text,
  add column if not exists message text,
  add column if not exists category text default 'general',
  add column if not exists provider text default 'clicksend',
  add column if not exists provider_message_id text,
  add column if not exists status text default 'queued',
  add column if not exists sent_by_email text,
  add column if not exists sent_by_name text,
  add column if not exists audience_type text default 'manual',
  add column if not exists metadata jsonb default '{}',
  add column if not exists created_at timestamptz default now();

create table if not exists sms_logs (
  id uuid default gen_random_uuid() primary key,
  recipient_phone text,
  recipient_name text,
  recipient_email text,
  sender_id text,
  message text,
  category text default 'general',
  provider text default 'clicksend',
  provider_message_id text,
  status text default 'queued',
  sent_by_email text,
  sent_by_name text,
  audience_type text default 'manual',
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
