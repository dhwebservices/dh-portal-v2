-- ============================================================================
-- DH Website Builder - Database Schema (Clean Install)
-- Version: 1.0
-- Created: 2026-08-03
-- This will DROP existing tables and recreate them fresh
-- ============================================================================

-- WARNING: This will delete all existing website builder data!
-- Only run if you're starting fresh or OK with data loss

-- Drop existing tables (in reverse dependency order)
drop table if exists website_change_log cascade;
drop table if exists website_settings cascade;
drop table if exists website_components cascade;
drop table if exists website_assets cascade;
drop table if exists website_versions cascade;
drop table if exists website_pages cascade;

-- Drop functions
drop function if exists get_next_version_number(uuid) cascade;

-- ============================================================================
-- TABLE 1: website_pages
-- ============================================================================

create table website_pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  content jsonb not null default '{}'::jsonb,

  -- SEO
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

  -- Template
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
  settings jsonb default '{}'::jsonb,

  -- Audit
  created_by_email text not null,
  created_by_name text,
  updated_by_email text,
  updated_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint valid_slug check (slug ~ '^[a-z0-9-]+$')
);

create index idx_website_pages_slug on website_pages(slug);
create index idx_website_pages_status on website_pages(status);
create index idx_website_pages_category on website_pages(category);
create index idx_website_pages_tags on website_pages using gin(tags);
create unique index idx_website_pages_unique_template_name on website_pages(template_name) where is_template = true;

alter table website_pages enable row level security;
create policy "Allow all for authenticated users" on website_pages for all using (auth.uid() is not null);

-- ============================================================================
-- TABLE 2: website_versions
-- ============================================================================

create table website_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references website_pages(id) on delete cascade,
  version_number integer not null,
  label text,
  content jsonb not null,
  created_by_email text not null,
  created_by_name text,
  created_at timestamptz default now(),
  constraint unique_version_per_page unique (page_id, version_number)
);

create index idx_website_versions_page_id on website_versions(page_id, version_number desc);

alter table website_versions enable row level security;
create policy "Allow all for authenticated users" on website_versions for all using (auth.uid() is not null);

-- ============================================================================
-- TABLE 3: website_assets
-- ============================================================================

create table website_assets (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  original_filename text not null,
  file_type text not null,
  mime_type text not null,
  file_extension text not null,
  storage_url text not null,
  storage_path text not null,
  storage_provider text default 'r2',
  file_size_bytes bigint not null,
  width integer,
  height integer,
  duration_seconds numeric,
  thumbnail_url text,
  thumbnail_small_url text,
  thumbnail_medium_url text,
  thumbnail_large_url text,
  folder text,
  tags text[],
  alt_text text,
  caption text,
  used_in_pages uuid[],
  download_count integer default 0,
  optimized boolean default false,
  original_size_bytes bigint,
  uploaded_by_email text not null,
  uploaded_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_website_assets_file_type on website_assets(file_type);
create index idx_website_assets_folder on website_assets(folder);
create index idx_website_assets_tags on website_assets using gin(tags);

alter table website_assets enable row level security;
create policy "Allow all for authenticated users" on website_assets for all using (auth.uid() is not null);

-- ============================================================================
-- TABLE 4: website_components
-- ============================================================================

create table website_components (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  component_json jsonb not null,
  preview_image text,
  category text,
  tags text[],
  is_global boolean default false,
  is_template boolean default false,
  used_count integer default 0,
  last_used_at timestamptz,
  created_by_email text not null,
  created_by_name text,
  updated_by_email text,
  updated_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_website_components_category on website_components(category);
create index idx_website_components_is_global on website_components(is_global) where is_global = true;

alter table website_components enable row level security;
create policy "Allow all for authenticated users" on website_components for all using (auth.uid() is not null);

-- ============================================================================
-- TABLE 5: website_settings
-- ============================================================================

create table website_settings (
  id uuid primary key default gen_random_uuid(),
  site_name text default 'DH Website Services',
  site_tagline text,
  site_logo_url text,
  site_favicon_url text,
  theme jsonb default '{}'::jsonb,
  default_meta_description text,
  default_og_image text,
  header_scripts text,
  footer_scripts text,
  header_menu jsonb default '[]'::jsonb,
  footer_menu jsonb default '[]'::jsonb,
  social_links jsonb default '{}'::jsonb,
  contact_email text,
  contact_phone text,
  contact_address text,
  features jsonb default '{}'::jsonb,
  updated_by_email text,
  updated_by_name text,
  updated_at timestamptz default now()
);

create unique index idx_website_settings_singleton on website_settings ((true));

alter table website_settings enable row level security;
create policy "Allow read for all" on website_settings for select using (true);
create policy "Allow update for authenticated users" on website_settings for update using (auth.uid() is not null);

-- ============================================================================
-- TABLE 6: website_change_log
-- ============================================================================

create table website_change_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  changes jsonb,
  description text,
  user_email text not null,
  user_name text,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create index idx_website_change_log_entity on website_change_log(entity_type, entity_id);
create index idx_website_change_log_user on website_change_log(user_email);
create index idx_website_change_log_created_at on website_change_log(created_at desc);

alter table website_change_log enable row level security;
create policy "Allow all for authenticated users" on website_change_log for all using (auth.uid() is not null);

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

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

-- ============================================================================
-- DEFAULT SETTINGS
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
);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

select
  'website_pages' as table_name,
  count(*) as row_count
from website_pages
union all
select 'website_versions', count(*) from website_versions
union all
select 'website_assets', count(*) from website_assets
union all
select 'website_components', count(*) from website_components
union all
select 'website_settings', count(*) from website_settings
union all
select 'website_change_log', count(*) from website_change_log;

-- Success!
select '✅ Website Builder schema created successfully!' as status;
