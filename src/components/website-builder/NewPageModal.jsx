import { useState, useEffect } from 'react'
import { X, FileText, Sparkles } from '../../utils/lucide'
import { Modal } from '../Modal'
import usePages from '../../hooks/website-builder/usePages'

export default function NewPageModal({ isOpen, onClose, onSuccess }) {
  const { createPage, generateSlug, isSlugAvailable, loading } = usePages()
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    category: ''
  })
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [slugError, setSlugError] = useState('')
  const [creating, setCreating] = useState(false)

  // Auto-generate slug from title
  useEffect(() => {
    if (!slugManuallyEdited && formData.title) {
      setFormData(prev => ({
        ...prev,
        slug: generateSlug(formData.title)
      }))
    }
  }, [formData.title, slugManuallyEdited, generateSlug])

  // Validate slug
  useEffect(() => {
    if (formData.slug) {
      const checkSlug = async () => {
        const { available } = await isSlugAvailable(formData.slug)
        if (!available) {
          setSlugError('This URL is already in use')
        } else {
          setSlugError('')
        }
      }
      const timer = setTimeout(checkSlug, 300)
      return () => clearTimeout(timer)
    }
  }, [formData.slug, isSlugAvailable])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.title || !formData.slug) {
      return
    }

    if (slugError) {
      return
    }

    setCreating(true)

    try {
      const { data, error } = await createPage({
        title: formData.title,
        slug: formData.slug,
        category: formData.category || null,
        content: {},
        status: 'draft'
      })

      if (error) {
        console.error('Failed to create page:', error)
        return
      }

      onSuccess(data)
      handleClose()
    } catch (err) {
      console.error('Error creating page:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleClose = () => {
    setFormData({ title: '', slug: '', category: '' })
    setSlugManuallyEdited(false)
    setSlugError('')
    setCreating(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create New Page">
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          <div className="fg">
            <label className="lbl">
              Page Title *
            </label>
            <input
              type="text"
              className="inp"
              placeholder="About Us"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              autoFocus
              required
            />
          </div>

          <div className="fg">
            <label className="lbl">
              URL Slug *
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--sub)', fontSize: 14 }}>/</span>
              <input
                type="text"
                className="inp"
                placeholder="about-us"
                value={formData.slug}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, slug: e.target.value }))
                  setSlugManuallyEdited(true)
                }}
                required
                pattern="[a-z0-9-]+"
              />
            </div>
            {slugError && (
              <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>
                {slugError}
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4 }}>
              Only lowercase letters, numbers, and hyphens
            </div>
          </div>

          <div className="fg">
            <label className="lbl">
              Category (Optional)
            </label>
            <select
              className="inp"
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
            >
              <option value="">None</option>
              <option value="homepage">Homepage</option>
              <option value="about">About</option>
              <option value="services">Services</option>
              <option value="products">Products</option>
              <option value="blog">Blog</option>
              <option value="contact">Contact</option>
              <option value="legal">Legal</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn"
            onClick={handleClose}
            disabled={creating}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={creating || !formData.title || !formData.slug || !!slugError}
          >
            {creating ? 'Creating...' : 'Create Page'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
