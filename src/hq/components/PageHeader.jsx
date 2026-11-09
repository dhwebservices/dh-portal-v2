export default function PageHeader({ title, sub }) {
  return (
    <div className="hq-ph">
      <h1>{title}</h1>
      {sub ? <span className="hq-sub">{sub}</span> : null}
    </div>
  )
}
