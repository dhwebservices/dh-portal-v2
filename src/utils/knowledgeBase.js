export const KNOWLEDGE_AUDIENCE_OPTIONS = [
  ['staff', 'Staff'],
  ['client', 'Client'],
  ['both', 'Both'],
]

export const KNOWLEDGE_CATEGORY_OPTIONS = [
  ['support', 'Support'],
  ['billing', 'Billing'],
  ['website', 'Website'],
  ['hr', 'HR'],
  ['operations', 'Operations'],
]

export function buildKnowledgeArticleKey(id = '') {
  return `knowledge_article:${String(id || '').trim()}`
}

export function createKnowledgeArticle(raw = {}) {
  const id = String(raw.id || `kb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).trim()
  return {
    id,
    title: String(raw.title || '').trim(),
    slug: String(raw.slug || slugifyKnowledgeTitle(raw.title || id)).trim(),
    category: KNOWLEDGE_CATEGORY_OPTIONS.some(([key]) => key === raw.category) ? raw.category : 'support',
    audience: KNOWLEDGE_AUDIENCE_OPTIONS.some(([key]) => key === raw.audience) ? raw.audience : 'both',
    summary: String(raw.summary || '').trim(),
    body: String(raw.body || '').trim(),
    tags: Array.isArray(raw.tags)
      ? raw.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
      : String(raw.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
    published: raw.published !== false,
    created_at: String(raw.created_at || new Date().toISOString()),
    updated_at: String(raw.updated_at || new Date().toISOString()),
    author_name: String(raw.author_name || '').trim(),
    author_email: String(raw.author_email || '').trim().toLowerCase(),
  }
}

export function normalizeKnowledgeArticle(raw = {}) {
  return createKnowledgeArticle(raw)
}

export function slugifyKnowledgeTitle(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'article'
}
