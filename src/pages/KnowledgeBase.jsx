import { useEffect, useMemo, useState } from 'react'
import { BookOpen, FileText, Search, Sparkles } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import {
  buildKnowledgeArticleKey,
  createKnowledgeArticle,
  KNOWLEDGE_AUDIENCE_OPTIONS,
  KNOWLEDGE_CATEGORY_OPTIONS,
  normalizeKnowledgeArticle,
  slugifyKnowledgeTitle,
} from '../utils/knowledgeBase'
import { StatCard } from '../components/ui'
import { Button, FormField, FormLabel, FormInput, FormSelect, StatusBadge } from '../components/ds'

const DS_CARD = { background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)' }

const EMPTY_FORM = {
  title: '',
  summary: '',
  body: '',
  category: 'support',
  audience: 'both',
  tags: '',
  published: true,
}

export default function KnowledgeBase() {
  const { user } = useAuth()
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [audience, setAudience] = useState('all')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('portal_settings').select('key,value').like('key', 'knowledge_article:%')
    const rows = (data || [])
      .map((row) => normalizeKnowledgeArticle(row?.value?.value ?? row?.value ?? {}))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    setArticles(rows)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setEditorOpen(true)
  }

  const openEdit = (article) => {
    setEditing(article)
    setForm({
      title: article.title || '',
      summary: article.summary || '',
      body: article.body || '',
      category: article.category || 'support',
      audience: article.audience || 'both',
      tags: (article.tags || []).join(', '),
      published: article.published !== false,
    })
    setEditorOpen(true)
  }

  const closeEditor = () => {
    setEditing(null)
    setEditorOpen(false)
    setForm(EMPTY_FORM)
  }

  const saveArticle = async () => {
    const base = createKnowledgeArticle(editing || {})
    const next = createKnowledgeArticle({
      ...base,
      ...form,
      slug: slugifyKnowledgeTitle(form.title || base.title || base.id),
      updated_at: new Date().toISOString(),
      created_at: editing?.created_at || base.created_at,
      author_name: user?.name || editing?.author_name || '',
      author_email: user?.email || editing?.author_email || '',
    })

    setSaving(true)
    await supabase.from('portal_settings').upsert({
      key: buildKnowledgeArticleKey(next.id),
      value: { value: next },
    }, { onConflict: 'key' })
    setSaving(false)
    closeEditor()
    await load()
  }

  const deleteArticle = async (article) => {
    if (!confirm(`Delete "${article.title}"?`)) return
    await supabase.from('portal_settings').delete().eq('key', buildKnowledgeArticleKey(article.id))
    if (selected?.id === article.id) setSelected(null)
    if (editing?.id === article.id) closeEditor()
    await load()
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return articles.filter((article) => {
      if (category !== 'all' && article.category !== category) return false
      if (audience !== 'all' && article.audience !== audience) return false
      if (!q) return true
      const haystack = [
        article.title,
        article.summary,
        article.body,
        ...(article.tags || []),
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [articles, audience, category, search])

  const stats = useMemo(() => ({
    published: articles.filter((article) => article.published !== false).length,
    clientReady: articles.filter((article) => article.published !== false && ['client', 'both'].includes(article.audience)).length,
    internalOnly: articles.filter((article) => article.audience === 'staff').length,
  }), [articles])

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Knowledge Base</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Reusable answers, onboarding notes, billing guidance, and support playbooks in one shared library.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => load()}>Refresh</Button>
          <Button variant="primary" onClick={openCreate}>New article</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon={BookOpen} label="Total articles" value={articles.length} hint="Published and draft articles stored in the portal." tone="var(--color-blue-500)" />
        <StatCard icon={Sparkles} label="Published" value={stats.published} hint="Articles currently ready for staff or client use." tone="var(--color-green-500)" />
        <StatCard icon={FileText} label="Client-ready" value={stats.clientReady} hint="Articles tagged for client-facing self-service content." tone="var(--color-amber-500)" />
        <StatCard icon={BookOpen} label="Internal only" value={stats.internalOnly} hint="Staff-only process and support guidance." tone="var(--color-red-500)" />
      </div>

      <div style={{ ...DS_CARD, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
            <FormInput style={{ paddingLeft: 34, width: '100%' }} placeholder="Search knowledge articles..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <FormSelect style={{ width: 'auto', minWidth: 150 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {KNOWLEDGE_CATEGORY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </FormSelect>
          <FormSelect style={{ width: 'auto', minWidth: 150 }} value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="all">All audiences</option>
            {KNOWLEDGE_AUDIENCE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </FormSelect>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.95fr) minmax(320px, 0.8fr)', gap: 16 }}>
        <div style={{ ...DS_CARD, overflow: 'hidden' }}>
          {loading ? <div className="spin-wrap"><div className="spin" /></div> : (
            <div style={{ display: 'grid', gap: 1, background: 'var(--color-border)' }}>
              {filtered.map((article) => (
                <button
                  key={article.id}
                  onClick={() => setSelected(article)}
                  style={{
                    background: selected?.id === article.id ? 'var(--color-blue-50)' : 'var(--color-bg-surface)',
                    border: 'none',
                    textAlign: 'left',
                    padding: '16px 18px',
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{article.title || 'Untitled article'}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <StatusBadge variant={article.published !== false ? 'active' : 'info'}>{article.published !== false ? 'published' : 'draft'}</StatusBadge>
                      <StatusBadge variant="info">{article.audience}</StatusBadge>
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{article.summary || 'No summary added yet.'}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <StatusBadge variant="info">{article.category}</StatusBadge>
                    {(article.tags || []).slice(0, 3).map((tag) => <StatusBadge key={tag} variant="info">{tag}</StatusBadge>)}
                  </div>
                </button>
              ))}
              {filtered.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)', background: 'var(--color-bg-surface)' }}>No knowledge articles match this view.</div> : null}
            </div>
          )}
        </div>

        <div style={{ ...DS_CARD, padding: 20, display: 'grid', gap: 16 }}>
          {selected ? (
            <>
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 8 }}>{selected.category} · {selected.audience}</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-text-primary)' }}>{selected.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8 }}>{selected.summary}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px' }} onClick={() => openEdit(selected)}>Edit</Button>
                    <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px', color: 'var(--color-red-500)' }} onClick={() => deleteArticle(selected)}>Delete</Button>
                  </div>
                </div>
              </div>

              <div style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--color-gray-50)', border: '1px solid var(--color-border)', whiteSpace: 'pre-wrap', lineHeight: 1.8, color: 'var(--color-text-primary)', fontSize: 13.5 }}>
                {selected.body || 'No article body yet.'}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(selected.tags || []).map((tag) => <StatusBadge key={tag} variant="info">{tag}</StatusBadge>)}
              </div>

              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                Updated {new Date(selected.updated_at).toLocaleString('en-GB')} by {selected.author_name || selected.author_email || 'Unknown author'}
              </div>
            </>
          ) : (
            <div style={{ padding: '32px 10px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              Pick an article to read it here, or create a new one to start building the support library.
            </div>
          )}
        </div>
      </div>

      {editorOpen ? (
        <Modal
          title={editing ? `Edit Article${editing?.title ? ` — ${editing.title}` : ''}` : 'New Article'}
          onClose={closeEditor}
          width={820}
          footer={(
            <>
              <Button variant="secondary" onClick={closeEditor}>Cancel</Button>
              <Button variant="primary" onClick={saveArticle} disabled={saving || !form.title.trim() || !form.body.trim()}>{saving ? 'Saving...' : editing ? 'Save article' : 'Create article'}</Button>
            </>
          )}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <FormField><FormLabel>Title</FormLabel><FormInput value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="How to handle a payment failure" /></FormField>
            <FormField><FormLabel>Summary</FormLabel><FormInput value={form.summary} onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))} placeholder="Short summary shown in search and list views." /></FormField>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <FormField>
                <FormLabel>Category</FormLabel>
                <FormSelect value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
                  {KNOWLEDGE_CATEGORY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </FormSelect>
              </FormField>
              <FormField>
                <FormLabel>Audience</FormLabel>
                <FormSelect value={form.audience} onChange={(e) => setForm((prev) => ({ ...prev, audience: e.target.value }))}>
                  {KNOWLEDGE_AUDIENCE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </FormSelect>
              </FormField>
              <FormField>
                <FormLabel>Status</FormLabel>
                <FormSelect value={form.published ? 'published' : 'draft'} onChange={(e) => setForm((prev) => ({ ...prev, published: e.target.value === 'published' }))}>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </FormSelect>
              </FormField>
            </div>
            <FormField><FormLabel>Tags</FormLabel><FormInput value={form.tags} onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))} placeholder="billing, failed payment, mandate" /></FormField>
            <FormField><FormLabel>Body</FormLabel><textarea className="ds-form-input" rows={14} value={form.body} onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))} style={{ resize: 'vertical', padding: '8px 12px' }} placeholder="Write the support answer, triage steps, escalation notes, or client guidance here." /></FormField>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
