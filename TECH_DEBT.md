# Tech Debt & Design System Tracker

Living document. Updated as each phase/page of the design pass progresses.
Format: **[STATUS] Item — where — why it matters**

Status key: `TODO` not started · `TRACKED` identified, deliberately deferred · `DONE` fixed and verified with `npm run build`

---

## Phase 1–2 (foundation) — 2026-07-10

### DONE
- **Shadow tokens** — `global.css :root` — Added `--shadow-sm/md/lg`, replacing 5 hand-typed shadow recipes (`.card`, `.stat-card`, `.surface-card`, `.staff-profile-summary-card`, `.staff-profile-hero`) that had drifted to different rgba color bases (`25,40,72` / `30,52,94` / `32,52,96`) despite all being "soft elevation." Dark-mode equivalents added too — previous shadows were the same rgba(black) recipe in both themes, invisible against the near-black dark background.
- **Off-token accent blue #1** — `.department-hero` background gradient used `rgba(78,112,234,...)`, a hand-typed blue one digit off the real `--accent-rgb` (`75,112,226`). Fixed to reference the token.
- **Off-token accent blue #2** — `.pdf-workspace-*-btn:hover` used `rgba(26,86,219,0.22)`, a third distinct hand-typed blue. Fixed to `var(--accent-border)` (same alpha, correct hue).
- **Radius drift on named card recipes** — `.surface-card` (20px), `.staff-profile-summary-card` (18px), `.staff-profile-hero` (24px), `.department-hero` (22px) all hardcoded distinct values with no naming logic. Consolidated to `var(--radius-lg)` (20px).
- **Dead `SECTION_COLORS` in Sidebar.jsx** — every section resolved to the identical value; removed per explicit decision to keep nav monochrome (matches Intune/GitHub/Linear/Stripe convention — hierarchy via typography/spacing/active-state, not per-section color).
- **Second, independent section-color system in Header.jsx** (`sectionAccent`) — found *after* the Sidebar fix, actually wired to a visible badge with real distinct colors (hiring/HR/admin/default). Neutralized to match the same monochrome decision. This one would have silently reintroduced colored sections even after the Sidebar fix — worth knowing it existed as a second, unrelated implementation of the same idea.
- **Duplicate route metadata (Header.jsx vs Sidebar.jsx)** — Header maintained its own `TITLES` (36 routes) and `PAGE_NOTES` (27 routes) maps, both partial and independently hand-typed, alongside Sidebar's `SECTIONS`/`ALL_PAGES` (56 routes, already the more complete source). Merged: Sidebar now exports `getRouteMeta(pathname)` as the single source; Header imports it. Net effect: the ~20 routes Header didn't previously cover (fell back to generic "Portal" / "Operational workspace") now show their real title and description automatically. Recruiting sub-tab routes (`/recruiting/jobs`, `/recruiting/applications`, `/recruiting/board`, `/recruiting/settings`) aren't top-level nav items, so they live in a small `EXTRA_ROUTE_META` map in Sidebar.jsx rather than being dropped.
- **Dark-mode bug (found as a byproduct)** — `.pdf-workspace-*-btn` background was hardcoded `rgba(248,250,252,0.9)` (near-white) regardless of theme — meaning these rows likely rendered as light cards inside dark mode. Now `var(--bg)`, which flips correctly.

### TRACKED (identified, not touched yet — needs case-by-case judgment, not a blind sweep)
- **~50 remaining hardcoded `border-radius` values across `global.css`**, mostly in the 14–26px range. Some are legitimately a smaller "chip/avatar/icon" tier (14px) that shouldn't be pulled into the card-radius tokens; others are likely genuine card drift like the ones just fixed. Needs visual confirmation per case (screenshot or page-by-page pass) before consolidating — a blind find/replace risks visual regressions on elements the audit didn't actually inspect. Will resolve incrementally as each page gets its Phase 4 pass.
- **Two remaining hardcoded shadow rgba values** not yet folded into the shadow tokens: `global.css:497` (`rgba(22,34,61,0.08)`) and `global.css:2463` (`rgba(25,40,72,0.05)`). Same reasoning — need to confirm which tier each belongs to against its actual rendered context before swapping.
- **`--sw` and `--sidebar-w` both define the sidebar width (72px) as separate tokens** in `:root`. Only `--sw` appears to be consumed by layout CSS; `--sidebar-w` looks unused. Needs a repo-wide grep before removal to be sure nothing else depends on it.
- **Sidebar.jsx owns a self-contained `const css = \`...\`` string** injected via `<style>`, separate from `global.css`. Every other component styles purely through `global.css` classes. Not wrong, but it's the one exception — worth a decision on whether nav styling should eventually live in `global.css` for a single stylesheet, or whether keeping it scoped to the component is intentional (e.g. to keep nav styling colocated with nav logic).
- **Originally flagged "one-off button duplication" was a misdiagnosis on my part** — on inspection, `.staff-profile-nav-btn`, `.overview-toolbar-btn`, `.pdf-workspace-*-btn`, and `.header-mobile-menu-btn` are not duplicate action-buttons; they're structurally distinct components (full-width nav rows, toolbar chips, list-selector rows) that happen to have "btn" in the class name. Forcing them to extend `.btn` would actually hurt consistency, not help it. No action needed here — correcting the record rather than doing something harmful because an earlier grep-based finding said to.

### TODO (not yet investigated — flagged from initial pass, needs its own audit pass)
- Dashboard.jsx: ~198 inline `style={{}}` instances in a single 1,937-line file. Biggest risk to "every page inherits the system automatically" — inline styles can't be retokenized in bulk. Worth addressing as part of the Phase 3 Dashboard redesign itself, not before.
- Accessibility: no WCAG-focused audit has been done yet (focus states, ARIA labels, screen-reader landmarks). Flagged in the original brief; not yet assessed against real code.
- Performance: virtualization for long tables, route prefetching — not yet assessed against real usage patterns (e.g. which tables actually get long enough to need it).

---

---

## Phase 3 (Dashboard → reference implementation) — 2026-07-10

### DONE
- **Extracted `src/components/ui/` library** from Dashboard.jsx's locally-scoped presentational components: `StatCard`, `SectionPanel` (was `Panel`), `ListRow` (merged from `QueueRow` + `ToolShortcutRow`, which were near-duplicates), `SummaryStatCard` (was `LeadershipSummaryCard`), `EmptyState` (extended with icon/title/CTA support per the original brief, backward-compatible with existing `text`-only call sites), `ActionTile` (was `QuickActionCard`).
- Every extracted component now composes CSS classes backed by the Phase 2 tokens (`--radius`, `--radius-lg`, `--shadow-sm/md`) instead of inline magic-number styles. New rules live in `global.css` under a dedicated `ui-*` namespace so they're clearly distinguished from page-specific CSS.
- Removed `ToolCard` — defined in Dashboard.jsx but never actually rendered anywhere (confirmed via grep before deleting; not migrated since we don't know its intended use).
- Dashboard.jsx rewired to import from `../components/ui` instead of defining these locally. Verified with `npm run build` — bundle size for the Dashboard chunk actually dropped slightly (65.10kB → 63.42kB gzipped) despite adding a shared library, because the duplicate `QueueRow`/`ToolShortcutRow` JSX collapsed into one component.

### Migration status (honest numbers, not an estimate)
- **1 of 54 pages** (`Dashboard.jsx`) is actually wired to the new `src/components/ui/` library so far. This phase built and proved the components; it did not yet roll them out.
- **20 of 54 pages** reference the `.stat-card` CSS class or a stat-tile-shaped component — this is the migration surface for `StatCard`.
- **8 of those 20** have their own independently-defined `StatCard`-named function (true duplicated code, not just shared CSS class reuse): `AdminSafeguards.jsx`, `KnowledgeBase.jsx`, `MyDepartment.jsx`, `MyTeam.jsx`, `Outreach.jsx`, `Support.jsx`, `WorkflowAutomation.jsx`, plus Dashboard (now migrated). These 7 are the highest-value remaining targets — each replacement deletes a full duplicate component.
- **`ManagerBoard.jsx`** has its own `QueueRow`-equivalent row component — second target for `ListRow`.
- Remaining ~46 pages not yet assessed against `SectionPanel`/`EmptyState`/`ActionTile` usage — that audit happens as Phase 4 reaches each page, not in bulk, per the same reasoning as the Phase 2 radius sweep (avoid guessing before reading the actual code).

### Known limitation of this pass
No live authenticated screenshot was taken to visually confirm the refactor — this sandbox has no Entra ID / Supabase credentials configured (no `.env`), so the app can't authenticate here. Correctness was verified via: clean `npm run build`, confirmed every CSS class referenced by the new components exists in `global.css`, and confirmed prop shapes match at every call site. A real visual check in your actual dev environment is still worth doing before this merges — flagging the gap rather than implying I saw it render.

### TODO (next)
- Migrate the 7 duplicate `StatCard` definitions + `ManagerBoard.jsx`'s row component to the shared library (Phase 4, highest-value first)
- Then sweep remaining pages page-by-page per the original working process
