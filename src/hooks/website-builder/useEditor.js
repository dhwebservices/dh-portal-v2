import { useEffect, useRef, useState } from 'react'
import grapesjs from 'grapesjs'
import grapesjsConfig from '../../utils/website-builder/grapesjsConfig'

/**
 * Custom hook to manage GrapesJS editor instance
 * @param {string} containerId - ID of the container element
 * @param {object} options - Additional GrapesJS options
 * @returns {object} Editor instance and utilities
 */
export default function useEditor(containerId, options = {}) {
  const editorRef = useRef(null)
  const [isReady, setIsReady] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    // Initialize GrapesJS
    const editor = grapesjs.init({
      container: `#${containerId}`,
      ...grapesjsConfig,
      ...options
    })

    editorRef.current = editor

    // Event listeners
    editor.on('load', () => {
      console.log('GrapesJS loaded')
      setIsReady(true)
    })

    editor.on('change:changesCount', () => {
      setHasChanges(true)
    })

    editor.on('storage:start:store', () => {
      console.log('Saving...')
    })

    editor.on('storage:end:store', () => {
      console.log('Saved!')
      setHasChanges(false)
    })

    editor.on('storage:error:store', (err) => {
      console.error('Save error:', err)
    })

    // Cleanup on unmount
    return () => {
      if (editorRef.current) {
        editorRef.current.destroy()
        editorRef.current = null
      }
    }
  }, [containerId, options])

  /**
   * Get the current HTML content
   */
  const getHtml = () => {
    if (!editorRef.current) return ''
    return editorRef.current.getHtml()
  }

  /**
   * Get the current CSS
   */
  const getCss = () => {
    if (!editorRef.current) return ''
    return editorRef.current.getCss()
  }

  /**
   * Get the full project data (components + styles)
   */
  const getProjectData = () => {
    if (!editorRef.current) return null
    return editorRef.current.getProjectData()
  }

  /**
   * Load project data into the editor
   */
  const loadProjectData = (data) => {
    if (!editorRef.current) return
    editorRef.current.loadProjectData(data)
  }

  /**
   * Get JSON representation of the page
   */
  const getJson = () => {
    if (!editorRef.current) return null

    const components = editorRef.current.getComponents()
    const styles = editorRef.current.getStyle()

    return {
      html: editorRef.current.getHtml(),
      css: editorRef.current.getCss(),
      components: components,
      styles: styles
    }
  }

  /**
   * Load content from JSON
   */
  const loadJson = (json) => {
    if (!editorRef.current || !json) return

    if (json.components) {
      editorRef.current.setComponents(json.components)
    }
    if (json.styles) {
      editorRef.current.setStyle(json.styles)
    }
  }

  /**
   * Clear the canvas
   */
  const clear = () => {
    if (!editorRef.current) return
    editorRef.current.DomComponents.clear()
    editorRef.current.CssComposer.clear()
  }

  /**
   * Run a command
   */
  const runCommand = (commandName, options) => {
    if (!editorRef.current) return
    editorRef.current.runCommand(commandName, options)
  }

  /**
   * Stop a command
   */
  const stopCommand = (commandName) => {
    if (!editorRef.current) return
    editorRef.current.stopCommand(commandName)
  }

  /**
   * Set device (responsive preview)
   */
  const setDevice = (deviceName) => {
    if (!editorRef.current) return
    editorRef.current.setDevice(deviceName)
  }

  return {
    editor: editorRef.current,
    isReady,
    hasChanges,
    getHtml,
    getCss,
    getProjectData,
    loadProjectData,
    getJson,
    loadJson,
    clear,
    runCommand,
    stopCommand,
    setDevice
  }
}
