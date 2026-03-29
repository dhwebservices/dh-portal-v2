create table banners (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  message text not null,
  type text default 'info',
  display_type text default 'banner',
  target text default 'all',
  target_email text,
  active boolean default true,
  dismissible boolean default true,
  starts_at timestamp with time zone default now(),
  ends_at timestamp with time zone,
  created_by text,
  created_at timestamp with time zone default now()
);

create table banner_dismissals (
  id uuid default gen_random_uuid() primary key,
  banner_id uuid references banners(id) on delete cascade,
  user_email text not null,
  dismissed_at timestamp with time zone default now()
);

alter table banners           enable row level security;
alter table banner_dismissals enable row level security;
create policy "Allow all" on banners           for all using (true) with check (true);
create policy "Allow all" on banner_dismissals for all using (true) with check (true);
