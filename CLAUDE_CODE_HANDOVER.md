# DH Website Services — Claude Code Handover

## Who You Are Working For
DH Website Services — a UK web design agency based in Pontypridd, Wales.
Owner: David (dhwebservices / david@dhwebsiteservices.co.uk)

---

## Repositories

### 1. Staff Portal
**Repo:** https://github.com/dhwebservices/dh-portal  
**Branch:** main  
**Stack:** React 18 + Vite, React Router v6, MSAL.js (Microsoft Entra ID SSO), Supabase, Cloudflare Pages  
**Deploy:** Cloudflare Pages — auto-deploys on push to main  
**Build command:** `npm run build` → outputs `./dist`  
**Dev:** `npm run dev` → http://localhost:5173  

### 2. Public Website
**Repo:** (ask David — separate repo, not confirmed in this session)  
**Stack:** Likely same Vite/React setup — confirm with David  

### 3. Cloudflare Worker
**Purpose:** Handles outbound emails (custom_email type), acts as a proxy for sensitive API calls  
**Referenced in code as:** `WORKER_URL` (set via `VITE_WORKER_URL` env var)  
**Used in:** SendEmail.jsx, HR pages, Schedule.jsx, Maintenance.jsx, StaffProfile.jsx  

---

## Environment Variables (set in Cloudflare Pages dashboard)
```
VITE_AZURE_TENANT_ID      = Microsoft Entra tenant ID
VITE_AZURE_CLIENT_ID      = Microsoft Entra app client ID  
VITE_REDIRECT_URI         = https://your-portal.pages.dev
VITE_SUPABASE_URL         = Supabase project URL
VITE_SUPABASE_ANON_KEY    = Supabase anon key
VITE_WORKER_URL           = Cloudflare Worker URL
```

---

## Staff Portal — Full File Structure

```
src/
├── App.jsx                          # Router, auth wrapper, layout
├── main.jsx                         # Entry point
├── authConfig.js                    # MSAL config
├── styles/
│   └── global.css                   # All CSS vars, themes, utility classes
├── contexts/
│   └── AuthContext.jsx              # MSAL auth context, user/permissions
├── hooks/
│   ├── useMobile.js
│   ├── usePortalTheme.js
│   └── usePreferences.js
├── utils/
│   ├── supabase.js                  # Supabase client
│   ├── ai.js                        # AI helper (Cloudflare Worker proxy)
│   ├── audit.js                     # Audit log helpers
│   ├── email.js                     # Email sending helpers
│   ├── mockData.js                  # Dev mock data
│   └── permissions.js              # Role/permission checks
├── components/
│   ├── Header.jsx                   # Top bar, breadcrumb, user menu
│   ├── Sidebar.jsx                  # LEFT NAV — main target for redesign
│   ├── UI.jsx                       # Shared: Card, Badge, Button, Modal, Table, Input
│   ├── BannerDisplay.jsx            # Staff banner/popup notifications
│   └── PersonalisePanel.jsx        # Theme/accent colour panel
└── pages/
    ├── LoginPage.jsx
    ├── PortalHome.jsx               # Dashboard homepage
    ├── Dashboard.jsx                # Business metrics
    ├── Clients.jsx                  # Client list + add/edit modal
    ├── ClientManagement.jsx         # Per-client detail view
    ├── Staff.jsx                    # Staff + commissions
    ├── StaffAccounts.jsx            # Azure AD user list
    ├── StaffProfile.jsx             # Per-staff profile + permissions
    ├── Tasks.jsx                    # Task manager
    ├── Schedule.jsx                 # Weekly schedule
    ├── Outreach.jsx                 # Sales outreach tracker
    ├── Reports.jsx                  # Business reports + charts
    ├── AuditLog.jsx                 # Audit log + active sessions
    ├── SendEmail.jsx                # Email composer (single + bulk)
    ├── EmailTemplates.jsx           # Email template editor
    ├── SocialMedia.jsx              # Social media post composer
    ├── CMS.jsx                      # Simple CMS page manager
    ├── WebsiteCMS.jsx               # Website content sections editor
    ├── WebManager.jsx               # Website management overview
    ├── DomainChecker.jsx            # Domain availability checker
    ├── CompetitorLookup.jsx         # AI competitor research
    ├── ProposalBuilder.jsx          # PDF proposal generator
    ├── Banners.jsx                  # Staff banner/popup manager
    ├── Maintenance.jsx              # System status tracker
    ├── SupportTickets.jsx           # Client support tickets
    ├── Settings.jsx                 # Portal settings
    ├── MyProfile.jsx                # Staff self-profile
    ├── OnboardingForm.jsx           # New staff onboarding form
    ├── Admin.jsx                    # Admin — user roles + permissions
    ├── LoginPage.jsx
    └── hr/
        ├── HRProfiles.jsx           # HR staff profiles
        ├── HRTimesheet.jsx          # Clock in/out, timesheets
        ├── HRLeave.jsx              # Leave requests
        ├── HRPayslips.jsx           # Payslip upload/distribution
        ├── HRPolicies.jsx           # Policy document library
        └── HROnboarding.jsx         # Onboarding approval workflow
```

---

## Current Sidebar Navigation Structure
The sidebar currently lists ALL pages as a flat vertical tab list (old macOS settings style).
This needs to be replaced — see Feature 1 below.

Current nav groups (from App.jsx/Sidebar.jsx):
- **Home:** PortalHome, Dashboard
- **Clients:** Clients, ClientManagement, SupportTickets
- **Tasks:** Tasks, Schedule
- **Outreach:** Outreach, CompetitorLookup, ProposalBuilder
- **Web:** WebManager, WebsiteCMS, CMS, DomainChecker
- **Comms:** SendEmail, EmailTemplates, SocialMedia
- **HR:** HRProfiles, HRTimesheet, HRLeave, HRPayslips, HRPolicies, HROnboarding
- **Reports:** Reports, AuditLog
- **Admin:** Admin, StaffAccounts, Banners, Maintenance
- **Account:** MyProfile, Settings

---

## Design System (from global.css)
```css
/* CSS Variables */
--bg, --bg2        /* Page + card backgrounds */
--card             /* Card surface */
--border, --border2
--text, --sub, --faint
--gold, --gold-bg, --gold-border   /* Primary accent — #C9A84C */
--green, --red, --amber, --blue
--font-display     /* 'Cormorant Garamond' — headings */
--font-mono        /* 'JetBrains Mono' — labels/mono */
/* Body font: 'Outfit' */

/* Dark mode default, light mode toggle */
/* Themes: default (dark gold), ocean, forest, rose, slate */
```

Key classes: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-outline`, `.btn-sm`, `.btn-danger`,
`.card`, `.badge`, `.badge-green/red/amber/gold/grey`, `.inp`, `.inp-label`,
`.tab`, `.filter-pill`, `.tbl`, `.modal`, `.modal-backdrop`, `.fade-in`, `.empty`

---

## Supabase Tables (known)
- `profiles` — staff profiles
- `clients` — client records  
- `outreach` — sales outreach
- `tasks` — task manager
- `commissions` — staff commissions
- `email_log` — sent email log
- `email_templates` — saved templates
- `banners` — staff notification banners
- `notifications` — per-user notifications
- `audit_log` — audit trail
- `sessions` — active sessions
- `support_tickets` — client tickets
- `schedules` — weekly schedules
- `timesheets` — HR timesheets
- `leave_requests` — HR leave
- `payslips` — HR payslips
- `policies` — HR policy docs
- `onboarding` — onboarding submissions
- `cms_pages` — CMS pages
- `website_content` — website sections
- `systems` — maintenance status
- `settings` — portal settings

---

## FEATURES TO BUILD

---

### FEATURE 1 — Staff Portal: Icon Dock Sidebar (Priority 1)

**Replace** `src/components/Sidebar.jsx` entirely.

**Design:**
- Narrow icon-only sidebar (56px wide) on the left
- Each section has one icon + tooltip on hover
- Clicking a section icon slides out a panel (240px) showing that section's pages
- Active page highlighted in the panel
- Search bar at the bottom of the icon dock
- On mobile: bottom tab bar with the same sections

**Sections + Icons (use lucide-react):**
| Section | Icon | Pages |
|---------|------|-------|
| Home | `Home` | PortalHome, Dashboard |
| Clients | `Users` | Clients, ClientManagement, SupportTickets |
| Tasks | `CheckSquare` | Tasks, Schedule |
| Outreach | `TrendingUp` | Outreach, CompetitorLookup, ProposalBuilder |
| Web | `Globe` | WebManager, WebsiteCMS, CMS, DomainChecker |
| Comms | `Mail` | SendEmail, EmailTemplates, SocialMedia |
| HR | `UserCheck` | HRProfiles, HRTimesheet, HRLeave, HRPayslips, HRPolicies, HROnboarding |
| Reports | `BarChart2` | Reports, AuditLog |
| Admin | `Shield` | Admin, StaffAccounts, Banners, Maintenance |
| Account | `User` | MyProfile, Settings |
| Search | `Search` | (bottom of dock — opens search overlay) |

**Search overlay behaviour:**
- Full-screen overlay or top-bar expansion
- Fuzzy search across: page names, client names, staff names, outreach entries
- Keyboard shortcut: `Cmd+K` / `Ctrl+K`
- Results grouped by type: Pages, Clients, Staff, etc.
- Clicking a result navigates to that page (and pre-filters if applicable)

**Behaviour notes:**
- Slide-out panel closes when clicking elsewhere or pressing Escape
- Current active section's icon stays highlighted
- Respect existing permission gates (PermissionGate component)
- Preserve existing `useMobile` hook for responsive behaviour

---

### FEATURE 2 — Public Website: Glassmorphism Cards + Pricing Reveal

**(Confirm public site repo with David before starting)**

**Glassmorphism cards:**
```css
background: rgba(255,255,255,0.05);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
border: 1px solid rgba(255,255,255,0.1);
box-shadow: 0 8px 32px rgba(0,0,0,0.3);
border-radius: 16px;
```

**Pricing cards — hover reveal:**
- Card front: package name + description + 3-4 key features
- On hover: price slides/fades in, CTA button appears
- Animation: smooth 0.3s ease, no jarring flips
- Keep DH gold (#C9A84C) as accent

---

### FEATURE 3 — DH Custom Cursor + Glow

**Both sites (portal + public):**
- Hide default cursor: `cursor: none` on body
- Custom cursor: small DH logo mark SVG (David to supply SVG — ask him)
- Radial glow: soft gold (#C9A84C) radial gradient that follows mouse, ~200px radius, 0.15 opacity
- Glow implemented as a fixed div that tracks `mousemove`
- On mobile: cursor features disabled (touch devices)
- Cursor scales up slightly on hover over clickable elements

```js
// Cursor glow implementation pattern
const glow = document.getElementById('cursor-glow');
document.addEventListener('mousemove', e => {
  glow.style.left = e.clientX - 100 + 'px';
  glow.style.top = e.clientY - 100 + 'px';
});
```

---

## IMPORTANT CONTEXT

### What was recently fixed (build errors — all resolved)
The entire codebase had a batch of corrupted JSX files from a bad AI edit session:
- Missing `onClick={()=>` on buttons
- Unclosed template literals in modal titles  
- Extra `</div>` closing tags at the end of every component's return
- Broken modal structures (dangling setters, wrong closing tags)

**All 30+ files have been fixed and committed.** The build should now be clean.
Do `npm run build` first to confirm before making changes.

### Permissions system
`src/utils/permissions.js` + `src/components/PermissionGate.jsx`
Roles: `admin`, `manager`, `staff`, `hr`, `sales`
Sidebar must respect these — wrap nav items in PermissionGate as currently done.

### Auth
MSAL.js via `src/contexts/AuthContext.jsx`
`useAuth()` returns: `{ user, login, logout, isAdmin, hasPermission }`

### Modal pattern
The app uses a custom `Modal` component from `src/components/UI.jsx`.
Always use `<Modal title="..." onClose={fn} footer={...}>` — do not use raw div modal structures.

---

## COMMANDS

```bash
# Install
npm install

# Dev server
npm run dev

# Build (always verify before committing)
npm run build

# The build must complete with 0 errors before pushing
# Cloudflare Pages auto-deploys on push to main
```

---

## NOTES FOR CLAUDE CODE

1. **Always run `npm run build` after changes** — Cloudflare will fail if there are JSX errors
2. **Use the existing design system** — CSS vars, existing component classes, lucide-react icons
3. **Do not add new npm packages** without checking if existing ones cover the need
4. **Commit messages:** be descriptive — e.g. "Redesign Sidebar: icon dock with slide-out panels"
5. **One feature per commit** — don't bundle unrelated changes
6. **Mobile first on new UI** — use the `useMobile` hook for responsive logic
7. **Ask David for the DH logo SVG** before implementing the custom cursor
8. **Ask David for the public website repo URL** before touching Feature 2/3 on that site
9. The gold accent colour is `#C9A84C` — use this consistently
10. Font stack: headings = `'Cormorant Garamond', Georgia, serif`, mono = `'JetBrains Mono', monospace`, body = `'Outfit', sans-serif`
