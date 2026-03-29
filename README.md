# DH Portal — DH Website Services

A full admin portal for DH Website Services, built with React + Vite, deployed on Cloudflare Pages, secured with Microsoft Entra ID (Azure AD) SSO.

---

## Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React 18 + Vite                   |
| Routing   | React Router v6                   |
| Auth      | Microsoft Entra ID via MSAL.js    |
| Hosting   | Cloudflare Pages                  |
| Styling   | CSS-in-JS (no framework)          |

---

## Modules

- **Dashboard** — overview, quick links, getting started
- **Clients** — add/edit/delete clients, plan & invoice tracking
- **Staff & Commissions** — commission-only contractor management, payout log
- **CMS** — create and edit website content pages
- **Admin** — portal user accounts, Entra ID role assignment
- **Settings** — business info, Azure config reference, notification toggles

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env.local
# Then fill in VITE_AZURE_TENANT_ID and VITE_AZURE_CLIENT_ID

# 3. Run dev server
npm run dev
# → http://localhost:5173
```

---

## Microsoft Entra ID Setup

1. Go to [portal.azure.com](https://portal.azure.com)
2. **Microsoft Entra ID → App registrations → New registration**
   - Name: `DH Portal`
   - Supported account types: *Accounts in this organizational directory only*
   - Redirect URI: **Single-page application (SPA)** → `http://localhost:5173`
3. After creation, copy:
   - **Application (client) ID** → `VITE_AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → `VITE_AZURE_TENANT_ID`
4. Under **Authentication**, add your production Cloudflare Pages URL as another SPA redirect URI

---

## Cloudflare Pages Deployment

```bash
# Build
npm run build
# Output: ./dist
```

### In Cloudflare Dashboard:
1. Pages → Create a project → Connect Git (or upload `dist/` directly)
2. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. Environment Variables (Settings → Environment variables):
   ```
   VITE_AZURE_TENANT_ID   = your-tenant-id
   VITE_AZURE_CLIENT_ID   = your-client-id
   VITE_REDIRECT_URI      = https://your-portal.pages.dev
   ```
4. After deploy, add the live URL to your Entra ID app's redirect URIs

### Custom domain (optional):
- Cloudflare Pages → Custom domains → Add `portal.dhwebsiteservices.co.uk`
- Update `VITE_REDIRECT_URI` to match

---

## Data Persistence

Currently, all data is held in React state (in-memory, resets on page reload).

**To add persistence, connect Cloudflare D1 (SQLite):**
1. Create a D1 database: `npx wrangler d1 create dh-portal-db`
2. Uncomment the D1 binding in `wrangler.toml`
3. Replace `useState([])` initialisers in each page with `useEffect` API calls to Cloudflare Workers endpoints

---

## Commission Rules

- Staff are **self-employed contractors** — not PAYE employees
- Commission is paid **only after client invoice is confirmed received**
- Default rate: 15% standard / 20% senior (configurable in Settings)
- Mac Confield: 20% as per existing arrangement

---

## Shared Mailboxes (reference)

| Mailbox                              | Purpose         |
|--------------------------------------|-----------------|
| hr@dhwebsiteservices.co.uk           | HR / onboarding |
| legal@dhwebsiteservices.co.uk        | Legal / NDAs    |
| clients@dhwebsiteservices.co.uk      | Client services |
