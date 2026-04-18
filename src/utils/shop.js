import { supabase } from './supabase'

const SHOP_IMAGE_BUCKET = 'shop-product-images'

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read the selected image file'))
    reader.readAsDataURL(file)
  })
}

export function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildVariantLabel(variant = {}) {
  return [variant.model, variant.colour, variant.storage, variant.size].filter(Boolean).join(' · ')
}

function sanitizeFileName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function toNumber(value, fallback = 0) {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function createOrderNumber() {
  const now = new Date()
  const y = String(now.getFullYear()).slice(-2)
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 9000) + 1000)
  return `DH-${y}${m}${d}-${rand}`
}

function normalizeProduct(product = {}) {
  return {
    ...product,
    variants: Array.isArray(product.shop_product_variants)
      ? [...product.shop_product_variants].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      : [],
    category: product.shop_categories || null,
  }
}

export async function fetchShopCategories() {
  const { data, error } = await supabase
    .from('shop_categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return data || []
}

export async function fetchShopProducts() {
  const { data, error } = await supabase
    .from('shop_products')
    .select('*, shop_categories(*), shop_product_variants(*)')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data || []).map(normalizeProduct)
}

export async function fetchShopCustomers() {
  const { data: customers, error } = await supabase
    .from('shop_customers')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw error

  const { data: orders } = await supabase
    .from('shop_orders')
    .select('id, customer_id, grand_total')

  const counts = {}
  const totals = {}
  ;(orders || []).forEach((order) => {
    const key = order.customer_id
    if (!key) return
    counts[key] = (counts[key] || 0) + 1
    totals[key] = (totals[key] || 0) + toNumber(order.grand_total)
  })

  return (customers || []).map((customer) => ({
    ...customer,
    order_count: counts[customer.id] || 0,
    total_spend: totals[customer.id] || 0,
  }))
}

export async function fetchShopOrders() {
  const { data, error } = await supabase
    .from('shop_orders')
    .select('*, shop_order_items(*), shop_customers(id, email, first_name, last_name, phone)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function uploadShopProductImage(file, productName = '') {
  if (!(file instanceof File)) throw new Error('Select an image to upload')

  const embeddedImage = await fileToDataUrl(file)
  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
  const slug = slugify(productName || file.name || 'product')
  const fileName = `${slug || 'product'}-${crypto.randomUUID()}.${sanitizeFileName(extension) || 'jpg'}`
  const filePath = `products/${fileName}`

  try {
    const { error: uploadError } = await supabase.storage
      .from(SHOP_IMAGE_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from(SHOP_IMAGE_BUCKET).getPublicUrl(filePath)
    return data?.publicUrl || embeddedImage
  } catch {
    return embeddedImage
  }
}

export async function updateShopProductImage(productId, imageUrl) {
  if (!productId) throw new Error('Product ID is required')

  const { data, error } = await supabase
    .from('shop_products')
    .update({
      image_url: String(imageUrl || '').trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function saveShopProduct(product = {}) {
  const {
    id,
    name,
    slug,
    brand,
    description,
    image_url,
    status = 'active',
    featured = false,
    category_id = null,
    seo_title = '',
    seo_description = '',
    procurement_notes = '',
    variants = [],
  } = product

  const payload = {
    name: String(name || '').trim(),
    slug: slugify(slug || name),
    brand: String(brand || '').trim(),
    description: String(description || '').trim() || null,
    image_url: String(image_url || '').trim() || null,
    status,
    featured: !!featured,
    category_id: category_id || null,
    seo_title: String(seo_title || '').trim() || null,
    seo_description: String(seo_description || '').trim() || null,
    procurement_notes: String(procurement_notes || '').trim() || null,
    updated_at: new Date().toISOString(),
  }

  if (!payload.name) throw new Error('Product name is required')
  if (!payload.brand) throw new Error('Brand is required')
  if (!payload.slug) throw new Error('Product slug is required')

  let productRow

  if (id) {
    const { data, error } = await supabase
      .from('shop_products')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    productRow = data

    const { error: deleteError } = await supabase
      .from('shop_product_variants')
      .delete()
      .eq('product_id', id)

    if (deleteError) throw deleteError
  } else {
    const { data, error } = await supabase
      .from('shop_products')
      .insert(payload)
      .select('*')
      .single()

    if (error) throw error
    productRow = data
  }

  const cleanVariants = (Array.isArray(variants) ? variants : [])
    .filter((variant) => String(variant.model || variant.colour || variant.storage || variant.size || variant.sku || '').trim())
    .map((variant, index) => ({
      product_id: productRow.id,
      sku: String(variant.sku || '').trim() || null,
      colour: String(variant.colour || '').trim() || null,
      storage: String(variant.storage || '').trim() || null,
      size: String(variant.size || '').trim() || null,
      model: String(variant.model || '').trim() || null,
      price: toNumber(variant.price),
      compare_at_price: variant.compare_at_price ? toNumber(variant.compare_at_price) : null,
      cost_price: variant.cost_price ? toNumber(variant.cost_price) : null,
      is_available: variant.is_available !== false,
      procurement_required: variant.procurement_required !== false,
      lead_time_days: Math.max(0, toNumber(variant.lead_time_days, 2)),
      sort_order: index,
    }))

  if (cleanVariants.length) {
    const { error } = await supabase
      .from('shop_product_variants')
      .insert(cleanVariants)

    if (error) throw error
  }

  return productRow
}

export async function deleteShopProduct(productId) {
  const { error } = await supabase
    .from('shop_products')
    .delete()
    .eq('id', productId)

  if (error) throw error
  return true
}

export async function updateShopOrder(orderId, payload = {}) {
  const nextPayload = {
    ...payload,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('shop_orders')
    .update(nextPayload)
    .eq('id', orderId)
    .select('*')
    .single()

  if (error) throw error
  return data
}

async function upsertCustomer(customer = {}) {
  const safeEmail = String(customer.email || '').toLowerCase().trim()
  if (!safeEmail) throw new Error('Customer email is required')

  const { data: existing, error: existingError } = await supabase
    .from('shop_customers')
    .select('*')
    .ilike('email', safeEmail)
    .maybeSingle()

  if (existingError) throw existingError

  const payload = {
    email: safeEmail,
    first_name: String(customer.first_name || customer.firstName || '').trim(),
    last_name: String(customer.last_name || customer.lastName || '').trim(),
    phone: String(customer.phone || '').trim() || null,
    notes: String(customer.notes || '').trim() || null,
    updated_at: new Date().toISOString(),
  }

  if (!payload.first_name || !payload.last_name) {
    throw new Error('Customer first and last name are required')
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from('shop_customers')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('shop_customers')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function createManualShopOrder({ customer, items, notes = '' }) {
  const customerRow = await upsertCustomer(customer)
  const orderItems = (Array.isArray(items) ? items : []).filter((item) => toNumber(item.quantity) > 0)

  if (!orderItems.length) throw new Error('Add at least one order item')

  const subtotal = orderItems.reduce((sum, item) => sum + toNumber(item.unit_price) * toNumber(item.quantity, 1), 0)
  const orderPayload = {
    order_number: createOrderNumber(),
    customer_id: customerRow.id,
    email: customerRow.email,
    phone: customerRow.phone,
    customer_name: `${customerRow.first_name} ${customerRow.last_name}`.trim(),
    billing_address: {},
    shipping_address: {},
    subtotal,
    grand_total: subtotal,
    payment_status: 'paid',
    order_status: 'awaiting_procurement',
    procurement_status: 'not_started',
    fulfilment_status: 'unfulfilled',
    payment_provider: 'manual_admin',
    customer_notes: null,
    internal_notes: String(notes || '').trim() || null,
  }

  const { data: order, error: orderError } = await supabase
    .from('shop_orders')
    .insert(orderPayload)
    .select('*')
    .single()

  if (orderError) throw orderError

  const lineItems = orderItems.map((item) => ({
    order_id: order.id,
    product_id: item.product_id || null,
    variant_id: item.variant_id || null,
    product_name: item.product_name,
    variant_label: item.variant_label || null,
    sku: item.sku || null,
    quantity: toNumber(item.quantity, 1),
    unit_price: toNumber(item.unit_price),
    line_total: toNumber(item.quantity, 1) * toNumber(item.unit_price),
  }))

  const { error: itemsError } = await supabase
    .from('shop_order_items')
    .insert(lineItems)

  if (itemsError) throw itemsError

  if (notes) {
    await supabase.from('shop_order_notes').insert({
      order_id: order.id,
      visibility: 'internal',
      author_name: 'Portal admin',
      note: notes,
    })
  }

  return order
}
