// Single source of truth for which permission keys unlock which top-level
// nav tab. Used by TopBar (to decide which tabs to render) and by the
// StaffProfile Permissions tab (to group the same 54 keys under matching
// headings). Keep in sync with ALL_PAGES in StaffProfile.jsx - if a page key
// is added/removed there, add/remove it here too.

export const NAV_TABS = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', keys: [] }, // always visible
  {
    id: 'outreach',
    label: 'Outreach',
    path: '/outreach',
    keys: ['outreach', 'sendemail', 'sms_manager', 'proposals'],
  },
  {
    id: 'mywork',
    label: 'My Work',
    path: '/my-tasks',
    keys: [
      'mytasks', 'schedule', 'appointments', 'hr_leave', 'hr_payslips',
      'pdf_workspace', 'pdf_shared_view', 'pdf_shared_edit', 'pdf_shared_admin',
    ],
  },
  {
    id: 'people',
    label: 'People',
    path: '/people',
    keys: [
      'staff', 'hr_profiles', 'hr_onboarding', 'hr_policies', 'hr_documents',
      'hr_timesheet', 'contract_templates', 'contract_queue', 'org_chart',
      'my_team', 'my_department',
    ],
  },
  {
    id: 'recruiting',
    label: 'Recruiting',
    path: '/recruiting',
    keys: [
      'recruiting_dashboard', 'recruiting_jobs', 'recruiting_applications',
      'recruiting_board', 'recruiting_settings',
    ],
  },
  {
    id: 'websites',
    label: 'Websites',
    path: '/website-builder',
    keys: [
      'clients', 'clientmgmt', 'competitor', 'domains', 'website_editor',
      'shop_orders_view', 'shop_orders_edit', 'shop_products_view',
      'shop_products_edit', 'shop_customers_view', 'shop_customers_edit',
    ],
  },
  {
    id: 'support',
    label: 'Support',
    path: '/support',
    keys: ['support'],
  },
  {
    id: 'reports',
    label: 'Reports',
    path: '/reports',
    keys: ['reports', 'manager_board', 'tasks'],
  },
  {
    id: 'admin',
    label: 'Admin',
    path: '/settings',
    keys: [
      'admin', 'audit', 'departments', 'service_admin', 'safeguards',
      'mailinglist', 'banners', 'emailtemplates', 'maintenance', 'settings',
    ],
  },
]

// Returns the subset of NAV_TABS a user should see, given their can(key) check.
export function visibleNavTabs(can) {
  return NAV_TABS.filter((tab) => tab.keys.length === 0 || tab.keys.some((k) => can(k)))
}
