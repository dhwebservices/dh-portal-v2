// One thin strip of figures (never separate tiles). Four on desktop.
// Each item: { label, value, note, tone, phoneLabel, hideOnPhone }
//   tone: 'bad' turns the figure red (e.g. missed calls)
//   phoneLabel: shorter words under the figure on phones ("to reply")
//   hideOnPhone: leave this figure out on phones
export default function StatStrip({ items }) {
  const phoneCount = items.filter((item) => !item.hideOnPhone).length
  return (
    <dl className="hq-strip" style={{ '--hq-strip-n': items.length, '--hq-strip-phone-n': phoneCount }}>
      {items.map((item) => (
        <div key={item.label} className={`hq-strip-item${item.hideOnPhone ? ' hq-hide-phone' : ''}`}>
          <dt>
            <span className="hq-hide-phone">{item.label}</span>
            <span className="hq-show-phone">{item.phoneLabel || item.label}</span>
          </dt>
          <dd>
            <span className={`hq-strip-value${item.tone ? ` is-${item.tone}` : ''}`}>{item.value}</span>
            {item.note ? <small>{item.note}</small> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}
