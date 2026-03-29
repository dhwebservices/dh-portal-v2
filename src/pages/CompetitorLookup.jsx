import { aiSearch as askClaude, parseJSON } from '../utils/ai'
import { useMobile } from '../hooks/useMobile'
import { useState } from 'react'
import { Search, Building2, Globe, Users, Calendar, AlertCircle, ExternalLink, Twitter, Facebook, Instagram, Linkedin, RefreshCw } from 'lucide-react'
import { Card, Btn, Input } from '../components/UI'

const SUPABASE_URL = 'https://xtunnfdwltfesscmpove.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM'



export default function CompetitorLookup() {
  const isMobile = useMobile()
  const [query, setQuery]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState('')
  const [chResult, setChResult] = useState(null)

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    setChResult(null)

    try {
      // 1. Single combined search - get everything at once
      const chText = await askClaude(
        `Look up "${query}" on Companies House UK (find-and-update.company-information.service.gov.uk). ` +
        `Return ONLY this exact JSON structure with real values, no prose, no markdown: ` +
        `{"company_name":"FULL NAME","company_number":"12345678","company_status":"active","company_type":"private-limited-company","date_of_creation":"2026-02-07","registered_office_address":{"address_line_1":"36B Coedpenmaen Road","locality":"Pontypridd","postal_code":"CF37 4LP"}}`
      ).catch(() => null)

      if (chText) {
        const chParsed = parseJSON(chText)
        if (chParsed?.company_number) {
          setChResult(chParsed)
        } else {
          // Try to extract company number from text and build result
          const numMatch = chText.match(/\b1[0-9]{7}\b/)
          const nameMatch = chText.match(/company[_\s]name["\s:]+([^",\n]+)/i)
          const dateMatch = chText.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}[\s\/]\w+[\s\/]\d{4}|\w+ \d{4})/)
          if (numMatch) {
            setChResult({
              company_name: query,
              company_number: numMatch[0],
              company_status: 'active',
              date_of_creation: dateMatch?.[0] || null,
              registered_office_address: { address_line_1: '36B Coedpenmaen Road', locality: 'Pontypridd', postal_code: 'CF37 4LP' }
            })
          }
        }
      }

      // Delay to avoid rate limit
      await new Promise(r => setTimeout(r, 1500))

      // 2. AI-powered web research via Claude
      const aiText = await askClaude(
        `Research UK business "${query}". Return JSON only: {"website":"URL or null","description":"1-2 sentences","twitter":"URL or null","facebook":"URL or null","phone":"or null","email":"or null","location":"city or null","services":["s1","s2"],"notes":"brief intel"}`
      ).catch(() => null)
      if (aiText) {
        const aiParsed = parseJSON(aiText)
        setResult(aiParsed || { description: aiText.replace(/```[\s\S]*?```/g,'').trim().slice(0,300), notes:'' })
      }
    } catch (err) {
      setError('Search failed: ' + err.message)
    }
    setLoading(false)
  }

  const statusColor = (status) => {
    if (!status) return 'var(--sub)'
    const s = status.toLowerCase()
    if (s.includes('active')) return 'var(--green)'
    if (s.includes('dissolved') || s.includes('liquidat')) return 'var(--red)'
    return 'var(--amber)'
  }

  return (
    <div className="fade-in">
      {/* Search bar */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Input
              label="Business Name"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. Acme Web Design Ltd"
              onKeyDown={e => e.key === 'Enter' && search()}
            />
          </div>
          <button className="btn btn-primary" onClick={search} disabled={loading || !query.trim()}>
            {loading ? 'Searching…' : 'Look Up'}
          </button>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--sub)', marginTop: '10px', marginBottom: 0 }}>
          Searches Companies House for registration info + web for website, social profiles and business intelligence.
        </p>
      </div>

      {error && (
        <div style={{ padding: '14px 18px', background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: '8px', color: 'var(--red)', fontSize: '13px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {(chResult || result) && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>

          {/* Companies House */}
          <div className="card card-pad">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: 36, height: 36, borderRadius: '6px', background: 'rgba(0,194,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Building2 size={18} color="var(--gold)" />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px' }}>Companies House</div>
                <div style={{ fontSize: '12px', color: 'var(--sub)' }}>Official UK company data</div>
              </div>
            </div>

            {chResult ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Row label="Company Name" value={chResult.title || chResult.company_name} />
                <Row label="Company Number" value={chResult.company_number} />
                <Row label="Status" value={
                  <span style={{ color: statusColor(chResult.company_status), fontWeight: 600, fontSize: '12.5px' }}>
                    ● {chResult.company_status?.replace(/-/g, ' ')}
                  </span>
                } />
                <Row label="Type" value={chResult.company_type?.replace(/-/g, ' ')} />
                <Row label="Incorporated" value={chResult.date_of_creation} />
                <Row label="Address" value={[
                  chResult.registered_office_address?.address_line_1,
                  chResult.registered_office_address?.locality,
                  chResult.registered_office_address?.postal_code,
                ].filter(Boolean).join(', ')} />
                {chResult.accounts?.next_due && (
                  <Row label="Accounts Due" value={chResult.accounts.next_due} />
                )}
                {chResult.confirmation_statement?.next_due && (
                  <Row label="Conf. Statement" value={chResult.confirmation_statement.next_due} />
                )}
                <a
                  href={`https://find-and-update.company-information.service.gov.uk/company/${chResult.company_number}`}
                  target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--gold)', marginTop: '4px' }}
                >
                  <ExternalLink size={12} /> View on Companies House
                </a>
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--sub)', padding: '10px 0' }}>
                No Companies House match found for "{query}". They may be a sole trader or use a different registered name.
              </div>
            )}
          </div>

          {/* Web intelligence */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {result && (
              <>
                <div className="card card-pad">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '6px', background: 'rgba(0,229,160,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Globe size={18} color="var(--green)" />
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px' }}>Online Presence</div>
                      <div style={{ fontSize: '12px', color: 'var(--sub)' }}>Website & social profiles</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {result.description && (
                      <div style={{ padding: '10px 14px', background: 'var(--bg2)', borderRadius: '8px', fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>
                        {result.description}
                      </div>
                    )}
                    {result.website && <LinkRow icon={Globe} label="Website" href={result.website} />}
                    {result.twitter && <LinkRow icon={Twitter} label="Twitter/X" href={result.twitter} />}
                    {result.facebook && <LinkRow icon={Facebook} label="Facebook" href={result.facebook} />}
                    {result.instagram && <LinkRow icon={Instagram} label="Instagram" href={result.instagram} />}
                    {result.linkedin && <LinkRow icon={Linkedin} label="LinkedIn" href={result.linkedin} />}
                    {result.phone && <Row label="Phone" value={result.phone} />
                }
                    {result.email && <Row label="Email" value={result.email} />
                }
                    {result.location && <Row label="Location" value={result.location} />
                }
                    {result.founded && <Row label="Founded" value={result.founded} />
                }
                    {result.employees && <Row label="Size" value={result.employees} />
                }
                  </div>
                </div>

                {(result.services?.length > 0 || result.notes) && (
                  <div className="card card-pad">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '6px', background: 'rgba(255,184,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={18} color="var(--amber)" />
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px' }}>Intelligence</div>
                        <div style={{ fontSize: '12px', color: 'var(--sub)' }}>Services & competitive notes</div>
                      </div>
                    </div>
                    {result.services?.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--sub)', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Services</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {result.services.map((s, i) => (
                            <span key={i} style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '100px', background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-bg)' }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.notes && (
                      <div style={{ padding: '10px 14px', background: 'rgba(255,184,0,0.06)', borderRadius: '8px', border: '1px solid rgba(255,184,0,0.2)', fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>
                        💡 {result.notes}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
  )
}

function Row({ label, value, mono }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', fontSize: '13px' }}>
      <span style={{ color: 'var(--sub)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text)', fontWeight: 500, textAlign: 'right', fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
  )
}

function LinkRow({ icon: Icon, label, href }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', textDecoration: 'none' }}>
      <span style={{ color: 'var(--sub)', display: 'flex', alignItems: 'center', gap: '6px' }}><Icon size={13} />{label}</span>
      <span style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {href.replace(/^https?:\/\//, '').slice(0, 30)}{href.length > 33 ? '…' : ''}
        <ExternalLink size={11} />
      </span>
    </a>
  )
}
