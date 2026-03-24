import { useState } from 'react'

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
    <div className="fade-in">
      <div className="page-hd"><div><h1 className="page-title">Domain Checker</h1><p className="page-sub">Check domain availability</p></div></div>
      <div className="card card-pad" style={{ maxWidth:600, marginBottom:20 }}>
        <div style={{ display:'flex', gap:10 }}>
          <input className="inp" value={input} onChange={e=>setInput(e.target.value)} placeholder="Enter domain name (e.g. mybusiness)" onKeyDown={e=>e.key==='Enter'&&check()} style={{ flex:1 }}/>
          <button className="btn btn-primary" onClick={check} disabled={loading}>{loading ? 'Checking...' : 'Check'}</button>
        </div>
      </div>
      {results.length > 0 && (
        <div className="card" style={{ overflow:'hidden', maxWidth:600 }}>
          <table className="tbl">
            <thead><tr><th>Domain</th><th>Status</th></tr></thead>
            <tbody>
              {results.map(r => (
                <tr key={r.domain}>
                  <td className="t-main" style={{ fontFamily:'var(--font-mono)' }}>{r.domain}</td>
                  <td>
                    {r.available === null ? <span className="badge badge-grey">Unknown</span>
                    : r.available ? <span className="badge badge-green">✓ Available</span>
                    : <span className="badge badge-red">✗ Taken</span>}
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
