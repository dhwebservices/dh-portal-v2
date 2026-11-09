import { Link } from 'react-router-dom'

// White box with a header line, e.g. "Needs a reply   Open inbox →".
// link: { to, label } for the small link on the right of the header.
export default function Panel({ title, link, className = '', children }) {
  return (
    <section className={`hq-panel ${className}`.trim()}>
      <header className="hq-panel-hd">
        <h2>{title}</h2>
        {link ? <Link to={link.to} className="hq-panel-link">{link.label} →</Link> : null}
      </header>
      <div className="hq-panel-body">{children}</div>
    </section>
  )
}

// Shown inside a Panel when there is nothing to list.
export function PanelEmpty({ children }) {
  return <p className="hq-panel-empty">{children}</p>
}
