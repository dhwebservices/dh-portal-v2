# Resolution Center reply — 1.0, Guideline 2.1

Paste the block below into **App Store Connect → the rejected 1.0 submission →
Resolution Center**, after doing the three things in "Before sending".

Rejection answered: Guideline 2.1 — Information Needed. Submission ID
`4c542ab7-26f1-45ea-80b7-048e48086df2`, rejected 14 Aug 2026.

---

## Before sending — all three, in this order

1. **Attach build 3 to version 1.0.** Build 3 is uploaded and VALID, but as of
   18 Aug 2026 the version still had **build 2** attached. Build 2 reads the old
   `schedules` table and shows an empty Rota — the very emptiness that caused the
   rejection. Sending the reply against build 2 invites the same outcome.
   App Store Connect → 1.0 → remove build 2 → Add Build → 3.
2. **Exclude `app-review@dhwebsiteservices.co.uk` from the MFA / Conditional
   Access policy.** The grace period expires ~23 Aug 2026. After that the
   reviewer is forced into Microsoft Authenticator enrolment on an account they
   cannot enrol → automatic rejection.
3. **Record the video and host it at a public link** (see the shot list in
   `APP_STORE_REVIEW_NOTES.md`). Apple must be able to open it without signing
   in. Replace `<RECORDING LINK>` below.

Also fill in the device model in section 2 of `APP_STORE_REVIEW_NOTES.md`
before pasting that document into App Review Information.

---

## Reply text

Hello,

Thank you for the review and for setting out exactly what was needed. We have
provided everything requested below.

**Screen recording.** A continuous recording captured on a physical iPhone
running the latest iOS, starting from app launch, is available here:

<RECORDING LINK>

It shows signing in with the demo account, the Home dashboard, Clock In with the
location permission prompt, Rota, submitting a leave request, Timesheet,
opening a payslip, and signing out.

**One thing we would like to flag.** When you reviewed build 2, the demo account
displayed empty screens on the Rota. That was our fault rather than a fault in
the app: the account had been created with full permissions but without any
sample records, and a rota table migration meant the shifts we did add were not
visible to that build. We have corrected both. The demo account is now populated
with representative shifts, leave requests, timesheets and payslips, and the
build attached to this version reads the corrected data. We think this is why
the app could not be assessed properly, and we would ask that the review be run
against the newly attached build.

**Demo account.** Username `app-review@dhwebsiteservices.co.uk`, password
`9k4Q*B5w_3rN+jswU1`. It is a standard staff account with every portal
permission enabled, so all features are reachable from it. There is one account
type only — staff. There are no free or paid tiers and no anonymous access.

**What the app is.** DH Staff Portal is an internal employee app for DH Website
Services, a UK web design company. It is not a consumer product and is not
marketed to the public. It replaces the email, spreadsheets and paper our staff
previously used for clocking in, rotas, holiday requests, timesheets and
payslips.

**Accounts, and why there is no registration or in-app deletion.** The app has
no registration flow. Every user signs in with an existing company Microsoft 365
/ Entra ID account created by our IT administrator, and there is no other way
in. Accounts are corporate identities owned and deleted by the employer through
Microsoft 365 when an employee leaves — the enterprise-managed exception under
Guideline 5.1.1(v). For the same reason the app does not offer Sign in with
Apple, which Guideline 4.8 exempts for enterprise sign-in systems.

**Permissions.** Location is requested "When In Use" only, on the Clock In /
Clock Out action, to confirm the employee is at the workplace when recording
attendance; it is read once per clock action and never in the background.
Camera and Photo Library are requested only during Onboarding, when a new
starter photographs a right-to-work document. Face ID is an optional unlock for
an already-signed-in session. Push notifications carry leave approvals and
onboarding updates only — never marketing.

**Content and regulated material.** There is no user-generated content in the
public sense: no posting, feeds, comments or messaging between users, so no
reporting or blocking mechanism is required. The only user-entered data is an
employee's own HR records, visible to that employee and their manager. The app
is not in a regulated industry and contains no protected third-party material.
It handles our own employees' HR data as their employer, under UK GDPR.

**Regional differences.** None. The app behaves identically everywhere it can be
downloaded. It is a UK employee tool — English (U.K.), UK dates, currency and
payroll rules — but no feature is enabled, disabled or varied by region.

The full written answers are also in the App Review Information notes for this
version. Please let us know if anything further would help.

Kind regards,
David Hooper
DH Website Services
