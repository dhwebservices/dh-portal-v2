import { useState } from 'react'

// Small single-series area chart, e.g. visitors per day for 30 days.
// Hover or tap shows the day and value underneath. One series, so no legend:
// the panel title names it.
//   values: numbers, oldest first.  labels: matching day labels ("Sat 7 Nov").
//   unit: word after the number in the readout ("visitors").
const W = 200
const H = 46
const PAD = 3

export default function Sparkline({ values, labels, unit = '', summary }) {
  const [active, setActive] = useState(null)
  if (!values?.length) return null

  const max = Math.max(...values, 1)
  const step = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0
  const x = (i) => PAD + i * step
  const y = (v) => H - PAD - (v / max) * (H - PAD * 2)
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const line = `M${points.join(' L')}`
  const area = `${line} L${x(values.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`
  const last = values.length - 1
  const shown = active ?? last

  const pick = (event) => {
    const box = event.currentTarget.getBoundingClientRect()
    const clientX = event.touches ? event.touches[0].clientX : event.clientX
    const ratio = (clientX - box.left) / box.width
    const i = Math.round(((ratio * W) - PAD) / (step || 1))
    setActive(Math.max(0, Math.min(last, i)))
  }

  return (
    <div className="hq-spark">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
        onMouseMove={pick}
        onTouchStart={pick}
        onTouchMove={pick}
        onMouseLeave={() => setActive(null)}
      >
        <path d={area} className="hq-spark-area" />
        <path d={line} className="hq-spark-line" vectorEffect="non-scaling-stroke" />
        {active !== null ? (
          <line x1={x(active)} x2={x(active)} y1="0" y2={H} className="hq-spark-cross" vectorEffect="non-scaling-stroke" />
        ) : null}
      </svg>
      <div className="hq-spark-read" aria-live="polite">
        {labels?.[shown] ? `${labels[shown]}: ` : ''}<b>{values[shown]}</b> {unit}
      </div>
    </div>
  )
}
