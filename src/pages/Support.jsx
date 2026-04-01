import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'

export default function Support() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')
  const [selected, setSelected] = useState(null)
  const [reply, setReply]     = useState('')
  const [saving, setSaving]   = useState(false)

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('support_tickets').select('*').order('created_at', { ascending:false })
    setTickets(data || [])
    setLoading(false)
  }

  const deleteTicket = async (id) => {
    if (!confirm('Delete this ticket?')) return
    await supabase.from('support_tickets').delete().eq('id', id)
    setTickets(prev => prev.filter(t => t.id !== id))
  }

  const sendReply = async () => {
    setSaving(true)
    await supabase.from('support_tickets').update({ staff_reply: reply, status:'resolved', replied_by: user?.name, replied_at: new Date().toISOString() }).eq('id', selected.id)
    setSaving(false); setSelected(null); setReply(''); load()
  }

  const filtered = tickets.filter(t => {
    const q = search.toLowerCase()
    const matchQ = !q || t.subject?.toLowerCase().includes(q) || t.client_name?.toLowerCase().includes(q)
    const matchF = filter === 'all' || t.status === filter
    return matchQ && matchF
  })

  const priorityColor = { low:'grey', medium:'blue', high:'amber', urgent:'red' }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Support Tickets</h1>
          <p className="page-sub">{tickets.filter(t=>t.status==='open').length} open</p>
        </div>
      </div>

      <div className="legacy-toolbar" style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <div className="search-wrap" style={{ flex:1, minWidth:200 }}>
          <Search size={13} className="search-icon"/>
          <input className="inp" style={{ paddingLeft:34 }} placeholder="Search tickets..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className="legacy-toolbar-actions" style={{ display:'flex', gap:6 }}>
          {['all','open','resolved'].map(s => (
            <button key={s} onClick={()=>setFilter(s)} className={"pill"+(filter===s?' on':'')}>{s}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
          <>
            <div className="tbl-wrap hide-mob">
              <table className="tbl">
                <thead><tr><th>Subject</th><th>Client</th><th>Priority</th><th>Status</th><th>Date</th><th></th></tr></thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id}>
                      <td className="t-main">{t.subject}</td>
                      <td>{t.client_name}</td>
                      <td><span className={"badge badge-"+(priorityColor[t.priority]||'grey')}>{t.priority}</span></td>
                      <td><span className={"badge badge-"+(t.status==='open'?'amber':'green')}>{t.status}</span></td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
                      <td>
                        <div style={{ display:'flex', gap:4 }}>
                          <button className="btn btn-outline btn-sm" onClick={() => { setSelected(t); setReply(t.staff_reply||'') }}>
                            {t.status==='open' ? 'Reply' : 'View'}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteTicket(t.id)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length===0 && <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>No tickets found</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="mobile-only" style={{ display:'none' }}>
              {filtered.length ? (
                <div style={{ display:'grid', gap:10, padding:12 }}>
                  {filtered.map((t) => (
                    <div key={t.id} className="card" style={{ padding:14, display:'grid', gap:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>{t.subject}</div>
                          <div style={{ fontSize:12, color:'var(--sub)' }}>{t.client_name}</div>
                        </div>
                        <span className={"badge badge-"+(t.status==='open'?'amber':'green')}>{t.status}</span>
                      </div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        <span className={"badge badge-"+(priorityColor[t.priority]||'grey')}>{t.priority}</span>
                        <span className="badge badge-grey">{new Date(t.created_at).toLocaleDateString('en-GB')}</span>
                      </div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => { setSelected(t); setReply(t.staff_reply||'') }}>
                          {t.status==='open' ? 'Reply' : 'View'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteTicket(t.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>No tickets found</div>}
            </div>
          </>
        )}
      </div>

      {selected && (
        <Modal title={selected.subject} onClose={() => setSelected(null)} width={600}
          footer={selected.status==='open' ? <><button className="btn btn-outline" onClick={() => setSelected(null)}>Cancel</button><button className="btn btn-primary" onClick={sendReply} disabled={saving||!reply.trim()}>{saving?'Sending...':'Send Reply'}</button></> : <button className="btn btn-outline" onClick={() => setSelected(null)}>Close</button>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ padding:'12px 14px', background:'var(--bg2)', borderRadius:8 }}>
              <div className="lbl" style={{ marginBottom:6 }}>Message from {selected.client_name}</div>
              <p style={{ fontSize:13.5, lineHeight:1.7, color:'var(--sub)' }}>{selected.message}</p>
            </div>
            {selected.status==='open' ? (
              <div>
                <label className="lbl">Your Reply</label>
                <textarea className="inp" rows={5} value={reply} onChange={e=>setReply(e.target.value)} style={{ resize:'vertical' }} placeholder="Type your reply..."/>
              </div>
            ) : (
              <div style={{ padding:'12px 14px', background:'var(--green-bg)', borderRadius:8, borderLeft:'3px solid var(--green)' }}>
                <div className="lbl" style={{ marginBottom:6 }}>Staff Reply — {selected.replied_by}</div>
                <p style={{ fontSize:13.5, lineHeight:1.7, color:'var(--sub)' }}>{selected.staff_reply}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
