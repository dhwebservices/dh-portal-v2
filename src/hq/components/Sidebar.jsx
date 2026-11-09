import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { mainNav, businessNav } from '../nav'
import Avatar from './Avatar'
import { staff } from '../exampleData'
import { useHQStore } from '../sessionStore'
import useMe from '../useMe'

function NavItem({ item, state, me }) {
  const count = item.count ? item.count(state, me) : 0
  const className = ({ isActive }) => `hq-nav-item${isActive ? ' is-active' : ''}`
  const inner = (
    <>
      <span className="hq-nav-label">{item.label}</span>
      {count > 0 ? (
        <span className={`hq-count${item.countTone === 'quiet' ? ' is-quiet' : ''}`}>{count}</span>
      ) : null}
    </>
  )
  if (item.old) {
    return <Link to={item.to} className="hq-nav-item">{inner}</Link>
  }
  return <NavLink to={item.to} end={item.end} className={className}>{inner}</NavLink>
}

export default function Sidebar() {
  const { user } = useAuth()
  const name = user?.name || user?.email || ''
  const known = staff.find((s) => s.name.toLowerCase() === String(user?.name || '').trim().toLowerCase())
  const state = useHQStore()
  const me = useMe()

  return (
    <aside className="hq-side" aria-label="HQ menu">
      <div className="hq-brand"><span className="hq-brand-mark">DH</span>HQ</div>
      <nav style={{ display: 'contents' }}>
        {mainNav.map((item) => <NavItem key={item.id} item={item} state={state} me={me} />)}
        <div className="hq-nav-group">Running the business</div>
        {businessNav.map((item) => <NavItem key={item.id} item={item} state={state} me={me} />)}
      </nav>
      <div className="hq-side-foot">
        <Link to="/dashboard" className="hq-old-link">Back to the old portal</Link>
        {name ? (
          <div className="hq-me"><Avatar name={name} tone={known?.tone} /><span>{name}</span></div>
        ) : null}
      </div>
    </aside>
  )
}
