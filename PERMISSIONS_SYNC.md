# 🔐 Permissions Sync - Mobile & Browser

## ✅ Same Permissions Everywhere

**Permissions are NOT separate** - mobile and browser use the **SAME** database table.

---

## 🗄️ How It Works

### One Permission System

```
Mobile App                Browser App
    ↓                          ↓
    ↓                          ↓
    ↘                          ↙
   user_permissions table
  (Supabase PostgreSQL)
```

**Database table:**
```sql
user_permissions (
  user_email TEXT,
  permissions JSONB,  ← Same permissions for mobile & browser
  onboarding BOOLEAN
)
```

**Example permission row:**
```json
{
  "user_email": "josh@dhwebsiteservices.co.uk",
  "permissions": {
    "dashboard": true,
    "recruiting_jobs": true,
    "hr_profiles": false,
    "admin": false
  },
  "onboarding": false
}
```

**This single row controls:**
- ✅ Browser access
- ✅ Mobile app access
- ✅ Both platforms read the same row

---

## 📱 What Happens When You Change Permissions

### Scenario 1: Change on Mobile

**Mobile:**
```
1. Admin opens Staff Directory on mobile
2. Taps Josh Smith
3. Taps "Permissions" tab
4. Toggles "HR Profiles" → ON
5. Taps "Save"
```

**Database:**
```sql
UPDATE user_permissions
SET permissions = '{"hr_profiles": true, ...}'
WHERE user_email = 'josh@dhwebsiteservices.co.uk'
```

**Browser:**
```
1. Josh opens browser
2. Sidebar now shows "HR Profiles" link
3. Same permission applied!
```

**Result:** Mobile change → Browser sees it ✅

---

### Scenario 2: Change on Browser

**Browser:**
```
1. Admin opens Staff settings
2. Edits Josh's permissions
3. Toggles "Recruiting Jobs" → OFF
4. Saves
```

**Database:**
```sql
UPDATE user_permissions
SET permissions = '{"recruiting_jobs": false, ...}'
WHERE user_email = 'josh@dhwebsiteservices.co.uk'
```

**Mobile:**
```
1. Josh opens mobile app
2. "Recruiting" tab is hidden
3. Same permission applied!
```

**Result:** Browser change → Mobile sees it ✅

---

## 🎯 Permission Examples

### Example 1: Admin Access

**Set on mobile:**
```
1. Edit staff permissions
2. Toggle "Admin" → ON
3. Save
```

**Effect everywhere:**
- ✅ Browser: User sees all admin features
- ✅ Mobile: User sees Staff Directory, full access
- ✅ Both platforms: Full admin power

**Set on browser:**
```
1. Staff settings → Edit permissions
2. Toggle "Admin" → OFF
3. Save
```

**Effect everywhere:**
- ✅ Browser: Admin features hidden
- ✅ Mobile: Staff Directory hidden
- ✅ Both platforms: Admin removed

---

### Example 2: Recruiting Access

**Set on mobile:**
```
1. Edit Josh's permissions
2. Toggle "Recruiting Jobs" → ON
3. Save
```

**What Josh sees:**

**Browser:**
- Sidebar shows "Recruiting" section
- Can access Jobs, Applications, Board

**Mobile:**
- Bottom tabs show "Recruiting" (if configured)
- Can access recruiting screens

**Both read the same permission!**

---

### Example 3: HR Profiles

**Set on browser:**
```
1. Admin panel → Staff settings
2. Edit Sarah's permissions
3. Toggle "HR Profiles" → ON
4. Save
```

**What Sarah sees:**

**Mobile:**
- Can access HR features
- Can view staff profiles
- Same as browser

**Browser:**
- Sidebar shows HR section
- Can access HR Profiles

---

## 🔄 Real-Time Sync

### How Fast?

**Instant** - as soon as you save:

```
Mobile saves → Database writes → Browser reads
(< 1 second)
```

**Example:**
```
10:00:00 - Admin changes permission on mobile
10:00:00 - Database updated
10:00:01 - User refreshes browser → sees new permission
```

**No delay!**

---

## 📊 What Permissions Control

### Same Permissions, Both Platforms

| Permission | Browser Effect | Mobile Effect |
|------------|---------------|---------------|
| `dashboard` | Shows Dashboard link | Shows Dashboard screen |
| `recruiting_jobs` | Shows Recruiting section | Shows Recruiting tab |
| `hr_profiles` | Shows HR section | Shows HR screens |
| `admin` | Shows admin features | Shows Staff Directory |
| `manager` | Shows My Team link | Shows Team tab |
| `clientmgmt` | Shows Clients section | Shows Clients screen |

**All permissions work the same way on both platforms!**

---

## ✅ Permission Workflow

### Admin Grants Access (Mobile)

```
1. Home → Staff Directory
2. Tap staff member
3. Tap "Permissions" tab
4. Toggle permissions:
   ✅ Dashboard
   ✅ Recruiting Jobs
   ✅ HR Profiles
   ❌ Admin
5. Tap "Save"
```

**Effect:**
- Database: `user_permissions` updated
- Browser: User sees Dashboard, Recruiting, HR sections
- Mobile: User sees same screens
- **Same permissions everywhere**

---

### Admin Grants Access (Browser)

```
1. Staff settings → Permissions
2. Edit user permissions
3. Toggle:
   ✅ Dashboard
   ✅ Manager access
   ✅ Client management
5. Save
```

**Effect:**
- Database: `user_permissions` updated
- Mobile: User sees Dashboard, Team, Clients
- Browser: User sees same sections
- **Same permissions everywhere**

---

## 🚫 What Doesn't Work

### Separate Permissions Per Platform

**❌ NOT POSSIBLE:**
```
User has "Admin" on mobile only
User has "HR Profiles" on browser only
```

**Why:** Same database table!

**✅ REALITY:**
```
User has "Admin" → works on BOTH mobile and browser
User has "HR Profiles" → works on BOTH mobile and browser
```

---

## 🔐 Onboarding Mode

### Same Sync

**Set on mobile:**
```
1. Staff Profile → Permissions
2. Toggle "Onboarding" → OFF
3. Save
```

**Database:**
```sql
UPDATE user_permissions
SET onboarding = false
WHERE user_email = 'user@example.com'
```

**Effect everywhere:**
- ✅ Browser: User exits onboarding mode
- ✅ Mobile: User sees full app
- **Same onboarding status everywhere**

---

## 📱 Platform-Specific UI

### Same Data, Different UI

**Permissions are the same, but UI adapts:**

**Browser:**
- Sidebar navigation
- Hover menus
- Desktop layout

**Mobile:**
- Bottom tabs
- Native cards
- Mobile layout

**Example:**
```
User has "recruiting_jobs" permission:

Browser shows:
├── Sidebar
│   └── Recruiting
│       └── Jobs

Mobile shows:
└── Bottom tabs
    └── Recruiting (tap to open)
        └── Jobs screen
```

**Same permission, different presentation!**

---

## ✅ Summary

### One Permission System

- ✅ Same database table (`user_permissions`)
- ✅ Change on mobile → browser sees it
- ✅ Change on browser → mobile sees it
- ✅ Real-time sync (instant)
- ✅ No separate permissions per platform
- ✅ Same security everywhere

### How to Use

**To grant access to a feature:**
1. Edit permissions on mobile OR browser
2. Toggle permission ON
3. Save
4. **User sees feature on BOTH platforms**

**To remove access:**
1. Edit permissions on mobile OR browser
2. Toggle permission OFF
3. Save
4. **User loses access on BOTH platforms**

### Key Point

**There is NO such thing as:**
- "Mobile-only permissions"
- "Browser-only permissions"
- "Different permissions per platform"

**There IS only:**
- **One set of permissions**
- **Stored in one database table**
- **Applied to both mobile and browser**
- **100% synced**

**Change it anywhere → affects everywhere! 🔄**
