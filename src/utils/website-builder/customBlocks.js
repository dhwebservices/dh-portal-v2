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

  // WEEK 5 COMPONENTS

  // Layout Components
  bm.add('card', {
    label: 'Card',
    category: 'Layout',
    content: { type: 'card' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="4" y="4" width="16" height="16" rx="3"/>
      <path d="M4 10h16"/>
    </svg>`
  })

  bm.add('grid', {
    label: 'Grid',
    category: 'Layout',
    content: { type: 'grid' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
    </svg>`
  })

  bm.add('flexbox', {
    label: 'Flexbox',
    category: 'Layout',
    content: { type: 'flexbox' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="4" y="7" width="4" height="10" rx="1"/>
      <rect x="10" y="7" width="4" height="10" rx="1"/>
      <rect x="16" y="7" width="4" height="10" rx="1"/>
    </svg>`
  })

  bm.add('spacer', {
    label: 'Spacer',
    category: 'Layout',
    content: { type: 'spacer' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 3v18M3 12h18" stroke-dasharray="2 2"/>
    </svg>`
  })

  bm.add('divider', {
    label: 'Divider',
    category: 'Layout',
    content: { type: 'divider' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 12h18"/>
    </svg>`
  })

  // Typography Components
  bm.add('list', {
    label: 'List',
    category: 'Typography',
    content: { type: 'list' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/>
      <line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>`
  })

  bm.add('quote', {
    label: 'Quote',
    category: 'Typography',
    content: { type: 'quote' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
    </svg>`
  })

  // Media Components
  bm.add('video', {
    label: 'Video',
    category: 'Media',
    content: { type: 'video' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="6" width="20" height="12" rx="2"/>
      <polygon points="10,9 15,12 10,15" fill="currentColor"/>
    </svg>`
  })

  bm.add('icon', {
    label: 'Icon',
    category: 'Media',
    content: { type: 'icon' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>`
  })

  // Form Components
  bm.add('form', {
    label: 'Form',
    category: 'Forms',
    content: { type: 'form' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
      <path d="M8 9h8M8 13h5"/>
    </svg>`
  })

  bm.add('textarea', {
    label: 'Textarea',
    category: 'Forms',
    content: { type: 'textarea' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="4" y="6" width="16" height="12" rx="2"/>
      <path d="M8 10h8M8 14h6"/>
    </svg>`
  })

  bm.add('checkbox', {
    label: 'Checkbox',
    category: 'Forms',
    content: { type: 'checkbox' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="6" y="6" width="12" height="12" rx="2"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>`
  })

  bm.add('radio', {
    label: 'Radio',
    category: 'Forms',
    content: { type: 'radio' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="8"/>
      <circle cx="12" cy="12" r="3" fill="currentColor"/>
    </svg>`
  })

  bm.add('select', {
    label: 'Select',
    category: 'Forms',
    content: { type: 'select' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="4" y="7" width="16" height="3" rx="1"/>
      <path d="M9 13l3 3 3-3"/>
    </svg>`
  })

  // Content Components
  bm.add('accordion', {
    label: 'Accordion',
    category: 'Content',
    content: { type: 'accordion' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="4" width="18" height="4" rx="1"/>
      <rect x="3" y="10" width="18" height="4" rx="1"/>
      <rect x="3" y="16" width="18" height="4" rx="1"/>
      <path d="M9 6h6M9 12h6M9 18h6"/>
    </svg>`
  })

  bm.add('cta-banner', {
    label: 'CTA Banner',
    category: 'Content',
    content: { type: 'cta-banner' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="6" width="20" height="12" rx="2"/>
      <path d="M7 12h10M14 9l3 3-3 3"/>
    </svg>`
  })

  bm.add('testimonial', {
    label: 'Testimonial',
    category: 'Content',
    content: { type: 'testimonial' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <path d="M8 10h.01M12 10h.01M16 10h.01"/>
    </svg>`
  })

  bm.add('pricing-card', {
    label: 'Pricing Card',
    category: 'Content',
    content: { type: 'pricing-card' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="5" y="3" width="14" height="18" rx="2"/>
      <path d="M12 8v8M9 12h6"/>
    </svg>`
  })

  // Hero Section
  bm.add('hero', {
    label: 'Hero Section',
    category: 'Content',
    content: `
      <section style="padding: 100px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
        <div style="max-width: 800px; margin: 0 auto;">
          <h1 style="font-size: 48px; margin: 0 0 20px 0; font-weight: 700;">Welcome to Our Site</h1>
          <p style="font-size: 20px; margin: 0 0 32px 0; opacity: 0.95;">Build amazing websites with our visual editor</p>
          <a href="#" style="display: inline-block; background: white; color: #667eea; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">Get Started</a>
        </div>
      </section>
    `,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>`
  })

  // Feature Grid
  bm.add('feature-grid', {
    label: 'Feature Grid',
    category: 'Content',
    content: `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; padding: 40px 20px;">
        <div style="text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">⚡</div>
          <h3 style="margin: 0 0 12px 0;">Fast</h3>
          <p style="color: #666; margin: 0;">Lightning-fast performance</p>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">🎨</div>
          <h3 style="margin: 0 0 12px 0;">Beautiful</h3>
          <p style="color: #666; margin: 0;">Stunning designs</p>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
          <h3 style="margin: 0 0 12px 0;">Secure</h3>
          <p style="color: #666; margin: 0;">Enterprise-grade security</p>
        </div>
      </div>
    `,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M7 10v4M17 10v4"/>
    </svg>`
  })
}
