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

function ResultCountCard({ label, value }) {
  return (
    <div className="stat-card" style={{ padding: 16 }}>
      <div className="stat-val" style={{ fontSize: 24 }}>{value}</div>
      <div className="stat-lbl">{label}</div>
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
        if (data?.length) out[section.key] = data
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
        <mark style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 4, padding: '0 2px' }}>
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
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Search</h1>
          <p className="page-sub">Find clients, staff, tasks, tickets, notifications, and invoices from one place.</p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <SearchIcon size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)', pointerEvents: 'none' }} />
          <input
            ref={inputRef}
            className="inp"
            style={{ paddingLeft: 44, paddingRight: 40, fontSize: 16, borderRadius: 999, height: 50 }}
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
              style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
            >
              ×
            </button>
          ) : null}
        </div>

        <div className="tabs" style={{ marginBottom: recentSearches.length ? 14 : 0 }}>
          <button className={`tab${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>All</button>
          {SECTIONS.map((section) => (
            <button key={section.key} className={`tab${filter === section.key ? ' on' : ''}`} onClick={() => setFilter(section.key)}>
              {section.label}
            </button>
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
        <div className="dashboard-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 16, marginBottom: 24 }}>
          <ResultCountCard label="Total Results" value={total} />
          <ResultCountCard label="Matched Sections" value={activeSections.length} />
          <ResultCountCard label="Active Filter" value={filter === 'all' ? 'All' : SECTIONS.find((section) => section.key === filter)?.label || 'All'} />
        </div>
      ) : null}

      {query.trim().length >= 2 && !loading && total === 0 ? (
        <div className="empty"><p>No results for "<strong>{query}</strong>"</p></div>
      ) : null}

      {!query.trim() && recentSearches.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <FileText size={22} style={{ color: 'var(--faint)', marginBottom: 10 }} />
          <div style={{ fontSize: 14, color: 'var(--sub)', marginBottom: 6 }}>Start typing to search the portal</div>
          <div style={{ fontSize: 12, color: 'var(--faint)' }}>Results will group by section and link you straight into the right page.</div>
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
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{section.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>{items.length} result{items.length !== 1 ? 's' : ''}</div>
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
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-soft)' }}
                    onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--card)' }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg2)', color: 'var(--sub)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4, lineHeight: 1.4 }}>
                        {highlight(getTitle(section, item), query)}
                      </div>
                      {getExcerpt(section, item) ? (
                        <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.6, marginBottom: 8 }}>
                          {highlight(String(getExcerpt(section, item)).slice(0, 160), query)}
                        </div>
                      ) : null}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {getMeta(section, item).map((metaItem) => (
                          <span key={metaItem} className="badge badge-grey">{metaItem}</span>
                        ))}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--faint)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>Open</span>
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
