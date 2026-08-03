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

  // 6. CARD Component
  domc.addType('card', {
    model: {
      defaults: {
        tagName: 'div',
        name: 'Card',
        draggable: true,
        droppable: true,
        attributes: { class: 'card' },
        styles: `
          .card {
            background: white;
            border: 1px solid #e5e5e5;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            transition: all 0.2s;
          }
          .card:hover {
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
            transform: translateY(-2px);
          }
        `,
        content: '<h3>Card Title</h3><p>Card content goes here.</p>',
        traits: [
          {
            type: 'checkbox',
            label: 'Hover Effect',
            name: 'data-hover',
            changeProp: 1
          }
        ]
      }
    }
  })

  // 7. GRID Component (CSS Grid)
  domc.addType('grid', {
    model: {
      defaults: {
        tagName: 'div',
        name: 'Grid',
        draggable: true,
        droppable: true,
        attributes: { class: 'grid' },
        styles: `
          .grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
          }
        `,
        traits: [
          {
            type: 'number',
            label: 'Columns',
            name: 'data-columns',
            min: 1,
            max: 12,
            changeProp: 1
          },
          {
            type: 'number',
            label: 'Gap (px)',
            name: 'data-gap',
            min: 0,
            max: 100,
            changeProp: 1
          }
        ]
      },
      init() {
        this.on('change:attributes:data-columns', this.updateColumns)
        this.on('change:attributes:data-gap', this.updateGap)
      },
      updateColumns() {
        const cols = this.getAttributes()['data-columns'] || 3
        this.setStyle({ 'grid-template-columns': `repeat(${cols}, 1fr)` })
      },
      updateGap() {
        const gap = this.getAttributes()['data-gap'] || 20
        this.setStyle({ gap: `${gap}px` })
      }
    }
  })

  // 8. FLEXBOX Component
  domc.addType('flexbox', {
    model: {
      defaults: {
        tagName: 'div',
        name: 'Flexbox',
        draggable: true,
        droppable: true,
        attributes: { class: 'flexbox' },
        styles: `
          .flexbox {
            display: flex;
            gap: 16px;
          }
        `,
        traits: [
          {
            type: 'select',
            label: 'Direction',
            name: 'data-direction',
            options: [
              { value: 'row', name: 'Row' },
              { value: 'column', name: 'Column' }
            ],
            changeProp: 1
          },
          {
            type: 'select',
            label: 'Justify',
            name: 'data-justify',
            options: [
              { value: 'flex-start', name: 'Start' },
              { value: 'center', name: 'Center' },
              { value: 'flex-end', name: 'End' },
              { value: 'space-between', name: 'Space Between' },
              { value: 'space-around', name: 'Space Around' }
            ],
            changeProp: 1
          },
          {
            type: 'select',
            label: 'Align',
            name: 'data-align',
            options: [
              { value: 'flex-start', name: 'Start' },
              { value: 'center', name: 'Center' },
              { value: 'flex-end', name: 'End' },
              { value: 'stretch', name: 'Stretch' }
            ],
            changeProp: 1
          }
        ]
      },
      init() {
        this.on('change:attributes:data-direction', this.updateDirection)
        this.on('change:attributes:data-justify', this.updateJustify)
        this.on('change:attributes:data-align', this.updateAlign)
      },
      updateDirection() {
        const dir = this.getAttributes()['data-direction'] || 'row'
        this.setStyle({ 'flex-direction': dir })
      },
      updateJustify() {
        const justify = this.getAttributes()['data-justify']
        if (justify) this.setStyle({ 'justify-content': justify })
      },
      updateAlign() {
        const align = this.getAttributes()['data-align']
        if (align) this.setStyle({ 'align-items': align })
      }
    }
  })

  // 9. SPACER Component
  domc.addType('spacer', {
    model: {
      defaults: {
        tagName: 'div',
        name: 'Spacer',
        draggable: true,
        droppable: false,
        attributes: { class: 'spacer' },
        styles: `
          .spacer {
            height: 40px;
          }
        `,
        traits: [
          {
            type: 'number',
            label: 'Height (px)',
            name: 'data-height',
            min: 0,
            max: 200,
            changeProp: 1
          }
        ]
      },
      init() {
        this.on('change:attributes:data-height', this.updateHeight)
      },
      updateHeight() {
        const height = this.getAttributes()['data-height'] || 40
        this.setStyle({ height: `${height}px` })
      }
    }
  })

  // 10. DIVIDER Component
  domc.addType('divider', {
    model: {
      defaults: {
        tagName: 'hr',
        name: 'Divider',
        draggable: true,
        droppable: false,
        attributes: { class: 'divider' },
        styles: `
          .divider {
            border: none;
            border-top: 1px solid #e5e5e5;
            margin: 24px 0;
          }
        `,
        traits: [
          {
            type: 'select',
            label: 'Style',
            name: 'data-style',
            options: [
              { value: 'solid', name: 'Solid' },
              { value: 'dashed', name: 'Dashed' },
              { value: 'dotted', name: 'Dotted' }
            ],
            changeProp: 1
          }
        ]
      },
      init() {
        this.on('change:attributes:data-style', this.updateStyle)
      },
      updateStyle() {
        const style = this.getAttributes()['data-style'] || 'solid'
        this.setStyle({ 'border-top-style': style })
      }
    }
  })

  // 11. LIST Component
  domc.addType('list', {
    model: {
      defaults: {
        tagName: 'ul',
        name: 'List',
        draggable: true,
        droppable: true,
        content: '<li>List item 1</li><li>List item 2</li><li>List item 3</li>',
        styles: `
          ul, ol {
            padding-left: 24px;
            line-height: 1.8;
          }
          li {
            margin-bottom: 8px;
          }
        `,
        traits: [
          {
            type: 'select',
            label: 'Type',
            name: 'tagName',
            options: [
              { value: 'ul', name: 'Unordered (bullets)' },
              { value: 'ol', name: 'Ordered (numbers)' }
            ],
            changeProp: 1
          }
        ]
      }
    }
  })

  // 12. QUOTE Component
  domc.addType('quote', {
    model: {
      defaults: {
        tagName: 'blockquote',
        name: 'Quote',
        draggable: true,
        droppable: false,
        content: 'This is a quote or testimonial.',
        attributes: { class: 'quote' },
        styles: `
          .quote {
            border-left: 4px solid #b8960c;
            padding-left: 20px;
            margin: 24px 0;
            font-size: 18px;
            font-style: italic;
            color: #666;
          }
        `
      }
    }
  })

  // 13. VIDEO Component
  domc.addType('video', {
    model: {
      defaults: {
        tagName: 'video',
        name: 'Video',
        draggable: true,
        droppable: false,
        attributes: {
          class: 'video',
          controls: true,
          style: 'max-width: 100%; border-radius: 8px;'
        },
        traits: [
          {
            type: 'text',
            label: 'Video URL',
            name: 'src',
            placeholder: 'https://example.com/video.mp4'
          },
          {
            type: 'checkbox',
            label: 'Autoplay',
            name: 'autoplay'
          },
          {
            type: 'checkbox',
            label: 'Loop',
            name: 'loop'
          },
          {
            type: 'checkbox',
            label: 'Muted',
            name: 'muted'
          }
        ]
      }
    }
  })

  // 14. ICON Component
  domc.addType('icon', {
    model: {
      defaults: {
        tagName: 'i',
        name: 'Icon',
        draggable: true,
        droppable: false,
        content: '⭐',
        attributes: { class: 'icon' },
        styles: `
          .icon {
            font-size: 32px;
            display: inline-block;
          }
        `,
        traits: [
          {
            type: 'text',
            label: 'Icon (emoji or unicode)',
            name: 'content',
            changeProp: 1
          }
        ]
      }
    }
  })

  // 15. FORM Component
  domc.addType('form', {
    model: {
      defaults: {
        tagName: 'form',
        name: 'Form',
        draggable: true,
        droppable: true,
        attributes: { class: 'form', method: 'POST' },
        content: '<label>Name</label><input type="text" name="name" placeholder="Your name" required><button type="submit">Submit</button>',
        styles: `
          .form {
            max-width: 500px;
          }
          .form label {
            display: block;
            margin-bottom: 6px;
            font-weight: 600;
            font-size: 14px;
          }
          .form input, .form textarea, .form select {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            margin-bottom: 16px;
            font-size: 14px;
          }
          .form button {
            background: #b8960c;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
          }
        `,
        traits: [
          {
            type: 'text',
            label: 'Action URL',
            name: 'action',
            placeholder: '/submit-form'
          },
          {
            type: 'select',
            label: 'Method',
            name: 'method',
            options: [
              { value: 'POST', name: 'POST' },
              { value: 'GET', name: 'GET' }
            ]
          }
        ]
      }
    }
  })

  // 16. TEXTAREA Component
  domc.addType('textarea', {
    model: {
      defaults: {
        tagName: 'textarea',
        name: 'Textarea',
        draggable: true,
        droppable: false,
        attributes: {
          placeholder: 'Enter your message...',
          rows: 4
        },
        traits: [
          {
            type: 'text',
            label: 'Name',
            name: 'name'
          },
          {
            type: 'text',
            label: 'Placeholder',
            name: 'placeholder'
          },
          {
            type: 'number',
            label: 'Rows',
            name: 'rows',
            min: 1,
            max: 20
          }
        ]
      }
    }
  })

  // 17. CHECKBOX Component
  domc.addType('checkbox', {
    model: {
      defaults: {
        tagName: 'label',
        name: 'Checkbox',
        draggable: true,
        droppable: false,
        content: '<input type="checkbox"> Checkbox label',
        styles: `
          label {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
          }
        `
      }
    }
  })

  // 18. RADIO Component
  domc.addType('radio', {
    model: {
      defaults: {
        tagName: 'label',
        name: 'Radio',
        draggable: true,
        droppable: false,
        content: '<input type="radio" name="radio-group"> Radio label',
        styles: `
          label {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
          }
        `
      }
    }
  })

  // 19. SELECT Component
  domc.addType('select', {
    model: {
      defaults: {
        tagName: 'select',
        name: 'Select',
        draggable: true,
        droppable: false,
        content: '<option>Option 1</option><option>Option 2</option><option>Option 3</option>',
        traits: [
          {
            type: 'text',
            label: 'Name',
            name: 'name'
          }
        ]
      }
    }
  })

  // 20. ACCORDION Component
  domc.addType('accordion', {
    model: {
      defaults: {
        tagName: 'div',
        name: 'Accordion',
        draggable: true,
        droppable: true,
        attributes: { class: 'accordion' },
        content: `
          <details>
            <summary>Accordion Item 1</summary>
            <p>Content for item 1</p>
          </details>
          <details>
            <summary>Accordion Item 2</summary>
            <p>Content for item 2</p>
          </details>
        `,
        styles: `
          .accordion details {
            border: 1px solid #e5e5e5;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 8px;
          }
          .accordion summary {
            font-weight: 600;
            cursor: pointer;
            user-select: none;
          }
          .accordion summary:hover {
            color: #b8960c;
          }
        `
      }
    }
  })

  // 21. CTA BANNER Component
  domc.addType('cta-banner', {
    model: {
      defaults: {
        tagName: 'div',
        name: 'CTA Banner',
        draggable: true,
        droppable: true,
        attributes: { class: 'cta-banner' },
        content: '<h2>Ready to get started?</h2><p>Join thousands of satisfied customers today.</p><button>Get Started</button>',
        styles: `
          .cta-banner {
            background: linear-gradient(135deg, #b8960c 0%, #d4af37 100%);
            color: white;
            padding: 60px 40px;
            text-align: center;
            border-radius: 12px;
          }
          .cta-banner h2 {
            margin: 0 0 12px 0;
            font-size: 32px;
          }
          .cta-banner p {
            margin: 0 0 24px 0;
            font-size: 18px;
            opacity: 0.95;
          }
          .cta-banner button {
            background: white;
            color: #b8960c;
            padding: 14px 32px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
          }
        `
      }
    }
  })

  // 22. TESTIMONIAL Component
  domc.addType('testimonial', {
    model: {
      defaults: {
        tagName: 'div',
        name: 'Testimonial',
        draggable: true,
        droppable: false,
        attributes: { class: 'testimonial' },
        content: '<blockquote>"This product changed my life!"</blockquote><cite>- John Doe, CEO</cite>',
        styles: `
          .testimonial {
            background: #f9f9f9;
            padding: 24px;
            border-radius: 12px;
            border-left: 4px solid #b8960c;
          }
          .testimonial blockquote {
            margin: 0 0 12px 0;
            font-size: 18px;
            font-style: italic;
          }
          .testimonial cite {
            font-style: normal;
            color: #666;
            font-size: 14px;
          }
        `
      }
    }
  })

  // 23. PRICING CARD Component
  domc.addType('pricing-card', {
    model: {
      defaults: {
        tagName: 'div',
        name: 'Pricing Card',
        draggable: true,
        droppable: true,
        attributes: { class: 'pricing-card' },
        content: `
          <h3>Pro Plan</h3>
          <div class="price">$29<span>/month</span></div>
          <ul>
            <li>Feature 1</li>
            <li>Feature 2</li>
            <li>Feature 3</li>
          </ul>
          <button>Choose Plan</button>
        `,
        styles: `
          .pricing-card {
            background: white;
            border: 2px solid #e5e5e5;
            border-radius: 12px;
            padding: 32px 24px;
            text-align: center;
            transition: all 0.2s;
          }
          .pricing-card:hover {
            border-color: #b8960c;
            transform: translateY(-4px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
          }
          .pricing-card h3 {
            margin: 0 0 16px 0;
          }
          .pricing-card .price {
            font-size: 48px;
            font-weight: 700;
            color: #b8960c;
            margin-bottom: 24px;
          }
          .pricing-card .price span {
            font-size: 16px;
            color: #666;
          }
          .pricing-card ul {
            list-style: none;
            padding: 0;
            margin: 0 0 24px 0;
          }
          .pricing-card li {
            padding: 8px 0;
            border-bottom: 1px solid #f0f0f0;
          }
          .pricing-card button {
            background: #b8960c;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
          }
        `
      }
    }
  })
}
