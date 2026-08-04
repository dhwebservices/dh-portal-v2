import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Eye, Clock, Check, Upload, Smartphone, Tablet, Monitor, Layers, Settings, Image as ImageIcon, Globe, ExternalLink } from 'lucide-react'
import useEditor from '../../hooks/website-builder/useEditor'
import usePages from '../../hooks/website-builder/usePages'
import useAutoSave from '../../hooks/website-builder/useAutoSave'
import NewPageModal from '../../components/website-builder/NewPageModal'
import AssetManager from '../../components/website-builder/AssetManager'
import { deployPage, previewPage } from '../../utils/website-deploy'
import 'grapesjs/dist/css/grapes.min.css'
import '../../styles/website-builder/editor.css'

export default function Editor() {
  const { pageId } = useParams()
  const navigate = useNavigate()
  const [page, setPage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showAssetManager, setShowAssetManager] = useState(false)
  const [device, setDevice] = useState('desktop')
  const [publishing, setPublishing] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [deployedUrl, setDeployedUrl] = useState(null)
  const editorInitializedRef = useRef(false)

  const { getPage, updatePage, createPage } = usePages()

  // Initialize GrapesJS
  const {
    editor,
    isReady,
    getJson,
    getHtml,
    getCss,
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

      // Load deployed URL from settings if exists
      if (data.settings?.deployed_url) {
        setDeployedUrl(data.settings.deployed_url)
      }
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

  const handlePreview = async () => {
    if (!editor || !isReady) return

    setPreviewing(true)
    try {
      const html = getHtml()
      const css = getCss()
      const seo = {
        og_title: page?.title,
        meta_description: page?.meta_description,
        og_image: page?.og_image,
        og_type: page?.og_type || 'website',
        twitter_card: page?.twitter_card || 'summary_large_image',
        robots: page?.robots || 'noindex,nofollow', // Prevent preview indexing
      }

      const result = await previewPage(html, css, seo)

      // Open preview in new tab
      window.open(result.url, '_blank')
    } catch (err) {
      console.error('Preview failed:', err)
      alert(`Preview failed: ${err.message}`)
    } finally {
      setPreviewing(false)
    }
  }

  const handlePublish = async () => {
    if (!page || !editor || !isReady) return

    const confirmed = confirm(
      `Publish "${page.title}" to the web?\n\n` +
      `This will make the page publicly accessible at:\n` +
      `https://sites.dhwebsiteservices.co.uk/${page.slug}`
    )

    if (!confirmed) return

    setPublishing(true)
    try {
      // Save first
      await saveNow()

      // Get current content
      const html = getHtml()
      const css = getCss()
      const seo = {
        og_title: page.og_title || page.title,
        meta_description: page.meta_description,
        og_description: page.og_description,
        og_image: page.og_image,
        og_type: page.og_type || 'website',
        twitter_card: page.twitter_card || 'summary_large_image',
        twitter_title: page.twitter_title || page.title,
        twitter_description: page.twitter_description || page.meta_description,
        twitter_image: page.twitter_image || page.og_image,
        canonical_url: page.canonical_url,
        robots: page.robots || 'index,follow',
        meta_keywords: page.meta_keywords,
        structured_data: page.structured_data,
      }

      // Deploy
      const result = await deployPage(page.id, page.slug, html, css, seo)

      setDeployedUrl(result.url)
      alert(`✅ Published successfully!\n\nYour website is live at:\n${result.url}`)

      // Reload page data to get updated status
      await loadPageData()
    } catch (err) {
      console.error('Publish failed:', err)
      alert(`❌ Publish failed: ${err.message}`)
    } finally {
      setPublishing(false)
    }
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
            <div className="device-switcher-wrapper">
              <div className="device-label">
                {device === 'desktop' && 'Desktop (≥992px)'}
                {device === 'tablet' && 'Tablet (768-991px)'}
                {device === 'mobile' && 'Mobile (<768px)'}
              </div>
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
          </div>

          <div className="editor-toolbar-section">
            <button
              className="btn btn-sm btn-ghost"
              onClick={handlePreview}
              disabled={previewing || !isReady}
            >
              <Eye size={16} />
              {previewing ? 'Opening...' : 'Preview'}
            </button>

            <button
              className="btn btn-sm btn-ghost"
              onClick={handleManualSave}
              disabled={saving}
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save'}
            </button>

            <button
              className="btn btn-sm btn-primary"
              onClick={handlePublish}
              disabled={publishing || !isReady || !page}
              style={{ background: publishing ? 'var(--green)' : undefined }}
            >
              <Globe size={16} />
              {publishing ? 'Publishing...' : page?.status === 'published' ? 'Republish' : 'Publish'}
            </button>

            {deployedUrl && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => window.open(deployedUrl, '_blank')}
                title="View live site"
              >
                <ExternalLink size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Editor Main Area */}
        <div className="editor-main">
          {/* Left Sidebar - Blocks & Layers */}
          <div className="editor-sidebar">
            <div className="editor-sidebar-section">
              <div className="editor-sidebar-header">
                <span>Components</span>
              </div>
              <div className="editor-sidebar-content">
                <div id="blocks"></div>
              </div>
            </div>
            <div className="editor-sidebar-section">
              <div className="editor-sidebar-header">
                <span>Assets</span>
                <button
                  className="btn btn-xs btn-ghost"
                  onClick={() => setShowAssetManager(true)}
                  style={{ padding: '4px 8px' }}
                >
                  <ImageIcon size={12} />
                  Manage
                </button>
              </div>
              <div className="editor-sidebar-content">
                <button
                  className="btn btn-sm"
                  onClick={() => setShowAssetManager(true)}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <Upload size={14} />
                  Upload Assets
                </button>
              </div>
            </div>
            <div className="editor-sidebar-section" style={{ flex: 1, minHeight: 0 }}>
              <div className="editor-sidebar-header">
                <span>Layers</span>
              </div>
              <div className="editor-sidebar-content">
                <div id="layers"></div>
              </div>
            </div>
          </div>

          {/* Center Canvas */}
          <div className="editor-canvas">
            <div id="gjs-editor"></div>
          </div>

          {/* Right Sidebar - Styles & Traits */}
          <div className="editor-properties">
            <div className="editor-sidebar-section">
              <div className="editor-sidebar-header">
                <span>Styles</span>
              </div>
              <div className="editor-sidebar-content">
                <div id="styles"></div>
              </div>
            </div>
            <div className="editor-sidebar-section">
              <div className="editor-sidebar-header">
                <span>Settings</span>
              </div>
              <div className="editor-sidebar-content">
                <div id="traits"></div>
              </div>
            </div>
          </div>
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

      <AssetManager
        isOpen={showAssetManager}
        onClose={() => setShowAssetManager(false)}
        selectionMode={false}
      />
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

