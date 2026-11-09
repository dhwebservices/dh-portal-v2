import { useEffect, useRef } from 'react'

// A panel that slides in from the right (full screen on phones) for detail or a form.
// Esc or the Close button closes it. Focus moves into it when it opens and goes
// back to where it was when it closes.
export default function SidePanel({ title, onClose, children, footer }) {
  const headingRef = useRef(null)
  const returnTo = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Runs once per panel: focus in, Esc to close, focus back out.
  useEffect(() => {
    returnTo.current = document.activeElement
    headingRef.current?.focus()
    const onKey = (event) => { if (event.key === 'Escape') closeRef.current() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (returnTo.current && document.body.contains(returnTo.current)) returnTo.current.focus()
    }
  }, [])

  return (
    <>
      <div className="hq-side-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="hq-sidepanel" role="dialog" aria-modal="false" aria-labelledby="hq-sidepanel-title">
        <header className="hq-sidepanel-hd">
          <h2 id="hq-sidepanel-title" ref={headingRef} tabIndex={-1}>{title}</h2>
          <button type="button" className="hq-btn" onClick={onClose}>Close</button>
        </header>
        <div className="hq-sidepanel-body">{children}</div>
        {footer ? <footer className="hq-sidepanel-ft">{footer}</footer> : null}
      </aside>
    </>
  )
}
