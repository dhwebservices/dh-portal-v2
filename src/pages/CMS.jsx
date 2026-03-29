import { useState } from 'react'
import { Plus, FileText, Globe, Edit3, Trash2, Eye } from 'lucide-react'
import { Card, Badge, Btn, Modal, Input } from '../components/UI'

const emptyPage = { title: '', slug: '', status: 'draft', wordCount: 0, author: 'David Hooper', content: '' }

export default function CMS() {
  const [pages, setPages] = useState([])
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(emptyPage)
  const [editorContent, setEditorContent] = useState('')

  const openAdd = () => { setForm(emptyPage); setEditorContent(''); setModal('add') }
  const openEdit = (p) => { setSelected(p); setForm({ ...p }); setEditorContent(p.content || ''); setModal('edit') }
  const closeModal = () => { setModal(null); setSelected(null) }

  const savePage = () => {
    const wordCount = editorContent.trim().split(/\s+/).filter(Boolean).length
    if (modal === 'add') {
      setPages(prev => [...prev, {
        ...form, id: `p${Date.now()}`, content: editorContent,
        wordCount, lastEdited: new Date().toISOString().split('T')[0]
      }])
    } else {
      setPages(prev => prev.map(p => p.id === selected.id ? {
        ...p, ...form, content: editorContent, wordCount,
        lastEdited: new Date().toISOString().split('T')[0]
      } : p))
    }
    closeModal()
  }

  const deletePage = (id, e) => { e.stopPropagation(); setPages(prev => prev.filter(p => p.id !== id)) }

  const published = pages.filter(p => p.status === 'published')
  const drafts = pages.filter(p => p.status === 'draft')

  return (
    <div className="animate-fade">
      {/* Stats row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total Pages', value: pages.length, color: 'var(--text)' },
          { label: 'Published',   value: published.length, color: 'var(--green)' },
          { label: 'Drafts',      value: drafts.length, color: 'var(--amber)' },
          { label: 'Total Words', value: pages.reduce((s,p)=>s+p.wordCount,0).toLocaleString(), color: 'var(--gold)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: '9px', padding: '10px 18px',
            display: 'flex', gap: '8px', alignItems: 'center',
          }}>
            <span style={{ fontSize: '12px', color: 'var(--sub)' }}>{label}:</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color }}>{value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={12}/>New Page</button>
      </div>

      {/* Pages grid */}
      {pages.length === 0 ? (
        <div className="card card-pad">
          <div style={{ padding: '48px 40px', textAlign: 'center' }}>
            <div style={{
              width: '56px', height: '56px', background: 'var(--bg2)',
              borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <Globe size={24} color="var(--faint)" />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', marginBottom: '6px' }}>No pages yet</div>
            <p style={{ fontSize: '13.5px', color: 'var(--sub)', marginBottom: '20px' }}>
              Create your first content page to start managing your website copy.
            </p>
            <button className="btn btn-primary" onClick={openAdd}><Plus size={13}/>Create First Page</button>
          </div>
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {pages.map(page => (
          <div key={page.id} className="animate-fade" style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '18px',
            cursor: 'pointer',
            transition: 'border-color 0.15s, transform 0.15s',
          }}
            onClick={() => openEdit(page)}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--faint)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{
                width: '36px', height: '36px',
                background: page.status === 'published' ? 'rgba(0,194,255,0.1)' : 'rgba(122,143,166,0.1)',
                borderRadius: '9px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {page.status === 'published'
                  ? <Globe size={17} color="var(--gold)" />
                  : <FileText size={17} color="var(--sub)" />
                }
              </div>
              <span className={`badge badge-${page.status==="active"||page.status==="paid"?"green":page.status==="pending"||page.status==="draft"?"amber":page.status==="published"?"gold":"grey"}`}>{page.status}</span>
            </div>

            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>{page.title}</h3>
            <code style={{ fontSize: '12px', color: 'var(--sub)', display: 'block', marginBottom: '12px' }}>{page.slug}</code>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--faint)' }}>
                {page.wordCount} words · {page.lastEdited}
              </div>
              <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                <button onClick={() => openEdit(page)} style={{
                  background: 'var(--bg2)', border: '1px solid var(--border)',
                  borderRadius: '6px', padding: '5px 7px', color: 'var(--sub)', cursor: 'pointer',
                  transition: 'color 0.15s',
                }}
                  onMouseOver={e => e.currentTarget.style.color = 'var(--gold)'}
                  onMouseOut={e => e.currentTarget.style.color = 'var(--sub)'}
                >
                  <Edit3 size={13} />
                </button>
                <button onClick={(e) => deletePage(page.id, e)} style={{
                  background: 'var(--bg2)', border: '1px solid var(--border)',
                  borderRadius: '6px', padding: '5px 7px', color: 'var(--sub)', cursor: 'pointer',
                  transition: 'color 0.15s',
                }}
                  onMouseOver={e => e.currentTarget.style.color = 'var(--red)'}
                  onMouseOut={e => e.currentTarget.style.color = 'var(--sub)'}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Editor Modal */}
      {(!!modal) && (<div className="modal-backdrop" onClick={closeModal}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><span className="modal-title">{modal === 'add' ? 'New Page' : `Edit: ${selected?.title}`}</span><button onClick={closeModal} style={{background:"none",border:"none",color:"var(--faint)",cursor:"pointer",fontSize:20,lineHeight:1}}>×</button></div><div className="modal-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <Input label="Page Title" value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} placeholder="About Us" />
            <Input label="URL Slug" value={form.slug} onChange={e => setForm(p => ({...p, slug: e.target.value}))} placeholder="/about" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12.5px', color: 'var(--sub)', fontWeight: 500 }}>Status</label>
            <select value={form.status} onChange={e => setForm(p => ({...p, status: e.target.value}))} style={{
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '9px 14px', color: 'var(--text)', fontSize: '13.5px',
            }}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12.5px', color: 'var(--sub)', fontWeight: 500 }}>Content</label>
            <textarea
              value={editorContent}
              onChange={e => setEditorContent(e.target.value)}
              placeholder="Write your page content here…"
              rows={10}
              style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '12px 14px',
                color: 'var(--text)', fontSize: '13.5px',
                resize: 'vertical', lineHeight: 1.7,
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--gold)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <div style={{ fontSize: '11.5px', color: 'var(--faint)', textAlign: 'right' }}>
              {editorContent.trim().split(/\s+/).filter(Boolean).length} words
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={savePage}>{modal === 'add' ? 'Create Page' : 'Save Changes'}</button>
          </div>
        </div>
      </div></div></div>)}
  )
}
