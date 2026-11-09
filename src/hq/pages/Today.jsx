import { useEffect } from 'react'
import PageHeader from '../components/PageHeader'
import StatStrip from '../components/StatStrip'
import Panel, { PanelEmpty } from '../components/Panel'
import Row, { Check } from '../components/Row'
import StatusTag from '../components/StatusTag'
import SourceTag from '../components/SourceTag'
import Avatar from '../components/Avatar'
import {
  EXAMPLE_TODAY,
  money,
  findClient,
  findStaff,
  appsNeedingAttention,
  bookingsOn,
  isOverADay,
} from '../exampleData'
import { dayShort, dayTime, hourDay, longDate, pounds } from '../format'
import { useHQStore } from '../sessionStore'
import useMe from '../useMe'
import {
  WEEK_END,
  openConversationsOf,
  myMissedCalls,
  unassignedMissedCalls,
  myJobsDueThisWeek,
  isOverdue,
} from '../counts'

// Today: the first screen every morning. Matches the "Today" mockup in the plan
// on desktop and "HQ in the staff iPhone app" on phones. Example data for now.
// Counts use the same rules as the Inbox and Jobs "Mine" views (see counts.js)
// and the same on-screen lists (sessionStore.js), so they always agree.

function StaffAvatar({ id }) {
  const person = findStaff(id)
  if (!person) return null
  return <Avatar name={person.name} initials={person.initials} tone={person.tone} />
}

function NeedsReply({ conversations }) {
  const items = [...openConversationsOf(conversations)].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
  return (
    <Panel title="Needs a reply" link={{ to: '/hq/inbox', label: 'Open inbox' }} className="hq-today-replies hq-compact-phone">
      {items.length === 0 ? <PanelEmpty>Nothing waiting for a reply.</PanelEmpty> : null}
      {items.map((c) => {
        const client = findClient(c.clientId)
        const tag = c.assignee
          ? <StaffAvatar id={c.assignee} />
          : isOverADay(c.receivedAt)
            ? <StatusTag tone="bad">Over a day</StatusTag>
            : <StatusTag tone="mute">Unassigned</StatusTag>
        return (
          <Row
            key={c.id}
            to={`/hq/inbox?item=${c.id}`}
            lead={<SourceTag source={c.source} />}
            title={c.from}
            detail={c.preview}
            meta={tag}
            when={dayTime(c.receivedAt)}
            whenShort={dayShort(c.receivedAt)}
            label={`${c.from}${client ? `, ${client.name}` : ''}: ${c.preview}`}
          />
        )
      })}
    </Panel>
  )
}

function jobWhen(job) {
  if (job.done) return { when: 'Done' }
  if (job.due < EXAMPLE_TODAY) return { tag: <StatusTag tone="bad">Overdue</StatusTag> }
  if (job.due === EXAMPLE_TODAY) return { tag: <StatusTag tone="bad">Due today</StatusTag> }
  return { when: dayShort(job.due) }
}

function MyJobs({ jobs, me }) {
  // Same jobs as the Overdue and This week groups on Jobs "Mine", then ones ticked off.
  const open = myJobsDueThisWeek(jobs, me).sort((a, b) => a.due.localeCompare(b.due))
  const done = jobs.filter((j) => j.done && j.due <= WEEK_END && (!me || j.assignee === me.id))
  const list = [...open, ...done]
  return (
    <Panel title={me ? 'My jobs' : 'Jobs this week'} link={{ to: '/hq/jobs', label: 'All jobs' }} className="hq-today-jobs">
      {list.length === 0 ? <PanelEmpty>No jobs due this week.</PanelEmpty> : null}
      {list.map((job) => {
        const client = findClient(job.clientId)
        const { tag, when } = jobWhen(job)
        return (
          <Row
            key={job.id}
            to={`/hq/jobs?job=${job.id}`}
            lead={<Check done={job.done} />}
            title={job.done && client ? `${job.title}, ${client.name}` : job.title}
            detail={job.done ? null : [client?.name, job.template].filter(Boolean).join(', ')}
            done={job.done}
            meta={<>{tag}{!me ? <StaffAvatar id={job.assignee} /> : null}</>}
            when={when}
          />
        )
      })}
    </Panel>
  )
}

function BookingsToday() {
  const list = bookingsOn(EXAMPLE_TODAY)
  return (
    <Panel title={<><span className="hq-hide-phone">Bookings today</span><span className="hq-show-phone">Bookings</span></>} className="hq-today-bookings hq-compact-phone">
      {list.length === 0 ? <PanelEmpty>No bookings today.</PanelEmpty> : null}
      {list.map((b) => (
        <Row
          key={b.id}
          to={b.clientId ? `/hq/clients/${b.clientId}` : '/hq/clients'}
          lead={<span className="hq-row-when is-lead">{b.time}</span>}
          title={<>{b.title}<span className="hq-show-phone">, {b.clientName}</span></>}
          detail={`${b.clientName} · ${b.minutes} min`}
          meta={<StaffAvatar id={b.assignee} />}
          label={`${b.time} ${b.title}, ${b.clientName}, ${b.minutes} minutes`}
        />
      ))}
    </Panel>
  )
}

function AppsPanel() {
  const list = appsNeedingAttention()
  return (
    <Panel title="Apps" className="hq-today-apps">
      {list.length === 0 ? <PanelEmpty>Nothing needs looking at.</PanelEmpty> : null}
      {list.map((app) => {
        const waiting = app.storeStatus === 'waiting'
        const detail = waiting
          ? `with Apple ${app.waitingDays} days`
          : `${app.newReviews} new review${app.newReviews === 1 ? '' : 's'}`
        return (
          <Row
            key={app.id}
            to={`/hq/apps?app=${app.id}`}
            title={app.name}
            detail={detail}
            meta={waiting ? <StatusTag tone="warn">Waiting</StatusTag> : <StatusTag tone="info">New</StatusTag>}
          />
        )
      })}
    </Panel>
  )
}

export default function Today() {
  const me = useMe()
  const { conversations, jobs } = useHQStore()

  useEffect(() => {
    document.title = 'Today · DH HQ'
  }, [])

  const replies = openConversationsOf(conversations)
  const overADay = replies.filter((c) => isOverADay(c.receivedAt)).length

  // Missed calls: as Inbox "Mine" with "Calls & voicemail". Unassigned ones go in the note.
  const calls = myMissedCalls(conversations, me)
  const earliestCall = [...calls].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))[0]
  const unassignedCalls = me ? unassignedMissedCalls(conversations).length : 0
  const callNote = [
    earliestCall ? `since ${hourDay(earliestCall.receivedAt)}` : null,
    unassignedCalls ? `${unassignedCalls} unassigned` : null,
  ].filter(Boolean).join(', ') || null

  // Jobs due this week: as Jobs "Mine", the Overdue and This week groups.
  const dueJobs = myJobsDueThisWeek(jobs, me)
  const overdue = dueJobs.filter(isOverdue).length

  return (
    <>
      <PageHeader title="Today" sub={longDate(EXAMPLE_TODAY)} />
      <StatStrip
        items={[
          { label: 'Needs a reply', phoneLabel: 'to reply', value: replies.length, note: overADay ? `${overADay} over a day` : null },
          { label: me ? 'Your missed calls' : 'Missed calls', phoneLabel: me ? 'your missed calls' : 'missed calls', value: calls.length, tone: calls.length ? 'bad' : null, note: callNote },
          { label: me ? 'Your jobs this week' : 'Jobs due this week', phoneLabel: me ? 'your jobs' : 'jobs', value: dueJobs.length, note: overdue ? `${overdue} overdue` : null },
          { label: `Paid in, ${money.month}`, value: pounds(money.paidIn()), note: `of ${pounds(money.dueThisMonth())} due`, hideOnPhone: true },
        ]}
      />
      <div className="hq-today-grid">
        <NeedsReply conversations={conversations} />
        <div className="hq-stack">
          <MyJobs jobs={jobs} me={me} />
          <BookingsToday />
          <AppsPanel />
        </div>
      </div>
    </>
  )
}
