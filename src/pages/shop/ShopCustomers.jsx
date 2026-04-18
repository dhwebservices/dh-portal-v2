import { useEffect, useMemo, useState } from 'react'
import { fetchShopCustomers, fetchShopOrders } from '../../utils/shop'

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

  return (
    <div className="fade-in">
      <div className="card card-pad" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 400, color: 'var(--text)' }}>Shop customers</div>
          <div style={{ fontSize: 14, color: 'var(--sub)', marginTop: 6 }}>Review customer accounts, contact details, and order history.</div>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers…" style={inputStyle} />
      </div>

      {error ? <div className="card card-pad" style={{ marginBottom: 16, borderColor: 'rgba(180,35,24,0.24)', color: '#b42318' }}>{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(360px, 0.85fr)', gap: 16 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>
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
                borderTop: '1px solid var(--border)',
                background: customer.id === selectedCustomer?.id ? 'var(--bg2)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{customer.first_name} {customer.last_name}</div>
              <div style={{ marginTop: 4, fontSize: 13, color: 'var(--sub)' }}>{customer.email}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 12, color: 'var(--faint)' }}>
                <span>{customer.order_count || 0} orders</span>
                <span>£{Number(customer.total_spend || 0).toFixed(2)} spend</span>
              </div>
            </button>
          ))}
          {!loading && !filtered.length ? <div style={{ padding: 24, color: 'var(--sub)', fontSize: 14 }}>No customers found.</div> : null}
        </div>

        <div className="card card-pad">
          {selectedCustomer ? (
            <div style={{ display: 'grid', gap: 18 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--text)' }}>{selectedCustomer.first_name} {selectedCustomer.last_name}</div>
                <div style={{ marginTop: 6, fontSize: 14, color: 'var(--sub)' }}>{selectedCustomer.email}</div>
                <div style={{ marginTop: 4, fontSize: 14, color: 'var(--sub)' }}>{selectedCustomer.phone || 'No phone recorded'}</div>
              </div>

              <div className="card card-pad" style={{ background: 'var(--bg2)' }}>
                <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 10 }}>
                  <div><div style={{ fontSize: 12, color: 'var(--faint)' }}>Account</div><div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{selectedCustomer.account_status}</div></div>
                  <div><div style={{ fontSize: 12, color: 'var(--faint)' }}>Orders</div><div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{selectedCustomer.order_count || 0}</div></div>
                  <div><div style={{ fontSize: 12, color: 'var(--faint)' }}>Spend</div><div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>£{Number(selectedCustomer.total_spend || 0).toFixed(2)}</div></div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10 }}>Recent orders</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {customerOrders.map((order) => (
                    <div key={order.id} className="card card-pad" style={{ background: 'var(--bg2)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{order.order_number}</div>
                          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--sub)' }}>{order.order_status} · {order.procurement_status}</div>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>£{Number(order.grand_total || 0).toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                  {!customerOrders.length ? <div style={{ color: 'var(--sub)', fontSize: 14 }}>No orders for this customer yet.</div> : null}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--sub)', fontSize: 14 }}>Select a customer to review them.</div>
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: 280,
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '10px 12px',
  background: 'var(--card)',
  color: 'var(--text)',
  fontSize: 14,
}
