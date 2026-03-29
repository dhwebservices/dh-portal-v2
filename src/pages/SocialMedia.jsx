import { useState, useEffect } from 'react'
import { Twitter, Facebook, Image, Send, Clock, CheckCircle, AlertCircle, Wand2, RefreshCw } from 'lucide-react'
import { Card, Btn, Input } from '../components/UI'
import { supabase } from '../utils/supabase'
import { useMsal } from '@azure/msal-react'

const PLATFORMS = [
  { key: 'twitter',  label: 'Twitter / X',  icon: Twitter,  color: '#1DA1F2', limit: 280,  connected: false },
  { key: 'facebook', label: 'Facebook',      icon: Facebook, color: '#1877F2', limit: 63206, connected: false },
]

export default function SocialMedia() {
  const { accounts } = useMsal()
  const user = accounts[0]
  const [tab, setTab]           = useState('compose')
  const [content, setContent]   = useState('')
  const [selected, setSelected] = useState(['twitter', 'facebook'])
  const [posts, setPosts]       = useState([])
  const [loading, setLoading]   = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPrompt, setAiPrompt]  = useState('')
  const [posting, setPosting]    = useState(false)

  useEffect(() => { fetchPosts() }, [])

  const fetchPosts = async () => {
    setLoading(true)
    const { data } = await supabase.from('social_posts').select('*').order('created_at', { ascending: false }).limit(20)
    setPosts(data || [])
    setLoading(false)
  }

  const togglePlatform = (key) => {
    setSelected(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])
  }

  const aiWrite = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Write a social media post for DH Website Services (a UK web design company based in Pontypridd, Wales) about: "${aiPrompt}".
The post should be engaging, professional but friendly, under 280 characters for Twitter compatibility.
Include 2-3 relevant hashtags at the end.
Return ONLY the post text, nothing else.`
        }]
      })
    })
    const data = await res.json()
    setContent(data.content?.[0]?.text || '')
    setAiLoading(false)
  }

  const post = async () => {
    if (!content.trim() || selected.length === 0) return
    setPosting(true)

    // Save to Supabase as pending (real posting needs API keys)
    await supabase.from('social_posts').insert([{
      content,
      platforms: selected,
      status: 'pending',
      posted_by: user?.name || user?.username,
      created_at: new Date().toISOString(),
    }])

    await fetchPosts()
    setContent('')
    setPosting(false)
    alert('Post queued! Connect your Twitter/Facebook API keys in Settings to enable live posting.')
  }

  const charCount = content.length
  const twitterSelected = selected.includes('twitter')
  const overLimit = twitterSelected && charCount > 280

  return (
    <div className="fade-in">
      {/* Platform status banner */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {PLATFORMS.map(p => (
          <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px' }}>
            <p.icon size={15} color={p.color} />
            <span style={{ fontWeight: 600 }}>{p.label}</span>
            <span style={{ padding: '2px 8px', borderRadius: '100px', fontSize: '11px', fontWeight: 600, background: 'rgba(255,184,0,0.15)', color: 'var(--amber)' }}>
              API Keys Needed
            </span>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm"> window.location.href = '/settings'}>Connect Accounts →</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        {[{ k: 'compose', l: 'Compose' }, { k: 'history', l: `Post History (${posts.length})` }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '7px 16px', borderRadius: '8px', border: '1px solid',
            borderColor: tab === t.k ? 'var(--gold)' : 'var(--border)',
            background: tab === t.k ? 'var(--gold-bg)' : 'var(--card)',
            color: tab === t.k ? 'var(--gold)' : 'var(--sub)',
            fontSize: '13px', fontWeight: 500, cursor: 'pointer',
          }}>{t.l}</button>
        ))}
      </div>

      {tab === 'compose' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px' }}>
          {/* Composer */}
          <div className="card card-pad">
            {/* AI writer */}
            <div style={{ marginBottom: '16px', padding: '14px', background: 'var(--bg2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>✨ AI Write</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input className="inp" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && aiWrite()}
                  placeholder="e.g. new website launch tips for small businesses"
                  style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text)', fontSize: '13px' }} />
                <button className="btn btn-primary btn-sm" onClick={aiWrite}>
                  {aiLoading ? 'Writing…' : 'Write'}
                </button>
              </div>
            </div>

            {/* Content editor */}
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="What's on your mind? Share news, tips or updates…"
              rows={6}
              style={{
                width: '100%', background: 'var(--bg2)', border: `1px solid ${overLimit ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: '8px', padding: '14px', color: 'var(--text)',
                fontSize: '14px', resize: 'vertical', lineHeight: 1.6,
              }}
              onFocus={e => e.target.style.borderColor = overLimit ? 'var(--red)' : 'var(--gold)'}
              onBlur={e => e.target.style.borderColor = overLimit ? 'var(--red)' : 'var(--border)'}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <span style={{ fontSize: '12.5px', color: overLimit ? 'var(--red)' : charCount > 240 ? 'var(--amber)' : 'var(--sub)' }}>
                {charCount}/280 {overLimit ? '— too long for Twitter' : ''}
              </span>
              <button className="btn btn-primary" onClick={post} disabled={!content.trim() || selected.length === 0 || posting || overLimit}>
                {posting ? 'Posting…' : `Post to ${selected.length} platform${selected.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>

          {/* Platform selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="card card-pad">
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', marginBottom: '12px', color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Post To</div>
              {PLATFORMS.map(p => (
                <button key={p.key} onClick={() => togglePlatform(p.key)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px', borderRadius: '6px', border: '1px solid',
                  borderColor: selected.includes(p.key) ? p.color : 'var(--border)',
                  background: selected.includes(p.key) ? `${p.color}15` : 'transparent',
                  cursor: 'pointer', marginBottom: '8px', transition: 'all 0.15s',
                }}>
                  <p.icon size={18} color={p.color} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>{p.label}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--sub)' }}>{p.limit.toLocaleString()} char limit</div>
                  </div>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${selected.includes(p.key) ? p.color : 'var(--border)'}`, background: selected.includes(p.key) ? p.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selected.includes(p.key) && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                  </div>
                </button>
              ))}
            </div>

            {/* Preview */}
            {content && (
              <div className="card card-pad">
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', marginBottom: '10px', color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preview</div>
                <div style={{ padding: '12px', background: 'var(--bg2)', borderRadius: '6px', fontSize: '13.5px', lineHeight: 1.6, color: 'var(--text)', wordBreak: 'break-word' }}>
                  {content}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--sub)' }}>Loading…</div>
          ) : posts.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--sub)' }}>
              <Send size={32} style={{ margin: '0 auto 14px', display: 'block', opacity: 0.3 }} />
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>No posts yet</div>
              <div style={{ fontSize: '13px' }}>Posts you compose will appear here</div>
            </div>
          ) : posts.map((p, i) => (
            <div key={p.id} style={{ padding: '16px 20px', borderBottom: i < posts.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(p.platforms || []).map(k => {
                    const pl = PLATFORMS.find(x => x.key === k)
                    return pl ? <pl.icon key={k} size={14} color={pl.color} /> : null
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  {p.status === 'posted' ? <><CheckCircle size={13} color="var(--green)" /><span style={{ color: 'var(--green)' }}>Posted</span></> :
                   p.status === 'failed' ? <><AlertCircle size={13} color="var(--red)" /><span style={{ color: 'var(--red)' }}>Failed</span></> :
                   <><Clock size={13} color="var(--amber)" /><span style={{ color: 'var(--amber)' }}>Pending</span></>}
                </div>
              </div>
              <div style={{ fontSize: '13.5px', color: 'var(--text)', lineHeight: 1.6, marginBottom: '6px' }}>{p.content}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--faint)' }}>
                {p.posted_by} · {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
  )
}
