/**
 * GrapesJS Configuration
 * Base configuration for the visual editor
 */

import 'grapesjs-preset-webpage'
import 'grapesjs-blocks-basic'
import registerComponents from './customComponents'
import registerBlocks from './customBlocks'

const grapesjsConfig = {
  // Height of the editor
  height: '100%',
  width: 'auto',

  // Storage Manager - DISABLED (we handle via Supabase)
  storageManager: false,

  // Asset Manager - DISABLED (we'll build custom)
  assetManager: {
    upload: false,
    multiUpload: false,
    embedAsBase64: false
  },

  // Canvas settings
  canvas: {
    styles: [],
    scripts: []
  },

  // Block Manager
  blockManager: {
    appendTo: '#blocks'
  },

  // Layer Manager
  layerManager: {
    appendTo: '#layers'
  },

  // Style Manager with responsive support
  styleManager: {
    appendTo: '#styles',
    sectors: [
      {
        name: 'Layout',
        open: false,
        buildProps: ['display', 'position', 'top', 'right', 'left', 'bottom', 'flex-direction', 'justify-content', 'align-items', 'gap']
      },
      {
        name: 'Dimension',
        open: true,
        buildProps: ['width', 'height', 'max-width', 'min-width', 'max-height', 'min-height', 'margin', 'padding']
      },
      {
        name: 'Typography',
        open: false,
        buildProps: ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'color', 'line-height', 'text-align', 'text-decoration', 'text-transform']
      },
      {
        name: 'Decorations',
        open: false,
        buildProps: ['background-color', 'background', 'background-image', 'background-size', 'background-position', 'border-radius', 'border', 'box-shadow', 'opacity']
      },
      {
        name: 'Extra',
        open: false,
        buildProps: ['transition', 'transform', 'cursor', 'overflow', 'overflow-x', 'overflow-y', 'z-index']
      }
    ]
  },

  // Trait Manager
  traitManager: {
    appendTo: '#traits'
  },

  // Selector Manager
  selectorManager: {
    appendTo: '#styles'
  },

  // Device Manager with responsive breakpoints
  deviceManager: {
    devices: [
      {
        id: 'desktop',
        name: 'Desktop',
        width: '', // Default, no media query
        priority: 1
      },
      {
        id: 'tablet',
        name: 'Tablet',
        width: '768px', // Canvas preview width
        widthMedia: '992px', // Max-width for media query
        priority: 2
      },
      {
        id: 'mobile',
        name: 'Mobile',
        width: '375px', // Canvas preview width
        widthMedia: '768px', // Max-width for media query
        priority: 3
      }
    ]
  },

  // Rich Text Editor
  richTextEditor: {
    actions: ['bold', 'italic', 'underline', 'strikethrough', 'link']
  },

  // Enable/Disable features
  noticeOnUnload: false,
  showOffsets: true,
  showOffsetsSelected: true,
  clearOnRender: false,
  avoidInlineStyle: false,

  // Plugins
  plugins: ['gjs-preset-webpage', 'gjs-blocks-basic'],
  pluginsOpts: {
    'gjs-preset-webpage': {
      modalImportTitle: 'Import Template',
      modalImportLabel: '<div style="margin-bottom: 10px; font-size: 13px;">Paste your HTML/CSS here</div>',
      modalImportContent: function(editor) {
        return editor.getHtml() + '<style>' + editor.getCss() + '</style>'
      },
      filestackOpts: null,
      aviaryOpts: false,
      blocksBasicOpts: { flexGrid: true },
      customStyleManager: []
    },
    'gjs-blocks-basic': {}
  },

  // Canvas configuration with responsive utility classes
  canvasCss: `
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    /* Responsive visibility utilities */
    @media (min-width: 992px) {
      .hide-on-desktop { display: none !important; }
    }
    @media (min-width: 768px) and (max-width: 991px) {
      .hide-on-tablet { display: none !important; }
    }
    @media (max-width: 767px) {
      .hide-on-mobile { display: none !important; }
    }
  `,

  // On load callback
  onLoad(editor) {
    // Register custom components
    registerComponents(editor)

    // Register custom blocks
    registerBlocks(editor)

    // Add custom commands for panels
    editor.Commands.add('show-layers', {
      run(editor) {
        const lm = editor.Panels.getPanel('views-container')
        if (lm) lm.set('visible', true)
      }
    })

    editor.Commands.add('show-styles', {
      run(editor) {
        const sm = editor.Panels.getPanel('views-container')
        if (sm) sm.set('visible', true)
      }
    })

    editor.Commands.add('show-traits', {
      run(editor) {
        const tm = editor.Panels.getPanel('views-container')
        if (tm) tm.set('visible', true)
      }
    })

    // Listen for device changes to update responsive indicator
    editor.on('device:select', () => {
      const device = editor.getDevice()
      const event = new CustomEvent('grapesjs:device-change', {
        detail: { device: device?.id || 'desktop' }
      })
      window.dispatchEvent(event)
    })

    // Add command to toggle element visibility for current device
    editor.Commands.add('toggle-device-visibility', {
      run(editor, sender, options = {}) {
        const selected = editor.getSelected()
        if (!selected) return

        const device = options.device || editor.getDevice()?.id || 'desktop'
        const currentClasses = selected.getClasses()
        const hideClass = `hide-on-${device}`

        if (currentClasses.includes(hideClass)) {
          selected.removeClass(hideClass)
        } else {
          selected.addClass(hideClass)
        }

        // Trigger re-render
        selected.trigger('change:classes')
      }
    })
  }
}

export default grapesjsConfig
