import { useState, useCallback } from 'react'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import slugify from 'slugify'

/**
 * Hook for managing website pages
 */
export default function usePages() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Create a new page
   */
  const createPage = useCallback(async (pageData) => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: createError } = await supabase
        .from('website_pages')
        .insert([{
          ...pageData,
          created_by_email: user?.email || 'unknown',
          created_by_name: user?.name || 'Unknown User',
          updated_by_email: user?.email || 'unknown',
          updated_by_name: user?.name || 'Unknown User'
        }])
        .select()
        .single()

      if (createError) throw createError

      return { data, error: null }
    } catch (err) {
      console.error('Failed to create page:', err)
      setError(err.message)
      return { data: null, error: err }
    } finally {
      setLoading(false)
    }
  }, [user])

  /**
   * Update an existing page
   */
  const updatePage = useCallback(async (id, updates) => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: updateError } = await supabase
        .from('website_pages')
        .update({
          ...updates,
          updated_by_email: user?.email || 'unknown',
          updated_by_name: user?.name || 'Unknown User',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      return { data, error: null }
    } catch (err) {
      console.error('Failed to update page:', err)
      setError(err.message)
      return { data: null, error: err }
    } finally {
      setLoading(false)
    }
  }, [user])

  /**
   * Delete a page
   */
  const deletePage = useCallback(async (id) => {
    try {
      setLoading(true)
      setError(null)

      const { error: deleteError } = await supabase
        .from('website_pages')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      return { error: null }
    } catch (err) {
      console.error('Failed to delete page:', err)
      setError(err.message)
      return { error: err }
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Get all pages
   */
  const getPages = useCallback(async (filters = {}) => {
    try {
      setLoading(true)
      setError(null)

      let query = supabase
        .from('website_pages')
        .select('*')
        .order('updated_at', { ascending: false })

      if (filters.status) {
        query = query.eq('status', filters.status)
      }

      if (filters.is_template !== undefined) {
        query = query.eq('is_template', filters.is_template)
      }

      if (filters.category) {
        query = query.eq('category', filters.category)
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError

      return { data: data || [], error: null }
    } catch (err) {
      console.error('Failed to fetch pages:', err)
      setError(err.message)
      return { data: [], error: err }
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Get a single page by ID
   */
  const getPage = useCallback(async (id) => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('website_pages')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      return { data, error: null }
    } catch (err) {
      console.error('Failed to fetch page:', err)
      setError(err.message)
      return { data: null, error: err }
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Get a page by slug
   */
  const getPageBySlug = useCallback(async (slug) => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('website_pages')
        .select('*')
        .eq('slug', slug)
        .single()

      if (fetchError) throw fetchError

      return { data, error: null }
    } catch (err) {
      console.error('Failed to fetch page by slug:', err)
      setError(err.message)
      return { data: null, error: err }
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Publish a page
   */
  const publishPage = useCallback(async (id) => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: publishError } = await supabase
        .from('website_pages')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          updated_by_email: user?.email || 'unknown',
          updated_by_name: user?.name || 'Unknown User',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (publishError) throw publishError

      return { data, error: null }
    } catch (err) {
      console.error('Failed to publish page:', err)
      setError(err.message)
      return { data: null, error: err }
    } finally {
      setLoading(false)
    }
  }, [user])

  /**
   * Unpublish a page
   */
  const unpublishPage = useCallback(async (id) => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: unpublishError } = await supabase
        .from('website_pages')
        .update({
          status: 'draft',
          updated_by_email: user?.email || 'unknown',
          updated_by_name: user?.name || 'Unknown User',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (unpublishError) throw unpublishError

      return { data, error: null }
    } catch (err) {
      console.error('Failed to unpublish page:', err)
      setError(err.message)
      return { data: null, error: err }
    } finally {
      setLoading(false)
    }
  }, [user])

  /**
   * Duplicate a page
   */
  const duplicatePage = useCallback(async (id) => {
    try {
      setLoading(true)
      setError(null)

      // Get the original page
      const { data: originalPage, error: fetchError } = await supabase
        .from('website_pages')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      // Create a new page with copied content
      const { data, error: createError } = await supabase
        .from('website_pages')
        .insert([{
          title: `${originalPage.title} (Copy)`,
          slug: `${originalPage.slug}-copy-${Date.now()}`,
          content: originalPage.content,
          meta_description: originalPage.meta_description,
          meta_keywords: originalPage.meta_keywords,
          category: originalPage.category,
          tags: originalPage.tags,
          settings: originalPage.settings,
          status: 'draft',
          created_by_email: user?.email || 'unknown',
          created_by_name: user?.name || 'Unknown User',
          updated_by_email: user?.email || 'unknown',
          updated_by_name: user?.name || 'Unknown User'
        }])
        .select()
        .single()

      if (createError) throw createError

      return { data, error: null }
    } catch (err) {
      console.error('Failed to duplicate page:', err)
      setError(err.message)
      return { data: null, error: err }
    } finally {
      setLoading(false)
    }
  }, [user])

  /**
   * Generate slug from title
   */
  const generateSlug = useCallback((title) => {
    return slugify(title, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g
    })
  }, [])

  /**
   * Check if slug is available
   */
  const isSlugAvailable = useCallback(async (slug, excludeId = null) => {
    try {
      let query = supabase
        .from('website_pages')
        .select('id')
        .eq('slug', slug)

      if (excludeId) {
        query = query.neq('id', excludeId)
      }

      const { data, error } = await query

      if (error) throw error

      return { available: data.length === 0, error: null }
    } catch (err) {
      console.error('Failed to check slug availability:', err)
      return { available: false, error: err }
    }
  }, [])

  return {
    loading,
    error,
    createPage,
    updatePage,
    deletePage,
    getPages,
    getPage,
    getPageBySlug,
    publishPage,
    unpublishPage,
    duplicatePage,
    generateSlug,
    isSlugAvailable
  }
}
