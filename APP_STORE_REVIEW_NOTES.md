# App Review Information - notes for App Store Connect submission

Paste the section below into **App Store Connect → App Review Information → Notes**
when submitting a build for review.

---

## Sign in with Apple

This app does not offer Sign in with Apple, and does not need to under
Guideline 4.8.

DH Staff Portal is an internal employee tool for DH Website Services staff
only. It is not available to the general public and does not offer account
creation of any kind - every user signs in with their existing company
Microsoft 365 / Entra ID account, provisioned and managed by our IT admin.
This matches the documented Guideline 4.8 exception for business apps that
require an existing enterprise account:

> "Sign in with Apple is not required in the following cases: ... Apps that
> use an education, enterprise, or business sign-in system."

There is no alternative "public" login path in the app - Entra ID is the
only way in, consistent with this being a closed, employee-only tool.

---

## Demo account for review

[Fill in before submitting: a real Entra ID test account the reviewer can
sign in with, e.g. a dedicated "app-review@dhwebsiteservices.co.uk" account
with a temporary password, since App Review needs to actually log in to
test the app. Do not use a personal or production admin account for this.]

---

## Location permission

The app requests location access ("When In Use" only) solely to verify a
staff member is physically at the office when they tap Clock In/Clock Out.
Location is read once per clock action and is never tracked in the
background.

---

## Push notifications

Used for leave request approvals/rejections and onboarding review updates
only. No marketing or promotional push is sent.
