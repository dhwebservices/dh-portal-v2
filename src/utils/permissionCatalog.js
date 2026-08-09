// Single source of truth for the full 55-key permission catalog and role
// presets, shared between the web StaffProfile.jsx Permissions tab and the
// mobile EditPermissions screen. Previously each surface hand-copied its own
// version of this data, which is exactly the kind of drift that quietly
// broke several other features in this codebase - don't repeat that here.
// Keep in sync with NAV_TABS in navPermissions.js if a key's tab grouping
// changes.

export const ALL_PAGES = [
  {key:'dashboard',     label:'Dashboard',          group:'Home', category:'Core', desc:'Main overview and stats'},
  {key:'notifications', label:'Notifications',      group:'Home', category:'Core', desc:'Inbox and alerts'},
  {key:'my_profile',    label:'My Profile',         group:'Home', category:'Core', desc:'Personal account page'},
  {key:'search',        label:'Search',             group:'Home', category:'Core', desc:'Portal-wide search'},
  {key:'outreach',      label:'Outreach',           group:'Outreach', desc:'Client outreach and contact tracking'},
  {key:'sendemail',     label:'Send Email',         group:'Outreach'},
  {key:'sms_manager',   label:'SMS Manager',        group:'Outreach', category:'Comms', desc:'Access to the staff SMS centre and bulk text alerts'},
  {key:'proposals',     label:'Proposal Builder',   group:'Outreach'},
  {key:'mytasks',       label:'My Tasks',           group:'My Work'},
  {key:'schedule',      label:'Schedule',           group:'My Work'},
  {key:'rota',          label:'Rotas',              group:'Rotas', desc:'Manager-built team shift rota'},
  {key:'appointments',  label:'Appointments',       group:'My Work'},
  {key:'hr_leave',      label:'My Leave',           group:'My Work'},
  {key:'hr_payslips',   label:'My Payslips',        group:'My Work'},
  {key:'pdf_workspace', label:'PDF Workspace',      group:'My Work', category:'Documents', desc:'Personal PDF tools and internal PDF workspace'},
  {key:'pdf_shared_view', label:'PDF Shared View',  group:'My Work', category:'Documents', desc:'View shared PDF libraries and company templates'},
  {key:'pdf_shared_edit', label:'PDF Shared Edit',  group:'My Work', category:'Documents', desc:'Create, move, and edit PDFs in shared libraries'},
  {key:'pdf_shared_admin', label:'PDF Shared Admin',group:'My Work', category:'Documents', desc:'Manage PDF shared libraries, folder structures, and access'},
  {key:'my_team',       label:'View My Team',       group:'People', category:'Core', desc:'Read-only team view'},
  {key:'my_department', label:'My Department',      group:'People', category:'Core', desc:'Department workspace'},
  {key:'staff',         label:'People Directory',   group:'People', desc:'Full staff directory and staff profiles'},
  {key:'hr_onboarding', label:'HR Onboarding',      group:'People'},
  {key:'hr_profiles',   label:'HR Profiles',        group:'People', category:'Records', desc:'Core employee records and employment details'},
  {key:'hr_policies',   label:'HR Policies',        group:'People'},
  {key:'hr_documents',  label:'HR Documents',       group:'People', category:'Records', desc:'Document coverage and expiry checks'},
  {key:'hr_timesheet',  label:'HR Timesheets',      group:'People'},
  {key:'contract_templates', label:'Contract Templates', group:'People', category:'Records', desc:'HR contract template library'},
  {key:'contract_queue', label:'Contract Queue', group:'People', category:'Records', desc:'Issued contracts and signing progress'},
  {key:'org_chart',     label:'Org Chart',          group:'People', category:'Structure', desc:'Live reporting lines'},
  {key:'recruiting_jobs', label:'Recruiting Jobs', group:'Recruiting', category:'Pipeline', desc:'Manage published roles and drafts'},
  {key:'recruiting_applications', label:'Recruiting Applications', group:'Recruiting', category:'Pipeline', desc:'Full applicant inbox and review surface'},
  {key:'recruiting_board', label:'Recruiting Board', group:'Recruiting', category:'Pipeline', desc:'Kanban hiring pipeline'},
  {key:'recruiting_settings', label:'Recruiting Settings', group:'Recruiting', category:'Control', desc:'Question bank and default hiring copy'},
  {key:'clients',       label:'Clients',            group:'Websites', desc:'Onboarded client accounts'},
  {key:'clientmgmt',    label:'Client Portal',      group:'Websites'},
  {key:'competitor',    label:'Competitor Lookup',  group:'Websites'},
  {key:'domains',       label:'Domain Checker',     group:'Websites'},
  {key:'website_editor',label:'Web Manager',        group:'Websites'},
  {key:'shop_orders_view', label:'Shop Orders', group:'Websites', category:'Commerce', desc:'View and manage store orders'},
  {key:'shop_products_view', label:'Shop Products', group:'Websites', category:'Commerce', desc:'View the product catalogue and variants'},
  {key:'shop_customers_view', label:'Shop Customers', group:'Websites', category:'Commerce', desc:'View customer accounts and order history'},
  {key:'support',       label:'Support',            group:'Support'},
  {key:'reports',       label:'Reports',            group:'Reports'},
  {key:'manager_board', label:'Manager Board',      group:'Reports', category:'Control', desc:'Department and workload queue'},
  {key:'tasks',         label:'Manage Tasks',       group:'Reports', desc:'Assign and track tasks across the team'},
  {key:'admin',         label:'Admin',              group:'Admin'},
  {key:'audit',         label:'Audit Log',          group:'Admin'},
  {key:'departments',   label:'Departments',        group:'Admin', category:'Structure', desc:'Department setup and approvals'},
  {key:'service_admin', label:'Service Admin',      group:'Admin', category:'Control', desc:'Platform control, releases, status, and recovery'},
  {key:'safeguards',    label:'Admin Safeguards',   group:'Admin', category:'Control', desc:'Data integrity and risk checks'},
  {key:'mailinglist',   label:'Mailing List',       group:'Admin'},
  {key:'banners',       label:'Banners',            group:'Admin'},
  {key:'emailtemplates',label:'Email Templates',    group:'Admin'},
  {key:'maintenance',   label:'Maintenance',        group:'Admin'},
  {key:'settings',      label:'Settings',           group:'Admin'},
]

export const PERMISSION_GROUPS = ['Home', 'Outreach', 'My Work', 'Rotas', 'People', 'Recruiting', 'Websites', 'Support', 'Reports', 'Admin']

export const ROLE_DEFAULTS = {
  Director: Object.fromEntries(ALL_PAGES.map(p => [p.key, true])),
  DepartmentManager: Object.fromEntries(ALL_PAGES.filter(p => !['admin','audit','departments','banners','emailtemplates','website_editor','mailinglist','safeguards','maintenance','settings','recruiting_settings','pdf_shared_admin','service_admin'].includes(p.key)).map(p => [p.key, true])),
  Staff:    Object.fromEntries(ALL_PAGES.filter(p => !['admin','audit','reports','manager_board','staff','departments','my_department','banners','emailtemplates','website_editor','mailinglist','safeguards','hr_documents','contract_queue','recruiting_jobs','recruiting_applications','recruiting_board','recruiting_settings','shop_orders_view','shop_products_view','shop_customers_view','pdf_shared_view','pdf_shared_edit','pdf_shared_admin','service_admin'].includes(p.key)).map(p => [p.key, true])),
  ReadOnly: Object.fromEntries(ALL_PAGES.filter(p => ['dashboard','notifications','my_profile','search','my_team','mytasks','schedule','hr_leave','hr_payslips','hr_policies','pdf_workspace'].includes(p.key)).map(p => [p.key, true])),
}

export function countEnabledPermissions(perms = {}) {
  return ALL_PAGES.filter((page) => perms?.[page.key]).length
}

// Base access granted to a new starter the moment onboarding begins - not
// when it's approved. They need at least this to use the portal/app at all
// while completing their onboarding form. Matches HROnboarding.jsx exactly.
export const STARTER_PERMISSION_DEFAULTS = {
  dashboard: true,
  notifications: true,
  my_profile: true,
  search: true,
  my_team: true,
  mytasks: true,
  schedule: true,
  hr_leave: true,
  hr_payslips: true,
  hr_policies: true,
  hr_onboarding: true,
}
