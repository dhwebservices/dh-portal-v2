import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CreditCard, RefreshCw, UserCog, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { normalizeEmail } from '../utils/hrProfileSync'

const SYSTEM_EMAIL_PREFIXES = ['hr@', 'clients@', 'log@', 'legal@', 'noreply@', 'admin@', 'test@']
const STAFF_REQUIRED_FIELDS = [
  ['full_name', 'Full name'],
  ['role', 'Role'],
  ['department', 'Department'],
  ['manager_email', 'Manager'],
  ['phone', 'Phone'],
]

function isSystemMailbox(email = '') {
  const normalized = normalizeEmail(email)
  return SYSTEM_EMAIL_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function getWeekStart(d = new Date()) {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
  dt.setDate(diff)
  dt.setHours(0, 0, 0, 0)
  return dt.toISOString().split('T')[0]
}

function daysSince(dateString) {
  if (!dateString) return null
  const ms = Date.now() - new Date(dateString).getTime()
  return Math.floor(ms / 86400000)
}

function StatCard({ icon: Icon, label, value, hint, tone = 'var(--accent)' }) {
  return (
    <div className="stat-card" style={{ minHeight: 146, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `${tone}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={tone} />
      </div>
      <div>
        <div className="stat-val">{value}</div>
        <div className="stat-lbl">{label}</div>
        {hint ? <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 6, lineHeight: 1.5 }}>{hint}</div> : null}
      </div>
    </div>
  )
}

function SafeguardPanel({ title, subtitle, action, children }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)' }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 5, lineHeight: 1.5 }}>{subtitle}</div> : null}
        </div>
        {action || null}
      </div>
      {children}
    </div>
  )
}

function IssueList({ items, emptyText, onOpen }) {
  if (!items.length) {
    return <div style={{ padding: '26px 18px', color: 'var(--faint)', fontSize: 13, textAlign: 'center' }}>{emptyText}</div>
  }

  return (
    <div style={{ display: 'grid', gap: 0 }}>
      {items.map((item, index) => (
        <div
          key={item.id || `${item.kind}-${index}`}
          style={{
            padding: '16px 18px',
            borderTop: index === 0 ? 'none' : '1px solid var(--border)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{item.title}</div>
              {item.badge ? <span className={`badge badge-${item.badgeTone || 'grey'}`}>{item.badge}</span> : null}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.6 }}>{item.detail}</div>
            {item.meta?.length ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {item.meta.map((meta) => (
                  <span key={meta} className="badge badge-grey">{meta}</span>
                ))}
              </div>
            ) : null}
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => onOpen?.(item)}>
            Open
          </button>
        </div>
      ))}
    </div>
  )
}

export default function AdminSafeguards() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [issueFilter, setIssueFilter] = useState('all')
  const [data, setData] = useState({
    duplicates: [],
    missingManagers: [],
    incompleteProfiles: [],
    stuckOnboarding: [],
    missingPermissions: [],
    bookableWithoutSchedule: [],
    staleClients: [],
    missingPayments: [],
  })

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setRefreshing(true)
    try {
      const weekStart = getWeekStart()
      const [hrProfilesRes, permissionsRes, onboardingRes, schedulesRes, clientsRes, mandatesRes, paymentsRes] = await Promise.all([
        supabase.from('hr_profiles').select('*'),
        supabase.from('user_permissions').select('id,user_email,permissions,onboarding,bookable_staff,updated_at'),
        supabase.from('onboarding_submissions').select('*'),
        supabase.from('schedules').select('user_email,user_name,submitted,week_start').eq('week_start', weekStart).eq('submitted', true),
        supabase.from('clients').select('*'),
        supabase.from('gocardless_mandates').select('*'),
        supabase.from('client_payments').select('client_email,created_at,status'),
      ])

      const hrProfiles = (hrProfilesRes.data || []).filter((row) => !isSystemMailbox(row.user_email))
      const permissions = permissionsRes.data || []
      const onboarding = onboardingRes.data || []
      const schedules = schedulesRes.data || []
      const clients = clientsRes.data || []
      const mandates = mandatesRes.data || []
      const payments = paymentsRes.data || []

      const emailGroups = hrProfiles.reduce((acc, row) => {
        const key = normalizeEmail(row.user_email)
        acc[key] = acc[key] || []
        acc[key].push(row)
        return acc
      }, {})

      const duplicates = Object.entries(emailGroups)
        .filter(([, rows]) => rows.length > 1)
        .map(([email, rows]) => ({
          id: email,
          kind: 'staff',
          email,
          title: rows[0]?.full_name || email,
          detail: `${rows.length} HR profile rows exist for the same Microsoft login. The portal should only have one canonical staff profile.`,
          badge: 'Duplicate',
          badgeTone: 'red',
          meta: rows.map((row) => `${row.user_email}${row.full_name ? ` · ${row.full_name}` : ''}`),
        }))

      const permissionsByEmail = Object.fromEntries(permissions.map((row) => [normalizeEmail(row.user_email), row]))
      const schedulesByEmail = Object.fromEntries(schedules.map((row) => [normalizeEmail(row.user_email), row]))

      const missingManagers = hrProfiles
        .filter((row) => normalizeEmail(row.user_email) !== 'david@dhwebsiteservices.co.uk')
        .filter((row) => !row.manager_email && !row.manager_name)
        .map((row) => ({
          id: row.user_email,
          kind: 'staff',
          email: row.user_email,
          title: row.full_name || row.user_email,
          detail: 'This staff member has no manager assigned, so reporting lines and manager-only workflows can become inconsistent.',
          badge: 'Manager missing',
          badgeTone: 'amber',
          meta: [row.department || 'No department', row.role || 'No role'],
        }))

      const incompleteProfiles = hrProfiles
        .map((row) => {
          const missing = STAFF_REQUIRED_FIELDS.filter(([key]) => !row[key]).map(([, label]) => label)
          return missing.length ? { row, missing } : null
        })
        .filter(Boolean)
        .map(({ row, missing }) => ({
          id: row.user_email,
          kind: 'staff',
          email: row.user_email,
          title: row.full_name || row.user_email,
          detail: `Important staff profile fields are missing: ${missing.join(', ')}.`,
          badge: 'Incomplete',
          badgeTone: 'amber',
          meta: missing,
        }))

      const stuckOnboarding = onboarding
        .filter((row) => ['draft', 'submitted', 'in_progress'].includes(row.status))
        .map((row) => ({ row, age: daysSince(row.submitted_at || row.updated_at || row.created_at) }))
        .filter(({ age }) => age == null || age >= 7)
        .map(({ row, age }) => ({
          id: row.user_email,
          kind: 'onboarding',
          email: row.user_email,
          title: row.user_name || row.user_email,
          detail: `Onboarding is still marked ${row.status}. It has been sitting for ${age ?? 0} days and should be reviewed or removed.`,
          badge: row.status,
          badgeTone: row.status === 'submitted' ? 'amber' : 'grey',
          meta: [row.submitted_at ? new Date(row.submitted_at).toLocaleDateString('en-GB') : 'No submission date'],
        }))

      const staffEmails = new Set(hrProfiles.map((row) => normalizeEmail(row.user_email)))
      const missingPermissions = [...staffEmails]
        .filter((email) => !permissionsByEmail[email])
        .map((email) => {
          const row = hrProfiles.find((profile) => normalizeEmail(profile.user_email) === email)
          return {
            id: email,
            kind: 'staff',
            email,
            title: row?.full_name || email,
            detail: 'This staff member does not have a permissions row. They may fall back to unrestricted portal access.',
            badge: 'No permissions row',
            badgeTone: 'red',
            meta: [row?.role || 'No role'],
          }
        })

      const bookableWithoutSchedule = permissions
        .filter((row) => row.bookable_staff === true)
        .filter((row) => !schedulesByEmail[normalizeEmail(row.user_email)])
        .map((row) => ({
          id: row.user_email,
          kind: 'staff',
          email: row.user_email,
          title: hrProfiles.find((profile) => normalizeEmail(profile.user_email) === normalizeEmail(row.user_email))?.full_name || row.user_email,
          detail: 'This staff member is marked bookable for calls but has no submitted schedule for the current week.',
          badge: 'No submitted schedule',
          badgeTone: 'amber',
          meta: ['Bookable for calls'],
        }))

      const mandatesByClient = new Set(mandates.map((row) => normalizeEmail(row.client_email)))
      const paymentsByClient = payments.reduce((acc, row) => {
        const key = normalizeEmail(row.client_email)
        acc[key] = acc[key] || []
        acc[key].push(row)
        return acc
      }, {})

      const staleClients = clients
        .filter((client) => client.status === 'active')
        .map((client) => ({ client, age: daysSince(client.updated_at || client.created_at) }))
        .filter(({ age }) => age != null && age >= 120)
        .map(({ client, age }) => ({
          id: client.id,
          kind: 'client',
          clientId: client.id,
          title: client.name || client.email,
          detail: `This active client record has not been updated in ${age} days. It may need a quick account review.`,
          badge: 'Stale record',
          badgeTone: 'blue',
          meta: [client.plan || 'No plan', client.email || 'No email'],
        }))

      const missingPayments = clients
        .filter((client) => client.status === 'active')
        .filter((client) => !mandatesByClient.has(normalizeEmail(client.email || '')))
        .filter((client) => !(paymentsByClient[normalizeEmail(client.email || '')] || []).length)
        .map((client) => ({
          id: client.id,
          kind: 'client',
          clientId: client.id,
          title: client.name || client.email,
          detail: 'This active client has no linked direct debit mandate and no payment history recorded in the portal.',
          badge: 'Payment link missing',
          badgeTone: 'amber',
          meta: [client.plan || 'No plan', client.email || 'No email'],
        }))

      setData({
        duplicates,
        missingManagers,
        incompleteProfiles,
        stuckOnboarding,
        missingPermissions,
        bookableWithoutSchedule,
        staleClients,
        missingPayments,
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const sections = useMemo(() => ([
    {
      key: 'staff',
      title: 'Staff identity',
      subtitle: 'Duplicate staff rows, missing managers, incomplete HR profiles, and permission issues.',
      items: [...data.duplicates, ...data.missingManagers, ...data.incompleteProfiles, ...data.missingPermissions],
    },
    {
      key: 'onboarding',
      title: 'Onboarding queue',
      subtitle: 'Submissions that have been sitting too long or need a manual cleanup pass.',
      items: data.stuckOnboarding,
    },
    {
      key: 'operations',
      title: 'Bookable operations',
      subtitle: 'Staff marked bookable for calls but missing live schedule coverage this week.',
      items: data.bookableWithoutSchedule,
    },
    {
      key: 'clients',
      title: 'Client records',
      subtitle: 'Active client accounts that look stale or are missing payment linkage.',
      items: [...data.staleClients, ...data.missingPayments],
    },
  ]), [data])

  const filteredSections = issueFilter === 'all' ? sections : sections.filter((section) => section.key === issueFilter)
  const totalIssues = sections.reduce((sum, section) => sum + section.items.length, 0)

  function openItem(item) {
    if (item.kind === 'staff') {
      navigate(`/my-staff/${encodeURIComponent(normalizeEmail(item.email || ''))}`)
      return
    }
    if (item.kind === 'onboarding') {
      navigate('/hr/onboarding')
      return
    }
    if (item.kind === 'client' && item.clientId) {
      navigate(`/clients/${item.clientId}`)
    }
  }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Admin Safeguards</h1>
          <p className="page-sub">Live checks for staff data integrity, onboarding drift, scheduling gaps, and client payment hygiene.</p>
        </div>
        <button className="btn btn-outline" onClick={load} disabled={refreshing} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          {refreshing ? 'Refreshing...' : 'Refresh checks'}
        </button>
      </div>

      <div className="admin-safeguards-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard icon={AlertTriangle} label="Open checks" value={totalIssues} hint="Live records needing review across the portal." tone="var(--red)" />
        <StatCard icon={Users} label="Staff issues" value={sections[0].items.length} hint="Identity, manager, HR profile, or permissions issues." tone="var(--accent)" />
        <StatCard icon={UserCog} label="Onboarding issues" value={sections[1].items.length} hint="Draft or submitted records lingering too long." tone="var(--amber)" />
        <StatCard icon={CreditCard} label="Client/payment issues" value={sections[3].items.length} hint="Active client records missing payment linkage or recent upkeep." tone="var(--blue)" />
      </div>

      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)' }}>Focus area</div>
            <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 6 }}>Filter the safeguards list by team area so it is easier to work through issues in batches.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              ['all', 'All issues'],
              ['staff', 'Staff'],
              ['onboarding', 'Onboarding'],
              ['operations', 'Operations'],
              ['clients', 'Clients'],
            ].map(([key, label]) => (
              <button key={key} className={`pill ${issueFilter === key ? 'on' : ''}`} onClick={() => setIssueFilter(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        {filteredSections.map((section) => (
          <SafeguardPanel
            key={section.key}
            title={section.title}
            subtitle={section.subtitle}
            action={<span className={`badge badge-${section.items.length ? 'amber' : 'green'}`}>{section.items.length ? `${section.items.length} to review` : 'Clear'}</span>}
          >
            <IssueList
              items={loading ? [] : section.items}
              emptyText={loading ? 'Loading safeguards...' : 'No issues found in this section right now.'}
              onOpen={openItem}
            />
          </SafeguardPanel>
        ))}
      </div>
    </div>
  )
}
