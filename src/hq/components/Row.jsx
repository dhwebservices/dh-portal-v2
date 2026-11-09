import { Link } from 'react-router-dom'

// One 36px line in a Panel. Give it `to` to make the whole row a link.
//   lead:   things on the left (a SourceTag, a checkbox, a time)
//   title:  bold text;  detail: muted text after it (hidden on phones)
//   meta:   things on the right (a StatusTag, an Avatar)
//   when:   small mono time on the far right; whenShort replaces it on phones
//   done:   strike the title through
export default function Row({ to, lead, title, detail, meta, when, whenShort, done = false, label }) {
  const content = (
    <>
      {lead}
      <span className={`hq-row-text${done ? ' is-done' : ''}`}>
        {title ? <b>{title}</b> : null}
        {detail ? <span className="hq-row-detail"> {detail}</span> : null}
      </span>
      {meta ? <span className="hq-row-meta">{meta}</span> : null}
      {when ? (
        <span className="hq-row-when">
          {whenShort ? (
            <>
              <span className="hq-hide-phone">{when}</span>
              <span className="hq-show-phone" aria-hidden="true">{whenShort}</span>
            </>
          ) : when}
        </span>
      ) : null}
    </>
  )
  if (to) {
    return <Link to={to} className="hq-row is-link" aria-label={label}>{content}</Link>
  }
  return <div className="hq-row">{content}</div>
}

// The small square in job rows. Shows done or not; ticking happens on the Jobs screen.
export function Check({ done }) {
  return <span className={`hq-check${done ? ' is-done' : ''}`} aria-hidden="true" />
}
