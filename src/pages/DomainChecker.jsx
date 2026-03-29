import { useState } from 'react'
import { useMobile } from '../hooks/useMobile'
import { Search, Globe, CheckCircle, XCircle, Clock, ExternalLink, RefreshCw, Shield, AlertCircle } from 'lucide-react'
import { Card, Btn, Input } from '../components/UI'

const EXTENSIONS = ['.co.uk', '.com', '.uk', '.net', '.org', '.io', '.dev', '.online', '.co', '.biz']

// RDAP endpoints by TLD
function getRdapUrl(domain) {
  const tld = domain.split('.').slice(1).join('.')
  const rdapMap = {
    'com':    'https://rdap.verisign.com/com/v1/domain/',
    'net':    'https://rdap.verisign.com/net/v1/domain/',
    'org':    'https://rdap.org/domain/',
    'io':     'https://rdap.org/domain/',
    'dev':    'https://rdap.org/domain/',
    'co':     'https://rdap.org/domain/',
    'biz':    'https://rdap.org/domain/',
    'online': 'https://rdap.org/domain/',
    'uk':     'https://rdap.nominet.uk/uk/v1/domain/',
    'co.uk':  'https://rdap.nominet.uk/uk/v1/domain/',
  }
  return rdapMap[tld] || 'https://rdap.org/domain/'
}

async function checkDomain(domain) {
  try {
    const url = getRdapUrl(domain) + domain
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (res.status === 404) return { domain, available: true }
    if (res.ok) {
      const data = await res.json()
      const expires = data.events?.find(e => e.eventAction === 'expiration')?.eventDate
      const registrant = data.entities?.[0]?.vcardArray?.[1]?.find(f => f[0] === 'org')?.[3] || null
      return { domain, available: false, expires: expires?.split('T')[0], registered_to: registrant }
    }
    return { domain, available: null }
  } catch {
    return { domain, available: null }
  }
}

export default function DomainChecker() {
  const isMobile = useMobile()
  const [query, setQuery]     = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [whois, setWhois]     = useState(null)
  const [whoisLoading, setWhoisLoading] = useState(false)
  const [error, setError]     = useState('')

  const check = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError('')
    setResults([])
    setWhois(null)

    const base = query.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '')
      .replace(/\.[a-z.]+$/, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

    // Check all extensions in parallel
    const checks = await Promise.all(EXTENSIONS.map(ext => checkDomain(base + ext)))
    setResults(checks)
    setLoading(false)
  }

  const lookupWhois = async (domain) => {
    setWhoisLoading(true)
    setWhois({ domain })
    try {
      const url = getRdapUrl(domain) + domain
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) { setWhois({ domain, error: 'Domain not found in RDAP' }); setWhoisLoading(false); return }
      const data = await res.json()

      const getEvent = (action) => data.events?.find(e => e.eventAction === action)?.eventDate?.split('T')[0]
      const nameservers = data.nameservers?.map(ns => ns.ldhName).filter(Boolean) || []
      const registrar = data.entities?.find(e => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find(f => f[0] === 'fn')?.[3]
      const registrant = data.entities?.find(e => e.roles?.includes('registrant'))?.vcardArray?.[1]?.find(f => f[0] === 'org')?.[3]

      setWhois({
        domain,
        registrar:  registrar || null,
        registered: getEvent('registration'),
        expires:    getEvent('expiration'),
        updated:    getEvent('last changed'),
        status:     data.status?.[0] || 'active',
        name_servers: nameservers,
        registrant: registrant || null,
      })
    } catch (e) {
      setWhois({ domain, error: e.message })
    }
    setWhoisLoading(false)
  }

  const available = results.filter(r => r.available === true)
  const taken     = results.filter(r => r.available === false)
  const unknown   = results.filter(r => r.available === null)

  return (
    <div className="fade-in">
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <div><label className="inp-label">Domain Name or Business Name</label><input className="inp" value={query}
              onChange={e => setQuery(e.target.value)} placeholder="e.g. acmewebdesign or acmewebdesign.co.uk"
              onKeyDown={e => e.key === 'Enter' && !loading && check()} />
          </div>
          <button className="btn btn-primary" onClick={check} disabled={loading || !query.trim()}>
            {loading ? 'Checking…' : 'Check Domains'}
          </button>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--sub)', marginTop: '10px', marginBottom: 0 }}>
          Checks {EXTENSIONS.length} extensions using live RDAP data. Click a taken domain for WHOIS details.
        </p>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: '8px', color: 'var(--red)', fontSize: '13px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
          <div className="card card-pad">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <CheckCircle size={16} color="var(--green)" />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px' }}>Available ({available.length})</span>
            </div>
            {[...available, ...unknown].length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--sub)' }}>None available.</p>
            ) : [...available, ...unknown].map(r => (
              <div key={r.domain} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {r.available === true
                    ? <CheckCircle size={13} color="var(--green)" />
                    : <Clock size={13} color="var(--faint)" />}
                  <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{r.domain}</span>
                  {r.available === null && <span style={{ fontSize: '11px', color: 'var(--faint)' }}>unknown</span>}
                </div>
                {r.available === true && (
                  <a href={`https://www.namecheap.com/domains/registration/results/?domain=${r.domain}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: '12px', color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                    Register <ExternalLink size={11} />
                  </a>
                )}
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <XCircle size={16} color="var(--red)" />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px' }}>Taken ({taken.length})</span>
            </div>
            {taken.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--sub)' }}>No taken domains found.</p>
            ) : taken.map(r => (
              <div key={r.domain} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <XCircle size={13} color="var(--red)" />
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{r.domain}</div>
                    {r.registered_to && <div style={{ fontSize: '11.5px', color: 'var(--sub)' }}>{r.registered_to}</div>}
                    {r.expires && <div style={{ fontSize: '11.5px', color: 'var(--faint)' }}>Expires {r.expires}</div>}
                  </div>
                </div>
                <button onClick={() => lookupWhois(r.domain)}
                  style={{ fontSize: '12px', color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  WHOIS <Search size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(whoisLoading || (whois?.domain)) && (
        <div className="card" style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Shield size={16} color="var(--gold)" />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px' }}>WHOIS — {whois?.domain}</span>
          </div>
          {whoisLoading ? (
            <div style={{ color: 'var(--sub)', fontSize: '13px' }}>Looking up WHOIS data…</div>
          ) : whois?.error ? (
            <div style={{ color: 'var(--red)', fontSize: '13px' }}>{whois.error}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
              {[
                { label: 'Registrar',  value: whois?.registrar  },
                { label: 'Status',     value: whois?.status     },
                { label: 'Registered', value: whois?.registered },
                { label: 'Expires',    value: whois?.expires    },
                { label: 'Updated',    value: whois?.updated    },
                { label: 'Registrant', value: whois?.registrant },
              ].filter(r => r.value).map(({ label, value }) => (
                <div key={label} style={{ padding: '10px 14px', background: 'var(--bg2)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--sub)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{value}</div>
                </div>
              ))}
              {whois?.name_servers?.length > 0 && (
                <div style={{ padding: '10px 14px', background: 'var(--bg2)', borderRadius: '8px', gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '11px', color: 'var(--sub)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Name Servers</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text)', fontFamily: 'monospace' }}>{whois.name_servers.join(' · ')}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
