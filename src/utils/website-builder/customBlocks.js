/**
 * Custom GrapesJS Blocks
 * Defines blocks that appear in the component palette
 */

export default function registerBlocks(editor) {
  const bm = editor.BlockManager

  // LAYOUT Category
  bm.add('container', {
    label: 'Container',
    category: 'Layout',
    content: {
      type: 'container',
      content: 'Drop components here'
    },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M9 21V9"/>
    </svg>`,
    attributes: { class: 'block-container' }
  })

  // TYPOGRAPHY Category
  bm.add('heading', {
    label: 'Heading',
    category: 'Typography',
    content: {
      type: 'heading',
      content: 'Heading Text'
    },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M4 12h8m-8-6v12m8-12v12m0-6h8m0-6v12"/>
    </svg>`,
    attributes: { class: 'block-heading' }
  })

  bm.add('paragraph', {
    label: 'Paragraph',
    category: 'Typography',
    content: {
      type: 'paragraph',
      content: 'This is a paragraph. Click to edit the text.'
    },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 5h8m-8 7h8m-8 7h8M4 5h.01M4 12h.01M4 19h.01"/>
    </svg>`,
    attributes: { class: 'block-paragraph' }
  })

  // MEDIA Category
  bm.add('image', {
    label: 'Image',
    category: 'Media',
    content: {
      type: 'image'
    },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>`,
    attributes: { class: 'block-image' }
  })

  // INTERACTIVE Category
  bm.add('button', {
    label: 'Button',
    category: 'Interactive',
    content: {
      type: 'button',
      content: 'Click Me'
    },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="4" y="8" width="16" height="8" rx="4"/>
    </svg>`,
    attributes: { class: 'block-button' }
  })

  // Add basic HTML blocks for flexibility
  bm.add('text', {
    label: 'Text',
    category: 'Basic',
    content: '<div data-gjs-type="text">Insert your text here</div>',
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17 10H7M21 15H3M21 20H3M15 5H9"/>
    </svg>`
  })

  bm.add('section', {
    label: 'Section',
    category: 'Layout',
    content: `
      <section style="padding: 60px 20px; background: #f5f5f5;">
        <div style="max-width: 1200px; margin: 0 auto;">
          <h2 style="margin: 0 0 16px 0; font-size: 32px; font-weight: 600;">Section Title</h2>
          <p style="margin: 0; font-size: 16px; line-height: 1.6;">Section content goes here.</p>
        </div>
      </section>
    `,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="6" width="20" height="12" rx="2"/>
    </svg>`
  })

  bm.add('2-columns', {
    label: '2 Columns',
    category: 'Layout',
    content: `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
        <div style="padding: 20px; background: #f9f9f9; border-radius: 8px;">
          <p>Column 1</p>
        </div>
        <div style="padding: 20px; background: #f9f9f9; border-radius: 8px;">
          <p>Column 2</p>
        </div>
      </div>
    `,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="18" rx="1"/>
      <rect x="14" y="3" width="7" height="18" rx="1"/>
    </svg>`
  })

  bm.add('3-columns', {
    label: '3 Columns',
    category: 'Layout',
    content: `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
        <div style="padding: 20px; background: #f9f9f9; border-radius: 8px;">
          <p>Column 1</p>
        </div>
        <div style="padding: 20px; background: #f9f9f9; border-radius: 8px;">
          <p>Column 2</p>
        </div>
        <div style="padding: 20px; background: #f9f9f9; border-radius: 8px;">
          <p>Column 3</p>
        </div>
      </div>
    `,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="3" width="4" height="18" rx="1"/>
      <rect x="10" y="3" width="4" height="18" rx="1"/>
      <rect x="18" y="3" width="4" height="18" rx="1"/>
    </svg>`
  })

  bm.add('link', {
    label: 'Link',
    category: 'Typography',
    content: '<a href="#">Link Text</a>',
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>`
  })
}
