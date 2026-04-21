# Meeting reminder worker

This repo now includes a standalone Cloudflare Worker that sends an SMS reminder when a staff meeting is within the next 30 minutes.

## Why this is separate

Cloudflare Pages Functions handle request/response routes, but recurring cron triggers are configured on Workers. The reminder worker is therefore deployed separately from the Pages site.

Official docs:

- https://developers.cloudflare.com/pages/functions/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/

## What it does

- Runs every 5 minutes
- Looks for `staff_meetings` rows where:
  - `status = 'scheduled'`
  - `reminder_sent_at is null`
  - the meeting starts within the next 30 minutes
- Sends an SMS through ClickSend using your alpha tag sender ID
- Marks the meeting as reminded so it only sends once

## Database change

Run this SQL in Supabase:

- `scripts/2026-04-22-staff-meeting-reminders.sql`

## Cloudflare Worker env vars

Set these on the Worker:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLICKSEND_USERNAME`
- `CLICKSEND_API_KEY`
- `CLICKSEND_SENDER_ID`
- `MEETING_REMINDER_SECRET`

`CLICKSEND_SENDER_ID` must be alpha-tag only, `3-11` letters/numbers, no spaces.

## Deploy

Deploy the Worker from this repo using Wrangler or the Cloudflare dashboard. The cron trigger is already defined in `wrangler.toml` as every 5 minutes.

For a manual test after deploy:

`POST /run`

with header:

`x-reminder-secret: <MEETING_REMINDER_SECRET>`
