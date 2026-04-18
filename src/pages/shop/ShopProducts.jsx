import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../components/Modal'
import { fetchShopCategories, fetchShopProducts, saveShopProduct, deleteShopProduct, buildVariantLabel, uploadShopProductImage } from '../../utils/shop'

const EMPTY_PRODUCT = {
  name: '',
  slug: '',
  brand: 'Apple',
  description: '',
  image_url: '',
  category_id: '',
  status: 'active',
  featured: false,
  procurement_notes: '',
  variants: [
    { sku: '', model: '', colour: '', storage: '', size: '', price: '', compare_at_price: '', cost_price: '', lead_time_days: 2, is_available: true, procurement_required: true },
  ],
}

export default function ShopProducts() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [form, setForm] = useState(EMPTY_PRODUCT)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [nextCategories, nextProducts] = await Promise.all([
        fetchShopCategories(),
        fetchShopProducts(),
      ])
      setCategories(nextCategories)
      setProducts(nextProducts)
    } catch (err) {
      setError(err.message || 'Could not load shop products.')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const safe = query.toLowerCase().trim()
    if (!safe) return products
    return products.filter((product) =>
      [product.name, product.brand, product.slug, product.category?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(safe))
    )
  }, [products, query])

  function openCreate() {
    setForm(EMPTY_PRODUCT)
    setEditorOpen(true)
  }

  function openEdit(product) {
    setForm({
      id: product.id,
      name: product.name || '',
      slug: product.slug || '',
      brand: product.brand || '',
      description: product.description || '',
      image_url: product.image_url || '',
      category_id: product.category_id || '',
      status: product.status || 'active',
      featured: !!product.featured,
      procurement_notes: product.procurement_notes || '',
      variants: product.variants?.length
        ? product.variants.map((variant) => ({
            id: variant.id,
            sku: variant.sku || '',
            model: variant.model || '',
            colour: variant.colour || '',
            storage: variant.storage || '',
            size: variant.size || '',
            price: variant.price ?? '',
            compare_at_price: variant.compare_at_price ?? '',
            cost_price: variant.cost_price ?? '',
            lead_time_days: variant.lead_time_days ?? 2,
            is_available: variant.is_available !== false,
            procurement_required: variant.procurement_required !== false,
          }))
        : EMPTY_PRODUCT.variants,
    })
    setEditorOpen(true)
  }

  async function handleImageUpload(file) {
    if (!file) return
    setError('')
    setUploadingImage(true)
    try {
      const publicUrl = await uploadShopProductImage(file, form.name || file.name)
      setForm((current) => ({
        ...current,
        image_url: publicUrl || current.image_url,
      }))
    } catch (err) {
      setError(err.message || 'Could not upload product image.')
    } finally {
      setUploadingImage(false)
    }
  }

  function updateVariant(index, key, value) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, [key]: value } : variant
      ),
    }))
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await saveShopProduct(form)
      setEditorOpen(false)
      await load()
    } catch (err) {
      setError(err.message || 'Could not save product.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(productId) {
    if (!window.confirm('Delete this product and all of its variants?')) return
    setError('')
    try {
      await deleteShopProduct(productId)
      await load()
    } catch (err) {
      setError(err.message || 'Could not delete product.')
    }
  }

  return (
    <div className="fade-in">
      <div className="card card-pad" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 400, color: 'var(--text)' }}>Shop products</div>
          <div style={{ fontSize: 14, color: 'var(--sub)', marginTop: 6 }}>Manage public catalogue items, pricing, variants, and availability.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" style={inputStyle} />
          <button className="btn-primary" onClick={openCreate}>New product</button>
        </div>
      </div>

      {error ? <div className="card card-pad" style={{ marginBottom: 16, borderColor: 'rgba(180,35,24,0.24)', color: '#b42318' }}>{error}</div> : null}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>
          Catalogue
        </div>
        <div style={{ display: 'grid' }}>
          {(loading ? [] : filtered).map((product) => (
            <div key={product.id} style={{ display: 'grid', gridTemplateColumns: '96px 1.8fr 1fr 1fr 0.8fr 0.9fr', gap: 12, padding: '16px 18px', borderTop: '1px solid var(--border)', alignItems: 'start' }}>
              <div style={{ width: 96, height: 96, borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(180deg, #f5f7fb, #eef2f7)', border: '1px solid var(--border)' }}>
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--faint)' }}>{product.brand}</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{product.name}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--sub)' }}>{product.brand} · {product.category?.name || 'Uncategorised'} · /shop/product/{product.slug}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--faint)' }}>{product.variants?.length || 0} variants</div>
              </div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>
                <div style={statusPill(product.status)}>{product.status}</div>
                {product.featured ? <div style={{ marginTop: 8, fontSize: 12, color: 'var(--accent)' }}>Featured</div> : null}
              </div>
              <div style={{ fontSize: 13, color: 'var(--sub)' }}>
                {(product.variants || []).slice(0, 2).map((variant) => (
                  <div key={variant.id || `${variant.sku}-${variant.model}`} style={{ marginBottom: 6 }}>
                    {buildVariantLabel(variant) || variant.sku || 'Variant'} · £{Number(variant.price || 0).toFixed(2)}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: 'var(--sub)' }}>{product.updated_at ? new Date(product.updated_at).toLocaleDateString('en-GB') : '—'}</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn-outline btn-sm" onClick={() => openEdit(product)}>Edit</button>
                <button className="btn btn-sm" style={{ color: '#b42318' }} onClick={() => handleDelete(product.id)}>Delete</button>
              </div>
            </div>
          ))}
          {!loading && !filtered.length ? (
            <div style={{ padding: 28, color: 'var(--sub)', fontSize: 14 }}>No products found.</div>
          ) : null}
        </div>
      </div>

      {editorOpen ? (
        <Modal
          title={form.id ? 'Edit product' : 'New product'}
          onClose={() => setEditorOpen(false)}
          width={1120}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <button className="btn" onClick={() => setEditorOpen(false)}>Close</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save product'}</button>
            </div>
          }
        >
          <form onSubmit={handleSave} style={{ display: 'grid', gap: 18 }}>
            <div style={grid2}>
              <label style={fieldStyle}>
                <span>Name</span>
                <input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} style={inputStyle} required />
              </label>
              <label style={fieldStyle}>
                <span>Slug</span>
                <input value={form.slug} onChange={(e) => setForm((current) => ({ ...current, slug: e.target.value }))} style={inputStyle} placeholder="auto-generated if left blank" />
              </label>
              <label style={fieldStyle}>
                <span>Brand</span>
                <input value={form.brand} onChange={(e) => setForm((current) => ({ ...current, brand: e.target.value }))} style={inputStyle} required />
              </label>
              <label style={fieldStyle}>
                <span>Category</span>
                <select value={form.category_id} onChange={(e) => setForm((current) => ({ ...current, category_id: e.target.value }))} style={inputStyle}>
                  <option value="">No category</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label style={fieldStyle}>
                <span>Status</span>
                <select value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))} style={inputStyle}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label style={{ ...fieldStyle, justifyContent: 'flex-end' }}>
                <span>Featured product</span>
                <input type="checkbox" checked={form.featured} onChange={(e) => setForm((current) => ({ ...current, featured: e.target.checked }))} />
              </label>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--sub)' }}>Product image</div>
              <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
                <div style={{ width: 180, height: 180, borderRadius: 22, overflow: 'hidden', background: 'linear-gradient(180deg, #f5f7fb, #eef2f7)', border: '1px solid var(--border)' }}>
                  {form.image_url ? (
                    <img src={form.image_url} alt={form.name || 'Product preview'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--faint)' }}>
                      No image
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  <label style={{ ...fieldStyle, gap: 10 }}>
                    <span>Attach image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e.target.files?.[0] || null)}
                      style={inputStyle}
                    />
                  </label>
                  <div style={{ fontSize: 12, color: 'var(--faint)', lineHeight: 1.6 }}>
                    Upload a clean product image. The portal stores the image and links it to the public catalogue automatically.
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={() => setForm((current) => ({ ...current, image_url: '' }))}
                    >
                      Remove image
                    </button>
                    {uploadingImage ? <span style={{ fontSize: 12, color: 'var(--sub)' }}>Uploading image…</span> : null}
                  </div>
                </div>
              </div>
            </div>

            <label style={fieldStyle}>
              <span>Description</span>
              <textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} />
            </label>

            <label style={fieldStyle}>
              <span>Procurement notes</span>
              <textarea value={form.procurement_notes} onChange={(e) => setForm((current) => ({ ...current, procurement_notes: e.target.value }))} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
            </label>

            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>Variants</div>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      variants: [
                        ...current.variants,
                        { sku: '', model: '', colour: '', storage: '', size: '', price: '', compare_at_price: '', cost_price: '', lead_time_days: 2, is_available: true, procurement_required: true },
                      ],
                    }))
                  }
                >
                  Add variant
                </button>
              </div>
              {form.variants.map((variant, index) => (
                <div key={`${variant.id || 'new'}-${index}`} className="card card-pad" style={{ borderStyle: 'dashed' }}>
                  <div style={{ ...grid4, marginBottom: 12 }}>
                    <label style={fieldStyle}><span>Model</span><input value={variant.model} onChange={(e) => updateVariant(index, 'model', e.target.value)} style={inputStyle} /></label>
                    <label style={fieldStyle}><span>Colour</span><input value={variant.colour} onChange={(e) => updateVariant(index, 'colour', e.target.value)} style={inputStyle} /></label>
                    <label style={fieldStyle}><span>Storage</span><input value={variant.storage} onChange={(e) => updateVariant(index, 'storage', e.target.value)} style={inputStyle} /></label>
                    <label style={fieldStyle}><span>Size</span><input value={variant.size} onChange={(e) => updateVariant(index, 'size', e.target.value)} style={inputStyle} /></label>
                    <label style={fieldStyle}><span>SKU</span><input value={variant.sku} onChange={(e) => updateVariant(index, 'sku', e.target.value)} style={inputStyle} /></label>
                    <label style={fieldStyle}><span>Price</span><input value={variant.price} onChange={(e) => updateVariant(index, 'price', e.target.value)} style={inputStyle} /></label>
                    <label style={fieldStyle}><span>Compare at</span><input value={variant.compare_at_price} onChange={(e) => updateVariant(index, 'compare_at_price', e.target.value)} style={inputStyle} /></label>
                    <label style={fieldStyle}><span>Lead days</span><input value={variant.lead_time_days} onChange={(e) => updateVariant(index, 'lead_time_days', e.target.value)} style={inputStyle} /></label>
                  </div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={variant.is_available} onChange={(e) => updateVariant(index, 'is_available', e.target.checked)} />Available</label>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={variant.procurement_required} onChange={(e) => updateVariant(index, 'procurement_required', e.target.checked)} />Requires procurement</label>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ color: '#b42318' }}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          variants: current.variants.filter((_, variantIndex) => variantIndex !== index),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '10px 12px',
  background: 'var(--card)',
  color: 'var(--text)',
  fontSize: 14,
}

const fieldStyle = {
  display: 'grid',
  gap: 8,
  fontSize: 13,
  color: 'var(--sub)',
}

const grid2 = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 14,
}

const grid4 = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 12,
}

function statusPill(status) {
  const palette = {
    active: { background: 'rgba(17, 140, 79, 0.12)', color: '#118c4f' },
    inactive: { background: 'rgba(179, 114, 0, 0.12)', color: '#b37200' },
    archived: { background: 'rgba(71, 85, 105, 0.12)', color: '#475569' },
  }
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'capitalize',
    ...(palette[status] || palette.inactive),
  }
}
