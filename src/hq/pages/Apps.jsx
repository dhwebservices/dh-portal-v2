import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StatStrip from '../components/StatStrip'
import DataTable from '../components/DataTable'
import StatusTag from '../components/StatusTag'
import { EXAMPLE_TODAY, apps } from '../exampleData'
import { fullDate, longDate } from '../format'

// Apps: one row per app with store status, latest build and where to manage it.
// Example data; real versions and reviews come from App Store Connect and Google
// Play in phase 4. Store links are left out until we have the real addresses.

function StoreStatus({ app }) {
  if (app.storeStatus === 'waiting') {
    return <StatusTag tone="warn">With {app.waitingAt} · {app.waitingDays} {app.waitingDays === 1 ? 'day' : 'days'}</StatusTag>
  }
  if (app.storeStatus === 'rejected') return <StatusTag tone="bad">Rejected by {app.waitingAt || 'the store'}</StatusTag>
  return <StatusTag tone="ok">Live</StatusTag>
}

function Manage({ app }) {
  const parts = []
  if (app.storeUrl) {
    parts.push(<a key="store" href={app.storeUrl} target="_blank" rel="noreferrer" className="hq-text-link">Store page</a>)
  }
  if (app.admin === 'iphone') {
    parts.push(<span key="admin" className="hq-muted">Admin in the staff iPhone app</span>)
  } else if (app.admin) {
    parts.push(<Link key="admin" to={app.admin} className="hq-text-link">Open the portal</Link>)
  }
  if (!parts.length) return <span className="hq-muted">No admin screen yet</span>
  return <span className="hq-cell-two">{parts}</span>
}

const columns = [
  {
    key: 'name',
    label: 'App',
    render: (a) => (
      <span className="hq-cell-two">
        <b>{a.name}</b>
        <small>{a.platforms}</small>
      </span>
    ),
  },
  { key: 'status', label: 'Store status', render: (a) => <StoreStatus app={a} /> },
  {
    key: 'build',
    label: 'Latest build',
    render: (a) => (
      <span className="hq-cell-two">
        <span className="hq-mono-sm">{a.version} ({a.build})</span>
        <small>{fullDate(a.builtAt)}</small>
      </span>
    ),
  },
  {
    key: 'rating',
    label: 'Rating',
    hideOnPhone: true,
    render: (a) => (a.rating ? <span className="hq-mono-sm">{a.rating.toFixed(1)} of 5</span> : <span className="hq-muted">{a.note || 'Not rated yet'}</span>),
  },
  {
    key: 'reviews',
    label: 'New reviews',
    hideOnPhone: true,
    render: (a) => (a.newReviews
      ? <Link to="/hq/inbox?view=open&source=app" className="hq-text-link">{a.newReviews} in the Inbox</Link>
      : <span className="hq-muted">None</span>),
  },
  { key: 'link', label: 'Manage', hideOnPhone: true, render: (a) => <Manage app={a} /> },
]

export default function Apps() {
  useEffect(() => { document.title = 'Apps · DH HQ' }, [])

  const live = apps.filter((a) => a.storeStatus === 'live').length
  const waiting = apps.filter((a) => a.storeStatus === 'waiting')
  const reviews = apps.reduce((s, a) => s + a.newReviews, 0)
  const rated = apps.filter((a) => a.rating)
  const average = rated.length ? rated.reduce((s, a) => s + a.rating, 0) / rated.length : null

  return (
    <>
      <PageHeader title="Apps" sub={longDate(EXAMPLE_TODAY)} />

      <StatStrip
        items={[
          { label: 'Live', phoneLabel: 'live', value: live, note: `of ${apps.length} apps` },
          { label: 'Waiting at a store', phoneLabel: 'waiting', value: waiting.length, note: waiting.length ? waiting.map((a) => a.name).join(', ') : null },
          { label: 'New reviews', phoneLabel: 'new reviews', value: reviews, note: reviews ? 'in the Inbox' : null },
          { label: 'Average rating', value: average ? average.toFixed(1) : '—', note: average ? `across ${rated.length} apps` : null, hideOnPhone: true },
        ]}
      />

      <section className="hq-panel">
        <DataTable caption="Apps" columns={columns} rows={apps} empty="No apps yet." />
      </section>

      <p className="hq-muted hq-page-foot">
        Versions, waiting times and reviews will come from App Store Connect and Google Play once David connects them.
      </p>
    </>
  )
}
