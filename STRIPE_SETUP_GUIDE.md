# Stripe Payment System - Setup Guide

## ✅ What's Been Built

### 1. Database Schema (supabase-schema.sql)

**New Tables:**
- `proposals` - Stores all proposal data with payment tracking
- `stripe_events` - Logs all Stripe webhook events

**Removed Tables:**
- `client_payments` (GoCardless)
- `gocardless_mandates` (GoCardless)
- `gc_events` (GoCardless)

### 2. Backend API (/functions/api/stripe.js)

Cloudflare Pages Function that handles:
- Creating Stripe Payment Links
- Receiving Stripe webhooks
- Logging webhook events to database
- Automatically updating proposal status to "paid"
- Automatically creating commissions when payment succeeds

**Security:** Stripe API key never touches the browser - all API calls go through this secure backend.

### 3. Frontend Utilities

**`/src/utils/stripe.js`**
- `createPaymentLink()` - Generate Stripe Payment Link
- `getPaymentStatus()` - Check payment status

**`/src/utils/proposals.js`**
- `saveProposal()` - Save new proposal to database
- `updateProposal()` - Update existing proposal
- `getProposals()` - Fetch proposals with filters
- `getProposal()` - Get single proposal by ID

**`/src/utils/email.js`**
- `sendPaymentEmail()` - Beautiful HTML email with payment link

### 4. Updated Proposals Page (/src/pages/Proposals.jsx)

**New Features:**
- Auto-saves proposal to database when reaching Review step
- "Request Payment" section after download
- Payment amount and description customization
- One-click "Generate Payment Link & Send Email"
- Visual status indicator (Draft / Payment Pending / Paid)
- Error handling

---

## 🚀 Deployment Steps

### Step 1: Update Supabase Database

1. Go to Supabase SQL Editor
2. Run the updated `supabase-schema.sql` file
3. Verify new tables created: `proposals`, `stripe_events`
4. Verify old tables removed: `client_payments`, `gocardless_mandates`, `gc_events`

### Step 2: Get Stripe API Keys

1. Sign up at https://stripe.com (or log in)
2. Go to Developers → API keys
3. Copy your **Secret key** (starts with `sk_test_` for test mode)
4. Go to Developers → Webhooks → Add endpoint
5. Endpoint URL: `https://your-domain.pages.dev/api/stripe/webhook`
6. Events to listen for:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
7. Copy the **Webhook signing secret** (starts with `whsec_`)

### Step 3: Add Environment Variables to Cloudflare Pages

1. Go to Cloudflare Dashboard → Pages → Your project → Settings → Environment variables
2. Add these variables for **Production**:

```
STRIPE_SECRET_KEY = sk_live_... (or sk_test_... for testing)
STRIPE_WEBHOOK_SECRET = whsec_...
SUPABASE_URL = https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY = your-service-role-key
ALLOWED_ORIGINS = https://your-domain.pages.dev
```

3. Redeploy your site for variables to take effect

### Step 4: Deploy Updated Code

```bash
cd /Users/david/Downloads/dh-portal-v2-main
git add .
git commit -m "Add Stripe payment system for proposals"
git push origin main
```

Cloudflare Pages will automatically deploy.

### Step 5: Test the Flow (Test Mode)

1. Navigate to `/proposals` in your portal
2. Fill in client details and select package
3. Click through to Review step
4. Verify proposal saves to database (check Supabase)
5. Click "Generate Payment Link & Send Email"
6. Check customer email for payment link
7. Click payment link and use Stripe test card:
   - Card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
8. Complete payment
9. Check Supabase:
   - `proposals` table: status should be "paid"
   - `commissions` table: new commission created
   - `stripe_events` table: webhook event logged

---

## 📊 How It Works

### The Complete Flow

1. **Staff creates proposal:**
   - Fills in client details, selects package, hosting, extras
   - Reaches Review step
   - Proposal auto-saved to database with status "draft"

2. **Staff requests payment:**
   - Clicks "Generate Payment Link & Send Email"
   - Backend creates Stripe Payment Link via secure API
   - Proposal updated with payment link and status "payment_pending"
   - Automated email sent to customer with beautiful branded template

3. **Customer pays:**
   - Opens payment link in email
   - Enters card details on Stripe-hosted page
   - Completes payment

4. **Stripe webhook fires:**
   - Stripe sends `payment_intent.succeeded` event to your webhook
   - Backend logs event to `stripe_events` table
   - Backend updates proposal status to "paid"
   - Backend creates commission record for staff member
   - Commission amount calculated based on staff commission rate

5. **Staff sees results:**
   - Proposal status changes to "Paid ✅"
   - Commission appears in Commissions page with status "available"
   - Staff can request payout from manager

---

## 🔐 Security Features

✅ **Stripe API key never exposed** - All API calls go through Cloudflare Function
✅ **Webhook signature verification** - Prevents spoofed webhook events
✅ **Row Level Security** - Supabase RLS policies control data access
✅ **Event deduplication** - `stripe_events.event_id` unique constraint
✅ **Staff permissions** - Staff never see Stripe dashboard, balance, or other customers
✅ **Server-side validation** - All payment processing happens on backend

---

## 🛠️ Troubleshooting

### Payment link not generating

**Check:**
1. Cloudflare environment variables set correctly
2. `STRIPE_SECRET_KEY` starts with `sk_test_` or `sk_live_`
3. Browser console for errors
4. Cloudflare Functions logs

### Email not sending

**Check:**
1. Email system configured (Resend API key)
2. `/api/send-email` endpoint working
3. Customer email address valid
4. Check `email_log` table in Supabase

### Webhook not firing

**Check:**
1. Webhook endpoint URL correct in Stripe dashboard
2. Events selected: `checkout.session.completed`, `payment_intent.succeeded`
3. `STRIPE_WEBHOOK_SECRET` environment variable set
4. Cloudflare Functions logs for webhook calls
5. `stripe_events` table for logged events

### Commission not created

**Check:**
1. Proposal has `assigned_to_email` field populated
2. Staff exists in `commission_settings` table
3. `stripe_events` table shows event processed = true
4. Cloudflare Functions logs for errors

---

## 📝 Next Steps (Optional Enhancements)

1. **Proposal Management Page**
   - List all proposals with filtering (draft, pending, paid)
   - Search by client name/email
   - Quick actions (resend payment link, view details)

2. **Payment Reminders**
   - Automated email reminders for unpaid proposals
   - Scheduled Cloudflare Worker to check pending payments

3. **Client Portal**
   - Public page where clients can view and accept proposals
   - Digital signature before payment

4. **Partial Payments**
   - Deposit + remaining balance flows
   - Multiple payment links per proposal

5. **Analytics Dashboard**
   - Total proposals sent
   - Conversion rate (proposals → paid)
   - Average deal size
   - Commission totals by staff

---

## 📚 File Reference

**Modified Files:**
- `/supabase-schema.sql` - Database schema
- `/src/pages/Proposals.jsx` - Proposal builder with payment
- `/src/utils/email.js` - Payment email template

**New Files:**
- `/functions/api/stripe.js` - Stripe API proxy & webhook handler
- `/src/utils/stripe.js` - Frontend Stripe utilities
- `/src/utils/proposals.js` - Proposal database operations

**Files to Delete (if migrating from GoCardless):**
- `/src/utils/gocardless.js`
- `/src/components/PaymentsHub.jsx` (rebuild for Stripe or remove)

---

## 🎯 Key Benefits

✅ **Staff never log into Stripe** - All actions via portal
✅ **No sensitive data access** - Staff can't see balance, fees, or other customers
✅ **Automated workflows** - Email sent, status updated, commission created automatically
✅ **Professional customer experience** - Branded email + secure Stripe checkout
✅ **Full audit trail** - All events logged in database
✅ **Commission tracking** - Staff immediately see earnings without manual entry

---

## 💡 Testing Checklist

- [ ] Proposal saves to database
- [ ] Payment link generates successfully
- [ ] Email sends to customer
- [ ] Payment link opens and works
- [ ] Test payment completes (use `4242 4242 4242 4242`)
- [ ] Webhook received and logged
- [ ] Proposal status updates to "paid"
- [ ] Commission created with correct amount
- [ ] Commission visible in portal

---

## 🆘 Support

If you encounter issues:

1. Check Cloudflare Functions logs (real-time logs in dashboard)
2. Check Supabase logs (API → Logs)
3. Check browser console for frontend errors
4. Review Stripe Dashboard → Events for webhook deliveries
5. Verify environment variables are set correctly

**Environment Variables Quick Check:**
```bash
# In Cloudflare Pages Settings → Environment variables
STRIPE_SECRET_KEY ✓
STRIPE_WEBHOOK_SECRET ✓
SUPABASE_URL ✓
SUPABASE_SERVICE_ROLE_KEY ✓
ALLOWED_ORIGINS ✓
```

---

## ✨ You're All Set!

The Stripe payment system is ready to go. Start by testing in Stripe test mode, then switch to live mode when ready for real payments.

**First Test:**
1. Create a proposal
2. Click "Generate Payment Link & Send Email"
3. Pay with test card `4242 4242 4242 4242`
4. Watch the magic happen! 🎉
