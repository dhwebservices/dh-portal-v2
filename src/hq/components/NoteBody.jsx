// Shows a library note's text as headings, numbered steps, bullet points and
// paragraphs. Reads the small plain format described in exampleData.js:
//   ## Heading, ### Smaller heading, 1. step, - bullet, **bold**, blank line = new paragraph.
// It builds normal page elements, never raw HTML, so note text can't inject anything.

function Inline({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => (
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  ))
}

export function parseNote(body) {
  const blocks = []
  let para = []
  let list = null

  const flushPara = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = [] } }
  const flushList = () => { if (list) { blocks.push(list); list = null } }

  String(body || '').split(/\r?\n/).forEach((raw) => {
    const line = raw.trim()
    if (!line) { flushPara(); flushList(); return }
    let m
    if ((m = line.match(/^###\s+(.*)$/))) { flushPara(); flushList(); blocks.push({ type: 'h3', text: m[1] }); return }
    if ((m = line.match(/^##\s+(.*)$/))) { flushPara(); flushList(); blocks.push({ type: 'h2', text: m[1] }); return }
    if ((m = line.match(/^\d+[.)]\s+(.*)$/))) {
      flushPara()
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] } }
      list.items.push(m[1]); return
    }
    if ((m = line.match(/^[-*]\s+(.*)$/))) {
      flushPara()
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] } }
      list.items.push(m[1]); return
    }
    flushList()
    para.push(line)
  })
  flushPara()
  flushList()
  return blocks
}

export default function NoteBody({ body }) {
  const blocks = parseNote(body)
  if (!blocks.length) return <p className="hq-muted">This note is empty. Press Edit to write it.</p>
  return (
    <div className="hq-note-body">
      {blocks.map((b, i) => {
        if (b.type === 'h2') return <h2 key={i}><Inline text={b.text} /></h2>
        if (b.type === 'h3') return <h3 key={i}><Inline text={b.text} /></h3>
        if (b.type === 'ol') return <ol key={i}>{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ol>
        if (b.type === 'ul') return <ul key={i}>{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ul>
        return <p key={i}><Inline text={b.text} /></p>
      })}
    </div>
  )
}
