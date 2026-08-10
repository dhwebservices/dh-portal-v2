/**
 * Visual editor for the public website.
 *
 * The canvas is the real site in an iframe, running in edit mode. Everything
 * you see is what a visitor would see, at the same widths, with the same CSS -
 * the editor never draws its own approximation of a page.
 *
 * The portal owns the document; the iframe only renders what it is given and
 * reports clicks back. That keeps one source of truth and means the undo stack,
 * autosave and publishing all live in one place.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { Button, Alert, StatusBadge } from '../../components/ds'
import {
  SITE_ORIGIN, EDIT_PROTOCOL, loadBlockManifest,
  getPage, importPage, saveDraft, publishPage, revertDraft,
  createBlock, moveBlock, insertBlock, removeBlock, duplicateBlock, patchBlockProps,
} from '../../utils/website/cms'
import Inspector from './Inspector'

const DEVICES = {
  desktop: { label: 'Desktop', width: '100%' },
  tablet: { label: 'Tablet', width: 820 },
  mobile: { label: 'Mobile', width: 390 },
}

const AUTOSAVE_MS = 2000

/** "home" lives at the site root; everything else at /slug. */
function pathForSlug(slug) {
  return slug === 'home' ? '/' : `/${slug}`
}

export default function WebsiteEditor({ slug = 'home' }) {
  const { instance, accounts } = useMsal()
  const account = accounts?.[0]
  // MSAL hands back a new account object on many renders. Depending on the
  // object itself re-ran the load effect over and over; the id is stable.
  const accountKey = account?.homeAccountId || account?.username || ''
  const frameRef = useRef(null)

  const [manifest, setManifest] = useState(null)
  const [page, setPage] = useState(null)
  const [doc, setDoc] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [device, setDevice] = useState('desktop')
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [frameReady, setFrameReady] = useState(false)
  const [showInsert, setShowInsert] = useState(false)
  const [dragIndex, setDragIndex] = useState(null)
  // Two-step buttons rather than window.confirm: a native dialog blocks the
  // whole page, and looks nothing like the rest of the portal.
  const [pending, setPending] = useState(null)

  const history = useRef({ past: [], future: [] })

  const definitionsByType = useMemo(() => {
    const map = {}
    for (const block of manifest?.blocks || []) map[block.type] = block
    return map
  }, [manifest])

  /* ── load ─────────────────────────────────────────────────────────────── */

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [manifestData, pageResult] = await Promise.all([
          loadBlockManifest(),
          getPage(instance, account, slug),
        ])
        if (!active) return
        setManifest(manifestData)
        setPage(pageResult.page)
        setDoc(pageResult.page?.content || { version: 1, blocks: [] })
        setStatus('ready')
      } catch (err) {
        if (!active) return
        setError(err.message || 'Could not open the editor.')
        setStatus('error')
      }
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, accountKey, slug])

  /* ── iframe bridge ────────────────────────────────────────────────────── */

  const post = useCallback((type, payload) => {
    frameRef.current?.contentWindow?.postMessage({ protocol: EDIT_PROTOCOL, type, payload }, SITE_ORIGIN)
  }, [])

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== SITE_ORIGIN) return
      const message = event.data
      if (!message || message.protocol !== EDIT_PROTOCOL) return

      if (message.type === 'hello') {
        setFrameReady(true)
        post('enable-edit', {})
      }
      if (message.type === 'block-selected') {
        setSelectedId(message.payload?.blockId || null)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [post])

  // Push the document whenever it changes so the canvas always shows the draft.
  useEffect(() => {
    if (!frameReady || !doc) return
    post('set-document', { slug, document: doc })
  }, [frameReady, doc, slug, post])

  useEffect(() => {
    if (!frameReady) return
    post('select-block', { blockId: selectedId })
  }, [frameReady, selectedId, post])

  /* ── editing ──────────────────────────────────────────────────────────── */

  const apply = useCallback((next) => {
    setDoc((current) => {
      history.current.past.push(current)
      history.current.future = []
      return typeof next === 'function' ? next(current) : next
    })
    setDirty(true)
  }, [])

  const undo = useCallback(() => {
    const previous = history.current.past.pop()
    if (!previous) return
    setDoc((current) => { history.current.future.push(current); return previous })
    setDirty(true)
  }, [])

  const redo = useCallback(() => {
    const next = history.current.future.pop()
    if (!next) return
    setDoc((current) => { history.current.past.push(current); return next })
    setDirty(true)
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key === 'z' && !event.shiftKey) { event.preventDefault(); undo() }
      if (event.key === 'z' && event.shiftKey) { event.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  /* ── autosave ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!dirty || !doc) return undefined
    const timer = setTimeout(async () => {
      try {
        await saveDraft(instance, account, slug, doc)
        setDirty(false)
        setError('')
      } catch (err) {
        setError(`Draft not saved: ${err.message}`)
      }
    }, AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [dirty, doc, instance, account, slug])

  /* ── actions ──────────────────────────────────────────────────────────── */

  const handleImport = async () => {
    setPending(null)
    try {
      await importPage(instance, account, slug, true)
      const refreshed = await getPage(instance, account, slug)
      setPage(refreshed.page)
      setDoc(refreshed.page.content)
      setDirty(false)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRevert = async () => {
    setPending(null)
    try {
      await revertDraft(instance, account, slug)
      const refreshed = await getPage(instance, account, slug)
      setPage(refreshed.page)
      setDoc(refreshed.page.content)
      setDirty(false)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const handlePublish = async () => {
    setPending(null)
    try {
      if (dirty) await saveDraft(instance, account, slug, doc)
      const result = await publishPage(instance, account, slug)
      const refreshed = await getPage(instance, account, slug)
      setPage(refreshed.page)
      setDirty(false)
      // Surfaced rather than hidden: if the rebuild hook is not set up, the
      // page is live for visitors but search engines keep seeing the old HTML
      // until the next deploy. That is worth knowing about.
      setError(result?.rebuild === 'not configured'
        ? 'Published. Note: no rebuild hook is configured, so search engines will keep seeing the previous wording until the site is next deployed.'
        : '')
    } catch (err) {
      setError(err.message)
    }
  }

  /* ── render ───────────────────────────────────────────────────────────── */

  if (status === 'loading') {
    return <div className="spin-wrap" style={{ minHeight: '60vh' }}><div className="spin" /></div>
  }

  if (status === 'error') {
    return (
      <div className="ds-content">
        <div className="ds-page-header">
          <div><h1>Website</h1></div>
          <Button variant="secondary" onClick={() => { window.location.href = '/website' }}>← Back to pages</Button>
        </div>
        <Alert variant="warning">{error}</Alert>
      </div>
    )
  }

  const blocks = doc?.blocks || []
  const selectedBlock = blocks.find((b) => b.id === selectedId) || null
  const frameWidth = DEVICES[device].width

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 46px)', background: 'var(--color-bg-base)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', flexShrink: 0 }}>
        <Button
          variant="ghost"
          style={{ height: 28, fontSize: 12, padding: '0 8px' }}
          onClick={() => { window.location.href = '/website' }}
        >← Pages</Button>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{page?.title || slug}</div>
        <StatusBadge variant={page?.status === 'published' ? 'active' : 'neutral'}>
          {page?.status === 'published' ? 'Published' : 'Draft'}
        </StatusBadge>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {dirty ? 'Saving…' : 'All changes saved'}
        </span>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 4 }}>
          {Object.entries(DEVICES).map(([key, config]) => (
            <Button
              key={key}
              variant={device === key ? 'primary' : 'secondary'}
              style={{ height: 28, fontSize: 12, padding: '0 10px' }}
              onClick={() => setDevice(key)}
            >{config.label}</Button>
          ))}
        </div>

        <Button variant="secondary" style={{ height: 28, fontSize: 12 }} onClick={undo}>Undo</Button>
        {pending === 'import' ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--color-red-500)' }}>
              Replaces all {blocks.length} section{blocks.length === 1 ? '' : 's'} with the copy built
              into the site. Anything edited here and not yet published is lost.
            </span>
            <Button variant="secondary" style={{ height: 28, fontSize: 12 }} onClick={() => setPending(null)}>Cancel</Button>
            <Button variant="primary" style={{ height: 28, fontSize: 12 }} onClick={handleImport}>Yes, reload</Button>
          </>
        ) : pending === 'revert' ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Discard this draft and go back to what is live?</span>
            <Button variant="secondary" style={{ height: 28, fontSize: 12 }} onClick={() => setPending(null)}>Cancel</Button>
            <Button variant="primary" style={{ height: 28, fontSize: 12 }} onClick={handleRevert}>Yes, undo</Button>
          </>
        ) : pending === 'publish' ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Publish to the live site now?</span>
            <Button variant="secondary" style={{ height: 28, fontSize: 12 }} onClick={() => setPending(null)}>Cancel</Button>
            <Button variant="primary" style={{ height: 28, fontSize: 12 }} onClick={handlePublish}>Yes, publish</Button>
          </>
        ) : (
          <>
            {page?.status === 'published' && (
              <Button variant="secondary" style={{ height: 28, fontSize: 12 }} onClick={() => setPending('revert')}>Undo to live</Button>
            )}
            <Button variant="secondary" style={{ height: 28, fontSize: 12 }} onClick={() => setPending('import')}>Reload from site</Button>
            <Button variant="primary" style={{ height: 28, fontSize: 12 }} onClick={() => setPending('publish')}>Publish</Button>
          </>
        )}
      </div>

      {error ? <div style={{ padding: '8px 16px' }}><Alert variant="warning">{error}</Alert></div> : null}

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Section list */}
        <div style={{ width: 240, borderRight: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }}>Sections</span>
            <Button variant="secondary" style={{ height: 24, fontSize: 11, padding: '0 8px' }} onClick={() => setShowInsert((v) => !v)}>+ Add</Button>
          </div>

          {showInsert && (
            <div style={{ borderBottom: '1px solid var(--color-border)', maxHeight: 240, overflowY: 'auto', padding: 8 }}>
              {(manifest?.blocks || []).map((definition) => (
                <button
                  key={definition.type}
                  onClick={() => {
                    apply((current) => insertBlock(current, createBlock(definition), blocks.length))
                    setShowInsert(false)
                  }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 8px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, borderRadius: 6, color: 'var(--color-text-primary)' }}
                >
                  {definition.label}
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}> · {definition.group}</span>
                </button>
              ))}
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {blocks.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                This page has no sections yet. Use <strong>Reload from site</strong> to pull in the live page.
              </div>
            ) : blocks.map((block, index) => {
              const definition = definitionsByType[block.type]
              const selected = block.id === selectedId
              return (
                <div
                  key={block.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null && dragIndex !== index) {
                      apply((current) => moveBlock(current, dragIndex, index))
                    }
                    setDragIndex(null)
                  }}
                  onClick={() => setSelectedId(block.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 9px', marginBottom: 4, borderRadius: 7, cursor: 'grab',
                    background: selected ? 'var(--color-accent-soft, rgba(37,99,235,0.08))' : 'transparent',
                    border: `1px solid ${selected ? 'var(--color-primary-500, #2563EB)' : 'transparent'}`,
                    opacity: dragIndex === index ? 0.4 : 1,
                  }}
                >
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>⠿</span>
                  <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: definition ? 'var(--color-text-primary)' : 'var(--color-red-500)' }}>
                    {definition?.label || `${block.type} (missing)`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, minWidth: 0, background: 'var(--color-gray-100, #eef1f5)', overflow: 'auto', display: 'flex', justifyContent: 'center', padding: device === 'desktop' ? 0 : 16 }}>
          <iframe
            ref={frameRef}
            title="Website preview"
            src={`${SITE_ORIGIN}${pathForSlug(slug)}?dh_edit=1`}
            style={{
              width: frameWidth,
              maxWidth: '100%',
              height: '100%',
              minHeight: 600,
              border: device === 'desktop' ? 'none' : '1px solid var(--color-border)',
              borderRadius: device === 'desktop' ? 0 : 10,
              background: '#fff',
            }}
          />
        </div>

        {/* Inspector */}
        <div style={{ width: 320, borderLeft: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', overflowY: 'auto', flexShrink: 0 }}>
          <Inspector
            block={selectedBlock}
            definition={selectedBlock ? definitionsByType[selectedBlock.type] : null}
            onPatch={(blockId, patch) => apply((current) => patchBlockProps(current, blockId, patch))}
            onRemove={(blockId) => { apply((current) => removeBlock(current, blockId)); setSelectedId(null) }}
            onDuplicate={(blockId) => apply((current) => duplicateBlock(current, blockId))}
          />
        </div>
      </div>
    </div>
  )
}
