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

const EMPTY_FORM = {
  title: '',
  summary: '',
  body: '',
  category: 'support',
  audience: 'both',
  tags: '',
  published: true,
}

function StatCard({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="stat-card" style={{ minHeight: 118 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div className="stat-lbl">{label}</div>
        <div style={{ width: 34, height: 34, borderRadius: 12, background: `${tone}22`, color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} />
        </div>
      </div>
      <div className="stat-val">{value}</div>
      <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 8, lineHeight: 1.5 }}>{hint}</div>
    </div>
  )
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
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Knowledge Base</h1>
          <p className="page-sub">Reusable answers, onboarding notes, billing guidance, and support playbooks in one shared library.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => load()}>Refresh</button>
          <button className="btn btn-primary" onClick={openCreate}>New article</button>
        </div>
      </div>

      <div className="dashboard-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon={BookOpen} label="Total articles" value={articles.length} hint="Published and draft articles stored in the portal." tone="var(--blue)" />
        <StatCard icon={Sparkles} label="Published" value={stats.published} hint="Articles currently ready for staff or client use." tone="var(--green)" />
        <StatCard icon={FileText} label="Client-ready" value={stats.clientReady} hint="Articles tagged for client-facing self-service content." tone="var(--amber)" />
        <StatCard icon={BookOpen} label="Internal only" value={stats.internalOnly} hint="Staff-only process and support guidance." tone="var(--red)" />
      </div>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="legacy-toolbar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-wrap" style={{ flex: 1, minWidth: 220 }}>
            <Search size={13} className="search-icon" />
            <input className="inp" style={{ paddingLeft: 34 }} placeholder="Search knowledge articles..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="inp" style={{ width: 'auto', minWidth: 150 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {KNOWLEDGE_CATEGORY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select className="inp" style={{ width: 'auto', minWidth: 150 }} value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="all">All audiences</option>
            {KNOWLEDGE_AUDIENCE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.95fr) minmax(320px, 0.8fr)', gap: 16 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? <div className="spin-wrap"><div className="spin" /></div> : (
            <div style={{ display: 'grid', gap: 1, background: 'var(--border)' }}>
              {filtered.map((article) => (
                <button
                  key={article.id}
                  onClick={() => setSelected(article)}
                  style={{
                    background: selected?.id === article.id ? 'var(--accent-soft)' : 'var(--card)',
                    border: 'none',
                    textAlign: 'left',
                    padding: '16px 18px',
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{article.title || 'Untitled article'}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className={`badge badge-${article.published !== false ? 'green' : 'grey'}`}>{article.published !== false ? 'published' : 'draft'}</span>
                      <span className="badge badge-blue">{article.audience}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.6 }}>{article.summary || 'No summary added yet.'}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="badge badge-grey">{article.category}</span>
                    {(article.tags || []).slice(0, 3).map((tag) => <span key={tag} className="badge badge-grey">{tag}</span>)}
                  </div>
                </button>
              ))}
              {filtered.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--faint)', background: 'var(--card)' }}>No knowledge articles match this view.</div> : null}
            </div>
          )}
        </div>

        <div className="card card-pad" style={{ display: 'grid', gap: 16 }}>
          {selected ? (
            <>
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 8 }}>{selected.category} · {selected.audience}</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>{selected.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 8 }}>{selected.summary}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(selected)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteArticle(selected)}>Delete</button>
                  </div>
                </div>
              </div>

              <div style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--border)', whiteSpace: 'pre-wrap', lineHeight: 1.8, color: 'var(--text)', fontSize: 13.5 }}>
                {selected.body || 'No article body yet.'}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(selected.tags || []).map((tag) => <span key={tag} className="badge badge-grey">{tag}</span>)}
              </div>

              <div style={{ fontSize: 12, color: 'var(--faint)' }}>
                Updated {new Date(selected.updated_at).toLocaleString('en-GB')} by {selected.author_name || selected.author_email || 'Unknown author'}
              </div>
            </>
          ) : (
            <div style={{ padding: '32px 10px', textAlign: 'center', color: 'var(--faint)' }}>
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
              <button className="btn btn-outline" onClick={closeEditor}>Cancel</button>
              <button className="btn btn-primary" onClick={saveArticle} disabled={saving || !form.title.trim() || !form.body.trim()}>{saving ? 'Saving...' : editing ? 'Save article' : 'Create article'}</button>
            </>
          )}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <div><label className="lbl">Title</label><input className="inp" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="How to handle a payment failure" /></div>
            <div><label className="lbl">Summary</label><input className="inp" value={form.summary} onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))} placeholder="Short summary shown in search and list views." /></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <div>
                <label className="lbl">Category</label>
                <select className="inp" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
                  {KNOWLEDGE_CATEGORY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">Audience</label>
                <select className="inp" value={form.audience} onChange={(e) => setForm((prev) => ({ ...prev, audience: e.target.value }))}>
                  {KNOWLEDGE_AUDIENCE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">Status</label>
                <select className="inp" value={form.published ? 'published' : 'draft'} onChange={(e) => setForm((prev) => ({ ...prev, published: e.target.value === 'published' }))}>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>
            <div><label className="lbl">Tags</label><input className="inp" value={form.tags} onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))} placeholder="billing, failed payment, mandate" /></div>
            <div><label className="lbl">Body</label><textarea className="inp" rows={14} value={form.body} onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))} style={{ resize: 'vertical' }} placeholder="Write the support answer, triage steps, escalation notes, or client guidance here." /></div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
