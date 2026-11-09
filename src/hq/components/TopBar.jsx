import { useEffect, useRef } from 'react'

// White top bar: search (Ctrl K / Cmd K focuses it) and the one red "New" button.
// Search and New don't do anything yet; they are wired up in later sessions.
export default function TopBar() {
  const inputRef = useRef(null)

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="hq-bar">
      <label className="hq-search">
        <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Search</span>
        <input
          ref={inputRef}
          type="search"
          placeholder="Search clients, messages, invoices"
          autoComplete="off"
        />
        <span className="hq-kbd" aria-hidden="true">Ctrl K</span>
      </label>
      <span className="hq-bar-gap" />
      <span className="hq-example-label" title="HQ shows made-up example data until it is connected">Example data</span>
      <button type="button" className="hq-btn hq-btn-primary" aria-haspopup="menu">New ▾</button>
    </header>
  )
}
