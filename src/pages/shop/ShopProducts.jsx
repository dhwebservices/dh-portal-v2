import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../components/Modal'
import { fetchShopCategories, fetchShopProducts, saveShopProduct, deleteShopProduct, buildVariantLabel, uploadShopProductImage, updateShopProductImage } from '../../utils/shop'
import { Button, FormInput, FormSelect, Alert } from '../../components/ds'

const DS_CARD = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)' }

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
  const [notice, setNotice] = useState('')

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
    setNotice('')
    setUploadingImage(true)
    try {
      const publicUrl = await uploadShopProductImage(file, form.name || file.name)
      if (!publicUrl) {
        throw new Error('The image uploaded but no public image URL was returned.')
      }

      if (form.id) {
        await updateShopProductImage(form.id, publicUrl)
        setForm((current) => ({ ...current, image_url: publicUrl }))
        await load()
        setNotice('Product image updated.')
        return
      }

      setForm((current) => ({ ...current, image_url: publicUrl }))
      setNotice('Image attached. Save the product to publish it.')
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
    setNotice('')
    try {
      await saveShopProduct(form)
      setEditorOpen(false)
      await load()
      setNotice('Product saved.')
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
      setNotice('Product deleted.')
    } catch (err) {
      setError(err.message || 'Could not delete product.')
    }
  }

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Shop products</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>Manage public catalogue items, pricing, variants, and availability.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <FormInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" style={{ width: '100%' }} />
          <Button variant="primary" onClick={openCreate}>New product</Button>
        </div>
      </div>

      {error ? <div style={{ marginBottom: 16 }}><Alert variant="warning">{error}</Alert></div> : null}
      {notice ? <div style={{ marginBottom: 16 }}><Alert variant="info">{notice}</Alert></div> : null}

      <div style={{ ...DS_CARD, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
          Catalogue
        </div>
        <div style={{ display: 'grid' }}>
          {(loading ? [] : filtered).map((product) => (
            <div key={product.id} style={{ display: 'grid', gridTemplateColumns: '96px 1.8fr 1fr 1fr 0.8fr 0.9fr', gap: 12, padding: '16px 18px', borderTop: '1px solid var(--color-border)', alignItems: 'start' }}>
              <div style={{ width: 96, height: 96, borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(180deg, #f5f7fb, #eef2f7)', border: '1px solid var(--color-border)' }}>
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>{product.brand}</div>
                  )}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>{product.name}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-secondary)' }}>{product.brand} · {product.category?.name || 'Uncategorised'} · /shop/product/{product.slug}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-tertiary)' }}>{product.variants?.length || 0} variants</div>
              </div>
              <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>
                <div style={statusPill(product.status)}>{product.status}</div>
                {product.featured ? <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-primary)' }}>Featured</div> : null}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {(product.variants || []).slice(0, 2).map((variant) => (
                  <div key={variant.id || `${variant.sku}-${variant.model}`} style={{ marginBottom: 6 }}>
                    {buildVariantLabel(variant) || variant.sku || 'Variant'} · £{Number(variant.price || 0).toFixed(2)}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{product.updated_at ? new Date(product.updated_at).toLocaleDateString('en-GB') : '—'}</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px' }} onClick={() => openEdit(product)}>Edit</Button>
                <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px', color: 'var(--color-red-500)' }} onClick={() => handleDelete(product.id)}>Delete</Button>
              </div>
            </div>
          ))}
          {!loading && !filtered.length ? (
            <div style={{ padding: 28, color: 'var(--color-text-secondary)', fontSize: 14 }}>No products found.</div>
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
              <Button variant="secondary" onClick={() => setEditorOpen(false)}>Close</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save product'}</Button>
            </div>
          }
        >
          <form onSubmit={handleSave} style={{ display: 'grid', gap: 18 }}>
            <div style={grid2}>
              <label style={fieldStyle}>
                <span>Name</span>
                <FormInput value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} style={{ width: '100%' }} required />
              </label>
              <label style={fieldStyle}>
                <span>Slug</span>
                <FormInput value={form.slug} onChange={(e) => setForm((current) => ({ ...current, slug: e.target.value }))} style={{ width: '100%' }} placeholder="auto-generated if left blank" />
              </label>
              <label style={fieldStyle}>
                <span>Brand</span>
                <FormInput value={form.brand} onChange={(e) => setForm((current) => ({ ...current, brand: e.target.value }))} style={{ width: '100%' }} required />
              </label>
              <label style={fieldStyle}>
                <span>Category</span>
                <FormSelect value={form.category_id} onChange={(e) => setForm((current) => ({ ...current, category_id: e.target.value }))} style={{ width: '100%' }}>
                  <option value="">No category</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </FormSelect>
              </label>
              <label style={fieldStyle}>
                <span>Status</span>
                <FormSelect value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))} style={{ width: '100%' }}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </FormSelect>
              </label>
              <label style={{ ...fieldStyle, justifyContent: 'flex-end' }}>
                <span>Featured product</span>
                <input type="checkbox" checked={form.featured} onChange={(e) => setForm((current) => ({ ...current, featured: e.target.checked }))} />
              </label>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Product image</div>
              <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
                <div style={{ width: 180, height: 180, borderRadius: 22, overflow: 'hidden', background: 'linear-gradient(180deg, #f5f7fb, #eef2f7)', border: '1px solid var(--color-border)' }}>
                  {form.image_url ? (
                    <img src={form.image_url} alt={form.name || 'Product preview'} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                      No image
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  <label style={{ ...fieldStyle, gap: 10 }}>
                    <span>Attach image</span>
                    <FormInput
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e.target.files?.[0] || null)}
                      style={{ width: '100%' }}
                    />
                  </label>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
                    Upload a clean product image. The portal stores the image and links it to the public catalogue automatically.
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button
                      type="button"
                      variant="secondary"
                      style={{ height: 28, fontSize: 12, padding: '0 8px' }}
                      onClick={() => setForm((current) => ({ ...current, image_url: '' }))}
                    >
                      Remove image
                    </Button>
                    {uploadingImage ? <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Uploading image…</span> : null}
                  </div>
                </div>
              </div>
            </div>

            <label style={fieldStyle}>
              <span>Description</span>
              <textarea className="ds-form-input" value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} style={{ width: '100%', minHeight: 120, resize: 'vertical', padding: '8px 12px' }} />
            </label>

            <label style={fieldStyle}>
              <span>Procurement notes</span>
              <textarea className="ds-form-input" value={form.procurement_notes} onChange={(e) => setForm((current) => ({ ...current, procurement_notes: e.target.value }))} style={{ width: '100%', minHeight: 80, resize: 'vertical', padding: '8px 12px' }} />
            </label>

            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 400 }}>Variants</div>
                <Button
                  type="button"
                  variant="secondary"
                  style={{ height: 28, fontSize: 12, padding: '0 8px' }}
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
                </Button>
              </div>
              {form.variants.map((variant, index) => (
                <div key={`${variant.id || 'new'}-${index}`} style={{ ...DS_CARD, padding: 20, borderStyle: 'dashed' }}>
                  <div style={{ ...grid4, marginBottom: 12 }}>
                    <label style={fieldStyle}><span>Model</span><FormInput value={variant.model} onChange={(e) => updateVariant(index, 'model', e.target.value)} style={{ width: '100%' }} /></label>
                    <label style={fieldStyle}><span>Colour</span><FormInput value={variant.colour} onChange={(e) => updateVariant(index, 'colour', e.target.value)} style={{ width: '100%' }} /></label>
                    <label style={fieldStyle}><span>Storage</span><FormInput value={variant.storage} onChange={(e) => updateVariant(index, 'storage', e.target.value)} style={{ width: '100%' }} /></label>
                    <label style={fieldStyle}><span>Size</span><FormInput value={variant.size} onChange={(e) => updateVariant(index, 'size', e.target.value)} style={{ width: '100%' }} /></label>
                    <label style={fieldStyle}><span>SKU</span><FormInput value={variant.sku} onChange={(e) => updateVariant(index, 'sku', e.target.value)} style={{ width: '100%' }} /></label>
                    <label style={fieldStyle}><span>Price</span><FormInput value={variant.price} onChange={(e) => updateVariant(index, 'price', e.target.value)} style={{ width: '100%' }} /></label>
                    <label style={fieldStyle}><span>Compare at</span><FormInput value={variant.compare_at_price} onChange={(e) => updateVariant(index, 'compare_at_price', e.target.value)} style={{ width: '100%' }} /></label>
                    <label style={fieldStyle}><span>Lead days</span><FormInput value={variant.lead_time_days} onChange={(e) => updateVariant(index, 'lead_time_days', e.target.value)} style={{ width: '100%' }} /></label>
                  </div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={variant.is_available} onChange={(e) => updateVariant(index, 'is_available', e.target.checked)} />Available</label>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={variant.procurement_required} onChange={(e) => updateVariant(index, 'procurement_required', e.target.checked)} />Requires procurement</label>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      style={{ height: 28, fontSize: 12, padding: '0 8px', color: 'var(--color-red-500)' }}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          variants: current.variants.filter((_, variantIndex) => variantIndex !== index),
                        }))
                      }
                    >
                      Remove
                    </Button>
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

const fieldStyle = {
  display: 'grid',
  gap: 8,
  fontSize: 13,
  color: 'var(--color-text-secondary)',
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
