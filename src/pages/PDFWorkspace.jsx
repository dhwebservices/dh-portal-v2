import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  annotatePdfWorkspaceDocument,
  compressPdfWorkspaceDocument,
  createPdfWorkspaceFolder,
  fetchPdfWorkspaceLibrary,
  mergePdfWorkspaceDocuments,
  movePdfWorkspaceDocument,
  redactPdfWorkspaceDocument,
  reorderPdfWorkspaceDocument,
  sharePdfWorkspaceDocument,
  splitPdfWorkspaceDocument,
  uploadPdfWorkspaceFiles,
} from '../utils/pdfWorkspace'

const VIEWS = [
  { key: 'recent', label: 'Recent' },
  { key: 'awaiting_signature', label: 'Awaiting signature' },
  { key: 'redacted', label: 'Redacted' },
  { key: 'compressed', label: 'Compressed' },
  { key: 'templates', label: 'Templates' },
  { key: 'final', label: 'Final exports' },
]

const SCOPES = [
  { key: 'personal', label: 'My PDFs', note: 'Private working files and drafts.' },
  { key: 'shared', label: 'Shared Libraries', note: 'Department and team PDF libraries.' },
  { key: 'template', label: 'Templates', note: 'Reusable internal document masters.' },
]

function formatBytes(value) {
  const size = Number(value || 0)
  if (!size) return '0 KB'
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 102.4) / 10)} KB`
  return `${Math.round(size / (1024 * 102.4)) / 10} MB`
}

function formatDate(value) {
  if (!value) return 'Just now'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Just now'
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isScopeAvailable(scope, permissions) {
  if (scope === 'personal') return permissions?.pdf_workspace !== false
  if (scope === 'shared') return permissions?.pdf_shared_view === true
  if (scope === 'template') return permissions?.pdf_shared_view === true
  return false
}

export default function PDFWorkspace() {
  const { user, can } = useAuth()
  const fileInputRef = useRef(null)
  const [scope, setScope] = useState('personal')
  const [view, setView] = useState('recent')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [permissions, setPermissions] = useState({
    pdf_workspace: true,
    pdf_shared_view: can('pdf_shared_view') || can('pdf_shared_edit') || can('pdf_shared_admin'),
    pdf_shared_edit: can('pdf_shared_edit') || can('pdf_shared_admin'),
    pdf_shared_admin: can('pdf_shared_admin'),
  })
  const [documents, setDocuments] = useState([])
  const [folders, setFolders] = useState([])
  const [jobs, setJobs] = useState([])
  const [shareTargets, setShareTargets] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [activeDocumentId, setActiveDocumentId] = useState('')
  const [activeFolderId, setActiveFolderId] = useState('')

  const activeDocument = documents.find((document) => document.id === activeDocumentId) || null
  const visibleFolders = folders.filter((folder) => folder.scope === scope)
  const visibleScope = SCOPES.find((item) => item.key === scope) || SCOPES[0]

  const loadWorkspace = async (nextScope = scope, nextFolderId = activeFolderId, nextView = view, nextSearch = search) => {
    if (!user?.email) return
    setLoading(true)
    setError('')
    try {
      const payload = await fetchPdfWorkspaceLibrary(user, {
        scope: nextScope,
        folderId: nextFolderId || undefined,
        view: nextView,
        q: nextSearch || undefined,
      })
      setDocuments(payload.documents || [])
      setFolders(payload.folders || [])
      setJobs(payload.jobs || [])
      setShareTargets(payload.shareTargets || [])
      setPermissions(payload.permissions || permissions)
      setSelectedIds((current) => current.filter((id) => (payload.documents || []).some((document) => document.id === id)))
      setActiveDocumentId((current) => {
        if (current && (payload.documents || []).some((document) => document.id === current)) return current
        return payload.documents?.[0]?.id || ''
      })
    } catch (loadError) {
      setError(loadError?.message || 'Could not load PDF Workspace.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorkspace().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, scope, activeFolderId, view])

  const refresh = async (message = '') => {
    if (message) setNotice(message)
    await loadWorkspace(scope, activeFolderId, view, search)
  }

  const setScopeAndReset = (nextScope) => {
    setScope(nextScope)
    setActiveFolderId('')
    setSelectedIds([])
    setActiveDocumentId('')
  }

  const updateSearch = async (event) => {
    const nextValue = event.target.value
    setSearch(nextValue)
    await loadWorkspace(scope, activeFolderId, view, nextValue)
  }

  const toggleSelected = (documentId) => {
    setSelectedIds((current) => (
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId]
    ))
  }

  const withSaving = async (task) => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await task()
    } catch (taskError) {
      setError(taskError?.message || 'Could not complete that PDF action.')
    } finally {
      setSaving(false)
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFilePick = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    await withSaving(async () => {
      await uploadPdfWorkspaceFiles(user, {
        files,
        scope,
        folder_id: activeFolderId || undefined,
        library_key: scope === 'shared' ? 'company' : scope === 'template' ? 'templates' : user?.email,
      })
      await refresh(`${files.length} file${files.length === 1 ? '' : 's'} uploaded.`)
    })
  }

  const handleCreateFolder = async () => {
    const name = window.prompt('Folder name')
    if (!name) return
    await withSaving(async () => {
      await createPdfWorkspaceFolder(user, {
        name,
        scope,
        library_key: scope === 'shared' ? 'company' : scope === 'template' ? 'templates' : user?.email,
        parent_id: activeFolderId || null,
      })
      await refresh('Folder created.')
    })
  }

  const handleMerge = async () => {
    if (selectedIds.length < 2) {
      setError('Select at least two PDFs to merge.')
      return
    }
    await withSaving(async () => {
      await mergePdfWorkspaceDocuments(user, { document_ids: selectedIds })
      await refresh('Merged PDF created.')
    })
  }

  const handleSplit = async () => {
    if (!activeDocument) {
      setError('Select a PDF to split.')
      return
    }
    const ranges = window.prompt('Page ranges, for example: 1-2,3-4')
    if (!ranges) return
    await withSaving(async () => {
      await splitPdfWorkspaceDocument(user, {
        document_id: activeDocument.id,
        ranges,
      })
      await refresh('Split files created.')
    })
  }

  const handleReorder = async () => {
    if (!activeDocument) {
      setError('Select a PDF to reorder.')
      return
    }
    const order = window.prompt('New page order, for example: 3,1,2')
    if (!order) return
    await withSaving(async () => {
      await reorderPdfWorkspaceDocument(user, {
        document_id: activeDocument.id,
        order,
      })
      await refresh('Reordered PDF saved as a new version.')
    })
  }

  const handleRotate = async (rotation) => {
    if (!activeDocument) {
      setError('Select a PDF to rotate.')
      return
    }
    const pageNumbers = window.prompt('Pages to rotate, comma-separated. Leave blank for all pages.')
    await withSaving(async () => {
      await reorderPdfWorkspaceDocument(user, {
        document_id: activeDocument.id,
        rotation,
        page_numbers: pageNumbers
          ? pageNumbers.split(',').map((value) => Number(value.trim())).filter(Boolean)
          : undefined,
      })
      await refresh(`Rotated PDF ${rotation > 0 ? 'clockwise' : 'anticlockwise'}.`)
    })
  }

  const handleCompress = async () => {
    if (!activeDocument) {
      setError('Select a PDF to compress.')
      return
    }
    await withSaving(async () => {
      await compressPdfWorkspaceDocument(user, { document_id: activeDocument.id })
      await refresh('Compressed copy created.')
    })
  }

  const handleAnnotation = async (kind) => {
    if (!activeDocument) {
      setError('Select a PDF to edit.')
      return
    }
    const pageNumber = Number(window.prompt('Page number', '1') || 1)
    if (!pageNumber) return

    let annotations = []
    if (kind === 'text') {
      const text = window.prompt('Text to place on the PDF')
      if (!text) return
      annotations = [{ type: 'text', page_number: pageNumber, x: 56, y: 760, text }]
    } else if (kind === 'stamp') {
      const label = window.prompt('Stamp label', 'Approved')
      if (!label) return
      annotations = [{ type: 'stamp', page_number: pageNumber, x: 360, y: 760, label }]
    } else if (kind === 'sign') {
      annotations = [{ type: 'text', page_number: pageNumber, x: 56, y: 120, text: user?.name || user?.email || 'Staff signature' }]
    } else if (kind === 'highlight') {
      annotations = [{ type: 'highlight', page_number: pageNumber, x: 56, y: 690, width: 220, height: 18 }]
    }

    await withSaving(async () => {
      await annotatePdfWorkspaceDocument(user, {
        document_id: activeDocument.id,
        annotations,
      })
      await refresh('Annotated version created.')
    })
  }

  const handleRedact = async () => {
    if (!activeDocument) {
      setError('Select a PDF to redact.')
      return
    }
    const pageNumber = Number(window.prompt('Page number', '1') || 1)
    const dims = window.prompt('Redaction rectangle as x,y,width,height', '56,700,240,22')
    if (!pageNumber || !dims) return
    const [x, y, width, height] = dims.split(',').map((value) => Number(value.trim()))
    await withSaving(async () => {
      await redactPdfWorkspaceDocument(user, {
        document_id: activeDocument.id,
        redactions: [{ page_number: pageNumber, x, y, width, height }],
      })
      await refresh('Redacted export created.')
    })
  }

  const handleShare = async () => {
    if (!activeDocument) {
      setError('Select a PDF to share.')
      return
    }
    const email = window.prompt('Share with staff email')
    if (!email) return
    const accessLevel = window.prompt('Access level: view, comment, edit, admin', 'view') || 'view'
    await withSaving(async () => {
      await sharePdfWorkspaceDocument(user, {
        document_id: activeDocument.id,
        shared_with_email: email,
        access_level: accessLevel,
      })
      await refresh('Shared access added.')
    })
  }

  const handleMove = async (nextScope, extra = {}) => {
    if (!activeDocument) {
      setError('Select a PDF first.')
      return
    }
    await withSaving(async () => {
      await movePdfWorkspaceDocument(user, {
        document_id: activeDocument.id,
        scope: nextScope,
        library_key: nextScope === 'shared' ? 'company' : nextScope === 'template' ? 'templates' : user?.email,
        folder_id: extra.folder_id === undefined ? activeFolderId || null : extra.folder_id,
        due_at: extra.due_at,
        status: extra.status,
        is_final: extra.is_final,
        is_template: extra.is_template,
      })
      await refresh('Document updated.')
    })
  }

  const handleRequestReview = async () => {
    const dueAt = window.prompt('Review due date/time (optional ISO or leave blank)')
    await handleMove(activeDocument?.scope || scope, { due_at: dueAt || null, status: 'review_requested' })
  }

  const handleRequestSignature = async () => {
    const dueAt = window.prompt('Signature due date/time (optional ISO or leave blank)')
    await handleMove(activeDocument?.scope || scope, { due_at: dueAt || null, status: 'awaiting_signature' })
  }

  const handleMarkFinal = async () => {
    await handleMove(activeDocument?.scope || scope, { is_final: true, status: 'final' })
  }

  const selectedCount = selectedIds.length

  return (
    <div className="pdf-workspace-page">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/jpg"
        multiple
        style={{ display: 'none' }}
        onChange={handleFilePick}
      />

      <section className="pdf-workspace-hero">
        <div>
          <span className="pdf-workspace-kicker">Internal tools</span>
          <h1>PDF Workspace</h1>
          <p>
            Upload, combine, split, annotate, redact, share, and store internal PDFs without leaving the portal.
          </p>
        </div>
        <div className="pdf-workspace-hero-actions">
          <button className="btn secondary" onClick={handleCreateFolder} disabled={saving || (scope !== 'personal' && !permissions.pdf_shared_edit)}>New folder</button>
          <button className="btn" onClick={handleUploadClick} disabled={saving || (scope !== 'personal' && !permissions.pdf_shared_edit)}>Upload PDF</button>
        </div>
      </section>

      {(error || notice) ? (
        <div className="pdf-workspace-banner" data-tone={error ? 'error' : 'success'}>
          {error || notice}
        </div>
      ) : null}

      <section className="pdf-workspace-shell">
        <aside className="pdf-workspace-side">
          <div className="pdf-workspace-block">
            <div className="pdf-workspace-block-label">Workspace</div>
            <div className="pdf-workspace-scope-list">
              {SCOPES.map((item) => {
                const allowed = isScopeAvailable(item.key, permissions)
                return (
                  <button
                    key={item.key}
                    className={`pdf-workspace-scope-btn ${scope === item.key ? 'is-active' : ''}`}
                    onClick={() => allowed && setScopeAndReset(item.key)}
                    disabled={!allowed}
                  >
                    <strong>{item.label}</strong>
                    <span>{allowed ? item.note : 'Restricted library access.'}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="pdf-workspace-block">
            <div className="pdf-workspace-block-label">Saved views</div>
            <div className="pdf-workspace-view-list">
              {VIEWS.map((item) => (
                <button
                  key={item.key}
                  className={`pdf-workspace-view-btn ${view === item.key ? 'is-active' : ''}`}
                  onClick={() => setView(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pdf-workspace-block">
            <div className="pdf-workspace-block-label">Folders</div>
            <div className="pdf-workspace-folder-list">
              <button
                className={`pdf-workspace-folder-btn ${!activeFolderId ? 'is-active' : ''}`}
                onClick={() => setActiveFolderId('')}
              >
                All files
              </button>
              {visibleFolders.map((folder) => (
                <button
                  key={folder.id}
                  className={`pdf-workspace-folder-btn ${activeFolderId === folder.id ? 'is-active' : ''}`}
                  onClick={() => setActiveFolderId(folder.id)}
                >
                  {folder.name}
                </button>
              ))}
            </div>
          </div>

          <div className="pdf-workspace-block">
            <div className="pdf-workspace-block-label">Recent jobs</div>
            <div className="pdf-workspace-job-list">
              {(jobs || []).slice(0, 6).map((job) => (
                <div key={job.id} className="pdf-workspace-job-row">
                  <div>
                    <strong>{String(job.action || 'job').replace(/_/g, ' ')}</strong>
                    <span>{formatDate(job.created_at)}</span>
                  </div>
                  <em data-state={job.status}>{job.status}</em>
                </div>
              ))}
              {!jobs?.length ? <div className="pdf-workspace-empty-copy">No queued jobs yet.</div> : null}
            </div>
          </div>
        </aside>

        <section className="pdf-workspace-browser">
          <div className="pdf-workspace-browser-top">
            <div>
              <div className="pdf-workspace-browser-title">{visibleScope.label}</div>
              <div className="pdf-workspace-browser-note">
                {documents.length} file{documents.length === 1 ? '' : 's'} in this view
              </div>
            </div>
            <div className="pdf-workspace-toolbar">
              <input
                className="pdf-workspace-search"
                placeholder="Search title, tag, owner, or library"
                value={search}
                onChange={updateSearch}
              />
            </div>
          </div>

          <div className="pdf-workspace-bulkbar">
            <span>{selectedCount ? `${selectedCount} selected` : 'Select PDFs for bulk actions'}</span>
            <div>
              <button className="btn secondary sm" onClick={handleMerge} disabled={saving || selectedCount < 2}>Merge</button>
              <button className="btn secondary sm" onClick={() => handleMove('shared')} disabled={saving || !activeDocument || !permissions.pdf_shared_edit}>Move to shared</button>
              <button className="btn secondary sm" onClick={() => handleMove('template', { is_template: true })} disabled={saving || !activeDocument || !permissions.pdf_shared_edit}>Save as template</button>
            </div>
          </div>

          <div className="pdf-workspace-document-list">
            {loading ? <div className="pdf-workspace-empty">Loading PDF Workspace…</div> : null}
            {!loading && !documents.length ? (
              <div className="pdf-workspace-empty">
                <strong>No PDFs in this view yet.</strong>
                <span>Upload a file or create a folder to get started.</span>
              </div>
            ) : null}
            {documents.map((document) => (
              <button
                key={document.id}
                className={`pdf-workspace-doc-row ${activeDocumentId === document.id ? 'is-active' : ''}`}
                onClick={() => setActiveDocumentId(document.id)}
              >
                <div className="pdf-workspace-doc-select" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(document.id)}
                    onChange={() => toggleSelected(document.id)}
                  />
                </div>
                <div className="pdf-workspace-doc-main">
                  <div className="pdf-workspace-doc-heading">
                    <strong>{document.title || document.filename}</strong>
                    <span>{document.scope}</span>
                  </div>
                  <div className="pdf-workspace-doc-meta">
                    <span>{document.owner_name || document.owner_email}</span>
                    <span>{formatBytes(document.file_size)}</span>
                    <span>{formatDate(document.updated_at || document.created_at)}</span>
                  </div>
                  {Array.isArray(document.tags) && document.tags.length ? (
                    <div className="pdf-workspace-tag-row">
                      {document.tags.slice(0, 4).map((tag) => (
                        <span key={`${document.id}-${tag}`} className="pdf-workspace-tag">{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className="pdf-workspace-inspector">
          {activeDocument ? (
            <>
              <div className="pdf-workspace-inspector-top">
                <div>
                  <div className="pdf-workspace-block-label">Selected file</div>
                  <h2>{activeDocument.title || activeDocument.filename}</h2>
                </div>
                {activeDocument.download_url ? (
                  <a className="btn secondary sm" href={activeDocument.download_url} target="_blank" rel="noreferrer">
                    Download
                  </a>
                ) : null}
              </div>

              <div className="pdf-workspace-action-strip">
                <button className="btn secondary sm" onClick={handleSplit} disabled={saving}>Split</button>
                <button className="btn secondary sm" onClick={handleReorder} disabled={saving}>Reorder</button>
                <button className="btn secondary sm" onClick={() => handleRotate(-90)} disabled={saving}>Rotate left</button>
                <button className="btn secondary sm" onClick={() => handleRotate(90)} disabled={saving}>Rotate right</button>
                <button className="btn secondary sm" onClick={handleCompress} disabled={saving}>Compress</button>
              </div>

              <div className="pdf-workspace-action-strip">
                <button className="btn secondary sm" onClick={() => handleAnnotation('text')} disabled={saving}>Text note</button>
                <button className="btn secondary sm" onClick={() => handleAnnotation('stamp')} disabled={saving}>Stamp</button>
                <button className="btn secondary sm" onClick={() => handleAnnotation('sign')} disabled={saving}>Sign</button>
                <button className="btn secondary sm" onClick={() => handleAnnotation('highlight')} disabled={saving}>Highlight</button>
                <button className="btn secondary sm" onClick={handleRedact} disabled={saving}>Redact export</button>
              </div>

              <div className="pdf-workspace-action-strip">
                <button className="btn secondary sm" onClick={handleRequestReview} disabled={saving}>Request review</button>
                <button className="btn secondary sm" onClick={handleRequestSignature} disabled={saving}>Request signature</button>
                <button className="btn secondary sm" onClick={handleShare} disabled={saving || !permissions.pdf_shared_edit}>Share internally</button>
                <button className="btn secondary sm" onClick={handleMarkFinal} disabled={saving}>Mark final</button>
              </div>

              <div className="pdf-workspace-preview-frame">
                {activeDocument.preview_url ? (
                  <iframe title={activeDocument.title || activeDocument.filename} src={activeDocument.preview_url} />
                ) : (
                  <div className="pdf-workspace-empty-copy">Secure preview will appear here once the file is ready.</div>
                )}
              </div>

              <div className="pdf-workspace-meta-grid">
                <div>
                  <span>Owner</span>
                  <strong>{activeDocument.owner_name || activeDocument.owner_email}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{activeDocument.metadata?.workflow_status || activeDocument.status || 'active'}</strong>
                </div>
                <div>
                  <span>Scope</span>
                  <strong>{activeDocument.scope}</strong>
                </div>
                <div>
                  <span>Library</span>
                  <strong>{activeDocument.library_key || '—'}</strong>
                </div>
                <div>
                  <span>Last updated</span>
                  <strong>{formatDate(activeDocument.updated_at || activeDocument.created_at)}</strong>
                </div>
                <div>
                  <span>Size</span>
                  <strong>{formatBytes(activeDocument.file_size)}</strong>
                </div>
              </div>

              {Array.isArray(activeDocument.annotations) && activeDocument.annotations.length ? (
                <div className="pdf-workspace-annotation-list">
                  <div className="pdf-workspace-block-label">Saved annotations</div>
                  {activeDocument.annotations.slice(0, 8).map((annotation) => (
                    <div key={annotation.id} className="pdf-workspace-annotation-row">
                      <strong>{annotation.annotation_type}</strong>
                      <span>Page {annotation.page_number}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="pdf-workspace-share-targets">
                <div className="pdf-workspace-block-label">Internal routing</div>
                <div className="pdf-workspace-share-target-list">
                  {shareTargets.slice(0, 6).map((target) => (
                    <span key={target.email || target.label} className="pdf-workspace-share-chip">
                      {target.name || target.label || target.email}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="pdf-workspace-empty">
              <strong>Select a PDF</strong>
              <span>Preview, annotate, merge, split, compress, and route documents from the inspector.</span>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}
