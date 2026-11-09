import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { mainNav, businessNav } from '../nav'

// Phone only (under 768px): bottom tab bar with Today, Inbox, Clients, Phone, More.
// "More" opens a list of the rest of the menu above the bar.

const ICONS = {
  today: <path d="M4 5h16v15H4zM4 9h16M8 3v4M16 3v4" />,
  inbox: <path d="M4 5h16v14H4zM4 13h5l1 2h4l1-2h5" />,
  clients: <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 14c2 .6 3 2.4 3 5" />,
  phone: <path d="M6 3h4l1.5 5-2.5 1.5a11 11 0 0 0 5.5 5.5L16 12.5l5 1.5v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z" />,
  more: <path d="M4 7h16M4 12h16M4 17h16" />,
}

function Icon({ id }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[id]}
    </svg>
  )
}

const TAB_IDS = ['today', 'inbox', 'clients', 'phone']
const allNav = [...mainNav, ...businessNav]
const tabs = TAB_IDS.map((id) => allNav.find((item) => item.id === id))
const moreMain = mainNav.filter((item) => !TAB_IDS.includes(item.id))
const moreBusiness = businessNav.filter((item) => !TAB_IDS.includes(item.id))

export default function TabBar() {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const moreActive = moreMain.some((item) => location.pathname.startsWith(item.to))

  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  const moreLink = (item) => {
    const count = item.count ? item.count() : 0
    const content = <><span>{item.label}</span>{count > 0 ? <span className="hq-count is-quiet" style={{ background: 'var(--hq-bg)', color: 'var(--hq-muted)' }}>{count}</span> : null}</>
    return item.old
      ? <Link key={item.id} to={item.to}>{content}</Link>
      : <NavLink key={item.id} to={item.to} className={({ isActive }) => (isActive ? 'is-active' : '')}>{content}</NavLink>
  }

  return (
    <>
      <div className="hq-more" id="hq-more" hidden={!moreOpen}>
        {moreMain.map(moreLink)}
        <div className="hq-more-group">Running the business</div>
        {moreBusiness.map(moreLink)}
        <Link to="/dashboard">Back to the old portal</Link>
      </div>
      <nav className="hq-tabbar" aria-label="HQ menu">
        {tabs.map((item) => {
          const count = item.count ? item.count() : 0
          return (
            <NavLink key={item.id} to={item.to} end={item.end} className={({ isActive }) => `hq-tab${isActive && !moreOpen ? ' is-active' : ''}`}>
              <Icon id={item.id} />
              {item.label}
              {count > 0 ? <span className="hq-count">{count}</span> : null}
            </NavLink>
          )
        })}
        <button
          type="button"
          className={`hq-tab${moreOpen || moreActive ? ' is-active' : ''}`}
          aria-expanded={moreOpen}
          aria-controls="hq-more"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <Icon id="more" />
          More
        </button>
      </nav>
    </>
  )
}
