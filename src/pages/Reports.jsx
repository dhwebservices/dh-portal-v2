import { useMobile } from '../hooks/useMobile'
import { useState, useEffect, useRef } from 'react'
import { BarChart2, TrendingUp, Users, Download, Trophy } from 'lucide-react'

import { supabase } from '../utils/supabase'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function Reports() {
  const isMobile = useMobile()
  const [outreach, setOutreach]       = useState([])
  const [clients, setClients]         = useState([])
  const [staff, setStaff]             = useState([])
  const [commissions, setCommissions] = useState([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: o }, { data: c }, { data: s }, { data: cm }] = await Promise.all([
      supabase.from('outreach').select('*'),
      supabase.from('clients').select('*'),
      supabase.from('staff').select('*'),
      supabase.from('commissions').select('*'),
    ])
    setOutreach(o || [])
    setClients(c || [])
    setStaff(s || [])
    setCommissions(cm || [])
    setLoading(false)
  }

  // Conversion rate by staff
  const conversionData = (() => {
    const names = [...new Set(outreach.map(o => o.added_by).filter(Boolean))]
    return names.map(name => {
      const total     = outreach.filter(o => o.added_by === name).length
      const converted = outreach.filter(o => o.added_by === name && o.status === 'To Be Onboarded').length
      const interested = outreach.filter(o => o.added_by === name && o.status === 'Interested').length
      return {
        name: name.split(' ')[0],
        fullName: name,
        total,
        converted,
        interested,
        rate: total > 0 ? Math.round((converted / total) * 100) : 0,
      }
    }).sort((a, b) => b.rate - a.rate)
  })()

  // Commission leaderboard
  const leaderboard = staff.map(s => {
    const comms   = commissions.filter(c => c.staff_name === s.name)
    const paid    = comms.filter(c => c.status === 'paid').reduce((sum, c) => sum + Number(c.commission_amount || 0), 0)
    const pending = comms.filter(c => c.status === 'pending').reduce((sum, c) => sum + Number(c.commission_amount || 0), 0)
    return { ...s, paid, pending, total: paid + pending, sales: comms.length }
  }).sort((a, b) => b.total - a.total)

  // MRR over last 6 months
  const mrrChart = (() => {
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const label    = d.toLocaleString('en-GB', { month: 'short', year: '2-digit' })
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const active   = clients.filter(c => c.joined && c.joined <= `${monthStr}-31` && c.status === 'active')
      months.push({ month: label, mrr: active.reduce((s, c) => s + Number(c.value || 0), 0) })
    }
    return months
  })()

  // Status breakdown
  const statusBreakdown = [
    { status: 'Contacted',       count: outreach.filter(o => o.status === 'Contacted').length,       color: 'var(--amber)'   },
    { status: 'Interested',      count: outreach.filter(o => o.status === 'Interested').length,      color: 'var(--green)'   },
    { status: 'To Be Onboarded', count: outreach.filter(o => o.status === 'To Be Onboarded').length, color: 'var(--gold)'  },
    { status: 'Not Interested',  count: outreach.filter(o => o.status === 'Not Interested').length,  color: 'var(--faint)'   },
  ]

  const exportPDF = () => window.print()

  const exportCSV = (data, filename) => {
    if (!data.length) return
    const keys = Object.keys(data[0])
    const csv  = [keys.join(','), ...data.map(row => keys.map(k => `"${row[k] ?? ''}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--sub)' }}>Loading reports…</div>

  const noData = outreach.length === 0 && clients.length === 0

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px', gap: '10px', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={exportPDF}><Download size={12}/>Export PDF</button>
        <button className="btn btn-ghost btn-sm"><Download size={12}/> exportCSV(outreach,     'outreach.csv')}>Outreach CSV</button>
        <button className="btn btn-ghost btn-sm"><Download size={12}/> exportCSV(clients,      'clients.csv')}>Clients CSV</button>
        <button className="btn btn-ghost btn-sm"><Download size={12}/> exportCSV(commissions,  'commissions.csv')}>Commissions CSV</button>
      </div>

      {noData ? (
        <div className="card card-pad">
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <BarChart2 size={40} color="var(--faint)" style={{ margin: '0 auto 16px', display: 'block' }} />
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', marginBottom: '6px' }}>No data yet</div>
            <p style={{ fontSize: '13.5px', color: 'var(--sub)' }}>Reports will populate as you log contacts, onboard clients and track commissions.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
            {[
              { label: 'Total Contacts',     value: outreach.length,                                                                              color: 'var(--gold)'  },
              { label: 'Interested',         value: outreach.filter(o => o.status === 'Interested').length,                                       color: 'var(--green)'   },
              { label: 'To Be Onboarded',    value: outreach.filter(o => o.status === 'To Be Onboarded').length,                                  color: 'var(--blue)' },
              { label: 'Active Clients',     value: clients.filter(c => c.status === 'active').length,                                            color: 'var(--green)'   },
              { label: 'Total MRR',          value: `£${clients.filter(c => c.status === 'active').reduce((s, c) => s + Number(c.value || 0), 0)}`, color: 'var(--amber)'  },
              { label: 'Conv. Rate',         value: outreach.length > 0 ? `${Math.round((outreach.filter(o => o.status === 'To Be Onboarded').length / outreach.length) * 100)}%` : '0%', color: 'var(--gold)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card" style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontFamily: 'var(--font-display)', fontWeight: 800, color, marginBottom: '4px' }}>{value}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--sub)' }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            {/* MRR Chart */}
            <div className="card card-pad">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>MRR — Last 6 Months</h3>
              {mrrChart.every(d => d.mrr === 0) ? (
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', fontSize: '13px' }}>No revenue data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={mrrChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--sub)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--sub)' }} tickFormatter={v => `£${v}`} />
                    <Tooltip formatter={v => [`£${v}`, 'MRR']} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
                    <Line type="monotone" dataKey="mrr" stroke="var(--gold)" strokeWidth={2} dot={{ fill: 'var(--gold)', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Status breakdown */}
            <div className="card card-pad">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Outreach Status Breakdown</h3>
              {outreach.length === 0 ? (
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', fontSize: '13px' }}>No outreach data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={statusBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="status" tick={{ fontSize: 10, fill: 'var(--sub)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--sub)' }} />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {statusBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Conversion by staff */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Conversion Rate by Staff</h3>
            {conversionData.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--faint)', fontSize: '13px' }}>No outreach with staff names logged yet</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                    {['Staff Member', 'Total', 'Interested', 'To Be Onboarded', 'Conv. Rate'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conversionData.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '11px 14px', fontSize: '13.5px', fontWeight: 600 }}>{row.fullName}</td>
                      <td style={{ padding: '11px 14px', fontSize: '13px', color: 'var(--sub)' }}>{row.total}</td>
                      <td style={{ padding: '11px 14px', fontSize: '13px', color: 'var(--green)', fontWeight: 600 }}>{row.interested}</td>
                      <td style={{ padding: '11px 14px', fontSize: '13px', color: 'var(--gold)', fontWeight: 600 }}>{row.converted}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ flex: 1, height: '6px', background: 'var(--bg2)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${row.rate}%`, height: '100%', background: row.rate > 20 ? 'var(--green)' : row.rate > 10 ? 'var(--amber)' : 'var(--faint)', borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: row.rate > 20 ? 'var(--green)' : row.rate > 10 ? 'var(--amber)' : 'var(--sub)', minWidth: '35px' }}>{row.rate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Commission leaderboard */}
          <div className="card card-pad">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <Trophy size={18} color="var(--amber)" />
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px' }}>Commission Leaderboard</h3>
            </div>
            {leaderboard.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--faint)', fontSize: '13px' }}>No staff added yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {leaderboard.map((s, i) => (
                  <div key={s.id || i} style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '14px 16px', background: i === 0 ? 'rgba(255,184,0,0.06)' : 'var(--bg2)',
                    borderRadius: '8px', border: `1px solid ${i === 0 ? 'rgba(255,184,0,0.25)' : 'var(--border)'}`,
                  }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                      background: i === 0 ? 'var(--amber)' : i === 1 ? 'var(--sub)' : 'var(--faint)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: 800, color: '#fff',
                    }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--sub)' }}>{s.role} · {s.commission_rate}% · {s.sales} sales</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--green)' }}>£{s.paid.toFixed(2)}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--amber)' }}>£{s.pending.toFixed(2)} pending</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      <style>{`@media print { .no-print { display: none; } }`}</style>
    </div>
  )
}
