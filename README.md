# DH Portal

> This file is auto-generated from `docs/portal-status.json`. Update the metadata file, then run `npm run docs:generate`.

## Project
- Name: `dh-portal-v2`
- Local path: `/Users/david/Downloads/dh-portal-v2`
- GitHub: [dhwebservices/dh-portal-v2](https://github.com/dhwebservices/dh-portal-v2)
- Live URL: [staff.dhwebsiteservices.co.uk](https://staff.dhwebsiteservices.co.uk)
- Last updated: 2026-04-03
- Latest release summary: Department structure, team workspaces, onboarding recovery fixes, manual right-to-work compliance controls, contract template and signing workflows, and a new performance review meeting and outcome flow on staff profiles.

## Stack
- React 18 + Vite
- react-router-dom
- Microsoft login via MSAL
- Supabase database and storage
- Recharts reporting
- Cloudflare Worker + Resend email tooling
- GoCardless where relevant

## Core Integrations
- Microsoft tenant auth: `/Users/david/Downloads/dh-portal-v2/src/authConfig.js`
- Supabase client: `/Users/david/Downloads/dh-portal-v2/src/utils/supabase.js`
- Portal email helper: `/Users/david/Downloads/dh-portal-v2/src/utils/email.js`
- Live worker endpoint: https://dh-email-worker.aged-silence-66a7.workers.dev

## Current Live Feature Set
### Identity, auth, and access
- Microsoft login for staff
- Canonical lowercased staff identity handling
- Page-level permissions with hidden navigation and route blocking
- Onboarding lock mode
- Maintenance mode with staff lockout and admin override
- Director and Department Manager scoped access
- Staff impersonation for Directors and scoped Department Managers

### Staff, HR, and compliance
- My Profile with synced HR, personal, and bank details
- My Staff, My Department, and View My Team workspaces
- Staff profile pages with lifecycle, portal prefs, alerts, permissions, documents, and commissions
- HR onboarding workflow with department-manager review path
- HR leave, timesheets, payslips, and policies
- HR documents centre with compliance overview and timelines
- Manual right-to-work compliance controls and uploaded evidence recovery path
- Employee lifecycle states with termination request / director approval flow
- Performance review workflow with meeting scheduling, staff email notices, manager notes, pass/fail outcomes, and review history
- Contract template library with custom HTML bodies and reference file attachments
- Manager-issued staff contracts with queue tracking, reminder controls, replacement flow, staff signature during onboarding, and final PDF storage

### Operations and management
- Dashboard operations overview with manager and outreach widgets
- Notifications centre, important alerts, and pinned banners
- Live organisation chart
- Admin safeguards page
- Global search across portal data
- Tasks, My Tasks, and department task boards
- Schedule management with quick fills and copy-last-week
- Appointments oversight
- Reports centre including outreach reporting
- Manager Board with bulk outreach actions

### Client and commercial operations
- Clients list and client operations views
- Client profile operations page
- Web Manager
- Payments hub and GoCardless-linked client payment controls
- Outreach with follow-up queue, outcomes, assignments, reminders, and mobile-first cards
- Support
- Proposal builder
- Send email, email templates, and mailing list

### Experience and personalisation
- Portal appearance personalisation
- Dashboard section visibility, ordering, and quick actions
- Workspace presets
- Notification delivery preferences by category
- Comfort and accessibility controls
- What's New modal with release emails
- Feedback / request-a-feature flow


## Build Phases Completed
### Phase 1: Foundation and stability
- Fixed duplicate and case-variant staff identity handling
- Tightened permission enforcement
- Added onboarding-only portal lock
- Improved route protection and sidebar gating
- Repaired broken send-email logging flow

### Phase 2: Portal maturity
- Upgraded dashboard into an operations view
- Added full notifications centre
- Improved global search
- Added org chart
- Added admin safeguards page
- Upgraded reports centre
- Improved client operations views

### Phase 3: Staff and HR maturity
- Synced onboarding data into HR profiles
- Improved staff profile experience
- Added lifecycle and admin controls
- Strengthened onboarding admin actions
- Added HR documents centre
- Added document compliance and document timelines

### Phase 4: Payments and client account controls
- Hardened GoCardless portal-side flows
- Added payments hub UI
- Added manual payment tools and payment recovery actions
- Improved client payment visibility in portal pages

### Phase 5: UX, mobile, and performance
- Mobile hardening across major pages
- Desktop and mobile navigation alignment
- Better card layouts and responsive grids
- Route lazy loading and manual chunk splitting
- Reduced first-load JS weight

### Phase 6: Maintenance, internal comms, and outreach
- Portal maintenance lock mode with admin bypass
- Staff maintenance email notices
- Notification and banner improvements
- Outreach follow-up queue, assignments, reminders, and linked actions
- Outreach dashboard and reporting upgrades

### Phase 7: Department structure and scoped operations
- Department catalogue and director-managed org structure
- My Department and View My Team workspaces
- Department manager request and approval flow
- Department-scoped staff visibility and impersonation
- Department task board support


## Rolling Roadmap
### Near next
- Document compliance engine with required-document rules by role, department, and lifecycle
- Training and certifications module with expiry reminders
- Department dashboard depth with leave, onboarding, and compliance signals
- Audit-log schema cleanup and remaining runtime query hardening

### After that
- Probation review depth, manager check-ins, and goals/objectives
- Leave and schedule intelligence
- Department reporting and announcements
- Proposal-to-client lifecycle tracking

### Later
- Payroll workflows or payroll integration
- Benefits tracking
- Workforce planning and capacity forecasting
- Advanced analytics and manager recommendations
- Multi-entity and business controls


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
- Frontend deploy target: Cloudflare Pages or current portal hosting flow
- Worker deploy is separate from this repo
- Git hooks for doc auto-generation:
  ```bash
  cd /Users/david/Downloads/dh-portal-v2
  git config core.hooksPath .githooks
  ```
- After changes, do not commit:
  - `dist/`
  - `node_modules/`

Standard push flow:
```bash
cd /Users/david/Downloads/dh-portal-v2
git add .
git commit -m "Describe change"
git push origin main
```


## Known Cautions
- This working copy currently contains local dist/ and node_modules/ folders that should not be committed.
- Supabase credentials are configured client-side in the current app structure; future security hardening should review that setup carefully.
- Some workflows depend on the live Cloudflare worker contract, so frontend and worker changes need to stay aligned.
- Older onboarding data may exist only in hr_profiles or storage if it was created before the onboarding persistence fix.

## Supporting Docs
- /Users/david/Downloads/dh-portal-v2/docs/staff-portal-guide-admin.pdf
- /Users/david/Downloads/dh-portal-v2/docs/staff-portal-guide-admin.html
- /Users/david/Downloads/dh-portal-v2/docs/staff-portal-guide-outreach.pdf
- /Users/david/Downloads/dh-portal-v2/docs/staff-portal-guide-outreach.html
- /Users/david/Downloads/dh-portal-v2/docs/DEPARTMENTS_AND_TEAM_GUIDE.pdf
