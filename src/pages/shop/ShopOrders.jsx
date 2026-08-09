import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../components/Modal'
import { fetchShopOrders, fetchShopProducts, createManualShopOrder, updateShopOrder, buildVariantLabel } from '../../utils/shop'
import { sendAwaitingDispatchEmail, sendDeliveredEmail } from '../../utils/shopNotifications'
import { Button, FormInput, FormSelect, Alert } from '../../components/ds'

const DS_CARD = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)' }

const EMPTY_MANUAL_ORDER = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  notes: '',
  items: [{ product_id: '', variant_id: '', quantity: 1 }],
}

export default function ShopOrders() {
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [manualOrderOpen, setManualOrderOpen] = useState(false)
  const [manualOrder, setManualOrder] = useState(EMPTY_MANUAL_ORDER)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [nextOrders, nextProducts] = await Promise.all([
        fetchShopOrders(),
        fetchShopProducts(),
      ])
      setOrders(nextOrders)
      setProducts(nextProducts)
      if (!selectedOrderId && nextOrders[0]?.id) setSelectedOrderId(nextOrders[0].id)
    } catch (err) {
      setError(err.message || 'Could not load shop orders.')
    } finally {
      setLoading(false)
    }
  }

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return orders
    return orders.filter((order) => order.order_status === statusFilter)
  }, [orders, statusFilter])

  const selectedOrder = filteredOrders.find((order) => order.id === selectedOrderId) || filteredOrders[0] || null

  function updateManualItem(index, key, value) {
    setManualOrder((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
  }

  async function handleStatusUpdate(orderId, payload) {
    setError('')
    try {
      const currentOrder = orders.find((entry) => entry.id === orderId)
      const updated = await updateShopOrder(orderId, payload)

      if (
        payload.order_status === 'ordered_from_supplier' &&
        !currentOrder?.awaiting_dispatch_emailed_at &&
        updated?.awaiting_dispatch_emailed_at == null
      ) {
        const sent = await sendAwaitingDispatchEmail(updated)
        if (sent?.ok !== false) {
          await updateShopOrder(orderId, { awaiting_dispatch_emailed_at: new Date().toISOString() })
        }
      }

      if (
        payload.order_status === 'delivered' &&
        !currentOrder?.delivered_emailed_at &&
        updated?.delivered_emailed_at == null
      ) {
        const sent = await sendDeliveredEmail(updated)
        if (sent?.ok !== false) {
          await updateShopOrder(orderId, { delivered_emailed_at: new Date().toISOString() })
        }
      }

      await load()
    } catch (err) {
      setError(err.message || 'Could not update order.')
    }
  }

  async function handleManualOrderSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const lineItems = manualOrder.items.map((item) => {
        const product = products.find((entry) => entry.id === item.product_id)
        const variant = product?.variants?.find((entry) => entry.id === item.variant_id)
        if (!product || !variant) throw new Error('Select a valid product variant for each order line')
        return {
          product_id: product.id,
          variant_id: variant.id,
          product_name: product.name,
          variant_label: buildVariantLabel(variant),
          sku: variant.sku,
          quantity: Number(item.quantity || 1),
          unit_price: Number(variant.price || 0),
        }
      })

      await createManualShopOrder({
        customer: manualOrder,
        items: lineItems,
        notes: manualOrder.notes,
      })

      setManualOrder(EMPTY_MANUAL_ORDER)
      setManualOrderOpen(false)
      await load()
    } catch (err) {
      setError(err.message || 'Could not create manual order.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Shop orders</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>Track paid orders, procurement steps, fulfilment, and manual sales.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <FormSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: '100%' }}>
            <option value="all">All statuses</option>
            <option value="awaiting_procurement">Awaiting procurement</option>
            <option value="procured">Procured</option>
            <option value="ordered_from_supplier">Ordered from supplier</option>
            <option value="dispatched">Dispatched</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </FormSelect>
          <Button variant="primary" onClick={() => setManualOrderOpen(true)}>Create customer order</Button>
        </div>
      </div>

      {error ? <div style={{ marginBottom: 16 }}><Alert variant="warning">{error}</Alert></div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(360px, 0.85fr)', gap: 16 }}>
        <div style={{ ...DS_CARD, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
            Orders
          </div>
          {(loading ? [] : filteredOrders).map((order) => (
            <button
              key={order.id}
              onClick={() => setSelectedOrderId(order.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '16px 18px',
                border: 0,
                borderTop: '1px solid var(--color-border)',
                background: order.id === selectedOrder?.id ? 'var(--color-gray-50)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{order.order_number}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: 'var(--color-text-secondary)' }}>{order.customer_name} · {order.email}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>£{Number(order.grand_total || 0).toFixed(2)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <span style={pillStyle('payment', order.payment_status)}>{order.payment_status}</span>
                <span style={pillStyle('order', order.order_status)}>{order.order_status}</span>
                <span style={pillStyle('procurement', order.procurement_status)}>{order.procurement_status}</span>
              </div>
            </button>
          ))}
          {!loading && !filteredOrders.length ? <div style={{ padding: 24, color: 'var(--color-text-secondary)', fontSize: 14 }}>No orders found.</div> : null}
        </div>

        <div style={{ ...DS_CARD, padding: 20 }}>
          {selectedOrder ? (
            <div style={{ display: 'grid', gap: 18 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Order detail</div>
                <div style={{ fontSize: 28, fontWeight: 400, color: 'var(--color-text-primary)', marginTop: 8 }}>{selectedOrder.order_number}</div>
                <div style={{ marginTop: 6, fontSize: 14, color: 'var(--color-text-secondary)' }}>{selectedOrder.customer_name} · {selectedOrder.email}</div>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {(selectedOrder.shop_order_items || []).map((item) => (
                  <div key={item.id} style={{ ...DS_CARD, padding: 20, background: 'var(--color-gray-50)' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.product_name}</div>
                    <div style={{ marginTop: 4, fontSize: 13, color: 'var(--color-text-secondary)' }}>{item.variant_label || 'Standard configuration'} · Qty {item.quantity}</div>
                    <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>£{Number(item.line_total || 0).toFixed(2)}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Actions</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px' }} onClick={() => handleStatusUpdate(selectedOrder.id, { order_status: 'confirmed' })}>Confirm</Button>
                  <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px' }} onClick={() => handleStatusUpdate(selectedOrder.id, { procurement_status: 'checking_supplier' })}>Check supplier</Button>
                  <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px' }} onClick={() => handleStatusUpdate(selectedOrder.id, { order_status: 'ordered_from_supplier', procurement_status: 'ordered' })}>Mark ordered</Button>
                  <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px' }} onClick={() => handleStatusUpdate(selectedOrder.id, { order_status: 'dispatched', fulfilment_status: 'fulfilled' })}>Mark dispatched</Button>
                  <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px' }} onClick={() => handleStatusUpdate(selectedOrder.id, { order_status: 'delivered', procurement_status: 'completed' })}>Mark delivered</Button>
                  <Button variant="secondary" style={{ height: 28, fontSize: 12, padding: '0 8px', color: 'var(--color-red-500)' }} onClick={() => handleStatusUpdate(selectedOrder.id, { order_status: 'cancelled', payment_status: 'refunded' })}>Cancel / refund</Button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Select an order to review it.</div>
          )}
        </div>
      </div>

      {manualOrderOpen ? (
        <Modal
          title="Create customer order"
          onClose={() => setManualOrderOpen(false)}
          width={960}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <Button variant="secondary" onClick={() => setManualOrderOpen(false)}>Close</Button>
              <Button variant="primary" onClick={handleManualOrderSubmit} disabled={saving}>{saving ? 'Creating…' : 'Create order'}</Button>
            </div>
          }
        >
          <form onSubmit={handleManualOrderSubmit} style={{ display: 'grid', gap: 16 }}>
            <div style={grid2}>
              <label style={fieldStyle}><span>First name</span><FormInput value={manualOrder.first_name} onChange={(e) => setManualOrder((current) => ({ ...current, first_name: e.target.value }))} style={{ width: '100%' }} /></label>
              <label style={fieldStyle}><span>Last name</span><FormInput value={manualOrder.last_name} onChange={(e) => setManualOrder((current) => ({ ...current, last_name: e.target.value }))} style={{ width: '100%' }} /></label>
              <label style={fieldStyle}><span>Email</span><FormInput value={manualOrder.email} onChange={(e) => setManualOrder((current) => ({ ...current, email: e.target.value }))} style={{ width: '100%' }} /></label>
              <label style={fieldStyle}><span>Phone</span><FormInput value={manualOrder.phone} onChange={(e) => setManualOrder((current) => ({ ...current, phone: e.target.value }))} style={{ width: '100%' }} /></label>
            </div>

            <label style={fieldStyle}>
              <span>Internal notes</span>
              <textarea className="ds-form-input" value={manualOrder.notes} onChange={(e) => setManualOrder((current) => ({ ...current, notes: e.target.value }))} style={{ width: '100%', minHeight: 90, resize: 'vertical', padding: '8px 12px' }} />
            </label>

            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 400 }}>Order items</div>
                <Button
                  type="button"
                  variant="secondary"
                  style={{ height: 28, fontSize: 12, padding: '0 8px' }}
                  onClick={() => setManualOrder((current) => ({ ...current, items: [...current.items, { product_id: '', variant_id: '', quantity: 1 }] }))}
                >
                  Add item
                </Button>
              </div>
              {manualOrder.items.map((item, index) => {
                const product = products.find((entry) => entry.id === item.product_id)
                return (
                  <div key={`${index}-${item.product_id}-${item.variant_id}`} style={{ ...DS_CARD, padding: 20, borderStyle: 'dashed' }}>
                    <div style={grid3}>
                      <label style={fieldStyle}>
                        <span>Product</span>
                        <FormSelect value={item.product_id} onChange={(e) => updateManualItem(index, 'product_id', e.target.value)} style={{ width: '100%' }}>
                          <option value="">Select product</option>
                          {products.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                        </FormSelect>
                      </label>
                      <label style={fieldStyle}>
                        <span>Variant</span>
                        <FormSelect value={item.variant_id} onChange={(e) => updateManualItem(index, 'variant_id', e.target.value)} style={{ width: '100%' }}>
                          <option value="">Select variant</option>
                          {(product?.variants || []).map((variant) => (
                            <option key={variant.id} value={variant.id}>{buildVariantLabel(variant) || variant.sku || 'Variant'} · £{Number(variant.price || 0).toFixed(2)}</option>
                          ))}
                        </FormSelect>
                      </label>
                      <label style={fieldStyle}>
                        <span>Quantity</span>
                        <FormInput type="number" min="1" value={item.quantity} onChange={(e) => updateManualItem(index, 'quantity', e.target.value)} style={{ width: '100%' }} />
                      </label>
                    </div>
                  </div>
                )
              })}
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

const grid3 = {
  display: 'grid',
  gridTemplateColumns: '1.2fr 1.5fr 0.6fr',
  gap: 12,
}

function pillStyle(type, value) {
  const palettes = {
    payment: {
      pending: { background: 'rgba(179, 114, 0, 0.12)', color: '#b37200' },
      paid: { background: 'rgba(17, 140, 79, 0.12)', color: '#118c4f' },
      refunded: { background: 'rgba(71, 85, 105, 0.12)', color: '#475569' },
    },
    order: {
      awaiting_procurement: { background: 'rgba(0, 102, 204, 0.12)', color: '#0066cc' },
      ordered_from_supplier: { background: 'rgba(179, 114, 0, 0.12)', color: '#b37200' },
      dispatched: { background: 'rgba(17, 140, 79, 0.12)', color: '#118c4f' },
      delivered: { background: 'rgba(17, 140, 79, 0.12)', color: '#118c4f' },
      cancelled: { background: 'rgba(180, 35, 24, 0.12)', color: '#b42318' },
      confirmed: { background: 'rgba(71, 85, 105, 0.12)', color: '#475569' },
    },
    procurement: {
      not_started: { background: 'rgba(71, 85, 105, 0.12)', color: '#475569' },
      checking_supplier: { background: 'rgba(0, 102, 204, 0.12)', color: '#0066cc' },
      ordered: { background: 'rgba(179, 114, 0, 0.12)', color: '#b37200' },
      completed: { background: 'rgba(17, 140, 79, 0.12)', color: '#118c4f' },
      unavailable: { background: 'rgba(180, 35, 24, 0.12)', color: '#b42318' },
    },
  }

  const palette = palettes[type]?.[value] || { background: 'rgba(71, 85, 105, 0.12)', color: '#475569' }
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'capitalize',
    ...palette,
  }
}
