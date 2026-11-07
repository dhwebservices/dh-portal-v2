# DH device management (our own MDM)

Apple MDM for staff iPhones, on Cloudflare (Worker `dh-mdm` + D1 `dh-mdm`), with no Intune.
The staff app's **Settings > Device management** screen (`src/mobile/screens/DeviceManagement.jsx`) is the front end.

## What it can and can't do

| | Unsupervised (staff's own phones) | Supervised (company phones via Apple Business Manager) |
|---|---|---|
| Real name, model, serial, iOS, battery, storage | ✅ | ✅ |
| Passcode / encryption / Find My / iCloud Backup | ✅ | ✅ |
| Installed apps | ✅ | ✅ |
| **Lock** (with a message and our number on the Lock Screen) | ✅ | ✅ |
| Restart / shut down | ❌ Apple refuses | ✅ |
| Erase | ❌ never: the profile doesn't grant it (AccessRights has no 8) | ❌ |
| Read messages, photos, location | ❌ not possible over MDM | ❌ |

Commands push **straight away**: queueing a lock sends an Apple MDM push, which wakes iOS's own
management service (not the staff app). The phone checks in within seconds if it's online.
Details refresh on their own every hour for any phone more than 6 hours out of date (the `Ticker`
Durable Object alarm, so no cron slot is needed on the free plan).

## How it fits together

- `PUT /mdm/checkin?s=…`, `PUT /mdm/connect?s=…`: Apple's protocol. `s` is a per-phone secret in the
  profile's URLs; only its SHA-256 is stored. Wrong secret or wrong UDID gets 401.
- `GET /enroll/<token>`: one-time link (24 h), opened in Safari. `/profile` can be downloaded once.
- `/api/*`: JSON for the app, Microsoft sign-in checked against the staff portal's Entra app.
  **Admins are `MDM_ADMINS` in wrangler.toml, not Supabase**, so the portal's database key can't
  grant device control.
- Every phone gets its own identity certificate from our CA (`src/certs.js`). The CA's master copy
  is in `~/.config/dh-mdm` on David's Mac and in the Worker secrets. Never commit it.
- Audit log of every action: `GET /api/audit`.

## Setup status

1. ✅ Worker, D1 schema, CA, hourly timer deployed.
2. ✅ **MDM push certificate** issued 7 Nov 2026, **expires 7 Nov 2027** (Cloudflare mTLS cert `dh-mdm-push`). How it was made:
   1. Register at https://mdmcert.download with david@dhwebsiteservices.co.uk and confirm the email.
   2. Submit `~/.config/dh-mdm/push.csr` with the encryption cert `encrypt.pem` (API: `POST /api/v1/signrequest`).
   3. The emailed attachment decrypts with
      `openssl smime -decrypt -inform DER -in <file>.p7 -inkey ~/.config/dh-mdm/encrypt.key -out push_req.b64`
   4. Upload `push_req.b64` at https://identity.apple.com (Apple Push Certificates Portal) and download `MDM_….pem`.
   5. `npx wrangler mtls-certificate upload --cert MDM_….pem --key ~/.config/dh-mdm/push.key --name dh-mdm-push`
      then uncomment `[[mtls_certificates]]` in wrangler.toml with that id.
   6. `wrangler secret put MDM_PUSH_TOPIC` with the certificate's UID (`com.apple.mgmt.External.…`), then deploy.
   - **Renew it every year** from the same Apple ID, or every enrolled phone has to re-enrol.
3. ⬜ Pilot on David's iPhone, then Jack's.

## Tests

`npm test` (identity + profile + plist) and `node test/e2e-local.mjs` against
`npx wrangler dev --port 8811 --local` (a simulated iPhone enrolling, taking commands,
deferring a lock, failing a restart, and checking out).
