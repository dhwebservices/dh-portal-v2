import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { mergeLifecycleRecord, TERMINATED_STATES } from '../utils/staffLifecycle'

const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 14,
}

const normalizeEmail = (email = '') => email.toLowerCase().trim()
const EXCLUDED_EMAIL_PREFIXES = ['hr@', 'clients@', 'log@', 'legal@', 'noreply@', 'admin@', 'test@']

function pickBest(rows = []) {
  return rows
    .slice()
    .sort((a, b) => {
      const aLower = a.user_email === normalizeEmail(a.user_email) ? 1 : 0
      const bLower = b.user_email === normalizeEmail(b.user_email) ? 1 : 0
      if (aLower !== bLower) return bLower - aLower

      const aNamed = a.full_name && !a.full_name.includes('(') ? 1 : 0
      const bNamed = b.full_name && !b.full_name.includes('(') ? 1 : 0
      if (aNamed !== bNamed) return bNamed - aNamed

      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
    })[0] || null
}

function dedupeProfiles(rows = []) {
  const grouped = new Map()
  rows.forEach((row) => {
    const key = normalizeEmail(row.user_email || '')
    if (!key) return
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push({ ...row, user_email: key })
  })
  return [...grouped.values()].map((group) => pickBest(group))
}

function deriveManagerKey(profile, byEmail, byName) {
  const emailKey = normalizeEmail(profile.manager_email || '')
  if (emailKey && byEmail.has(emailKey)) return emailKey

  const nameKey = String(profile.manager_name || '').trim().toLowerCase()
  if (nameKey && byName.has(nameKey)) return byName.get(nameKey)

  return null
}

function isRealStaffProfile(profile = {}) {
  const email = normalizeEmail(profile.user_email || '')
  if (!email) return false
  if (EXCLUDED_EMAIL_PREFIXES.some((prefix) => email.startsWith(prefix))) return false
  return true
}

function PersonCard({ person, reportsCount, onOpen }) {
  const initials = (person.full_name || person.user_email || '?')
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        ...cardStyle,
        padding: 14,
        minWidth: 220,
        maxWidth: 280,
        boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease',
        width: '100%',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.borderColor = 'var(--accent-border)'
        e.currentTarget.style.boxShadow = '0 10px 18px rgba(0,0,0,0.08)'
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.04)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {person.photo_url ? (
          <img
            src={person.photo_url}
            alt={person.full_name || person.user_email}
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1px solid var(--accent-border)',
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent-border)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
            {person.full_name || person.user_email}
          </div>
          <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 2 }}>
            {person.role || 'Staff'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {person.user_email}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {person.department ? (
          <span style={{ padding: '4px 8px', borderRadius: 999, background: 'var(--bg2)', fontSize: 11, color: 'var(--sub)' }}>
            {person.department}
          </span>
        ) : null}
        <span
          style={{
            padding: '4px 8px',
            borderRadius: 999,
            background: person.onboarding ? 'var(--amber-bg)' : 'var(--green-bg)',
            color: person.onboarding ? 'var(--amber)' : 'var(--green)',
            fontSize: 11,
          }}
        >
          {person.onboarding ? 'Onboarding' : 'Active'}
        </span>
        <span style={{ padding: '4px 8px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 11 }}>
          {reportsCount} {reportsCount === 1 ? 'report' : 'reports'}
        </span>
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
        Open staff profile {'->'}
      </div>
    </button>
  )
}

function TreeBranch({ nodeKey, peopleMap, childrenMap, visited = new Set(), onOpenProfile }) {
  if (!nodeKey || visited.has(nodeKey)) return null

  const person = peopleMap.get(nodeKey)
  if (!person) return null

  const nextVisited = new Set(visited)
  nextVisited.add(nodeKey)
  const children = childrenMap.get(nodeKey) || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <PersonCard person={person} reportsCount={children.length} onOpen={() => onOpenProfile(person.user_email)} />

      {children.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: '100%' }}>
          <div style={{ width: 2, height: 18, background: 'var(--border2)' }} />
          <div
            style={{
              display: 'flex',
              gap: 18,
              alignItems: 'flex-start',
              justifyContent: 'center',
              flexWrap: 'wrap',
              width: '100%',
            }}
          >
            {children.map((childKey) => (
              <div key={`${nodeKey}-${childKey}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
                <div style={{ width: 2, height: 10, background: 'var(--border2)' }} />
                <TreeBranch
                  nodeKey={childKey}
                  peopleMap={peopleMap}
                  childrenMap={childrenMap}
                  visited={nextVisited}
                  onOpenProfile={onOpenProfile}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function OrgChart() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [people, setPeople] = useState([])
  const [updatedAt, setUpdatedAt] = useState(null)

  useEffect(() => {
    let alive = true

    const load = async () => {
      setLoading(true)
      const [{ data: profiles }, { data: permissions }, { data: onboarding }, { data: lifecycleSettings }] = await Promise.all([
        supabase.from('hr_profiles').select('*'),
        supabase.from('user_permissions').select('user_email,onboarding'),
        supabase.from('onboarding_submissions').select('user_email,photo_url'),
        supabase.from('portal_settings').select('key,value').like('key', 'staff_lifecycle:%'),
      ])

      if (!alive) return

      const deduped = dedupeProfiles(profiles || [])
      const permissionMap = new Map(
        (permissions || []).map((row) => [normalizeEmail(row.user_email || ''), !!row.onboarding])
      )
      const photoMap = new Map(
        (onboarding || []).map((row) => [normalizeEmail(row.user_email || ''), row.photo_url || null])
      )
      const lifecycleMap = new Map(
        (lifecycleSettings || []).map((row) => {
          const email = normalizeEmail(String(row.key || '').replace('staff_lifecycle:', ''))
          const record = mergeLifecycleRecord(row.value?.value ?? row.value ?? {})
          return [email, record.state]
        })
      )

      const merged = deduped
        .map((profile) => ({
          ...profile,
          user_email: normalizeEmail(profile.user_email || ''),
          onboarding: permissionMap.get(normalizeEmail(profile.user_email || '')) || false,
          photo_url: photoMap.get(normalizeEmail(profile.user_email || '')) || null,
          lifecycle_state: lifecycleMap.get(normalizeEmail(profile.user_email || '')) || 'active',
        }))
        .filter(isRealStaffProfile)
        .filter((profile) => !TERMINATED_STATES.has(profile.lifecycle_state))

      setPeople(merged)
      setUpdatedAt(new Date().toISOString())
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel('org-chart-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_profiles' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_permissions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'onboarding_submissions' }, load)
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(channel)
    }
  }, [])

  const { peopleMap, childrenMap, roots, stats } = useMemo(() => {
    const byEmail = new Map()
    const byName = new Map()
    const kids = new Map()

    people.forEach((person) => {
      const email = normalizeEmail(person.user_email || '')
      if (!email) return
      byEmail.set(email, person)
      if (person.full_name) {
        byName.set(String(person.full_name).trim().toLowerCase(), email)
      }
      kids.set(email, [])
    })

    const rootKeys = []

    people.forEach((person) => {
      const email = normalizeEmail(person.user_email || '')
      const managerKey = deriveManagerKey(person, byEmail, byName)

      if (managerKey && managerKey !== email) {
        kids.set(managerKey, [...(kids.get(managerKey) || []), email])
      } else {
        rootKeys.push(email)
      }
    })

    const uniqueRoots = [...new Set(rootKeys)]
    const managerCount = [...kids.values()].filter((childRows) => childRows.length > 0).length
    const onboardingCount = people.filter((person) => person.onboarding).length

    return {
      peopleMap: byEmail,
      childrenMap: kids,
      roots: uniqueRoots,
      stats: {
        total: people.length,
        managers: managerCount,
        onboarding: onboardingCount,
        roots: uniqueRoots.length,
      },
    }
  }, [people])

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Organisation Chart</h1>
          <p className="page-sub">Live reporting lines from staff profiles and manager assignments.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 22 }}>
        {[
          ['People', stats.total, 'Team members in chart'],
          ['Managers', stats.managers, 'People with direct reports'],
          ['Roots', stats.roots, 'Top-level roles'],
          ['Onboarding', stats.onboarding, 'Not fully active yet'],
        ].map(([label, value, hint]) => (
          <div key={label} style={{ ...cardStyle, padding: 16 }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--text)', lineHeight: 1 }}>{value}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)', marginTop: 8 }}>
              {label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 6 }}>{hint}</div>
          </div>
        ))}
      </div>

      <div style={{ ...cardStyle, padding: 18, marginBottom: 20, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Live view</div>
          <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 4 }}>
            Updates automatically when staff profiles or manager assignments change.
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)' }}>
          {updatedAt ? `Last synced ${new Date(updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Waiting for data'}
        </div>
      </div>

      {loading ? (
        <div className="spin-wrap"><div className="spin" /></div>
      ) : people.length === 0 ? (
        <div className="empty"><p>No staff profiles found for the org chart yet.</p></div>
      ) : (
        <div
          style={{
            ...cardStyle,
            padding: 24,
            overflowX: 'auto',
          }}
        >
          <div style={{ minWidth: 760, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
            {roots.map((rootKey) => (
              <TreeBranch
                key={rootKey}
                nodeKey={rootKey}
                peopleMap={peopleMap}
                childrenMap={childrenMap}
                onOpenProfile={(email) => navigate(`/my-staff/${encodeURIComponent(email)}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
