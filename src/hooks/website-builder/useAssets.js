import { useState, useCallback } from 'react'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import imageCompression from 'browser-image-compression'

/**
 * Hook for managing website assets (images, videos, files)
 */
export default function useAssets() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Upload asset with optimization
   */
  const uploadAsset = useCallback(async (file, options = {}) => {
    try {
      setUploading(true)
      setError(null)

      const { folder = '', optimize = true } = options

      // Validate file
      if (!file) throw new Error('No file provided')

      const maxSize = file.type.startsWith('image/') ? 10 * 1024 * 1024 : 100 * 1024 * 1024
      if (file.size > maxSize) {
        throw new Error(`File too large. Max size: ${maxSize / 1024 / 1024}MB`)
      }

      // Determine file type
      let fileType = 'other'
      if (file.type.startsWith('image/')) fileType = 'image'
      else if (file.type.startsWith('video/')) fileType = 'video'
      else if (file.type === 'application/pdf') fileType = 'document'

      let processedFile = file
      let originalSize = file.size

      // Optimize images
      if (fileType === 'image' && optimize && !file.type.includes('svg')) {
        try {
          processedFile = await imageCompression(file, {
            maxSizeMB: 2,
            maxWidthOrHeight: 1920,
            useWebWorker: true
          })
        } catch (err) {
          console.warn('Image optimization failed, using original:', err)
          processedFile = file
        }
      }

      // Generate unique filename
      const timestamp = Date.now()
      const randomStr = Math.random().toString(36).substring(2, 8)
      const fileExt = file.name.split('.').pop()
      const baseName = file.name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '-')
      const filename = `${baseName}-${timestamp}-${randomStr}.${fileExt}`
      const storagePath = folder ? `${folder}/${filename}` : filename

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('website-assets')
        .upload(storagePath, processedFile, {
          contentType: file.type,
          upsert: false
        })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('website-assets')
        .getPublicUrl(storagePath)

      // Get image dimensions if it's an image
      let width = null
      let height = null
      if (fileType === 'image') {
        try {
          const dimensions = await getImageDimensions(URL.createObjectURL(processedFile))
          width = dimensions.width
          height = dimensions.height
        } catch (err) {
          console.warn('Failed to get image dimensions:', err)
        }
      }

      // Create asset record in database
      const { data: asset, error: dbError } = await supabase
        .from('website_assets')
        .insert([{
          filename,
          original_filename: file.name,
          file_type: fileType,
          mime_type: file.type,
          file_extension: fileExt,
          storage_url: publicUrl,
          storage_path: storagePath,
          storage_provider: 'supabase',
          file_size_bytes: processedFile.size,
          original_size_bytes: originalSize,
          width,
          height,
          folder,
          optimized: optimize && fileType === 'image' && processedFile.size < originalSize,
          uploaded_by_email: user?.email || 'unknown',
          uploaded_by_name: user?.name || 'Unknown User'
        }])
        .select()
        .single()

      if (dbError) throw dbError

      return { data: asset, error: null }
    } catch (err) {
      console.error('Upload failed:', err)
      setError(err.message)
      return { data: null, error: err }
    } finally {
      setUploading(false)
    }
  }, [user])

  /**
   * Upload multiple assets
   */
  const uploadMultipleAssets = useCallback(async (files, options = {}) => {
    const results = []
    for (const file of files) {
      const result = await uploadAsset(file, options)
      results.push(result)
    }
    return results
  }, [uploadAsset])

  /**
   * Get all assets
   */
  const getAssets = useCallback(async (filters = {}) => {
    try {
      setLoading(true)
      setError(null)

      let query = supabase
        .from('website_assets')
        .select('*')
        .order('created_at', { ascending: false })

      if (filters.file_type) {
        query = query.eq('file_type', filters.file_type)
      }

      if (filters.folder !== undefined) {
        if (filters.folder === null || filters.folder === '') {
          query = query.or('folder.is.null,folder.eq.')
        } else {
          query = query.eq('folder', filters.folder)
        }
      }

      if (filters.search) {
        query = query.or(`filename.ilike.%${filters.search}%,original_filename.ilike.%${filters.search}%`)
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError

      return { data: data || [], error: null }
    } catch (err) {
      console.error('Failed to fetch assets:', err)
      setError(err.message)
      return { data: [], error: err }
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Get asset by ID
   */
  const getAsset = useCallback(async (id) => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('website_assets')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      return { data, error: null }
    } catch (err) {
      console.error('Failed to fetch asset:', err)
      setError(err.message)
      return { data: null, error: err }
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Delete asset
   */
  const deleteAsset = useCallback(async (id) => {
    try {
      setLoading(true)
      setError(null)

      // Get asset to find storage path
      const { data: asset } = await supabase
        .from('website_assets')
        .select('storage_path')
        .eq('id', id)
        .single()

      if (!asset) throw new Error('Asset not found')

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('website-assets')
        .remove([asset.storage_path])

      if (storageError) console.warn('Failed to delete from storage:', storageError)

      // Delete from database
      const { error: dbError } = await supabase
        .from('website_assets')
        .delete()
        .eq('id', id)

      if (dbError) throw dbError

      return { error: null }
    } catch (err) {
      console.error('Failed to delete asset:', err)
      setError(err.message)
      return { error: err }
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Update asset metadata
   */
  const updateAsset = useCallback(async (id, updates) => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: updateError } = await supabase
        .from('website_assets')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      return { data, error: null }
    } catch (err) {
      console.error('Failed to update asset:', err)
      setError(err.message)
      return { data: null, error: err }
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Get unique folders
   */
  const getFolders = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('website_assets')
        .select('folder')

      if (fetchError) throw fetchError

      const folders = [...new Set(data.map(a => a.folder).filter(Boolean))]
      return { data: folders, error: null }
    } catch (err) {
      console.error('Failed to fetch folders:', err)
      return { data: [], error: err }
    }
  }, [])

  return {
    loading,
    uploading,
    error,
    uploadAsset,
    uploadMultipleAssets,
    getAssets,
    getAsset,
    deleteAsset,
    updateAsset,
    getFolders
  }
}

/**
 * Get image dimensions from file
 */
function getImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
      URL.revokeObjectURL(src)
    }
    img.onerror = reject
    img.src = src
  })
}
