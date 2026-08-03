import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Eye, Clock, Check, Upload, Smartphone, Tablet, Monitor, Layers, Settings } from 'lucide-react'
import useEditor from '../../hooks/website-builder/useEditor'
import usePages from '../../hooks/website-builder/usePages'
import useAutoSave from '../../hooks/website-builder/useAutoSave'
import NewPageModal from '../../components/website-builder/NewPageModal'
import 'grapesjs/dist/css/grapes.min.css'

export default function Editor() {
  const { pageId } = useParams()
  const navigate = useNavigate()
  const [page, setPage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [device, setDevice] = useState('desktop')
  const editorInitializedRef = useRef(false)

  const { getPage, updatePage, createPage } = usePages()

  // Initialize GrapesJS
  const {
    editor,
    isReady,
    getJson,
    loadJson,
    setDevice: setEditorDevice
  } = useEditor('gjs-editor', {
    fromElement: false,
    height: '100%',
    width: '100%',
    noticeOnUnload: false
  })

  // Load page data
  useEffect(() => {
    if (pageId === 'new') {
      setShowNewModal(true)
      setLoading(false)
    } else {
      loadPageData()
    }
  }, [pageId])

  // Load content into editor once ready
  useEffect(() => {
    if (isReady && page && !editorInitializedRef.current && page.content) {
      if (Object.keys(page.content).length > 0) {
        loadJson(page.content)
      }
      editorInitializedRef.current = true
    }
  }, [isReady, page, loadJson])

  const loadPageData = async () => {
    try {
      setLoading(true)
      const { data, error } = await getPage(pageId)

      if (error) throw error

      setPage(data)
      setLastSaved(data.updated_at ? new Date(data.updated_at) : null)
    } catch (err) {
      console.error('Failed to load page:', err)
      navigate('/website-builder')
    } finally {
      setLoading(false)
    }
  }

  const getEditorContent = useCallback(() => {
    if (!editor) return null
    return getJson()
  }, [editor, getJson])

  // Auto-save
  const { saveNow, triggerSave } = useAutoSave(
    page?.id,
    getEditorContent,
    page && isReady
  )

  // Trigger auto-save on editor changes
  useEffect(() => {
    if (!editor || !isReady || !page) return

    const handleChange = () => {
      triggerSave()
    }

    editor.on('change', handleChange)

    return () => {
      editor.off('change', handleChange)
    }
  }, [editor, isReady, page, triggerSave])

  const handleManualSave = async () => {
    if (!page) return

    setSaving(true)
    try {
      const success = await saveNow()
      if (success) {
        setLastSaved(new Date())
      }
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    // TODO: Check for unsaved changes
    navigate('/website-builder')
  }

  const handleDeviceChange = (deviceName) => {
    setDevice(deviceName)
    setEditorDevice(deviceName)
  }

  const handleNewPageCreated = (newPage) => {
    navigate(`/website-builder/edit/${newPage.id}`)
    setShowNewModal(false)
  }

  if (loading) {
    return (
      <div className="spin-wrap" style={{ minHeight: '100vh' }}>
        <div className="spin" />
      </div>
    )
  }

  return (
    <>
      <div className="editor-layout">
        {/* Editor Toolbar */}
        <div className="editor-toolbar">
          <div className="editor-toolbar-section">
            <button className="btn btn-sm btn-ghost" onClick={handleBack}>
              <ArrowLeft size={16} />
              Back
            </button>

            <div className="editor-divider" />

            <div className="editor-page-info">
              <div className="editor-page-title">{page?.title || 'New Page'}</div>
              {lastSaved && (
                <div className="editor-page-saved">
                  <Check size={11} />
                  Saved {formatTime(lastSaved)}
                </div>
              )}
            </div>
          </div>

          <div className="editor-toolbar-section editor-toolbar-center">
            <div className="device-switcher">
              <button
                className={`device-btn ${device === 'desktop' ? 'active' : ''}`}
                onClick={() => handleDeviceChange('desktop')}
                title="Desktop"
              >
                <Monitor size={16} />
              </button>
              <button
                className={`device-btn ${device === 'tablet' ? 'active' : ''}`}
                onClick={() => handleDeviceChange('tablet')}
                title="Tablet"
              >
                <Tablet size={16} />
              </button>
              <button
                className={`device-btn ${device === 'mobile' ? 'active' : ''}`}
                onClick={() => handleDeviceChange('mobile')}
                title="Mobile"
              >
                <Smartphone size={16} />
              </button>
            </div>
          </div>

          <div className="editor-toolbar-section">
            <button className="btn btn-sm btn-ghost">
              <Eye size={16} />
              Preview
            </button>

            <button
              className="btn btn-sm btn-primary"
              onClick={handleManualSave}
              disabled={saving}
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Editor Container */}
        <div className="editor-container">
          <div id="gjs-editor" />
        </div>
      </div>

      <NewPageModal
        isOpen={showNewModal}
        onClose={() => {
          setShowNewModal(false)
          navigate('/website-builder')
        }}
        onSuccess={handleNewPageCreated}
      />

      <style>{`
        .editor-layout {
          height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--bg2);
        }

        .editor-toolbar {
          background: var(--bg);
          border-bottom: 1px solid var(--border);
          padding: 10px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-shrink: 0;
          height: 56px;
        }

        .editor-toolbar-section {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .editor-toolbar-center {
          flex: 1;
          justify-content: center;
        }

        .editor-divider {
          height: 24px;
          width: 1px;
          background: var(--border);
        }

        .editor-page-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .editor-page-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text);
        }

        .editor-page-saved {
          font-size: 11px;
          color: var(--green);
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .device-switcher {
          display: flex;
          gap: 2px;
          background: var(--bg2);
          padding: 4px;
          border-radius: 8px;
        }

        .device-btn {
          padding: 8px 12px;
          border: none;
          background: transparent;
          color: var(--sub);
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .device-btn:hover {
          background: var(--bg);
          color: var(--text);
        }

        .device-btn.active {
          background: var(--bg);
          color: var(--accent);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .editor-container {
          flex: 1;
          position: relative;
          overflow: hidden;
        }

        #gjs-editor {
          height: 100%;
        }

        /* GrapesJS Customization */
        .gjs-cv-canvas {
          background: var(--bg2);
        }

        .gjs-frame {
          border: 1px solid var(--border);
        }

        .gjs-pn-panel {
          background: var(--bg);
          border-color: var(--border);
        }

        .gjs-pn-btn {
          color: var(--text);
        }

        .gjs-pn-btn:hover,
        .gjs-pn-active {
          background: var(--accent-soft);
          color: var(--accent);
        }
      `}</style>
    </>
  )
}

function formatTime(date) {
  const now = new Date()
  const diff = Math.floor((now - date) / 1000)

  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`

  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

