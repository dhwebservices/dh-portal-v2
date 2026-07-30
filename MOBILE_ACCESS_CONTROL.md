# Mobile App Access Control - Implementation Guide

**Date:** 2026-07-29  
**Status:** ✅ **IMPLEMENTED**

---

## Overview

The mobile app uses role-based access control (RBAC) via the `useAuth()` hook, which provides:
- `user` - Current user object with email, name
- `isAdmin` - Boolean flag for admin/manager access
- `can(permission)` - Function to check specific permissions

---

## Access Control by Screen

### 1. **Leave Requests** (`/src/mobile/screens/Leave.jsx`)

**Staff Access:**
- ✅ View own leave requests
- ✅ Submit new leave requests
- ✅ Edit pending leave requests
- ✅ Delete pending leave requests
- ❌ Cannot approve/reject any requests
- ❌ Cannot view other staff's requests

**Manager Access (`isAdmin`):**
- ✅ View all staff leave requests
- ✅ Approve pending requests
- ✅ Reject pending requests
- ✅ View all statuses (pending, approved, rejected)

**Implementation:**
```javascript
// Line 41-48: Load requests based on role
if (!isAdmin) {
  query = query.eq('user_email', user.email)  // Staff: own only
} else {
  // Manager: all requests
}

// Line 466-478: Approval buttons only for managers
{request.status === 'pending' && isAdmin && (
  <div className="request-actions">
    <button onClick={() => handleApprove(request)}>Approve</button>
    <button onClick={() => handleReject(request)}>Reject</button>
  </div>
)}

// Line 480-488: Delete button only for own pending requests
{request.status === 'pending' && !isAdmin && request.user_email === user.email && (
  <button onClick={() => handleDelete(request)}>Delete</button>
)}
```

---

### 2. **Outreach** (`/src/mobile/screens/Outreach.jsx`)

**All Staff Access:**
- ✅ View all client contacts (shared database)
- ✅ Add new contacts
- ✅ Edit contacts
- ✅ Delete contacts
- ✅ Log call outcomes
- ✅ Update status

**Notes:**
- Outreach is a **shared team resource** - all staff can manage contacts
- No role restrictions (by design - sales/support team collaboration)

---

### 3. **Timesheet/Schedule** (`/src/mobile/screens/Timesheet.jsx`)

**All Staff Access:**
- ✅ View own schedule for next 4 weeks
- ✅ Add planned work hours
- ✅ Edit scheduled hours
- ✅ Delete scheduled days

**Restrictions:**
- ❌ Cannot view other staff's schedules
- ❌ Cannot edit past dates

**Implementation:**
```javascript
// Line 26: Load only own schedule
.eq('user_email', user.email)

// Line 122: Prevent editing past dates
{!isPast && handleDatePress(date)}
```

---

### 4. **Clock In/Out** (`/src/mobile/screens/ClockIn.jsx`)

**All Staff Access:**
- ✅ Clock in with GPS verification
- ✅ Clock out
- ✅ View own attendance history

**Restrictions:**
- ❌ Cannot clock in/out for other staff
- ❌ Cannot edit clock-in times (GPS locked)

---

### 5. **Attendance Reports** (`/src/mobile/screens/Attendance.jsx`)

**Staff Access:**
- ✅ View own attendance records
- ✅ View own hours worked

**Manager Access (`isAdmin`):**
- ✅ View all staff attendance
- ✅ Generate reports
- ✅ Export data

---

### 6. **Staff Directory** (`/src/mobile/screens/StaffDirectory.jsx`)

**Staff Access:**
- ✅ View all staff profiles
- ✅ Call/email staff members

**Manager Access (`isAdmin`):**
- ✅ Edit staff profiles
- ✅ Add new staff
- ✅ Set hourly rates (future feature)

**Implementation:**
```javascript
// Navigation guard in MobileApp.jsx
{isAdmin && (
  <MobileCard onPress={() => navigate('staff-directory')}>
    Staff Directory
  </MobileCard>
)}
```

---

### 7. **Payslips** (Future - Task #20)

**Staff Access:**
- ✅ View own payslips
- ✅ Download payslip PDFs

**Manager Access (`isAdmin`):**
- ✅ Generate payslips for all staff
- ✅ Calculate hours from clock-in data
- ✅ Apply NI and Tax deductions
- ✅ Set hourly rates

---

## Permission System

The app uses the existing `useAuth()` context from `/src/contexts/AuthContext.jsx`:

```javascript
const { user, isAdmin, can } = useAuth()

// Check if user is admin/manager
if (isAdmin) {
  // Show manager-only features
}

// Check specific permissions
if (can('manage_staff')) {
  // Show staff management features
}

// Access current user data
console.log(user.email, user.name)
```

---

## Database-Level Security (RLS)

All Supabase tables use Row Level Security (RLS) policies:

```sql
-- Example: Leave requests
create policy "users_own_leave"
  on hr_leave
  for select
  using (user_email = auth.jwt()->>'email' OR is_admin(auth.jwt()->>'email'));

create policy "admins_all_leave"
  on hr_leave
  for all
  using (is_admin(auth.jwt()->>'email'));
```

**Note:** RLS policies are defined in `/supabase-schema.sql` and enforced server-side.

---

## Navigation Guards

Certain screens are only accessible to admins via conditional navigation:

**File:** `/src/mobile/screens/HomeProfessional.jsx`

```javascript
{isAdmin && (
  <MobileCard small onPress={() => navigate('staff-directory')}>
    <Icon name="users" />
    <div>
      <h4>Staff Directory</h4>
      <p>Manage all staff</p>
    </div>
  </MobileCard>
)}
```

**Screens with Navigation Guards:**
- Staff Directory (admin only)
- Payslip Generator (admin only - future)
- HR Reports (admin only - future)

---

## Testing Access Control

### Test as Staff Member

1. Log in as non-admin user
2. Go to Leave Requests
3. **Expected:**
   - See only own leave requests
   - Can submit new requests
   - No approve/reject buttons visible
   - Can delete own pending requests

4. Go to Timesheet
5. **Expected:**
   - See only own schedule
   - Can add/edit future work hours

6. Go to Dashboard
7. **Expected:**
   - No "Staff Directory" card visible
   - No admin-only features visible

---

### Test as Manager/Admin

1. Log in as admin user
2. Go to Leave Requests
3. **Expected:**
   - See ALL staff leave requests
   - Approve/Reject buttons visible on pending requests
   - Can view all statuses

4. Go to Dashboard
5. **Expected:**
   - "Staff Directory" card visible
   - All admin features accessible

---

## Future Enhancements

### Phase 1 (Immediate)
- [x] Leave request approval workflow
- [x] Role-based dashboard cards
- [ ] Payslip generation (admin only)
- [ ] Hourly rate management (admin only)

### Phase 2 (Future)
- [ ] Granular permissions (`can('approve_leave')`, `can('view_payroll')`)
- [ ] Department-based access (managers see only their department)
- [ ] Audit log for admin actions
- [ ] Permission templates (HR, Manager, Staff, Contractor)

---

## Security Best Practices

### ✅ Implemented
1. **Client-side guards** - Hide UI elements based on role
2. **Server-side validation** - RLS policies enforce data access
3. **JWT-based auth** - Supabase authentication
4. **Role flags** - `isAdmin` boolean for quick checks

### ⚠️ Important Notes
- **Never trust client-side checks alone** - Always enforce server-side
- **RLS policies are mandatory** - Every table must have proper policies
- **Audit sensitive actions** - Log admin operations (leave approvals, payslip generation)
- **Test both roles** - Always verify staff and admin access

---

## Code Patterns

### Pattern 1: Conditional Rendering
```javascript
{isAdmin && (
  <button onClick={handleAdminAction}>Admin Action</button>
)}
```

### Pattern 2: Data Filtering
```javascript
let query = supabase.from('table').select('*')

if (!isAdmin) {
  query = query.eq('user_email', user.email)  // Staff sees own data only
}
```

### Pattern 3: Action Validation
```javascript
const handleApprove = async (request) => {
  if (!isAdmin) {
    alert('Unauthorized')
    return
  }
  // Proceed with approval
}
```

---

## Conclusion

Access control is implemented across all mobile screens using:
- ✅ Role-based UI rendering (`isAdmin`)
- ✅ Data filtering (Supabase queries)
- ✅ Navigation guards (conditional dashboard cards)
- ✅ Server-side RLS policies (database-level security)

**Status:** Production ready for staff/manager roles.  
**Next:** Implement granular permissions for complex scenarios.

---

**Documented by:** Claude Code  
**Date:** 2026-07-29  
**Status:** ✅ **COMPLETE**
