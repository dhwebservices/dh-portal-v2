-- Audit log
create table audit_log (
  id uuid default gen_random_uuid() primary key,
  user_email text not null,
  user_name text,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb,
  created_at timestamp with time zone default now()
);

-- Sessions (active logins)
create table active_sessions (
  id uuid default gen_random_uuid() primary key,
  user_email text not null,
  user_name text,
  logged_in_at timestamp with time zone default now(),
  last_seen timestamp with time zone default now(),
  user_agent text
);

-- Client notes
create table client_notes (
  id uuid default gen_random_uuid() primary key,
  client_id text not null,
  client_name text,
  note text not null,
  created_by text,
  created_at timestamp with time zone default now()
);

-- Client onboarding checklist
create table client_checklist (
  id uuid default gen_random_uuid() primary key,
  client_id text not null unique,
  nda_signed boolean default false,
  contract_sent boolean default false,
  first_invoice_paid boolean default false,
  website_started boolean default false,
  website_complete boolean default false,
  access_sent boolean default false,
  updated_at timestamp with time zone default now()
);

-- Notifications
create table notifications (
  id uuid default gen_random_uuid() primary key,
  user_email text,
  title text not null,
  message text,
  type text default 'info',
  read boolean default false,
  link text,
  created_at timestamp with time zone default now()
);

-- RLS
alter table audit_log        enable row level security;
alter table active_sessions  enable row level security;
alter table client_notes     enable row level security;
alter table client_checklist enable row level security;
alter table notifications    enable row level security;

create policy "Allow all" on audit_log        for all using (true) with check (true);
create policy "Allow all" on active_sessions  for all using (true) with check (true);
create policy "Allow all" on client_notes     for all using (true) with check (true);
create policy "Allow all" on client_checklist for all using (true) with check (true);
create policy "Allow all" on notifications    for all using (true) with check (true);

-- Page permissions per user (replaces localStorage)
create table if not exists user_permissions (
  id uuid default gen_random_uuid() primary key,
  user_email text not null unique,
  permissions jsonb not null default '{}',
  updated_by text,
  updated_at timestamp with time zone default now()
);
alter table user_permissions enable row level security;
create policy "Allow all" on user_permissions for all using (true) with check (true);

-- Email templates
create table if not exists email_templates (
  id uuid default gen_random_uuid() primary key,
  type text not null unique,
  name text not null,
  subject text not null,
  heading text not null,
  body text not null,
  button_text text,
  button_link text,
  footer_note text,
  updated_by text,
  updated_at timestamp with time zone default now()
);
alter table email_templates enable row level security;
create policy "Allow all" on email_templates for all using (true) with check (true);

-- Seed default templates
insert into email_templates (type, name, subject, heading, body, button_text, button_link, footer_note) values
(
  'support_ticket_raised',
  'Support Ticket — Notify Staff',
  '[Support] New ticket from {{clientName}} — {{subject}}',
  'New Support Ticket 💬',
  'A client has raised a support query through the portal.',
  'Reply in Staff Portal',
  'https://staff.dhwebsiteservices.co.uk/support',
  ''
),
(
  'support_ticket_reply',
  'Support Reply — Notify Client',
  'Reply to your support query: {{subject}}',
  'We''ve replied to your query 👋',
  'Hi {{clientName}}, our team has responded to your support query. You can view the full conversation in your client portal.',
  'View in Your Portal',
  'https://app.dhwebsiteservices.co.uk/support',
  'If you have further questions, please reply through your client portal.'
),
(
  'invoice_issued',
  'Invoice Issued — Notify Client',
  'Invoice {{invoiceNumber}} — £{{amount}} | DH Website Services',
  'New Invoice 📄',
  'Hi {{clientName}}, a new invoice has been issued for your account.',
  'Pay Now',
  '{{stripeLink}}',
  'You can also view and manage all invoices in your client portal.'
),
(
  'client_welcome',
  'Welcome Pack — New Client',
  'Welcome to DH Website Services — Your Portal is Ready',
  'Welcome aboard! 🎉',
  'Hi {{clientName}}, we''re excited to have you as a client. Your personal client portal is now set up and ready to use.',
  'Access Your Portal',
  'https://app.dhwebsiteservices.co.uk',
  'To log in, click the button above and sign in with your Microsoft account. If you have any trouble, contact us at clients@dhwebsiteservices.co.uk.'
)
on conflict (type) do nothing;
