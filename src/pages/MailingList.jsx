import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { logAction } from '../utils/audit'
import { Button, FormInput, StatusBadge } from '../components/ds'

export default function MailingList() {
  const { user } = useAuth()
  const [subscribers, setSubscribers] = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filter, setFilter]           = useState('all')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('mailing_list').select('*').order('subscribed_at', { ascending: false })
    setSubscribers(data || [])
    setLoading(false)
  }

  const unsubscribe = async (id, email) => {
    if (!confirm('Mark ' + email + ' as unsubscribed?')) return
    await supabase.from('mailing_list').update({ unsubscribed: true }).eq('id', id)
    load()
  }

  const resubscribe = async (id) => {
    await supabase.from('mailing_list').update({ unsubscribed: false }).eq('id', id)
    load()
  }

  const deleteEntry = async (id, email) => {
    if (!confirm('Permanently delete ' + email + ' from mailing list?')) return
    await supabase.from('mailing_list').delete().eq('id', id)
    load()
  }

  const filtered = subscribers.filter(s => {
    const q = search.toLowerCase()
    const matchQ = !q || s.email?.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q)
    const matchF = filter === 'all' ? true : filter === 'active' ? !s.unsubscribed : s.unsubscribed
    return matchQ && matchF
  })

  const active = subscribers.filter(s => !s.unsubscribed).length
  const unsub  = subscribers.filter(s => s.unsubscribed).length

  const exportCsv = async () => {
    const reason = window.prompt('Add a short reason for this mailing list export:')
    const safeReason = String(reason || '').trim()
    if (!safeReason) return
    const csv = 'Email,Name,Source,Subscribed,Status\n' +
      subscribers.map(s => `${s.email},${s.name||''},${s.source||''},${s.subscribed_at},${s.unsubscribed?'Unsubscribed':'Active'}`).join('\n')
    const generatedAt = new Date().toISOString()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }))
    a.download = 'mailing-list-' + generatedAt.split('T')[0] + '.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    await logAction(user?.email, user?.name, 'mailing_list_exported', 'mailing_list', null, {
      reason: safeReason,
      generated_at: generatedAt,
      row_count: subscribers.length,
    })
  }

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Mailing List</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>{active} active subscribers · {unsub} unsubscribed</p>
        </div>
        <Button variant="secondary" onClick={exportCsv}>⬇ Export CSV</Button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24, maxWidth:480 }}>
        <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20 }}>
          <div style={{ fontSize:24, fontWeight:600, color:'var(--color-green-500)' }}>{active}</div>
          <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Active</div>
        </div>
        <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20 }}>
          <div style={{ fontSize:24, fontWeight:600, color:'var(--color-amber-500)' }}>{unsub}</div>
          <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Unsubscribed</div>
        </div>
        <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20 }}>
          <div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{subscribers.length}</div>
          <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Total</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--color-text-tertiary)' }}/>
          <FormInput style={{ paddingLeft:32, width:'100%' }} placeholder="Search email or name..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {[['all','All'],['active','Active'],['unsubscribed','Unsubscribed']].map(([k,l]) => (
            <Button key={k} variant={filter===k ? 'primary' : 'secondary'} onClick={() => setFilter(k)}>{l}</Button>
          ))}
        </div>
      </div>

      <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
          <table className="ds-table">
            <thead>
              <tr><th>Email</th><th>Name</th><th>Source</th><th>Subscribed</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>{s.email}</td>
                  <td style={{ fontSize:13 }}>{s.name || '—'}</td>
                  <td style={{ fontSize:12, color:'var(--color-text-tertiary)' }}>{s.source || 'website_popup'}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--color-text-tertiary)' }}>
                    {s.subscribed_at ? new Date(s.subscribed_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'}
                  </td>
                  <td>
                    <StatusBadge variant={s.unsubscribed ? 'error' : 'active'}>
                      {s.unsubscribed ? 'Unsubscribed' : 'Active'}
                    </StatusBadge>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      {s.unsubscribed
                        ? <Button variant="ghost" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => resubscribe(s.id)}>Resubscribe</Button>
                        : <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => unsubscribe(s.id, s.email)}>Unsubscribe</Button>
                      }
                      <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px', color:'var(--color-red-500)' }} onClick={() => deleteEntry(s.id, s.email)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--color-text-tertiary)' }}>
                  {search ? 'No results for "' + search + '"' : 'No subscribers yet'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
