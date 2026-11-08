# DH HQ: read this before building anything in src/hq/

DH HQ is the staff portal's new home: one place for clients, messages, jobs,
money and apps. The full plan, with the screen mockups that are the spec, is at
https://claude.ai/artifact/TRSn7LeXMGCrMQDaWgADF2 (read it with the Artifact
tool). This file is the short version for every Claude session.

## Who you are working with

Most HQ screen work is done by Jack, who does not code. Talk to him in plain
words, one step at a time, and give him a preview link and a list of things to
check. David reviews and merges.

## Hard rules

- Work on the branch you were given (normally `hq/build`). Never commit to
  `main`, never merge, never open a pull request into `main` unless told David
  agreed. `main` auto-deploys to the live portal.
- Do not change sign-in (`src/authConfig.js`, `src/contexts/AuthContext.jsx`,
  `src/utils/mobileAuth.js`), permissions (`permissionCatalog.js`,
  `user_permissions`), payments, Supabase tables, RLS, secrets or anything in
  `functions/` without David in the session. If a screen needs one of those,
  stop and say what to ask David.
- Never add a login bypass, dev-mode flag or fake account. One was removed in
  August 2026 after it gave full admin access to anyone.
- Until phase 0 (David) adds the HQ API, HQ screens show **example data** from
  `src/hq/exampleData.js`. Every screen using it shows a small "Example data"
  label. Never read or write real tables from HQ screens yet.
- Repo is public: no client data, phone numbers, emails, keys or passcodes in
  code or commits. Example data uses made-up businesses.

## Where things go

- Screens: `src/hq/pages/` (Today.jsx, Inbox.jsx, Clients.jsx, ClientPage.jsx,
  Jobs.jsx, Money.jsx, Apps.jsx).
- Shared pieces: `src/hq/components/` (Sidebar, TopBar, Panel, Row, StatusTag,
  SourceTag, Avatar, StatStrip).
- Styles: `src/hq/hq.css`, every rule scoped under `.hq` so old pages don't
  change. Fonts load from Google Fonts in `src/hq/hq.css` with `@import`.
- Routes: `/hq`, `/hq/inbox`, `/hq/clients`, `/hq/clients/:id`, `/hq/jobs`,
  `/hq/money`, `/hq/apps`, added in `src/App.jsx` inside the signed-in routes,
  wrapped in `<PermissionGate permKey="dashboard">` for now (David swaps in an
  `hq` permission in phase 0). The old menu and pages stay as they are.

## Menu

Today, Inbox, Clients, Jobs, Money, Apps, then a "Running the business" group:
Phone, Team, Library, Settings. Phone, Team and Settings link to the existing
pages (`/phone` screen, `/people`, `/settings`) until they are restyled.

## Design: the mockups in the plan are the spec

- Palette: DH red `#C8102E` (main action, active menu marker, unread counts),
  ink `#14181A` (sidebar, text), background `#F4F5F3`, panels `#FFFFFF`,
  lines `#E3E5E1`, muted text `#6E7579`.
  Status colours, always with a word: good `#1E7B46` on `#E6F2EA`,
  waiting `#8A5200` on `#FBF0DC`, problem `#B42318` on `#FBE7E5`,
  info `#24527A` on `#E5EEF6`.
- Type: Archivo 700/800 for page titles and big figures; IBM Plex Sans for
  everything else (13-14px in tables); IBM Plex Mono for times, amounts,
  phone numbers and small uppercase labels.
- Layout: dark 200px sidebar, white top bar with search (Ctrl K) and one red
  "New" button, content on the grey background. Panels: 1px border, 8px
  corners, no shadow. Rows 36px. Left-aligned.
- Numbers go in one thin strip of four, not separate tiles.
- On phones (under 768px) the sidebar becomes a bottom tab bar: Today, Inbox,
  Clients, Phone, More.

Never: gradients, glass, glow, purple, emoji, sparkle or robot icons, "AI
insights", greetings like "Good morning", big number tiles with icons in
circles, coloured stripes down card edges, shadows on everything, fake charts
or "+12%" badges, illustrations, centred layouts.

Words: plain British English, from the user's side. "Ask for a change", not
"Submit ticket". "Done", "Waiting", "Over a day". Buttons say what happens.

## Checking work

Before saying a screen is done: `npm run build` passes, the screen matches the
mockup at 1280px and 390px wide, nothing scrolls sideways, and the old menu
still works. Then push the branch and give Jack the preview link:
https://hq-build.dh-portal-v2.pages.dev/hq
