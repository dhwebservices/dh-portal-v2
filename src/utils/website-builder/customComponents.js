/**
 * Custom GrapesJS Components
 * Defines the 5 core components with traits and styles
 */

export default function registerComponents(editor) {
  const domc = editor.DomComponents

  // 1. CONTAINER Component
  domc.addType('container', {
    model: {
      defaults: {
        tagName: 'div',
        name: 'Container',
        draggable: true,
        droppable: true,
        attributes: { class: 'container' },
        styles: `
          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
          }
        `,
        traits: [
          {
            type: 'select',
            label: 'Width',
            name: 'data-width',
            options: [
              { value: 'sm', name: 'Small (640px)' },
              { value: 'md', name: 'Medium (768px)' },
              { value: 'lg', name: 'Large (1024px)' },
              { value: 'xl', name: 'Extra Large (1280px)' },
              { value: 'full', name: 'Full Width' }
            ],
            changeProp: 1
          },
          {
            type: 'checkbox',
            label: 'Center Content',
            name: 'data-center',
            changeProp: 1
          }
        ]
      },
      init() {
        this.on('change:attributes:data-width', this.updateWidth)
        this.on('change:attributes:data-center', this.updateCenter)
      },
      updateWidth() {
        const width = this.getAttributes()['data-width']
        const widthMap = {
          sm: '640px',
          md: '768px',
          lg: '1024px',
          xl: '1280px',
          full: '100%'
        }
        this.setStyle({ 'max-width': widthMap[width] || '1200px' })
      },
      updateCenter() {
        const center = this.getAttributes()['data-center']
        if (center) {
          this.setStyle({ 'margin-left': 'auto', 'margin-right': 'auto' })
        }
      }
    }
  })

  // 2. HEADING Component
  domc.addType('heading', {
    model: {
      defaults: {
        tagName: 'h2',
        name: 'Heading',
        draggable: true,
        droppable: false,
        content: 'Heading Text',
        attributes: { class: 'heading' },
        styles: `
          .heading {
            font-family: var(--font-display, 'Poppins', sans-serif);
            font-weight: 600;
            color: #1a1a1a;
            line-height: 1.2;
            margin: 0 0 16px 0;
          }
        `,
        traits: [
          {
            type: 'select',
            label: 'Level',
            name: 'tagName',
            options: [
              { value: 'h1', name: 'H1' },
              { value: 'h2', name: 'H2' },
              { value: 'h3', name: 'H3' },
              { value: 'h4', name: 'H4' },
              { value: 'h5', name: 'H5' },
              { value: 'h6', name: 'H6' }
            ],
            changeProp: 1
          },
          {
            type: 'select',
            label: 'Align',
            name: 'data-align',
            options: [
              { value: 'left', name: 'Left' },
              { value: 'center', name: 'Center' },
              { value: 'right', name: 'Right' }
            ],
            changeProp: 1
          }
        ]
      },
      init() {
        this.on('change:attributes:data-align', this.updateAlign)
      },
      updateAlign() {
        const align = this.getAttributes()['data-align']
        this.setStyle({ 'text-align': align || 'left' })
      }
    }
  })

  // 3. PARAGRAPH Component
  domc.addType('paragraph', {
    model: {
      defaults: {
        tagName: 'p',
        name: 'Paragraph',
        draggable: true,
        droppable: false,
        content: 'This is a paragraph. Click to edit the text.',
        attributes: { class: 'paragraph' },
        styles: `
          .paragraph {
            font-family: var(--font-body, 'Inter', sans-serif);
            font-size: 16px;
            line-height: 1.6;
            color: #333;
            margin: 0 0 16px 0;
          }
        `,
        traits: [
          {
            type: 'select',
            label: 'Size',
            name: 'data-size',
            options: [
              { value: 'sm', name: 'Small' },
              { value: 'md', name: 'Medium' },
              { value: 'lg', name: 'Large' }
            ],
            changeProp: 1
          },
          {
            type: 'select',
            label: 'Align',
            name: 'data-align',
            options: [
              { value: 'left', name: 'Left' },
              { value: 'center', name: 'Center' },
              { value: 'right', name: 'Right' },
              { value: 'justify', name: 'Justify' }
            ],
            changeProp: 1
          }
        ]
      },
      init() {
        this.on('change:attributes:data-size', this.updateSize)
        this.on('change:attributes:data-align', this.updateAlign)
      },
      updateSize() {
        const size = this.getAttributes()['data-size']
        const sizeMap = {
          sm: '14px',
          md: '16px',
          lg: '18px'
        }
        this.setStyle({ 'font-size': sizeMap[size] || '16px' })
      },
      updateAlign() {
        const align = this.getAttributes()['data-align']
        this.setStyle({ 'text-align': align || 'left' })
      }
    }
  })

  // 4. IMAGE Component
  domc.addType('image', {
    model: {
      defaults: {
        tagName: 'img',
        name: 'Image',
        draggable: true,
        droppable: false,
        attributes: {
          class: 'image',
          src: 'https://via.placeholder.com/800x400?text=Click+to+change+image',
          alt: 'Image description'
        },
        styles: `
          .image {
            max-width: 100%;
            height: auto;
            display: block;
            border-radius: 8px;
          }
        `,
        traits: [
          {
            type: 'text',
            label: 'Source',
            name: 'src',
            placeholder: 'https://example.com/image.jpg'
          },
          {
            type: 'text',
            label: 'Alt Text',
            name: 'alt',
            placeholder: 'Describe the image'
          },
          {
            type: 'select',
            label: 'Object Fit',
            name: 'data-fit',
            options: [
              { value: 'cover', name: 'Cover' },
              { value: 'contain', name: 'Contain' },
              { value: 'fill', name: 'Fill' },
              { value: 'none', name: 'None' }
            ],
            changeProp: 1
          },
          {
            type: 'number',
            label: 'Border Radius',
            name: 'data-radius',
            min: 0,
            max: 50,
            changeProp: 1
          }
        ]
      },
      init() {
        this.on('change:attributes:data-fit', this.updateFit)
        this.on('change:attributes:data-radius', this.updateRadius)
      },
      updateFit() {
        const fit = this.getAttributes()['data-fit']
        this.setStyle({ 'object-fit': fit || 'cover' })
      },
      updateRadius() {
        const radius = this.getAttributes()['data-radius']
        this.setStyle({ 'border-radius': radius ? `${radius}px` : '8px' })
      }
    }
  })

  // 5. BUTTON Component
  domc.addType('button', {
    model: {
      defaults: {
        tagName: 'a',
        name: 'Button',
        draggable: true,
        droppable: false,
        content: 'Click Me',
        attributes: {
          class: 'button',
          href: '#',
          role: 'button'
        },
        styles: `
          .button {
            display: inline-block;
            padding: 12px 24px;
            background: #b8960c;
            color: #ffffff;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.2s;
            cursor: pointer;
            border: none;
          }
          .button:hover {
            background: #a08509;
            transform: translateY(-1px);
          }
        `,
        traits: [
          {
            type: 'text',
            label: 'Link URL',
            name: 'href',
            placeholder: 'https://example.com'
          },
          {
            type: 'select',
            label: 'Target',
            name: 'target',
            options: [
              { value: '_self', name: 'Same Window' },
              { value: '_blank', name: 'New Window' }
            ]
          },
          {
            type: 'select',
            label: 'Style',
            name: 'data-style',
            options: [
              { value: 'primary', name: 'Primary' },
              { value: 'secondary', name: 'Secondary' },
              { value: 'outline', name: 'Outline' }
            ],
            changeProp: 1
          },
          {
            type: 'select',
            label: 'Size',
            name: 'data-size',
            options: [
              { value: 'sm', name: 'Small' },
              { value: 'md', name: 'Medium' },
              { value: 'lg', name: 'Large' }
            ],
            changeProp: 1
          }
        ]
      },
      init() {
        this.on('change:attributes:data-style', this.updateStyle)
        this.on('change:attributes:data-size', this.updateSize)
      },
      updateStyle() {
        const style = this.getAttributes()['data-style']
        const styleMap = {
          primary: {
            background: '#b8960c',
            color: '#ffffff',
            border: 'none'
          },
          secondary: {
            background: '#1a1612',
            color: '#ffffff',
            border: 'none'
          },
          outline: {
            background: 'transparent',
            color: '#b8960c',
            border: '2px solid #b8960c'
          }
        }
        const styles = styleMap[style] || styleMap.primary
        this.setStyle(styles)
      },
      updateSize() {
        const size = this.getAttributes()['data-size']
        const sizeMap = {
          sm: { padding: '8px 16px', 'font-size': '12px' },
          md: { padding: '12px 24px', 'font-size': '14px' },
          lg: { padding: '16px 32px', 'font-size': '16px' }
        }
        const styles = sizeMap[size] || sizeMap.md
        this.setStyle(styles)
      }
    }
  })
}
