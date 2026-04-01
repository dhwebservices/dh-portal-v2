import React, { useState, useEffect, useRef, useCallback } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../utils/supabase'

// ─── Top-level sections with tile pages ───────────────────────────────────
const SECTIONS = [
  {
    id: 'home', label: 'Home', icon: 'grid',
    items: [
      { to: '/dashboard',  icon: 'grid',   label: 'Dashboard',  desc: 'Overview & stats',     key: 'dashboard' },
      { to: '/notifications', icon: 'bell', label: 'Notifications', desc: 'Inbox & alerts',    key: 'notifications' },
      { to: '/my-profile', icon: 'person', label: 'My Profile', desc: 'Your account',          key: 'my_profile' },
      { to: '/search',     icon: 'search', label: 'Search',     desc: 'Find anything',         key: 'search' },
    ]
  },
  {
    id: 'business', label: 'Business', icon: 'briefcase',
    items: [
      { to: '/outreach',    icon: 'phone',  label: 'Clients Contacted', desc: 'Outreach log',       key: 'outreach'    },
      { to: '/clients',     icon: 'people', label: 'Onboarded Clients', desc: 'Client list',        key: 'clients'     },
      { to: '/client-mgmt', icon: 'globe',  label: 'Client Portal',     desc: 'Portal management',  key: 'clientmgmt'  },
      { to: '/support',     icon: 'chat',   label: 'Support',           desc: 'Tickets & issues',   key: 'support'     },
      { to: '/competitor',  icon: 'search', label: 'Competitor Lookup', desc: 'Research & compare', key: 'competitor'  },
      { to: '/domains',     icon: 'link',   label: 'Domain Checker',    desc: 'Check domains',      key: 'domains'     },
      { to: '/proposals',   icon: 'doc',    label: 'Proposal Builder',  desc: 'Build proposals',    key: 'proposals'   },
      { to: '/send-email',  icon: 'send',   label: 'Send Email',        desc: 'Compose & send',     key: 'sendemail'   },
      { to: '/email-templates', icon: 'mail', label: 'Email Templates', desc: 'Template library',   key: 'emailtemplates' },
      { to: '/mailing-list',icon: 'mail',   label: 'Mailing List',      desc: 'Subscribers',        key: 'mailinglist' },
    ]
  },
  {
    id: 'tasks', label: 'Tasks', icon: 'check',
    items: [
      { to: '/tasks',        icon: 'check', label: 'All Tasks',    desc: 'Manage all tasks',  key: 'tasks'        },
      { to: '/my-tasks',     icon: 'check', label: 'My Tasks',     desc: 'Your task list',    key: 'mytasks'      },
      { to: '/schedule',     icon: 'cal',   label: 'Schedule',     desc: 'Calendar view',     key: 'schedule'     },
      { to: '/appointments', icon: 'cal',   label: 'Appointments', desc: 'Book & manage',     key: 'appointments' },
    ]
  },
  {
    id: 'hr', label: 'HR', icon: 'people',
    items: [
      { to: '/hr/timesheets', icon: 'clock',  label: 'Timesheets',    desc: 'Time tracking',     key: 'hr_timesheet'  },
      { to: '/hr/leave',      icon: 'cal',    label: 'Leave',         desc: 'Leave requests',    key: 'hr_leave'      },
      { to: '/hr/payslips',   icon: 'wallet', label: 'Payslips',      desc: 'Payroll docs',      key: 'hr_payslips'   },
      { to: '/hr/policies',   icon: 'doc',    label: 'Policies',      desc: 'Policy library',    key: 'hr_policies'   },
      { to: '/hr/onboarding', icon: 'star',   label: 'Onboarding',    desc: 'New starters',      key: 'hr_onboarding' },
      { to: '/my-staff',      icon: 'people', label: 'My Staff',      desc: 'Staff management',  key: 'staff'         },
      { to: '/org-chart',     icon: 'people', label: 'Org Chart',     desc: 'Live reporting lines', key: 'org_chart'   },
    ]
  },
  {
    id: 'admin', label: 'Admin', icon: 'shield',
    items: [
      { to: '/reports',   icon: 'chart',  label: 'Reports',       desc: 'Analytics & data',  key: 'reports'       },
      { to: '/banners',   icon: 'bell',   label: 'Banners',       desc: 'Site banners',      key: 'banners'       },
      { to: '/audit',     icon: 'shield', label: 'Audit Log',     desc: 'Activity history',  key: 'audit'         },
      { to: '/maintenance',icon: 'wrench',label: 'Maintenance',   desc: 'System tools',      key: 'maintenance'   },
      { to: '/settings',  icon: 'gear',   label: 'Settings',      desc: 'Preferences',       key: 'settings'      },
    ]
  },
  {
    id: 'account', label: 'Account', icon: 'person',
    items: [
      { to: '/my-profile', icon: 'person', label: 'My Profile', desc: 'Your account',      key: 'dashboard' },
      { to: '/settings',   icon: 'gear',   label: 'Settings',   desc: 'Preferences',       key: 'settings'  },
    ]
  },
]

const ALL_PAGES = SECTIONS.flatMap(s => s.items.map(i => ({ ...i, section: s.label, sectionId: s.id })))

// ─── Icons ─────────────────────────────────────────────────────────────────
const ICONS = {
  grid:     <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  person:   <><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></>,
  briefcase:<><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></>,
  people:   <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>,
  check:    <><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></>,
  shield:   <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
  phone:    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5 19.79 19.79 0 012 .84h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L6.91 8.09a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/>,
  globe:    <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></>,
  chat:     <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>,
  search:   <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  link:     <><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></>,
  doc:      <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
  send:     <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
  cal:      <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
  star:     <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,
  wallet:   <><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4z"/></>,
  clock:    <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  chart:    <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
  bell:     <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>,
  mail:     <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
  wrench:   <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>,
  gear:     <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
  logout:   <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
  sun:      <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>,
  moon:     <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>,
  menu:     <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>,
  x:        <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  chevL:    <polyline points="15 18 9 12 15 6"/>,
}

function Ico({ name, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {ICONS[name] || ICONS.doc}
    </svg>
  )
}

// Section accent colours — subtle, matches light/dark
const SECTION_COLORS = {
  home:     { bg: 'rgba(0,113,227,0.1)',   color: '#0071E3' },
  business: { bg: 'rgba(52,199,89,0.1)',   color: '#1D8348' },
  tasks:    { bg: 'rgba(255,159,10,0.1)',  color: '#B45309' },
  hr:       { bg: 'rgba(175,82,222,0.1)',  color: '#7C3AED' },
  admin:    { bg: 'rgba(255,69,58,0.1)',   color: '#C0392B' },
  account:  { bg: 'rgba(0,113,227,0.1)',   color: '#0071E3' },
}

// ─── CSS ───────────────────────────────────────────────────────────────────
const css = `
/* Dock */
.dh-dock {
  width: 56px; height: 100vh; position: fixed; left: 0; top: 0; z-index: 100;
  background: var(--bg); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; align-items: center;
  padding: 12px 0; gap: 2px;
}
.dh-dock-logo {
  width: 32px; height: 32px; margin-bottom: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.dh-dock-sep { width: 24px; height: 1px; background: var(--border); margin: 4px 0; flex-shrink: 0; }
.dh-dock-btn {
  width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  cursor: pointer; position: relative; gap: 3px;
  color: var(--faint); transition: background 0.15s, color 0.15s;
}
.dh-dock-btn:hover { background: var(--bg2); color: var(--text); }
.dh-dock-btn.dh-active { color: var(--accent); }
.dh-dock-btn.dh-active::before {
  content: ''; position: absolute; left: -1px; top: 50%; transform: translateY(-50%);
  width: 3px; height: 18px; background: var(--accent); border-radius: 0 2px 2px 0;
}
.dh-dock-label { font-family: var(--font-mono); font-size: 7px; letter-spacing: 0.04em; line-height: 1; }
.dh-tip {
  position: absolute; left: 50px; top: 50%; transform: translateY(-50%);
  background: var(--card); border: 1px solid var(--border2);
  color: var(--text); font-family: var(--font-mono);
  font-size: 11px; padding: 4px 10px; border-radius: 7px;
  white-space: nowrap; pointer-events: none;
  opacity: 0; transition: opacity 0.1s; z-index: 400;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
.dh-dock-btn:hover .dh-tip { opacity: 1; }
.dh-dock-bottom { margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.dh-avatar {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent-soft); border: 1px solid var(--accent-border);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; color: var(--accent); cursor: pointer;
  transition: border-color 0.15s;
}
.dh-avatar:hover { border-color: var(--accent); }

/* Settings-style panel */
.dh-panel {
  position: fixed; left: 56px; top: 0; height: 100vh; width: 300px;
  background: var(--bg2); border-right: 1px solid var(--border);
  transform: translateX(-102%);
  transition: transform 0.22s cubic-bezier(0.16,1,0.3,1);
  z-index: 99; display: flex; flex-direction: column;
  box-shadow: 4px 0 20px rgba(0,0,0,0.08);
}
.dh-panel.dh-open { transform: translateX(0); }
.dh-panel-head {
  padding: 20px 16px 14px; border-bottom: 1px solid var(--border);
  flex-shrink: 0; display: flex; align-items: center; gap: 10px;
}
.dh-panel-icon {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.dh-panel-title { font-family: var(--font-display); font-size: 18px; font-weight: 400; color: var(--text); }

/* Tile grid */
.dh-tiles { flex: 1; overflow-y: auto; padding: 12px; scrollbar-width: none; }
.dh-tiles::-webkit-scrollbar { display: none; }
.dh-tile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.dh-tile {
  display: flex; flex-direction: column; align-items: flex-start;
  padding: 12px 12px 10px; border-radius: 10px; cursor: pointer;
  background: var(--card); border: 1px solid var(--border);
  text-decoration: none; color: var(--text);
  transition: background 0.12s, border-color 0.12s, transform 0.1s;
  position: relative; overflow: hidden;
}
.dh-tile:hover { background: var(--bg3); border-color: var(--border2); transform: translateY(-1px); }
.dh-tile.dh-tile-active { border-color: var(--accent); background: var(--accent-soft); }
.dh-tile-icon {
  width: 32px; height: 32px; border-radius: 8px; margin-bottom: 8px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.dh-tile-name { font-size: 12px; font-weight: 500; color: var(--text); line-height: 1.3; margin-bottom: 2px; }
.dh-tile-desc { font-size: 10.5px; color: var(--faint); line-height: 1.3; font-family: var(--font-mono); }
.dh-tile-badge {
  position: absolute; top: 8px; right: 8px;
  background: var(--red); color: #fff; font-size: 9px; font-weight: 600;
  min-width: 16px; height: 16px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; padding: 0 4px;
}

.dh-panel-footer { padding: 10px 12px; border-top: 1px solid var(--border); flex-shrink: 0; }
.dh-footer-btn {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: 7px; background: none; border: none;
  cursor: pointer; color: var(--sub); font-size: 12.5px; font-family: inherit;
  transition: background 0.1s, color 0.1s; margin-bottom: 4px;
}
.dh-footer-btn:hover { background: var(--bg3); color: var(--text); }
.dh-user-row {
  display: flex; align-items: center; gap: 9px; padding: 8px 10px;
  border-radius: 9px; background: var(--bg); border: 1px solid var(--border);
}
.dh-user-init {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent-soft); border: 1px solid var(--accent-border);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; color: var(--accent);
}
.dh-user-name { font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; color: var(--text); }
.dh-user-email { font-family: var(--font-mono); font-size: 10px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; }
.dh-logout { background: none; border: none; color: var(--faint); padding: 4px; border-radius: 5px; display: flex; cursor: pointer; transition: color 0.15s; flex-shrink: 0; }
.dh-logout:hover { color: var(--red); }
.dh-scrim { position: fixed; inset: 0; z-index: 98; }

/* Search overlay */
.dh-search-bg {
  position: fixed; inset: 0; z-index: 500;
  background: rgba(0,0,0,0.35); backdrop-filter: blur(4px);
  display: none; align-items: flex-start; justify-content: center; padding-top: 80px;
}
.dh-search-bg.dh-open { display: flex; animation: dhFade 0.15s ease; }
@keyframes dhFade { from{opacity:0} to{opacity:1} }
.dh-search-box {
  width: 580px; max-width: calc(100vw - 32px);
  background: var(--card); border: 1px solid var(--border2);
  border-radius: 14px; overflow: hidden;
  box-shadow: 0 24px 60px rgba(0,0,0,0.18);
  animation: dhUp 0.18s cubic-bezier(0.16,1,0.3,1);
}
@keyframes dhUp { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
.dh-search-row {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-bottom: 1px solid var(--border);
}
.dh-search-inp {
  flex: 1; background: none; border: none; outline: none;
  font-family: var(--font-body); font-size: 15px; color: var(--text);
  caret-color: var(--accent);
}
.dh-search-inp::placeholder { color: var(--faint); }
.dh-search-esc {
  font-family: var(--font-mono); font-size: 10px; color: var(--faint);
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 5px; padding: 2px 7px; cursor: pointer; flex-shrink: 0;
}
.dh-results { max-height: 420px; overflow-y: auto; padding: 8px; }
.dh-grp-label {
  font-family: var(--font-mono); font-size: 9px; color: var(--faint);
  letter-spacing: 0.1em; text-transform: uppercase; padding: 8px 10px 4px;
}
.dh-result {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: 8px; cursor: pointer;
  transition: background 0.1s;
}
.dh-result:hover, .dh-result.dh-focused { background: var(--accent-soft); }
.dh-result.dh-focused .dh-result-label,
.dh-result.dh-focused .dh-result-icon { color: var(--accent); }
.dh-result-icon { color: var(--faint); flex-shrink: 0; }
.dh-result-label { font-size: 13.5px; color: var(--text); flex: 1; }
.dh-result-sub { font-size: 11px; color: var(--faint); font-family: var(--font-mono); }
.dh-result-badge {
  font-family: var(--font-mono); font-size: 9px; color: var(--faint);
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 4px; padding: 2px 7px; flex-shrink: 0;
}
.dh-empty { padding: 40px; text-align: center; color: var(--faint); font-size: 13px; }
.dh-search-foot {
  display: flex; align-items: center; gap: 14px;
  padding: 9px 16px; border-top: 1px solid var(--border); background: var(--bg2);
}
.dh-hint { font-family: var(--font-mono); font-size: 9px; color: var(--faint); display: flex; align-items: center; gap: 5px; }
.dh-k { background: var(--card); border: 1px solid var(--border2); border-radius: 4px; padding: 1px 5px; font-size: 9px; }
.dh-loading { display: flex; align-items: center; justify-content: center; padding: 24px; color: var(--faint); font-size: 12px; gap: 8px; }

/* Mobile */
.mob-btn { position: fixed; top: 12px; left: 12px; z-index: 300; width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text); }
.dh-mobile-drawer {
  position: fixed; top: 0; left: 0; bottom: 0; width: min(340px, 88vw);
  background: var(--bg); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; z-index: 201; overflow: hidden;
  box-shadow: 12px 0 32px rgba(0,0,0,0.16);
}
.dh-mobile-head {
  padding: 14px 14px 12px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.dh-mobile-brand {
  font-family: var(--font-display); font-size: 22px; font-weight: 400; color: var(--text);
}
.dh-mobile-close {
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--card); display: flex; align-items: center; justify-content: center;
  color: var(--sub); cursor: pointer; flex-shrink: 0;
}
.dh-mobile-body {
  flex: 1; overflow-y: auto; padding: 12px;
}
.dh-mobile-sections {
  display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; margin-bottom: 12px;
  scrollbar-width: none;
}
.dh-mobile-sections::-webkit-scrollbar { display: none; }
.dh-mobile-section-btn {
  border: 1px solid var(--border); background: var(--card); color: var(--sub);
  border-radius: 999px; padding: 8px 12px; display: inline-flex; align-items: center; gap: 7px;
  font-size: 12px; white-space: nowrap; cursor: pointer; flex-shrink: 0;
}
.dh-mobile-section-btn.active {
  color: var(--accent); background: var(--accent-soft); border-color: var(--accent-border);
}
.dh-mobile-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
.dh-mobile-tile {
  display: flex; flex-direction: column; align-items: flex-start;
  padding: 12px; border-radius: 10px; text-decoration: none; color: var(--text);
  background: var(--card); border: 1px solid var(--border); min-height: 94px; position: relative;
}
.dh-mobile-tile.active {
  border-color: var(--accent); background: var(--accent-soft);
}
.dh-mobile-tile-icon {
  width: 30px; height: 30px; border-radius: 8px; margin-bottom: 8px;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg2);
}
.dh-mobile-tile-name {
  font-size: 12.5px; font-weight: 600; color: var(--text); line-height: 1.3; margin-bottom: 2px;
}
.dh-mobile-tile-desc {
  font-size: 10.5px; line-height: 1.35; color: var(--faint); font-family: var(--font-mono);
}
.dh-mobile-footer {
  padding: 10px 12px; border-top: 1px solid var(--border); background: var(--bg);
}
@media (min-width: 769px) { .mob-btn { display: none !important; } }
@media (max-width: 768px) { .dh-dock { display: none !important; } .dh-panel { left: 0 !important; width: 85vw !important; } }
`

export default function Sidebar() {
  const { user, can, isOnboarding } = useAuth()
  const { instance } = useMsal()
  const location = useLocation()
  const navigate = useNavigate()
  const [dark, setDark] = useState(() => localStorage.getItem('dh-theme') === 'dark')
  const [activeSection, setActiveSection] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [pageResults, setPageResults] = useState([])
  const [clientResults, setClientResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [tickets, setTickets] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const searchRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    document.documentElement.style.setProperty('--sw', '56px')
  }, [])

  useEffect(() => {
    if (!user?.email) return
    supabase.from('support_tickets').select('*', { count: 'exact', head: true })
      .eq('status', 'open').then(({ count }) => setTickets(count || 0)).catch(() => {})
  }, [user?.email])

  useEffect(() => { setPanelOpen(false); setMobileOpen(false) }, [location.pathname])

  useEffect(() => {
    const match = SECTIONS.find(s =>
      s.items.some(i => i.to === location.pathname || (i.to !== '/' && location.pathname.startsWith(i.to)))
    )
    if (match) setActiveSection(match.id)
  }, [location.pathname])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch() }
      if (e.key === 'Escape') {
        if (searchOpen) closeSearch()
        else if (panelOpen) setPanelOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchOpen, panelOpen])

  const isAllowed = useCallback((key) => {
    if (isOnboarding) return key === 'hr_onboarding'
    return can ? can(key) : true
  }, [can, isOnboarding])

  const fuzzy = (str, q) => {
    const s = str.toLowerCase(), qL = q.toLowerCase()
    let qi = 0
    for (let i = 0; i < s.length && qi < qL.length; i++) { if (s[i] === qL[qi]) qi++ }
    return qi === qL.length
  }

  // Search: pages instantly, clients via Supabase debounced
  useEffect(() => {
    if (!query.trim()) {
      setPageResults([]); setClientResults([]); setFocusedIdx(-1); return
    }
    const q = query.trim()
    // Pages — instant
    setPageResults(ALL_PAGES.filter(p => isAllowed(p.key) && (fuzzy(p.label, q) || fuzzy(p.section, q) || fuzzy(p.desc || '', q))))
    setFocusedIdx(-1)
    // Clients — debounced Supabase
    clearTimeout(debounceRef.current)
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await supabase.from('clients').select('id, name, email, status').ilike('name', `%${q}%`).limit(5)
        setClientResults(data || [])
      } catch { setClientResults([]) }
      setSearching(false)
    }, 300)
  }, [query, isAllowed])

  const openSearch = () => {
    setSearchOpen(true); setQuery(''); setPageResults([]); setClientResults([]); setFocusedIdx(-1)
    setTimeout(() => searchRef.current?.focus(), 50)
  }
  const closeSearch = () => { setSearchOpen(false); setQuery('') }

  const allResults = [
    ...pageResults.map(r => ({ ...r, type: 'page' })),
    ...clientResults.map(r => ({ id: r.id, label: r.name, desc: r.email, to: `/clients/${r.id}`, icon: 'person', section: 'Clients', type: 'client' }))
  ]

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, allResults.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { if (focusedIdx >= 0 && allResults[focusedIdx]) { navigate(allResults[focusedIdx].to); closeSearch() } }
    else if (e.key === 'Escape') closeSearch()
  }

  const togglePanel = (id) => {
    if (panelOpen && activeSection === id) { setPanelOpen(false) }
    else { setActiveSection(id); setPanelOpen(true) }
  }

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('dh-theme', next)
    setDark(!dark)
  }

  const visibleSections = SECTIONS.filter(s => s.items.some(i => isAllowed(i.key)))
  const activeSec = SECTIONS.find(s => s.id === activeSection)
  const accentColor = SECTION_COLORS[activeSection] || SECTION_COLORS.home

  // Group results by type
  const groupedPages = pageResults.length > 0 ? { 'Pages': pageResults } : {}
  const groupedClients = clientResults.length > 0 ? { 'Clients': clientResults.map(r => ({ label: r.name, desc: r.email, to: `/clients/${r.id}`, icon: 'person', section: 'Clients', type: 'client' })) } : {}
  let ri = 0

  const footerContent = (
    <div className="dh-panel-footer">
      <button className="dh-footer-btn" onClick={toggleTheme}>
        <Ico name={dark ? 'sun' : 'moon'} size={13} />
        <span>{dark ? 'Light mode' : 'Dark mode'}</span>
      </button>
      <div className="dh-user-row">
        <div className="dh-user-init">{user?.initials || '?'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dh-user-name">{user?.name || '...'}</div>
          <div className="dh-user-email">{user?.email}</div>
        </div>
        <button className="dh-logout" onClick={() => instance.logoutRedirect()} title="Sign out">
          <Ico name="logout" size={13} />
        </button>
      </div>
    </div>
  )

  return (
    <>
      <style>{css}</style>

      {/* Desktop dock */}
      <nav className="dh-dock hide-mob">
        <div className="dh-dock-logo" onClick={() => navigate('/')}>
          <img src="/dh-logo.png" alt="DH" style={{ height: 22, opacity: 0.85 }} />
        </div>
        <div className="dh-dock-sep" />

        {visibleSections.map(sec => {
          const col = SECTION_COLORS[sec.id] || SECTION_COLORS.home
          return (
            <div key={sec.id} className={`dh-dock-btn${activeSection === sec.id ? ' dh-active' : ''}`} onClick={() => togglePanel(sec.id)}>
              <Ico name={sec.icon} size={16} />
              <span className="dh-dock-label">{sec.label}</span>
              <span className="dh-tip">{sec.label}</span>
            </div>
          )
        })}

        <div className="dh-dock-bottom">
          <div className="dh-dock-sep" />
          <div className="dh-dock-btn" onClick={openSearch}>
            <Ico name="search" size={16} />
            <span className="dh-dock-label">Search</span>
            <span className="dh-tip">Search ⌘K</span>
          </div>
          <div className="dh-avatar" onClick={() => navigate('/my-profile')}>
            {user?.initials || '?'}
          </div>
        </div>
      </nav>

      {/* Scrim */}
      {panelOpen && <div className="dh-scrim" onClick={() => setPanelOpen(false)} />}

      {/* Settings-style tile panel */}
      <div className={`dh-panel hide-mob${panelOpen ? ' dh-open' : ''}`}>
        <div className="dh-panel-head">
          <div className="dh-panel-icon" style={{ background: accentColor.bg }}>
            <Ico name={activeSec?.icon || 'grid'} size={17} />
          </div>
          <div className="dh-panel-title">{activeSec?.label}</div>
        </div>

        <div className="dh-tiles">
          <div className="dh-tile-grid">
            {activeSec?.items.filter(i => isAllowed(i.key)).map(item => {
              const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))
              const col = accentColor
              return (
                <NavLink key={item.to} to={item.to} className={`dh-tile${isActive ? ' dh-tile-active' : ''}`}>
                  <div className="dh-tile-icon" style={{ background: isActive ? col.bg : 'var(--bg2)' }}>
                    <Ico name={item.icon} size={16} />
                  </div>
                  <div className="dh-tile-name">{item.label}</div>
                  <div className="dh-tile-desc">{item.desc}</div>
                  {item.to === '/support' && tickets > 0 && (
                    <span className="dh-tile-badge">{tickets}</span>
                  )}
                </NavLink>
              )
            })}
          </div>
        </div>

        {footerContent}
      </div>

      {/* Mobile hamburger */}
      <button className="mob-btn" onClick={() => setMobileOpen(o => !o)}>
        <Ico name={mobileOpen ? 'x' : 'menu'} size={16} />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)' }} />
          <div className="dh-mobile-drawer">
            <div className="dh-mobile-head">
              <div className="dh-mobile-brand">
                DH <span style={{ color: 'var(--accent)' }}>Portal</span>
              </div>
              <button className="dh-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <Ico name="x" size={15} />
              </button>
            </div>
            <div className="dh-mobile-body">
              <div className="dh-mobile-sections">
                {visibleSections.map(sec => (
                  <button
                    key={sec.id}
                    className={`dh-mobile-section-btn${activeSection === sec.id ? ' active' : ''}`}
                    onClick={() => setActiveSection(sec.id)}
                  >
                    <Ico name={sec.icon} size={13} />
                    <span>{sec.label}</span>
                  </button>
                ))}
              </div>

              <div className="dh-mobile-grid">
                {activeSec?.items.filter(i => isAllowed(i.key)).map(item => {
                  const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))
                  return (
                    <NavLink key={item.to} to={item.to} className={`dh-mobile-tile${isActive ? ' active' : ''}`}>
                      <div className="dh-mobile-tile-icon" style={{ background: isActive ? accentColor.bg : 'var(--bg2)' }}>
                        <Ico name={item.icon} size={15} />
                      </div>
                      <div className="dh-mobile-tile-name">{item.label}</div>
                      <div className="dh-mobile-tile-desc">{item.desc}</div>
                      {item.to === '/support' && tickets > 0 && (
                        <span className="dh-tile-badge">{tickets}</span>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>

            <div className="dh-mobile-footer">
              <button className="dh-footer-btn" onClick={toggleTheme}>
                <Ico name={dark ? 'sun' : 'moon'} size={13} />
                <span>{dark ? 'Light mode' : 'Dark mode'}</span>
              </button>
              <div className="dh-user-row">
                <div className="dh-user-init">{user?.initials || '?'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dh-user-name">{user?.name}</div>
                  <div className="dh-user-email">{user?.email}</div>
                </div>
                <button className="dh-logout" onClick={() => instance.logoutRedirect()}><Ico name="logout" size={13} /></button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Cmd+K Search */}
      <div className={`dh-search-bg${searchOpen ? ' dh-open' : ''}`} onClick={closeSearch}>
        <div className="dh-search-box" onClick={e => e.stopPropagation()}>
          <div className="dh-search-row">
            <Ico name="search" size={16} />
            <input ref={searchRef} className="dh-search-inp" placeholder="Search pages, sections, clients..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKey} autoComplete="off" />
            <span className="dh-search-esc" onClick={closeSearch}>ESC</span>
          </div>

          <div className="dh-results">
            {!query.trim() && <div className="dh-empty">Search pages, sections or client names</div>}

            {query.trim() && pageResults.length === 0 && !searching && clientResults.length === 0 && (
              <div className="dh-empty">No results for &ldquo;{query}&rdquo;</div>
            )}

            {/* Pages */}
            {pageResults.length > 0 && (
              <div>
                <div className="dh-grp-label">Pages</div>
                {pageResults.map(item => {
                  const idx = ri++
                  return (
                    <div key={item.to + idx} className={`dh-result${focusedIdx === idx ? ' dh-focused' : ''}`}
                      onClick={() => { navigate(item.to); closeSearch() }} onMouseEnter={() => setFocusedIdx(idx)}>
                      <span className="dh-result-icon"><Ico name={item.icon} size={15} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="dh-result-label">{item.label}</div>
                        {item.desc && <div className="dh-result-sub">{item.desc}</div>}
                      </div>
                      <span className="dh-result-badge">{item.section}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Clients */}
            {(clientResults.length > 0 || searching) && (
              <div>
                <div className="dh-grp-label">Clients</div>
                {searching && <div className="dh-loading"><div style={{ width: 14, height: 14, border: '2px solid var(--border2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Searching...</div>}
                {clientResults.map(r => {
                  const idx = ri++
                  return (
                    <div key={r.id} className={`dh-result${focusedIdx === idx ? ' dh-focused' : ''}`}
                      onClick={() => { navigate(`/clients/${r.id}`); closeSearch() }} onMouseEnter={() => setFocusedIdx(idx)}>
                      <span className="dh-result-icon"><Ico name="person" size={15} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="dh-result-label">{r.name}</div>
                        {r.email && <div className="dh-result-sub">{r.email}</div>}
                      </div>
                      <span className="dh-result-badge">Client</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="dh-search-foot">
            <span className="dh-hint"><span className="dh-k">↑↓</span> navigate</span>
            <span className="dh-hint"><span className="dh-k">↵</span> open</span>
            <span className="dh-hint"><span className="dh-k">ESC</span> close</span>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}
