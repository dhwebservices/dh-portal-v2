# DH Portal

## Project
- Name: `dh-portal-v2`
- Local path: `/Users/david/Downloads/dh-portal-v2`
- GitHub: [dhwebservices/dh-portal-v2](https://github.com/dhwebservices/dh-portal-v2)
- Live URL: [staff.dhwebsiteservices.co.uk](https://staff.dhwebsiteservices.co.uk)
- Last updated: `2026-04-08`
- Current production focus: workspace-based staff portal access, onboarding-first routing, manager/director operating views, and ongoing workflow hardening

## What This Portal Is
`DH Portal` is the internal operations platform for DH Website Services. It combines:
- staff login and identity
- HR and onboarding
- staff profiles and lifecycle controls
- department operations
- recruitment and hiring
- outreach and mailing list workflows
- client operations and support
- tasks, notifications, and reporting
- admin controls and approvals

The app is still one shared portal, but it now routes people more intentionally by workspace instead of expecting everyone to use one giant universal navigation.

## Stack
- React 18 + Vite
- `react-router-dom`
- Microsoft login via MSAL
- Supabase database and storage
- Recharts
- Cloudflare Pages for frontend hosting
- Cloudflare Worker + Resend for email-related flows where used

## Core Integration Files
- Microsoft auth config: `/Users/david/Downloads/dh-portal-v2/src/authConfig.js`
- Auth and access state: `/Users/david/Downloads/dh-portal-v2/src/contexts/AuthContext.jsx`
- Shared workspace resolver: `/Users/david/Downloads/dh-portal-v2/src/utils/workspaces.js`
- Router / landing logic: `/Users/david/Downloads/dh-portal-v2/src/App.jsx`
- Sidebar and workspace nav: `/Users/david/Downloads/dh-portal-v2/src/components/Sidebar.jsx`
- Header and workspace label: `/Users/david/Downloads/dh-portal-v2/src/components/Header.jsx`
- Main workspace dashboard: `/Users/david/Downloads/dh-portal-v2/src/pages/Dashboard.jsx`
- Staff profile workspace assignment: `/Users/david/Downloads/dh-portal-v2/src/pages/StaffProfile.jsx`
- HR profile workspace assignment: `/Users/david/Downloads/dh-portal-v2/src/pages/hr/HRProfiles.jsx`
- Onboarding review and release flow: `/Users/david/Downloads/dh-portal-v2/src/pages/hr/HROnboarding.jsx`
- Supabase client: `/Users/david/Downloads/dh-portal-v2/src/utils/supabase.js`

## Current Access Model
The portal now uses a layered access model:

1. Microsoft login
2. Load HR profile, org scope, permissions, and workspace assignment
3. If onboarding is required and incomplete, onboarding overrides everything
4. If onboarding is complete, route the user to their assigned workspace home
5. Keep shared self-service pages available underneath

### Supported workspaces
- `self_service`
- `outreach`
- `recruitment`
- `hr`
- `client_ops`
- `manager`
- `director`
- `admin`

### Workspace resolution
Workspaces come from either:
- explicit assignment stored in `portal_settings` using `staff_workspace:<email>`
- or inferred role/department/permission rules in `/Users/david/Downloads/dh-portal-v2/src/utils/workspaces.js`

### Important access rules now live
- Onboarding still overrides normal landing and nav
- Department managers automatically get department, staff, and hiring uplift
- Directors keep global access
- Existing page permissions still remain underneath as a safety layer during the migration

## Current Live Architecture

### Shared staff access
All normal staff can still reach:
- My Profile
- Notifications
- Search
- My Tasks
- Leave
- Payslips
- settings/self-service pages where allowed

### Workspace-aware routing and nav
- Landing after login now resolves by workspace instead of one default dashboard path
- `/workspace` exists as a workspace-aware landing alias
- Sidebar filtering is workspace-aware
- Sidebar ordering is now tailored by workspace
- Sidebar panel copy now reflects workspace context

### Workspace-aware dashboard
The dashboard now changes by workspace:
- hero copy
- toolbar note
- quick actions
- top stats
- team panel wording
- action queue wording

Manager and director workspaces now also have dedicated leadership panels:
- manager queue + manager snapshot + leadership shortcuts
- director escalation queue + executive snapshot + executive shortcuts

### Workspace assignment UI
Workspace assignment can now be managed from:
- `/Users/david/Downloads/dh-portal-v2/src/pages/StaffProfile.jsx`
- `/Users/david/Downloads/dh-portal-v2/src/pages/hr/HRProfiles.jsx`

### Onboarding handoff
When onboarding is approved in `/Users/david/Downloads/dh-portal-v2/src/pages/hr/HROnboarding.jsx`, the onboarding lock is now explicitly cleared so the user can transition into their assigned workspace correctly.

## Latest Production Changes

### Workspace rollout
- Added shared workspace resolver in `/Users/david/Downloads/dh-portal-v2/src/utils/workspaces.js`
- Added workspace label and home resolution in auth context
- Added workspace landing logic in `/Users/david/Downloads/dh-portal-v2/src/App.jsx`
- Added explicit workspace assignment support in Staff Profile and HR Profiles
- Added workspace label in the shared header

### Tailored navigation
- Sidebar now respects workspace-specific section ordering
- Sidebar panel now describes the current workspace context instead of behaving like a generic flyout

### Manager and director operating panels
- Manager workspace now surfaces:
  - department control queue
  - manager snapshot
  - leadership shortcuts
- Director workspace now surfaces:
  - escalation queue
  - executive snapshot
  - executive shortcuts

### Workflow hardening already completed in recent live passes
- Department page reload now respects delayed auth/profile context
- Notifications categorisation fixed for client-related items
- Header route title gaps fixed
- Staff profile invalid tab handling fixed
- Staff profile hardcoded Supabase REST access removed
- Duplicate task status notifications removed
- Outreach quick actions now preserve ownership and reminder metadata
- Recruitment resubmission now clears stale approval decision fields
- Recruitment deletion now cleans up linked records
- Client management support stats now use proper global ticket data
- Support save/delete actions now stop on backend errors
- Admin user list no longer overstates access for users with no permissions row

## Key Live Feature Areas

### People, HR, and staff operations
- HR profiles and staff profiles
- My Staff / My Team / My Department
- onboarding and onboarding approvals
- leave, payslips, timesheets, documents, policies
- contracts and contract queue
- training tracking
- compliance views
- lifecycle controls

### Commercial and client operations
- outreach queue and follow-up workflows
- mailing list
- send email and templates
- clients and client management
- support
- proposals
- website manager

### Hiring
- recruitment landing and role workspace
- job applications and candidate handling
- role approvals and hiring workflows

### Admin and oversight
- reports
- workflow automation
- manager board
- departments
- safeguards
- audit
- maintenance

## Next 4 Build Phases

### Phase 1: Workspace route cleanup
- move more route access from old page-permission thinking into workspace-first logic
- reduce leftover irrelevant links for each workspace
- tighten section-level route group ownership
- keep permission overrides only for edge cases and admin exceptions

### Phase 2: Dedicated workspace homes
- deepen `manager`, `director`, `outreach`, `recruitment`, and `hr` home views
- give each workspace a more role-specific summary and action model
- reduce generic dashboard sections for users who do not need them
- make workspace homes the obvious operating centre for each role

### Phase 3: Approval and escalation workflow consolidation
- map manager and director approval flows into one clearer workflow model
- preserve portal notifications and email notifications for escalations
- standardise statuses such as pending manager review / pending director approval
- make approval histories and action ownership easier to audit

### Phase 4: Workspace-first UX and mobile polish
- align mobile nav and mobile landing with workspace routing
- remove remaining duplicated or confusing navigation patterns
- make manager/director panels work cleanly on tablet/mobile widths
- continue simplifying dense pages without breaking workflows

## Build and Run
- Install:
  ```bash
  cd /Users/david/Downloads/dh-portal-v2
  npm install
  ```
- Run locally:
  ```bash
  npm run dev
  ```
- Production build:
  ```bash
  npm run build
  ```
- Preview build:
  ```bash
  npm run preview
  ```

## Deployment Notes
- Production deploy target: Cloudflare Pages
- Standard live branch: `main`
- In this project flow, only intended files should be copied into the clean production worktree before push if the main local worktree is mixed

## Current Cautions
- The permission model and the new workspace model currently coexist. This is intentional while the migration is still in progress.
- Some users may still depend on permission overrides even after workspace assignment exists.
- Supabase is still used directly from the frontend, so RLS/policy safety remains important.
- Email and notification workflows must remain intact while workspace routing evolves.

## Good Files To Read First In A New Chat
- `/Users/david/Downloads/dh-portal-v2/src/utils/workspaces.js`
- `/Users/david/Downloads/dh-portal-v2/src/contexts/AuthContext.jsx`
- `/Users/david/Downloads/dh-portal-v2/src/App.jsx`
- `/Users/david/Downloads/dh-portal-v2/src/components/Sidebar.jsx`
- `/Users/david/Downloads/dh-portal-v2/src/components/Header.jsx`
- `/Users/david/Downloads/dh-portal-v2/src/pages/Dashboard.jsx`
- `/Users/david/Downloads/dh-portal-v2/src/pages/StaffProfile.jsx`
- `/Users/david/Downloads/dh-portal-v2/src/pages/hr/HRProfiles.jsx`
- `/Users/david/Downloads/dh-portal-v2/src/pages/hr/HROnboarding.jsx`
