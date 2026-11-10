import { useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { visibleNavTabs } from '../../utils/navPermissions'
import Panel from './Panel'
import Row from './Row'

// Groups of links to existing portal pages (Team, Settings). Each link shows only
// if the old portal would let this person reach it; see portalLinks.js.
// Groups with nothing to show are left out.
export default function PortalLinkGroups({ groups, empty }) {
  const { can, isAdmin } = useAuth()
  const visibleTabs = useMemo(() => new Set(visibleNavTabs(can).map((t) => t.id)), [can])

  const shown = groups
    .map((g) => ({
      ...g,
      links: g.links.filter((l) => (l.tab === null || visibleTabs.has(l.tab)) && l.gate({ can, isAdmin })),
    }))
    .filter((g) => g.links.length)

  if (!shown.length) {
    return <section className="hq-panel"><p className="hq-panel-empty">{empty}</p></section>
  }

  return (
    <div className="hq-link-groups">
      {shown.map((g) => (
        <Panel key={g.title} title={g.title}>
          {g.links.map((l) => (
            <Row
              key={l.id}
              to={l.to}
              title={l.label}
              detail={l.what}
              meta={<span className="hq-old-tag">Old portal →</span>}
              label={`${l.label}: ${l.what}. Opens the old portal page.`}
            />
          ))}
        </Panel>
      ))}
    </div>
  )
}
