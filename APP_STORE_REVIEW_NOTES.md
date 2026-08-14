# App Review Information — notes for App Store Connect

Paste the **Review Notes** section below into
**App Store Connect → App Review Information → Notes**, and send the same text
as a reply on the rejected submission.

Rejection being answered: Guideline 2.1 — Information Needed (1.0 build 2,
submitted 8 Aug 2026, rejected 14 Aug 2026). Apple asked for a screen
recording plus seven pieces of written information.

---

# Review Notes

## 1. Demo account

Sign in with the Entra ID (Microsoft 365) account already entered in the
sign-in fields:

- Username: app-review@dhwebsiteservices.co.uk
- Password: 9k4Q*B5w_3rN+jswU1

This account is a standard staff account with all portal permissions enabled,
so every feature described below is reachable from it. It has been populated
with representative sample data (rota shifts, leave requests, timesheets and
payslips) so each screen shows real content.

There is only one account type in this app — staff. There are no free/paid
tiers and no anonymous access.

## 2. Devices and operating systems tested

<!-- TODO(David): replace with the real list before sending -->
- iPhone <MODEL>, iOS <VERSION> (physical device)
- iPhone 17 Pro Max, iOS 26 (Simulator)
- iPad Pro 13-inch, iPadOS 26 (Simulator)

## 3. What the app does, and who it is for

DH Staff Portal is an internal employee app for DH Website Services, a UK web
design and digital services company. Its audience is our own employees — it is
not a consumer product and is not marketed to the public.

The problem it solves: our staff previously handled clocking in, shift rotas,
holiday requests, timesheets and payslips across email, spreadsheets and
paper. This app puts all of it in one place, so an employee can see their
shifts, clock in and out, request leave and read their payslips from their
phone, and so managers can approve leave and manage the rota without being at
a desk.

Core features:

- Clock In / Clock Out with on-site location verification
- Rota — the employee's upcoming shifts
- Leave — request holiday and see the status of past requests
- Timesheet — hours worked, submitted for approval
- Payslips — view and download personal payslips
- Staff Directory and profiles
- Notifications — leave approvals and onboarding updates
- Onboarding — new-starter forms and document upload
- Manager tools (for staff with the relevant permission): approve leave,
  edit the rota, review onboarding submissions

## 4. Setting up and reaching the main features

No setup is required. Sign in with the credentials in section 1 and the app
opens on the home dashboard. From the bottom tab bar:

- **Home** — dashboard, with the Clock In / Clock Out button at the top.
  Tapping Clock In triggers the location permission prompt (see section 7).
- **Rota** — the signed-in employee's upcoming shifts.
- **Leave** — tap "Request Leave", pick dates and a reason, submit. The new
  request appears in the list below as "Pending".
- **Timesheet** — hours logged for the current period.
- **Profile → Payslips** — list of payslips; tap one to view it.
- **Profile → Settings** — notification preferences, Face ID toggle, sign out.

No sample files or uploads are needed to exercise the core flows.

## 5. External services used

- **Microsoft Entra ID (Azure AD)** — the only sign-in method; accounts are
  provisioned by our IT administrator.
- **Microsoft Graph** — staff account provisioning and Outlook calendar sync.
- **Supabase (hosted PostgreSQL)** — application database and file storage.
- **Cloudflare Pages / Pages Functions / R2** — hosting, backend API endpoints
  and document storage.
- **Apple Push Notification service (APNs)** — push notifications.
- **Xero** — UK payroll; source of payslip and leave records.
- **Stripe** — client invoicing (used by our office staff, not a consumer
  purchase flow; there are no in-app purchases or subscriptions).
- **ClickSend** — outbound SMS to clients.
- **Twilio** — voice call routing for appointment confirmations.

The app does **not** use any AI or machine-learning services, and does not use
third-party analytics or advertising SDKs.

## 6. Regional differences

There are none. The app functions identically everywhere it can be
downloaded. It is a UK-employee tool — content is in English (U.K.) and dates,
currency and payroll rules are UK-specific — but no feature or content is
enabled, disabled or varied by region.

## 7. Permissions, accounts and regulated material

**Account registration, login and deletion.** The app has no registration
flow. Every user signs in with an existing company Microsoft 365 / Entra ID
account created by our IT administrator, and there is no other way in. For the
same reason the app offers no in-app account deletion: accounts are corporate
identities owned and deleted by the employer through Microsoft 365 when an
employee leaves, which is the documented exception under Guideline 5.1.1(v)
for enterprise-managed accounts. This is also why the app does not offer Sign
in with Apple — Guideline 4.8 exempts apps that use an enterprise or business
sign-in system.

**Location.** Requested "When In Use" only, on the Clock In / Clock Out
action, to confirm the employee is at the workplace when they record
attendance. Location is read once per clock action and never in the
background. (The app declares the "Always" purpose string only because the
Capacitor geolocation plugin references it; the app never requests Always
authorisation.)

**Camera and Photo Library.** Requested only in Onboarding, when a new starter
photographs or uploads a right-to-work document.

**Face ID.** Optional convenience unlock for an already-signed-in session.

**Push notifications.** Used for leave approvals/rejections and onboarding
review updates only. No marketing or promotional messages are ever sent.

**User-generated content.** There is none in the public sense — no posting,
feeds, comments or messaging between users, so no content reporting or
blocking mechanism is required. The only user-entered data is an employee's
own HR records (leave reasons, timesheet hours, onboarding documents), visible
only to that employee and their manager.

**Regulated industry / third-party material.** The app is not in a regulated
industry and contains no protected third-party material. It handles our own
employees' HR data as their employer, under UK GDPR.

---

# Screen recording — what to capture

Apple requires this to be captured on a **physical device** running the latest
iOS, starting from app launch. Suggested run of about three minutes:

1. Launch the app from the Home Screen (start recording before tapping it).
2. Sign in with the demo account — show the Microsoft sign-in page and the
   return to the app.
3. Home dashboard — pause so the populated content is readable.
4. Tap **Clock In** — show the location permission prompt appearing, allow it,
   and show the successful clock-in.
5. **Rota** — scroll through the shifts.
6. **Leave** — open it, tap Request Leave, fill in dates, submit, and show the
   new Pending request in the list.
7. **Timesheet** — show the logged hours.
8. **Profile → Payslips** — open a payslip.
9. **Profile → Settings** — show notification preferences, then Sign Out.

Do not stop the recording between steps; Apple wants one continuous flow.
