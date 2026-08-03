-- ============================================================================
-- DH Website Builder - Database Schema
-- Version: 1.0
-- Created: 2026-08-03
-- Description: Complete database schema for visual website builder
-- ============================================================================

-- Run this entire file in Supabase SQL Editor to set up all tables,
-- indexes, RLS policies, functions, and triggers.

-- ============================================================================
-- TABLE 1: website_pages
-- Primary table for all pages (including templates)
-- ============================================================================

create table if not exists website_pages (
  id uuid primary key default gen_random_uuid(),

  -- Identity
  slug text unique not null,
  title text not null,

  -- Content (GrapesJS JSON structure)
  content jsonb not null default '{}'::jsonb,
  -- Expected structure:
  -- {
  --   "html": "<div>...</div>",
  --   "css": ".class { ... }",
  --   "components": [...],
  --   "styles": [...]
  -- }

  -- SEO Metadata
  meta_description text,
  meta_keywords text[],
  og_title text,
  og_description text,
  og_image text,
  og_type text default 'website',
  twitter_card text default 'summary_large_image',
  twitter_title text,
  twitter_description text,
  twitter_image text,
  canonical_url text,
  robots text default 'index,follow',
  structured_data jsonb,

  -- Publishing
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  scheduled_publish_at timestamptz,

  -- Template Support
  is_template boolean default false,
  template_name text,
  template_category text,
  template_preview_image text,
  template_description text,

  -- Organization
  category text,
  tags text[],
  parent_page_id uuid references website_pages(id) on delete set null,
  sort_order integer default 0,

  -- Page Settings
  settings jsonb default '{}'::jsonb,
  -- Expected structure:
  -- {
  --   "layout": "full-width" | "boxed",
  --   "headerStyle": "default" | "transparent",
  --   "showHeader": true,
  --   "showFooter": true,
  --   "customCSS": "...",
  --   "customJS": "...",
  --   "password": "..." (for protected pages)
  -- }

  -- Audit Trail
  created_by_email text not null,
  created_by_name text,
  updated_by_email text,
  updated_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Constraints
  constraint valid_slug check (slug ~ '^[a-z0-9-]+$')
);

-- Indexes for Performance
create index if not exists idx_website_pages_slug on website_pages(slug);
create index if not exists idx_website_pages_status on website_pages(status);
create index if not exists idx_website_pages_published_at on website_pages(published_at) where status = 'published';
create index if not exists idx_website_pages_is_template on website_pages(is_template) where is_template = true;

-- Partial unique index for template names (only when is_template = true)
create unique index if not exists idx_website_pages_unique_template_name
  on website_pages(template_name) where is_template = true;
create index if not exists idx_website_pages_category on website_pages(category);
create index if not exists idx_website_pages_tags on website_pages using gin(tags);
create index if not exists idx_website_pages_created_at on website_pages(created_at desc);

-- Full-Text Search Index
create index if not exists idx_website_pages_search on website_pages using gin(
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(meta_description, ''))
);

-- Row Level Security
alter table website_pages enable row level security;

create policy "website_pages_select" on website_pages
  for select using (
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_editor' = 'true'
    )
  );

create policy "website_pages_insert" on website_pages
  for insert with check (
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_editor' = 'true'
    )
  );

create policy "website_pages_update" on website_pages
  for update using (
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_editor' = 'true'
    )
  );

create policy "website_pages_delete" on website_pages
  for delete using (
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_editor' = 'true'
    )
  );

-- ============================================================================
-- TABLE 2: website_versions
-- Version history for rollback capability
-- ============================================================================

create table if not exists website_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references website_pages(id) on delete cascade,

  -- Version Data
  version_number integer not null,
  label text, -- Optional user label e.g., "Before redesign"
  content jsonb not null,

  -- Metadata
  created_by_email text not null,
  created_by_name text,
  created_at timestamptz default now(),

  -- Constraints
  constraint unique_version_per_page unique (page_id, version_number)
);

-- Indexes
create index if not exists idx_website_versions_page_id on website_versions(page_id, version_number desc);
create index if not exists idx_website_versions_created_at on website_versions(created_at desc);

-- Auto-Delete Versions Older Than 30 Days
create or replace function delete_old_versions()
returns trigger as $$
begin
  delete from website_versions
  where page_id = new.page_id
  and created_at < now() - interval '30 days';
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_delete_old_versions on website_versions;
create trigger trigger_delete_old_versions
  after insert on website_versions
  for each row execute function delete_old_versions();

-- Row Level Security
alter table website_versions enable row level security;

create policy "website_versions_select" on website_versions
  for select using (
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_editor' = 'true'
    )
  );

create policy "website_versions_insert" on website_versions
  for insert with check (
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_editor' = 'true'
    )
  );

-- ============================================================================
-- TABLE 3: website_assets
-- Media library for images, videos, documents
-- ============================================================================

create table if not exists website_assets (
  id uuid primary key default gen_random_uuid(),

  -- File Details
  filename text not null,
  original_filename text not null,
  file_type text not null, -- 'image', 'video', 'document', 'other'
  mime_type text not null,
  file_extension text not null,

  -- Storage
  storage_url text not null, -- Full public URL
  storage_path text not null, -- Path in bucket
  storage_provider text default 'r2', -- 'r2' or 'supabase'

  -- Size and Dimensions
  file_size_bytes bigint not null,
  width integer, -- for images/videos
  height integer, -- for images/videos
  duration_seconds numeric, -- for videos

  -- Thumbnails (auto-generated for images/videos)
  thumbnail_url text,
  thumbnail_small_url text, -- 150x150
  thumbnail_medium_url text, -- 300x300
  thumbnail_large_url text, -- 600x600

  -- Organization
  folder text, -- folder path like "logos", "products/category-a"
  tags text[],
  alt_text text, -- for accessibility
  caption text,

  -- Usage Tracking
  used_in_pages uuid[], -- array of page IDs using this asset
  download_count integer default 0,

  -- Optimization
  optimized boolean default false,
  original_size_bytes bigint, -- before optimization

  -- Audit
  uploaded_by_email text not null,
  uploaded_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_website_assets_file_type on website_assets(file_type);
create index if not exists idx_website_assets_folder on website_assets(folder);
create index if not exists idx_website_assets_tags on website_assets using gin(tags);
create index if not exists idx_website_assets_uploaded_by on website_assets(uploaded_by_email);
create index if not exists idx_website_assets_created_at on website_assets(created_at desc);

-- Full-Text Search
create index if not exists idx_website_assets_search on website_assets using gin(
  to_tsvector('english',
    coalesce(filename, '') || ' ' ||
    coalesce(alt_text, '') || ' ' ||
    coalesce(caption, '')
  )
);

-- Row Level Security
alter table website_assets enable row level security;

create policy "website_assets_select" on website_assets
  for select using (
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_editor' = 'true'
    )
  );

create policy "website_assets_insert" on website_assets
  for insert with check (
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_editor' = 'true'
    )
  );

create policy "website_assets_update" on website_assets
  for update using (
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_editor' = 'true'
    )
  );

create policy "website_assets_delete" on website_assets
  for delete using (
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_editor' = 'true'
    )
  );

-- ============================================================================
-- TABLE 4: website_components
-- Reusable custom components library
-- ============================================================================

create table if not exists website_components (
  id uuid primary key default gen_random_uuid(),

  -- Identity
  name text not null,
  description text,

  -- Component Data (GrapesJS component structure)
  component_json jsonb not null,
  preview_image text, -- screenshot of component

  -- Organization
  category text, -- 'hero', 'footer', 'cta', 'pricing', etc.
  tags text[],

  -- Sharing
  is_global boolean default false, -- available to all staff
  is_template boolean default false, -- appears in template library

  -- Usage
  used_count integer default 0,
  last_used_at timestamptz,

  -- Audit
  created_by_email text not null,
  created_by_name text,
  updated_by_email text,
  updated_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_website_components_category on website_components(category);
create index if not exists idx_website_components_is_global on website_components(is_global) where is_global = true;
create index if not exists idx_website_components_created_at on website_components(created_at desc);

-- Row Level Security
alter table website_components enable row level security;

create policy "website_components_select" on website_components
  for select using (
    is_global = true or
    created_by_email = (select auth.jwt()->>'email') or
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_editor' = 'true'
    )
  );

create policy "website_components_insert" on website_components
  for insert with check (
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_editor' = 'true'
    )
  );

create policy "website_components_update" on website_components
  for update using (
    created_by_email = (select auth.jwt()->>'email') or
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_admin' = 'true'
    )
  );

create policy "website_components_delete" on website_components
  for delete using (
    created_by_email = (select auth.jwt()->>'email')
  );

-- ============================================================================
-- TABLE 5: website_settings
-- Global website settings and configuration
-- ============================================================================

create table if not exists website_settings (
  id uuid primary key default gen_random_uuid(),

  -- Site Identity
  site_name text default 'DH Website Services',
  site_tagline text,
  site_logo_url text,
  site_favicon_url text,

  -- Design Tokens
  theme jsonb default '{}'::jsonb,
  -- Expected structure:
  -- {
  --   "colors": {
  --     "primary": "#b8960c",
  --     "secondary": "#1a1612",
  --     "accent": "#...",
  --     "text": "#...",
  --     "background": "#..."
  --   },
  --   "fonts": {
  --     "heading": "Poppins",
  --     "body": "Inter"
  --   },
  --   "spacing": {...},
  --   "borderRadius": {...}
  -- }

  -- Default SEO
  default_meta_description text,
  default_og_image text,

  -- Global Scripts
  header_scripts text, -- Google Analytics, etc.
  footer_scripts text,

  -- Navigation
  header_menu jsonb default '[]'::jsonb,
  footer_menu jsonb default '[]'::jsonb,

  -- Social Media Links
  social_links jsonb default '{}'::jsonb,
  -- {
  --   "facebook": "https://...",
  --   "twitter": "https://...",
  --   "linkedin": "https://...",
  --   "instagram": "https://..."
  -- }

  -- Contact Information
  contact_email text,
  contact_phone text,
  contact_address text,

  -- Feature Flags
  features jsonb default '{}'::jsonb,
  -- {
  --   "enableBlog": false,
  --   "enablePortfolio": true,
  --   "enableEcommerce": false,
  --   "maintenanceMode": false
  -- }

  -- Audit
  updated_by_email text,
  updated_by_name text,
  updated_at timestamptz default now()
);

-- Only One Settings Record Should Exist
create unique index if not exists idx_website_settings_singleton on website_settings ((true));

-- Row Level Security
alter table website_settings enable row level security;

create policy "website_settings_select" on website_settings
  for select using (true); -- Anyone can read settings

create policy "website_settings_update" on website_settings
  for update using (
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_admin' = 'true'
    )
  );

-- ============================================================================
-- TABLE 6: website_change_log
-- Audit trail for all website changes
-- ============================================================================

create table if not exists website_change_log (
  id uuid primary key default gen_random_uuid(),

  -- What Changed
  entity_type text not null, -- 'page', 'asset', 'component', 'settings'
  entity_id uuid,
  action text not null, -- 'create', 'update', 'delete', 'publish', 'unpublish'

  -- Changes (before/after data)
  changes jsonb,
  description text,

  -- Context
  user_email text not null,
  user_name text,
  ip_address text,
  user_agent text,

  -- Timestamp
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_website_change_log_entity on website_change_log(entity_type, entity_id);
create index if not exists idx_website_change_log_user on website_change_log(user_email);
create index if not exists idx_website_change_log_created_at on website_change_log(created_at desc);

-- Row Level Security
alter table website_change_log enable row level security;

create policy "website_change_log_select" on website_change_log
  for select using (
    exists (
      select 1 from user_permissions
      where user_email = auth.jwt()->>'email'
      and permissions->>'website_admin' = 'true'
    )
  );

create policy "website_change_log_insert" on website_change_log
  for insert with check (true); -- System can always insert

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Function: Get Next Version Number for a Page
create or replace function get_next_version_number(p_page_id uuid)
returns integer as $$
declare
  v_next_version integer;
begin
  select coalesce(max(version_number), 0) + 1
  into v_next_version
  from website_versions
  where page_id = p_page_id;

  return v_next_version;
end;
$$ language plpgsql;

-- Function: Log Change to Audit Trail
create or replace function log_website_change(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_description text,
  p_user_email text,
  p_user_name text
)
returns uuid as $$
declare
  v_log_id uuid;
begin
  insert into website_change_log (
    entity_type,
    entity_id,
    action,
    description,
    user_email,
    user_name
  ) values (
    p_entity_type,
    p_entity_id,
    p_action,
    p_description,
    p_user_email,
    p_user_name
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$ language plpgsql;

-- ============================================================================
-- INSERT DEFAULT SETTINGS RECORD
-- ============================================================================

insert into website_settings (
  site_name,
  site_tagline,
  theme,
  features
) values (
  'DH Website Services',
  'Professional Website Design & Development',
  '{
    "colors": {
      "primary": "#b8960c",
      "secondary": "#1a1612",
      "accent": "#d4af37",
      "text": "#1a1a1a",
      "background": "#ffffff"
    },
    "fonts": {
      "heading": "Poppins, sans-serif",
      "body": "Inter, sans-serif"
    }
  }'::jsonb,
  '{
    "enableBlog": false,
    "enablePortfolio": true,
    "enableEcommerce": false,
    "maintenanceMode": false
  }'::jsonb
)
on conflict do nothing;

-- ============================================================================
-- SCHEMA SETUP COMPLETE
-- ============================================================================

-- Verify Tables Created
select
  schemaname,
  tablename,
  tableowner
from pg_tables
where tablename like 'website_%'
order by tablename;

-- Success Message
do $$
begin
  raise notice '✅ Website Builder schema created successfully!';
  raise notice 'Tables created: website_pages, website_versions, website_assets, website_components, website_settings, website_change_log';
  raise notice 'All RLS policies, indexes, and functions are active.';
  raise notice 'Next step: Grant website_editor permission to staff users.';
end $$;
