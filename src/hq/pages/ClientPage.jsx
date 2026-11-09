import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Panel, { PanelEmpty } from '../components/Panel'
import Row, { Check } from '../components/Row'
import StatusTag from '../components/StatusTag'
import SourceTag from '../components/SourceTag'
import Avatar from '../components/Avatar'
import DataTable from '../components/DataTable'
import Sparkline from '../components/Sparkline'
import {
  EXAMPLE_TODAY,
  findClient,
  findStaff,
  stageFor,
  PLAN_LABELS,
  jobs,
  requests,
  invoices,
  files,
  agreements,
  historyFor,
  visitorsDaily,
} from '../exampleData'
import { dayShort, dayTime, shortDate, fullDate, monthYear, sinceLabel, pounds } from '../format'

// One client's page. Matches the "Client page" mockup in the plan.
// Tabs live in the address (?tab=billing) so Back and links work.

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'requests', label: 'Requests' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'billing', label: 'Billing' },
  { id: 'files', label: 'Files' },
  { id: 'agreements', label: 'Agreements' },
  { id: 'history', label: 'History' },
]

const REQUEST_STATUS = { new: ['info', 'New'], 'being-done': ['warn', 'Being done'], done: ['ok', 'Done'] }
const INVOICE_STATUS = { paid: ['ok', 'Paid'], due: ['warn', 'Due'], overdue: ['bad', 'Overdue'] }
const AGREEMENT_STATUS = { signed: ['ok', 'Signed'], sent: ['warn', 'Waiting to sign'], draft: ['mute', 'Draft'] }

const Tag = ({ map, value }) => { const [tone, label] = map[value] || ['mute', value]; return <StatusTag tone={tone}>{label}</StatusTag> }

function StaffAvatar({ id }) {
  const person = findStaff(id)
  return person ? <Avatar name={person.name} initials={person.initials} tone={person.tone} /> : null
}

// "When" for a history line: day and time this week, otherwise the date.
const historyWhen = (at) => (sinceLabel(at, EXAMPLE_TODAY).match(/^(Today|Yesterday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/) ? dayTime(at) : shortDate(at))

function jobStatus(job) {
  if (job.done) return ['ok', 'Done']
  if (job.due < EXAMPLE_TODAY) return ['bad', 'Overdue']
  if (job.due === EXAMPLE_TODAY) return ['bad', 'Due today']
  return ['mute', 'Open']
}

/* ---------------- Overview ---------------- */

function WebsiteCard({ client }) {
  let big = <span className="hq-muted">None yet</span>
  let note = 'We haven\'t built a website for them yet.'
  if (client.status === 'past') {
    big = <span className="hq-muted">Taken down</span>
    note = client.domain ? `Was ${client.domain}` : 'No longer looked after by us.'
  } else if (client.site) {
    const up = client.site.status === 'up'
    big = <span className={up ? 'hq-ok' : 'hq-bad'}>{up ? 'Up' : 'Down'}</span>
    note = `Checked ${client.site.checkedMinutesAgo} min ago · SSL to ${monthYear(client.site.sslExpires)}`
  }
  return (
    <section className="hq-panel hq-card">
      <h2 className="hq-card-label">Website</h2>
      <div className="hq-big">{big}</div>
      <p className="hq-muted">{note}</p>
    </section>
  )
}

function VisitorsCard({ client }) {
  const values = visitorsDaily[client.id]
  const labels = values?.map((_, i) => {
    const d = new Date(`${EXAMPLE_TODAY}T00:00:00`)
    d.setDate(d.getDate() - (values.length - 1 - i))
    return `${dayShort(d)} ${shortDate(d)}`
  })
  return (
    <section className="hq-panel hq-card">
      <h2 className="hq-card-label">Visitors, 30 days</h2>
      {values ? (
        <>
          <div className="hq-big">{client.visitors30d.toLocaleString('en-GB')}</div>
          <Sparkline
            values={values}
            labels={labels}
            unit="visitors"
            summary={`Visitors per day for the last 30 days: ${client.visitors30d} in total, between ${Math.min(...values)} and ${Math.max(...values)} a day.`}
          />
        </>
      ) : (
        <>
          <div className="hq-big"><span className="hq-muted">—</span></div>
          <p className="hq-muted">Shows once their site is live with us.</p>
        </>
      )}
    </section>
  )
}

function BillingCard({ client }) {
  const owed = invoices.filter((i) => i.clientId === client.id && i.status !== 'paid').reduce((sum, i) => sum + i.amount, 0)
  const plan = client.plan ? PLAN_LABELS[client.plan] : null
  const note = plan && client.nextCharge
    ? `${plan} · next charge ${shortDate(client.nextCharge)}`
    : plan ? plan : 'No monthly plan'
  return (
    <section className="hq-panel hq-card">
      <h2 className="hq-card-label">Billing</h2>
      <div className={`hq-big${owed ? ' hq-bad' : ''}`}>{pounds(owed)} owed</div>
      <p className="hq-muted">{note}</p>
    </section>
  )
}

function Overview({ client }) {
  const history = historyFor(client.id)
  const openJobs = jobs.filter((j) => j.clientId === client.id && !j.done)
  return (
    <>
      <div className="hq-grid3">
        <WebsiteCard client={client} />
        <VisitorsCard client={client} />
        <BillingCard client={client} />
      </div>
      <div className="hq-today-grid">
        <Panel title="History" link={history.length > 6 ? { to: `?tab=history`, label: 'All history' } : null}>
          {history.length === 0 ? <PanelEmpty>Nothing yet.</PanelEmpty> : null}
          {history.slice(0, 6).map((h) => (
            <div className="hq-row" key={h.id}>
              <span className="hq-row-when is-lead hq-when-wide">{historyWhen(h.at)}</span>
              <SourceTag source={h.source} />
              <span className="hq-row-text hq-wrap">{h.text}</span>
            </div>
          ))}
        </Panel>
        <div className="hq-stack">
          <Panel title="People">
            {client.contacts.length === 0 ? <PanelEmpty>No one added yet.</PanelEmpty> : null}
            {client.contacts.map((p) => (
              <Row
                key={p.id}
                lead={<Avatar name={p.name} tone="brown" />}
                title={p.name}
                detail={`${p.role === 'owner' ? 'Owner' : 'Team'} · client area: ${p.clientArea ? 'yes' : 'no'}`}
              />
            ))}
          </Panel>
          <Panel title="Open">
            {openJobs.length === 0 ? <PanelEmpty>No open jobs.</PanelEmpty> : null}
            {openJobs.map((j) => (
              <Row key={j.id} to={`/hq/jobs?job=${j.id}`} lead={<Check done={false} />} title={j.title} meta={<StaffAvatar id={j.assignee} />} />
            ))}
          </Panel>
        </div>
      </div>
    </>
  )
}

/* ---------------- Other tabs ---------------- */

function RequestsTab({ client }) {
  const rows = requests.filter((r) => r.clientId === client.id).sort((a, b) => b.askedAt.localeCompare(a.askedAt))
  return (
    <DataTable
      caption="Change requests"
      rows={rows}
      rowTo={(r) => (r.conversationId ? `/hq/inbox?item=${r.conversationId}` : null)}
      empty={`Changes ${client.name} asks for, from the client area, email or a call, will appear here.`}
      columns={[
        { key: 'title', label: 'Request', link: true, render: (r) => <b>{r.title}</b> },
        { key: 'by', label: 'Asked by', hideOnPhone: true, render: (r) => r.askedBy },
        { key: 'at', label: 'Asked', className: 'hq-cell-when', render: (r) => sinceLabel(r.askedAt, EXAMPLE_TODAY) },
        { key: 'status', label: 'Status', render: (r) => <Tag map={REQUEST_STATUS} value={r.status} /> },
      ]}
    />
  )
}

function JobsTab({ client }) {
  const rows = jobs.filter((j) => j.clientId === client.id).sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due))
  return (
    <DataTable
      caption="Jobs"
      rows={rows}
      rowTo={(j) => `/hq/jobs?job=${j.id}`}
      empty={`Work we do for ${client.name} will appear here.`}
      columns={[
        { key: 'title', label: 'Job', link: true, render: (j) => <b className={j.done ? 'hq-done' : undefined}>{j.title}</b> },
        { key: 'due', label: 'Due', className: 'hq-cell-when', render: (j) => `${dayShort(j.due)} ${shortDate(j.due)}` },
        { key: 'who', label: 'Our side', hideOnPhone: true, render: (j) => <StaffAvatar id={j.assignee} /> },
        { key: 'status', label: 'Status', render: (j) => { const [tone, label] = jobStatus(j); return <StatusTag tone={tone}>{label}</StatusTag> } },
      ]}
    />
  )
}

function BillingTab({ client }) {
  const rows = invoices.filter((i) => i.clientId === client.id).sort((a, b) => b.date.localeCompare(a.date))
  return (
    <DataTable
      caption="Invoices and receipts"
      rows={rows}
      empty={`Invoices and receipts will appear here once we bill ${client.name}.`}
      columns={[
        { key: 'date', label: 'Date', className: 'hq-cell-when', render: (i) => fullDate(i.date) },
        { key: 'id', label: 'Invoice', hideOnPhone: true, render: (i) => <span className="hq-mono-sm">{i.id}</span> },
        { key: 'what', label: 'What for', render: (i) => i.description },
        { key: 'amount', label: 'Amount', className: 'hq-cell-num', render: (i) => pounds(i.amount) },
        { key: 'status', label: 'Status', render: (i) => <Tag map={INVOICE_STATUS} value={i.status} /> },
      ]}
    />
  )
}

function FilesTab({ client }) {
  const rows = files.filter((f) => f.clientId === client.id).sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  return (
    <DataTable
      caption="Files"
      rows={rows}
      empty={`Logos, photos and handover packs for ${client.name} will appear here.`}
      columns={[
        { key: 'name', label: 'File', render: (f) => <b className="hq-break">{f.name}</b> },
        { key: 'size', label: 'Size', className: 'hq-cell-num', render: (f) => f.size },
        { key: 'added', label: 'Added', className: 'hq-cell-when', render: (f) => fullDate(f.addedAt) },
        { key: 'by', label: 'By', hideOnPhone: true, render: (f) => f.addedBy },
      ]}
    />
  )
}

function AgreementsTab({ client }) {
  const rows = agreements.filter((a) => a.clientId === client.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt))
  return (
    <DataTable
      caption="Agreements"
      rows={rows}
      empty={`Proposals and agreements sent to ${client.name} will appear here.`}
      columns={[
        { key: 'title', label: 'Agreement', render: (a) => <b>{a.title}</b> },
        { key: 'sent', label: 'Sent', className: 'hq-cell-when', render: (a) => fullDate(a.sentAt) },
        { key: 'status', label: 'Status', render: (a) => <Tag map={AGREEMENT_STATUS} value={a.status} /> },
        { key: 'signed', label: 'Signed by', hideOnPhone: true, render: (a) => (a.signedBy ? `${a.signedBy}, ${fullDate(a.signedAt)}` : <span className="hq-muted">Not yet</span>) },
      ]}
    />
  )
}

function HistoryTab({ client }) {
  const rows = historyFor(client.id)
  return (
    <DataTable
      caption="History"
      rows={rows}
      empty={`Every call, email, payment and job for ${client.name} will appear here.`}
      columns={[
        { key: 'when', label: 'When', className: 'hq-cell-when', render: (h) => fullDate(h.at) },
        { key: 'source', label: 'From', render: (h) => <SourceTag source={h.source} /> },
        { key: 'text', label: 'What happened', render: (h) => h.text },
      ]}
    />
  )
}

/* ---------------- Page ---------------- */

export default function ClientPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const client = findClient(id)
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'overview'

  useEffect(() => {
    document.title = `${client ? client.name : 'Client'} · DH HQ`
  }, [client])

  if (!client) {
    return (
      <section className="hq-panel">
        <p className="hq-panel-empty">We couldn't find that client. <Link to="/hq/clients" className="hq-text-link">Back to Clients</Link></p>
      </section>
    )
  }

  const stage = stageFor(client.status)
  const openRequests = requests.filter((r) => r.clientId === client.id && r.status !== 'done').length
  const tabTo = (t) => (t === 'overview' ? '' : `?tab=${t}`)
  const since = client.status === 'client' && client.clientSince
    ? `Client since ${monthYear(client.clientSince)}`
    : client.status === 'past' && client.clientSince ? `Client from ${monthYear(client.clientSince)}` : null

  const body = {
    overview: <Overview client={client} />,
    requests: <RequestsTab client={client} />,
    jobs: <JobsTab client={client} />,
    billing: <BillingTab client={client} />,
    files: <FilesTab client={client} />,
    agreements: <AgreementsTab client={client} />,
    history: <HistoryTab client={client} />,
  }[tab]

  return (
    <>
      <header className="hq-chead">
        <nav className="hq-crumbs" aria-label="Breadcrumb">
          <Link to="/hq/clients">Clients</Link> <span aria-hidden="true">/</span> <span aria-current="page">{client.name}</span>
        </nav>
        <div className="hq-chead-t1">
          <h1>{client.name}</h1>
          <StatusTag tone={stage.tone}>{stage.label}</StatusTag>
          <span className="hq-bar-gap" />
          <button type="button" className="hq-btn" disabled title="Comes with the client area in phase 5">Invite to client area</button>
        </div>
        <div className="hq-chead-t2">
          <span>{client.type} · {client.town}</span>
          {client.domain ? <span className="hq-mono-sm">{client.domain}</span> : null}
          {since ? <span>{since}</span> : null}
        </div>
        <nav className="hq-ctabs" aria-label="Client sections">
          {TABS.map((t) => (
            <Link
              key={t.id}
              to={{ search: tabTo(t.id) }}
              replace
              className={tab === t.id ? 'is-on' : undefined}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              {t.label}{t.id === 'requests' && openRequests ? <span className="hq-tab-count"> {openRequests}</span> : null}
            </Link>
          ))}
        </nav>
      </header>
      {tab === 'overview' ? body : <section className="hq-panel">{body}</section>}
    </>
  )
}
