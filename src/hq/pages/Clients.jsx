import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import DataTable from '../components/DataTable'
import StatusTag from '../components/StatusTag'
import Avatar from '../components/Avatar'
import { STAGES, stageFor, PLAN_LABELS, findStaff, lastContactFor, EXAMPLE_TODAY } from '../exampleData'
import { sinceLabel, pounds } from '../format'
import { useHQStore } from '../sessionStore'

// Clients: leads and clients in one table, with a filter per stage and a search box.
// The chosen stage and search live in the address (?stage=lead&q=cafe) so Back works.

const planText = (client) => {
  if (!client.plan) return null
  const name = PLAN_LABELS[client.plan] || client.plan
  return client.monthly ? `${name} · ${pounds(client.monthly)}/month` : name
}

const matches = (client, q) => {
  if (!q) return true
  const owner = findStaff(client.owner)
  const haystack = [
    client.name, client.type, client.town, client.domain, owner?.name,
    ...client.contacts.map((c) => c.name),
  ].filter(Boolean).join(' ').toLowerCase()
  return q.toLowerCase().split(/\s+/).every((word) => haystack.includes(word))
}

const columns = [
  {
    key: 'business',
    label: 'Business',
    link: true,
    render: (c) => (
      <>
        <b>{c.name}</b>
        <span className="hq-show-phone hq-cell-sub">{c.type} · {c.town}</span>
      </>
    ),
  },
  { key: 'where', label: 'Type and town', hideOnPhone: true, className: 'hq-cell-wrap', render: (c) => <span className="hq-muted">{c.type} · {c.town}</span> },
  { key: 'stage', label: 'Stage', render: (c) => { const s = stageFor(c.status); return <StatusTag tone={s.tone}>{s.label}</StatusTag> } },
  { key: 'website', label: 'Website', hideOnPhone: true, render: (c) => (c.domain ? <span className="hq-mono-sm">{c.domain}</span> : <span className="hq-muted">None yet</span>) },
  { key: 'plan', label: 'Monthly plan', hideOnPhone: true, className: 'hq-cell-wrap', render: (c) => planText(c) || <span className="hq-muted">None</span> },
  {
    key: 'owner',
    label: 'Our side',
    hideOnPhone: true,
    render: (c) => {
      const person = findStaff(c.owner)
      return person
        ? <span className="hq-person"><Avatar name={person.name} initials={person.initials} tone={person.tone} />{person.name.split(' ')[0]}</span>
        : <StatusTag tone="mute">Unassigned</StatusTag>
    },
  },
  {
    key: 'contact',
    label: 'Last contact',
    className: 'hq-cell-when',
    render: (c) => { const at = lastContactFor(c.id); return at ? sinceLabel(at, EXAMPLE_TODAY) : '—' },
  },
]

export default function Clients() {
  const [params, setParams] = useSearchParams()
  const stage = params.get('stage') || 'all'
  const q = params.get('q') || ''

  useEffect(() => { document.title = 'Clients · DH HQ' }, [])

  const update = (key, value) => {
    const next = new URLSearchParams(params)
    if (!value || value === 'all') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: key === 'q' })
  }

  const { clients } = useHQStore()
  const searched = useMemo(() => clients.filter((c) => matches(c, q)), [q, clients])
  const rows = useMemo(() => {
    const list = stage === 'all' ? searched : searched.filter((c) => c.status === stage)
    // Most recent contact first; never contacted at the end.
    return [...list].sort((a, b) => (lastContactFor(b.id) || '').localeCompare(lastContactFor(a.id) || ''))
  }, [searched, stage])

  const filters = [{ id: 'all', label: 'All' }, ...STAGES]

  return (
    <>
      <PageHeader title="Clients" sub={`${clients.length} leads and clients`} />

      <div className="hq-toolbar">
        <div className="hq-filters" role="group" aria-label="Show stage">
          {filters.map((f) => {
            const count = f.id === 'all' ? searched.length : searched.filter((c) => c.status === f.id).length
            return (
              <button
                key={f.id}
                type="button"
                className={`hq-filter${stage === f.id ? ' is-on' : ''}`}
                aria-pressed={stage === f.id}
                onClick={() => update('stage', f.id)}
              >
                {f.label} <span className="hq-filter-count">{count}</span>
              </button>
            )
          })}
        </div>
        <label className="hq-search hq-page-search">
          <span className="hq-visually-hidden">Search clients</span>
          <input
            type="search"
            value={q}
            placeholder="Search by name, town or person"
            onChange={(e) => update('q', e.target.value)}
          />
        </label>
      </div>

      <section className="hq-panel">
        <DataTable
          caption="Leads and clients"
          columns={columns}
          rows={rows}
          rowTo={(c) => `/hq/clients/${c.id}`}
          empty={q ? `No leads or clients match "${q}".` : 'No leads or clients at this stage.'}
        />
      </section>
    </>
  )
}
