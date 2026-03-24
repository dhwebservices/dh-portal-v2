import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'

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

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Mailing List</h1>
          <p className="page-sub">{active} active subscribers · {unsub} unsubscribed</p>
        </div>
        <button className="btn btn-outline" onClick={() => {
          const csv = 'Email,Name,Source,Subscribed,Status\n' +
            subscribers.map(s => `${s.email},${s.name||''},${s.source||''},${s.subscribed_at},${s.unsubscribed?'Unsubscribed':'Active'}`).join('\n')
          const a = document.createElement('a')
          a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }))
          a.download = 'mailing-list-' + new Date().toISOString().split('T')[0] + '.csv'
          a.click()
        }}>⬇ Export CSV</button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24, maxWidth:480 }}>
        <div className="stat-card"><div className="stat-val" style={{ color:'var(--green)' }}>{active}</div><div className="stat-lbl">Active</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color:'var(--amber)' }}>{unsub}</div><div className="stat-lbl">Unsubscribed</div></div>
        <div className="stat-card"><div className="stat-val">{subscribers.length}</div><div className="stat-lbl">Total</div></div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <svg style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--faint)',pointerEvents:'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="inp" style={{ paddingLeft:32 }} placeholder="Search email or name..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {[['all','All'],['active','Active'],['unsubscribed','Unsubscribed']].map(([k,l]) => (
            <button key={k} onClick={() => setFilter(k)} className={'pill'+(filter===k?' on':'')}>{l}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
          <table className="tbl">
            <thead>
              <tr><th>Email</th><th>Name</th><th>Source</th><th>Subscribed</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td className="t-main" style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>{s.email}</td>
                  <td style={{ fontSize:13 }}>{s.name || '—'}</td>
                  <td style={{ fontSize:12, color:'var(--faint)' }}>{s.source || 'website_popup'}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--faint)' }}>
                    {s.subscribed_at ? new Date(s.subscribed_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'}
                  </td>
                  <td>
                    <span className={'badge badge-' + (s.unsubscribed ? 'red' : 'green')}>
                      {s.unsubscribed ? 'Unsubscribed' : 'Active'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      {s.unsubscribed
                        ? <button className="btn btn-ghost btn-sm" onClick={() => resubscribe(s.id)}>Resubscribe</button>
                        : <button className="btn btn-outline btn-sm" onClick={() => unsubscribe(s.id, s.email)}>Unsubscribe</button>
                      }
                      <button className="btn btn-danger btn-sm" onClick={() => deleteEntry(s.id, s.email)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>
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
