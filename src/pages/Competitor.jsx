import { useState } from 'react'

export default function Competitor() {
  const [url, setUrl]         = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState('')

  const lookup = async () => {
    if (!url.trim()) return
    setLoading(true); setError(''); setResult(null)
    try {
      const domain = url.replace(/https?:\/\//,'').split('/')[0]
      const [whoisRes, dnsRes] = await Promise.all([
        fetch(`https://dns.google/resolve?name=${domain}&type=A`),
        fetch(`https://dns.google/resolve?name=${domain}&type=MX`),
      ])
      const [whoisData, dnsData] = await Promise.all([whoisRes.json(), dnsRes.json()])
      setResult({
        domain,
        ips: (whoisData.Answer||[]).map(a=>a.data).filter(Boolean),
        mx: (dnsData.Answer||[]).map(a=>a.data).filter(Boolean),
        url: `https://${domain}`,
      })
    } catch { setError('Could not look up domain. Check the URL and try again.') }
    setLoading(false)
  }

  return (
    <div className="fade-in">
      <div className="page-hd"><div><h1 className="page-title">Competitor Lookup</h1><p className="page-sub">Research competitor websites</p></div></div>
      <div className="card card-pad" style={{ maxWidth:600, marginBottom:20 }}>
        <div style={{ display:'flex', gap:10 }}>
          <input className="inp" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://competitor.co.uk" onKeyDown={e=>e.key==='Enter'&&lookup()} style={{ flex:1 }}/>
          <button className="btn btn-primary" onClick={lookup} disabled={loading}>{loading?'Looking up...':'Look Up'}</button>
        </div>
        {error && <div style={{ marginTop:10, fontSize:13, color:'var(--red)' }}>{error}</div>}
      </div>
      {result && (
        <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:600 }}>
          <div className="card card-pad">
            <div className="lbl" style={{ marginBottom:12 }}>Domain Info</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, borderBottom:'1px solid var(--border)', paddingBottom:8 }}>
                <span style={{ color:'var(--faint)' }}>Domain</span>
                <span className="t-main" style={{ fontFamily:'var(--font-mono)' }}>{result.domain}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, borderBottom:'1px solid var(--border)', paddingBottom:8 }}>
                <span style={{ color:'var(--faint)' }}>IP Addresses</span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{result.ips.join(', ') || '—'}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                <span style={{ color:'var(--faint)' }}>Mail Servers</span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:11, textAlign:'right', maxWidth:300 }}>{result.mx.join(', ') || '—'}</span>
              </div>
            </div>
          </div>
          <div className="card card-pad">
            <div className="lbl" style={{ marginBottom:12 }}>Preview Site</div>
            <a href={result.url} target="_blank" rel="noreferrer" className="btn btn-outline">Open {result.domain} ↗</a>
          </div>
        </div>
      )}
    </div>
  )
}
