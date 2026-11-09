import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StatStrip from '../components/StatStrip'
import DataTable from '../components/DataTable'
import StatusTag from '../components/StatusTag'
import { EXAMPLE_TODAY, invoices, money, monthlyPlans, findClient } from '../exampleData'
import { dayDate, fullDate, longDate, pounds } from '../format'

// Money: the thin strip of four, then every invoice with a status word.
// Example data only; the real figures come from Stripe once phase 0 and 4 are done.
// The filter lives in the address (?show=unpaid).

const STATUS = { paid: ['ok', 'Paid'], due: ['warn', 'Due'], overdue: ['bad', 'Overdue'] }

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'unpaid', label: 'Not paid', test: (i) => i.status !== 'paid' },
  { id: 'overdue', label: 'Overdue', test: (i) => i.status === 'overdue' },
  { id: 'paid', label: 'Paid', test: (i) => i.status === 'paid' },
]

// Overdue first, then due soonest, then paid newest first.
const ORDER = { overdue: 0, due: 1, paid: 2 }
const byUrgency = (a, b) =>
  ORDER[a.status] - ORDER[b.status] ||
  (a.status === 'paid' ? b.date.localeCompare(a.date) : a.due.localeCompare(b.due))

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const columns = [
  {
    key: 'client',
    label: 'Client',
    link: true,
    render: (i) => {
      const client = findClient(i.clientId)
      return (
        <>
          <b>{client ? client.name : i.clientId}</b>
          <span className="hq-show-phone hq-cell-sub">{i.description}</span>
        </>
      )
    },
  },
  { key: 'what', label: 'What for', hideOnPhone: true, render: (i) => i.description },
  { key: 'id', label: 'Invoice', hideOnPhone: true, render: (i) => <span className="hq-mono-sm hq-muted">{i.id}</span> },
  { key: 'amount', label: 'Amount', className: 'hq-cell-num', render: (i) => pounds(i.amount) },
  {
    key: 'due',
    label: 'Due',
    className: 'hq-cell-when',
    render: (i) => (i.due.slice(0, 4) === EXAMPLE_TODAY.slice(0, 4) ? dayDate(i.due) : fullDate(i.due)),
  },
  { key: 'status', label: 'Status', render: (i) => { const [tone, label] = STATUS[i.status] || ['mute', i.status]; return <StatusTag tone={tone}>{label}</StatusTag> } },
]

export default function Money() {
  const [params, setParams] = useSearchParams()
  const show = FILTERS.some((f) => f.id === params.get('show')) ? params.get('show') : 'all'

  useEffect(() => { document.title = 'Money · DH HQ' }, [])

  const owed = money.owed()
  const overdue = money.overdue()
  const carePlans = monthlyPlans('care-plan')
  const dhLocal = monthlyPlans('dh-local')
  const sum = (list, key = 'amount') => list.reduce((s, x) => s + (x[key] || 0), 0)

  const rows = useMemo(() => invoices.filter(FILTERS.find((f) => f.id === show).test).sort(byUrgency), [show])

  return (
    <>
      <PageHeader title="Money" sub={longDate(EXAMPLE_TODAY)} />

      <StatStrip
        items={[
          { label: `Paid in, ${money.month}`, phoneLabel: 'paid in', value: pounds(money.paidIn()), note: `of ${pounds(money.dueThisMonth())} due` },
          { label: 'Owed to us', phoneLabel: 'owed', value: pounds(sum(owed)), note: plural(owed.length, 'invoice') },
          { label: 'Overdue', phoneLabel: 'overdue', value: pounds(sum(overdue)), note: plural(overdue.length, 'invoice'), tone: overdue.length ? 'bad' : null },
          { label: 'Monthly care plans', value: carePlans.length, note: `${pounds(sum(carePlans, 'monthly'))} a month`, hideOnPhone: true },
        ]}
      />

      <div className="hq-toolbar">
        <div className="hq-filters" role="group" aria-label="Show invoices">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`hq-filter${show === f.id ? ' is-on' : ''}`}
              aria-pressed={show === f.id}
              onClick={() => setParams(f.id === 'all' ? {} : { show: f.id }, { replace: true })}
            >
              {f.label} <span className="hq-filter-count">{invoices.filter(f.test).length}</span>
            </button>
          ))}
        </div>
        <p className="hq-muted hq-toolbar-note">
          Also {plural(dhLocal.length, 'DH Local plan')}, {pounds(sum(dhLocal, 'monthly'))} a month.
        </p>
      </div>

      <section className="hq-panel">
        <DataTable
          caption="Invoices"
          columns={columns}
          rows={rows}
          rowTo={(i) => `/hq/clients/${i.clientId}?tab=billing`}
          empty="No invoices to show here."
        />
      </section>

      <p className="hq-muted hq-page-foot">
        Real figures come from Stripe once David connects it. Chasing a payment happens from the{' '}
        <Link to="/hq/inbox?view=open&source=payment" className="hq-text-link">Inbox</Link> for now.
      </p>
    </>
  )
}
