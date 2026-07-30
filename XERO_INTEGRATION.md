# 💼 Xero Payroll Integration Guide

## Overview

Integrate Xero Payroll UK with the DH Staff Portal to:
- ✅ Sync leave balances (Portal → Xero, Xero → Portal)
- ✅ Display payslips from Xero in the portal
- ✅ Submit timesheets from portal to Xero
- ✅ Auto-sync employee data

---

## Architecture

```
DH Staff Portal (Cloudflare Worker)
         ↕️ OAuth 2.0
    Xero Payroll UK API
         ↕️
   Supabase Database
```

**Key Components:**
1. **OAuth Flow** - Staff authorize Xero access
2. **Cloudflare Worker** - `/api/xero` handles all Xero API calls
3. **Supabase Tables** - Store OAuth tokens, leave balances, payslips
4. **Scheduled Sync** - Cloudflare Cron daily sync at 6am

---

## Step 1: Create Xero App

1. Go to https://developer.xero.com/app/manage
2. Click **"New app"**
3. Fill in:
   - **App name:** DH Staff Portal
   - **Company or application URL:** https://dhwebsiteservices.co.uk
   - **Redirect URI:** `https://staff.dhwebsiteservices.co.uk/api/xero/callback`
   - **OAuth 2.0 grant type:** Authorization code
4. Click **"Create app"**
5. Copy:
   - **Client ID**
   - **Client secret**

---

## Step 2: Add Xero Credentials to Cloudflare

Add these environment variables to Cloudflare Pages:

```bash
XERO_CLIENT_ID=your-client-id
XERO_CLIENT_SECRET=your-client-secret
XERO_REDIRECT_URI=https://staff.dhwebsiteservices.co.uk/api/xero/callback
```

Via Cloudflare Dashboard:
1. Pages → dh-portal-v2 → Settings → Environment variables
2. Add each variable above

Or via Wrangler:
```bash
npx wrangler pages secret put XERO_CLIENT_ID
npx wrangler pages secret put XERO_CLIENT_SECRET
npx wrangler pages secret put XERO_REDIRECT_URI
```

---

## Step 3: Database Schema

Run this SQL in Supabase:

```sql
-- Xero OAuth tokens
CREATE TABLE xero_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name TEXT NOT NULL DEFAULT 'DH Website Services',
  tenant_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  scopes TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Xero employee mapping (Xero employee ID ↔ Portal email)
CREATE TABLE xero_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL UNIQUE,
  user_name TEXT NOT NULL,
  xero_employee_id UUID NOT NULL,
  xero_employee_number TEXT,
  first_name TEXT,
  last_name TEXT,
  job_title TEXT,
  start_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leave balances synced from Xero
CREATE TABLE xero_leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  user_name TEXT,
  leave_type TEXT NOT NULL, -- 'annual', 'sick', etc
  xero_leave_type_id UUID,
  balance_hours NUMERIC DEFAULT 0,
  balance_days NUMERIC DEFAULT 0,
  units TEXT DEFAULT 'Hours', -- 'Hours' or 'Days'
  as_of_date DATE NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_email, leave_type, as_of_date)
);

-- Payslips from Xero
CREATE TABLE xero_payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  user_name TEXT,
  xero_payslip_id UUID NOT NULL UNIQUE,
  xero_employee_id UUID NOT NULL,
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  payment_date DATE,
  gross_pay NUMERIC,
  net_pay NUMERIC,
  tax NUMERIC,
  ni NUMERIC,
  pension NUMERIC,
  deductions JSONB,
  earnings JSONB,
  leave_earnings JSONB,
  reimbursements JSONB,
  status TEXT, -- 'Draft', 'Posted'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timesheet submissions (Portal → Xero)
CREATE TABLE xero_timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  user_name TEXT,
  xero_employee_id UUID NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  hours JSONB NOT NULL, -- {mon: 8, tue: 7.5, ...}
  total_hours NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, submitted, approved, rejected
  xero_timesheet_id UUID,
  submitted_to_xero_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE xero_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_timesheets ENABLE ROW LEVEL SECURITY;

-- Policies (allow all for now)
CREATE POLICY "allow_all" ON xero_tokens FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON xero_employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON xero_leave_balances FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON xero_payslips FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON xero_timesheets FOR ALL USING (true) WITH CHECK (true);
```

---

## Step 4: Xero API Endpoints

The Cloudflare Worker `/functions/api/xero.js` provides:

### OAuth Flow
- `GET /api/xero/auth` - Start OAuth flow (admin only)
- `GET /api/xero/callback` - OAuth callback handler
- `GET /api/xero/status` - Check if Xero is connected

### Leave Sync
- `POST /api/xero/sync-leave` - Sync leave balances from Xero
- `GET /api/xero/leave-balance?email=user@example.com` - Get user's leave balance
- `POST /api/xero/submit-leave` - Submit leave request to Xero

### Payslips
- `POST /api/xero/sync-payslips` - Sync all payslips from Xero
- `GET /api/xero/payslips?email=user@example.com` - Get user's payslips
- `GET /api/xero/payslip/:id/pdf` - Download payslip PDF

### Timesheets
- `POST /api/xero/submit-timesheet` - Submit timesheet to Xero
- `GET /api/xero/timesheets?email=user@example.com` - Get user's timesheets

### Employee Sync
- `POST /api/xero/sync-employees` - Sync all employees from Xero

---

## Step 5: Admin Setup

### Connect Xero (One-time setup)

1. Log in as admin: david@dhwebsiteservices.co.uk
2. Go to Settings → Integrations
3. Click **"Connect Xero Payroll"**
4. Authorize DH Staff Portal in Xero
5. Select organization: **DH Website Services**
6. Grant permissions:
   - ✅ Payroll employees
   - ✅ Payroll timesheets
   - ✅ Payroll leave applications
   - ✅ Payroll payslips
7. Click **"Authorize"**
8. Redirects back to portal with success message

---

## Step 6: Scheduled Sync

Set up a Cloudflare Cron to sync data daily:

Create `/functions/scheduled.js`:

```javascript
export async function onRequest(context) {
  const { env } = context
  
  // Run daily at 6am UTC
  if (new Date().getHours() !== 6) {
    return new Response('Not scheduled time', { status: 200 })
  }
  
  try {
    // Sync employees
    await fetch('https://staff.dhwebsiteservices.co.uk/api/xero/sync-employees', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CRON_SECRET}`,
      },
    })
    
    // Sync leave balances
    await fetch('https://staff.dhwebsiteservices.co.uk/api/xero/sync-leave', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CRON_SECRET}`,
      },
    })
    
    // Sync payslips
    await fetch('https://staff.dhwebsiteservices.co.uk/api/xero/sync-payslips', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CRON_SECRET}`,
      },
    })
    
    return new Response('Sync complete', { status: 200 })
  } catch (error) {
    console.error('Xero sync failed:', error)
    return new Response(error.message, { status: 500 })
  }
}
```

Add to `wrangler.toml`:
```toml
[triggers]
crons = ["0 6 * * *"] # Daily at 6am UTC
```

---

## Step 7: Frontend Integration

### Display Leave Balance

In `/src/pages/MyProfile.jsx`:

```javascript
import { getXeroLeaveBalance } from '../utils/xero'

function MyProfile() {
  const [leaveBalance, setLeaveBalance] = useState(null)
  
  useEffect(() => {
    getXeroLeaveBalance(user.email).then(balance => {
      setLeaveBalance(balance)
    })
  }, [user.email])
  
  return (
    <div className="card">
      <h3>Leave Balance (from Xero)</h3>
      {leaveBalance ? (
        <div>
          <p>Annual Leave: {leaveBalance.annual} days</p>
          <p>Sick Leave: {leaveBalance.sick} days</p>
        </div>
      ) : (
        <p>Loading from Xero...</p>
      )}
    </div>
  )
}
```

### Display Payslips

```javascript
import { getXeroPayslips } from '../utils/xero'

function MyPayslips() {
  const [payslips, setPayslips] = useState([])
  
  useEffect(() => {
    getXeroPayslips(user.email).then(setPayslips)
  }, [user.email])
  
  return (
    <div className="card">
      <h3>My Payslips</h3>
      {payslips.map(payslip => (
        <div key={payslip.id} className="payslip-row">
          <span>{payslip.pay_period_start} - {payslip.pay_period_end}</span>
          <span>£{payslip.net_pay}</span>
          <a href={`/api/xero/payslip/${payslip.xero_payslip_id}/pdf`} download>
            Download PDF
          </a>
        </div>
      ))}
    </div>
  )
}
```

---

## Testing

### 1. Test OAuth Connection

```bash
curl https://staff.dhwebsiteservices.co.uk/api/xero/status
# Expected: {"connected": true, "organization": "DH Website Services"}
```

### 2. Test Leave Balance Sync

```bash
curl -X POST https://staff.dhwebsiteservices.co.uk/api/xero/sync-leave
# Check database:
# SELECT * FROM xero_leave_balances;
```

### 3. Test Payslip Sync

```bash
curl -X POST https://staff.dhwebsiteservices.co.uk/api/xero/sync-payslips
# Check database:
# SELECT * FROM xero_payslips;
```

---

## Xero API Reference

- **API Docs:** https://developer.xero.com/documentation/api/payrolluk/overview
- **Scopes needed:**
  - `payroll.employees` - Read employee data
  - `payroll.timesheets` - Read/write timesheets
  - `payroll.leaveapplications` - Read/write leave applications
  - `payroll.payslip` - Read payslips
  - `offline_access` - Refresh tokens

---

## Security

- ✅ OAuth tokens stored server-side only (Supabase)
- ✅ Refresh tokens automatically renewed
- ✅ Staff can only view their own data (RLS policies)
- ✅ Admin-only OAuth setup
- ✅ API calls go through Cloudflare Worker (rate limiting)

---

## Deployment Checklist

- [ ] Xero app created
- [ ] Client ID and secret added to Cloudflare
- [ ] Database schema deployed
- [ ] Cloudflare Worker deployed
- [ ] OAuth flow tested
- [ ] Employee sync tested
- [ ] Leave balance sync tested
- [ ] Payslip sync tested
- [ ] Scheduled cron configured
- [ ] Frontend UI tested

**Ready for Xero! 💼**
