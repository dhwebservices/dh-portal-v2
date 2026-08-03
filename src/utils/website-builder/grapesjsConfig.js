/**
 * GrapesJS Configuration
 * Base configuration for the visual editor
 */

const grapesjsConfig = {
  // Height of the editor
  height: '100%',
  width: 'auto',

  // Storage Manager - DISABLED (we'll handle manually via Supabase)
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

  // Panels configuration
  panels: {
    defaults: [
      {
        id: 'panel-devices',
        el: '.panel__devices',
        buttons: [
          {
            id: 'device-desktop',
            label: '<i class="fa fa-desktop"></i>',
            command: 'set-device-desktop',
            active: true,
            togglable: false
          },
          {
            id: 'device-tablet',
            label: '<i class="fa fa-tablet"></i>',
            command: 'set-device-tablet',
            togglable: false
          },
          {
            id: 'device-mobile',
            label: '<i class="fa fa-mobile"></i>',
            command: 'set-device-mobile',
            togglable: false
          }
        ]
      },
      {
        id: 'panel-switcher',
        el: '.panel__switcher',
        buttons: [
          {
            id: 'show-layers',
            active: true,
            label: '<i class="fa fa-bars"></i>',
            command: 'show-layers',
            togglable: false
          },
          {
            id: 'show-style',
            active: true,
            label: '<i class="fa fa-paint-brush"></i>',
            command: 'show-styles',
            togglable: false
          },
          {
            id: 'show-traits',
            active: true,
            label: '<i class="fa fa-cog"></i>',
            command: 'show-traits',
            togglable: false
          }
        ]
      }
    ]
  },

  // Layer Manager
  layerManager: {
    appendTo: '.layers-container'
  },

  // Block Manager
  blockManager: {
    appendTo: '.blocks-container',
    blocks: []  // Will add custom blocks later
  },

  // Style Manager
  styleManager: {
    appendTo: '.styles-container',
    sectors: [
      {
        name: 'General',
        open: false,
        buildProps: ['float', 'display', 'position', 'top', 'right', 'left', 'bottom']
      },
      {
        name: 'Dimension',
        open: false,
        buildProps: ['width', 'height', 'max-width', 'min-height', 'margin', 'padding']
      },
      {
        name: 'Typography',
        open: false,
        buildProps: ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'color', 'line-height', 'text-align', 'text-shadow']
      },
      {
        name: 'Decorations',
        open: false,
        buildProps: ['border-radius', 'background-color', 'border', 'box-shadow', 'background']
      },
      {
        name: 'Extra',
        open: false,
        buildProps: ['transition', 'perspective', 'transform']
      }
    ]
  },

  // Trait Manager
  traitManager: {
    appendTo: '.traits-container'
  },

  // Selector Manager
  selectorManager: {
    appendTo: '.styles-container'
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
  noticeOnUnload: false,  // We'll handle unsaved changes ourselves
  showOffsets: true,
  showOffsetsSelected: true,
  clearOnRender: false,
  avoidInlineStyle: false,

  // Plugins - Will add in future weeks
  plugins: [],
  pluginsOpts: {}
}

export default grapesjsConfig
