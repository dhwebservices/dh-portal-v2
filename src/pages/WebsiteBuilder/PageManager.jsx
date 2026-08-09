import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Globe, Edit, Eye, FileText, Layout, Sparkles, Search, Filter } from '../../utils/lucide'
import { SectionPanel, EmptyState } from '../../components/ui'
import { supabase } from '../../utils/supabase'
import NewPageModal from '../../components/website-builder/NewPageModal'
import { Button } from '../../components/ds'

export default function PageManager() {
  const navigate = useNavigate()
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, draft, published
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)

  useEffect(() => {
    loadPages()
  }, [])

  const loadPages = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('website_pages')
        .select('*')
        .order('updated_at', { ascending: false })

      if (error) throw error
      setPages(data || [])
    } catch (err) {
      console.error('Failed to load pages:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleNewPage = () => {
    setShowNewModal(true)
  }

  const handleNewPageCreated = (newPage) => {
    setShowNewModal(false)
    navigate(`/website-builder/edit/${newPage.id}`)
  }

  const filteredPages = pages.filter(page => {
    if (filter !== 'all' && page.status !== filter) return false
    if (searchQuery && !page.title.toLowerCase().includes(searchQuery.toLowerCase()) && !page.slug.includes(searchQuery.toLowerCase())) return false
    return true
  })

  const stats = {
    total: pages.length,
    published: pages.filter(p => p.status === 'published').length,
    draft: pages.filter(p => p.status === 'draft').length
  }

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="page-header-icon">
            <Globe size={20} />
          </div>
          <div>
            <h1>Website Builder</h1>
            <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Create and manage website pages visually</p>
          </div>
        </div>
        <Button variant="primary" onClick={handleNewPage}>
          <Plus size={16} />
          New Page
        </Button>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Pages</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--color-green-500)' }}>{stats.published}</div>
            <div className="stat-label">Published</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--color-amber-500)' }}>{stats.draft}</div>
            <div className="stat-label">Drafts</div>
          </div>
        </div>

        {/* Filters */}
        <div className="filter-bar">
          <div className="filter-group">
            <button
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              className={`filter-btn ${filter === 'published' ? 'active' : ''}`}
              onClick={() => setFilter('published')}
            >
              Published
            </button>
            <button
              className={`filter-btn ${filter === 'draft' ? 'active' : ''}`}
              onClick={() => setFilter('draft')}
            >
              Drafts
            </button>
          </div>
          <div className="search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search pages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="spin-wrap" style={{ minHeight: 400 }}>
            <div className="spin" />
          </div>
        ) : filteredPages.length === 0 ? (
          pages.length === 0 ? (
            <EmptyState
              icon={Globe}
              title="No pages yet"
              text="Get started by creating your first page with the visual editor"
              actionLabel="Create Your First Page"
              onAction={handleNewPage}
            />
          ) : (
            <EmptyState
              icon={Search}
              title="No pages found"
              text={`No pages match your ${filter !== 'all' ? 'filter and ' : ''}search`}
            />
          )
        ) : (
          <SectionPanel title="Pages" subtitle={`${filteredPages.length} ${filteredPages.length === 1 ? 'page' : 'pages'}`}>
            <div className="page-grid">
              {filteredPages.map(page => (
                <PageCard key={page.id} page={page} onRefresh={loadPages} />
              ))}
            </div>
          </SectionPanel>
        )}
      </div>
    </div>
  )
}

function PageCard({ page, onRefresh }) {
  const navigate = useNavigate()

  const formatDate = (dateString) => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  return (
    <div
      className="page-card"
      onClick={() => navigate(`/website-builder/edit/${page.id}`)}
    >
      <div className="page-card-preview">
        <div className="page-card-preview-icon">
          {page.is_template ? <Layout size={28} /> : <FileText size={28} />}
        </div>
      </div>

      <div className="page-card-content">
        <div className="page-card-header">
          <h3 className="page-card-title">{page.title}</h3>
          <div className="page-card-slug">/{page.slug}</div>
        </div>

        <div className="page-card-meta">
          <div className={`status-badge status-${page.status}`}>
            {page.status}
          </div>
          {page.is_template && (
            <div className="status-badge status-template">
              <Sparkles size={10} />
              Template
            </div>
          )}
        </div>

        <div className="page-card-footer">
          <div className="page-card-date">
            Updated {formatDate(page.updated_at)}
          </div>
          <div className="page-card-actions">
            <Button
              variant="ghost"
              style={{ height: 28, fontSize: 12, padding: '0 8px' }}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/website-builder/edit/${page.id}`)
              }}
            >
              <Edit size={12} />
              Edit
            </Button>
            {page.status === 'published' && (
              <Button
                variant="ghost"
                style={{ height: 28, fontSize: 12, padding: '0 8px' }}
                onClick={(e) => {
                  e.stopPropagation()
                  window.open(`/${page.slug}`, '_blank')
                }}
              >
                <Eye size={12} />
                View
              </Button>
            )}
          </div>
        </div>
      </div>

      <NewPageModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSuccess={handleNewPageCreated}
      />
    </div>
  )
}
