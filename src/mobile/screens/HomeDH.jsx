/**
 * Home (November 2026 redesign). David: the portal is used for the apps and
 * central business things, not the rota. So Home answers "what needs me?",
 * then four numbers: enquiries, open leads, Fish Tank players and website
 * visitors. Rota, leave and payroll live under More.
 *
 * Numbers that aren't wired up yet show a dash and say so. Never a made-up
 * figure.
 */
import { useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { supabase } from '../../utils/supabase'
import { getPortalIdToken } from '../../utils/portalApi'
import { apiUrl } from '../../utils/apiBase'
import Icon from '../components/Icon'
import { Section, Row, Chip, Tile, DHStyles } from '../components/DH'

const CLOSED = new Set(['converted', 'not_interested'])

function followUpDate(notes) {
  const m = String(notes || '').match(/"follow_up_date"\s*:\s*"(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'
}

export default function HomeDH({ navigate, user, isAdmin }) {
  const { instance, accounts } = useMsal()
  const [leads, setLeads] = useState(null)
  const [due, setDue] = useState([])
  const [pendingLeave, setPendingLeave] = useState(0)
  const [fish, setFish] = useState(null)
  const firstName = (user?.name || user?.email || '').split(/[ @.]/)[0]
  const initials = (user?.name || 'DH').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)

    supabase.from('outreach').select('id, business_name, contact_name, status, notes').then(({ data }) => {
      const open = (data || []).filter(r => !CLOSED.has(String(r.status || '').toLowerCase()))
      setLeads(open.length)
      setDue(open
        .map(r => ({ ...r, due: followUpDate(r.notes) }))
        .filter(r => r.due && r.due <= today)
        .slice(0, 3))
    })

    if (isAdmin) {
      supabase.from('hr_leave').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        .then(({ count }) => setPendingLeave(count || 0))
    }

    ;(async () => {
      try {
        const account = accounts?.[0]
        if (!account) return
        const token = await getPortalIdToken(instance, account)
        const res = await fetch(apiUrl('/api/fishtank/operator/overview'), { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) setFish((await res.json())?.totals || null)
      } catch { /* leave it as a dash */ }
    })()
  }, [])

  const needs = [
    ...due.map(r => ({ key: `lead-${r.id}`, title: r.business_name || r.contact_name || 'Lead', sub: `Follow-up due ${r.due}`, tag: 'Lead', go: () => navigate('outreach') })),
    ...(pendingLeave ? [{ key: 'leave', title: `${pendingLeave} leave request${pendingLeave > 1 ? 's' : ''}`, sub: 'Waiting for you to approve', tag: 'Staff', go: () => navigate('leave') }] : []),
  ]

  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="dh-page">
      <DHStyles />
      <div className="dh-top">
        <button className="dh-me" onClick={() => navigate('profile')} aria-label="My profile">
          <span className="dh-me-av">{initials}</span>
          <span className="dh-g">
            <span className="dh-sub">{date}</span>
            <span className="dh-hello">{greeting()}, {firstName}</span>
          </span>
        </button>
        <button className="dh-bell" onClick={() => navigate('notifications')} aria-label="Notifications"><Icon name="bell" size={20} /></button>
      </div>

      <div className="dh-hero">
        <div>
          <p className="dh-sec">Needs you</p>
          <h2 className="dh-hero-title">{needs.length ? `${needs.length} thing${needs.length > 1 ? 's' : ''} today` : 'All clear today'}</h2>
        </div>
        {needs.map(n => (
          <button key={n.key} className="dh-hero-item" onClick={n.go}>
            <span><strong>{n.title}</strong><small>{n.sub}</small></span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{n.tag}</span>
          </button>
        ))}
        {!needs.length && <p className="dh-note" style={{ color: 'rgba(255,255,255,.85)' }}>No follow-ups due and nothing waiting for approval.</p>}
      </div>

      <div className="dh-tiles">
        <Tile label="New enquiries" value="–" sub="Website form · not linked yet" />
        <Tile label="Open leads" value={leads ?? '–'} sub="In the leads list" onPress={() => navigate('outreach')} />
        <Tile label="Fish Tank players" value={fish ? fish.total : '–'} sub={fish ? `${fish.active_24h ?? 0} played today` : 'Game server'} onPress={() => navigate('fishtank')} />
        <Tile label="Website visitors" value="–" sub="Not linked yet" />
      </div>

      <Section label="Apps">
        <Row avatar={{ text: 'FT', color: '#0E7490' }} title="Fish Tank" sub="iPhone and Android" right={<Chip tone="green">Live</Chip>} onPress={() => navigate('fishtank')} />
        <Row avatar={{ text: 'DP', color: '#0E1726' }} title="Phone" sub="01443 805303" onPress={() => navigate('phone')} />
        <Row icon="grid" title="All apps" onPress={() => navigate('apps')} />
      </Section>

      <style>{`
        .dh-me { display: flex; align-items: center; gap: 12px; border: 0; background: transparent; padding: 0; text-align: left; color: var(--mobile-text); font: inherit; }
        .dh-me-av { width: 44px; height: 44px; border-radius: 22px; background: var(--mobile-accent); color: #fff; display: flex; align-items: center; justify-content: center; font-family: Archivo, system-ui, sans-serif; font-weight: 700; }
        .dh-hello { font-family: Archivo, system-ui, sans-serif; font-weight: 700; font-size: 20px; }
        .dh-bell { width: 44px; height: 44px; border-radius: 14px; border: 1px solid var(--mobile-border); background: var(--mobile-card); color: var(--mobile-text); display: flex; align-items: center; justify-content: center; }
      `}</style>
    </div>
  )
}
