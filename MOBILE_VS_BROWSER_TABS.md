# 📱 Mobile vs Browser - Tab Names & Permissions

## ✅ Yes - Same Permission Keys!

The **mobile tabs use the SAME permission keys** as the browser, so:
- Grant "my_team" permission → Works on **BOTH** mobile and browser
- Grant "hr_profiles" permission → Works on **BOTH** mobile and browser
- **Same permissions control both platforms**

---

## 📊 Tab Mapping

### Bottom Tabs (Mobile)

| Mobile Tab | Browser Equivalent | Permission Key | Description |
|------------|-------------------|----------------|-------------|
| **Dashboard** | Dashboard | `dashboard` | Overview & stats |
| **My Team** | View My Team | `my_team` | Manager view of direct reports |
| **My Tasks** | My Tasks | `mytasks` | Your assigned tasks |
| **HR** | HR section | Multiple | HR features (timesheets, leave, payslips) |
| **My Profile** | My Profile | `my_profile` | Your account |

### More Menu (Mobile)

| Mobile Screen | Browser Equivalent | Permission Key |
|--------------|-------------------|----------------|
| **Schedule** | Schedule | `schedule` |
| **Attendance** | Timesheets | `hr_timesheet` |
| **Documents** | HR Documents | `hr_documents` |
| **Clients** | Clients | `clientmgmt` |
| **Dashboard** | Dashboard | `dashboard` |
| **Support** | Support | `support` |
| **Notifications** | Notifications | `notifications` |
| **Settings** | Settings | `settings` |

### Admin Features (Mobile)

| Mobile Screen | Browser Equivalent | Permission Key |
|--------------|-------------------|----------------|
| **Staff Directory** | My Staff / HR Profiles | `admin` or `hr_profiles` |
| **Staff Profile** | Staff Profile page | `admin` or `hr_profiles` |
| **Edit Staff** | Edit Staff form | `admin` |
| **Permissions** | User Permissions | `admin` |

---

## 🔑 Permission Keys Explained

### How Permissions Work

**Browser:**
```javascript
// Sidebar checks permission
{can('dashboard') && <NavLink to="/dashboard">Dashboard</NavLink>}
```

**Mobile:**
```javascript
// Bottom tab checks permission
{can('my_team') && <TabButton label="My Team" />}
```

**Same permission key = same access!**

---

## 📱 Examples

### Example 1: Dashboard Access

**Grant permission:**
```sql
UPDATE user_permissions
SET permissions = '{"dashboard": true}'
WHERE user_email = 'user@example.com'
```

**Browser shows:**
- Sidebar → Home section → "Dashboard" link

**Mobile shows:**
- Bottom tabs → "Dashboard" tab

**Same permission (`dashboard`) = both platforms show it!**

---

### Example 2: My Team Access

**Grant permission:**
```sql
UPDATE user_permissions
SET permissions = '{"my_team": true}'
WHERE user_email = 'manager@example.com'
```

**Browser shows:**
- Sidebar → Home section → "View My Team" link

**Mobile shows:**
- Bottom tabs → "My Team" tab

**Same permission (`my_team`) = both platforms show it!**

---

### Example 3: HR Profiles Access

**Grant permission:**
```sql
UPDATE user_permissions
SET permissions = '{"hr_profiles": true}'
WHERE user_email = 'hr@example.com'
```

**Browser shows:**
- Sidebar → HR section → "HR Profiles" link

**Mobile shows:**
- Can view HR screens
- Can access staff directory (if admin)

**Same permission (`hr_profiles`) = both platforms grant access!**

---

### Example 4: Admin Access

**Grant admin:**
```sql
UPDATE user_permissions
SET permissions = '{"admin": true}'
WHERE user_email = 'admin@example.com'
```

**Browser shows:**
- All admin features
- Service Admin
- My Staff
- All sections visible

**Mobile shows:**
- Staff Directory on home screen
- Can edit all staff
- Can change permissions
- Full admin power

**Same permission (`admin`) = full access everywhere!**

---

## 🎯 Tab Names vs Permission Keys

### Mobile Tabs (Simplified Names)

Mobile uses **shorter names** for space:

| Mobile Tab Name | Browser Name | Permission Key |
|----------------|--------------|----------------|
| Dashboard | Dashboard | `dashboard` |
| My Team | View My Team | `my_team` |
| My Tasks | My Tasks | `mytasks` |
| HR | HR (section) | Multiple HR keys |
| My Profile | My Profile | `my_profile` |

**Different labels, SAME permissions!**

---

## ✅ What This Means

### 1. Same Permission System

**Browser and mobile check the SAME permission keys:**
```javascript
// Browser
can('dashboard') // Checks user_permissions.permissions.dashboard

// Mobile
can('dashboard') // Checks user_permissions.permissions.dashboard
```

**Result:** Same permission works on both!

---

### 2. Grant Once, Works Everywhere

**Grant permission on mobile:**
```
Admin → Staff Directory → Edit Josh
Permissions tab → Toggle "Dashboard" → ON
Save
```

**Josh sees:**
- ✅ Browser: Dashboard link in sidebar
- ✅ Mobile: Dashboard tab at bottom

**One change = both platforms updated!**

---

### 3. Tab Labels Don't Matter

**Mobile tab says "Dashboard"**
- Uses permission key: `dashboard`

**Browser link says "Dashboard"**
- Uses permission key: `dashboard`

**Same key = same access!**

---

## 🔐 Permission Reference

### All Permission Keys (Used by Both Platforms)

```javascript
{
  // Home
  "dashboard": true,
  "notifications": true,
  "my_profile": true,
  "search": true,
  "my_department": true,
  "my_team": true,

  // Business
  "outreach": true,
  "clients": true,
  "clientmgmt": true,
  "website_editor": true,
  "pdf_workspace": true,
  "support": true,
  "competitor": true,
  "domains": true,
  "proposals": true,
  "sendemail": true,
  "sms_manager": true,
  "emailtemplates": true,
  "mailinglist": true,

  // Tasks
  "tasks": true,
  "mytasks": true,
  "schedule": true,
  "appointments": true,

  // HR
  "hr_timesheet": true,
  "hr_leave": true,
  "hr_payslips": true,
  "hr_profiles": true,
  "hr_policies": true,
  "hr_documents": true,
  "hr_onboarding": true,
  "contract_queue": true,
  "contract_templates": true,
  "staff": true,
  "org_chart": true,

  // Recruiting
  "recruiting_jobs": true,
  "recruiting_applications": true,
  "recruiting_board": true,
  "recruiting_settings": true,

  // Shop
  "shop_orders_view": true,
  "shop_orders_edit": true,
  "shop_customers_view": true,
  "shop_customers_edit": true,
  "shop_products_view": true,
  "shop_products_edit": true,

  // Admin
  "reports": true,
  "manager_board": true,
  "departments": true,
  "safeguards": true,
  "service_admin": true,
  "banners": true,
  "audit": true,
  "maintenance": true,
  "settings": true,
  "admin": true
}
```

**All these keys work on BOTH mobile and browser!**

---

## 📱 Mobile Tab Configuration

### Bottom Tabs

```javascript
// Dashboard - Always visible
{ permission: 'dashboard', label: 'Dashboard' }

// My Team - Only if manager
{ permission: 'my_team', label: 'My Team' }

// My Tasks - Always visible
{ permission: 'mytasks', label: 'My Tasks' }

// HR - Combines multiple HR permissions
{ permission: 'hr_leave|hr_timesheet|hr_payslips', label: 'HR' }

// My Profile - Always visible
{ permission: 'my_profile', label: 'My Profile' }
```

### More Menu

All other features accessible via "More" overflow menu.

---

## ✅ Summary

### Same Permissions

- ✅ Browser and mobile use **identical permission keys**
- ✅ Grant permission once → works **everywhere**
- ✅ Same database table (`user_permissions`)
- ✅ Real-time sync

### Different Labels

- ✅ Mobile uses **shorter tab names** (space constraints)
- ✅ Browser uses **full descriptive names**
- ✅ **But same permission keys underneath!**

### Examples

| Mobile Label | Browser Label | Permission Key | Effect |
|-------------|---------------|----------------|--------|
| Dashboard | Dashboard | `dashboard` | Same access |
| My Team | View My Team | `my_team` | Same access |
| My Tasks | My Tasks | `mytasks` | Same access |
| HR | HR (section) | `hr_*` | Same access |
| My Profile | My Profile | `my_profile` | Same access |

**Different names, SAME permissions, SAME access! ✅**
