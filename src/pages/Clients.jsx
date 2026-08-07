import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Button, StatusBadge, FormInput, FormSelect, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ds'
import SubNav from '../components/SubNav'

export default function Clients() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    setLoading(true)
    const { data } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  const filteredClients = clients.filter(client => {
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      const nameMatch = client.name?.toLowerCase().includes(searchLower)
      const emailMatch = client.email?.toLowerCase().includes(searchLower)
      if (!nameMatch && !emailMatch) return false
    }

    // Status filter
    if (filter !== 'all' && client.status !== filter) {
      return false
    }

    return true
  })

  if (loading) {
    return (
      <div className="ds-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
          Loading clients...
        </div>
      </div>
    )
  }

  return (
    <div className="ds-content">
      {/* Page Header */}
      <div className="ds-page-header">
        <div>
          <h1>Clients</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {filteredClients.length} {filteredClients.length === 1 ? 'client' : 'clients'}
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate('/clients/new')}>
          + Add Client
        </Button>
      </div>

      {/* Sub Navigation */}
      <SubNav items={[
        { label: 'Clients', active: true, onClick: () => {} },
        can('clientmgmt') && { label: 'Client Portal', onClick: () => navigate('/client-mgmt') },
        can('competitor') && { label: 'Competitor Lookup', onClick: () => navigate('/competitor') },
        can('domains') && { label: 'Domain Checker', onClick: () => navigate('/domains') },
        can('website_editor') && { label: 'Web Manager', onClick: () => navigate('/web-manager') },
        can('shop_orders_view') && { label: 'Shop Orders', onClick: () => navigate('/shop/orders') },
        can('shop_products_view') && { label: 'Shop Products', onClick: () => navigate('/shop/products') },
        can('shop_customers_view') && { label: 'Shop Customers', onClick: () => navigate('/shop/customers') },
      ]} />

      {/* Table with Filters */}
      <div style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg)',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
      }}>
        {/* Table Controls */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          background: '#FAFAFA'
        }}>
          <FormInput
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              maxWidth: '400px',
              fontSize: '14px',
              height: '36px'
            }}
          />
          <FormSelect
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ minWidth: '140px', height: '36px' }}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
          </FormSelect>
          <div style={{
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
            marginLeft: 'auto',
            whiteSpace: 'nowrap'
          }}>
            {filteredClients.length} {filteredClients.length === 1 ? 'client' : 'clients'}
          </div>
        </div>

        {/* Table */}
        <table className="ds-table">
          <TableHeader>
            <TableRow>
              <TableHead style={{ width: '30%' }}>Client</TableHead>
              <TableHead style={{ width: '20%' }}>Contact</TableHead>
              <TableHead style={{ width: '15%' }}>Plan</TableHead>
              <TableHead style={{ width: '15%' }}>Status</TableHead>
              <TableHead style={{ width: '20%' }}>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
                  No clients found
                </TableCell>
              </TableRow>
            ) : (
              filteredClients.map(client => {
                const initial = client.name?.[0]?.toUpperCase() || '?'
                const colors = ['#0066CC', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444']
                const color = colors[client.name?.charCodeAt(0) % colors.length]

                return (
                  <TableRow
                    key={client.id}
                    onClick={() => navigate(`/clients/${client.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: color,
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 600,
                          flexShrink: 0
                        }}>
                          {initial}
                        </div>
                        <div>
                          <div style={{
                            fontWeight: 500,
                            fontSize: '14px',
                            color: 'var(--color-text-primary)',
                            marginBottom: '2px'
                          }}>
                            {client.name || 'Unnamed Client'}
                          </div>
                          {client.email && (
                            <div style={{
                              fontSize: '12px',
                              color: 'var(--color-text-secondary)'
                            }}>
                              {client.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        {client.contact || '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--border-radius-sm)',
                        fontSize: '12px',
                        fontWeight: 500,
                        background: '#DBEAFE',
                        color: '#1E40AF'
                      }}>
                        {client.plan || 'Starter'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge variant={
                        client.status === 'active' ? 'active' :
                        client.status === 'pending' ? 'warning' :
                        'error'
                      }>
                        {client.status === 'active' ? 'Active' :
                         client.status === 'pending' ? 'Pending' :
                         'Inactive'}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                        {new Date(client.created_at).toLocaleDateString('en-GB')}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </table>
      </div>
    </div>
  )
}
