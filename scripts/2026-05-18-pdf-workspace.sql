create extension if not exists pgcrypto;

create table if not exists public.pdf_folders (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'personal' check (scope in ('personal', 'shared', 'template')),
  name text not null,
  slug text not null,
  owner_email text,
  library_key text not null default 'personal',
  parent_id uuid references public.pdf_folders(id) on delete set null,
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_by_email text not null default '',
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pdf_folders_scope_slug_idx
  on public.pdf_folders (scope, library_key, slug, coalesce(owner_email, ''))
  where deleted_at is null;

create table if not exists public.pdf_documents (
  id uuid primary key default gen_random_uuid(),
  root_document_id uuid references public.pdf_documents(id) on delete set null,
  source_document_id uuid references public.pdf_documents(id) on delete set null,
  version_number integer not null default 1,
  scope text not null default 'personal' check (scope in ('personal', 'shared', 'template')),
  library_key text not null default 'personal',
  folder_id uuid references public.pdf_folders(id) on delete set null,
  owner_email text not null default '',
  owner_name text not null default '',
  created_by_email text not null default '',
  created_by_name text not null default '',
  title text not null,
  filename text not null,
  mime_type text not null default 'application/pdf',
  file_size bigint not null default 0,
  bucket text not null default 'pdf-workspace',
  original_path text not null,
  latest_path text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'review', 'awaiting_signature', 'final', 'archived', 'deleted')),
  tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_template boolean not null default false,
  is_final boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pdf_documents_owner_idx on public.pdf_documents (owner_email, created_at desc);
create index if not exists pdf_documents_scope_idx on public.pdf_documents (scope, library_key, created_at desc);
create index if not exists pdf_documents_folder_idx on public.pdf_documents (folder_id, created_at desc);

create table if not exists public.pdf_jobs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  owner_email text not null default '',
  owner_name text not null default '',
  created_by_email text not null default '',
  created_by_name text not null default '',
  input_document_ids jsonb not null default '[]'::jsonb,
  output_document_ids jsonb not null default '[]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists pdf_jobs_owner_idx on public.pdf_jobs (owner_email, created_at desc);

create table if not exists public.pdf_annotations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.pdf_documents(id) on delete cascade,
  page_number integer not null default 1,
  annotation_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by_email text not null default '',
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pdf_annotations_document_idx on public.pdf_annotations (document_id, created_at asc);

create table if not exists public.pdf_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.pdf_documents(id) on delete cascade,
  folder_id uuid references public.pdf_folders(id) on delete cascade,
  shared_with_email text,
  shared_with_permission text,
  access_level text not null default 'view' check (access_level in ('view', 'comment', 'edit', 'admin')),
  metadata jsonb not null default '{}'::jsonb,
  created_by_email text not null default '',
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pdf_shares_document_idx on public.pdf_shares (document_id);
create index if not exists pdf_shares_folder_idx on public.pdf_shares (folder_id);
create index if not exists pdf_shares_email_idx on public.pdf_shares (shared_with_email);

create table if not exists public.pdf_audit (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.pdf_documents(id) on delete set null,
  folder_id uuid references public.pdf_folders(id) on delete set null,
  action text not null,
  actor_email text not null default '',
  actor_name text not null default '',
  scope text not null default 'personal',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pdf_audit_actor_idx on public.pdf_audit (actor_email, created_at desc);
create index if not exists pdf_audit_document_idx on public.pdf_audit (document_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'pdf-workspace',
  'pdf-workspace',
  false,
  52428800,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
where not exists (
  select 1 from storage.buckets where id = 'pdf-workspace'
);

alter table public.pdf_folders enable row level security;
alter table public.pdf_documents enable row level security;
alter table public.pdf_jobs enable row level security;
alter table public.pdf_annotations enable row level security;
alter table public.pdf_shares enable row level security;
alter table public.pdf_audit enable row level security;

drop policy if exists pdf_folders_allow_all on public.pdf_folders;
drop policy if exists pdf_documents_allow_all on public.pdf_documents;
drop policy if exists pdf_jobs_allow_all on public.pdf_jobs;
drop policy if exists pdf_annotations_allow_all on public.pdf_annotations;
drop policy if exists pdf_shares_allow_all on public.pdf_shares;
drop policy if exists pdf_audit_allow_all on public.pdf_audit;

create policy pdf_folders_allow_all on public.pdf_folders for all using (true) with check (true);
create policy pdf_documents_allow_all on public.pdf_documents for all using (true) with check (true);
create policy pdf_jobs_allow_all on public.pdf_jobs for all using (true) with check (true);
create policy pdf_annotations_allow_all on public.pdf_annotations for all using (true) with check (true);
create policy pdf_shares_allow_all on public.pdf_shares for all using (true) with check (true);
create policy pdf_audit_allow_all on public.pdf_audit for all using (true) with check (true);

drop policy if exists pdf_workspace_objects_allow_all on storage.objects;
create policy pdf_workspace_objects_allow_all on storage.objects
  for all
  using (bucket_id = 'pdf-workspace')
  with check (bucket_id = 'pdf-workspace');
