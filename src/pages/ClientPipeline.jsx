import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { buildClientLifecycleKey, CLIENT_LIFECYCLE_STAGES, createClientLifecycle, deriveClientLifecycleSignals } from '../utils/clientLifecycle'

export default function ClientPipeline() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: clients }, { data: lifecycleRows }, { data: outreachRows }, { data: invoiceRows }, { data: ticketRows }, { data: paymentRows }] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('portal_settings').select('key,value').like('key', 'client_lifecycle:%'),
      supabase.from('outreach').select('id,email,status,updated_at,created_at').order('updated_at', { ascending: false }),
      supabase.from('client_invoices').select('client_email,status,due_date'),
      supabase.from('support_tickets').select('client_email,status'),
      supabase.from('client_payments').select('client_email,status'),
    ])

    const storedLifecycle = Object.fromEntries((lifecycleRows || []).map((row) => [
      String(row.key || '').replace('client_lifecycle:', ''),
      createClientLifecycle(row?.value?.value ?? row?.value ?? {}),
    ]))

    const invoiceMap = (invoiceRows || []).reduce((acc, row) => {
      const key = String(row.client_email || '').toLowerCase()
      acc[key] = acc[key] || []
      acc[key].push(row)
      return acc
    }, {})
    const ticketMap = (ticketRows || []).reduce((acc, row) => {
      const key = String(row.client_email || '').toLowerCase()
      acc[key] = acc[key] || []
      acc[key].push(row)
      return acc
    }, {})
    const paymentMap = (paymentRows || []).reduce((acc, row) => {
      const key = String(row.client_email || '').toLowerCase()
      acc[key] = acc[key] || []
      acc[key].push(row)
      return acc
    }, {})

    const merged = (clients || []).map((client) => {
      const derived = deriveClientLifecycleSignals({
        client,
        outreachRows: outreachRows || [],
        invoices: invoiceMap[String(client.email || '').toLowerCase()] || [],
        tickets: ticketMap[String(client.email || '').toLowerCase()] || [],
        payments: paymentMap[String(client.email || '').toLowerCase()] || [],
      })
      const lifecycle = createClientLifecycle({
        client_id: client.id,
        ...derived,
        ...(storedLifecycle[String(client.id)] || {}),
      })
      return { ...client, lifecycle }
    })

    setRows(merged)
    setLoading(false)
  }

  const grouped = useMemo(() => {
    return CLIENT_LIFECYCLE_STAGES.map(([key, label]) => ({
      key,
      label,
      items: rows.filter((row) => row.lifecycle.stage === key),
    }))
  }, [rows])

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Client Pipeline</h1>
          <p className="page-sub">See which accounts are in proposal, onboarding, active delivery, or risk states at a glance.</p>
        </div>
      </div>

      {loading ? <div className="spin-wrap"><div className="spin" /></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
          {grouped.map((column) => (
            <div key={column.key} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{column.label}</div>
                <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4 }}>{column.items.length} client{column.items.length === 1 ? '' : 's'}</div>
              </div>
              <div style={{ display: 'grid' }}>
                {column.items.map((row, index) => (
                  <button
                    key={row.id}
                    onClick={() => navigate(`/clients/${row.id}`)}
                    style={{ border: 'none', borderTop: index === 0 ? 'none' : '1px solid var(--border)', background: 'var(--card)', padding: '14px 16px', textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 6 }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{row.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--sub)' }}>{row.plan} · {row.status}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--faint)', lineHeight: 1.5 }}>{row.lifecycle.summary}</div>
                  </button>
                ))}
                {!column.items.length ? <div style={{ padding: 18, fontSize: 12.5, color: 'var(--faint)' }}>No clients in this stage.</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
