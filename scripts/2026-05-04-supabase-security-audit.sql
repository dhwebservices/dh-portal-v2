-- DH Portal security audit helper
-- Date: 2026-05-04
--
-- This script is intentionally read-first. It is safe to run in Supabase SQL editor
-- to inspect the current RLS/policy posture before replacing the current blanket
-- allow-all model.
--
-- Do not apply deny-all or ownership policies until sensitive browser writes have
-- been migrated behind trusted worker/API boundaries.

-- 1. List every public table and whether RLS is enabled.
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
join pg_class on pg_class.relname = pg_tables.tablename
join pg_namespace on pg_namespace.oid = pg_class.relnamespace and pg_namespace.nspname = pg_tables.schemaname
where schemaname = 'public'
order by tablename;

-- 2. List active policies and quickly surface blanket allow-all entries.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check,
  case
    when coalesce(qual, '') = 'true' and coalesce(with_check, '') = 'true' then 'ALLOW_ALL'
    else 'SCOPED_OR_CUSTOM'
  end as policy_shape
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. Tables that still use the blanket allow-all policy style.
select
  schemaname,
  tablename,
  policyname
from pg_policies
where schemaname = 'public'
  and coalesce(qual, '') = 'true'
  and coalesce(with_check, '') = 'true'
order by tablename, policyname;

-- 4. Storage policies audit.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
order by tablename, policyname;

-- 5. Recommended hardening order
--    a) worker/service endpoints for sensitive writes
--    b) storage access mediation
--    c) deny-all replacement policies table-by-table
--
-- Suggested first-wave tables:
--   audit_log
--   user_permissions
--   hr_profiles
--   portal_settings
--   payslips
--   staff_documents
--   notifications
--   leave_requests
--   outreach
