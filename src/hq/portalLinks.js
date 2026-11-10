// Links from HQ's Team and Settings pages to the existing portal pages.
//
// A link only shows if the person could already reach that page from the old
// portal. Two existing checks, both reused unchanged:
//   1. tab:  the old top menu shows that tab (visibleNavTabs in
//            src/utils/navPermissions.js, the same check the old TopBar uses).
//            null = reached from somewhere always shown (the user menu).
//   2. gate: the check the page's own route already makes in src/App.jsx
//            (PermissionGate permKey=…, or WebManagerGate for the website editor).
// Nothing here changes who can see or do what.

const routeGate = (permKey) => ({ can }) => can(permKey)

export const TEAM_GROUPS = [
  {
    title: 'People and rota',
    links: [
      { id: 'people', label: 'People', what: 'Everyone on the team, their profiles and contact details', to: '/people', tab: 'people', gate: routeGate('staff') },
      { id: 'rota', label: 'Rota', what: 'Who is working when, and shift changes', to: '/rotas', tab: 'rota', gate: routeGate('rota') },
    ],
  },
  {
    title: 'Time off and pay',
    links: [
      { id: 'leave', label: 'Leave', what: 'Book holiday and see who is off', to: '/hr/leave', tab: 'mywork', gate: routeGate('hr_leave') },
      { id: 'timesheets', label: 'Timesheets', what: 'Hours worked, ready to approve', to: '/hr/timesheets', tab: 'people', gate: routeGate('hr_timesheet') },
      { id: 'payslips', label: 'Payslips', what: 'Monthly payslips to view and download', to: '/hr/payslips', tab: 'mywork', gate: routeGate('hr_payslips') },
    ],
  },
  {
    title: 'Contracts and documents',
    links: [
      { id: 'contracts', label: 'Contracts', what: 'Contracts waiting to be sent or signed', to: '/contract-queue', tab: 'people', gate: routeGate('contract_queue') },
      { id: 'documents', label: 'Documents', what: 'HR documents and staff files', to: '/hr/documents', tab: 'people', gate: routeGate('hr_documents') },
    ],
  },
  {
    title: 'Recruiting',
    links: [
      { id: 'recruiting', label: 'Recruiting', what: 'Open jobs, applications and interviews', to: '/recruiting', tab: 'recruiting', gate: routeGate('recruiting_jobs') },
    ],
  },
]

export const SETTINGS_GROUPS = [
  {
    title: 'Your settings',
    links: [
      { id: 'notifications', label: 'Notifications', what: 'Choose which alerts reach you, and how', to: '/my-profile?tab=alerts', tab: null, gate: routeGate('my_profile') },
    ],
  },
  {
    title: 'Admin',
    links: [
      { id: 'permissions', label: 'People and permissions', what: 'Open a person, then their Permissions tab', to: '/people', tab: 'people', gate: routeGate('staff') },
      {
        id: 'website-editor',
        label: 'Website editor',
        what: 'Edit the DH website and client sites',
        to: '/web-manager',
        tab: 'websites',
        // Same as WebManagerGate in src/App.jsx.
        gate: ({ can, isAdmin }) => isAdmin || can('website_editor') || can('clientmgmt'),
      },
      { id: 'email-templates', label: 'Email templates', what: 'The emails the portal sends', to: '/email-templates', tab: 'admin', gate: routeGate('emailtemplates') },
      { id: 'maintenance', label: 'Maintenance', what: 'Put the portal into maintenance mode', to: '/maintenance', tab: 'admin', gate: routeGate('maintenance') },
    ],
  },
]
