import { useState } from 'react'
import { Button, FormInput, Alert } from '../components/ds'

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
    <div className="ds-content">
      <div className="ds-page-header">
        <div><h1>Competitor Lookup</h1><p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Research competitor websites</p></div>
      </div>
      <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20, maxWidth:600, marginBottom:20 }}>
        <div style={{ display:'flex', gap:10 }}>
          <FormInput value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://competitor.co.uk" onKeyDown={e=>e.key==='Enter'&&lookup()} style={{ flex:1 }}/>
          <Button variant="primary" onClick={lookup} disabled={loading}>{loading?'Looking up...':'Look Up'}</Button>
        </div>
        {error && <div style={{ marginTop:10 }}><Alert variant="warning">{error}</Alert></div>}
      </div>
      {result && (
        <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:600 }}>
          <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20 }}>
            <div style={{ fontSize:14, fontWeight:500, color:'var(--color-text-primary)', marginBottom:12 }}>Domain Info</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, borderBottom:'1px solid var(--color-border)', paddingBottom:8 }}>
                <span style={{ color:'var(--color-text-tertiary)' }}>Domain</span>
                <span style={{ fontFamily:'var(--font-mono)', color:'var(--color-text-primary)' }}>{result.domain}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, borderBottom:'1px solid var(--color-border)', paddingBottom:8 }}>
                <span style={{ color:'var(--color-text-tertiary)' }}>IP Addresses</span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{result.ips.join(', ') || '—'}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                <span style={{ color:'var(--color-text-tertiary)' }}>Mail Servers</span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:11, textAlign:'right', maxWidth:300 }}>{result.mx.join(', ') || '—'}</span>
              </div>
            </div>
          </div>
          <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20 }}>
            <div style={{ fontSize:14, fontWeight:500, color:'var(--color-text-primary)', marginBottom:12 }}>Preview Site</div>
            <Button variant="secondary" onClick={() => window.open(result.url, '_blank', 'noreferrer')}>Open {result.domain} ↗</Button>
          </div>
        </div>
      )}
    </div>
  )
}
