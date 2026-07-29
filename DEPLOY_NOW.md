# 🚀 Deploy Stripe Payment System - Quick Guide

## Step 1: Run SQL Migration in Supabase

1. Go to https://supabase.com/dashboard/project/xtunnfdwltfesscmpove
2. Click "SQL Editor" in left sidebar
3. Click "New Query"
4. Copy and paste the contents of `migration-stripe.sql`
5. Click "Run"
6. Verify success (should see "Success. No rows returned")

---

## Step 2: Set Up Stripe Webhook

### Find Your Cloudflare Pages Domain

Your project is: `dh-portal-v2` (from GitHub repo)

Cloudflare Pages domain will be one of:
- `dh-portal-v2.pages.dev`
- Or your custom domain if you set one up

### Create Webhook in Stripe

1. Go to https://dashboard.stripe.com/webhooks
2. Click **"Add endpoint"**
3. **Endpoint URL**: `https://YOUR-DOMAIN.pages.dev/api/stripe/webhook`
   - Replace `YOUR-DOMAIN` with your actual domain
   - Example: `https://dh-portal-v2.pages.dev/api/stripe/webhook`
4. **Description**: "DH Portal Payment Webhooks"
5. **Events to send**: Click "Select events" and choose:
   - ✅ `checkout.session.completed`
   - ✅ `payment_intent.succeeded`
   - ✅ `payment_intent.payment_failed`
6. Click **"Add endpoint"**
7. **COPY THE SIGNING SECRET** - it starts with `whsec_...`
   - You'll need this in the next step!

---

## Step 3: Add Environment Variables to Cloudflare Pages

### Go to Cloudflare Dashboard

1. Go to https://dash.cloudflare.com
2. Click **"Workers & Pages"** in left sidebar
3. Find and click **"dh-portal-v2"** (or your project name)
4. Click **"Settings"** tab
5. Click **"Environment variables"**
6. Click **"Add variables"**

### Add These Variables (Production):

Click "Add variable" for each:

**Variable 1:**
- Name: `STRIPE_SECRET_KEY`
- Value: `sk_live_...` (your Stripe secret key from dashboard)
- Environment: **Production**

**Variable 2:**
- Name: `STRIPE_WEBHOOK_SECRET`
- Value: `whsec_...` (the secret you copied from Stripe webhook setup)
- Environment: **Production**

**Variable 3:**
- Name: `SUPABASE_URL`
- Value: `https://xtunnfdwltfesscmpove.supabase.co`
- Environment: **Production**

**Variable 4:**
- Name: `SUPABASE_SERVICE_ROLE_KEY`
- Value: `eyJh...` (your Supabase service role key)
- Environment: **Production**

**Variable 5:**
- Name: `ALLOWED_ORIGINS`
- Value: `https://YOUR-DOMAIN.pages.dev` (your actual Cloudflare Pages domain)
- Environment: **Production**

### Important Notes:

- If variables already exist, click "Edit" instead of "Add"
- Make sure to select **Production** environment
- Click **"Save"** after each variable

---

## Step 4: Deploy to Cloudflare

The code is ready to deploy. I can push it to GitHub now, which will trigger automatic deployment.

**Ready to deploy?** Type 'yes' and I'll:
1. Commit all changes
2. Push to GitHub main branch
3. Cloudflare will auto-deploy (takes ~2 minutes)

---

## Step 5: Test the System

### Test with Stripe Test Mode First (Optional)

If you want to test before going live:

1. In Stripe Dashboard, toggle to "Test mode" (top right)
2. Get test API key (starts with `sk_test_`)
3. Create webhook in test mode
4. Update Cloudflare env vars for Preview environment
5. Test with card `4242 4242 4242 4242`

### Test with Live Mode

1. Go to your portal: `https://YOUR-DOMAIN.pages.dev/proposals`
2. Create a test proposal:
   - Client: Test Company
   - Package: Starter
   - Fill in details
3. Click through to Review
4. Verify proposal saved (check Supabase `proposals` table)
5. Click "Generate Payment Link & Send Email"
6. Check email was sent
7. Click payment link
8. Complete payment (real card or use Stripe test mode)
9. Verify in Supabase:
   - `proposals` → status = "paid"
   - `commissions` → new commission created
   - `stripe_events` → webhook logged

---

## ⚠️ Before You Deploy - Checklist

- [ ] SQL migration ran successfully in Supabase
- [ ] Stripe webhook created with correct URL
- [ ] Webhook signing secret copied
- [ ] All 5 environment variables added to Cloudflare Pages
- [ ] Variables saved for Production environment
- [ ] Ready to commit and push code

---

## 🆘 If Something Goes Wrong

### Check Cloudflare Logs
1. Cloudflare Dashboard → Workers & Pages → dh-portal-v2
2. Click "Functions" tab
3. Click "Real-time Logs"
4. Look for errors when webhook fires

### Check Stripe Webhook Logs
1. Stripe Dashboard → Developers → Webhooks
2. Click your webhook
3. Check "Recent events" for delivery status

### Check Supabase Logs
1. Supabase Dashboard → Project → Logs
2. Look for database errors

---

## 📊 What Gets Created

**Database:**
- `proposals` table - stores all proposals
- `stripe_events` table - logs all webhook events

**Backend API:**
- `/api/stripe` - creates payment links
- `/api/stripe/webhook` - receives Stripe events

**Frontend:**
- Proposals page auto-saves to database
- "Request Payment" button generates link + sends email
- Status tracking (Draft → Payment Pending → Paid)
- Auto-creates commissions on payment success

---

## 🎯 After Deployment

You can verify everything is working by checking:

1. **Proposals Table**: New proposals should appear
2. **Stripe Events Table**: Webhook events should be logged
3. **Commissions Table**: Commissions created on payment
4. **Email Logs**: Payment emails sent

---

## 💡 What's the Webhook Secret For?

The webhook secret (`whsec_...`) is how Cloudflare verifies that webhook events are actually from Stripe, not someone trying to fake a payment. It's like a shared password between Stripe and your server.

When Stripe sends a webhook, it includes a signature. Your server uses the webhook secret to verify that signature. If it doesn't match, the webhook is rejected.

This prevents someone from sending a fake "payment succeeded" event to your server to trigger commission creation without actually paying.

---

## Ready?

Once you've:
1. ✅ Run the SQL migration
2. ✅ Created the Stripe webhook
3. ✅ Added environment variables to Cloudflare

Let me know and I'll push the code to GitHub to deploy! 🚀
