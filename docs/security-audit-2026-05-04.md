# Security Audit — 2026-05-04

## Scope
- Code review of authentication, browser storage, Supabase access, Workers/functions, storage access, and HTML rendering flows
- Live header check against `https://staff.dhwebsiteservices.co.uk`
- Dependency audit of production dependencies

## Confirmed Findings
### Critical
- Supabase authorization is not enforceable from the current app architecture.
  - The frontend uses a public anon key directly.
  - The schema currently enables RLS with blanket `allow_all` policies, so table protections are effectively open once reachable from client code.
  - Impact: broken access control risk across HR, payroll, documents, portal settings, and admin workflows.
  - Required fix: move sensitive reads/writes behind backend-controlled routes or worker mediation, then replace `allow_all` policies with role- and ownership-based policies.

### High
- Privileged authorization is largely enforced in React rather than by a trusted backend boundary.
  - Impact: hidden UI is not a security control; direct API/database requests remain the real control plane.
  - Required fix: server-enforced authorization for sensitive mutations.

- Impersonation / preview mode is a sensitive admin capability and needed stronger security logging.
  - Status: partially remediated in repo by structured security audit events for preview start, stop, and denied attempts.

### Medium
- Microsoft auth cache used `localStorage`.
  - Status: remediated in repo by moving MSAL cache to `sessionStorage`.

- No CSP or full browser hardening header set was visible on the live deployment.
  - Live check before repo changes showed `referrer-policy` and `x-content-type-options`, but no `Content-Security-Policy` or `Strict-Transport-Security`.
  - Status: remediated in repo via `public/_headers`; still requires Cloudflare deployment to take effect.

- Multiple HTML rendering flows trusted merged template HTML.
  - Affected areas: staff contracts, client contracts, onboarding contract review, and staff sign-doc previews.
  - Status: remediated in repo by sanitizing rendered HTML with DOMPurify before preview/PDF render.

- Public SMS function had no origin restriction or abuse caps.
  - Status: remediated in repo with origin allowlist and basic request limits.

## Dependency Findings
- `npm audit --omit=dev` now returns `0` vulnerabilities after:
  - adding direct `dompurify`
  - upgrading `recharts` to a version that no longer pulls the vulnerable `lodash` chain

## Live-Site Findings
### Observed before header hardening deploy
- `access-control-allow-origin: *`
- missing CSP
- missing HSTS

### Required production checks after deploy
- confirm `public/_headers` is applied by Cloudflare Pages
- verify CSP does not break Microsoft login or Supabase/worker requests
- verify no inline/script violations in console after sign-doc, contract, and dashboard flows

## Repo Changes Applied
- `src/authConfig.js`
  - MSAL cache moved to `sessionStorage`
- `src/utils/sanitizeHtml.js`
  - centralized DOMPurify sanitization utility added
- `src/utils/contracts.js`
- `src/utils/clientContracts.js`
- `src/utils/staffSignDocuments.js`
  - rendered HTML sanitized before preview/PDF generation
- `src/utils/audit.js`
  - structured security event helper added
- `src/contexts/AuthContext.jsx`
  - login and impersonation events now logged with security context
- `functions/api/send-sms.js`
  - origin allowlist and request caps added
- `workers/meeting-reminders.js`
  - manual `/run` trigger now requires a configured shared secret and fails closed if the secret is missing
- `workers/microsoft-calendar-sync.js`
  - manual `/run-sync` trigger now requires a configured shared secret and fails closed if the secret is missing
- `functions/api/enqueue-calendar-sync.js`
  - calendar sync job queue writes now go through a same-origin Pages function with service-role mediation instead of direct browser writes
- `functions/api/sms-logs.js`
  - SMS log reads now go through a same-origin Pages function with service-role mediation instead of direct browser reads
- `functions/api/audit-log.js`
  - audit log reads, writes, and retention clears now go through a same-origin Pages function with service-role mediation instead of direct browser table access
- `functions/api/send-email.js`
  - shared email sends now go through a same-origin Pages function, with optional server-side `email_log` writes and outreach auto-log handling
- `functions/api/email-log.js`
  - email log reads now go through a same-origin Pages function with service-role mediation instead of direct browser reads
- `src/utils/microsoftCalendarSyncQueue.js`
  - frontend queue helper no longer writes directly to `microsoft_calendar_sync_jobs`
- `src/utils/smsLogs.js`
  - frontend SMS Centre log fetches now call the mediated API instead of querying `sms_logs` directly
- `src/utils/email.js`
  - frontend email sends now call the mediated API instead of posting to the worker URL directly
- `src/utils/emailLogs.js`
  - centralized email log read helper added for UI screens
- `src/utils/audit.js`
  - audit writes now go through the mediated API path instead of direct browser writes to `audit_log`
- `src/utils/auditApi.js`
  - centralized audit log read and clear helpers added for UI screens
- `src/pages/SmsCentre.jsx`
  - SMS Centre log loading now uses the mediated API path
- `src/pages/AuditLog.jsx`
- `src/pages/Dashboard.jsx`
- `src/pages/MyDepartment.jsx`
- `src/pages/MyTeam.jsx`
- `src/pages/Reports.jsx`
- `src/pages/Settings.jsx`
  - no longer query or delete `audit_log` directly from the browser
- `src/pages/SendEmail.jsx`
  - manual staff email sends now request server-side logging instead of inserting into `email_log` directly from the browser
- `src/pages/Outreach.jsx`
- `src/pages/MyDepartment.jsx`
- `src/pages/MyTeam.jsx`
  - no longer query `email_log` directly from the browser
- `src/pages/Appointments.jsx`
- `src/pages/StaffProfile.jsx`
- `src/pages/WebManager.jsx`
  - direct browser posts to the email worker were removed in favor of the mediated email API
- `scripts/2026-05-04-lock-microsoft-calendar-sync-jobs.sql`
  - drops the public `allow_all` policy from the calendar sync job queue table so anon/authenticated browser roles cannot write to it directly
- `scripts/2026-05-04-lock-sms-logs.sql`
  - drops the public `allow_all` policy from the SMS log table so anon/authenticated browser roles cannot read or write it directly
- `scripts/2026-05-04-lock-audit-log.sql`
  - drops the public `allow_all` policy from `audit_log` so anon/authenticated browser roles cannot read, write, or clear it directly
- `scripts/2026-05-05-lock-email-log.sql`
  - drops the public `allow_all` policy from `email_log` so anon/authenticated browser roles cannot read or write it directly
- `scripts/2026-05-05-lock-microsoft-calendar-private-tables.sql`
  - drops the public `allow_all` policies from `microsoft_calendar_connections` and `microsoft_calendar_sync_links`, which are worker-only tables
- `public/_headers`
  - CSP and standard security headers added
- `scripts/security-check.mjs`
  - static guardrails added for approved `dangerouslySetInnerHTML`, approved `localStorage`, and basic hardcoded-secret pattern detection
  - frontend guardrails now also block direct browser access to isolated tables (`audit_log`, `email_log`, `sms_logs`, and Microsoft calendar sync tables)
- `.github/workflows/security.yml`
  - now runs both build and static repo guardrails before dependency audit

## Remaining Work
- Redesign Supabase access model so sensitive tables are not directly writable/readable from untrusted browser code.
- Replace `allow_all` RLS policies with explicit role/ownership policies after backend trust boundaries exist.
- Add Cloudflare-side rate limiting and WAF rules for sensitive routes and worker endpoints.
- Review Microsoft Entra app registration, redirect URIs, scopes, and conditional access settings.
- Expand static scanning into table-specific authorization tests once worker/API mediation exists.
- Move more privileged browser-triggered actions behind worker routes with equivalent secret/auth controls.
