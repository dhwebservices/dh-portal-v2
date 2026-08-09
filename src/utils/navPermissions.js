// Single source of truth for which permission keys unlock which top-level
// nav tab. Used by TopBar (to decide which tabs to render) and mirrors the
// grouping of the same 55-key catalog in src/utils/permissionCatalog.js
// (rendered on the StaffProfile Permissions tab). Keep the two in sync -
// if a key's tab moves, or a key is added/removed, update both files.

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
      'mytasks', 'tasks', 'schedule', 'appointments', 'hr_leave', 'hr_payslips',
      'pdf_workspace', 'pdf_shared_view', 'pdf_shared_edit', 'pdf_shared_admin',
    ],
  },
  {
    id: 'rota',
    label: 'Rotas',
    path: '/rotas',
    keys: ['rota'],
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
      'recruiting_jobs', 'recruiting_applications',
      'recruiting_board', 'recruiting_settings',
    ],
  },
  {
    id: 'websites',
    label: 'Websites',
    path: '/clients',
    keys: [
      'clients', 'clientmgmt', 'competitor', 'domains', 'website_editor',
      'shop_orders_view', 'shop_products_view', 'shop_customers_view',
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
    keys: ['reports', 'manager_board'],
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
