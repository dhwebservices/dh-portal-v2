import { useEffect, useRef, useCallback } from 'react'
import { debounce } from 'lodash'
import usePages from './usePages'

/**
 * Auto-save hook for editor
 * Debounces saves to prevent excessive database writes
 */
export default function useAutoSave(pageId, getEditorContent, enabled = true) {
  const { updatePage } = usePages()
  const lastSavedRef = useRef(null)
  const saveTimeoutRef = useRef(null)

  const saveContent = useCallback(async () => {
    if (!pageId || !getEditorContent || !enabled) return

    try {
      const content = getEditorContent()
      if (!content) return

      // Don't save if content hasn't changed
      const contentString = JSON.stringify(content)
      if (contentString === lastSavedRef.current) {
        return
      }

      await updatePage(pageId, { content })
      lastSavedRef.current = contentString

      return true
    } catch (err) {
      console.error('Auto-save failed:', err)
      return false
    }
  }, [pageId, getEditorContent, updatePage, enabled])

  // Debounced save function (30 seconds)
  const debouncedSave = useRef(
    debounce(saveContent, 30000)
  ).current

  // Trigger save on content change
  const triggerSave = useCallback(() => {
    if (enabled) {
      debouncedSave()
    }
  }, [debouncedSave, enabled])

  // Manual save
  const saveNow = useCallback(async () => {
    debouncedSave.cancel()
    return await saveContent()
  }, [saveContent, debouncedSave])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel()
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [debouncedSave])

  return {
    triggerSave,
    saveNow
  }
}
