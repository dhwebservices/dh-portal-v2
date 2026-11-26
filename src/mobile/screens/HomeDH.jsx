/**
 * Home: the statistics page (November 2026). David uses the app for the apps
 * and the central business numbers, so Home answers "what needs me?", then
 * shows real numbers: enquiries, live leads, Fish Tank players and website
 * visitors, with 7-day charts.
 *
 * Every figure comes from somewhere real; anything that can't load shows a
 * dash and says why. Never a made-up number.
 *
 *  - Enquiries and visitors: the website's /api/staff-stats (Pages Function,
 *    checks this user's Entra token). Visitors are counted first-party by the
 *    site's /api/hit: no cookies, nothing per person.
 *  - Leads: the `outreach` table, live stages only. The ~990 cold-contacted
 *    rows are the old email campaign, not open leads.
 *  - Fish Tank: the operator API, through utils/fishTank (proxy, then the
 *    stored key, exactly as the Fish Tank screen does).
 */
import { useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { supabase } from '../../utils/supabase'
import { getPortalIdToken } from '../../utils/portalApi'
import { fishTankCall } from '../utils/fishTank'
import Icon from '../components/Icon'
import { Section, Row, Chip, Tile, MiniBars, DHStyles } from '../components/DH'

const SITE = 'https://www.dhwebsiteservices.co.uk'
const DAY = 86_400_000

// Stages that mean a real conversation is open. Everything else is either
// not started (new), the cold campaign (contacted), or closed.
const STAGES = [
  ['interested', 'Interested'],
  ['replied', 'Replied'],
  ['meeting', 'Meeting'],
  ['call', 'Call'],
  ['proposal', 'Proposal'],
  ['follow_up', 'Follow-up'],
]
const LIVE = new Set(STAGES.map(([k]) => k))

function followUpDate(notes) {
  const m = String(notes || '').match(/"follow_up_date"\s*:\s*"(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'
}

const isoDay = (t) => new Date(t).toISOString().slice(0, 10)
const lastWeek = () => Array.from({ length: 7 }, (_, i) => isoDay(Date.now() - (6 - i) * DAY))
const fmtSince = (iso) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
const ago = (iso) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY)
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`
}

export default function HomeDH({ navigate, user, isAdmin }) {
  const { instance, accounts } = useMsal()
  const [leads, setLeads] = useState(null)
  const [due, setDue] = useState([])
  const [pendingLeave, setPendingLeave] = useState(0)
  const [fish, setFish] = useState(null)
  const [fishDays, setFishDays] = useState(null)
  const [fishErr, setFishErr] = useState('')
  const [site, setSite] = useState(null)
  const [siteErr, setSiteErr] = useState('')
  const firstName = (user?.name || user?.email || '').split(/[ @.]/)[0]
  const initials = (user?.name || 'DH').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()

  useEffect(() => {
    const today = isoDay(Date.now())
    const twoWeeksAgo = isoDay(Date.now() - 14 * DAY)

    supabase.from('outreach').select('id, business_name, contact_name, status, notes').then(({ data }) => {
      const rows = (data || []).map(r => ({ ...r, stage: String(r.status || '').toLowerCase().replace(/\s+/g, '_') }))
      const live = rows.filter(r => LIVE.has(r.stage))
      const byStage = STAGES.map(([k, label]) => [label, live.filter(r => r.stage === k).length]).filter(([, n]) => n)
      setLeads({ live: live.length, byStage, fresh: rows.filter(r => r.stage === 'new').length })
      // Only recent follow-ups: a date months gone is a dead row, not a job.
      setDue(live
        .map(r => ({ ...r, due: followUpDate(r.notes) }))
        .filter(r => r.due && r.due <= today && r.due >= twoWeeksAgo)
        .slice(0, 3))
    })

    if (isAdmin) {
      supabase.from('hr_leave').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        .then(({ count }) => setPendingLeave(count || 0))
    }

    const account = accounts?.[0]

    ;(async () => {
      try {
        const [overview, players] = await Promise.all([
          fishTankCall(instance, account, '/operator/overview'),
          fishTankCall(instance, account, '/operator/players').catch(() => null),
        ])
        setFish(overview?.totals || null)
        if (Array.isArray(players)) {
          setFishDays(lastWeek().map(date => ({
            date,
            value: players.filter(p => p.seen_at && isoDay(p.seen_at) === date).length,
            joined: players.filter(p => p.created_at && isoDay(p.created_at) === date).length,
          })))
        }
      } catch (e) {
        setFishErr(e?.message === 'no-key' ? 'Open Fish Tank once to connect' : "Couldn't reach the game")
      }
    })()

    ;(async () => {
      try {
        if (!account) throw new Error('Signed out')
        const token = await getPortalIdToken(instance, account)
        const res = await fetch(`${SITE}/api/staff-stats`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error(`Website said ${res.status}`)
        setSite(await res.json())
      } catch {
        setSiteErr("Couldn't reach the website")
      }
    })()
  }, [])

  const needs = [
    ...due.map(r => ({ key: `lead-${r.id}`, title: r.business_name || r.contact_name || 'Lead', sub: `Follow-up due ${r.due}`, tag: 'Lead', go: () => navigate('outreach') })),
    ...(site?.enquiries?.today ? [{ key: 'enq', title: `${site.enquiries.today} new enquir${site.enquiries.today > 1 ? 'ies' : 'y'} today`, sub: 'From the website. Reply within a working day', tag: 'Website', go: null }] : []),
    ...(pendingLeave ? [{ key: 'leave', title: `${pendingLeave} leave request${pendingLeave > 1 ? 's' : ''}`, sub: 'Waiting for you to approve', tag: 'Staff', go: () => navigate('leave') }] : []),
  ]

  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const enq = site?.enquiries
  const vis = site?.visitors

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
          <button key={n.key} className="dh-hero-item" onClick={n.go || undefined}>
            <span><strong>{n.title}</strong><small>{n.sub}</small></span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{n.tag}</span>
          </button>
        ))}
        {!needs.length && <p className="dh-note" style={{ color: 'rgba(255,255,255,.85)' }}>No enquiries today, no follow-ups due and nothing waiting for approval.</p>}
      </div>

      <section className="dh-section">
        <p className="dh-sec">This week</p>
        <div className="dh-tiles">
          <Tile label="Enquiries" value={enq ? enq.week : '–'}
            sub={enq ? `${enq.today} today · ${enq.total} in total` : (siteErr || 'Loading…')} />
          <Tile label="Live leads" value={leads ? leads.live : '–'}
            sub={leads ? (leads.byStage.map(([l, n]) => `${l} ${n}`).join(' · ') || 'None open') : 'Loading…'}
            onPress={() => navigate('outreach')} />
          <Tile label="Fish Tank players" value={fish ? (fish.active_7d ?? 0) : '–'}
            sub={fish ? `${fish.active_24h ?? 0} today · ${fish.total ?? 0} in total` : (fishErr || 'Loading…')}
            onPress={() => navigate('fishtank')} />
          <Tile label="Website visits" value={vis ? vis.week : '–'}
            sub={vis ? (vis.since ? `${vis.today} today · counting since ${fmtSince(vis.since)}` : 'Counting starts with the next visit') : (siteErr || 'Loading…')} />
        </div>
      </section>

      {vis && (
        <MiniBars title="Website visits" days={vis.days} valueKey="visits" total={`${vis.weekViews} views`}
          note="Arrivals from outside the site, counted without cookies. Views include every page they open." />
      )}
      {fishDays && (
        <MiniBars title="Fish Tank players" days={fishDays} total={`${fishDays.reduce((n, d) => n + d.joined, 0)} new`}
          note="Each bar is players whose last open was that day. New is sign-ups this week." />
      )}

      {enq && enq.latest?.length > 0 && (
        <Section label="Latest enquiries">
          {enq.latest.slice(0, 3).map((e, i) => (
            <Row key={i} icon="mail" title={e.business || e.name || 'Enquiry'} sub={`${e.business ? `${e.name} · ` : ''}${e.type} · ${ago(e.at)}`} />
          ))}
        </Section>
      )}

      {leads && (
        <Section label="Leads">
          {leads.byStage.map(([label, n]) => (
            <Row key={label} title={label} right={<Chip tone="blue">{n}</Chip>} onPress={() => navigate('outreach')} />
          ))}
          <Row title="Not contacted yet" right={<Chip>{leads.fresh}</Chip>} onPress={() => navigate('outreach')} />
        </Section>
      )}

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
