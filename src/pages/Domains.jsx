import { useState } from 'react'
import { Button, FormInput, StatusBadge } from '../components/ds'

const TLDS = ['.co.uk','.com','.org.uk','.net','.org','.io','.co','.uk']

export default function Domains() {
  const [input, setInput]       = useState('')
  const [results, setResults]   = useState([])
  const [loading, setLoading]   = useState(false)

  const check = async () => {
    if (!input.trim()) return
    setLoading(true)
    const base = input.trim().toLowerCase().replace(/https?:\/\//,'').split('.')[0]
    // Simulate DNS lookup via public API
    const checks = TLDS.map(async (tld) => {
      const domain = base + tld
      try {
        const r = await fetch(`https://dns.google/resolve?name=${domain}&type=A`)
        const d = await r.json()
        return { domain, available: !d.Answer || d.Answer.length === 0, tld }
      } catch {
        return { domain, available: null, tld }
      }
    })
    const res = await Promise.all(checks)
    setResults(res)
    setLoading(false)
  }

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div><h1>Domain Checker</h1><p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Check domain availability</p></div>
      </div>
      <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20, maxWidth:600, marginBottom:20 }}>
        <div style={{ display:'flex', gap:10 }}>
          <FormInput value={input} onChange={e=>setInput(e.target.value)} placeholder="Enter domain name (e.g. mybusiness)" onKeyDown={e=>e.key==='Enter'&&check()} style={{ flex:1 }}/>
          <Button variant="primary" onClick={check} disabled={loading}>{loading ? 'Checking...' : 'Check'}</Button>
        </div>
      </div>
      {results.length > 0 && (
        <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', overflow:'hidden', maxWidth:600 }}>
          <table className="ds-table">
            <thead><tr><th>Domain</th><th>Status</th></tr></thead>
            <tbody>
              {results.map(r => (
                <tr key={r.domain}>
                  <td style={{ fontFamily:'var(--font-mono)' }}>{r.domain}</td>
                  <td>
                    {r.available === null ? <StatusBadge variant="info">Unknown</StatusBadge>
                    : r.available ? <StatusBadge variant="active">✓ Available</StatusBadge>
                    : <StatusBadge variant="error">✗ Taken</StatusBadge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
