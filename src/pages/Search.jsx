import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Bell,
  Briefcase,
  CheckSquare,
  FileText,
  HeadphonesIcon,
  Receipt,
  Search as SearchIcon,
  Users,
} from 'lucide-react'
import { supabase } from '../utils/supabase'
import { Button, StatusBadge } from '../components/ds'

const DS_CARD = { background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)' }

const RECENT_SEARCHES_KEY = 'dh-portal-recent-searches'

const SECTIONS = [
  { key: 'clients', label: 'Clients', table: 'clients', fields: ['name', 'email', 'phone', 'plan'], icon: Users, route: () => '/clients' },
  { key: 'outreach', label: 'Clients Contacted', table: 'outreach', fields: ['business_name', 'contact_name', 'email'], icon: Briefcase, route: () => '/outreach' },
  { key: 'tasks', label: 'Tasks', table: 'tasks', fields: ['title', 'description', 'assigned_to_name'], icon: CheckSquare, route: () => '/tasks' },
  { key: 'support', label: 'Support Tickets', table: 'support_tickets', fields: ['subject', 'message', 'client_name'], icon: HeadphonesIcon, route: () => '/support' },
  { key: 'notifications', label: 'Notifications', table: 'notifications', fields: ['title', 'message', 'type'], icon: Bell, route: () => '/notifications' },
  { key: 'staff', label: 'Staff', table: 'hr_profiles', fields: ['full_name', 'user_email', 'role', 'department'], icon: Users, route: (item) => `/my-staff/${encodeURIComponent(item.user_email || '')}` },
  { key: 'invoices', label: 'Invoices', table: 'client_invoices', fields: ['client_name', 'description', 'invoice_number'], icon: Receipt, route: () => '/client-mgmt' },
]

function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]')
  } catch {
    return []
  }
}

function saveRecentSearch(query) {
  if (!query) return
  const next = [query, ...getRecentSearches().filter((item) => item !== query)].slice(0, 6)
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
}

function dedupeStaffResults(items = []) {
  const bestByEmail = new Map()

  for (const item of items) {
    const email = String(item.user_email || '').toLowerCase()
    if (!email) continue
    const current = bestByEmail.get(email)
    const candidateName = String(item.full_name || '')
    const currentName = String(current?.full_name || '')
    const candidateScore =
      (candidateName && !candidateName.includes('(') ? 3 : 0) +
      (String(item.user_email || '') === email ? 2 : 0) +
      (candidateName ? 1 : 0)
    const currentScore =
      (currentName && !currentName.includes('(') ? 3 : 0) +
      (String(current?.user_email || '') === email ? 2 : 0) +
      (currentName ? 1 : 0)

    if (!current || candidateScore > currentScore) {
      bestByEmail.set(email, { ...item, user_email: email })
    }
  }

  return [...bestByEmail.values()]
}

function ResultCountCard({ label, value }) {
  return (
    <div style={{ ...DS_CARD, padding: 16 }}>
      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--color-text-primary)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

export default function Search() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState(params.get('q') || '')
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [recentSearches, setRecentSearches] = useState(() => getRecentSearches())
  const inputRef = useRef()
  const debounce = useRef()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    clearTimeout(debounce.current)
    if (!query.trim() || query.trim().length < 2) {
      setResults({})
      return
    }
    debounce.current = setTimeout(() => doSearch(query.trim(), filter), 240)
  }, [query, filter])

  const doSearch = async (rawQuery, selectedFilter = filter) => {
    const q = rawQuery.trim()
    if (!q || q.length < 2) return
    setLoading(true)

    const sectionsToSearch = selectedFilter === 'all'
      ? SECTIONS
      : SECTIONS.filter((section) => section.key === selectedFilter)

    const out = {}
    await Promise.all(sectionsToSearch.map(async (section) => {
      try {
        const filterExpr = section.fields.map((field) => `${field}.ilike.%${q}%`).join(',')
        const { data } = await supabase.from(section.table).select('*').or(filterExpr).limit(8)
        const cleaned = section.key === 'staff' ? dedupeStaffResults(data || []) : (data || [])
        if (cleaned.length) out[section.key] = cleaned
      } catch {
        out[section.key] = []
      }
    }))

    setResults(out)
    setLoading(false)
    saveRecentSearch(q)
    setRecentSearches(getRecentSearches())
  }

  const total = useMemo(
    () => Object.values(results).reduce((sum, items) => sum + (items?.length || 0), 0),
    [results]
  )

  const activeSections = useMemo(
    () => SECTIONS.filter((section) => (results[section.key] || []).length),
    [results]
  )

  const highlight = (text, q) => {
    if (!text || !q) return text || ''
    const str = String(text)
    const idx = str.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return str
    return (
      <>
        {str.slice(0, idx)}
        <mark style={{ background: 'var(--color-blue-50)', color: 'var(--color-primary)', borderRadius: 4, padding: '0 2px' }}>
          {str.slice(idx, idx + q.length)}
        </mark>
        {str.slice(idx + q.length)}
      </>
    )
  }

  const getTitle = (section, item) => {
    const firstField = section.fields[0]
    return item[firstField] || item.name || item.title || item.subject || '—'
  }

  const getMeta = (section, item) => {
    switch (section.key) {
      case 'clients':
        return [item.email, item.plan, item.status].filter(Boolean)
      case 'outreach':
        return [item.contact_name, item.email, item.status].filter(Boolean)
      case 'tasks':
        return [item.assigned_to_name, item.priority, item.status].filter(Boolean)
      case 'support':
        return [item.client_name, item.status, item.priority].filter(Boolean)
      case 'notifications':
        return [item.type, item.read ? 'read' : 'unread'].filter(Boolean)
      case 'staff':
        return [item.user_email, item.role, item.department].filter(Boolean)
      case 'invoices':
        return [item.invoice_number, item.client_name, item.status].filter(Boolean)
      default:
        return [item[section.fields[1]]].filter(Boolean)
    }
  }

  const getExcerpt = (section, item) => {
    switch (section.key) {
      case 'tasks':
        return item.description
      case 'support':
        return item.message
      case 'notifications':
        return item.message
      case 'invoices':
        return item.description
      default:
        return item[section.fields[1]] || item.notes || ''
    }
  }

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Search</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Find clients, staff, tasks, tickets, notifications, and invoices from one place.</p>
        </div>
      </div>

      <div style={{ ...DS_CARD, padding: 20, marginBottom: 24 }}>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <SearchIcon size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
          <input
            ref={inputRef}
            className="ds-form-input"
            style={{ paddingLeft: 44, paddingRight: 40, fontSize: 16, borderRadius: 999, height: 50, width: '100%' }}
            placeholder="Search staff, clients, tasks, tickets, notifications..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading ? (
            <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>
              <div className="spin" style={{ width: 16, height: 16 }} />
            </div>
          ) : query ? (
            <button
              onClick={() => setQuery('')}
              style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
            >
              ×
            </button>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: recentSearches.length ? 14 : 0, flexWrap: 'wrap' }}>
          <Button variant={filter === 'all' ? 'primary' : 'secondary'} style={{ height: 30, fontSize: 12, padding: '0 10px' }} onClick={() => setFilter('all')}>All</Button>
          {SECTIONS.map((section) => (
            <Button key={section.key} variant={filter === section.key ? 'primary' : 'secondary'} style={{ height: 30, fontSize: 12, padding: '0 10px' }} onClick={() => setFilter(section.key)}>
              {section.label}
            </Button>
          ))}
        </div>

        {recentSearches.length ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {recentSearches.map((item) => (
              <button key={item} className="pill" onClick={() => setQuery(item)}>
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {query.trim().length >= 2 && total > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 16, marginBottom: 24 }}>
          <ResultCountCard label="Total Results" value={total} />
          <ResultCountCard label="Matched Sections" value={activeSections.length} />
          <ResultCountCard label="Active Filter" value={filter === 'all' ? 'All' : SECTIONS.find((section) => section.key === filter)?.label || 'All'} />
        </div>
      ) : null}

      {query.trim().length >= 2 && !loading && total === 0 ? (
        <div style={{ padding: 'var(--space-3xl)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>No results for "<strong>{query}</strong>"</div>
      ) : null}

      {!query.trim() && recentSearches.length === 0 ? (
        <div style={{ ...DS_CARD, textAlign: 'center', padding: '40px 20px' }}>
          <FileText size={22} style={{ color: 'var(--color-text-tertiary)', marginBottom: 10 }} />
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Start typing to search the portal</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Results will group by section and link you straight into the right page.</div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {SECTIONS.map((section) => {
          const items = results[section.key]
          if (!items?.length) return null
          const Icon = section.icon

          return (
            <div key={section.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--color-blue-50)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{section.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{items.length} result{items.length !== 1 ? 's' : ''}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {items.map((item, index) => (
                  <button
                    key={`${section.key}-${index}`}
                    onClick={() => navigate(section.route(item))}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 14,
                      padding: '14px 16px',
                      borderRadius: 12,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-surface)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.background = 'var(--color-blue-50)' }}
                    onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'var(--color-bg-surface)' }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-gray-50)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4, lineHeight: 1.4 }}>
                        {highlight(getTitle(section, item), query)}
                      </div>
                      {getExcerpt(section, item) ? (
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
                          {highlight(String(getExcerpt(section, item)).slice(0, 160), query)}
                        </div>
                      ) : null}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {getMeta(section, item).map((metaItem) => (
                          <StatusBadge key={metaItem} variant="info">{metaItem}</StatusBadge>
                        ))}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>Open</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
