import DOMPurify from 'dompurify'

const BASE_CONFIG = Object.freeze({
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'meta'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onmouseenter', 'onmouseleave'],
  ALLOW_DATA_ATTR: false,
})

export function sanitizeHtml(html = '') {
  return DOMPurify.sanitize(String(html || ''), BASE_CONFIG)
}
