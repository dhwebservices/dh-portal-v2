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

  // Style Manager
  styleManager: {
    appendTo: '#styles',
    sectors: [
      {
        name: 'Layout',
        open: false,
        buildProps: ['display', 'position', 'top', 'right', 'left', 'bottom', 'flex-direction', 'justify-content', 'align-items']
      },
      {
        name: 'Dimension',
        open: true,
        buildProps: ['width', 'height', 'max-width', 'min-height', 'margin', 'padding']
      },
      {
        name: 'Typography',
        open: false,
        buildProps: ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'color', 'line-height', 'text-align', 'text-decoration', 'text-transform']
      },
      {
        name: 'Decorations',
        open: false,
        buildProps: ['background-color', 'background', 'border-radius', 'border', 'box-shadow', 'opacity']
      },
      {
        name: 'Extra',
        open: false,
        buildProps: ['transition', 'transform', 'cursor', 'overflow']
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

  // Device Manager
  deviceManager: {
    devices: [
      {
        id: 'desktop',
        name: 'Desktop',
        width: ''
      },
      {
        id: 'tablet',
        name: 'Tablet',
        width: '768px',
        widthMedia: '992px'
      },
      {
        id: 'mobile',
        name: 'Mobile',
        width: '375px',
        widthMedia: '768px'
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

  // Canvas configuration
  canvasCss: `
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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
  }
}

export default grapesjsConfig
