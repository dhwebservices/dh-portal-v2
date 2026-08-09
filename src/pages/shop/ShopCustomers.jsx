import { useEffect, useMemo, useState } from 'react'
import { fetchShopCustomers, fetchShopOrders } from '../../utils/shop'
import { FormInput, Alert } from '../../components/ds'

export default function ShopCustomers() {
  const [customers, setCustomers] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [nextCustomers, nextOrders] = await Promise.all([
        fetchShopCustomers(),
        fetchShopOrders(),
      ])
      setCustomers(nextCustomers)
      setOrders(nextOrders)
      if (!selectedCustomerId && nextCustomers[0]?.id) setSelectedCustomerId(nextCustomers[0].id)
    } catch (err) {
      setError(err.message || 'Could not load shop customers.')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const safe = query.toLowerCase().trim()
    if (!safe) return customers
    return customers.filter((customer) =>
      [customer.first_name, customer.last_name, customer.email, customer.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(safe))
    )
  }, [customers, query])

  const selectedCustomer = filtered.find((customer) => customer.id === selectedCustomerId) || filtered[0] || null
  const customerOrders = orders.filter((order) => order.customer_id === selectedCustomer?.id)

  const cardStyle = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)' }

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Shop customers</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Review customer accounts, contact details, and order history.</p>
        </div>
        <FormInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers…" style={{ width: 280 }} />
      </div>

      {error ? <div style={{ marginBottom: 16 }}><Alert variant="warning">{error}</Alert></div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(360px, 0.85fr)', gap: 16 }}>
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
            Customers
          </div>
          {(loading ? [] : filtered).map((customer) => (
            <button
              key={customer.id}
              onClick={() => setSelectedCustomerId(customer.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '16px 18px',
                border: 0,
                borderTop: '1px solid var(--color-border)',
                background: customer.id === selectedCustomer?.id ? 'var(--color-gray-50)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{customer.first_name} {customer.last_name}</div>
              <div style={{ marginTop: 4, fontSize: 13, color: 'var(--color-text-secondary)' }}>{customer.email}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                <span>{customer.order_count || 0} orders</span>
                <span>£{Number(customer.total_spend || 0).toFixed(2)} spend</span>
              </div>
            </button>
          ))}
          {!loading && !filtered.length ? <div style={{ padding: 24, color: 'var(--color-text-secondary)', fontSize: 14 }}>No customers found.</div> : null}
        </div>

        <div style={{ ...cardStyle, padding: 20 }}>
          {selectedCustomer ? (
            <div style={{ display: 'grid', gap: 18 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-text-primary)' }}>{selectedCustomer.first_name} {selectedCustomer.last_name}</div>
                <div style={{ marginTop: 6, fontSize: 14, color: 'var(--color-text-secondary)' }}>{selectedCustomer.email}</div>
                <div style={{ marginTop: 4, fontSize: 14, color: 'var(--color-text-secondary)' }}>{selectedCustomer.phone || 'No phone recorded'}</div>
              </div>

              <div style={{ ...cardStyle, background: 'var(--color-gray-50)', padding: 16 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 10 }}>
                  <div><div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Account</div><div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>{selectedCustomer.account_status}</div></div>
                  <div><div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Orders</div><div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>{selectedCustomer.order_count || 0}</div></div>
                  <div><div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Spend</div><div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>£{Number(selectedCustomer.total_spend || 0).toFixed(2)}</div></div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 10 }}>Recent orders</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {customerOrders.map((order) => (
                    <div key={order.id} style={{ ...cardStyle, background: 'var(--color-gray-50)', padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{order.order_number}</div>
                          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--color-text-secondary)' }}>{order.order_status} · {order.procurement_status}</div>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>£{Number(order.grand_total || 0).toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                  {!customerOrders.length ? <div style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No orders for this customer yet.</div> : null}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Select a customer to review them.</div>
          )}
        </div>
      </div>
    </div>
  )
}
