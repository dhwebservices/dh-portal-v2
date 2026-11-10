import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

// The red "New ▾" button in the top bar and its short menu.
//   New job        → the same form as the Jobs screen (with templates)
//   New lead       → a small form (QuickCreate.jsx), adds a Lead to Clients
//   Note to someone → an internal note in the Inbox (QuickCreate.jsx)
// The two small forms open with ?create=lead or ?create=note on the current page.

const ITEMS = [
  { id: 'job', label: 'New job' },
  { id: 'lead', label: 'New lead' },
  { id: 'note', label: 'Note to someone' },
]

export default function NewMenu() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const [, setParams] = useSearchParams()
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const itemRefs = useRef([])

  useEffect(() => {
    if (!open) return undefined
    itemRefs.current[0]?.focus()
    const onDown = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const choose = (id) => {
    setOpen(false)
    if (id === 'job') {
      navigate('/hq/jobs?new=1')
      return
    }
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('create', id)
      return next
    })
  }

  const onMenuKey = (event) => {
    const items = itemRefs.current.filter(Boolean)
    const at = items.indexOf(document.activeElement)
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); buttonRef.current?.focus() }
    if (event.key === 'ArrowDown') { event.preventDefault(); items[(at + 1) % items.length]?.focus() }
    if (event.key === 'ArrowUp') { event.preventDefault(); items[(at - 1 + items.length) % items.length]?.focus() }
    if (event.key === 'Tab') setOpen(false)
  }

  return (
    <div className="hq-newwrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="hq-btn hq-btn-primary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) } }}
      >
        New ▾
      </button>
      {open ? (
        <div className="hq-newmenu" role="menu" aria-label="New" onKeyDown={onMenuKey}>
          {ITEMS.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => { itemRefs.current[i] = el }}
              type="button"
              role="menuitem"
              className="hq-newmenu-item"
              onClick={() => choose(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
